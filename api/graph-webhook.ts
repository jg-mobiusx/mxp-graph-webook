// api/graph-webhook.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
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
async function graphGet(url: string, token: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Graph GET ${url} ${r.status}: ${t}`);
  }
  return r.json();
}

async function graphGetBytes(url: string, token: string): Promise<Buffer> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Graph GET (bytes) ${url} ${r.status}: ${t}`);
  }
  const arrayBuf = await r.arrayBuffer();
  return Buffer.from(arrayBuf);
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
  const url = `${base}/users/${user}/messages/${messageId}/attachments?$select=id,name,contentType,size,@odata.type,contentBytes`;
  const json = await graphGet(url, token);
  return (json as any).value || [];
}

function b64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}

// --- Webhook handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1) Validation handshake (GET): echo validationToken
  if (req.method === 'GET') {
    const token = req.query['validationToken'];
    if (token) {
      // Must respond with text/plain within 10 seconds (fact)
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(token as string);
    }
    return res.status(400).json({ error: 'Missing validationToken' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2) Notification payload
  // Graph sends: { value: [{ subscriptionId, clientState, resource, resourceData: { id, ... } }, ...] }
  const body = req.body as any;
  if (!body?.value?.length) {
    // Graph may ping with empty arrays; respond 202 to acknowledge (fact)
    return res.status(202).end();
  }

  // Validate clientState on every item
  for (const n of body.value) {
    if (GRAPH_WEBHOOK_CLIENT_STATE && n.clientState !== GRAPH_WEBHOOK_CLIENT_STATE) {
      // Reject if mismatch (fact: required to prevent spoofing)
      return res.status(401).json({ error: 'Invalid clientState' });
    }
  }

  // 3) Process notifications (best effort, quick return)
  // **[extrapolation]**: Process inline; for heavy work, enqueue to a queue.
  try {
    const token = await getGraphToken();

    for (const n of body.value) {
      const messageId = n.resourceData?.id;
      if (!messageId) continue;

      const msg = await getMessage(messageId, token) as any;
      if (!msg?.hasAttachments) continue;

      const attachments = await getAttachments(messageId, token);

      for (const att of attachments) {
        if (att['@odata.type'] === '#microsoft.graph.fileAttachment') {
          // Small fileAttachment includes base64 in contentBytes (fact)
          const buf = att.contentBytes ? b64ToBuffer(att.contentBytes) : null;

          // **[extrapolation]**: If null or large, fall back to /attachments/{id}/$value
          let data = buf;
          if (!data) {
            const base = `https://graph.microsoft.com/v1.0`;
            const user = encodeURIComponent(M365_SHARED_MAILBOX || 'me');
            const url = `${base}/users/${user}/messages/${msg.id}/attachments/${att.id}/$value`;
            data = await graphGetBytes(url, token);
          }

          // Key format: YYYY/MM/DD/<messageId>/<filename>  **[extrapolation]**
          const date = (msg.receivedDateTime || new Date().toISOString()).slice(0, 10);
          const key = `${date}/${msg.id}/${att.name}`;

          await putToR2(key, data!, att.contentType);
          // Optionally log or emit an event
          console.log(`Stored ${key} (${att.size} bytes)`);
        }

        // For itemAttachment (embedded emails), you may need to fetch the item’s MIME separately (fact)
      }
    }

    // Acknowledge to Graph
    return res.status(202).end();
  } catch (err: any) {
    console.error(err);
    // Return 202 so Graph doesn’t flood retries; log for investigation **[extrapolation]**
    return res.status(202).end();
  }
}