
# Firebase Studio - ImageDrop Application (with Local Authentication & Approval)

This is a Next.js application, ImageDrop, designed for easy image uploading and sharing. It uses **local authentication** (storing user data in a `users.json` file on the server - **INSECURE, FOR DEMO PURPOSES ONLY**) and stores images locally on the server. A **user approval workflow** and **user-specific upload limits** are implemented.

The application also includes an Administrator Dashboard for user management (approval, banning, deletion, setting limits) and site settings configuration.

To get started developing locally, take a look at `src/app/page.tsx`.

## User Approval Workflow

1.  **First User is Admin:** The very first user account created upon initial application startup is automatically designated as an **administrator** and their status is set to **approved**.
2.  **Subsequent Signups:** All users who sign up *after* the first admin user will have their status set to **pending**.
3.  **Pending Status:** Users with a 'pending' status can **not** log in. They will receive a message indicating their account needs administrator approval.
4.  **Admin Approval:** An administrator must log in, navigate to the Admin Dashboard (`/admin/dashboard`), and manually **approve** or **reject** pending user accounts.
5.  **Approved Status:** Once approved by an admin, the user can log in normally and upload images (subject to global and user-specific limits).
6.  **Rejected Status:** If rejected (or banned), the user remains unable to log in. Admins can later **unban** (set status back to pending) or **delete** the user.

## User-Specific Limits (Admin Configurable)

Administrators can set the following limits per user via the Admin Dashboard:

*   **Max Images:** The maximum number of images a user can upload. (Leave blank for unlimited).
*   **Max Single Upload Size (MB):** The maximum size (in MB) for a single image upload for this user. This overrides the global setting for this specific user. (Leave blank to use the global setting).
*   **Max Total Storage (MB):** The total storage space (in MB) the user's uploads can consume. (Leave blank for unlimited).

If a user-specific limit is not set (left blank in the admin panel), the application falls back to global settings (for single upload size) or imposes no limit (for max images and total storage).

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
# Create a dedicated user/group for the app (optional but recommended)
# sudo groupadd imagedrop_group
# sudo useradd -r -g imagedrop_group -d /var/www/imagedrop -s /sbin/nologin imagedrop_user
# Give your deployment user (e.g., 'ubuntu') temporary ownership for cloning
sudo chown $USER:$USER /var/www/imagedrop 
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

### Step 5.1: Admin User Setup & Management

*   **Initial Admin:** The **first user who signs up** for the application will automatically be designated as an **administrator** with `approved` status. This user can access the Admin Dashboard at `/admin/dashboard`.
*   **User Approval:** Subsequent users will have `pending` status upon signup. Admins must use the Admin Dashboard to **approve** or **reject** these pending accounts before they can log in.
*   **User Management:** Admins can use the dashboard to **approve**, **reject/ban**, **unban** (set back to pending), and **delete** users. Deleting a user also removes their uploaded images.
*   **User Limits:** Admins can set **per-user limits** for the maximum number of images, maximum single upload size (MB), and maximum total storage (MB) via the Admin Dashboard.
*   **Manual Admin Assignment (if needed):** If you need to change the admin user or manually assign admin rights (e.g., if the first admin account needs changing or `users.json` was populated manually):
    1.  Stop your application: `pm2 stop imagedrop`
    2.  Open `users.json` (`/var/www/imagedrop/users.json`): `nano users.json`
    3.  Find the user entry. It will look similar to this (password, status, and optional limits fields included):
        ```json
        {
          "id": "some-uuid-string",
          "email": "user@example.com",
          "role": "user",
          "status": "approved",
          "maxImages": null,
          "maxSingleUploadSizeMB": null,
          "maxTotalStorageMB": null,
          "password": "theirplaintextpassword"
        }
        ```
    4.  To make a user an admin, ensure `"role": "admin"` and `"status": "approved"`. To demote, set `"role": "user"`. Adjust limit fields as needed (`null` means no specific limit).
    5.  Save the file.
    6.  Restart your application: `pm2 restart imagedrop`

### Step 6: Build the Application

Build your Next.js application for production.

```bash
cd /var/www/imagedrop
npm run build
```

### Step 7: Set File Ownership and Permissions

**CRITICAL:** Proper file permissions are essential for security and functionality.

Assume:
*   Your application code resides in `/var/www/imagedrop`.
*   You run `pm2` as your regular user (e.g., `ubuntu`) or a dedicated application user (e.g., `imagedrop_user`). Let's call this the **Node User**.
*   Nginx runs as the `www-data` user (default on Ubuntu/Debian).

