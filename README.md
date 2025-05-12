# Firebase Studio - ImageDrop Application (with Local Authentication)

This is a Next.js application, ImageDrop, designed for easy image uploading and sharing. It now uses **local authentication** (storing user data in a `users.json` file on the server - **INSECURE, FOR DEMO PURPOSES ONLY**) and stores images locally on the server. Firebase *client-side SDK might still be used for other Firebase services if configured*, but not for authentication.

The application also includes an Administrator Dashboard for user management and site settings configuration.

To get started developing locally, take a look at `src/app/page.tsx`.

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
*   **Local user data (including plain text passwords - DEMO ONLY, INSECURE)** is stored in `users.json` in the project root. Ensure this file is writable by the Node.js process (run by PM2) and **NEVER commit `users.json` to version control.** It should be in your `.gitignore` file.
*   **Site settings** (like max upload size) are stored in `server-settings.json` in the project root. This file should also be writable by the Node.js process and ideally not committed if settings are environment-specific (though for this demo, it can be committed with defaults).
*   Ensure the Node.js process (run by PM2) has write permissions to the `public/uploads` directory and can create/write to `users.json` and `server-settings.json` in `/var/www/imagedrop/`.
*   The Nginx user (typically `www-data`) needs read permissions for the entire path to the uploaded files to serve them.

### Step 5.1: Initial Setup for Admin User (Manual)

After the first user signs up (or if you want to designate an existing one):
1.  Stop your application if it's running: `pm2 stop imagedrop`
2.  Open the `users.json` file located in your project root (e.g., `/var/www/imagedrop/users.json`):
    ```bash
    nano /var/www/imagedrop/users.json
    ```
3.  Find the user entry you want to make an administrator. It will look something like this:
    ```json
    {
      "id": "some-uuid-string",
      "email": "user@example.com",
      "password": "theirplaintextpassword",
      "role": "user"
    }
    ```
4.  Change the `"role": "user"` to `"role": "admin"`:
    ```json
    {
      "id": "some-uuid-string",
      "email": "user@example.com",
      "password": "theirplaintextpassword",
      "role": "admin" 
    }
    ```
5.  Save the file and exit the editor.
6.  Restart your application: `pm2 restart imagedrop`

The user is now an administrator and can access the `/admin/dashboard`.

### Step 6: Build the Application

Build your Next.js application for production.

```bash
cd /var/www/imagedrop
npm run build
```

### Step 7: Start Application with PM2

Start your Next.js application using PM2. The `npm start` script typically runs `next start`.

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

Nginx will act as a reverse proxy.

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/imagedrop
```

Paste the following configuration. Replace `your_domain.com` and `/var/www/imagedrop`. The `client_max_body_size` for Nginx (e.g., 10M) should be equal to or greater than the Next.js application's hard body limit (10MB in `next.config.ts`).

```nginx
server {
    listen 80;
    server_name your_domain.com www.your_domain.com; # Replace with your domain or server IP

    # Path to project root, e.g., /var/www/imagedrop
    # This variable is not standard Nginx but can be used for clarity if you adapt the config.
    # For this example, we'll hardcode the path in `alias` and `root` directives.
    # set $project_root /var/www/imagedrop; 

    access_log /var/log/nginx/imagedrop.access.log;
    error_log /var/log/nginx/imagedrop.error.log; # Check this file for errors!

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
    # This location block is crucial for serving static images.
    location /uploads/ {
        # The `alias` path MUST point to the directory on your server where
        # the `users` subfolder (containing user-specific uploads) is located.
        # In this app, images are saved to `public/uploads/users/...`
        # So the alias should point to the `public/uploads` part of your project.
        alias /var/www/imagedrop/public/uploads/; # IMPORTANT: Ensure this path is correct for your server setup.
                                                  # And ensure it ends with a slash if the location block does.
        
        autoindex off; # Disable directory listing for security.
        expires 1M;    # Cache images for 1 month in browser.
        access_log off; # Optional: reduce logging for static assets.
        add_header Cache-Control "public";

        # Security: Prevent execution of any scripts in the uploads folder.
        location ~* \.(php|pl|py|jsp|asp|sh|cgi|exe|dll|htaccess)$ {
            deny all;
            return 403;
        }
        # Security: Prevent browsers from MIME-sniffing the content-type.
        add_header X-Content-Type-Options "nosniff";
    }

    # Serve Next.js static assets (CSS, JS chunks, etc.)
    # This allows Nginx to cache them effectively.
    location /_next/static/ {
        proxy_cache_bypass $http_upgrade; 
        proxy_pass http://localhost:3000/_next/static/;
        expires max; # Cache these indefinitely as they are typically versioned.
        add_header Cache-Control "public";
    }
    
    # Optional: SSL Configuration (Certbot example commented out)
    # listen 443 ssl http2;
    # server_name your_domain.com www.your_domain.com;
    # ssl_certificate /etc/letsencrypt/live/your_domain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/your_domain.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    # ... (rest of SSL config) ...
}
```

Enable the Nginx site:

```bash
# Create a symbolic link from sites-available to sites-enabled
sudo ln -s /etc/nginx/sites-available/imagedrop /etc/nginx/sites-enabled/imagedrop

