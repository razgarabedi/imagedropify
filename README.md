
# ImageDrop: Local Image Hosting & Sharing Platform

ImageDrop is a Next.js application designed for easy image uploading, folder organization, and sharing. It features local authentication and file storage, an administrator dashboard for user and site management, and a user approval workflow.

## Core Features

*   **Image Uploading:** Users can upload images (JPG, PNG, GIF, WebP).
*   **Folder Management:** Logged-in users can create folders to organize their images and upload directly to specific folders.
*   **Image Management:** Users can view, rename, and delete their own uploaded images.
*   **Folder Sharing:** Users can generate unique, shareable public links for their custom folders.
*   **Local Authentication:**
    *   User accounts are managed locally via a `users.json` file on the server.
    *   **Security Warning:** Passwords are currently stored in plain text. This is **highly insecure** and suitable **only for demonstration or personal, trusted environments**. Do NOT use in a public-facing production environment without implementing proper password hashing (e.g., bcrypt).
    *   Sessions are managed using JWTs stored in HTTP-only cookies.
*   **User Approval Workflow:**
    1.  **First User is Admin:** The very first user account created is automatically designated as an administrator and approved.
    2.  **Subsequent Signups:** All users signing up after the first admin will have their status set to `pending`.
    3.  **Pending Status:** Users with a `pending` status cannot log in until approved.
    4.  **Admin Approval:** An administrator must approve or reject pending accounts via the Admin Dashboard.
*   **Administrator Dashboard (`/admin/dashboard`):**
    *   **User Management:**
        *   View all users, their status, role, image count, and storage usage.
        *   Approve pending user registrations.
        *   Reject (ban) users.
        *   Unban users (sets status back to `pending` for re-approval).
        *   Delete users (this also deletes their uploaded images and folders).
    *   **User-Specific Limits:**
        *   Set maximum number of images a user can upload.
        *   Set maximum single upload file size (MB) for a user (overrides global).
        *   Set maximum total storage (MB) a user can consume.
        *   *(Leave blank for global default/unlimited where applicable).*
    *   **Site Settings:**
        *   Configure the global maximum image upload size (MB).
        *   Set a custom URL for the homepage image displayed to logged-out users.
        *   Enable or disable new user registrations site-wide (first admin signup is always allowed).
*   **Responsive Design:** UI adapts to different screen sizes.
*   **Dark/Light Theme:** User-selectable theme.

## Deployment on Ubuntu with Nginx & PM2

This guide outlines deploying ImageDrop on an Ubuntu server (e.g., 20.04, 22.04 LTS) using Nginx as a reverse proxy and PM2 as a process manager.

### 1. Prerequisites

*   Ubuntu Server with root or sudo access.
*   Node.js (v18.x or later) and npm installed.
*   Git installed.
*   Domain name pointed to your server's IP (recommended for production).

### 2. Install Node.js, npm, and PM2

```bash
# Update package list
sudo apt update

# Install curl (if not already installed)
sudo apt install -y curl

# Add NodeSource repository for Node.js 20.x (or your preferred LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js and npm
node -v
npm -v

# Install PM2 globally
sudo npm install pm2 -g
pm2 --version
```

### 3. Clone Application & Install Dependencies

```bash
# Create application directory (adjust path if needed)
sudo mkdir -p /var/www/imagedrop
# Change ownership to your deployment user (e.g., 'ubuntu' or your non-root user)
# THIS USER WILL RUN THE PM2 PROCESS. Let's call this `node_user`.
sudo chown $USER:$USER /var/www/imagedrop
cd /var/www/imagedrop

# Clone your repository
git clone <your_repository_url> .
# Or, if you've copied files manually, ensure they are in /var/www/imagedrop

# Install dependencies
npm install
```

### 4. Configure Environment Variables

Create a `.env.local` file in the root of your project (`/var/www/imagedrop/.env.local`):

```bash
nano .env.local
```

Add the following, **replacing the placeholder JWT secret**:

```ini
# For Local Authentication (JWT Sessions) - REQUIRED
# Replace with a strong, unique secret key. Keep this private.
JWT_SECRET_KEY="your-super-secret-and-long-jwt-key-please-change-me"

# NEXT_PUBLIC_FIREBASE_* variables are not strictly required for core functionality
# as authentication and image storage are local. Only add if using other Firebase services.
```
**CRITICAL:** The `JWT_SECRET_KEY` is vital for securing user sessions. Generate a long, random, unique string. **Do not use the default value in production.**

### 5. Build the Application

```bash
cd /var/www/imagedrop
npm run build
```

### 6. Initial Admin User & Data Files

*   **First Signup is Admin:** The **first user to sign up** after the application starts will automatically become an administrator with `approved` status.
*   **Data Files:** The application will automatically create `users.json`, `server-settings.json`, and `folder-shares.json` in the project root (`/var/www/imagedrop/`) when needed. Ensure the Node.js process has write permissions to this directory (see Step 7).

