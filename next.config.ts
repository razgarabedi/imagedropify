
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
  // Configure the body parser to accept larger request bodies for API routes (less relevant with App Router).
  api: {
    bodyParser: {
      sizeLimit: '10mb', 
    },
  },
  // Configure body size limit for Server Actions
  serverActions: {
    bodySizeLimit: '10mb', 
  },
};

export default nextConfig;
