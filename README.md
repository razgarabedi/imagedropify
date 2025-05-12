# Firebase Studio - ImageDrop Application (with Local Authentication & Approval)

This is a Next.js application, ImageDrop, designed for easy image uploading and sharing. It uses **local authentication** (storing user data in a `users.json` file on the server - **INSECURE, FOR DEMO PURPOSES ONLY**) and stores images locally on the server. A **user approval workflow** is now implemented.

The application also includes an Administrator Dashboard for user management (including approval) and site settings configuration.

To get started developing locally, take a look at `src/app/page.tsx`.

## User Approval Workflow

1.  **First User is Admin:** The very first user account created upon initial application startup is automatically designated as an **administrator** and their status is set to **approved**.
2.  **Subsequent Signups:** All users who sign up *after* the first admin user will have their status set to **pending**.
3.  **Pending Status:** Users with a 'pending' status can **not** log in. They will receive a message indicating their account needs administrator approval.
4.  **Admin Approval:** An administrator must log in, navigate to the Admin Dashboard (`/admin/dashboard`), and manually **approve** or **reject** pending user accounts.
5.  **Approved Status:** Once approved by an admin, the user can log in normally.
6.  **Rejected Status:** If rejected, the user remains unable to log in. (Currently, rejected users stay in the `users.json` file with 'rejected' status. Future improvement could be to delete them or offer a re-application process).

## Running on Ubuntu with Nginx

This section provides instructions on how to set up and run this ImageDrop application on an Ubuntu server using Nginx as a reverse proxy and PM2 as a process manager.

### Prerequisites

*   A Ubuntu server (LTS version recommended, e.g., 20.04, 22.04).
*   Root or sudo privileges.
*   A domain name pointed to your server's IP address (optional but recommended for production).
*   Basic familiarity with the Linux command line.

### Step 1: Install Node.js and npm

If you don't have Node.js (version 18.x or later recommended) and npm installed, you can install them using NodeSource:

```bash
# Update package list
sudo apt update

# Install curl if not already installed
sudo apt install -y curl

# Add NodeSource repository for Node.js 20.x (recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js and npm
sudo apt install -y nodejs

# Verify installation
node -v
npm -v
```
Alternatively, consider using `nvm` (Node Version Manager) for more flexible Node.js version management.

### Step 2: Install PM2

PM2 is a process manager for Node.js applications that will keep your app running and restart it if it crashes.

```bash
sudo npm install pm2 -g

# Verify installation
pm2 --version
```

### Step 3: Clone Your Application

Clone the ImageDrop application repository to your server. A common location is `/var/www/your_application_name`.

```bash
# Replace your_application_name and your_repository_url
sudo mkdir -p /var/www/imagedrop
sudo chown $USER:$USER /var/www/imagedrop # Give your user ownership for cloning
cd /var/www/imagedrop
git clone your_repository_url . # Or copy your project files here
```

### Step 4: Install Dependencies

Navigate to your project directory and install the dependencies.

```bash
cd /var/www/imagedrop
npm install
```

### Step 5: Configure Environment Variables

The application requires certain environment variables. Create a `.env.local` file in the root of your project directory (`/var/www/imagedrop/.env.local`):

```bash
nano .env.local
```

Add the following variables:

```ini
# For Local Authentication (JWT Sessions) - REQUIRED
# Replace with a strong, unique secret key. Keep this private.
JWT_SECRET_KEY="your-super-secret-and-long-jwt-key-please-change-me"

# Optional: If using other Firebase services (e.g., Firestore, Storage directly without Firebase Auth for rules)
# These are prefixed with NEXT_PUBLIC_ if they need to be accessible on the client-side.
# NEXT_PUBLIC_FIREBASE_API_KEY="your_firebase_api_key_if_needed_for_other_services"
# NEXT_PUBLIC_FIREBASE_PROJECT_ID="your_firebase_project_id_if_needed"
# ... other Firebase config variables if you use other Firebase services ...
```