# Test Nginx configuration for syntax errors
sudo nginx -t

# If the test is successful, restart Nginx to apply changes
sudo systemctl restart nginx
```

### Step 9: Configure Firewall (UFW)

If you have `ufw` (Uncomplicated Firewall) enabled:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx HTTP'  # Allows traffic on port 80
# If you configured SSL (HTTPS):
# sudo ufw allow 'Nginx HTTPS' # Allows traffic on port 443
sudo ufw enable
sudo ufw status
```

### Step 10: (Optional) Secure Nginx with Certbot (Let's Encrypt SSL)

If you have a domain name, it's highly recommended to use HTTPS.

```bash
# Install Certbot and the Nginx plugin
sudo apt install certbot python3-certbot-nginx

# Obtain and install SSL certificate (follow prompts)
# This will also attempt to modify your Nginx config for SSL.
sudo certbot --nginx -d your_domain.com -d www.your_domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```
If Certbot modifies your Nginx config, ensure the `location /uploads/` and `location /_next/static/` blocks are still present and correct within the `server` block that handles port 443.

### Security Considerations for Local Setup

*   **`JWT_SECRET_KEY`**: Critical. Strong and secret.
*   **`users.json` (DEMO ONLY)**:
    *   Plain text passwords are insecure. For real apps, use hashing (bcrypt).
    *   Restrictive file permissions.
    *   Ensure it's in `.gitignore`.
*   **`server-settings.json`**: Contains site configuration. Ensure appropriate permissions.
*   **File Uploads (`public/uploads`)**:
    *   Nginx `alias` path must be correct. `client_max_body_size` in Nginx (e.g., 10M) must match or exceed Next.js `experimental.serverActions.bodySizeLimit` (e.g., 10MB).
    *   File Permissions: Node.js (PM2 user) needs write to `public/uploads/users/` and `users.json`, `server-settings.json`. Nginx user (`www-data`) needs read access to images and read+execute on path directories.
    *   Content Validation: Handled in `imageActions.ts`.
*   **Session Management**: JWTs in HTTP-only cookies. Use HTTPS in production.
*   **Admin Dashboard**: Access is restricted by user role. Ensure admin accounts are secure.

### Troubleshooting

*   **502 Bad Gateway:** Your Next.js app (managed by PM2) might be down or not responding.
    *   Check PM2 status: `pm2 list`
    *   Check PM2 logs: `pm2 logs imagedrop`
    *   Ensure Nginx `proxy_pass http://localhost:3000;` points to the correct port Next.js is running on.
*   **Permission Denied (General):**
    *   For file system operations by the app (uploads, writing `users.json`): The user running the PM2 process needs write permissions.
    *   For Nginx serving files: The Nginx worker user (often `www-data`) needs read permissions. See "Uploaded Images Show 'isn't a valid image'" below.
    *   Check Nginx error logs: `sudo cat /var/log/nginx/imagedrop.error.log` or `sudo cat /var/log/nginx/error.log`.
