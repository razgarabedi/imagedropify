
# ImageDrop: Local Image Hosting & Sharing Platform

ImageDrop is a Next.js application designed for easy image uploading, folder organization, and sharing. It features local authentication and file storage (migrating to PostgreSQL), an administrator dashboard for user and site management, and a user approval workflow.

**NOTE:** This project uses PostgreSQL with Prisma for database management.

## Core Features

*   **Image Uploading:** Users can upload images (JPG, PNG, GIF, WebP).
*   **Folder Management:** Logged-in users can create folders to organize their images and upload directly to specific folders.
*   **Image Management:** Users can view, rename, and delete their own uploaded images.
*   **Folder Sharing:** Users can generate unique, shareable public links for their custom folders.
*   **Database-backed Authentication (PostgreSQL + Prisma):**
    *   User accounts are managed in a PostgreSQL database.
    *   Password hashing (bcrypt) is implemented.
    *   Sessions are managed using JWTs stored in HTTP-only cookies.
*   **User Approval Workflow:**
    1.  **First User is Admin:** The very first user account created in the database will be an administrator and automatically approved.
    2.  **Subsequent Signups:** All users signing up after the first admin will have their status set to `pending`.
    3.  **Pending Status:** Users with a `pending` status cannot log in until approved.
    4.  **Admin Approval:** An administrator must approve or reject pending accounts via the Admin Dashboard.
*   **Administrator Dashboard (`/admin/dashboard`):**
    *   **User Management:**
        *   View all users, their status, role, image count, and storage usage.
        *   Approve pending user registrations.
        *   Reject (ban) users.
        *   Unban users (sets status back to `pending` for re-approval).
        *   Delete users (this also deletes their uploaded images and folders from the filesystem).
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

1.  **Install PostgreSQL & Required Libraries:**
    *   Ensure you have PostgreSQL installed and running on your system. For Ubuntu:
        ```bash
        sudo apt update
        sudo apt install postgresql postgresql-contrib
        ```
    *   **Install OpenSSL 1.1 (Required by Prisma on some Ubuntu versions):**
        Prisma's query engine might require `libssl1.1`. If you encounter Prisma errors related to `libssl.so.1.1` not being found, install it.
        For Ubuntu 20.04 LTS (Focal) and older (check your Ubuntu version with `lsb_release -a`):
        ```bash
        sudo apt install libssl1.1
        ```
        For Ubuntu 22.04 LTS (Jammy) and newer, `libssl1.1` is not in the default repositories. You may need to install it manually or use a compatible Prisma query engine. One common way for Jammy:
        ```bash
        wget http://archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb
        sudo dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb
        rm libssl1.1_1.1.1f-1ubuntu2_amd64.deb
        ```
        **Note:** Always prefer packages from official repositories if available for your Ubuntu version. If `libssl1.1` causes issues on newer systems, you might need to explore Prisma's binaryTargets or ensure your system provides a compatible libssl (often libssl3 is present, but Prisma might specifically need 1.1).
    *   After installation, PostgreSQL service usually starts automatically. You can check its status:
        ```bash
        sudo systemctl status postgresql
        ```

