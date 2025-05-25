
# ImageDrop: Local Image Hosting & Sharing Platform

ImageDrop is a Next.js application designed for easy image uploading, folder organization, and sharing. It features local authentication and file storage, an administrator dashboard for user and site management, and a user approval workflow.

**NOTE:** This project is currently undergoing a migration from JSON file-based storage to PostgreSQL with Prisma. The Prisma schema is defined, but service layers still need to be updated to use the database.

## Core Features

*   **Image Uploading:** Users can upload images (JPG, PNG, GIF, WebP).
*   **Folder Management:** Logged-in users can create folders to organize their images and upload directly to specific folders.
*   **Image Management:** Users can view, rename, and delete their own uploaded images.
*   **Folder Sharing:** Users can generate unique, shareable public links for their custom folders.
*   **Local Authentication (soon to be Database-backed):**
    *   User accounts will be managed in a PostgreSQL database.
    *   **Security Transition:** Password hashing (e.g., bcrypt) will be implemented as part of the database migration.
    *   Sessions are managed using JWTs stored in HTTP-only cookies.
*   **User Approval Workflow:**
    1.  **First User is Admin:** The very first user account created (in the database) will be an administrator and approved.
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
    *   **Site Settings:**
        *   Configure the global maximum image upload size (MB).
        *   Set a custom URL for the homepage image displayed to logged-out users.
        *   Enable or disable new user registrations site-wide (first admin signup is always allowed).
*   **Responsive Design:** UI adapts to different screen sizes.
*   **Dark/Light Theme:** User-selectable theme.

## Database Setup (PostgreSQL with Prisma)

This application uses PostgreSQL as its database and Prisma as its ORM.

1.  **Install PostgreSQL:** Ensure you have PostgreSQL installed and running on your system or have access to a cloud-hosted instance.
2.  **Create Database & User:** Create a database (e.g., `imagedrop`) and a user with privileges to access it.
3.  **Set `DATABASE_URL`:**
    *   Copy the `.env.local.example` (if it exists) to `.env.local` or create `.env.local`.
    *   Update the `DATABASE_URL` environment variable in your `.env.local` file with your PostgreSQL connection string.
        Format: `DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/YOUR_DATABASE_NAME?schema=public"`
        Example for local setup: `DATABASE_URL="postgresql://postgres:mysecretpassword@localhost:5432/imagedrop?schema=public"`
4.  **Run Migrations:**
    Apply the database schema:
    ```bash
    npx prisma migrate dev --name init
    ```
    This command will create the necessary tables in your database based on `prisma/schema.prisma`.
5.  **Generate Prisma Client:**
    The Prisma Client is usually generated automatically after migrations or when installing packages (due to the `postinstall` script `prisma generate`). If needed, you can run it manually:
    ```bash
    npx prisma generate
    ```

## Deployment Options

You can choose to deploy ImageDrop using either Nginx or Apache as your web server. Both will use PM2 to manage the Next.js application process.

---

## Deployment on Ubuntu with Nginx & PM2

This guide outlines deploying ImageDrop on an Ubuntu server (e.g., 20.04, 22.04 LTS) using Nginx as a reverse proxy and PM2 as a process manager.

### 1. Prerequisites

*   Ubuntu Server with root or sudo access.
*   Node.js (v18.x or later) and npm installed.
*   Git installed.
*   Domain name pointed to your server's IP (recommended for production).
*   **PostgreSQL Server** accessible to the application (either local or remote).

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

Add the following, **replacing placeholders**:

```ini
# For Local Authentication (JWT Sessions) - REQUIRED
# Replace with a strong, unique secret key. Keep this private.
JWT_SECRET_KEY="your-super-secret-and-long-jwt-key-please-change-me"

# PostgreSQL Database Connection URL - REQUIRED
# Replace with your actual PostgreSQL connection string
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE_NAME?schema=public"
```
**CRITICAL:**
*   The `JWT_SECRET_KEY` is vital for securing user sessions. Generate a long, random, unique string.
*   The `DATABASE_URL` must point to your configured PostgreSQL database.

### 5. Build the Application & Run Migrations

```bash
cd /var/www/imagedrop

# Generate Prisma Client (should happen on npm install via postinstall, but good to ensure)
npx prisma generate

# Run Database Migrations (to create tables if they don't exist)
npx prisma migrate deploy # Use 'deploy' for production, 'dev' for development

# Build the Next.js application
npm run build
```

