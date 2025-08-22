# Deploy Microsoft Graph Webhook to Vercel

## Step 1: Deploy to Vercel

### Option A: Web Interface (Recommended)
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Upload this folder or connect your GitHub repo
4. Deploy

### Option B: CLI
```bash
vercel login
vercel --prod
```

## Step 2: Add Environment Variables

In Vercel dashboard → Project Settings → Environment Variables, add:

```
AZURE_TENANT_ID=8c27a444-d4fc-4c5d-9e27-d6de2bb4224c
AZURE_CLIENT_ID=ef52fd4f-20ab-412d-aea1-15ac8a0de2c8
AZURE_CLIENT_SECRET=ef52fd4f-20ab-412d-aea1-15ac8a0de2c8
M365_SHARED_MAILBOX=images@mobius-x.com
GRAPH_WEBHOOK_CLIENT_STATE=b6a91eb69d8d7047ef148800c1fec08fb20d6e6b781b464aa3bf8a0b057a4e81
R2_ACCOUNT_ID=xr_qQD5lK0g3_Bea6z62jhgWpGUKtWfoX-E36Dly
R2_ACCESS_KEY_ID=e030e2b7a2d236777e288245442bd666
R2_SECRET_ACCESS_KEY=179a6de6329a5c2aa3eadd9ce14e39099edf7852d5f737b43edc1c419ee02c21
R2_BUCKET=mail-attachments
R2_ENDPOINT=https://75efa536ec075bb530160f24cd343cfe.eu.r2.cloudflarestorage.com
```

## Step 3: Create Graph Subscription

After deployment, you'll get a URL like `https://your-app.vercel.app`

Run:
```bash
node create-subscription.js https://your-app.vercel.app/api/graph-webhook
```

## Step 4: Test

Send an email with attachments to `images@mobius-x.com`

Attachments will appear in your R2 bucket at `mail-attachments`

## Troubleshooting

- Check Vercel function logs for errors
- Verify environment variables are set
- Ensure Azure app has Mail.Read permissions
- Graph subscriptions expire after 1 hour (renew as needed)
