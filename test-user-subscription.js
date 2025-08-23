// Test subscription for a regular user mailbox (requires different permissions)
require('dotenv').config();
const { ConfidentialClientApplication } = require('@azure/msal-node');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

async function createUserSubscription(webhookUrl, userEmail) {
  const token = await getGraphToken();
  
  const subscription = {
    changeType: 'created',
    notificationUrl: webhookUrl,
    resource: `users/${userEmail}/messages`,
    expirationDateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    clientState: process.env.GRAPH_WEBHOOK_CLIENT_STATE
  };

  console.log('🔗 Creating Graph subscription for user...');
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
    console.log('Full error response:', error);
    throw new Error(`Failed to create subscription: ${response.status} ${error}`);
  }

  const result = await response.json();
  console.log('✅ Subscription created successfully!');
  console.log('Subscription ID:', result.id);
  console.log('Expires:', result.expirationDateTime);
  
  return result;
}

const WEBHOOK_URL = process.argv[2];
const USER_EMAIL = process.argv[3];

if (!WEBHOOK_URL || !USER_EMAIL) {
  console.log('❌ Usage: node test-user-subscription.js <webhook-url> <user-email>');
  console.log('');
  console.log('Example:');
  console.log('  node test-user-subscription.js https://your-app.vercel.app/api/graph-webhook user@domain.com');
  process.exit(1);
}

createUserSubscription(WEBHOOK_URL, USER_EMAIL)
  .then(() => {
    console.log('');
    console.log('🎯 Ready! Send an email to:', USER_EMAIL);
    console.log('📧 Attachments will be stored in R2 bucket:', process.env.R2_BUCKET);
  })
  .catch(console.error);
