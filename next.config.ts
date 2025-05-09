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
  // Configure the body parser to accept larger request bodies (e.g., for file uploads)
  // This applies to API routes and Server Actions.
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Set the desired limit, e.g., 10MB
    },
  },
};

export default nextConfig;
