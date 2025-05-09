# Firebase Studio - ImageDrop Application

This is a Next.js application, ImageDrop, designed for easy image uploading and sharing. It uses Firebase for authentication and stores images locally on the server.

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

The application requires Firebase configuration to be set up via environment variables. Create a `.env.local` file in the root of your project directory (`/var/www/imagedrop/.env.local`):

```bash
nano .env.local
```

Add your Firebase project credentials to this file. **These variables are prefixed with `NEXT_PUBLIC_` because they need to be accessible on the client-side for Firebase SDK initialization.**

```ini
NEXT_PUBLIC_FIREBASE_API_KEY="your_firebase_api_key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your_firebase_auth_domain"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your_firebase_project_id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your_firebase_storage_bucket"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your_firebase_messaging_sender_id"
NEXT_PUBLIC_FIREBASE_APP_ID="your_firebase_app_id"
# NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="your_firebase_measurement_id" # Optional
```

Replace `"your_firebase_..."` with your actual Firebase project settings. You can find these in your Firebase project console: Project settings > General > Your apps > Web app.

**Important for file uploads:**
The application saves uploaded files to `public/uploads`. This directory will be created automatically if it doesn't exist, structured as `public/uploads/users/[userId]/[MM.YYYY]/filename.ext`. Ensure the Node.js process (run by PM2) has write permissions to the `public/uploads` directory if you create it manually. Typically, PM2 runs as the user who starts it. If you start PM2 as your regular user, ensure this user can write into `/var/www/imagedrop/public`.

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
# Follow the instructions output by the command above, which usually involves running a command like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u your_username --hp /home/your_username

# Save the current PM2 process list
pm2 save

# You can check the status of your app with:
pm2 list

# And view logs with:
pm2 logs imagedrop
```

By default, `next start` runs the application on port 3000.

### Step 8: Install and Configure Nginx

Nginx will act as a reverse proxy, forwarding requests to your Next.js application running via PM2.

```bash
# Install Nginx
sudo apt install -y nginx

# Create an Nginx server block configuration file
sudo nano /etc/nginx/sites-available/imagedrop
```

Paste the following configuration into the file. **Remember to replace `your_domain.com` with your actual domain name and `/var/www/imagedrop` with the correct path to your project.**

```nginx
server {
    listen 80;
    server_name your_domain.com www.your_domain.com; # Replace with your domain

    # Path for SSL certificates (if using Certbot)
    # root /var/www/html; # Default or Certbot's webroot
    # index index.html index.htm;

    # Log files
    access_log /var/log/nginx/imagedrop.access.log;
    error_log /var/log/nginx/imagedrop.error.log;

    # Increase client max body size for large image uploads (e.g., 20MB)
    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000; # Assuming Next.js app (via PM2) runs on port 3000
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 600s; # Optional: Increase timeout for large uploads
        proxy_send_timeout 600s; # Optional: Increase timeout for large uploads
    }

    # Serve uploaded images directly from the filesystem
    # and apply security measures.
    location /uploads/ {
        alias /var/www/imagedrop/public/uploads/; # IMPORTANT: Update this path to your project's public/uploads directory
        autoindex off; # Disable directory listing
        expires 1M;    # Cache static assets for 1 month
        access_log off; # Disable access logging for these files if desired
        add_header Cache-Control "public";

        # Security: Prevent execution of any scripts in the uploads folder.
        # This is a best-effort attempt. Ensure file permissions are also restrictive.
        location ~* \.(php|pl|py|jsp|asp|sh|cgi|exe|dll|htaccess)$ {
            deny all;
            return 403;
        }
        # Add nosniff header to prevent MIME type sniffing
        add_header X-Content-Type-Options "nosniff";
    }

    # Handle Next.js static assets efficiently
    # These are served by the Next.js app itself through the proxy for consistency,
    # but Nginx could be configured to serve them directly if optimized caching is needed.
    location /_next/static/ {
        proxy_cache_bypass $http_upgrade; # Ensure fresh assets during development/updates
        proxy_pass http://localhost:3000/_next/static/;
        expires max; # Cache aggressively in production
        add_header Cache-Control "public";
    }
    
    # Optional: If you have other static assets in `public/static` not handled by Next.js routing
    # location /static/ {
    #    root /var/www/imagedrop/public; # IMPORTANT: Update path
    #    expires 1y;
    #    add_header Cache-Control "public";
    # }

    # Optional: SSL Configuration with Certbot (Let's Encrypt)
    # After obtaining SSL certs with Certbot, it will usually modify this file.
    # An example if you were to set it manually initially:
    # listen 443 ssl http2;
    # server_name your_domain.com www.your_domain.com;
    #
    # ssl_certificate /etc/letsencrypt/live/your_domain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/your_domain.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    #
    # if ($scheme != "https") {
    #    return 301 https://$host$request_uri;
    # }
}
```

**Enable the Nginx site:**

```bash
# Create a symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/imagedrop /etc/nginx/sites-enabled/

