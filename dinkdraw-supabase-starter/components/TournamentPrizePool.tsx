'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

type PrizePlayer = {
  user_id: string;
  name: string;
  wins: number;
  paid: boolean;
  cycle_grand_contribution_cents: number;
  eligible_for_payout: boolean;
};

type Dashboard = {
  cycle_id: string;
  status: 'active' | 'pending_payout';
  target_wins: number;
  grand_pot_cents: number;
  daily_pot_cents: number;
  paid_player_count: number;
  players: PrizePlayer[];
};

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function TournamentPrizePool({ tournamentId, canManage }: { tournamentId: string; canManage: boolean }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('get_tournament_prize_dashboard', { p_tournament_id: tournamentId });
    if (error) { setMessage(error.message); return; }
    const next = data as Dashboard;
    setDashboard(next);
  }

  useEffect(() => { void load(); }, [tournamentId]);

  async function setPayment(player: PrizePlayer, paid: boolean) {
    setWorkingId(player.user_id);
    const { error } = await supabase.rpc('set_tournament_pot_payment', {
      p_tournament_id: tournamentId,
      p_user_id: player.user_id,
      p_paid: paid,
    });
    setWorkingId(null);
    if (error) { setMessage(error.message); return; }
    setMessage(`${player.name} was marked ${paid ? 'paid' : 'unpaid'}.`);
    await load();
  }

  async function confirmPayout(player: PrizePlayer) {
    if (!window.confirm(`Confirm ${money(dashboard?.grand_pot_cents || 0)} was paid to ${player.name}? This closes the cycle and resets every player to zero wins.`)) return;
    setWorkingId(player.user_id);
    const { error } = await supabase.rpc('confirm_tournament_prize_payout', {
      p_tournament_id: tournamentId,
      p_winner_user_id: player.user_id,
    });
    setWorkingId(null);
    if (error) { setMessage(error.message); return; }
    setMessage('Payout confirmed. A new race to three has started at zero wins with a fresh pot.');
    await load();
  }

  if (!dashboard) return <div className="muted" style={{ marginTop: 12 }}>{message || 'Loading prize pool…'}</div>;

  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <div className="list-item" style={{ textAlign: 'center' }}><div className="muted">Daily Prize</div><div style={{ color: '#FFCB05', fontSize: 26, fontWeight: 950 }}>{money(dashboard.daily_pot_cents)}</div></div>
        <div className="list-item" style={{ textAlign: 'center' }}><div className="muted">Grand Prize Pot</div><div style={{ color: '#FFCB05', fontSize: 26, fontWeight: 950 }}>{money(dashboard.grand_pot_cents)}</div></div>
        <div className="list-item" style={{ textAlign: 'center' }}><div className="muted">Race Status</div><div style={{ color: dashboard.status === 'pending_payout' ? '#A78BFA' : '#fff', fontSize: 20, fontWeight: 950 }}>{dashboard.status === 'pending_payout' ? 'Winner Pending Payout' : `First to ${dashboard.target_wins} Wins`}</div></div>
      </div>
      <div className="muted" style={{ textAlign: 'center' }}>{dashboard.paid_player_count} paid players • $5 per player to each prize</div>

      {dashboard.players.map((player, index) => (
        <div key={player.user_id} className="list-item" style={{ borderColor: player.eligible_for_payout ? 'rgba(167,139,250,0.7)' : index === 0 ? 'rgba(255,203,5,0.38)' : undefined }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
            <div><div style={{ fontSize: 18, fontWeight: 900 }}>{player.name}</div><div className="muted">Grand-prize contributions this cycle: {money(player.cycle_grand_contribution_cents)}</div></div>
            <div style={{ color: player.eligible_for_payout ? '#A78BFA' : '#FFCB05', fontSize: 22, fontWeight: 950 }}>{player.wins}/{dashboard.target_wins} wins</div>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
            {Array.from({ length: dashboard.target_wins }, (_, winIndex) => <div key={winIndex} style={{ height: 8, flex: 1, borderRadius: 99, background: winIndex < player.wins ? '#FFCB05' : 'rgba(255,255,255,0.12)' }} />)}
          </div>

          {canManage && dashboard.status === 'active' ? (
            <button type="button" className={`button ${player.paid ? 'secondary' : 'primary'}`} style={{ width: '100%', marginTop: 12 }} onClick={() => setPayment(player, !player.paid)} disabled={workingId === player.user_id}>{workingId === player.user_id ? 'Saving…' : player.paid ? '✓ Paid $10 — Mark Unpaid' : 'Mark $10 Paid'}</button>
          ) : null}

          {canManage && dashboard.status === 'pending_payout' && player.eligible_for_payout ? (
            <button type="button" className="button primary" style={{ width: '100%', marginTop: 12 }} onClick={() => confirmPayout(player)} disabled={workingId === player.user_id}>Confirm Payout to {player.name}</button>
          ) : null}
        </div>
      ))}
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