```bash
cd /var/www/imagedrop

# Ensure the Node User owns the project files. Replace 'node_user' with your actual user.
sudo chown -R node_user:node_user /var/www/imagedrop

# Set secure permissions for the base directory
sudo chmod 750 /var/www/imagedrop # Owner: rwx, Group: rx, Others: ---

# Specific permissions for writable files/directories:
# Node User needs to read/write these. Others should have no access.
# Consider adding Nginx user (www-data) to the Node User's group if necessary,
# but it shouldn't need write access to these files.
sudo touch users.json server-settings.json # Ensure files exist before setting perms
sudo chmod 660 users.json server-settings.json # Owner: rw, Group: rw, Others: ---
sudo chown node_user:node_user users.json server-settings.json

# Node User needs to create directories and files within 'public/uploads'.
# Nginx ('www-data') needs to read images and traverse directories.

# Ensure base structure exists for uploads
sudo mkdir -p public/uploads/users
# Ensure Node User owns 'public/uploads' and its subdirectories.
sudo chown -R node_user:node_user public/uploads

# **Permissions for `public/uploads` and its subdirectories:**
# This needs to allow:
# 1. Node.js process (owned by `node_user`): Create directories (e.g., `MM.YYYY`), write files (images). Requires `rwx`.
# 2. Nginx process (`www-data`): Read image files, traverse directories. Requires `rx`.

# Method 1: Using Group Permissions (Recommended)
# Create a group (if you haven't already, e.g., 'imagedrop_group') and add both node_user and www-data to it.
# Example:
# sudo groupadd imagedrop_app_group
# sudo usermod -a -G imagedrop_app_group node_user
# sudo usermod -a -G imagedrop_app_group www-data
# Then, set group ownership for the uploads directory:
# sudo chown -R node_user:imagedrop_app_group public/uploads
# Set permissions: Owner (node_user)=rwx, Group (imagedrop_app_group)=rwx, Others=---
# This allows both Node and Nginx (via group membership) to manage/read files.
# `setgid` on parent directories ensures new files/dirs inherit group.
# sudo chmod -R g+s public/uploads # Set a common group and make it sticky for new files/dirs.
# sudo chmod -R 770 public/uploads 

# Method 2: Using ACLs (Access Control Lists) - More granular
# Install ACLs if not present: sudo apt install acl
# Give Node User rwx, www-data rx to existing and future files/dirs in public/uploads
# sudo setfacl -R -m u:node_user:rwx public/uploads
# sudo setfacl -R -m u:www-data:rx public/uploads
# sudo setfacl -dR -m u:node_user:rwx public/uploads # Default for new items created by node_user
# sudo setfacl -dR -m u:www-data:rx public/uploads  # Default for new items (ensures www-data can read)

# Method 3: Simpler, relies on www-data being in node_user's primary group OR careful permission bits
# If `www-data` is in `node_user`'s primary group (less common by default)
# Or if `node_user` is `www-data` (not recommended for Node app)
# Then simpler chmod might work.
# sudo chmod -R u=rwx,g=rx,o=--- public/uploads # If www-data is in node_user's group
# Or, more open (if security is less critical for this specific path AND node_user runs the app):
# sudo chmod -R 750 public/uploads # Node user rwx, its group rx, others no access.
# Ensure www-data is part of node_user's group or this won't work for Nginx.

# **General advice for permissions on `public/uploads` and `public/uploads/users`:**
# - The `node_user` (running your Next.js app via PM2) needs `rwx` permissions to create user-specific subdirectories (e.g., `userId/MM.YYYY`) and write image files into them.
# - The `www-data` user (running Nginx) needs `rx` permissions to traverse these directories and `r` permission to read the actual image files to serve them.

# Example assuming `node_user` is the owner and `www-data` can access via group or ACLs (adjust based on your chosen method):
# For the base 'public/uploads' directory itself and 'public/uploads/users':
# Ensure `node_user` can create subdirs:
# sudo chmod u+rwx public/uploads
# sudo chmod u+rwx public/uploads/users
# Ensure `www-data` can traverse:
# For 'public/uploads': (if using ACLs, this is covered, if group, ensure group has 'x')
# sudo chmod g+x public/uploads
# For 'public/uploads/users':
# sudo chmod g+x public/uploads/users
# When node_user creates `userId` and `MM.YYYY` subdirectories, they should also allow `www-data` to `rx`.
# The `ensureUploadDirsExist` function in `imageActions.ts` creates these.
# The default umask or explicit `fs.chmod` in `ensureUploadDirsExist` (if added) would handle perms for newly created dirs.
# A common strategy is to ensure the Node.js process's umask allows group read/execute by default for new directories.

# Ensure Nginx can traverse parent directories:
sudo chmod 751 /var/www # Owner: rwx, Group: rx, Others: x (execute only)
sudo chmod 751 /var/www/imagedrop # Owner: rwx, Group: rx, Others: x
sudo chmod 750 public # Owner: rwx, Group: rx (if www-data in this group), Others: ---
# If www-data is not in the group owning 'public', then it needs 'x' for 'other':
# sudo chmod 751 public # Or use ACLs.

# Double-check final permissions after choosing and applying a method:
ls -ld /var/www /var/www/imagedrop /var/www/imagedrop/public /var/www/imagedrop/public/uploads /var/www/imagedrop/public/uploads/users
ls -l /var/www/imagedrop/users.json /var/www/imagedrop/server-settings.json
# If you created test user uploads, check permissions on those too:
# ls -ld /var/www/imagedrop/public/uploads/users/[test_user_id]
# ls -ld /var/www/imagedrop/public/uploads/users/[test_user_id]/[MM.YYYY]
# ls -l /var/www/imagedrop/public/uploads/users/[test_user_id]/[MM.YYYY]/[test_image.jpg]
```

