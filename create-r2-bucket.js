// Create R2 bucket
require('dotenv').config();
const { S3Client, CreateBucketCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_ENDPOINT
} = process.env;

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function createBucket() {
  try {
    console.log('📋 Listing existing buckets...');
    const listCommand = new ListBucketsCommand({});
    const listResult = await s3.send(listCommand);
    
    console.log('Existing buckets:');
    listResult.Buckets?.forEach(bucket => {
      console.log(`  - ${bucket.Name} (created: ${bucket.CreationDate})`);
    });
    
    const bucketExists = listResult.Buckets?.some(bucket => bucket.Name === R2_BUCKET);
    
    if (bucketExists) {
      console.log(`✅ Bucket '${R2_BUCKET}' already exists`);
      return;
    }
    
    console.log(`\n🪣 Creating bucket '${R2_BUCKET}'...`);
    const createCommand = new CreateBucketCommand({
      Bucket: R2_BUCKET
    });
    
    await s3.send(createCommand);
    console.log(`✅ Bucket '${R2_BUCKET}' created successfully`);
    
  } catch (error) {
    console.error('❌ Failed to create bucket:', error.message);
    console.error('Error details:', error);
  }
}

createBucket();
