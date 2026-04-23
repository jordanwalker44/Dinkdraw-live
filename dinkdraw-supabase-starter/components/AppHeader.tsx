'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function AppHeader() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        background: 'rgba(7, 12, 20, 0.82)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '12px 16px 4px 16px',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <motion.img
            src="/dinkdraw-header-logo.png"
            alt="DinkDraw"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            style={{
              width: 44,
              height: 44,
              objectFit: 'contain',
              flexShrink: 0,
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: 'easeOut', delay: 0.04 }}
            style={{
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1,
                color: '#ffffff',
              }}
            >
              DinkDraw
            </div>

            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.68)',
                marginTop: 4,
                lineHeight: 1.1,
              }}
            >
              Pickleball tournaments made easy
            </div>
          </motion.div>
        </Link>
      </div>

      <div
        style={{
          height: 1,
          background: 'rgba(255,255,255,0.08)',
          maxWidth: 720,
          margin: '4px auto 0 auto',
        }}
      />
    </header>
  );
}
