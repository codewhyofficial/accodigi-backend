# TrueLog API Testing Guide

This guide explains how to test the TrueLog backend API using Postman.

## 1. Import Collection
1.  Open Postman.
2.  Click **Import** in the top left.
3.  Drag and drop the `postman_collection.json` file located in your backend root folder.

## 2. Environment Setup
The collection uses a variable `baseUrl` which defaults to `http://localhost:3000`.
Tests assume your server is running locally on port 3000.

## 3. Testing Flow

### A. Authentication
1.  **Register CA**: Run the `Auth (CA) > Register CA` request.
    *   Change the email if testing multiple times.
2.  **Login CA**: Run the `Auth (CA) > Login CA` request.
    *   **Auto-Magic**: The test script automatically captures the `token` from the response and saves it to the Collection Variable `accessToken`.
    *   You don't need to copy-paste tokens manually for subsequent requests!

### B. Client Management
1.  **Create Client**: Run `Clients > Create Client`.
    *   It uses the `accessToken` automatically.
    *   Note the `id` of the client created in the response.
2.  **Get All Clients**: Run `Clients > Get All Clients` to list them.

### C. WhatsApp Webhook (Simulation)
You can simulate incoming WhatsApp messages without actually sending a WhatsApp message.
1.  **Verify Webhook**: Run `WhatsApp > Verify Webhook (GET)`. It should return `1234`.
2.  **Simulate Message**: Run `WhatsApp > Simulate Message (POST)`.
    *   This sends a fake payload to your server as if it came from Meta.
    *   You can change `"body": "Hello"` to `"body": "YES"` to test activation logic.

### D. Invoices (Requires Data)
To test invoices, you normally need to send an image via WhatsApp.
1.  If you simulated a message or sent a real one that was processed, data will be in the DB.
2.  Run `Invoices > Get Client Invoices`.
    *   Update the URL in Postman to replace `:id` with the actual Client ID.

## 4. Run Server
Ensure your server is running:
```bash
npm run dev
```

## Troubleshooting
- **401 Unauthorized**: Your token might have expired. Run **Login CA** again.
- **Connection Refused**: Is your server running?
- **OCR Errors**: Ensure `service-account.json` is valid and Google Cloud API is enabled.
