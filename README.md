
# ImageDrop: Local Image Hosting & Sharing Platform

ImageDrop is a Next.js application designed for easy image uploading, folder organization, and sharing. It features local authentication and file storage, with user and image metadata managed in a PostgreSQL database using Prisma. It includes an administrator dashboard for user and site management, and a user approval workflow.

**NOTE:** This project uses PostgreSQL with Prisma for database management.

## Core Features

*   **Image Uploading:** Users can upload images (JPG, PNG, GIF, WebP) to specific folders or a default "Uploads" folder. Image metadata is stored in PostgreSQL.
*   **Folder Management:** Logged-in users can create folders to organize their images.
*   **Image Management:** Users can view, rename, and delete their own uploaded images.
*   **Folder Sharing:** Users can generate unique, shareable public links for their custom folders. Share metadata is stored in PostgreSQL.
*   **Database-backed Authentication (PostgreSQL + Prisma):**
    *   User accounts are managed in a PostgreSQL database.
    *   Password hashing (bcrypt) is implemented.
    *   Sessions are managed using JWTs stored in HTTP-only cookies.
*   **User Approval Workflow:**
    1.  **First User is Admin:** The very first user account created in the database will be an administrator and automatically approved.
    2.  **Subsequent Signups:** All users signing up after the first admin will have their status set to `Pending`.
    3.  **Pending Status:** Users with a `Pending` status cannot log in until approved.
    4.  **Admin Approval:** An administrator must approve or reject pending accounts via the Admin Dashboard.
*   **Administrator Dashboard (`/admin/dashboard`):**
    *   **User Management:**
        *   View all users, their status, role, image count, and storage usage.
        *   Approve pending user registrations.
        *   Reject (ban) users.
        *   Unban users (sets status back to `Pending` for re-approval).
        *   Delete users (this also deletes their uploaded images from the filesystem and image metadata from the database).
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
    *   Ensure you have PostgreSQL installed and running on your system.
        *   For Ubuntu:
            ```bash
            sudo apt update
            sudo apt install postgresql postgresql-contrib
            ```
        *   For CentOS (e.g., CentOS 7/8/Stream):
            ```bash
            sudo yum install postgresql-server postgresql-contrib # Or dnf for newer CentOS/RHEL
            sudo postgresql-setup initdb # Or: sudo /usr/pgsql-X/bin/postgresql-X-setup initdb (X is version)
            sudo systemctl enable postgresql
            sudo systemctl start postgresql
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
        For CentOS, typically OpenSSL is provided by the system. If Prisma specifically requires `libssl.so.1.1` and it's not present, you might need to compile/install it from source or find a compatible package, which can be complex. Usually, Prisma's engines for RHEL/CentOS work with system OpenSSL.
    *   After installation, PostgreSQL service usually starts automatically on Ubuntu. On CentOS, ensure it's started and enabled. You can check its status:
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

## Deployment on Ubuntu/CentOS with Nginx & PM2

This guide outlines deploying ImageDrop on a Linux server (e.g., Ubuntu, CentOS) using Nginx as a reverse proxy and PM2 as a process manager.

### 1. Prerequisites

*   Linux Server (Ubuntu/CentOS) with root or sudo access.
*   Node.js (v18.x or later) and npm installed.
*   Git installed.
*   Domain name pointed to your server's IP (recommended for production).
*   **PostgreSQL Server** accessible to the application, set up as described in the "Database Setup" section above.
*   **OpenSSL 1.1 libraries** installed if required by Prisma (see "Database Setup" Step 1, mainly for Ubuntu).

### 2. Install Node.js, npm, and PM2

```bash
# Update package list (Ubuntu)
sudo apt update
# Or for CentOS:
# sudo yum update -y

# Install curl (if not already installed)
sudo apt install -y curl # Ubuntu
# sudo yum install -y curl # CentOS

# Add NodeSource repository for Node.js 20.x (or your preferred LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs # Ubuntu
# For CentOS:
# curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
# sudo yum install -y nodejs

# Verify Node.js and npm
node -v
npm -v

# Install PM2 globally
sudo npm install pm2 -g
pm2 --version
```

### 2.b. Create a Deployment User (Optional but Recommended)

It's best practice to run your Node.js application under a dedicated, non-root user for security. Let's call this user `node_user`.

*   **For Ubuntu:**
    ```bash
    sudo adduser node_user
    # Optionally, add to sudo group if this user needs to perform admin tasks (be cautious)
    sudo usermod -aG sudo node_user
    # Switch to the new user for subsequent steps:
    # su - node_user
    ```

*   **For CentOS:**
    ```bash
    sudo adduser node_user
    sudo passwd node_user # You'll be prompted to set a password
    # Optionally, add to wheel group for sudo privileges (be cautious)
    sudo usermod -aG wheel node_user
    # Switch to the new user for subsequent steps:
    # su - node_user
    ```
**From this point on, commands for installing dependencies, building the app, and managing PM2 should ideally be run as this `node_user`. If you use `sudo` for any of these, ensure file ownership is corrected afterwards.** We'll refer to this user as `your_deployment_user` or `node_user`.

### 3. Clone Application & Install Dependencies

**Ensure you are running commands as your `node_user` if you created one.** If you are `root`, you will need to `chown` files later.

```bash
# Create application directory (adjust path if needed)
sudo mkdir -p /var/www/imagedrop
# Change ownership to your deployment user (e.g., 'node_user', 'ubuntu', 'centos').
# THIS USER WILL RUN THE PM2 PROCESS.
sudo chown node_user:node_user /var/www/imagedrop # Assuming you created 'node_user'

