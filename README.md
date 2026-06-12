# Node.js Hosting Test App

A lightweight Node.js Express.js web application designed to test and verify cPanel Node.js hosting environments. It tests session management (`express-session`), template rendering (`ejs`), package execution, and displays key server statistics in a modern, protected dashboard.

---

## Features

- **Responsive Landing Page**: Sleek dark mode visual state indicating server online status.
- **Session-Based Authentication**: Secure access using `express-session` without requiring a database.
- **Protected Dashboard**: Accessible only to logged-in users, displaying:
  - Current Server Time
  - Node.js runtime version
  - Server hostname
  - Logged-in username
- **Test Credentials**: Hardcoded credentials for quick testing:
  - **Username**: `123`
  - **Password**: `123`

---

## Local Setup & Run

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed locally (Version 12+ recommended).

### 1. Install Dependencies

In the root of the project directory, run:

```bash
npm install
```

### 2. Start the Application

To run in production mode:

```bash
npm start
```

Or for development (if `nodemon` is installed globally or locally):

```bash
npm run dev
```

The application will start on port `3000` by default. Open your browser and navigate to:
[http://localhost:3000](http://localhost:3000)

---

## cPanel Deployment Guide

To deploy this test application in a typical cPanel Node.js environment, follow these steps:

### 1. Upload Code Files
Compress the following files and directories and upload them to your cPanel file manager (into a folder outside public_html, e.g., `/home/username/node-test-app`):
- `app.js`
- `package.json`
- `views/`
- `public/`

*Note: Do not upload the `node_modules` folder; it will be installed directly on the server.*

### 2. Create the Node.js Application in cPanel
1. Log into your cPanel and search for **Setup Node.js App** (under the **Software** section).
2. Click **Create Application**.
3. Fill in the configuration:
   - **Node.js version**: Choose your preferred version (e.g., 18.x, 20.x).
   - **Application mode**: Set to `Development` or `Production`.
   - **Application root**: Enter the folder path where you uploaded the files (e.g., `node-test-app`).
   - **Application URL**: Select the domain or subdomain path where the app should be accessed (e.g., `testapp.yourdomain.com`).
   - **Application startup file**: Set to `app.js`.
4. Click **Create**.

### 3. Install NPM Dependencies
1. Once the application is created, scroll down to the **Configuration** section.
2. Under "NPM packages", click the **Run npm install** button. cPanel will read `package.json` and download the dependencies directly to the server.
3. If necessary, click **Restart** at the top of the Node.js app setup page to apply changes.

### 4. Verification
Access the Application URL specified in step 2. You should see the landing page. Click **Login**, use credentials `123`/`123`, and verify the dashboard successfully renders the cPanel server's hostname and Node.js version.