### 7. Set File Ownership and Permissions

**CRITICAL:** Correct permissions are essential for security and operation.
Assume your Node.js application (run by PM2) will execute as your current deployment user (e.g., `ubuntu`). Let's call this the `node_user`. Nginx typically runs as `www-data`.

```bash
cd /var/www/imagedrop

# 1. Node User owns all project files initially
# Replace 'node_user' with the actual username that will run PM2
sudo chown -R node_user:node_user /var/www/imagedrop

# 2. Set secure base permissions for the project directory
sudo chmod 750 /var/www/imagedrop # Owner: rwx, Group: rx, Others: ---

# 3. Permissions for writable JSON data files by Node User
# These files will be created by the app if they don't exist.
# The node_user needs read/write. Nginx (www-data) does NOT need access.
sudo touch users.json server-settings.json folder-shares.json # Ensure files exist for chmod
sudo chown node_user:node_user users.json server-settings.json folder-shares.json
sudo chmod 660 users.json server-settings.json folder-shares.json # Owner: rw, Group: rw (if node_user's group), Others: ---

# 4. Permissions for `public/uploads` directory
#    - `node_user` (running PM2) needs `rwx` to create `users/<userId>/<folderName>/YYYY/MM/DD/` and write images.
#    - `www-data` (running Nginx) needs `rx` to traverse directories and `r` to read image files.

# Create base uploads structure if it doesn't exist
sudo mkdir -p public/uploads/users
sudo chown -R node_user:node_user public/uploads # Node user owns the uploads structure

# **Recommended Method: Using ACLs (Access Control Lists)**
# Install ACLs if not present: sudo apt install acl
# Give Node User rwx, and www-data rx to 'public/uploads' and everything created within it.
# The -R flag applies recursively to existing files/dirs.
# The -dR flag sets default ACLs for NEW files/dirs created within public/uploads. THIS IS CRUCIAL.
sudo setfacl -R -m u:node_user:rwx public/uploads
sudo setfacl -R -m u:www-data:rx public/uploads # Grant www-data read/execute
sudo setfacl -dR -m u:node_user:rwx public/uploads  # Default for new items by node_user
sudo setfacl -dR -m u:www-data:rx public/uploads   # Default for new items (ensures www-data can read/execute)

# If ACLs are not used, you might need to add www-data to node_user's group
# or manage permissions more manually, which can be complex and error-prone.
# Example (less recommended than ACLs):
# sudo usermod -a -G node_user www-data # Add www-data to node_user's group
# sudo chmod -R 770 public/uploads # node_user rwx, group (incl www-data) rwx
# sudo find public/uploads -type d -exec chmod g+s {} \; # Ensure new items inherit group

# 5. Nginx traversal permissions for parent directories
# Nginx (www-data) needs execute (x) permission to traverse the path to served files.
# These commands ensure 'other' can traverse. If your server is more locked down,
# you might need to use group permissions or ACLs on parent dirs too.
sudo chmod o+x /var # Or the most specific parent directory Nginx needs to traverse before /var/www
sudo chmod o+x /var/www # Allow 'other' to traverse /var/www
sudo chmod o+x /var/www/imagedrop # Allow 'other' to traverse into app dir
sudo chmod o+x /var/www/imagedrop/public # Allow 'other' to traverse into public
# For public/uploads and its children, ACLs (or group permissions) should handle www-data's 'rx' access.

# Verify (example for ACL method):
# getfacl /var/www/imagedrop/public/uploads
# After an upload, check: getfacl /var/www/imagedrop/public/uploads/users/<some_user_id>/<some_folder>/.../<image.png>
# Ensure www-data has 'r-x' on directories and 'r--' on the image file.
```
**Important Notes on Permissions:**
*   Replace `node_user` with the actual username that will run the `pm2` process for your Next.js app.
*   **ACLs are strongly recommended.** The `setfacl -dR -m u:www-data:rx public/uploads` command is critical for ensuring `www-data` automatically gets the necessary read/execute permissions on files and directories newly created by `node_user` within `public/uploads`.
*   The application code now attempts to set permissions `0o755` for directories and `0o644` for files during creation. This can act as a fallback if ACLs are not perfectly set up, but ACLs are preferred for robust permission inheritance.
*   If issues persist, use `namei -l /var/www/imagedrop/public/uploads/users/<userId>/.../image.png` immediately after an upload to trace permissions for each component of the path. `www-data` needs `x` on all directories and `r` on the file.

### 8. Start Application with PM2

Run PM2 **as the `node_user`** you designated for file ownership (the same user you used in `sudo chown -R node_user:node_user /var/www/imagedrop`).