# If you are not already the node_user, switch now:
# su - node_user
# cd /var/www/imagedrop

# If you are already node_user and in the correct directory:
cd /var/www/imagedrop

# Clone your repository
git clone <your_repository_url> .
# Or, if you've copied files manually, ensure they are in /var/www/imagedrop

# Install dependencies (run as node_user)
npm install
```
If `npm install` was run as `root` for some reason, ensure `node_user` owns `node_modules`:
`sudo chown -R node_user:node_user /var/www/imagedrop`

### 4. Configure Environment Variables

Create a `.env.local` file in the root of your project (`/var/www/imagedrop/.env.local`):
**Ensure `node_user` can read this file.**

```bash
# As node_user:
nano .env.local # Or vi, or your preferred editor
```

Add the following, **replacing placeholders with your actual values**:

```ini
# For Local Authentication (JWT Sessions) - REQUIRED
# Replace with a strong, unique secret key. Keep this private.
JWT_SECRET_KEY="your-super-secret-and-long-jwt-key-please-change-me"

# PostgreSQL Database Connection URL - REQUIRED
# Replace with your actual PostgreSQL connection string as configured in the Database Setup section.
DATABASE_URL="postgresql://imagedrop_user:your_secure_password@localhost:5432/imagedrop?schema=public"

# Port for the Next.js application (PM2 will run it on this port)
# Default is 3000 if not set. Nginx will proxy to this port.
# PORT=3000
```
**CRITICAL:**
*   The `JWT_SECRET_KEY` is vital for securing user sessions. Generate a long, random, unique string.
*   The `DATABASE_URL` must point to your configured PostgreSQL database. Ensure the user and password match what you created.
*   The `PORT` variable (if set) must match the port Nginx proxies to (e.g., `http://localhost:3000`).

### 5. Build the Application & Run Database Migrations

```bash
# As node_user:
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
If the build was run as `root`, ensure `node_user` owns the `.next` directory:
`sudo chown -R node_user:node_user /var/www/imagedrop/.next`

### 6. Initial Admin User

*   **First Signup is Admin:** The **first user to sign up** after the application starts (and the database is empty) will automatically become an administrator with `Approved` status.

### 7. Set File Ownership and Permissions (Focus on `public/uploads`)

**CRITICAL:** Correct permissions are essential for security and operation.
The Node.js application (run by PM2) **MUST** execute as your designated non-root deployment user (`node_user`). Nginx typically runs as `www-data` (Ubuntu) or `nginx` (CentOS). **Replace `www-data` with `nginx` if you are on CentOS in the commands below.**

```bash
# These commands are typically run as root or with sudo.
# Ensure 'node_user' is the user you created and will run PM2.

cd /var/www/imagedrop

# 1. Node User owns all project files.
sudo chown -R node_user:node_user /var/www/imagedrop

# 2. Set secure base permissions for the project directory
sudo chmod 750 /var/www/imagedrop # Owner: rwx, Group: rx, Others: ---
# (If 'node_user' is not in the same group as 'www-data' or 'nginx', and you're not using ACLs for this level,
# you might need 'sudo chmod 755 /var/www/imagedrop' to allow 'other' execute.)

# 3. Permissions for `public/uploads` directory
#    - `node_user` (running PM2) needs `rwx` to create `users/<userId>/<folderName>/` and write images.
#    - Nginx user (`www-data` or `nginx`) needs `rx` to traverse directories and `r` to read image files.

# Ensure the base 'public/uploads/users' structure exists
sudo mkdir -p public/uploads/users
# Node user owns the uploads structure
sudo chown -R node_user:node_user public/uploads

# **Recommended Method: Using ACLs (Access Control Lists)**
# Install ACLs if not present:
# sudo apt install acl # Ubuntu
# sudo yum install acl # CentOS

# Give Node User rwx, and Nginx user (www-data/nginx) rx to 'public/uploads' and everything created within it.
# The -R flag applies recursively to existing files/dirs.
# The -dR flag sets default ACLs for NEW files/dirs created within public/uploads. THIS IS CRUCIAL.
# Replace 'www-data' with 'nginx' if on CentOS
sudo setfacl -R -m u:node_user:rwx public/uploads
sudo setfacl -R -m u:www-data:rx public/uploads # Replace www-data with nginx if on CentOS
sudo setfacl -dR -m u:node_user:rwx public/uploads
sudo setfacl -dR -m u:www-data:rx public/uploads # Replace www-data with nginx if on CentOS

# 4. Nginx traversal permissions for parent directories
# Nginx user (`www-data` or `nginx`) needs execute (x) permission to traverse the path to served files.
# These might already be permissive enough on standard setups.
sudo chmod o+x /var         # Common, usually okay
sudo chmod o+x /var/www     # Common, usually okay
# For /var/www/imagedrop and /var/www/imagedrop/public, ensure group or other 'x' is set,
# or that www-data/nginx is in node_user's group (if not using ACLs for this level).
# With ACLs, the specific setfacl for www-data:rx on public/uploads handles deeper traversal for Nginx.
# If not using ACLs extensively for the project root:
# sudo chmod g+x /var/www/imagedrop # If Nginx user is in the same group as node_user
# sudo chmod o+x /var/www/imagedrop # Or, if Nginx user is 'other'

