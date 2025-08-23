// Test R2 connection and upload
require('dotenv').config();
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_ENDPOINT
} = process.env;

console.log('R2 Configuration:');
console.log('Account ID:', R2_ACCOUNT_ID ? '✅ Set' : '❌ Missing');
console.log('Access Key:', R2_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing');
console.log('Secret Key:', R2_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing');
console.log('Bucket:', R2_BUCKET || '❌ Missing');
console.log('Endpoint:', R2_ENDPOINT || '❌ Missing');

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function testR2Connection() {
  try {
    console.log('\n🔍 Testing R2 connection...');
    
    // Test 1: List objects in bucket
    console.log('1. Testing bucket access...');
    const listCommand = new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      MaxKeys: 5
    });
    
    const listResult = await s3.send(listCommand);
    console.log('✅ Bucket accessible. Objects found:', listResult.Contents?.length || 0);
    
    if (listResult.Contents?.length > 0) {
      console.log('Recent objects:');
      listResult.Contents.slice(0, 3).forEach(obj => {
        console.log(`  - ${obj.Key} (${obj.Size} bytes, ${obj.LastModified})`);
      });
    }
    
    // Test 2: Upload a test file
    console.log('\n2. Testing file upload...');
    const testKey = `test/${new Date().toISOString()}/test-file.txt`;
    const testContent = `Test upload at ${new Date().toISOString()}`;
    
    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain'
    });
    
    await s3.send(putCommand);
    console.log('✅ Test file uploaded successfully:', testKey);
    
    return true;
  } catch (error) {
    console.error('❌ R2 connection failed:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

testR2Connection();
