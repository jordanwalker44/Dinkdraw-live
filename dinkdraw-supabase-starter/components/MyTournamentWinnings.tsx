'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

type Award = { tournament_id: string; tournament_title: string; amount_cents: number; awarded_at: string };
type Winnings = {
  daily_winnings_cents: number;
  grand_prize_winnings_cents: number;
  total_winnings_cents: number;
  daily_awards: Award[];
  grand_prize_awards: Array<{ cycle_id: string; amount_cents: number; paid_at: string }>;
};

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function MyTournamentWinnings() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [winnings, setWinnings] = useState<Winnings | null>(null);

  useEffect(() => {
    void supabase.rpc('get_my_tournament_winnings').then(({ data, error }) => {
      if (!error) setWinnings(data as Winnings);
    });
  }, [supabase]);

  if (!winnings) return null;

  return (
    <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(255,203,5,0.28)' }}>
      <div className="card-title">My Tournament Winnings</div>
      <div className="card-subtitle">Private—only you can see these totals.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <div className="list-item" style={{ textAlign: 'center' }}><div className="muted">Daily Prizes</div><div style={{ color: '#FFCB05', fontSize: 22, fontWeight: 950 }}>{money(winnings.daily_winnings_cents)}</div></div>
        <div className="list-item" style={{ textAlign: 'center' }}><div className="muted">Grand Prizes</div><div style={{ color: '#A78BFA', fontSize: 22, fontWeight: 950 }}>{money(winnings.grand_prize_winnings_cents)}</div></div>
        <div className="list-item" style={{ textAlign: 'center' }}><div className="muted">Total<br />Won</div><div style={{ color: '#86EFAC', fontSize: 22, fontWeight: 950 }}>{money(winnings.total_winnings_cents)}</div></div>
      </div>
      {winnings.daily_awards.length || winnings.grand_prize_awards.length ? (
        <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
          {winnings.grand_prize_awards.map((award) => <div key={award.cycle_id} className="list-item" style={{ padding: 10 }}><strong>Race to 3 Grand Prize</strong><span style={{ float: 'right', color: '#A78BFA', fontWeight: 950 }}>{money(award.amount_cents)}</span></div>)}
          {winnings.daily_awards.map((award) => <div key={`${award.tournament_id}-${award.awarded_at}`} className="list-item" style={{ padding: 10 }}><strong>{award.tournament_title}</strong><span style={{ float: 'right', color: '#FFCB05', fontWeight: 950 }}>{money(award.amount_cents)}</span></div>)}
        </div>
      ) : <div className="muted" style={{ marginTop: 12 }}>Your tournament prize history will appear here after your first win.</div>}
    </div>
  );
}
