/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@plinth/tokens', '@synergy/types', '@synergy/ui', '@synergy/validation'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
