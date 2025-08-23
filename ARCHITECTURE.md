# MVP Architecture: Email Processing Pipeline

This document outlines the architecture for the Minimum Viable Product (MVP) of the email processing pipeline. The design prioritizes scalability, cost-effectiveness, and a clear path for future expansion while adhering to a cloud-agnostic philosophy where practical.

## Core Principles

- **Decoupled Services**: The system is designed as a two-stage, event-driven pipeline. An ingestion service is decoupled from a processing service by a message queue. This ensures that the system can handle high-volume bursts without data loss or timeouts.
- **Cost-Effective Stack**: The architecture leverages the generous free tiers of best-of-breed services to minimize operational costs during the MVP phase.
- **Scalability**: The use of a message queue (AWS SQS) and serverless functions (Vercel) provides a solid foundation that can scale automatically to handle increased load.
- **Monorepo Structure**: All services (ingestion, workers, shared libraries) will be maintained within this single repository for simplified dependency management and atomic deployments.

## Technology Stack

- **Compute**: Vercel Serverless Functions
- **Queueing**: AWS Simple Queue Service (SQS)
- **Storage**: Cloudflare R2
- **Database**: Supabase (PostgreSQL)
- **Email Ingestion**: Microsoft Graph API Webhooks

## Architectural Diagram

```mermaid
graph TD
    subgraph Vercel (Compute)
        A[Email via /api/ingest/graph-webhook] --> B(SQS Producer)
        C(Cron Job) -- polls every minute --> D(SQS Consumer)
        D --> E(⚙️ /api/workers/process-queue)
    end

    subgraph AWS (Queueing)
        B --> SQS[📦 SQS Queue]
        D -- receives message --> SQS
    end
    
    subgraph Cloudflare (Storage)
        E -- stores attachment --> R2[(🗄️ R2 Bucket)]
    end

    subgraph Supabase (Database)
        E -- updates job --> DB[(🐘 PostgreSQL)]
    end
```

## Workflow Breakdown

1.  **Ingestion (`/api/ingest/graph-webhook`)**
    - **Trigger**: Receives a notification from the Microsoft Graph API when a new email arrives.
    - **Responsibility**: Its sole job is to perform initial validation (e.g., `clientState` check) and immediately publish the raw notification payload as a message to the AWS SQS queue.
    - **Outcome**: Responds `202 Accepted` to the Graph API within milliseconds, ensuring high reliability.

2.  **Queuing (AWS SQS)**
    - A standard SQS queue acts as a durable, scalable buffer between the ingestion and processing stages.
    - It reliably holds the jobs until a worker is ready to process them.

3.  **Processing (`/api/workers/process-queue`)**
    - **Trigger**: This function is invoked by a Vercel Cron Job that runs on a schedule (e.g., every minute).
    - **Responsibility**: 
        - Polls the SQS queue for a batch of messages.
        - For each message, it performs the heavy lifting:
            1. Fetches the full email and any attachments from the Graph API.
            2. Stores attachments in the Cloudflare R2 bucket.
            3. Analyzes email content to identify job references.
            4. Connects to the Supabase database to update the corresponding job record or flag it for manual review.

## Assumptions

- The volume of emails can be unpredictable, with the potential for large bursts. The queue is designed to handle this.
- A small processing delay (up to the cron job interval, e.g., 1 minute) is acceptable for the MVP.
- Long-term cloud agnosticism is a goal, but the MVP will use specific services for their cost and feature benefits. The decoupled nature of the architecture makes future migrations feasible.
