const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/dinkdraw\.app\/tournament\/create/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'create-page',
        expiration: {
          maxEntries: 1,
          maxAgeSeconds: 0,
        },
      },
    },
    {
      urlPattern: /^https:\/\/dinkdraw\.app\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24,
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withPWA(nextConfig);
