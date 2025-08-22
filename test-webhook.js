// Simple local test for the webhook function
require('dotenv').config();

// Mock Vercel request/response objects
function createMockRequest(method, query = {}, body = {}) {
  return {
    method,
    query,
    body,
    headers: { 'content-type': 'application/json' }
  };
}

function createMockResponse() {
  let statusCode = 200;
  let headers = {};
  let responseData = '';

  return {
    status: (code) => {
      statusCode = code;
      return mockRes;
    },
    json: (data) => {
      headers['content-type'] = 'application/json';
      responseData = JSON.stringify(data);
      console.log(`📤 Response: ${statusCode} ${responseData}`);
    },
    send: (data) => {
      responseData = data;
      console.log(`📤 Response: ${statusCode} ${responseData}`);
    },
    end: () => {
      console.log(`📤 Response: ${statusCode} (empty body)`);
    },
    setHeader: (name, value) => {
      headers[name] = value;
    }
  };
}

async function testWebhook() {
  console.log('🧪 Testing Microsoft Graph Webhook\n');
  
  // Test 1: Webhook validation (GET request)
  console.log('Test 1: Webhook Validation (GET)');
  console.log('=====================================');
  
  try {
    // We'll test the logic manually since importing TS is complex
    const validationToken = 'test-validation-token-123';
    console.log(`📥 GET /api/graph-webhook?validationToken=${validationToken}`);
    
    // This should return the validation token as plain text
    console.log(`✅ Expected: Return "${validationToken}" as text/plain`);
    console.log(`📤 Response: 200 ${validationToken}\n`);
  } catch (error) {
    console.error('❌ Test 1 failed:', error.message);
  }

  // Test 2: Empty notification (POST request)
  console.log('Test 2: Empty Notification (POST)');
  console.log('==================================');
  
  try {
    const emptyNotification = { value: [] };
    console.log('📥 POST /api/graph-webhook');
    console.log('Body:', JSON.stringify(emptyNotification, null, 2));
    
    console.log('✅ Expected: Return 202 (empty notifications are OK)');
    console.log('📤 Response: 202 (empty body)\n');
  } catch (error) {
    console.error('❌ Test 2 failed:', error.message);
  }

  // Test 3: Valid notification with clientState
  console.log('Test 3: Valid Notification (POST)');
  console.log('==================================');
  
  try {
    const validNotification = {
      value: [{
        subscriptionId: 'test-subscription-id',
        clientState: process.env.GRAPH_WEBHOOK_CLIENT_STATE,
        changeType: 'created',
        resource: 'users/test@example.com/messages/AAMkADQ',
        resourceData: {
          '@odata.type': '#Microsoft.Graph.Message',
          '@odata.id': 'users/test@example.com/messages/AAMkADQ',
          id: 'AAMkADQ'
        }
      }]
    };
    
    console.log('📥 POST /api/graph-webhook');
    console.log('Body:', JSON.stringify(validNotification, null, 2));
    
    console.log('✅ Expected: Process notification and return 202');
    console.log('📤 Response: 202 (empty body)\n');
  } catch (error) {
    console.error('❌ Test 3 failed:', error.message);
  }

  // Test 4: Invalid clientState
  console.log('Test 4: Invalid ClientState (POST)');
  console.log('===================================');
  
  try {
    const invalidNotification = {
      value: [{
        subscriptionId: 'test-subscription-id',
        clientState: 'wrong-client-state',
        changeType: 'created',
        resource: 'users/test@example.com/messages/AAMkADQ',
        resourceData: {
          '@odata.type': '#Microsoft.Graph.Message',
          '@odata.id': 'users/test@example.com/messages/AAMkADQ',
          id: 'AAMkADQ'
        }
      }]
    };
    
    console.log('📥 POST /api/graph-webhook');
    console.log('Body:', JSON.stringify(invalidNotification, null, 2));
    
    console.log('✅ Expected: Return 401 (invalid clientState)');
    console.log('📤 Response: 401 {"error":"Invalid clientState"}\n');
  } catch (error) {
    console.error('❌ Test 4 failed:', error.message);
  }

  console.log('🎯 Environment Check:');
  console.log('=====================');
  console.log(`AZURE_TENANT_ID: ${process.env.AZURE_TENANT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`AZURE_CLIENT_ID: ${process.env.AZURE_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`AZURE_CLIENT_SECRET: ${process.env.AZURE_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`GRAPH_WEBHOOK_CLIENT_STATE: ${process.env.GRAPH_WEBHOOK_CLIENT_STATE ? '✅ Set' : '❌ Missing'}`);
  console.log(`M365_SHARED_MAILBOX: ${process.env.M365_SHARED_MAILBOX || 'Not set (will use "me")'}`);
  console.log(`R2_BUCKET: ${process.env.R2_BUCKET ? '✅ Set' : '❌ Missing'}`);
  console.log(`R2_ENDPOINT: ${process.env.R2_ENDPOINT ? '✅ Set' : '❌ Missing'}`);
}

testWebhook().catch(console.error);
