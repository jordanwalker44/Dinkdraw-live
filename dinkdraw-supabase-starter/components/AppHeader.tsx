'use client';

import Link from 'next/link';

export function AppHeader() {
  return (
    <header
  className="app-header-elevated"
  style={{
    position: 'fixed',
top: 0,
left: 0,
right: 0,
    zIndex: 50,
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    background: 'rgba(7, 12, 20, 0.84)',
  }}
>
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '54px 16px 12px 16px',
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
          <img
            src="/dinkdraw-header-logo.png"
            alt="DinkDraw"
            style={{
              width: 44,
              height: 44,
              objectFit: 'contain',
              flexShrink: 0,
            }}
          />

          <div
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
  }}
>
  <span style={{ color: '#ffffff' }}>Dink</span>
  <span className="logo-draw">Draw</span>
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
          </div>
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
