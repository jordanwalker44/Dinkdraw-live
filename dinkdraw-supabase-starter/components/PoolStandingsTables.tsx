'use client';

export type PoolStanding = {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  pointDiff: number;
};

export function PoolStandingsTables({ pools, showPointDifferential = true }: { pools: Array<{ poolNumber: number; standings: PoolStanding[] }>; showPointDifferential?: boolean }) {
  if (!pools.length) return null;

  return (
    <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
      {pools.map(({ poolNumber, standings }) => (
        <section
          key={poolNumber}
          style={{
            overflow: 'hidden',
            borderRadius: 16,
            border: '1px solid rgba(255,203,5,0.24)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ padding: '12px 14px', background: 'rgba(255,203,5,0.09)', color: '#FFCB05', fontSize: 18, fontWeight: 950 }}>
            Pool {poolNumber}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 76px', padding: '9px 8px', color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ textAlign: 'center' }}>Rank</div><div>Player</div><div style={{ textAlign: 'center' }}>{showPointDifferential ? 'Diff' : 'W-L'}</div>
          </div>
          {standings.map((row, index) => (
            <div key={row.playerId} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 76px', alignItems: 'center', minHeight: 54, padding: '7px 8px', borderBottom: index === standings.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.07)', background: index === 0 ? 'linear-gradient(90deg, rgba(255,203,5,0.12), transparent)' : undefined }}>
              <div style={{ textAlign: 'center', color: index === 0 ? '#FFCB05' : '#fff', fontWeight: 950 }}>#{index + 1}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 850 }}>{row.name}</div>
              <div style={{ textAlign: 'center', color: showPointDifferential && row.pointDiff > 0 ? '#FFCB05' : undefined, fontWeight: 900 }}>
                {showPointDifferential ? (row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff) : `${row.wins}-${row.losses}`}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
