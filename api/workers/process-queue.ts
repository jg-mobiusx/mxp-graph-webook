// api/workers/process-queue.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  M365_SHARED_MAILBOX,
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_SQS_QUEUE_URL
} = process.env;

// --- MSAL for Graph API ---
const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    clientSecret: AZURE_CLIENT_SECRET!,
  },
});

async function getGraphToken(): Promise<string> {
  const result = await msalApp.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
  if (!result?.accessToken) throw new Error('Failed to acquire Graph token');
  return result.accessToken;
}

// --- S3 Client for R2 ---
const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT!,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

// --- SQS Client ---
const sqs = new SQSClient({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    },
});

// --- Graph API Helpers ---
async function graphFetch(url: string, token: string, asBuffer = false) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Graph API error: ${res.status} ${res.statusText}`);
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
}

async function getMessage(messageId: string, token: string) {
  const user = encodeURIComponent(M365_SHARED_MAILBOX || 'me');
  const url = `https://graph.microsoft.com/v1.0/users/${user}/messages/${messageId}?$select=id,subject,receivedDateTime,hasAttachments`;
  return graphFetch(url, token);
}

async function getAttachments(messageId: string, token: string) {
  const user = encodeURIComponent(M365_SHARED_MAILBOX || 'me');
  const url = `https://graph.microsoft.com/v1.0/users/${user}/messages/${messageId}/attachments`;
  const res: any = await graphFetch(url, token);
  return res.value || [];
}

// --- Main Handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('Worker started');
  try {
    const { Messages: messages } = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: AWS_SQS_QUEUE_URL,
      MaxNumberOfMessages: 5,
      WaitTimeSeconds: 10, 
    }));

    if (!messages || messages.length === 0) {
      console.log('No messages in queue.');
      return res.status(200).send('No messages to process.');
    }

    const token = await getGraphToken();

    for (const msg of messages) {
      const notification = JSON.parse(msg.Body || '{}');
      const messageId = notification.resourceData?.id;

      if (!messageId) {
        console.warn('Skipping message with no resourceData.id');
        await sqs.send(new DeleteMessageCommand({ QueueUrl: AWS_SQS_QUEUE_URL, ReceiptHandle: msg.ReceiptHandle }));
        continue;
      }

      const [messageDetails, attachments] = await Promise.all([
        getMessage(messageId, token),
        getAttachments(messageId, token),
      ]);

      if (!messageDetails.hasAttachments || attachments.length === 0) {
        console.log(`Message ${messageId} has no attachments, skipping.`);
      } else {
        for (const att of attachments) {
          if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') continue;

          const data = att.contentBytes ? Buffer.from(att.contentBytes, 'base64') : await graphFetch(att.contentBytesUrl, token, true);
          const key = `${new Date(messageDetails.receivedDateTime).toISOString().slice(0, 10)}/${messageId}/${att.name}`;
          
          await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET!, Key: key, Body: data, ContentType: att.contentType }));
          console.log(`✅ Stored ${key}`);
        }
      }
      
      await sqs.send(new DeleteMessageCommand({ QueueUrl: AWS_SQS_QUEUE_URL, ReceiptHandle: msg.ReceiptHandle }));
    }

    res.status(200).json({ success: true, processed: messages.length });
  } catch (error: any) {
    console.error('Worker error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
