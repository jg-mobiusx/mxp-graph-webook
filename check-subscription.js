// Check current subscription status
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

async function checkSubscriptions() {
  const token = await getGraphToken();
  
  console.log('🔍 Checking current subscriptions...');
  
  const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get subscriptions: ${response.status} ${error}`);
  }
  
  const result = await response.json();
  console.log(`Found ${result.value.length} subscription(s):`);
  
  result.value.forEach((sub, index) => {
    console.log(`\n📋 Subscription ${index + 1}:`);
    console.log(`  ID: ${sub.id}`);
    console.log(`  Resource: ${sub.resource}`);
    console.log(`  Notification URL: ${sub.notificationUrl}`);
    console.log(`  Change Type: ${sub.changeType}`);
    console.log(`  Expires: ${sub.expirationDateTime}`);
    console.log(`  Client State: ${sub.clientState || 'None'}`);
    
    const now = new Date();
    const expires = new Date(sub.expirationDateTime);
    const minutesLeft = Math.round((expires - now) / (1000 * 60));
    
    if (minutesLeft > 0) {
      console.log(`  ⏰ Status: Active (expires in ${minutesLeft} minutes)`);
    } else {
      console.log(`  ❌ Status: EXPIRED (${Math.abs(minutesLeft)} minutes ago)`);
    }
  });
  
  return result.value;
}

async function checkRecentMessages() {
  const token = await getGraphToken();
  const sharedMailbox = process.env.M365_SHARED_MAILBOX;
  
  console.log(`\n📧 Checking recent messages in ${sharedMailbox}...`);
  
  const messagesUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sharedMailbox)}/messages?$top=5&$select=id,subject,receivedDateTime,hasAttachments,from&$orderby=receivedDateTime desc`;
  
  const response = await fetch(messagesUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get messages: ${response.status} ${error}`);
  }
  
  const result = await response.json();
  console.log(`Found ${result.value.length} recent message(s):`);
  
  result.value.forEach((msg, index) => {
    console.log(`\n📨 Message ${index + 1}:`);
    console.log(`  ID: ${msg.id}`);
    console.log(`  Subject: ${msg.subject}`);
    console.log(`  From: ${msg.from?.emailAddress?.address || 'Unknown'}`);
    console.log(`  Received: ${msg.receivedDateTime}`);
    console.log(`  Has Attachments: ${msg.hasAttachments ? '✅ Yes' : '❌ No'}`);
  });
}

async function main() {
  try {
    await checkSubscriptions();
    await checkRecentMessages();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