### 6. Initial Admin User & Data Files (Legacy - to be fully replaced by DB)

*   **First Signup is Admin:** The **first user to sign up** after the application starts (and the database is empty) will automatically become an administrator with `approved` status.
*   **Data Files:** The application will no longer use `users.json`, `server-settings.json`, and `folder-shares.json`. Data is in PostgreSQL.

### 7. Set File Ownership and Permissions (Focus on `public/uploads`)

**CRITICAL:** Correct permissions are essential for security and operation.
Assume your Node.js application (run by PM2) will execute as your current deployment user (e.g., `ubuntu`). Let's call this the `node_user`. Nginx typically runs as `www-data`.

```bash
cd /var/www/imagedrop

# 1. Node User owns all project files initially
# Replace 'node_user' with the actual username that will run PM2
sudo chown -R node_user:node_user /var/www/imagedrop

# 2. Set secure base permissions for the project directory
sudo chmod 750 /var/www/imagedrop # Owner: rwx, Group: rx, Others: ---

# 3. Permissions for `public/uploads` directory
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

# 4. Nginx traversal permissions for parent directories
# Nginx (www-data) needs execute (x) permission to traverse the path to served files.
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
*   Replace `node_user` with the actual username that will run the `pm2` process.
*   **ACLs are strongly recommended.** The `setfacl -dR -m u:www-data:rx public/uploads` command is critical.
*   The application code attempts to set permissions `0o755` for directories and `0o644` for files during creation. This can act as a fallback.
*   If issues persist, use `namei -l /var/www/imagedrop/public/uploads/users/<userId>/.../image.png` immediately after an upload to trace permissions for each component of the path.

### 8. Start Application with PM2

Run PM2 **as the `node_user`** you designated for file ownership.

```bash
cd /var/www/imagedrop

# Start the app
pm2 start npm --name "imagedrop" -- run start

# Optional: Configure PM2 to start on server reboot
pm2 startup systemd
# Follow the command output by pm2 startup
# Example: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u node_user --hp /home/node_user
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

Paste the following, replacing `your_domain.com`. Ensure `client_max_body_size` matches or exceeds the Next.js `bodySizeLimit` (currently '10mb').

```nginx
server {
    listen 80;
    server_name your_domain.com www.your_domain.com; # Or server_IP_address

    access_log /var/log/nginx/imagedrop.access.log;
    error_log /var/log/nginx/imagedrop.error.log;

    client_max_body_size 10M; # Must be >= Next.js app bodySizeLimit.

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
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    location /uploads/ {
        alias /var/www/imagedrop/public/uploads/; # Ensure this path is correct!
        autoindex off;
        access_log off;

        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0";
        open_file_cache off;
        sendfile off;

        location ~* \.(jpg|jpeg|png|gif|webp)$ {
            try_files $uri $uri/ =404;
        }
        location ~ ^/uploads/ {
            deny all;
            return 403;
        }
        add_header X-Content-Type-Options "nosniff";
    }

    location /_next/static/ {
        proxy_cache_bypass $http_upgrade;
        proxy_pass http://localhost:3000/_next/static/;
        expires max;
        add_header Cache-Control "public";
    }

    # Optional: SSL with Certbot (see Step 11)
}
```
**After saving, test and reload Nginx:**
```bash
sudo nginx -t
sudo systemctl reload nginx
# If reload doesn't resolve issues, a restart might be needed: sudo systemctl restart nginx
```

Enable the site and restart Nginx if it's the first time:
```bash
sudo ln -s /etc/nginx/sites-available/imagedrop /etc/nginx/sites-enabled/ # If not already linked
sudo systemctl restart nginx
```

### 10. Configure Firewall (UFW) for Nginx

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx HTTP' # For port 80
# sudo ufw allow 'Nginx HTTPS' # If using SSL on port 443
sudo ufw enable
sudo ufw status
```

### 11. (Optional) Secure Nginx with SSL using Certbot

If you have a domain, enable HTTPS:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your_domain.com -d www.your_domain.com
sudo systemctl restart nginx
sudo certbot renew --dry-run
```

### 12. Security Considerations Summary (Nginx)

*   **`DATABASE_URL`**: Ensure it's correctly set and secured.
*   **`JWT_SECRET_KEY`**: Must be strong and unique.
*   **File Permissions**: Critical for `public/uploads`. `node_user` needs write, `www-data` needs read/execute. **Default ACLs (`setfacl -dR`) are vital.**
*   **Nginx Configuration**: Review `/uploads/` location block for security and caching.
*   **Input Validation**: Server actions should use Zod (already in place).
*   **HTTPS**: Use in production.
*   **Password Hashing**: Will be implemented as part of the database migration.

