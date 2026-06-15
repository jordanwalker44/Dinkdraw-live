import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthRefresh } from '../components/AuthRefresh';
import { AppChrome } from '../components/AppChrome';
import DeepLinkHandler from './DeepLinkHandler';

export const metadata: Metadata = {
  title: 'DinkDraw',
  description: 'Run round robin pickleball tournaments with live scoring and rankings.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DinkDraw',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#00274C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <AuthRefresh />
        <DeepLinkHandler />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