**Explanation of Permission Methods:**

*   **Group Permissions (Method 1):** Create a shared group, add `node_user` and `www-data` to it. Give this group `rwx` on `public/uploads` and its children. Use `chmod g+s` on directories to ensure new files/folders inherit the group. This is clean but requires group setup.
*   **ACLs (Method 2):** Provides very fine-grained control without changing primary ownership or groups. `setfacl` allows specifying exact permissions for `node_user` (`rwx`) and `www-data` (`rx`) recursively and as defaults for new items. This is flexible and powerful.
*   **Simpler `chmod` (Method 3):** Relies on existing group memberships or wider permissions. Can be less secure or harder to get right unless `www-data` is already in `node_user`'s group.

**Recommendation:** **Method 2 (ACLs)** is often the most robust for web applications as it doesn't require altering system groups broadly and clearly defines who can do what. If ACLs are not preferred, **Method 1 (Group Permissions)** is a good alternative.

**After setting permissions, always restart Nginx and PM2:**
`sudo systemctl restart nginx`
`pm2 restart imagedrop`

### Step 8: Start Application with PM2

Start your Next.js application using PM2. **Run PM2 as the designated Node User**.

```bash
cd /var/www/imagedrop
# If running as a specific user (e.g., imagedrop_user), switch to that user first if needed
# sudo -u imagedrop_user pm2 start npm --name "imagedrop" -- run start
# OR if running as current user:
pm2 start npm --name "imagedrop" -- run start

# To ensure PM2 restarts on server reboot:
pm2 startup systemd
# Follow the instructions output by the command above (run the command it gives you with sudo)

# Save the current PM2 process list
pm2 save

# Check status & logs
pm2 list
pm2 logs imagedrop
```

By default, `next start` runs the application on port 3000.