### 13. Troubleshooting (Nginx)

*   **Login Fails / Database Connection Issues:** Verify `DATABASE_URL`. Check `pm2 logs imagedrop` for database errors. Ensure PostgreSQL is running and accessible.
*   **Upload Fails / Images Not Displaying (Error: "The requested resource isn't a valid image ... received text/html")**:
    *   Indicates Nginx is NOT serving the static image from `/uploads/`. Request is proxied to Next.js, which returns HTML (likely 404).
    *   **Primary Causes & Solutions:**
        1.  **Permissions for `www-data`**: `www-data` must have read (`r`) on the image and execute (`x`) on ALL parent directories.
            *   **Action**: Immediately after a failed upload, SSH into server.
                Identify exact image path.
                Check effective permissions for `www-data`:
                ```bash
                sudo -u www-data namei -l /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                ```
                Check ACLs:
                ```bash
                getfacl /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                # ... and parent directories
                ```
                Ensure `user:www-data` has `r-x` on directories and `r--` on the file. Default ACL `default:user:www-data:r-x` is key.
        2.  **Nginx Configuration Not Loaded/Correct**: Run `sudo nginx -t` and `sudo systemctl reload nginx` (or `restart`).
        3.  **Incorrect Nginx `alias` Path**.
        4.  **Nginx Caching Directives**: Ensure `open_file_cache off; sendfile off;` and `Cache-Control` headers in `/uploads/` block are correct.
    *   **Check Nginx Logs**: `tail -f /var/log/nginx/imagedrop.error.log` and `access.log`.
    *   **Body Size Limits:** Check Nginx `client_max_body_size` vs. Next.js `bodySizeLimit`.
    *   **PM2/Next.js Logs:** `pm2 logs imagedrop`.
*   **502 Bad Gateway:** Node.js app (PM2) might be crashed. Check `pm2 status` and `pm2 logs imagedrop`.

### 14. Updating the Application (Nginx)

1.  `cd /var/www/imagedrop`
2.  `git pull origin main`
3.  `npm install` (if dependencies changed)
4.  `npx prisma generate` (if schema changed)
5.  `npx prisma migrate deploy` (if schema changed)
6.  `npm run build`
7.  `pm2 restart imagedrop`
8.  If Nginx config changed: `sudo nginx -t && sudo systemctl reload nginx`.

---

## Deployment on Ubuntu with Apache & PM2

This guide outlines deploying ImageDrop on an Ubuntu server using Apache as a reverse proxy and PM2 as a process manager. Steps 1-5 and 7-8 (Prerequisites, Node/PM2, App Clone, Env Vars, Build & Migrations, File Permissions for `public/uploads`, PM2 Start) are largely similar to the Nginx setup. **Ensure PostgreSQL is set up and `DATABASE_URL` is configured.**

**Follow Steps 1-5 from the Nginx section first, ensuring database setup.** Then proceed with Apache-specific steps.

### 9. Install and Configure Apache

```bash
sudo apt update
sudo apt install -y apache2
```

Enable necessary Apache modules:
```bash
sudo a2enmod proxy proxy_http headers rewrite ssl
sudo systemctl restart apache2
```

Create an Apache VirtualHost configuration:
```bash
sudo nano /etc/apache2/sites-available/imagedrop.conf
```

Paste the following, replacing `your_domain.com`. `LimitRequestBody` should match Next.js `bodySizeLimit`.

```apache
<VirtualHost *:80>
    ServerName your_domain.com
    # ServerAlias www.your_domain.com

    ErrorLog ${APACHE_LOG_DIR}/imagedrop_error.log
    CustomLog ${APACHE_LOG_DIR}/imagedrop_access.log combined

    LimitRequestBody 10485760 # 10MB

    ProxyPreserveHost On
    ProxyRequests Off
    KeepAlive On

    <Proxy *>
        Require all granted
    </Proxy>

    Alias /uploads/ /var/www/imagedrop/public/uploads/
    <Directory /var/www/imagedrop/public/uploads/>
        Options FollowSymLinks
        AllowOverride None
        Require all denied
        <FilesMatch "\.(?i:jpg|jpeg|png|gif|webp)$">
            Require all granted
        </FilesMatch>
        Header set Cache-Control "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0"
        Header set X-Content-Type-Options "nosniff"
    </Directory>

    ProxyPass /_next/static/ http://localhost:3000/_next/static/
    ProxyPassReverse /_next/static/ http://localhost:3000/_next/static/
    <Location /_next/static/>
        Header set Cache-Control "public, max-age=31536000, immutable"
    </Location>

    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

Enable site and restart Apache:
```bash
sudo a2ensite imagedrop.conf
sudo systemctl reload apache2 # Or restart
```
Test Apache config: `sudo apache2ctl configtest`

### 10. Configure Firewall (UFW) for Apache

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Apache Full' # Or 'Apache' for HTTP only
sudo ufw enable
sudo ufw status
```

