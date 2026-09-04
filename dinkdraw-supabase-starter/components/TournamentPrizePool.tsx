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
  series_id: string;
  series_name: string;
  default_buy_in_cents: number;
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

export function TournamentPrizePool({ tournamentId, canManage, dailyWinnerNames = [] }: { tournamentId: string; canManage: boolean; dailyWinnerNames?: string[] }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>({});
  const [bulkPaymentDraft, setBulkPaymentDraft] = useState('10.00');
  const [isSavingAll, setIsSavingAll] = useState(false);

  async function load() {
    const [{ data, error }, amountsResult] = await Promise.all([
      supabase.rpc('get_tournament_prize_dashboard', { p_tournament_id: tournamentId }),
      canManage
        ? supabase.rpc('get_tournament_pot_payment_amounts', { p_tournament_id: tournamentId })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (error) { setMessage(error.message); return; }
    const next = data as Dashboard;
    setDashboard(next);
    setBulkPaymentDraft((next.default_buy_in_cents / 100).toFixed(2));
    if (!amountsResult.error) {
      setPaymentDrafts(Object.fromEntries(((amountsResult.data || []) as Array<{ user_id: string; amount_cents: number }>).map((row) => [row.user_id, (row.amount_cents / 100).toFixed(2)])));
    }
  }

  useEffect(() => { void load(); }, [tournamentId]);

  async function setPayment(player: PrizePlayer) {
    const amount = Number(paymentDrafts[player.user_id] || 0);
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount < 0 || amountCents % 2 !== 0) {
      setMessage('Enter a valid payment amount that can be split equally between both pots.');
      return;
    }
    setWorkingId(player.user_id);
    const { error } = await supabase.rpc('set_tournament_pot_payment', {
      p_tournament_id: tournamentId,
      p_user_id: player.user_id,
      p_amount_cents: amountCents,
    });
    setWorkingId(null);
    if (error) { setMessage(error.message); return; }
    setMessage(amountCents ? `${player.name}'s ${money(amountCents)} payment was saved: ${money(amountCents / 2)} to each pot.` : `${player.name}'s payment was cleared.`);
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

  async function setEveryonePaid() {
    const amount = Number(bulkPaymentDraft);
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount <= 0 || amountCents % 2 !== 0) {
      setMessage('Enter a buy-in greater than zero that can be split equally between both pots.');
      return;
    }
    if (!window.confirm(`Mark every account-linked player paid ${money(amountCents)}? ${money(amountCents / 2)} per player will go to each prize pot.`)) return;
    setIsSavingAll(true);
    const { data, error } = await supabase.rpc('set_all_tournament_pot_payments', {
      p_tournament_id: tournamentId,
      p_amount_cents: amountCents,
    });
    setIsSavingAll(false);
    if (error) { setMessage(error.message); return; }
    setMessage(`${Number(data) || 0} players were marked paid ${money(amountCents)} each.`);
    await load();
  }

  if (!dashboard) return <div className="muted" style={{ marginTop: 12 }}>{message || 'Loading prize pool…'}</div>;

  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
      <div style={{ textAlign: 'center', color: '#FFCB05', fontSize: 18, fontWeight: 950 }}>{dashboard.series_name}</div>
      <div className="moneyball-summary-grid">
        <div className="list-item moneyball-summary-card"><div className="muted">Daily Prize</div><div className="moneyball-amount">{money(dashboard.daily_pot_cents)}</div></div>
        <div className="list-item moneyball-summary-card"><div className="muted">Grand Prize Pot</div><div className="moneyball-amount">{money(dashboard.grand_pot_cents)}</div></div>
        <div className="list-item moneyball-summary-card moneyball-race-card"><div className="muted">Race Status</div><div className="moneyball-race-value" style={{ color: dashboard.status === 'pending_payout' ? '#A78BFA' : '#fff' }}>{dashboard.status === 'pending_payout' ? 'Winner Pending Payout' : `First to ${dashboard.target_wins} Wins`}</div></div>
      </div>
      <div className="muted" style={{ textAlign: 'center' }}>{dashboard.paid_player_count} paid players • Every payment is split 50% daily / 50% grand prize</div>

      {canManage && dashboard.status === 'active' ? (
        <div className="list-item" style={{ borderColor: 'rgba(255,203,5,0.38)' }}>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Set Everyone’s Buy-In</div>
          <div className="muted" style={{ marginTop: 4 }}>Apply one amount to every account-linked player. You can still adjust individuals below.</div>
          <div className="moneyball-payment-row">
            <div>
              <label className="label">Buy-In Per Player</label>
              <input className="input" type="number" min="0.02" step="0.02" value={bulkPaymentDraft} onChange={(event) => setBulkPaymentDraft(event.target.value)} />
            </div>
            <button type="button" className="button primary moneyball-payment-button" onClick={setEveryonePaid} disabled={isSavingAll}>
              {isSavingAll ? 'Saving Everyone…' : `Everybody Paid ${money(Math.max(0, Math.round((Number(bulkPaymentDraft) || 0) * 100)))}`}
            </button>
          </div>
        </div>
      ) : null}

      {dailyWinnerNames.length ? (
        <div className="list-item" style={{ borderColor: 'rgba(255,203,5,0.55)', textAlign: 'center' }}>
          <div className="muted">Daily Prize Winners — Championship Final</div>
          <div style={{ marginTop: 6, color: '#FFCB05', fontSize: 22, fontWeight: 950 }}>{dailyWinnerNames.join(' & ')}</div>
          <div className="muted" style={{ marginTop: 5 }}>These are the two players who receive today’s daily prize.</div>
        </div>
      ) : null}

      {dashboard.players.map((player, index) => (
        <div key={player.user_id} className="list-item" style={{ borderColor: player.eligible_for_payout ? 'rgba(167,139,250,0.7)' : index === 0 ? 'rgba(255,203,5,0.38)' : undefined }}>
          <div className="moneyball-player-heading">
            <div><div style={{ fontSize: 18, fontWeight: 900 }}>{player.name}</div><div className="muted">Grand-prize contributions this cycle: {money(player.cycle_grand_contribution_cents)}</div></div>
            <div className="moneyball-player-wins" style={{ color: player.eligible_for_payout ? '#A78BFA' : '#FFCB05' }}>{player.wins}/{dashboard.target_wins} wins</div>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
            {Array.from({ length: dashboard.target_wins }, (_, winIndex) => <div key={winIndex} style={{ height: 8, flex: 1, borderRadius: 99, background: winIndex < player.wins ? '#FFCB05' : 'rgba(255,255,255,0.12)' }} />)}
          </div>

          {canManage && dashboard.status === 'active' ? (
            <div className="moneyball-payment-row">
              <div>
                <label className="label">Amount Paid</label>
                <input className="input" type="number" min="0" step="0.02" value={paymentDrafts[player.user_id] ?? ''} onChange={(event) => setPaymentDrafts((current) => ({ ...current, [player.user_id]: event.target.value }))} placeholder="10.00" />
              </div>
              <button type="button" className="button primary moneyball-payment-button" onClick={() => setPayment(player)} disabled={workingId === player.user_id}>{workingId === player.user_id ? 'Saving…' : 'Save Payment'}</button>
            </div>
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
