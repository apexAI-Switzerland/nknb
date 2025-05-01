/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  swcMinify: true,
  // Disable static generation for pages that need Supabase data
  experimental: {
    // This will allow server-side rendering with environment variables
    serverActions: true,
  },
  // Add environment variables that should be available at build time
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  // Warn if required environment variables are missing
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    if (isServer) {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        console.warn('\x1b[33m%s\x1b[0m', 'Warning: Required Supabase environment variables are not set.');
      }
    }
    return config;
  },
};

module.exports = nextConfig; 