### Step 9: Install and Configure Nginx

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
        # IMPORTANT: Ensure this alias path is correct and points to the directory *containing* the 'users' subfolder.
        # Nginx user (www-data) needs read permission on files and execute permission on directories in this path.
        alias /var/www/imagedrop/public/uploads/;
        autoindex off; # Disable directory listing
        access_log off; # Optional: reduce log noise for image requests

        # --- Caching Headers for Uploaded Files ---
        # For uploaded content, prioritize freshness to avoid serving stale content or 404s.
        # 'expires -1;' tells Nginx not to add its own Expires/Cache-Control headers that might conflict or cache too long.
        expires -1;
        # 'no-cache': Forces clients to revalidate with the server before using a cached copy.
        # 'no-store': Tells caches (browser and proxies) not to store a copy of the resource under any circumstances.
        # 'must-revalidate': Tells caches they must obey any freshness information you give them about a resource.
        # 'proxy-revalidate': Similar to must-revalidate, but for shared caches (proxies).
        # 'max-age=0': Tells browsers not to use the cached version without revalidating.
        add_header Cache-Control "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0";
        
        # Disable Nginx's own file descriptor/metadata cache for this location.
        # This helps ensure Nginx picks up newly written files immediately.
        open_file_cache off; 

        # Security: Deny execution of potentially harmful files
        location ~* \.(php|pl|py|jsp|asp|sh|cgi|exe|dll|htaccess)$ {
            deny all;
            return 403;
        }
        # Prevent browsers from interpreting files as something else (MIME type sniffing)
        add_header X-Content-Type-Options "nosniff";
    }

    # Serve Next.js static assets efficiently
    location /_next/static/ {
        proxy_cache_bypass $http_upgrade;
        proxy_pass http://localhost:3000/_next/static/;
        expires max; # These assets are versioned, so they can be cached aggressively
        add_header Cache-Control "public";
    }

    # Optional: SSL Configuration (Certbot example)
    # If using SSL (recommended for production):
    # listen 443 ssl http2;
    # server_name your_domain.com www.your_domain.com;
    # ssl_certificate /etc/letsencrypt/live/your_domain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/your_domain.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    #
    # # Redirect HTTP to HTTPS
    # if ($scheme != "https") {
    #     return 301 https://$host$request_uri;
    # }
    # ... (rest of the SSL config if needed) ...
}
```

Enable the Nginx site:

```bash
sudo ln -s /etc/nginx/sites-available/imagedrop /etc/nginx/sites-enabled/imagedrop
sudo nginx -t # Test configuration
sudo systemctl restart nginx
```

### Step 10: Configure Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx HTTP'
# If using SSL: sudo ufw allow 'Nginx HTTPS'
sudo ufw enable
sudo ufw status
```

### Step 11: (Optional) Secure Nginx with Certbot (Let's Encrypt SSL)

