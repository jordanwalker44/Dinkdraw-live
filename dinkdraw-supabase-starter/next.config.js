const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [],
  dynamicStartUrl: false,
  reloadOnOnline: true,
  cacheOnFrontEndNav: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

nextConfig.headers = async () => {
  return [
    {
      source: '/.well-known/apple-app-site-association',
      headers: [
        {
          key: 'Content-Type',
          value: 'application/json',
        },
      ],
    },
    {
      source: '/.well-known/assetlinks.json',
      headers: [
        {
          key: 'Content-Type',
          value: 'application/json',
        },
      ],
    },
  ];
};

module.exports = withPWA(nextConfig);
