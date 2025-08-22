const http = require('http');
const url = require('url');
require('dotenv').config();

// Simple test responses for webhook validation
function mockWebhookHandler(req, res, query, body) {
  // GET request - webhook validation
  if (req.method === 'GET' && query.validationToken) {
    res.setHeader('Content-Type', 'text/plain');
    res.statusCode = 200;
    res.end(query.validationToken);
    return;
  }
  
  // POST request - notification handling
  if (req.method === 'POST') {
    console.log('📬 Received POST notification:', JSON.stringify(body, null, 2));
    res.statusCode = 202;
    res.end();
    return;
  }
  
  res.statusCode = 405;
  res.end('Method not allowed');
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/api/graph-webhook') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const parsedBody = body ? JSON.parse(body) : {};
        mockWebhookHandler(req, res, parsedUrl.query, parsedBody);
      } catch (error) {
        console.error('Error:', error);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Test server running on http://localhost:${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/api/graph-webhook`);
  console.log('\n🧪 Test commands:');
  console.log(`curl "http://localhost:${PORT}/api/graph-webhook?validationToken=test123"`);
  console.log(`curl -X POST http://localhost:${PORT}/api/graph-webhook -H "Content-Type: application/json" -d '{"value":[]}'`);
});
