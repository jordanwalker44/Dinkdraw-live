import { ImageResponse } from 'next/og';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#00274C',
          color: '#ffffff',
          fontFamily: 'Arial',
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 900 }}>
          Dink<span style={{ color: '#FFCB05' }}>Draw</span>
        </div>

        <div style={{ fontSize: 42, fontWeight: 800, marginTop: 24 }}>
          Final Results
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
