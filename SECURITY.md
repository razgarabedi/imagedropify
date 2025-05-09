# Security Guidelines for ImageDrop

This document provides essential security guidelines for developing, deploying, and maintaining the ImageDrop Next.js application on an Ubuntu server with Nginx. Security is an ongoing process; regularly review and update your practices.

## Application Security (Next.js)

1.  **Dependencies**:
    *   Regularly update dependencies to patch known vulnerabilities: `npm audit` or `yarn audit`.
    *   Use tools like Snyk or Dependabot for automated vulnerability scanning.

2.  **Input Validation**:
    *   Always validate and sanitize user input on both client-side (for UX) and server-side (for security).
    *   For file uploads (like in `ImageUploader`), robust server-side validation is critical:
        *   Check file types (MIME types and file extensions).
        *   Enforce size limits.
        *   Scan for malware.
        *   Sanitize filenames.

3.  **Cross-Site Scripting (XSS)**:
    *   Next.js React helps prevent XSS by default by escaping content rendered in JSX.
    *   Be cautious with `dangerouslySetInnerHTML`. Ensure any HTML passed to it is sanitized if it originates from user input.
    *   A strong Content Security Policy (CSP) is crucial (configured in `next.config.js`).

4.  **Cross-Site Request Forgery (CSRF)**:
    *   If using API Routes or Server Actions for state-changing operations, ensure CSRF protection is in place. Next.js Server Actions have built-in CSRF protection. For traditional API routes, implement measures like CSRF tokens if managing sessions/cookies.

5.  **API Keys & Secrets Management**:
    *   Never hardcode API keys or secrets in client-side code.
    *   Use environment variables for all secrets (`.env.local` for development, and proper environment variable management in production).
    *   Access secrets only on the server-side (Server Components, API Routes, Server Actions).
    *   Ensure `.env.local` and similar files are in `.gitignore`.

6.  **Security Headers**:
    *   Utilize security headers set in `next.config.js` (e.g., `Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
    *   Regularly review and update your CSP to be as restrictive as possible while allowing your application to function.

7.  **Error Handling**:
    *   Implement comprehensive error handling.
    *   Do not leak sensitive error details or stack traces to the client in production. Use generic error messages. Next.js `error.js` files help manage this for different route segments.

8.  **Authentication & Authorization** (if applicable):
    *   If user accounts are implemented, use strong authentication mechanisms (e.g., NextAuth.js).
    *   Enforce proper authorization checks for all protected routes and actions.

## Server Security (Ubuntu)

1.  **Keep System Updated**:
    *   Regularly update your server's operating system and installed packages:
        ```bash
        sudo apt update && sudo apt upgrade -y
        sudo apt autoremove -y
        ```
    *   Consider configuring automatic security updates.

2.  **Firewall**:
    *   Enable and configure UFW (Uncomplicated Firewall):
        ```bash
        sudo ufw allow OpenSSH
        sudo ufw allow http
        sudo ufw allow https
        sudo ufw enable
        sudo ufw status
        ```
    *   Only open necessary ports.

3.  **SSH Security**:
    *   Disable root login: Edit `/etc/ssh/sshd_config` and set `PermitRootLogin no`.
    *   Use SSH key-based authentication instead of passwords.
    *   Change the default SSH port (optional, security through obscurity).
    *   Use tools like `fail2ban` to protect against brute-force attacks.

4.  **User Privileges**:
    *   Run your application under a non-root user with limited privileges.
    *   Use `sudo` only when necessary.

5.  **Regular Audits**:
    *   Periodically review server logs (`/var/log/auth.log`, `/var/log/syslog`, Nginx logs).
    *   Consider using tools like `Lynis` for security auditing.

## Web Server Security (Nginx)

1.  **HTTPS Configuration**:
    *   Always use HTTPS. Obtain SSL/TLS certificates from a trusted CA (e.g., Let's Encrypt).
    *   Configure Nginx for strong SSL/TLS:
        *   Use modern TLS protocols (TLS 1.2, TLS 1.3).
        *   Use strong cipher suites.
        *   Enable HSTS (Strict-Transport-Security) header (can also be set in `next.config.js`, but Nginx ensures it's always sent).
        *   Enable OCSP Stapling.
    *   Example for Let's Encrypt with Certbot: `sudo certbot --nginx`.

2.  **Nginx Configuration Hardening**:
    *   Keep Nginx updated.
    *   Remove or disable unnecessary Nginx modules.
    *   Hide Nginx version: `server_tokens off;` in `nginx.conf`.
    *   Configure Nginx as a reverse proxy for your Next.js application (which typically runs on `localhost:3000` via `npm start`).
    *   Set appropriate `proxy_set_header` directives to pass necessary information (like `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`).

    ```nginx
    # Example Nginx server block snippet for Next.js
    server {
        listen 80;
        listen [::]:80;
        server_name yourdomain.com;

        # Redirect HTTP to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name yourdomain.com;

        # SSL Configuration (paths depend on Certbot or your CA)
        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        include /etc/letsencrypt/options-ssl-nginx.conf; # Managed by Certbot
        ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # Managed by Certbot

        # Security Headers (can be set here or in Next.js, avoid duplication)
        # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        # add_header X-Content-Type-Options "nosniff" always;
        # add_header X-Frame-Options "DENY" always;
        # add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        # add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
        # CSP can be complex to manage in Nginx for Next.js, usually better in next.config.js

        location / {
            proxy_pass http://localhost:3000; # Assuming Next.js app runs on port 3000
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Serve static assets directly from Next.js's static export if applicable,
        # or let Next.js handle them via the proxy.
        # For optimal performance with Next.js (not static export):
        location /_next/static {
            proxy_cache STATIC; # Define a proxy_cache zone named STATIC
            proxy_pass http://localhost:3000/_next/static;
            # Add cache control headers if needed
        }

        location ~ /.well-known/acme-challenge/ { # For Certbot renewals
            allow all;
            root /var/www/html; # Or your webroot
        }
    }
    ```

3.  **Rate Limiting & DDoS Protection**:
    *   Configure rate limiting in Nginx (`limit_req_zone`, `limit_req`) to prevent abuse.
    *   Consider using a Web Application Firewall (WAF) like ModSecurity or cloud-based WAF services (e.g., Cloudflare).

4.  **Logging and Monitoring**:
    *   Ensure Nginx access and error logs are enabled and regularly monitored.
    *   Forward logs to a centralized logging system for analysis and alerting.

## Deployment Practices

*   **Automated Deployments**: Use CI/CD pipelines for consistent and secure deployments.
*   **Principle of Least Privilege**: Ensure the user account running the Next.js application has only the permissions it needs.
*   **Regular Backups**: Implement a robust backup strategy for your application data and server configurations.

This document is a starting point. Always adapt security measures to your specific application needs and threat model. Stay informed about new vulnerabilities and security best practices.