# Verify (example for ACL method, replace www-data with nginx if on CentOS):
# getfacl /var/www/imagedrop/public/uploads
# After an upload, check: getfacl /var/www/imagedrop/public/uploads/users/<some_user_id>/<some_folder>/<image.png>
# Ensure Nginx user (www-data/nginx) has 'r-x' on directories and 'r--' on the image file.
```
**Important Notes on Permissions & Ownership:**
*   Ensure `node_user` is the actual username that will run the `pm2` process.
*   Replace `www-data` with `nginx` in `setfacl` commands if you are on CentOS.
*   **ACLs are strongly recommended.** The `setfacl -dR -m u:www-data:rx public/uploads` (or `nginx` user) command is critical for new files/folders to inherit correct permissions for Nginx.
*   The application code attempts to set permissions `0o755` for directories and `0o644` for files during creation. This acts as a fallback if ACLs are not perfectly set up but **will not override ownership**.
*   If issues persist, use `sudo -u www-data namei -l /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<image.png>` (or `nginx` user) immediately after an upload to trace permissions.

### 8. Start Application with PM2

**CRITICAL: Run PM2 commands as the `node_user` you designated for file ownership. DO NOT run `pm2 start` as `root`.**
If `pm2 list` (run as `node_user`) does not show your app, or if `sudo pm2 list` shows it running as `root`, you have started PM2 incorrectly.

**WARNING:** If newly created files in `public/uploads/users/` are owned by `root:root` (check with `ls -l`), it means your PM2 process **IS RUNNING AS `root`**. This is a security risk and the primary cause of permission issues for the web server.
To fix this:
1.  Stop and delete the PM2 process started as root: `sudo pm2 stop imagedrop && sudo pm2 delete imagedrop && sudo pm2 save`
2.  Switch to your `node_user`: `su - node_user`
3.  Then follow the steps below correctly.

```bash
# First, ensure you are the node_user
# su - node_user
# (Or ensure your current shell session is as node_user)

cd /var/www/imagedrop

# Start the app AS NODE_USER
pm2 start npm --name "imagedrop" -- run start

# Optional: Configure PM2 to start on server reboot (generates a command you run with sudo)
pm2 startup systemd
# This will output a command like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u node_user --hp /home/node_user
# ^^ COPY AND RUN THE COMMAND PM2 GIVES YOU. Ensure the -u flag specifies your node_user.
pm2 save # Save current process list AS NODE_USER

# Check status & logs (as node_user)
pm2 list
pm2 logs imagedrop
```
The app will run on `http://localhost:3000` by default (or the port set in `PORT` env var).

### 9. Install and Configure Nginx

```bash
sudo apt install -y nginx # Ubuntu
# sudo yum install -y nginx # CentOS
# On CentOS, you might need to enable the EPEL repository first if Nginx isn't in default repos.
# sudo yum install epel-release
# sudo yum install nginx

# Create Nginx config (path may vary slightly on CentOS, often /etc/nginx/conf.d/imagedrop.conf)
sudo nano /etc/nginx/sites-available/imagedrop # Ubuntu
# sudo nano /etc/nginx/conf.d/imagedrop.conf # CentOS (example, create if not exist)
```

Paste the following, replacing `your_domain.com` and `http://localhost:3000` if your Next.js app runs on a different port. Ensure `client_max_body_size` matches or exceeds the Next.js `bodySizeLimit` (currently '10mb').

```nginx
server {
    listen 80;
    server_name your_domain.com www.your_domain.com; # Or server_IP_address

    access_log /var/log/nginx/imagedrop.access.log;
    error_log /var/log/nginx/imagedrop.error_log;

    client_max_body_size 10M; # Must be >= Next.js app bodySizeLimit.

    # Serve Next.js static assets (hashed, so can be cached aggressively)
    location /_next/static/ {
        proxy_cache_bypass $http_upgrade;
        proxy_pass http://localhost:3000/_next/static/; # Adjust port if your Next.js app runs elsewhere
        expires max;
        add_header Cache-Control "public";
    }

    # Serve uploaded static images directly
    # This regex location specifically targets image files within any subdirectory of /uploads/
    location ~ ^/uploads/.*\.(jpg|jpeg|png|gif|webp)$ {
        # 'root' specifies the directory from which files will be served.
        # For a request like /uploads/users/userid/image.jpg, Nginx combines root + $uri.
        # So, root should point to the directory *containing* the 'uploads' folder.
        root /var/www/imagedrop/public; # Nginx will look for $document_root$uri
                                        # e.g., /var/www/imagedrop/public/uploads/users/userid/image.jpg
                                        # Ensure this path correctly points to your project's public directory.

        try_files $uri =404; # If the file exists at $document_root$uri, serve it.
                             # Otherwise, Nginx itself returns a 404. This is crucial to prevent
                             # fall-through to the Next.js proxy for missing images in /uploads/.

        access_log off; # Reduce log noise for these static assets
        expires -1; # Equivalent to Cache-Control: no-cache for newly uploaded files
        add_header Cache-Control "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0";
        open_file_cache off; # Attempt to disable Nginx's own file caching
        sendfile off; # Can help with serving very recently modified files
        add_header X-Content-Type-Options "nosniff"; # Security header
    }

    # Deny access to any other paths or non-image files attempted to be accessed within /uploads/
    # This location block will be matched if the more specific image regex above does not.
    # e.g., requests for /uploads/some_folder/ or /uploads/file.txt
    location /uploads/ {
        deny all;
        return 403; # Or 404 if you prefer to hide existence
    }

    # Main proxy to Next.js app for all other requests (including /_next/image for optimization)
    location / {
        proxy_pass http://localhost:3000; # Adjust port if your Next.js app runs elsewhere
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
# For Ubuntu:
sudo ln -s /etc/nginx/sites-available/imagedrop /etc/nginx/sites-enabled/ # If not already linked
# For CentOS, if using conf.d, linking is usually not needed.
sudo systemctl restart nginx
# If Nginx fails to start, check logs: journalctl -xeu nginx or /var/log/nginx/error.log
```

