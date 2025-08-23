// api/management/renew-subscription.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { ConfidentialClientApplication } from '@azure/msal-node';

const {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  VERCEL_URL, // Provided by Vercel
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

// --- Graph API Helpers ---
async function graphRequest(url: string, token: string, method: 'GET' | 'PATCH' = 'GET', body: any = null) {
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Graph API error: ${res.status} ${res.statusText} - ${errorText}`);
  }
  return res.status === 204 ? null : res.json();
}

// --- Main Handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!VERCEL_URL) {
    return res.status(500).json({ error: 'VERCEL_URL environment variable not set.' });
  }

  try {
    const token = await getGraphToken();
    const subscriptions = await graphRequest('https://graph.microsoft.com/v1.0/subscriptions', token);

    const notificationUrl = `https://${VERCEL_URL}/api/ingest/graph-webhook`;
    const targetSubscription = subscriptions.value.find((sub: any) => sub.notificationUrl === notificationUrl);

    if (!targetSubscription) {
      console.warn(`No active subscription found for ${notificationUrl}. Please create one.`);
      return res.status(404).json({ error: 'Subscription not found.' });
    }

    // Renew the subscription by extending its expiration date
    const newExpiration = new Date();
    newExpiration.setDate(newExpiration.getDate() + 2); // Renew for another ~3 days

    await graphRequest(`https://graph.microsoft.com/v1.0/subscriptions/${targetSubscription.id}`, token, 'PATCH', {
      expirationDateTime: newExpiration.toISOString(),
    });

    console.log(`Successfully renewed subscription ${targetSubscription.id} to ${newExpiration.toISOString()}`);
    res.status(200).json({ success: true, renewedSubscriptionId: targetSubscription.id });

  } catch (error: any) {
    console.error('Failed to renew subscription:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
