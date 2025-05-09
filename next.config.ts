import type {NextConfig} from 'next';

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
  // Configure the body parser to accept larger request bodies for API routes.
  api: {
    bodyParser: {
      sizeLimit: '6mb', // Set the desired limit, e.g., 6MB
    },
  },
  // Configure body size limit for Server Actions
  serverActions: {
    bodySizeLimit: '6mb', // Set the desired limit, e.g., 6MB
  },
};

export default nextConfig;
