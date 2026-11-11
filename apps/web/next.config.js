/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@plinth/tokens', '@plinth/types', '@plinth/ui', '@plinth/validation'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
