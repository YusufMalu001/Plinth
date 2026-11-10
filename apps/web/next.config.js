/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@synergy/types', '@synergy/ui', '@synergy/validation'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