**CRITICAL SECURITY NOTE for `JWT_SECRET_KEY`**: The `JWT_SECRET_KEY` is vital for securing user sessions. Ensure it is a long, random, and unique string. **Do not use the default placeholder value in production.**

**Important for file uploads, local user data & site settings:**
*   The application saves uploaded files to `public/uploads/users/[userId]/[MM.YYYY]/filename.ext`. This directory will be created automatically if it doesn't exist. The maximum file size is configurable by an administrator via the Admin Dashboard (default 6MB), up to the server's body limit (10MB in Next.js config and Nginx example).
*   **Local user data (including plain text passwords - DEMO ONLY, INSECURE)** is stored in `users.json` in the project root. This file now includes user `role` (`admin` or `user`) and `status` (`pending`, `approved`, `rejected`). Ensure this file is writable by the Node.js process (run by PM2) and **NEVER commit `users.json` to version control.** It should be in your `.gitignore` file.
*   **Site settings** (like max upload size) are stored in `server-settings.json` in the project root. This file should also be writable by the Node.js process and ideally not committed if settings are environment-specific (though for this demo, it can be committed with defaults).
*   Ensure the Node.js process (run by PM2) has write permissions to the `public/uploads` directory and can create/write to `users.json` and `server-settings.json` in `/var/www/imagedrop/`.
*   The Nginx user (typically `www-data`) needs read permissions for the entire path to the uploaded files to serve them.

### Step 5.1: Admin User Setup & Management

*   **Initial Admin:** The **first user who signs up** for the application will automatically be designated as an **administrator** with `approved` status. This user can access the Admin Dashboard at `/admin/dashboard`.
*   **User Approval:** Subsequent users will have `pending` status upon signup. Admins must use the Admin Dashboard to **approve** or **reject** these pending accounts before they can log in.
*   **Manual Admin Assignment (if needed):** If you need to change the admin user or manually assign admin rights (e.g., if the first admin account needs changing or `users.json` was populated manually):
    1.  Stop your application: `pm2 stop imagedrop`
    2.  Open `users.json` (`/var/www/imagedrop/users.json`): `nano users.json`
    3.  Find the user entry. It will look similar to this (password and status fields included):
        ```json
        {
          "id": "some-uuid-string",
          "email": "user@example.com",
          "role": "user", 
          "status": "approved", 
          "password": "theirplaintextpassword" 
        }
        ```
    4.  To make a user an admin, ensure `"role": "admin"` and `"status": "approved"`. To demote, set `"role": "user"`.
    5.  Save the file.
    6.  Restart your application: `pm2 restart imagedrop`

### Step 6: Build the Application

Build your Next.js application for production.

```bash
cd /var/www/imagedrop
npm run build
```

### Step 7: Start Application with PM2

Start your Next.js application using PM2.

```bash
cd /var/www/imagedrop
pm2 start npm --name "imagedrop" -- run start

# To ensure PM2 restarts on server reboot:
pm2 startup systemd
# Follow the instructions output by the command above

# Save the current PM2 process list
pm2 save

# Check status & logs
pm2 list
pm2 logs imagedrop
```

By default, `next start` runs the application on port 3000.

### Step 8: Install and Configure Nginx