### 10. Configure Firewall (UFW for Ubuntu, firewalld for CentOS)

*   **For Ubuntu (UFW):**
    ```bash
    sudo ufw allow OpenSSH
    sudo ufw allow 'Nginx HTTP' # For port 80
    # sudo ufw allow 'Nginx HTTPS' # If using SSL on port 443 (after SSL setup)
    sudo ufw enable
    sudo ufw status
    ```
*   **For CentOS (firewalld):**
    ```bash
    sudo firewall-cmd --permanent --add-service=ssh
    sudo firewall-cmd --permanent --add-service=http # For port 80
    # sudo firewall-cmd --permanent --add-service=https # If using SSL on port 443
    sudo firewall-cmd --reload
    sudo firewall-cmd --list-all
    ```

### 10.b. (Ubuntu Specific) Check AppArmor

AppArmor is a security module on Ubuntu. Default Nginx/Apache profiles usually don't cause issues with serving files from `/var/www` or proxying to `localhost`. However, if you have custom or hardened AppArmor profiles, they could be a factor in permission-like issues.

*   **Check AppArmor Status:**
    ```bash
    sudo aa-status
    ```
    This will show if AppArmor is active and list loaded profiles.
*   **Check for Denials:** AppArmor denials are typically logged in `dmesg`, `/var/log/kern.log`, or `/var/log/syslog`.
    ```bash
    sudo dmesg | grep -i apparmor
    sudo grep -i apparmor /var/log/syslog
    ```
    If you see denials related to Nginx (`usr.sbin.nginx`) or Apache (`usr.sbin.apache2`) accessing files in `/var/www/imagedrop/public/uploads/` or connecting to `localhost:3000`, you may need to adjust the AppArmor profile for your web server. Modifying AppArmor profiles is an advanced topic; consult the Ubuntu AppArmor documentation. For most standard setups, this step is usually not needed.

### 11. (Optional) Secure Nginx with SSL using Certbot

If you have a domain, enable HTTPS:
*   **For Ubuntu:**
    ```bash
    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d your_domain.com -d www.your_domain.com
    ```
*   **For CentOS:**
    ```bash
    sudo yum install certbot python3-certbot-nginx # Or python2-certbot-nginx on older CentOS
    sudo certbot --nginx -d your_domain.com -d www.your_domain.com
    ```
Certbot will modify your Nginx config for SSL and set up auto-renewal.
```bash
sudo systemctl restart nginx # Or reload
sudo certbot renew --dry-run # Test renewal
```

### 12. (CentOS Specific) SELinux Configuration for Nginx

If SELinux is enabled on CentOS (check with `sestatus`), you might need to allow Nginx to make network connections to proxy to your Next.js app (port 3000) and access files in `/var/www/imagedrop`.

*   **Allow Nginx to connect to network (for proxying to Next.js on port 3000):**
    This is critical if Nginx is blocked from connecting to `localhost:3000`.
    Run: `sudo setsebool -P httpd_can_network_connect 1`
*   **Set correct SELinux context for web content (if needed):**
    If Nginx has trouble accessing files in `/var/www/imagedrop` even with correct file permissions, you might need to set the SELinux context:
    ```bash
    # For general web content readable by Nginx
    sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/imagedrop(/.*)?"
    sudo restorecon -Rv /var/www/imagedrop

    # Specifically for `public/uploads` if Nginx needs to read files written by another process (your Node app)
    # httpd_sys_rw_content_t might be needed if Nginx itself were to write, but for reading, httpd_sys_content_t
    # combined with correct file permissions should be okay.
    # However, if files are created by a different context (your Node app), ensuring httpd_t can read them is key.
    # Often, setting the correct file permissions (via chown/chmod and ACLs) is enough.
    # If SELinux still blocks, you might need a more specific policy or to adjust contexts
    # of the files created by the Node.js process. For now, focus on httpd_can_network_connect
    # and standard file permissions/ACLs.
    ```
    **Note:** `semanage` might require `policycoreutils-python-utils` or `policycoreutils-python` package.
    ```bash
    sudo yum install policycoreutils-python-utils # Or policycoreutils-python
    ```
*   **Check Audit Log for Denials:**
    If issues persist, check the SELinux audit log for denials:
    ```bash
    sudo ausearch -m avc -ts recent
    # or for a summary of what might be needed:
    # sudo cat /var/log/audit/audit.log | audit2allow -m local_nginx_policy
    ```
    This can help identify specific permissions Nginx is being denied by SELinux. For example, if you see `denied { name_connect } for ... dest=3000`, it means Nginx is blocked from connecting to port 3000. `sudo setsebool -P httpd_can_network_connect 1` should fix this. If you see `denied { read } on file ...`, it's a file access issue that might need `restorecon` or context adjustments if basic permissions and ACLs are correct.

### 13. Security Considerations Summary (Nginx)

*   **`DATABASE_URL`**: Ensure it's correctly set in `.env.local` and secured.
*   **`JWT_SECRET_KEY`**: Must be strong and unique in `.env.local`.
*   **PM2 User**: Run PM2 as a non-root `node_user`. **Verify new files in `public/uploads` are NOT owned by `root:root`.**
*   **File Ownership**: `node_user` should own all application files and `public/uploads`.
*   **File Permissions**: Critical for `public/uploads`. `node_user` needs write, Nginx user (`www-data` or `nginx`) needs read/execute. **Default ACLs (`setfacl -dR`) are vital.**
*   **Nginx Configuration**: Review `/uploads/` location blocks for security (deny non-image files) and caching. Ensure the `root` or `alias` path is correct and `try_files` is used to prevent fall-through to Next.js for static assets.
*   **Input Validation**: Server actions use Zod (already in place).
*   **HTTPS**: Use in production.
*   **Password Hashing**: Implemented with bcrypt.
*   **SELinux (CentOS)**: Configure appropriately if enabled, especially `httpd_can_network_connect`.