```bash
cd /var/www/imagedrop

# Start the app
pm2 start npm --name "imagedrop" -- run start

# Optional: Configure PM2 to start on server reboot
pm2 startup systemd
# Follow the command output by pm2 startup (usually requires running a command with sudo)
# Example: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u node_user --hp /home/node_user 
# (Replace node_user and home path with your actual user and their home directory)

# Save current PM2 process list
pm2 save

# Check status & logs
pm2 list
pm2 logs imagedrop
```
The app will run on `http://localhost:3000` by default.

### 9. Install and Configure Nginx

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/imagedrop
```

Paste the following, replacing `your_domain.com` (or use your server's IP if no domain). Ensure `client_max_body_size` matches or exceeds the Next.js `bodySizeLimit` (currently '10mb' in `next.config.ts`).

```nginx
server {
    listen 80;
    server_name your_domain.com www.your_domain.com; # Or server_IP_address

    # Path for access and error logs
    access_log /var/log/nginx/imagedrop.access.log;
    error_log /var/log/nginx/imagedrop.error.log;

    # Max body size for uploads (e.g., 10MB). Must be >= Next.js app bodySizeLimit.
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000; # Or your Next.js app port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 600s; # Adjust as needed for long uploads/operations
        proxy_send_timeout 600s;
    }

    # Serve uploaded images directly from the filesystem
    # This location block is crucial for correct image serving and caching.
    location /uploads/ {
        # Alias to the directory *containing* the 'users' subfolder.
        # Nginx user (www-data) needs read+execute permission here.
        alias /var/www/imagedrop/public/uploads/; # Ensure this path is correct!
        autoindex off;
        access_log off; # Optional: reduce log noise

        # Cache-Control headers to ensure freshness for uploaded content
        # These settings tell browsers and proxies to always revalidate.
        expires -1; # Equivalent to 'no-cache' for Nginx's expires directive
        add_header Cache-Control "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0";
        
        # Disable Nginx's own file descriptor/metadata cache for this location.
        # This helps Nginx pick up newly written files immediately.
        open_file_cache off; 
        
        # Disable sendfile for this location; can help with serving recently modified files
        sendfile off;

        # Security: Prevent execution of scripts in uploads folder
        location ~* \.(php|pl|py|jsp|asp|sh|cgi|exe|dll|htaccess)$ {
            deny all;
            return 403;
        }
        # Prevent MIME type sniffing
        add_header X-Content-Type-Options "nosniff";
    }

    # Efficiently serve Next.js static assets (versioned, can be cached aggressively)
    location /_next/static/ {
        proxy_cache_bypass $http_upgrade;
        proxy_pass http://localhost:3000/_next/static/;
        expires max;
        add_header Cache-Control "public";
    }

    # Optional: SSL with Certbot (see Step 11)
    # listen 443 ssl http2;
    # server_name your_domain.com www.your_domain.com;
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
**After saving the Nginx configuration, always test it and then reload Nginx:**
```bash
sudo nginx -t 
sudo systemctl reload nginx
# If reload doesn't resolve issues, a restart might be needed: sudo systemctl restart nginx
```

Enable the site (if not already done) and restart Nginx if it's the first time:
```bash
sudo ln -s /etc/nginx/sites-available/imagedrop /etc/nginx/sites-enabled/ # Only if not already linked
sudo systemctl restart nginx # Use restart if it's the first time or major changes
```

### 10. Configure Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx HTTP' # For port 80
# sudo ufw allow 'Nginx HTTPS' # If using SSL on port 443
sudo ufw enable
sudo ufw status
```

### 11. (Optional) Secure with SSL using Certbot

If you have a domain, enable HTTPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your_domain.com -d www.your_domain.com # Replace with your domain(s)
# Follow prompts (email, terms, redirect option - choose redirect to HTTPS)
sudo systemctl restart nginx # Certbot usually reloads Nginx, but restart for good measure
# Test renewal
sudo certbot renew --dry-run
```

### 12. Security Considerations Summary

*   **`JWT_SECRET_KEY`**: Must be strong and unique.
*   **`users.json` Passwords**: **PLAIN TEXT - INSECURE**. For demo/trusted use only.
*   **File Permissions**: Critical. Review Step 7 carefully. `node_user` needs write access to `users.json`, `server-settings.json`, `folder-shares.json`, and `public/uploads/...`. `www-data` needs read access to images in `public/uploads/...` and execute access on directories in the path. **Default ACLs (`setfacl -dR`) are vital.**
*   **Nginx Configuration**:
    *   `client_max_body_size` matches Next.js.
    *   `/uploads/` location serves images correctly, prevents script execution, and has appropriate caching headers (`open_file_cache off;`, `sendfile off;`, `Cache-Control`). **Always run `sudo nginx -t && sudo systemctl reload nginx` (or `restart`) after Nginx config changes.**
