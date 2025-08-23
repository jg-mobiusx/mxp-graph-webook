// Test if we can access the shared mailbox directly
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

async function testMailboxAccess() {
  const token = await getGraphToken();
  const sharedMailbox = process.env.M365_SHARED_MAILBOX;
  
  console.log('🔍 Testing access to shared mailbox:', sharedMailbox);
  
  // Test 1: Try to get mailbox info
  try {
    const userUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sharedMailbox)}`;
    console.log('Testing user endpoint:', userUrl);
    
    const userResponse = await fetch(userUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (userResponse.ok) {
      const user = await userResponse.json();
      console.log('✅ Can access user info:', user.displayName, user.mail);
    } else {
      const error = await userResponse.text();
      console.log('❌ Cannot access user info:', userResponse.status, error);
    }
  } catch (err) {
    console.log('❌ Error accessing user info:', err.message);
  }
  
  // Test 2: Try to get messages
  try {
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sharedMailbox)}/messages?$top=1`;
    console.log('Testing messages endpoint:', messagesUrl);
    
    const messagesResponse = await fetch(messagesUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (messagesResponse.ok) {
      const messages = await messagesResponse.json();
      console.log('✅ Can access messages. Count:', messages.value?.length || 0);
    } else {
      const error = await messagesResponse.text();
      console.log('❌ Cannot access messages:', messagesResponse.status, error);
    }
  } catch (err) {
    console.log('❌ Error accessing messages:', err.message);
  }
  
  // Test 3: Try to list existing subscriptions
  try {
    const subscriptionsUrl = 'https://graph.microsoft.com/v1.0/subscriptions';
    console.log('Testing subscriptions endpoint:', subscriptionsUrl);
    
    const subscriptionsResponse = await fetch(subscriptionsUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (subscriptionsResponse.ok) {
      const subscriptions = await subscriptionsResponse.json();
      console.log('✅ Can access subscriptions. Count:', subscriptions.value?.length || 0);
      if (subscriptions.value?.length > 0) {
        subscriptions.value.forEach(sub => {
          console.log('  - Subscription:', sub.resource, 'expires:', sub.expirationDateTime);
        });
      }
    } else {
      const error = await subscriptionsResponse.text();
      console.log('❌ Cannot access subscriptions:', subscriptionsResponse.status, error);
    }
  } catch (err) {
    console.log('❌ Error accessing subscriptions:', err.message);
  }
}

testMailboxAccess().catch(console.error);