### 11. (Optional) Secure Apache with SSL using Certbot

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d your_domain.com
sudo systemctl restart apache2
sudo certbot renew --dry-run
```

### 12. Security Considerations Summary (Apache)

*   **`DATABASE_URL`**: Secure and correct.
*   **`JWT_SECRET_KEY`**: Strong and unique.
*   **File Permissions for `public/uploads`**: `node_user` needs write, Apache user (`www-data`) needs read/execute. **Default ACLs are vital.**
*   **Apache Configuration**: Review `/uploads/` Alias and Directory block.
*   **HTTPS**: Use in production.
*   **Password Hashing**: To be implemented.

### 13. Troubleshooting (Apache)

*   **Login Fails / Database Issues:** Verify `DATABASE_URL`. Check `pm2 logs imagedrop`.
*   **Upload Fails / Images Not Displaying (Error: "received text/html")**:
    *   Indicates Apache is NOT serving the static image from `/uploads/`. Request is proxied to Next.js.
    *   **Primary Causes & Solutions (Similar to Nginx):**
        1.  **Permissions for `www-data`**: `www-data` needs read (`r`) on image, execute (`x`) on parent dirs.
            *   **Action**: Immediately after failed upload:
                ```bash
                sudo -u www-data namei -l /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                getfacl /path/to/image.png # And parent dirs
                ```
        2.  **Apache Configuration Not Loaded/Correct**: Run `sudo apache2ctl configtest` and `sudo systemctl reload apache2` (or `restart`).
        3.  **Incorrect Apache `Alias` or `<Directory>` Block**.
    *   **Check Apache Logs**: `/var/log/apache2/imagedrop_error.log` and `access.log`.
    *   **Body Size Limits:** Check Apache `LimitRequestBody` vs. Next.js `bodySizeLimit`.
    *   **PM2/Next.js Logs:** `pm2 logs imagedrop`.
*   **502/503 Errors:** Node.js app (PM2) might be crashed. Check `pm2 status`.

### 14. Updating the Application (Apache)

1.  `cd /var/www/imagedrop`
2.  `git pull origin main`
3.  `npm install`
4.  `npx prisma generate`
5.  `npx prisma migrate deploy`
6.  `npm run build`
7.  `pm2 restart imagedrop`
8.  If Apache config changed: `sudo apache2ctl configtest && sudo systemctl reload apache2`.

---

## Resetting Data (Development/Testing Only)

**WARNING: This deletes all users, settings, shares, and uploaded images.**

1.  **Stop Application:** `pm2 stop imagedrop`
2.  **Reset Database (using Prisma Studio or psql):**
    *   Open Prisma Studio: `npx prisma studio` (then delete records from User, SiteSetting, FolderShare tables).
    *   Or connect to PostgreSQL (`psql -U YOUR_USER -d YOUR_DATABASE_NAME`) and run:
        ```sql
        DELETE FROM "FolderShare";
        DELETE FROM "SiteSetting";
        DELETE FROM "User"; 
        -- If "SiteSetting" might not exist, you might need to re-insert the default or handle it in app logic
        -- For a full reset, you might drop tables and re-migrate:
        -- DROP TABLE IF EXISTS "_prisma_migrations", "FolderShare", "SiteSetting", "User" CASCADE;
        -- Then run: npx prisma migrate deploy
        ```
3.  **Clear Uploaded Files:**
    `cd /var/www/imagedrop` (or your application directory)
    `sudo rm -rf public/uploads/users/*` (deletes all user upload subdirectories)
4.  **Restart Application:** `pm2 start imagedrop`
    *   The next user to sign up will become the admin. Default site settings will be applied if the `SiteSetting` table is empty (application logic will need to handle seeding this).

Your ImageDrop application should now be running with your chosen web server and PostgreSQL database!

