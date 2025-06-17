# Multi-Tenant WhatsApp Service API

A robust, multi-tenant Node.js application designed to act as a bridge to the WhatsApp Web API. This service allows multiple tenants (users) to connect their WhatsApp accounts and manage them via an API, making it a perfect backend for automation platforms like n8n.

## ✨ Features

- **Multi-Tenancy:** Supports multiple users, each with their own isolated sessions and settings.
- **Admin Panel:** A secure, password-protected dashboard to manage all tenants and their sessions.
- **User Dashboard:** A separate, JWT-protected dashboard for tenants to manage their own WhatsApp sessions and settings.
- **Persistent Sessions:** Uses SQLite for session storage, allowing for automatic reconnection after server restarts.
- **Rich Media API:** Endpoints for sending text messages and media (images, audio, video, documents) from a URL.
- **Flexible Session Limits:** Admins can configure the maximum number of concurrent sessions allowed for each tenant.
- **Dockerized:** Includes a production-ready `Dockerfile` optimized for deployment on platforms like Coolify.

## 🚀 Technology Stack

- **Backend:** Node.js, Express.js
- **WhatsApp Integration:** `whatsapp-web.js`
- **Database:** SQLite3 for application data and admin sessions.
- **Authentication:** `express-session` for the admin panel, JSON Web Tokens (JWT) for the user dashboard.
- **Deployment:** Docker

## 🛠️ Local Development Setup

To run this application on your local machine:

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create the environment file:**
    Copy the example environment file to create your local configuration.
    ```bash
    cp .env.example .env
    ```

4.  **Configure environment variables:**
    Open the `.env` file and fill in your secrets.

    ```env
    # .env

    # A very strong password for the /admin login page.
    ADMIN_PASSWORD=your_secret_admin_password

    # A long, random string for signing admin session cookies.
    SESSION_SECRET=a-very-long-and-random-string-for-sessions

    # A different long, random string for signing user JWTs.
    JWT_SECRET=another-different-long-random-string-for-jwts

    # (Optional) The port the server will run on. Defaults to 5001.
    PORT=5001
    ```

5.  **Run the application:**
    ```bash
    npm start
    ```
    The server will be running at `http://localhost:5001`.

## ☁️ Deployment Guide for Coolify

This guide provides step-by-step instructions for deploying the application to a Coolify v4 instance.

### Prerequisites

- A working Coolify instance.
- A GitHub or GitLab account with this project's repository pushed to it.

### Step 1: Check Your Dockerfile

This repository includes a `Dockerfile` optimized for Coolify's Git-based deployments. It uses a modern Node.js version and installs the necessary browser dependencies for `whatsapp-web.js`. You do not need to modify it.

### Step 2: Create the Resource in Coolify

1.  In your Coolify dashboard, navigate to your project and click **"Add Resource"**.
2.  Select **"Public Repository"** (or connect your GitHub/GitLab app).
3.  Enter the repository URL and select the correct branch.
4.  For the **Build Pack**, make sure you select **"Dockerfile"**. Coolify will automatically detect and use the one in the repository.
5.  Set the **Port** to `5001` (or your chosen port).

### Step 3: Configure Environment Variables

This is a critical step for security. Navigate to the **"Environment Variables"** tab for your new service.

Add your secrets here. **Ensure "Is Build Variable?" is turned OFF.**

| Variable Name    | Description                                     | Example Value                                  |
| ---------------- | ----------------------------------------------- | ---------------------------------------------- |
| `ADMIN_PASSWORD` | The password for the `/admin` login page.       | `a_very_strong_password!@#$`                   |
| `SESSION_SECRET` | A long, random string to secure admin sessions. | `generate-a-long-random-string-here-for-sess`  |
| `JWT_SECRET`     | A different random string for user JWTs.        | `another-different-random-string-for-tokens`   |

### Step 4: Configure Persistent Storage

Your application's data (like the database and WhatsApp session files) is ephemeral by default in Docker. To make it permanent, you must configure persistent storage.

1.  Navigate to the **"Storage"** tab for your service.
2.  Use the **"Volume Mount"** section at the top to add the following two volumes. Leave the `Source Path` empty for Coolify to manage.

| Name (Example)        | Source Path        | Destination Path (Container) | Description                                                               |
| --------------------- | ------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| `whatsapp-data`       | `(leave empty)`    | `/app/data`                  | **Required.** Stores the main `whatsapp-service.db` and admin `sessions.db`. |
| `whatsapp-sessions`   | `(leave empty)`    | `/app/sessions`              | **Required.** Stores the WhatsApp login session data to avoid re-scanning QR codes. |

### Step 5: Deploy

Navigate back to the "Configuration" tab and click **"Deploy"**. Coolify will build the Docker image, configure the environment, mount the persistent volumes, and start your service.

Your application should now be running and fully functional on your domain.

## 🔌 API Endpoints

### Admin API

*Requires admin login session cookie.*

- **`POST /api/tenants`**: Create a new tenant.
- **`PUT /api/tenants/:tenantId`**: Update a tenant's details (name, webhook, max sessions).
- **`DELETE /api/tenants/:tenantId`**: Delete a tenant and their sessions.
- **`GET /api/dashboard-data`**: Get data for the admin panel.
- **`DELETE /api/sessions/:sessionId`**: Terminate any session.

### User API

*Requires user JWT passed as `?token=` query parameter.*

- **`POST /api/login`**: User login to get a JWT.
- **`PUT /user/settings`**: Update a user's own settings (e.g., AI prompt).
- **`PUT /api/sessions/:sessionId/name`**: Name or rename a session.
- **`GET /api/tenant/status`**: Get status of the user's own sessions.

### Messaging API

- **`POST /sessions`**: Start a new session (for an admin, or a user if under their limit).
- **`POST /sessions/:sessionId/send`**: Send a text message with humanization.
  - Body: `{ "chatId": "...", "text": "..." }`
- **`POST /api/sessions/:sessionId/send-media`**: Send media from a URL.
  - Body: `{ "chatId": "...", "mediaUrl": "...", "caption": "..." }`