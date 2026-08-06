'use client';

export type PoolStanding = {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  pointDiff: number;
  gender?: string | null;
};

export function PoolStandingsTables({ pools, showPointDifferential = true }: { pools: Array<{ poolNumber: number; standings: PoolStanding[] }>; showPointDifferential?: boolean }) {
  if (!pools.length) return null;

  return (
    <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
      {pools.map(({ poolNumber, standings }) => {
        const hasGenderGroups = standings.some((row) => row.gender === 'male' || row.gender === 'female');
        const groups = hasGenderGroups
          ? [
              { key: 'male', label: "Men's", rows: standings.filter((row) => row.gender === 'male') },
              { key: 'female', label: "Women's", rows: standings.filter((row) => row.gender === 'female') },
            ]
          : [{ key: 'all', label: '', rows: standings }];
        return (
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
            Pool {poolNumber} Standings
          </div>
          {groups.filter((group) => group.rows.length).map((group, groupIndex) => (
            <div key={group.key} style={{ borderTop: groupIndex ? '1px solid rgba(255,203,5,0.2)' : undefined }}>
              {group.label ? <div style={{ padding: '10px 14px 7px', color: '#FFCB05', fontSize: 14, fontWeight: 950 }}>{group.label} Standings</div> : null}
              <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 76px', padding: '8px', color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ textAlign: 'center' }}>Rank</div><div>Player</div><div style={{ textAlign: 'center' }}>{showPointDifferential ? 'Diff' : 'W-L'}</div>
              </div>
              {group.rows.map((row, index) => (
                <div key={row.playerId} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 76px', alignItems: 'center', minHeight: 50, padding: '7px 8px', borderBottom: index === group.rows.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.07)', background: index === 0 ? 'linear-gradient(90deg, rgba(255,203,5,0.12), transparent)' : undefined }}>
                  <div style={{ textAlign: 'center', color: index === 0 ? '#FFCB05' : '#fff', fontWeight: 950 }}>#{index + 1}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 850 }}>{row.name}</div>
                  <div style={{ textAlign: 'center', color: showPointDifferential && row.pointDiff > 0 ? '#FFCB05' : undefined, fontWeight: 900 }}>
                    {showPointDifferential ? (row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff) : `${row.wins}-${row.losses}`}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      );})}
    </div>
  );
}