If you have a domain name, securing your site with HTTPS is highly recommended.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your_domain.com -d www.your_domain.com # Replace with your domain(s)
# Follow the prompts (provide email, agree to terms, choose redirect option).
# Certbot will automatically modify your Nginx config for SSL.
sudo systemctl restart nginx
# Test automatic renewal (optional)
sudo certbot renew --dry-run
```

### Security Considerations for Local Setup

*   **`JWT_SECRET_KEY`**: Critical. Use a strong, unique, randomly generated secret. Do not commit it.
*   **`users.json` (DEMO ONLY)**:
    *   **Plain text passwords are highly insecure.** Suitable only for non-sensitive demos. Use password hashing (e.g., bcrypt) in any real application.
    *   Includes user role, status, and limits.
    *   **Permissions:** Restrictive file permissions (`chmod 660` owned by Node User/Group). Nginx should NOT need access.
    *   Ensure it's in `.gitignore`.
*   **`server-settings.json`**: Contains site configuration.
    *   **Permissions:** Restrictive file permissions (`chmod 660` owned by Node User/Group). Nginx should NOT need access.
*   **File Uploads (`public/uploads`)**:
    *   **Path Traversal Prevention:** Handled within `imageActions.ts` using `path.resolve` and `startsWith` checks against the user's base directory.
    *   **File Type/Content Validation:** Basic MIME type checks in `imageActions.ts`. Consider more robust validation (e.g., magic bytes) if needed.
    *   **Filename Sanitization:** Handled in `imageActions.ts` to prevent potentially harmful characters and ensure uniqueness.
    *   **Nginx Configuration:**
        *   `alias` path must be correct.
        *   `client_max_body_size` in Nginx must match or exceed Next.js `bodySizeLimit`.
        *   Nginx `location` block should prevent script execution (`location ~* \.(php|...)$`).
        *   `add_header X-Content-Type-Options "nosniff"` prevents MIME type sniffing attacks.
        *   Caching headers for `/uploads/` are set to prioritize freshness (see Step 9).
    *   **File System Permissions:** Crucial. Node.js process owner needs write access to `public/uploads/users/`, `users.json`, `server-settings.json`. Nginx user (`www-data`) needs read access to serve images and execute access on directories in the path. See **Step 7** for detailed permission setup.
*   **Session Management**: Uses JWTs in HTTP-only cookies. Use HTTPS in production to protect tokens in transit. Ensure `JWT_SECRET_KEY` is strong.
*   **Admin Dashboard**: Access restricted by `admin` role check in middleware/actions. Ensure admin accounts are protected by strong passwords.
*   **User Approval Workflow**: Security relies on admins correctly vetting pending users.
*   **Input Validation:** Use Zod schemas for form data and action inputs (as implemented in actions) to prevent invalid or malicious data.
*   **Rate Limiting:** Consider adding rate limiting (e.g., using Nginx or middleware) to prevent brute-force login attempts or excessive uploads.
*   **Dependencies:** Keep dependencies updated (`npm audit`, `npm update`).

### Troubleshooting

*   **Login Fails:** Check user `status` in `users.json` or Admin Dashboard (must be `approved`). Verify password. Check JWT secret consistency between `.env.local` and running process. Check `pm2 logs imagedrop`.
*   **Upload Fails:**
    *   Check file size against global (`server-settings.json`) and user limits (Admin Dashboard).
    *   **Check directory permissions:** Does the Node User (running PM2) have write access to `/var/www/imagedrop/public/uploads/users/`? Can it create subdirectories (`MM.YYYY`)? Use `ls -l` and `namei -l /path/to/check` to verify permissions along the path. Refer to **Step 7**.
    *   Check Nginx `client_max_body_size` and Next.js `experimental.serverActions.bodySizeLimit` in `next.config.ts`.
    *   Check `pm2 logs imagedrop` for server-side errors.
    *   Check Nginx error logs (`/var/log/nginx/imagedrop.error.log`).
*   **Images Not Displaying (404/403/Invalid Image Error):**
    *   **Check Nginx `location /uploads/` alias path:** Is it correct in `/etc/nginx/sites-available/imagedrop`?
    *   **Check file/directory permissions for Nginx:** Does the `www-data` user have read permission on the image file itself AND execute permission on ALL directories in the path (`/var`, `/var/www`, `/var/www/imagedrop`, `/var/www/imagedrop/public`, `/var/www/imagedrop/public/uploads`, `/var/www/imagedrop/public/uploads/users`, `/var/www/imagedrop/public/uploads/users/[userId]`, `/var/www/imagedrop/public/uploads/users/[userId]/[MM.YYYY]`)? Use `ls -ld /path/to/dir` and `namei -l /path/to/image.jpg`. Refer to **Step 7**.
    *   Check Nginx access/error logs (`/var/log/nginx/imagedrop.access.log`, `/var/log/nginx/imagedrop.error.log`). Look for "Permission denied" errors.
    *   Ensure files actually exist on the server at the expected path (`/var/www/imagedrop/public/uploads/users/...`).
    *   **Nginx Caching Issue (especially for new uploads):** If images appear after `pm2 restart imagedrop` or `sudo systemctl restart nginx` but not immediately after upload, the Nginx caching settings for `/uploads/` are critical. Ensure `open_file_cache off;`, `expires -1;` and `add_header Cache-Control "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0";` are present in the `/uploads/` location block (see Step 9). Restart Nginx (`sudo systemctl restart nginx`) after any Nginx config changes.
*   **Permission Denied (General):**
    *   **Node User:** Check write permissions for `users.json`, `server-settings.json`, and write/execute permissions for `public/uploads/users/` and its subdirectories.
    *   **Nginx User (`www-data`):** Check read permissions for images and execute permissions for the directory path leading to them.
    *   Use `ls -l`, `ls -ld`, and `namei -l` to inspect permissions and ownership.
*   **502 Bad Gateway:** The Node.js application (PM2) might be crashed or not running. Check `pm2 status` and `pm2 logs imagedrop`. Ensure it's running as the correct user with correct permissions.

### Updating the Application

1.  Navigate to your project directory: `cd /var/www/imagedrop`
2.  Pull the latest changes: `git pull origin main` (or your branch)
3.  Install/update dependencies: `npm install`
4.  Rebuild the application: `npm run build`
5.  **Check for changes requiring permission updates or Nginx config updates.**
6.  Restart the application with PM2: `pm2 restart imagedrop`
7.  If Nginx config was changed, test and restart Nginx: `sudo nginx -t && sudo systemctl restart nginx`

### Resetting User Data and Uploaded Images (Development/Testing)

**WARNING: This will permanently delete all user accounts (including admin), approvals, limits, uploaded images, and site settings. For development/testing only.**

1.  **Stop Application:** `pm2 stop imagedrop`
2.  **Delete User Data:** `cd /var/www/imagedrop && sudo rm users.json` (if exists)
3.  **Delete Site Settings:** `cd /var/www/imagedrop && sudo rm server-settings.json` (if exists)
4.  **Delete Uploaded Images:** `cd /var/www/imagedrop/public/uploads && sudo rm -rf users`
5.  **Restart Application:** `pm2 restart imagedrop` (This will recreate `server-settings.json` with defaults. The *next* user to sign up will become the admin).

Your application should now be accessible. Remember the first signup creates the admin account. Subsequent users will require admin approval.
