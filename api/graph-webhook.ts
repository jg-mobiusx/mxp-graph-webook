// api/graph-webhook.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  GRAPH_WEBHOOK_CLIENT_STATE,
  M365_SHARED_MAILBOX,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_ENDPOINT
} = process.env;

// --- MSAL (client credentials) ---
const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    clientSecret: AZURE_CLIENT_SECRET!,
  },
});

async function getGraphToken(): Promise<string> {
  const result = await msalApp.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!result?.accessToken) throw new Error('Failed to acquire Graph token');
  return result.accessToken;
}

// --- S3 (Cloudflare R2) ---
const s3 = new S3Client({
  region: 'auto', // R2 ignores region; "auto" is fine (fact)
  endpoint: R2_ENDPOINT!,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

async function putToR2(key: string, body: Buffer, contentType?: string) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET!,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

// --- Graph helpers ---
async function graphGet(url: string, token: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Graph API error: ${res.status}`);
  return res.json();
}

async function graphGetBytes(url: string, token: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Graph API error: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Fetch message details (optionally constrained to a shared mailbox)
async function getMessage(messageId: string, token: string) {
  const base = `https://graph.microsoft.com/v1.0`;
  const user = encodeURIComponent(M365_SHARED_MAILBOX || 'me'); // facts: /users/{id}|/me
  const url = `${base}/users/${user}/messages/${messageId}?$select=id,subject,receivedDateTime,hasAttachments,from`;
  return graphGet(url, token);
}

async function getAttachments(messageId: string, token: string) {
  const base = `https://graph.microsoft.com/v1.0`;
  const user = encodeURIComponent(M365_SHARED_MAILBOX || 'me');
  const url = `${base}/users/${user}/messages/${messageId}/attachments`;
  const res = await graphGet(url, token);
  return res.value || [];
}

function b64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}

// --- Webhook handler ---
async function processNotification(n: any, token: string) {
  console.log('Processing notification:', JSON.stringify(n, null, 2));
  const messageId = n.resourceData?.id;
  if (typeof messageId !== 'string' || !messageId) {
    console.log('Invalid or missing message ID, skipping');
    return;
  }

  // Fetch message and attachments
  const [msg, attachments] = await Promise.all([
    getMessage(messageId, token),
    getAttachments(messageId, token),
  ]);

  if (!msg?.hasAttachments || !attachments?.length) {
    console.log(`Message ${messageId} has no attachments, skipping`);
    return;
  }

  console.log(`Processing ${attachments.length} attachment(s) for message ${messageId}`);
  const attachmentPromises = attachments.map(async (att: any) => {
    if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') {
      console.log('Skipping non-file attachment:', att.name);
      return;
    }

    let data: Buffer;
    if (att.contentBytes) {
      data = b64ToBuffer(att.contentBytes);
      console.log('Small attachment decoded:', att.name, 'size:', data.length);
    } else {
      const base = `https://graph.microsoft.com/v1.0`;
      const user = encodeURIComponent(M365_SHARED_MAILBOX || 'me');
      const url = `${base}/users/${user}/messages/${msg.id}/attachments/${att.id}/$value`;
      data = await graphGetBytes(url, token);
      console.log('Large attachment fetched:', att.name, 'size:', data.length);
    }

    const date = (msg.receivedDateTime || new Date().toISOString()).slice(0, 10);
    const key = `${date}/${msg.id}/${att.name}`;
    await putToR2(key, data, att.contentType);
    console.log(`✅ Stored ${key} (${att.size} bytes)`);
  });

  await Promise.all(attachmentPromises);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Log all requests for debugging
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Query params:', req.query);
  console.log('Headers:', req.headers);

  // 1) Webhook validation (GET or POST request with validationToken)
  const validationToken = req.query['validationToken'];
  if (validationToken) {
    console.log('Validation token received:', validationToken);
    // Must respond with text/plain within 10 seconds (fact)
    res.setHeader('Content-Type', 'text/plain');
    console.log('Responding with validation token:', validationToken);
    return res.status(200).send(validationToken as string);
  }

  if (req.method === 'GET') {
    console.log('GET request without validation token');
    return res.status(400).json({ error: 'Missing validationToken' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2) Notification payload
  // Graph sends: { value: [{ subscriptionId, clientState, resource, resourceData: { id, ... } }, ...] }
  const body = req.body as any;
  console.log('Request body received. Processing value array...');
  
  if (!body?.value?.length) {
    // Graph may ping with empty arrays; respond 202 to acknowledge (fact)
    console.log('Empty notification payload, responding 202');
    return res.status(202).end();
  }

  // Validate clientState on every item
  for (const n of body.value) {
    // Only validate if we have a clientState configured AND the notification has one
    if (GRAPH_WEBHOOK_CLIENT_STATE && n.clientState && n.clientState !== GRAPH_WEBHOOK_CLIENT_STATE) {
      // Reject if mismatch (fact: required to prevent spoofing)
      const expected = GRAPH_WEBHOOK_CLIENT_STATE!;
      const actual = n.clientState;
      if (expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
        console.log('ClientState mismatch. Expected:', GRAPH_WEBHOOK_CLIENT_STATE, 'Got:', n.clientState);
        return res.status(401).json({ error: 'Invalid clientState' });
      }
    }
    console.log('ClientState validation passed. Expected:', GRAPH_WEBHOOK_CLIENT_STATE, 'Got:', n.clientState);
  }

  // 3) Process notifications (best effort, quick return)
  // **[extrapolation]**: Process inline; for heavy work, enqueue to a queue.
  try {
    console.log('Getting Graph token...');
    const token = await getGraphToken();
    console.log('Graph token acquired successfully');
    
    const processingPromises = body.value.map((n: any) => processNotification(n, token));
    await Promise.all(processingPromises);
    
    console.log('Webhook processing completed successfully');
    return res.status(202).end();
  } catch (err: any) {
    console.error('❌ Webhook error:', err.message);
    // Return 202 so Graph doesn’t flood retries; log for investigation **[extrapolation]**
    return res.status(202).end();
  }
}