*   **Input Validation**: Server actions use Zod for input validation.
*   **HTTPS**: Use in production (Step 11).

### 13. Troubleshooting

*   **Login Fails:** Check `users.json` status (must be `approved`). Verify `JWT_SECRET_KEY`. Check `pm2 logs imagedrop`.
*   **Upload Fails / Images Not Displaying (Error: "The requested resource isn't a valid image for ... received text/html")**:
    *   This error strongly indicates Nginx is NOT serving the static image file from the `/uploads/` location. Instead, the request is being proxied to the Next.js application, which returns an HTML page (likely a 404 error from Next.js itself).
    *   **Primary Causes & Solutions:**
        1.  **Permissions for `www-data`**: This is the most common cause. The Nginx user (`www-data`) must have:
            *   Read (`r`) permission on the image file itself.
            *   Execute (`x`) permission on ALL parent directories leading to the image file (e.g., `public`, `uploads`, `users`, `<userId>`, `<folderName>`, `YYYY`, `MM`, `DD`).
            *   **Action**:
                *   If using ACLs (recommended): Ensure `sudo setfacl -dR -m u:www-data:rx public/uploads` was run correctly. This sets *default* permissions so newly created files/folders inherit `rx` for `www-data`.
                *   Verify permissions immediately after upload fails for `next/image` (even if direct URL works):
                    ```bash
                    # Replace with the actual path to your newly uploaded image
                    namei -l /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                    # Check ACLs if used:
                    getfacl /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                    getfacl /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/
                    # ...and so on for parent directories up to public/uploads
                    ```
                    Look for `r-x` for `www-data` on directories and `r--` on the file. If these are not immediately correct, the default ACLs (`setfacl -dR`) are not working as expected.
        2.  **Nginx Configuration Not Loaded**:
            *   **Action**: Always run `sudo nginx -t` to test your Nginx configuration for syntax errors. Then, `sudo systemctl reload nginx`. If issues persist, try `sudo systemctl restart nginx` as it's a more forceful way to apply changes.
        3.  **Incorrect Nginx `alias` Path**:
            *   Ensure the `alias /var/www/imagedrop/public/uploads/;` path in your Nginx config is exactly correct and points to the directory *containing* the `users` subdirectory. The trailing slash on the alias path is important.
        4.  **Nginx Caching Directives**: The directives `open_file_cache off;`, `sendfile off;`, and `add_header Cache-Control "no-cache, ...";` in the `/uploads/` block are designed to prevent Nginx from caching these files. Ensure they are present and correctly configured.
    *   **Check Nginx Logs**:
        *   `tail -f /var/log/nginx/imagedrop.error.log`
        *   `tail -f /var/log/nginx/imagedrop.access.log`
        *   If Nginx logs a 404 error for the direct image URL, it means Nginx itself cannot find or access the file (permission/path issue).
        *   If the access log shows the image URL request getting a 200 status but the browser still shows an error, or if the error log shows the request being handled by the Next.js proxy, it confirms Nginx isn't serving the static file.
    *   **Specific Case: Direct URL works, `next/image` fails initially**:
        *   If typing the image URL directly into the browser *immediately after upload* works, but `next/image` on the page shows the error, this could indicate that the Next.js server (when `next/image` attempts to optimize or fetch the image *itself*) is encountering the issue with Nginx not serving the new file correctly to *it*. The same Nginx caching/permission issues apply, but the "client" for Nginx in this internal request is your Next.js server process.
        *   Ensure the `node_user` (running PM2) also has network access to reach Nginx if it tries to fetch the image via its public URL (though typically `next/image` for local files might not do this, it's a consideration).
    *   **Body Size Limits:** Check Nginx `client_max_body_size` vs. Next.js `bodySizeLimit`.
    *   **PM2/Next.js Logs:** Check `pm2 logs imagedrop` for any application-level errors during upload.
*   **502 Bad Gateway:** Node.js app (PM2) might be crashed or not running. Check `pm2 status` and `pm2 logs imagedrop`.

### 14. Updating the Application

1.  `cd /var/www/imagedrop`
2.  `git pull origin main` (or your branch)
3.  `npm install` (if dependencies changed)
4.  `npm run build`
5.  `pm2 restart imagedrop`
6.  If Nginx config changed: `sudo nginx -t && sudo systemctl reload nginx` (or `restart` if significant changes).

### 15. Resetting Data (Development/Testing Only)

**WARNING: This deletes all users, settings, shares, and uploaded images.**

1.  `pm2 stop imagedrop`
2.  `cd /var/www/imagedrop`
3.  `sudo rm users.json server-settings.json folder-shares.json` (if they exist)
4.  `sudo rm -rf public/uploads/users/*` (deletes all user upload subdirectories)
5.  `pm2 start imagedrop`
    *   The next user to sign up will become the admin. Default settings will be applied.

Your ImageDrop application should now be running!

    