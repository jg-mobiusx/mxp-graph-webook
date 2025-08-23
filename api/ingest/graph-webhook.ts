// api/ingest/graph-webhook.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';
import sqsClient from '../../lib/sqsClient';
import { SendMessageCommand } from '@aws-sdk/client-sqs';

const { GRAPH_WEBHOOK_CLIENT_STATE, AWS_SQS_QUEUE_URL } = process.env;

// --- SQS helper ---
async function enqueueNotification(notification: any) {
  const command = new SendMessageCommand({
    QueueUrl: AWS_SQS_QUEUE_URL,
    MessageBody: JSON.stringify(notification),
  });

  try {
    const data = await sqsClient.send(command);
    console.log(`Successfully enqueued notification. Message ID: ${data.MessageId}`);
  } catch (error) {
    console.error('Failed to enqueue notification:', error);
    throw error; // Re-throw to be caught by the main handler
  }
}

// --- Webhook handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1) Handle validation requests from Microsoft Graph
  const { validationToken } = req.query;
  if (validationToken) {
    console.log('Validation token received, responding 200 OK.');
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(validationToken as string);
  }

  // 2) Process incoming notifications
  if (req.method !== 'POST') {
    console.log(`Method ${req.method} not allowed.`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as { value: any[] };
  if (!body?.value?.length) {
    // Graph may send empty payloads to check if the endpoint is alive
    console.log('Empty notification payload, responding 202 OK.');
    return res.status(202).end();
  }

  // 3) Validate clientState and enqueue valid notifications
  try {
    const enqueuePromises = body.value.map((notification) => {
      // Security: Validate clientState to prevent webhook spoofing
      if (GRAPH_WEBHOOK_CLIENT_STATE) {
        if (notification.clientState !== GRAPH_WEBHOOK_CLIENT_STATE) {
          // Use timing-safe comparison for security
          const expected = Buffer.from(GRAPH_WEBHOOK_CLIENT_STATE);
          const actual = Buffer.from(notification.clientState || '');
          if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
            console.warn('ClientState mismatch. Expected:', GRAPH_WEBHOOK_CLIENT_STATE, 'Got:', notification.clientState);
            // Do not process this notification, but don't fail the entire batch
            return Promise.resolve(); 
          }
        }
      }
      return enqueueNotification(notification);
    });

    await Promise.all(enqueuePromises);
    console.log('All valid notifications have been enqueued.');
    return res.status(202).end(); // Acknowledge receipt to Graph API

  } catch (err: any) {
    console.error('❌ Error during webhook processing:', err.message);
    // Return 202 so Graph doesn’t disable the subscription on transient errors
    return res.status(202).end();
  }
}