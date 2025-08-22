// Create Microsoft Graph webhook subscription
require('dotenv').config();
const { ConfidentialClientApplication } = require('@azure/msal-node');
const fetch = require('node-fetch');

const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
});

async function getGraphToken() {
  const result = await msalApp.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!result?.accessToken) throw new Error('Failed to acquire Graph token');
  return result.accessToken;
}

async function createSubscription(webhookUrl) {
  const token = await getGraphToken();
  
  const subscription = {
    changeType: 'created',
    notificationUrl: webhookUrl,
    resource: `users/${process.env.M365_SHARED_MAILBOX}/messages`,
    expirationDateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    clientState: process.env.GRAPH_WEBHOOK_CLIENT_STATE
  };

  console.log('🔗 Creating Graph subscription...');
  console.log('Webhook URL:', webhookUrl);
  console.log('Resource:', subscription.resource);
  
  const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(subscription)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create subscription: ${response.status} ${error}`);
  }

  const result = await response.json();
  console.log('✅ Subscription created successfully!');
  console.log('Subscription ID:', result.id);
  console.log('Expires:', result.expirationDateTime);
  
  return result;
}

// For local testing, you need a public URL (ngrok)
const WEBHOOK_URL = process.argv[2];

if (!WEBHOOK_URL) {
  console.log('❌ Usage: node create-subscription.js <webhook-url>');
  console.log('');
  console.log('Examples:');
  console.log('  node create-subscription.js https://abc123.ngrok.io/api/graph-webhook');
  console.log('  node create-subscription.js https://your-app.vercel.app/api/graph-webhook');
  process.exit(1);
}

createSubscription(WEBHOOK_URL)
  .then(() => {
    console.log('');
    console.log('🎯 Ready! Send an email to:', process.env.M365_SHARED_MAILBOX);
    console.log('📧 Attachments will be stored in R2 bucket:', process.env.R2_BUCKET);
  })
  .catch(console.error);