2.  **Access PostgreSQL and Create Database & User:**
    *   Switch to the `postgres` Linux user to access the PostgreSQL prompt:
        ```bash
        sudo -i -u postgres
        psql
        ```
    *   Inside the `psql` prompt, create a new database (e.g., `imagedrop`):
        ```sql
        CREATE DATABASE imagedrop;
        ```
    *   Create a new user (e.g., `imagedrop_user`) with a secure password. **Replace `your_secure_password` with a strong password.**
        ```sql
        CREATE USER imagedrop_user WITH ENCRYPTED PASSWORD 'your_secure_password';
        ```
    *   Grant the new user all privileges on the new database:
        ```sql
        GRANT ALL PRIVILEGES ON DATABASE imagedrop TO imagedrop_user;
        ```
    *   **Grant `CREATEDB` permission (Needed for Prisma's shadow database during development):**
        ```sql
        ALTER USER imagedrop_user CREATEDB;
        ```
    *   (Optional but Recommended) Make the new user the owner of the database. This can also help with permissions.
        ```sql
        ALTER DATABASE imagedrop OWNER TO imagedrop_user;
        ```
    *   Exit `psql` prompt:
        ```sql
        \q
        ```
    *   Exit from the `postgres` user session:
        ```bash
        exit
        ```

3.  **Set `DATABASE_URL` Environment Variable:**
    *   Create a file named `.env.local` in the **root directory** of your project (the same directory as `package.json` and the `prisma` folder) if it doesn't already exist.
    *   Add or update the `DATABASE_URL` in `.env.local` with your PostgreSQL connection string.
        Format: `DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/YOUR_DATABASE_NAME?schema=public"`
        Example using the user and database created above (assuming PostgreSQL is running on localhost, port 5432):
        `DATABASE_URL="postgresql://imagedrop_user:your_secure_password@localhost:5432/imagedrop?schema=public"`
    *   **CRITICAL:** Ensure this `DATABASE_URL` is correctly set and saved *before* running Prisma migrations. The Prisma CLI needs this variable to connect to your database.

4.  **Run Prisma Migrations:**
    Apply the database schema defined in `prisma/schema.prisma`:
    ```bash
    npx prisma migrate dev --name init
    ```
    If you encounter an error like `P1012: Environment variable not found: DATABASE_URL`, it means Prisma could not find your `DATABASE_URL`. Double-check your `.env.local` file (its location in the project root and its content).
    If you encounter `P3014: Prisma Migrate could not create the shadow database`, ensure the database user has `CREATEDB` permission (see step 2).
    If you encounter errors related to `libssl.so.1.1` or similar, ensure OpenSSL 1.1 is installed (see step 1).

    If deploying to production, you would typically use:
    ```bash
    npx prisma migrate deploy
    ```
    These commands will create the necessary tables in your database.

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
*   **PostgreSQL Server** accessible to the application, set up as described in the "Database Setup" section above.
*   **OpenSSL 1.1 libraries** installed if required by Prisma (see "Database Setup" Step 1).

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

Add the following, **replacing placeholders with your actual values**:

```ini
# For Local Authentication (JWT Sessions) - REQUIRED
# Replace with a strong, unique secret key. Keep this private.
JWT_SECRET_KEY="your-super-secret-and-long-jwt-key-please-change-me"

# PostgreSQL Database Connection URL - REQUIRED
# Replace with your actual PostgreSQL connection string as configured in the Database Setup section.
DATABASE_URL="postgresql://imagedrop_user:your_secure_password@localhost:5432/imagedrop?schema=public"
```
**CRITICAL:**
*   The `JWT_SECRET_KEY` is vital for securing user sessions. Generate a long, random, unique string.
*   The `DATABASE_URL` must point to your configured PostgreSQL database. Ensure the user and password match what you created.

### 5. Build the Application & Run Database Migrations

```bash
cd /var/www/imagedrop

# Generate Prisma Client (should happen on npm install via postinstall, but good to ensure)
npx prisma generate

# Run Database Migrations (to create/update tables)
# For the first deployment or if schema changes are expected:
npx prisma migrate deploy
# If it's a very first setup and you need to create the initial migration (and dev database):
# npx prisma migrate dev --name initial_migration_name (then use 'deploy' for subsequent updates)

# Build the Next.js application
npm run build
```

### 6. Initial Admin User

*   **First Signup is Admin:** The **first user to sign up** after the application starts (and the database is empty) will automatically become an administrator with `approved` status.

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

# Create base uploads structure if it doesn't exist (application code also attempts this)
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
# These might already be permissive enough on standard Ubuntu setups.
sudo chmod o+x /var
sudo chmod o+x /var/www
sudo chmod o+x /var/www/imagedrop
sudo chmod o+x /var/www/imagedrop/public
# For public/uploads and its children, ACLs (or group permissions) should handle www-data's 'rx' access.

# Verify (example for ACL method):
# getfacl /var/www/imagedrop/public/uploads
# After an upload, check: getfacl /var/www/imagedrop/public/uploads/users/<some_user_id>/<some_folder>/.../<image.png>
# Ensure www-data has 'r-x' on directories and 'r--' on the image file.
```
**Important Notes on Permissions:**
*   Replace `node_user` with the actual username that will run the `pm2` process.
*   **ACLs are strongly recommended.** The `setfacl -dR -m u:www-data:rx public/uploads` command is critical for new files/folders to inherit correct permissions for Nginx.
*   The application code attempts to set permissions `0o755` for directories and `0o644` for files during creation. This acts as a fallback.
*   If issues persist, use `sudo -u www-data namei -l /var/www/imagedrop/public/uploads/users/<userId>/.../image.png` immediately after an upload to trace permissions for each component of the path for the `www-data` user.

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
        access_log off; # Reduce log noise for static assets

        # Aggressive cache-busting for newly uploaded files
        expires -1; # Equivalent to Cache-Control: no-cache
        add_header Cache-Control "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0";

        # Try to disable Nginx's own file caching mechanisms for this location
        open_file_cache off;
        sendfile off;

        # Only allow specific image types and deny others
        location ~* \.(jpg|jpeg|png|gif|webp)$ {
            try_files $uri $uri/ =404; # Serve the image or return 404 if not found
        }
        # Deny access to any other file types or directory listings in /uploads/
        location ~ ^/uploads/ { # More specific match to avoid conflicts if /uploads/ itself should be accessible for some reason (unlikely here)
             deny all;
             return 403; # Or 404 if you prefer to hide existence
        }
        add_header X-Content-Type-Options "nosniff"; # Security header
    }

    location /_next/static/ {
        proxy_cache_bypass $http_upgrade;
        proxy_pass http://localhost:3000/_next/static/;
        expires max; # Next.js static assets are hashed, so cache aggressively
        add_header Cache-Control "public";
    }

    # Optional: SSL with Certbot (see Step 11)
    # If using SSL, ensure your listen directive is for 443 ssl and SSL cert paths are set.
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
# sudo ufw allow 'Nginx HTTPS' # If using SSL on port 443 (after SSL setup)
sudo ufw enable
sudo ufw status
```

### 11. (Optional) Secure Nginx with SSL using Certbot

If you have a domain, enable HTTPS:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your_domain.com -d www.your_domain.com
# Certbot will modify your Nginx config for SSL and set up auto-renewal.
sudo systemctl restart nginx
sudo certbot renew --dry-run # Test renewal
```

### 12. Security Considerations Summary (Nginx)

*   **`DATABASE_URL`**: Ensure it's correctly set in `.env.local` and secured.
*   **`JWT_SECRET_KEY`**: Must be strong and unique in `.env.local`.
*   **File Permissions**: Critical for `public/uploads`. `node_user` needs write, `www-data` needs read/execute. **Default ACLs (`setfacl -dR`) are vital.**
*   **Nginx Configuration**: Review `/uploads/` location block for security (deny non-image files) and caching.
*   **Input Validation**: Server actions use Zod (already in place).
*   **HTTPS**: Use in production.
*   **Password Hashing**: Implemented with bcrypt.

### 13. Troubleshooting (Nginx)

*   **Login Fails / Database Connection Issues:**
    *   Verify `DATABASE_URL` in `/var/www/imagedrop/.env.local`.
    *   Check `pm2 logs imagedrop` for database connection errors.
    *   Ensure PostgreSQL is running and accessible (firewall, `pg_hba.conf`).
*   **Upload Fails / Images Not Displaying (Error: "The requested resource isn't a valid image ... received text/html")**:
    *   Indicates Nginx is NOT serving the static image from `/uploads/`. Request is proxied to Next.js, which returns HTML (likely 404).
    *   **Primary Causes & Solutions:**
        1.  **Permissions for `www-data`**: `www-data` must have read (`r`) on the image and execute (`x`) on ALL parent directories up to and including the image's directory.
            *   **Action**: Immediately after a failed upload, SSH into server.
                Identify exact image path, e.g., `/var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>`.
                Check effective permissions for `www-data` using `namei`:
                ```bash
                sudo -u www-data namei -l /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                ```
                This will show permissions for each component of the path from `www-data`'s perspective. Look for `Permission denied` or missing `r` (for files) / `x` (for directories).
                Check ACLs:
                ```bash
                getfacl /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                # ... and parent directories like /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/
                ```
                Ensure `user:www-data` has `r-x` on directories and `r--` on the file. **The default ACL `default:user:www-data:r-x` for parent directories (like `public/uploads/users/`) is key for new files/folders created by `node_user`.**
        2.  **Nginx Configuration Not Loaded/Correct**: Run `sudo nginx -t` and `sudo systemctl reload nginx` (or `restart`).
        3.  **Incorrect Nginx `alias` Path** in the `/uploads/` location block. It must be the absolute path on the server.
        4.  **Nginx Caching Directives**: Ensure `open_file_cache off; sendfile off;` and `Cache-Control` headers in `/uploads/` block are correctly set and Nginx reloaded.
    *   **Check Nginx Logs**: `tail -f /var/log/nginx/imagedrop.error.log` and `access.log`. Look for errors related to the specific image URL.
    *   **Body Size Limits:** Check Nginx `client_max_body_size` vs. Next.js `bodySizeLimit` in `next.config.ts`.
    *   **PM2/Next.js Logs:** `pm2 logs imagedrop`.
*   **502 Bad Gateway:** Node.js app (PM2) might be crashed or unresponsive. Check `pm2 status` and `pm2 logs imagedrop`. Verify it can connect to the database.

### 14. Updating the Application (Nginx)

1.  `cd /var/www/imagedrop`
2.  `git pull origin main` (or your branch)
3.  `npm install` (if dependencies changed)
4.  `npx prisma generate` (if `schema.prisma` changed or to be safe)
5.  `npx prisma migrate deploy` (if `schema.prisma` changed and new migrations exist)
6.  `npm run build`
7.  `pm2 restart imagedrop`
8.  If Nginx config changed: `sudo nginx -t && sudo systemctl reload nginx`.

---

## Deployment on Ubuntu with Apache & PM2

This guide outlines deploying ImageDrop on an Ubuntu server using Apache as a reverse proxy and PM2 as a process manager. Steps 1-5 and 7-8 (Prerequisites, Node/PM2, App Clone, Env Vars, Build & DB Migrations, File Permissions for `public/uploads`, PM2 Start) are largely similar to the Nginx setup. **Ensure PostgreSQL is set up as described in the "Database Setup" section and `DATABASE_URL` is configured in `.env.local`. Also ensure OpenSSL 1.1 is installed if needed by Prisma.**

**Follow Steps 1-5 from the Nginx section first, ensuring database setup and `DATABASE_URL` is correctly set in `.env.local`.** Then proceed with Apache-specific steps.

### 9. Install and Configure Apache

```bash
sudo apt update
sudo apt install -y apache2
```

Enable necessary Apache modules:
```bash
sudo a2enmod proxy proxy_http headers rewrite ssl expires
sudo systemctl restart apache2
```

Create an Apache VirtualHost configuration:
```bash
sudo nano /etc/apache2/sites-available/imagedrop.conf
```

Paste the following, replacing `your_domain.com`. `LimitRequestBody` should match or exceed Next.js `bodySizeLimit` (currently '10mb').

```apache
<VirtualHost *:80>
    ServerName your_domain.com
    # ServerAlias www.your_domain.com # Uncomment if using www

    ErrorLog ${APACHE_LOG_DIR}/imagedrop_error.log
    CustomLog ${APACHE_LOG_DIR}/imagedrop_access.log combined

    # Set to match or exceed Next.js bodySizeLimit (e.g., 10MB = 10485760 bytes)
    LimitRequestBody 10485760

    ProxyPreserveHost On
    ProxyRequests Off # Important for reverse proxy
    KeepAlive On

    # Required for Apache 2.4+
    <Proxy *>
        Require all granted
    </Proxy>

    # Serve static uploads directly
    Alias /uploads/ /var/www/imagedrop/public/uploads/
    <Directory /var/www/imagedrop/public/uploads/>
        Options FollowSymLinks
        AllowOverride None
        Require all denied # Deny direct listing or access to non-specified files

        # Only allow specific image types
        <FilesMatch "\.(?i:jpg|jpeg|png|gif|webp)$">
            Require all granted
        </FilesMatch>

        # Cache-busting headers for uploaded images
        Header set Cache-Control "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0"
        Header unset ETag # Optional: further ensure no conditional requests based on ETag
        FileETag None    # Optional: further ensure no conditional requests based on ETag

        # Security header
        Header set X-Content-Type-Options "nosniff"
    </Directory>

    # Proxy Next.js static assets (can be cached aggressively)
    ProxyPass /_next/static/ http://localhost:3000/_next/static/
    ProxyPassReverse /_next/static/ http://localhost:3000/_next/static/
    <Location /_next/static/>
        Header set Cache-Control "public, max-age=31536000, immutable"
    </Location>

    # Proxy all other requests to the Next.js app
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

Enable site and restart/reload Apache:
```bash
sudo a2ensite imagedrop.conf
sudo systemctl reload apache2 # Or sudo systemctl restart apache2
```
Test Apache config: `sudo apache2ctl configtest`

### 10. Configure Firewall (UFW) for Apache

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Apache Full' # For HTTP (port 80) and HTTPS (port 443)
# Or 'Apache' for HTTP only if not using SSL
sudo ufw enable
sudo ufw status
```

### 11. (Optional) Secure Apache with SSL using Certbot

If you have a domain:
```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d your_domain.com # Add -d www.your_domain.com if needed
# Certbot will modify your Apache config for SSL.
sudo systemctl restart apache2
sudo certbot renew --dry-run # Test renewal
```

### 12. Security Considerations Summary (Apache)

*   **`DATABASE_URL`**: Secure and correct in `.env.local`.
*   **`JWT_SECRET_KEY`**: Strong and unique in `.env.local`.
*   **File Permissions for `public/uploads`**: `node_user` needs write, Apache user (`www-data`) needs read/execute. **Default ACLs are vital.** (Follow Step 7 from Nginx section, replacing Nginx mentions with Apache/`www-data` where contextually appropriate for `www-data`'s needs).
*   **Apache Configuration**: Review `/uploads/` Alias and Directory block, especially `Require all denied` and `<FilesMatch>` for security.
*   **HTTPS**: Use in production.
*   **Password Hashing**: Implemented with bcrypt.

### 13. Troubleshooting (Apache)

*   **Login Fails / Database Issues:** Verify `DATABASE_URL`. Check `pm2 logs imagedrop`. Ensure PostgreSQL is running and accessible.
*   **Upload Fails / Images Not Displaying (Error: "The requested resource isn't a valid image ... received text/html")**:
    *   Indicates Apache is NOT serving the static image from `/uploads/`. Request is proxied to Next.js.
    *   **Primary Causes & Solutions (Similar to Nginx):**
        1.  **Permissions for `www-data`**: `www-data` must have read (`r`) on image, execute (`x`) on parent dirs.
            *   **Action**: Immediately after failed upload:
                ```bash
                sudo -u www-data namei -l /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                getfacl /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<YYYY>/<MM>/<DD>/<image.png>
                # And parent directories
                ```
                Ensure `www-data` has `r-x` on directories, `r--` on file. Default ACLs are key.
        2.  **Apache Configuration Not Loaded/Correct**: Run `sudo apache2ctl configtest` and `sudo systemctl reload apache2` (or `restart`).
        3.  **Incorrect Apache `Alias` or `<Directory>` Path/Configuration**.
        4.  **Apache Caching**: Ensure cache-busting headers are set in the `<Directory /var/www/imagedrop/public/uploads/>` block.
    *   **Check Apache Logs**: `/var/log/apache2/imagedrop_error.log` and `access.log`.
    *   **Body Size Limits:** Check Apache `LimitRequestBody` vs. Next.js `bodySizeLimit`.
    *   **PM2/Next.js Logs:** `pm2 logs imagedrop`.
*   **502/503 Errors:** Node.js app (PM2) might be crashed. Check `pm2 status` and `pm2 logs imagedrop`. Verify database connectivity.

### 14. Updating the Application (Apache)

1.  `cd /var/www/imagedrop`
2.  `git pull origin main`
3.  `npm install` (if dependencies changed)
4.  `npx prisma generate` (if `schema.prisma` changed)
5.  `npx prisma migrate deploy` (if `schema.prisma` changed)
6.  `npm run build`
7.  `pm2 restart imagedrop`
8.  If Apache config changed: `sudo apache2ctl configtest && sudo systemctl reload apache2`.

---

## Resetting Data (Development/Testing Only)

**WARNING: This deletes all users, settings, shares, and uploaded images from the DATABASE and filesystem.**

1.  **Stop Application:** `pm2 stop imagedrop`
2.  **Reset Database (using Prisma Studio or psql):**
    *   **Option A: Prisma Studio (Interactive)**
        ```bash
        npx prisma studio
        ```
        Then, in the Prisma Studio web interface, navigate to the `User`, `SiteSetting`, and `FolderShare` models and delete all records.
    *   **Option B: psql (Command Line)**
        Connect to your PostgreSQL database using `psql`:
        ```bash
        sudo -u postgres psql -d imagedrop
        # Or if you created a specific user: psql -U imagedrop_user -d imagedrop -W (it will prompt for password)
        ```
        Then run the following SQL commands:
        ```sql
        DELETE FROM "FolderShare";
        DELETE FROM "SiteSetting";
        DELETE FROM "User";
        -- To reset auto-incrementing IDs if necessary (optional, Prisma handles UUIDs fine without this for User/FolderShare)
        -- For SiteSetting if it uses an auto-incrementing ID and you want it to start from 1 again:
        -- ALTER SEQUENCE "SiteSetting_id_seq" RESTART WITH 1; 
        ```
        Exit `psql` with `\q`.
    *   **Option C: Full Reset (Drop Tables & Re-migrate - Use with caution)**
        If you want a complete reset of the schema and data:
        ```bash
        # First, drop existing tables (example, adjust if your tables differ due to migration history)
        # sudo -u postgres psql -d imagedrop -c "DROP TABLE IF EXISTS \"_prisma_migrations\", \"FolderShare\", \"SiteSetting\", \"User\" CASCADE;"
        # Then, re-apply migrations to recreate the schema:
        npx prisma migrate reset --force # This drops DB, reapplies migrations, and runs seed (if any)
        # OR if you want to control it more:
        # npx prisma db push --force-reset # This will reset your database and re-apply the schema
        # npx prisma migrate deploy # To ensure migration history is also up-to-date if using 'reset'
        ```

3.  **Clear Uploaded Files:**
    Navigate to your application directory:
    ```bash
    cd /var/www/imagedrop
    ```
    Delete all user upload subdirectories and their contents:
    ```bash
    sudo rm -rf public/uploads/users/*
    ```
    Ensure the `public/uploads/users` directory itself still exists (create if not):
    ```bash
    sudo mkdir -p public/uploads/users
    sudo chown node_user:node_user public/uploads/users # Replace node_user with your PM2 user
    # Re-apply default ACLs if you are using them
    # sudo setfacl -dR -m u:node_user:rwx public/uploads
    # sudo setfacl -dR -m u:www-data:rx public/uploads
    ```

4.  **Restart Application:** `pm2 start imagedrop`
    *   The next user to sign up will become the admin. Default site settings will be applied by the application if the `SiteSetting` table is empty (the application logic handles seeding this).

Your ImageDrop application should now be running with your chosen web server and a fresh PostgreSQL database!

    