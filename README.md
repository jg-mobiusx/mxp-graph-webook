# M365 Email Ingestion Pipeline

This project implements a scalable, serverless pipeline to ingest emails and attachments from a Microsoft 365 shared mailbox, process them asynchronously, and store attachments in a secure object store.

## Architecture

The architecture is designed to be event-driven and decoupled, leveraging Vercel for serverless compute, AWS SQS for message queuing, and Cloudflare R2 for object storage.

For a detailed explanation of the components and workflow, please see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Setup Instructions

### 1. Prerequisites

- Node.js (v20.x or later)
- An AWS account
- A Microsoft 365 account with admin privileges
- A Cloudflare account
- Vercel account and Vercel CLI

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone <repository-url>
cd mxp-graph-webhook
npm install
```

### 3. Environment Variables

Create a `.env` file by copying the example file:

```bash
cp .env.example .env
```

Now, populate the `.env` file with the required credentials. See the instructions below for guidance on obtaining these values.

#### How to Get Credentials

**Microsoft Graph API**

1.  **`AZURE_TENANT_ID`**: In the Azure Portal, go to **Microsoft Entra ID** > **Overview**. The Tenant ID is listed there.
2.  **`AZURE_CLIENT_ID`** & **`AZURE_CLIENT_SECRET`**:
    *   Go to **Microsoft Entra ID** > **App registrations** > **New registration**.
    *   Give it a name and click **Register**.
    *   The **Application (client) ID** is your `AZURE_CLIENT_ID`.
    *   Go to **Certificates & secrets** > **New client secret**. Copy the **Value** immediately; this is your `AZURE_CLIENT_SECRET`.
3.  **`M365_SHARED_MAILBOX`**: The email address of the shared mailbox you want to monitor (e.g., `inbox@yourdomain.com`).
4.  **`GRAPH_WEBHOOK_CLIENT_STATE`**: A secret string of your choice to secure your webhook. Generate a secure, random string.

**AWS SQS**

1.  **`AWS_REGION`**: The AWS region where you will create your SQS queue (e.g., `us-east-1`).
2.  **`AWS_SQS_QUEUE_URL`**: In the AWS Console, go to **Simple Queue Service (SQS)** > **Create queue**. Choose **Standard** as the queue type and leave the default **Access policy** settings. Once created, copy the queue's URL and ARN.
3.  **`AWS_ACCESS_KEY_ID`** & **`AWS_SECRET_ACCESS_KEY`**:
    *   In the AWS Console, go to **IAM** > **Users** > **Create user**.
    *   Give the user a name and on the **Set permissions** screen, select **Attach policies directly**, then click **Create policy**.
    *   In the policy editor, switch to the **JSON** view and paste the following policy. This grants the minimal required permissions for the SQS queue. **Remember to replace `<your-queue-arn>` with the actual ARN of your queue**.

        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "AllowSqsMessageProcessing",
                    "Effect": "Allow",
                    "Action": [
                        "sqs:ReceiveMessage",
                        "sqs:DeleteMessage",
                        "sqs:SendMessage"
                    ],
                    "Resource": "<your-queue-arn>"
                }
            ]
        }
        ```
    *   Complete the user creation process. Then, navigate to the user's **Security credentials** tab and click **Create access key**. Select **Application running outside AWS** as the use case and copy the generated keys.

**Cloudflare R2**

1.  **`R2_BUCKET`**: In the Cloudflare Dashboard, go to **R2** > **Create bucket**. The name you choose is the value for this variable.
2.  **`R2_ACCOUNT_ID`**: On the main R2 page, your Account ID is listed in the right-hand sidebar.
3.  **`R2_ENDPOINT`**: On the R2 bucket's page, the S3 API endpoint is listed under **Bucket Details**.
4.  **`R2_ACCESS_KEY_ID`** & **`R2_SECRET_ACCESS_KEY`**:
    *   On the main R2 page, click **Manage R2 API Tokens** > **Create API token**.
    *   Grant it **Object Read & Write** permissions and copy the generated keys.

## Local Development

To run the functions locally, use the Vercel CLI:

```bash
vercel dev
```

This will start a local server that emulates the Vercel environment and loads your `.env` variables.

## Deployment

Deploy the project to Vercel. The Vercel CLI will automatically detect the project and guide you through the process. Ensure you have configured all the environment variables in the Vercel project settings.

```bash
vercel
```
