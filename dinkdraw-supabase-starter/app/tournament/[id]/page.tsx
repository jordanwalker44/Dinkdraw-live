'use client';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { TopNav } from '@/components/TopNav';

type Tournament = { id: string; title: string; join_code: string; organizer_user_id: string; organizer_name: string | null; player_count: number; courts: number; rounds: number; games_to: number; status: string; };
type PlayerSlot = { id: string; slot_number: number; display_name: string | null; claimed_by_user_id: string | null; };
type Match = { id: string; round_number: number; court_number: number | null; team_a_score: number | null; team_b_score: number | null; is_bye: boolean; };

export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseBrowserClient();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState<string>('');
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const claimedSlot = useMemo(() => playerSlots.find((slot) => slot.claimed_by_user_id === userId) || null, [playerSlots, userId]);

  async function refreshAll() {
    const { data: authData } = await supabase.auth.getUser();
    setUserId(authData.user?.id ?? '');
    const { data: tournamentData } = await supabase.from('tournaments').select('*').eq('id', params.id).single();
    const { data: playersData } = await supabase.from('tournament_players').select('*').eq('tournament_id', params.id).order('slot_number', { ascending: true });
    const { data: matchesData } = await supabase.from('matches').select('*').eq('tournament_id', params.id).order('round_number', { ascending: true });
    setTournament(tournamentData || null);
    setPlayerSlots(playersData || []);
    setMatches(matchesData || []);
  }

  useEffect(() => { refreshAll(); }, [params.id]);

  async function claimSlot(slotId: string) {
    setMessage('');
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return setMessage('Sign in first.');
    if (claimedSlot) return setMessage('You already claimed a slot in this tournament.');
    const { error } = await supabase.from('tournament_players').update({ claimed_by_user_id: user.id }).eq('id', slotId).is('claimed_by_user_id', null);
    if (error) return setMessage(error.message);
    await refreshAll();
    setMessage('Spot claimed.');
  }

  async function savePlayerName(slotId: string) {
    const name = (newNames[slotId] || '').trim();
    if (!name) return;
    const { error } = await supabase.from('tournament_players').update({ display_name: name }).eq('id', slotId);
    if (error) return setMessage(error.message);
    await refreshAll();
  }

  async function updateMatchScore(matchId: string, field: 'team_a_score' | 'team_b_score', value: string) {
    const numeric = value === '' ? null : Math.max(0, Number(value));
    const { error } = await supabase.from('matches').update({ [field]: numeric }).eq('id', matchId);
    if (error) return setMessage(error.message);
    await refreshAll();
  }

  return <main className="page-shell">
    <div className="hero"><div className="hero-inner"><img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" /><h1 className="hero-title">{tournament?.title || 'Tournament'}</h1><p className="hero-subtitle">Join code: <span className="code-pill">{tournament?.join_code || '...'}</span></p></div></div>
    <TopNav />
    {message ? <div className="notice" style={{marginBottom:16}}>{message}</div> : null}
    <div className="card"><div className="card-title">Player spots</div><div className="card-subtitle">Claim your spot, or let the organizer type names.</div><div className="grid">
      {playerSlots.map((slot) => <div key={slot.id} className="list-item"><div className="row-between"><div><div><strong>Player {slot.slot_number}</strong></div><div className="muted">{slot.display_name || 'No name yet'}</div></div><div>{slot.claimed_by_user_id ? <span className="tag green">Claimed</span> : <button className="button primary" onClick={() => claimSlot(slot.id)}>Claim</button>}</div></div><div className="row" style={{marginTop:12}}><input className="input" value={newNames[slot.id] ?? slot.display_name ?? ''} onChange={(e)=>setNewNames((prev)=>({...prev, [slot.id]: e.target.value}))} placeholder={`Name for Player ${slot.slot_number}`} /><button className="button secondary" onClick={() => savePlayerName(slot.id)}>Save</button></div></div>)}
    </div></div>
    <div className="card"><div className="card-title">Matches</div><div className="card-subtitle">This starter reads and updates saved matches. You will add schedule generation next.</div>
    {!matches.length ? <div className="muted">No matches yet. Next build step: generate the schedule and insert rows into the matches table.</div> : <div className="matches">{matches.map((match) => <div key={match.id} className="list-item"><div className="row-between" style={{marginBottom:12}}><div><strong>Round {match.round_number}</strong></div><div className="muted">Court {match.court_number ?? '-'}</div></div><div className="row"><input className="input score-box" type="number" value={match.team_a_score ?? ''} onChange={(e)=>updateMatchScore(match.id, 'team_a_score', e.target.value)} placeholder="0" /><span className="muted">vs</span><input className="input score-box" type="number" value={match.team_b_score ?? ''} onChange={(e)=>updateMatchScore(match.id, 'team_b_score', e.target.value)} placeholder="0" /></div></div>)}</div>}
    </div>
  </main>;
}
