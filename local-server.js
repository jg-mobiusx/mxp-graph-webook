const http = require('http');
const url = require('url');
const { spawn } = require('child_process');
require('dotenv').config();

// Import and transpile the TypeScript webhook on the fly
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

// Read and compile the TypeScript webhook
function loadWebhookHandler() {
  const webhookPath = path.join(__dirname, 'api', 'graph-webhook.ts');
  const tsCode = fs.readFileSync(webhookPath, 'utf8');
  
  // Compile TypeScript to JavaScript
  const result = ts.transpile(tsCode, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true
  });
  
  // Create a temporary module
  const tempPath = path.join(__dirname, 'temp-webhook.js');
  fs.writeFileSync(tempPath, result);
  
  // Clear require cache and load the module
  delete require.cache[require.resolve('./temp-webhook.js')];
  const handler = require('./temp-webhook.js').default;
  
  // Clean up temp file
  fs.unlinkSync(tempPath);
  
  return handler;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  console.log(`📥 ${req.method} ${req.url}`);
  
  if (parsedUrl.pathname === '/api/graph-webhook') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        // Parse JSON body if present
        const parsedBody = body ? JSON.parse(body) : {};
        
        // Create Vercel-compatible request/response objects
        const vercelReq = {
          method: req.method,
          url: req.url,
          query: parsedUrl.query,
          body: parsedBody,
          headers: req.headers
        };
        
        const vercelRes = {
          status: (code) => {
            res.statusCode = code;
            return vercelRes;
          },
          json: (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            console.log(`📤 ${res.statusCode} ${JSON.stringify(data)}`);
          },
          send: (data) => {
            res.end(data);
            console.log(`📤 ${res.statusCode} ${data}`);
          },
          end: () => {
            res.end();
            console.log(`📤 ${res.statusCode} (empty)`);
          },
          setHeader: (name, value) => {
            res.setHeader(name, value);
          }
        };
        
        // Load and execute the webhook handler
        const handler = loadWebhookHandler();
        await handler(vercelReq, vercelRes);
        
      } catch (error) {
        console.error('❌ Error:', error.message);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Internal Server Error', details: error.message }));
      }
    });
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 Local Microsoft Graph Webhook Server');
  console.log('======================================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/api/graph-webhook`);
  console.log('');
  console.log('🧪 Test Commands:');
  console.log(`curl "http://localhost:${PORT}/api/graph-webhook?validationToken=test123"`);
  console.log(`curl -X POST http://localhost:${PORT}/api/graph-webhook -H "Content-Type: application/json" -d '{"value":[]}'`);
  console.log('');
  console.log('📧 Environment:');
  console.log(`   Mailbox: ${process.env.M365_SHARED_MAILBOX}`);
  console.log(`   R2 Bucket: ${process.env.R2_BUCKET}`);
  console.log('');
  console.log('🎯 Ready to receive Microsoft Graph webhooks!');
});
