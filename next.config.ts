import type {NextConfig} from 'next';

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

// Base CSP directives
// 'unsafe-inline' is often needed for Next.js antd various UI libraries for styles.
// For scripts, 'unsafe-inline' is less ideal; consider a nonce-based strategy for production if possible.
// 'unsafe-eval' is allowed in development for HMR and dev tools, but strictly disallowed in production.
const scriptSrcDirectives = ["'self'", "'unsafe-inline'"];
if (IS_DEVELOPMENT) {
  scriptSrcDirectives.push("'unsafe-eval'");
}

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY', // Or 'SAMEORIGIN' if you need to iframe your site on the same domain
  },
  {
    key: 'Strict-Transport-Security',
    // max-age is 1 year. Consider adding 'preload' if you understand the implications and intend to submit for HSTS preloading.
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      `default-src 'self'`,
      `script-src ${scriptSrcDirectives.join(' ')}`,
      `style-src 'self' 'unsafe-inline'`, // 'unsafe-inline' for NextUI/ShadCN and other UI libs that use inline styles
      `img-src 'self' data: https://picsum.photos`, // Allow data URIs for image previews and picsum.photos for placeholders
      `font-src 'self'`, // Assuming fonts are self-hosted or managed via 'self'
      `object-src 'none'`,
      `frame-ancestors 'none'`,
      `form-action 'self'`,
      `base-uri 'self'`,
      `upgrade-insecure-requests`,
    ].join('; '),
  },
];


const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