*   **Nginx Config Test Fails (`sudo nginx -t`):** Review the output carefully. It usually indicates the line number and type of error.
*   **Login/Signup/Admin Issues:** Check PM2 logs, browser console. Ensure `JWT_SECRET_KEY` is set. Ensure admin role is correctly set in `users.json`.
*   **Uploaded Images Show "isn't a valid image" / HTML response (e.g., 404 page from Next.js):**
    This typically means Nginx is not serving the image file directly via the `location /uploads/` block, and the request is instead being proxied to your Next.js application, which doesn't have a route for that image path.
    1.  **Verify Nginx Configuration is Loaded:**
        *   Ensure you edited the correct file (e.g., `/etc/nginx/sites-available/imagedrop`).
        *   Ensure the symlink is correct: `ls -l /etc/nginx/sites-enabled/` (should show `imagedrop -> ../sites-available/imagedrop`).
        *   Test Nginx config: `sudo nginx -t`.
        *   **Reload Nginx**: `sudo systemctl reload nginx` (or `restart` if reload doesn't work).
    2.  **Verify `alias` Path in Nginx Config:** The `alias` in `location /uploads/` must be the **absolute path** to your project's `public/uploads` directory on the server.
        *   Navigate to your project root: `cd /var/www/imagedrop`
        *   Get the full path to `public/uploads`: `pwd`/public/uploads (e.g., `/var/www/imagedrop/public/uploads`).
        *   Ensure this matches the `alias` directive in `/etc/nginx/sites-available/imagedrop`. It should be `alias /var/www/imagedrop/public/uploads/;`.
    3.  **Check File System Permissions for Nginx User:** The Nginx worker process user (commonly `www-data` on Ubuntu) needs:
        *   Read (`r`) permission on the image files themselves.
        *   Read (`r`) and execute (`x`) permissions on ALL directories in the path leading to the images (e.g., `/var/www/`, `/var/www/imagedrop/`, `/var/www/imagedrop/public/`, `/var/www/imagedrop/public/uploads/`, and subsequent user/date folders).
        *   To check the Nginx user: `ps aux | grep "nginx: worker process" | awk '{print $1}' | head -n1` (usually `www-data`).
        *   Test permissions for a specific image file (replace placeholders):
            ```bash
            # Example:
            # sudo -u www-data ls -l /var/www/imagedrop/public/uploads/users/USER_ID/MM.YYYY/image.png
            # namei -l /var/www/imagedrop/public/uploads/users/USER_ID/MM.YYYY/image.png
            ```
            The `namei` command is very useful for seeing permissions along the entire path.
    4.  **Check Nginx Error Logs (Critically Important!):**
        *   `sudo tail -f /var/log/nginx/imagedrop.error.log`
        *   Also check the main Nginx error log: `sudo tail -f /var/log/nginx/error.log`
        *   Look for "Permission denied", "No such file or directory", or other errors related to the image path when you try to access an image.
    5.  **Ensure Image File Exists:** Double-check that the image file actually exists at the expected path on the server.
        *   `ls -l /var/www/imagedrop/public/uploads/users/USER_ID/MM.YYYY/image.png`
*   **Body Exceeded Limit Errors:**
    *   Next.js: `experimental.serverActions.bodySizeLimit` in `next.config.ts` (e.g., '10mb').
    *   Nginx: `client_max_body_size` in Nginx config (e.g., `10M` in the `server` block or relevant `location` block).
    *   Admin-configurable limit (in `server-settings.json`) is an application-level check within these harder limits. Restart Nginx and PM2 app after changes.

### Updating the Application

1.  `cd /var/www/imagedrop`
2.  `git pull origin main` (or your branch)
3.  `npm install` (if dependencies changed)
4.  `npm run build`
5.  `pm2 restart imagedrop`

### Resetting User Data and Uploaded Images (Development/Testing)

**WARNING: This will permanently delete all user accounts, uploaded images, and site settings. For development/testing only.**

1.  **Stop Application:** `pm2 stop imagedrop`
2.  **Delete User Data:** `cd /var/www/imagedrop && rm users.json` (if exists)
3.  **Delete Site Settings:** `cd /var/www/imagedrop && rm server-settings.json` (if exists)
4.  **Delete Uploaded Images:** `cd /var/www/imagedrop/public/uploads && rm -rf users`
5.  **Restart Application:** `pm2 restart imagedrop` (This will recreate `server-settings.json` with defaults if `settingsService.ts` handles it, or you might need to add a default one back).

Your application should now be accessible.
```