# Test Nginx configuration for errors
sudo nginx -t

# If the test is successful, restart Nginx
sudo systemctl restart nginx
```

### Step 9: Configure Firewall (UFW)

If you have `ufw` (Uncomplicated Firewall) enabled, allow HTTP and HTTPS traffic.

```bash
sudo ufw allow OpenSSH  # Ensure SSH access is not blocked
sudo ufw allow 'Nginx Full' # Allows both HTTP (80) and HTTPS (443)
# OR, if only using HTTP:
# sudo ufw allow 'Nginx HTTP'

# Enable UFW if it's not already enabled
sudo ufw enable

# Check status
sudo ufw status
```

### Step 10: (Optional) Secure Nginx with Certbot (Let's Encrypt SSL)

For a production setup, it's highly recommended to use HTTPS. Certbot can automate obtaining and renewing SSL certificates from Let's Encrypt.

```bash
# Install Certbot and its Nginx plugin
sudo apt install certbot python3-certbot-nginx

# Obtain and install SSL certificate (follow prompts)
sudo certbot --nginx -d your_domain.com -d www.your_domain.com # Replace with your domain(s)

# Certbot will automatically update your Nginx configuration and set up auto-renewal.
# Test auto-renewal:
sudo certbot renew --dry-run
```

### Security Considerations for `/public/uploads`

*   **Nginx Configuration:** The provided Nginx config includes a `location /uploads/` block designed to:
    *   Serve files directly.
    *   Attempt to deny execution of script-like files (e.g., `.php`, `.py`).
    *   Set `X-Content-Type-Options: nosniff` to prevent browsers from misinterpreting file types.
*   **File Permissions:** Ensure that the `public/uploads` directory and its subdirectories are not world-writable and that the user running the Node.js/Next.js application (via PM2) only has the necessary write permissions. The Nginx user (usually `www-data`) needs read access.
*   **Content Validation:** While not part of server setup, robust server-side validation of uploaded file types and content is crucial within the application itself (partially handled by `imageActions.ts`).

### Troubleshooting

*   **502 Bad Gateway:** This usually means Nginx cannot reach your Next.js application.
    *   Check if PM2 is running your app: `pm2 list`.
    *   Check PM2 logs: `pm2 logs imagedrop`.
    *   Ensure the `proxy_pass` in Nginx config points to the correct port (default `http://localhost:3000`).
*   **Permission Denied:**
    *   For Nginx logs: Ensure `/var/log/nginx` exists and Nginx has permissions.
    *   For application files: Ensure the user running PM2 has read access to project files and write access to `public/uploads`.
*   **Nginx Configuration Test Fails:** Carefully review `sudo nginx -t` output for syntax errors.
*   **Firebase Issues:** Ensure `.env.local` is correctly configured and accessible by the application. Check client-side browser console for Firebase-related errors.

### Updating the Application

1.  Navigate to your project directory: `cd /var/www/imagedrop`
2.  Pull the latest changes: `git pull origin main` (or your branch)
3.  Install/update dependencies: `npm install`
4.  Rebuild the application: `npm run build`
5.  Restart the application with PM2: `pm2 restart imagedrop`

Your application should now be accessible via your server's IP address or domain name.
```