### 14. Troubleshooting (Nginx)

*   **Login Fails / Database Connection Issues:**
    *   Verify `DATABASE_URL` in `/var/www/imagedrop/.env.local`.
    *   Check `pm2 logs imagedrop` (as `node_user`) for database connection errors.
    *   Ensure PostgreSQL is running and accessible (firewall, `pg_hba.conf`).
    *   On CentOS, check SELinux logs (`ausearch -m avc -ts recent`) if Node.js can't connect to DB, or if Nginx can't connect to Node.js app on port 3000 (`httpd_can_network_connect`).
*   **Upload Fails / Images Not Displaying (Error: "The requested resource isn't a valid image ... received text/html")**:
    *   Indicates Nginx is NOT serving the static image from `/uploads/`. The request is being proxied to Next.js, which returns HTML (likely a 404 or error page because Next.js doesn't handle `/uploads/...` paths directly).
    *   **Primary Causes & Solutions:**
        1.  **PM2 Process Running as `root`**: If `ls -l` shows new files in `public/uploads/users/...` are owned by `root:root`, it means your PM2 process is running as `root`. This is incorrect and the most likely cause if file permissions seem to reset or be wrong for Nginx. **You MUST ensure PM2 is started and managed by your designated non-root `node_user` (see Step 8).** Correct the PM2 setup and then fix ownership of existing `public/uploads` (see Step 7).
        2.  **Ownership/Permissions for Nginx User (`www-data` or `nginx`)**: Nginx user must have read (`r`) on the image and execute (`x`) on ALL parent directories up to and including the image's directory.
            *   **CRITICAL DIAGNOSTIC**: Immediately after an upload fails for `next/image` (when the PM2 logs show the "received text/html" error, and before restarting PM2): SSH into your server.
                Identify the exact path of the newly uploaded image, e.g., `/var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<image.png>`.
                Check effective permissions for the Nginx user (replace `www-data` with `nginx` if on CentOS):
                ```bash
                sudo -u www-data namei -l /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<image.png>
                ```
                This command traces permissions for each component of the path *from the Nginx user's perspective*. Look for any `Permission denied` messages or missing `r` (for files) / `x` (for directories). If this fails, ACLs are not set or not effective.
                Also verify ACLs:
                ```bash
                getfacl /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<image.png>
                # ... and for parent directories like /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/
                ```
                Ensure `user:www-data` (or `user:nginx`) has `r-x` on directories and `r--` on the file. The **default ACL `default:user:www-data:r-x` (or `nginx`) for parent directories is key for new files/folders created by `node_user`.**
        3.  **Nginx Configuration Not Loaded/Correct**: Run `sudo nginx -t` and `sudo systemctl reload nginx` (or `restart`). Ensure there are no typos in your `root` or `alias` path in the image serving location block. Verify that the specific image location block (e.g., `location ~ ^/uploads/.*\.(jpg|jpeg|png|gif|webp)$`) is correctly defined and ordered, and that its `try_files $uri =404;` directive is preventing requests from falling through to the main Next.js proxy.
        4.  **Incorrect Nginx `root` or `alias` Path** in the image serving location block.
        5.  **Nginx Caching Directives**: Ensure `open_file_cache off; sendfile off;` and `Cache-Control` headers in the image serving block are correctly set and Nginx reloaded.
        6.  **SELinux (CentOS)**: If enabled, ensure it's not blocking Nginx from accessing the files (`httpd_sys_content_t`) or making network connections to the Next.js app (`httpd_can_network_connect`). Check `ausearch -m avc -ts recent`.
    *   **Check Nginx Logs**: `tail -f /var/log/nginx/imagedrop.error.log` and `access.log`. These logs are vital for seeing how Nginx handles the `/uploads/...` requests. Specifically, see if a 404 is logged by Nginx itself for the image URL, or if the request is logged as being passed to the `localhost:3000` upstream.
    *   **Body Size Limits:** Check Nginx `client_max_body_size` vs. Next.js `bodySizeLimit` in `next.config.ts`.
    *   **PM2/Next.js Logs:** `pm2 logs imagedrop` (run as `node_user`). These logs will show the "The requested resource isn't a valid image..." error if the internal diagnostic HEAD request (or `next/image`'s fetch) gets HTML back.
*   **502 Bad Gateway:** Node.js app (PM2) might be crashed or unresponsive. Check `pm2 status` and `pm2 logs imagedrop` (as `node_user`). Verify it can connect to the database. SELinux might also block Nginx proxying to port 3000 (see Step 12, ensure `httpd_can_network_connect` is `on`).

### 15. Updating the Application (Nginx)

1.  `cd /var/www/imagedrop` (as `node_user` or use `sudo -u node_user` for git/npm commands if needed)
2.  `git pull origin main` (or your branch)
3.  `npm install` (if dependencies changed)
4.  `npx prisma generate` (if `schema.prisma` changed or to be safe)
5.  `npx prisma migrate deploy` (if `schema.prisma` changed and new migrations exist)
6.  `npm run build`
7.  `pm2 restart imagedrop` (as `node_user`)
8.  If Nginx config changed: `sudo nginx -t && sudo systemctl reload nginx`.

---

## Deployment on Ubuntu/CentOS with Apache & PM2

This guide outlines deploying ImageDrop on a Linux server using Apache as a reverse proxy and PM2 as a process manager.
**Prerequisites (Steps 1 & 2.a from Nginx section):** Ensure Node.js, npm, PM2 are installed.
**Create Deployment User (Step 2.b from Nginx section):** Create `node_user`.
**Database Setup:** Ensure PostgreSQL is set up as described in the "Database Setup" section and `DATABASE_URL` is configured in `.env.local`.

**Follow Steps 1-6 from the Nginx section first (Prerequisites, Node/PM2, Create Deployment User, App Clone, Env Vars, Build & DB Migrations, Initial Admin User), ensuring database setup and `DATABASE_URL` is correctly set in `.env.local`. Then proceed with Apache-specific steps, paying close attention to running PM2 as your `node_user`.**

### 7. Set File Ownership and Permissions (Focus on `public/uploads`) for Apache

Follow Step 7 from the Nginx deployment section, but replace the Nginx user (`www-data` or `nginx`) with the Apache user.
*   On **Ubuntu**, Apache usually runs as `www-data` (same as Nginx).
*   On **CentOS**, Apache usually runs as `apache`.
    *   So for CentOS with Apache, ACL commands would be like (run with `sudo`):
        ```bash
        # Ensure 'node_user' is the user running PM2.
        # Ensure 'apache' is the user Apache runs as on CentOS.
        sudo setfacl -R -m u:node_user:rwx /var/www/imagedrop/public/uploads
        sudo setfacl -R -m u:apache:rx /var/www/imagedrop/public/uploads
        sudo setfacl -dR -m u:node_user:rwx /var/www/imagedrop/public/uploads
        sudo setfacl -dR -m u:apache:rx /var/www/imagedrop/public/uploads
        ```
    *   For Ubuntu with Apache, replace `apache` with `www-data` in the commands above.

### 8. Start Application with PM2 (for Apache)

**CRITICAL: Follow Step 8 from the Nginx deployment section exactly.** Ensure PM2 is run as your non-root `node_user`. **Verify new files in `public/uploads` are NOT owned by `root:root`.**

### 9. Install and Configure Apache

```bash
sudo apt update # Ubuntu
# sudo yum update -y # CentOS

sudo apt install -y apache2 # Ubuntu
# sudo yum install -y httpd # CentOS
```

Enable necessary Apache modules:
```bash
sudo a2enmod proxy proxy_http headers rewrite ssl expires proxy_wstunnel # Ubuntu (added proxy_wstunnel for websockets if needed)
# For CentOS, modules like proxy and proxy_http are often loaded by default.
# You might need to check /etc/httpd/conf.modules.d/ for loaded modules.
# `sudo apachectl -M` or `sudo httpd -M` can list loaded modules.
sudo systemctl restart apache2 # Ubuntu
# sudo systemctl enable httpd && sudo systemctl start httpd # CentOS
# sudo systemctl restart httpd # CentOS
```

Create an Apache VirtualHost configuration:
```bash
# Ubuntu:
sudo nano /etc/apache2/sites-available/imagedrop.conf
# CentOS:
# sudo nano /etc/httpd/conf.d/imagedrop.conf
```

Paste the following, replacing `your_domain.com` and `http://localhost:3000` if your Next.js app runs on a different port. `LimitRequestBody` should match or exceed Next.js `bodySizeLimit` (currently '10mb').

```apache
<VirtualHost *:80>
    ServerName your_domain.com
    # ServerAlias www.your_domain.com # Uncomment if using www

    ErrorLog ${APACHE_LOG_DIR}/imagedrop_error.log    # Ubuntu: /var/log/apache2/
    CustomLog ${APACHE_LOG_DIR}/imagedrop_access.log combined # Ubuntu
    # CentOS: ErrorLog /var/log/httpd/imagedrop_error_log
    # CentOS: CustomLog /var/log/httpd/imagedrop_access_log combined

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
    # CRITICAL: Ensure this path is correct and accessible by Apache user!
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
    ProxyPass /_next/static/ http://localhost:3000/_next/static/ # Adjust port if needed
    ProxyPassReverse /_next/static/ http://localhost:3000/_next/static/ # Adjust port if needed
    <Location /_next/static/>
        Header set Cache-Control "public, max-age=31536000, immutable"
    </Location>

    # Proxy all other requests to the Next.js app
    ProxyPass / http://localhost:3000/ # Adjust port if needed
    ProxyPassReverse / http://localhost:3000/ # Adjust port if needed
</VirtualHost>
```

Enable site and restart/reload Apache:
```bash
# Ubuntu:
sudo a2ensite imagedrop.conf
sudo systemctl reload apache2
# CentOS: Configuration in conf.d is usually automatically loaded.
# sudo systemctl reload httpd

# Test Apache config:
sudo apache2ctl configtest # Ubuntu
# sudo httpd -t # CentOS
```

### 10. Configure Firewall (UFW for Ubuntu, firewalld for CentOS)

*   **For Ubuntu (UFW):**
    ```bash
    sudo ufw allow OpenSSH
    sudo ufw allow 'Apache Full' # For HTTP (port 80) and HTTPS (port 443)
    sudo ufw enable
    sudo ufw status
    ```
*   **For CentOS (firewalld):**
    ```bash
    sudo firewall-cmd --permanent --add-service=ssh
    sudo firewall-cmd --permanent --add-service=http
    # sudo firewall-cmd --permanent --add-service=https # If using SSL
    sudo firewall-cmd --reload
    sudo firewall-cmd --list-all
    ```

### 10.b. (Ubuntu Specific) Check AppArmor

AppArmor is a security module on Ubuntu. Default Apache/Nginx profiles usually don't cause issues with serving files from `/var/www` or proxying to `localhost`. However, if you have custom or hardened AppArmor profiles, they could be a factor in permission-like issues.

*   **Check AppArmor Status:**
    ```bash
    sudo aa-status
    ```
    This will show if AppArmor is active and list loaded profiles.
*   **Check for Denials:** AppArmor denials are typically logged in `dmesg`, `/var/log/kern.log`, or `/var/log/syslog`.
    ```bash
    sudo dmesg | grep -i apparmor
    sudo grep -i apparmor /var/log/syslog
    ```
    If you see denials related to Apache (`usr.sbin.apache2`) accessing files in `/var/www/imagedrop/public/uploads/` or connecting to `localhost:3000`, you may need to adjust the AppArmor profile for your web server. Modifying AppArmor profiles is an advanced topic; consult the Ubuntu AppArmor documentation. For most standard setups, this step is usually not needed.

### 11. (Optional) Secure Apache with SSL using Certbot

If you have a domain:
*   **For Ubuntu:**
    ```bash
    sudo apt install -y certbot python3-certbot-apache
    sudo certbot --apache -d your_domain.com # Add -d www.your_domain.com if needed
    ```
*   **For CentOS:**
    ```bash
    sudo yum install certbot python3-certbot-apache # Or python2-certbot-apache
    sudo certbot --apache -d your_domain.com
    ```
Certbot will modify your Apache config for SSL.
```bash
sudo systemctl restart apache2 # Ubuntu
# sudo systemctl restart httpd # CentOS
sudo certbot renew --dry-run # Test renewal
```

### 12. (CentOS Specific) SELinux Configuration for Apache

If SELinux is enabled on CentOS (check with `sestatus`), similar to Nginx, you'll need to ensure Apache can proxy and access files.

*   **Allow Apache to connect to network (for proxying to Next.js on port 3000):**
    Run: `sudo setsebool -P httpd_can_network_connect 1`
*   **Set correct SELinux context for web content (if Apache has issues reading files):**
    ```bash
    # For general web content readable by Apache
    sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/imagedrop(/.*)?"
    sudo restorecon -Rv /var/www/imagedrop
    # Specifically for public/uploads if files are created by another context (Node.js app)
    # and Apache (httpd_t) needs to read them.
    # Ensuring httpd_sys_content_t or a similar readable context on the files is key.
    # If file permissions and ACLs are correct, this might not always be needed,
    # but 'restorecon' can help if contexts are mismatched.
    ```
    Install `policycoreutils-python-utils` if `semanage` is not found.
*   **Check Audit Log for Denials:**
    ```bash
    sudo ausearch -m avc -ts recent
    ```
    Look for denials related to `httpd_t` accessing port 3000 or files in `/var/www/imagedrop`.

### 13. Security Considerations Summary (Apache)

*   **`DATABASE_URL`**: Secure and correct in `.env.local`.
*   **`JWT_SECRET_KEY`**: Strong and unique in `.env.local`.
*   **PM2 User**: Run PM2 as a non-root `node_user`. **Verify new files in `public/uploads` are NOT owned by `root:root`.**
*   **File Ownership**: `node_user` should own application files and `public/uploads`.
*   **File Permissions for `public/uploads`**: `node_user` needs write, Apache user (`www-data` or `apache` on CentOS) needs read/execute. **Default ACLs are vital.** (Follow Step 7, adapting for Apache user).
*   **Apache Configuration**: Review `/uploads/` Alias and Directory block, especially `Require all denied` and `<FilesMatch>` for security. Ensure `Alias` path is correct.
*   **HTTPS**: Use in production.
*   **Password Hashing**: Implemented with bcrypt.
*   **SELinux (CentOS)**: Configure if enabled, especially `httpd_can_network_connect`.

### 14. Troubleshooting (Apache)

*   **Login Fails / Database Issues:** Verify `DATABASE_URL`. Check `pm2 logs imagedrop` (as `node_user`). Ensure PostgreSQL is running and accessible. Check SELinux.
*   **Upload Fails / Images Not Displaying (Error: "The requested resource isn't a valid image ... received text/html")**:
    *   Indicates Apache is NOT serving the static image from `/uploads/`. The request is being proxied to Next.js.
    *   **Primary Causes & Solutions (Similar to Nginx):**
        1.  **PM2 Process Running as `root`**: If `ls -l` shows new files in `public/uploads/users/...` are owned by `root:root`, it means your PM2 process is running as `root`. This is incorrect and the most likely cause if file permissions seem to reset or be wrong for Apache. **You MUST ensure PM2 is started and managed by your designated non-root `node_user` (see Step 8 of Nginx section).** Correct the PM2 setup and then fix ownership of existing `public/uploads`.
        2.  **Ownership/Permissions for Apache User (`www-data` or `apache`)**: Must have read (`r`) on image, execute (`x`) on parent dirs.
            *   **CRITICAL DIAGNOSTIC**: Immediately after an upload fails for `next/image` (when the PM2 logs show the "received text/html" error, and before restarting PM2): SSH into your server.
                Identify the exact path of the newly uploaded image, e.g., `/var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<image.png>`.
                Check effective permissions for the Apache user (replace `www-data` with `apache` if on CentOS):
                ```bash
                sudo -u www-data namei -l /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<image.png>
                ```
                This command traces permissions for each component of the path *from the Apache user's perspective*. Look for any `Permission denied` messages or missing `r` (for files) / `x` (for directories). If this fails, ACLs are not set or not effective.
                Also verify ACLs:
                ```bash
                getfacl /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/<image.png>
                # ... and for parent directories like /var/www/imagedrop/public/uploads/users/<userId>/<folderName>/
                ```
                Ensure `user:www-data` (or `user:apache`) has `r-x` on directories and `r--` on the file. The **default ACL `default:user:www-data:r-x` (or `apache`) for parent directories is key for new files/folders created by `node_user`.**
        3.  **Apache Configuration Not Loaded/Correct**: Run `sudo apache2ctl configtest` (Ubuntu) or `sudo httpd -t` (CentOS) and reload Apache. Ensure `mod_alias` and `mod_rewrite` (if used for other purposes) are enabled.
        4.  **Incorrect Apache `Alias` or `<Directory>` Path/Configuration**. The `Alias` path `/uploads/` should map to the correct filesystem path `/var/www/imagedrop/public/uploads/`. Ensure the `<FilesMatch>` within `<Directory>` is correctly allowing your image types.
        5.  **Apache Caching**: Ensure cache-busting headers are set as per the config.
        6.  **SELinux (CentOS)**: Check `ausearch -m avc -ts recent`. Ensure `httpd_sys_content_t` is on relevant directories and `httpd_can_network_connect` is `on`.
    *   **Check Apache Logs**: `/var/log/apache2/imagedrop_error.log` (Ubuntu) or `/var/log/httpd/imagedrop_error_log` (CentOS). These logs are vital.
    *   **Body Size Limits:** Check Apache `LimitRequestBody` vs. Next.js `bodySizeLimit`.
    *   **PM2/Next.js Logs:** `pm2 logs imagedrop` (run as `node_user`). These logs will show the "The requested resource isn't a valid image..." error if the internal diagnostic HEAD request (or `next/image`'s fetch) gets HTML back.
*   **502/503 Errors:** Node.js app (PM2) might be crashed. Check `pm2 status` and `pm2 logs imagedrop` (as `node_user`). Verify database connectivity. SELinux might block Apache proxying (check `httpd_can_network_connect`).

### 15. Updating the Application (Apache)

1.  `cd /var/www/imagedrop` (as `node_user`)
2.  `git pull origin main`
3.  `npm install` (if dependencies changed)
4.  `npx prisma generate` (if `schema.prisma` changed)
5.  `npx prisma migrate deploy` (if `schema.prisma` changed)
6.  `npm run build`
7.  `pm2 restart imagedrop` (as `node_user`)
8.  If Apache config changed: `sudo apache2ctl configtest && sudo systemctl reload apache2` (Ubuntu) or `sudo httpd -t && sudo systemctl reload httpd` (CentOS).

---

## Resetting Data (Development/Testing Only)

**WARNING: This deletes all users, settings, shares, and uploaded images from the DATABASE and filesystem.**

1.  **Stop Application:** `pm2 stop imagedrop` (as `node_user`)
2.  **Reset Database (using Prisma Studio or psql):**
    *   **Option A: Prisma Studio (Interactive)**
        ```bash
        # Run as node_user from /var/www/imagedrop
        npx prisma studio
        ```
        Then, in the Prisma Studio web interface, navigate to the `User`, `SiteSetting`, `Image`, and `FolderShare` models and delete all records.
    *   **Option B: psql (Command Line)**
        Connect to your PostgreSQL database using `psql`:
        ```bash
        sudo -u postgres psql -d imagedrop
        # Or if you created a specific user: psql -U imagedrop_user -d imagedrop -W (it will prompt for password)
        ```
        Then run the following SQL commands:
        ```sql
        DELETE FROM "Image";      -- Order matters due to foreign keys
        DELETE FROM "FolderShare";
        DELETE FROM "SiteSetting";
        DELETE FROM "User";
        -- To reset auto-incrementing IDs if necessary (optional, Prisma handles UUIDs fine without this for User/FolderShare/Image)
        -- For SiteSetting if it uses an auto-incrementing ID and you want it to start from 1 again:
        -- ALTER SEQUENCE "SiteSetting_id_seq" RESTART WITH 1;
        ```
        Exit `psql` with `\q`.
    *   **Option C: Full Reset (Drop Tables & Re-migrate - Use with caution)**
        If you want a complete reset of the schema and data:
        ```bash
        # Run as node_user from /var/www/imagedrop
        # This drops DB, reapplies migrations, and runs seed (if any)
        npx prisma migrate reset --force
        # OR if you want to control it more:
        # npx prisma db push --force-reset # This will reset your database and re-apply the schema
        # npx prisma migrate deploy # To ensure migration history is also up-to-date if using 'reset'
        ```

3.  **Clear Uploaded Files:**
    Navigate to your application directory:
    ```bash
    # As root or with sudo
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
    # Re-apply default ACLs if you are using them (replace www-data with nginx or apache user as appropriate)
    # sudo setfacl -dR -m u:node_user:rwx public/uploads/users
    # sudo setfacl -dR -m u:www-data:rx public/uploads/users # Or u:nginx:rx or u:apache:rx
    ```

4.  **Restart Application:** `pm2 start imagedrop` (as `node_user`)
    *   The next user to sign up will become the admin. Default site settings will be applied by the application if the `SiteSetting` table is empty (the application logic handles seeding this).

Your ImageDrop application should now be running with your chosen web server and a fresh PostgreSQL database!
Images stored in `public/uploads/users/[userId]/[folderName]/[filename.ext]`.
User data & image metadata in PostgreSQL.