Install and configure Nginx as a reverse proxy.

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/imagedrop
```

Paste the following configuration. Replace `your_domain.com` and `/var/www/imagedrop`. Ensure `client_max_body_size` (e.g., 10M) matches or exceeds the Next.js `experimental.serverActions.bodySizeLimit` (e.g., '10mb').

```nginx
server {
    listen 80;
    server_name your_domain.com www.your_domain.com; # Replace with your domain or server IP

    access_log /var/log/nginx/imagedrop.access.log;
    error_log /var/log/nginx/imagedrop.error.log; 

    # Max body size for uploads (e.g., 10MB). Must be >= Next.js app bodySizeLimit.
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000; 
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 600s; 
        proxy_send_timeout 600s; 
    }

    # Serve uploaded images directly from the filesystem
    location /uploads/ {
        alias /var/www/imagedrop/public/uploads/; # Points to the directory containing the 'users' subfolder
        autoindex off; 
        expires 1M;    
        access_log off; 
        add_header Cache-Control "public";

        location ~* \.(php|pl|py|jsp|asp|sh|cgi|exe|dll|htaccess)$ {
            deny all;
            return 403;
        }
        add_header X-Content-Type-Options "nosniff";
    }

    # Serve Next.js static assets
    location /_next/static/ {
        proxy_cache_bypass $http_upgrade; 
        proxy_pass http://localhost:3000/_next/static/;
        expires max; 
        add_header Cache-Control "public";
    }
    
    # Optional: SSL Configuration (Certbot example)
    # ... (SSL config as before) ...
}
```

Enable the Nginx site:

```bash
sudo ln -s /etc/nginx/sites-available/imagedrop /etc/nginx/sites-enabled/imagedrop
sudo nginx -t
sudo systemctl restart nginx
```

### Step 9: Configure Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx HTTP' 
# If using SSL: sudo ufw allow 'Nginx HTTPS'
sudo ufw enable
sudo ufw status
```

### Step 10: (Optional) Secure Nginx with Certbot (Let's Encrypt SSL)

(Instructions remain the same as before)

### Security Considerations for Local Setup

*   **`JWT_SECRET_KEY`**: Critical. Strong and secret.
*   **`users.json` (DEMO ONLY)**:
    *   Plain text passwords are insecure.
    *   Includes user role and status.
    *   Restrictive file permissions.
    *   Ensure it's in `.gitignore`.
*   **`server-settings.json`**: Contains site configuration. Ensure appropriate permissions.
*   **File Uploads (`public/uploads`)**:
    *   Nginx `alias` path must be correct. `client_max_body_size` in Nginx must match or exceed Next.js `bodySizeLimit`.
    *   File Permissions: Node.js (PM2 user) needs write to `public/uploads/users/`, `users.json`, `server-settings.json`. Nginx user (`www-data`) needs read access to images and path directories.
    *   Content Validation: Handled in `imageActions.ts`.
*   **Session Management**: JWTs in HTTP-only cookies. Use HTTPS in production.
*   **Admin Dashboard**: Access restricted by user role. Admins manage user approvals. Ensure admin accounts are secure.
*   **User Approval Workflow**: The security relies on admins correctly vetting pending users.

### Troubleshooting

(Troubleshooting steps remain largely the same, but consider adding checks for user status if login issues occur).

*   **Login Fails with "Pending Approval" or "Rejected":** Check the user's `status` in `users.json` or via the Admin Dashboard.
*   **Uploaded Images Show "isn't a valid image" / HTML response:** (Steps remain the same - Nginx alias, permissions, logs are key).
*   **Permission Denied (General):** (Steps remain the same - check Node.js user for writes, Nginx user for reads).

### Updating the Application

(Steps remain the same)

### Resetting User Data and Uploaded Images (Development/Testing)

**WARNING: This will permanently delete all user accounts (including admin), approvals, uploaded images, and site settings. For development/testing only.**

1.  **Stop Application:** `pm2 stop imagedrop`
2.  **Delete User Data:** `cd /var/www/imagedrop && rm users.json` (if exists)
3.  **Delete Site Settings:** `cd /var/www/imagedrop && rm server-settings.json` (if exists)
4.  **Delete Uploaded Images:** `cd /var/www/imagedrop/public/uploads && rm -rf users`
5.  **Restart Application:** `pm2 restart imagedrop` (This will recreate `server-settings.json` with defaults. The *next* user to sign up will become the admin).

Your application should now be accessible. Remember the first signup creates the admin account.
