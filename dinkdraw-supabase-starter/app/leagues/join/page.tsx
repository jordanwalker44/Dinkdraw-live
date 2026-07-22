'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '../../../components/TopNav';
import { sendLeaguePushEvent } from '../../../lib/league-push';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

export default function JoinLeaguePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [code, setCode] = useState('');
  const [position, setPosition] = useState(1);
  const [message, setMessage] = useState('');
  const [joining, setJoining] = useState(false);

  async function join() {
    setJoining(true); setMessage('');
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setMessage('Sign in before claiming a league roster position.'); setJoining(false); return;
    }
    const { data, error } = await supabase.rpc('claim_league_roster_spot', {
      p_join_code: code.trim(), p_roster_position: position,
    });
    setJoining(false);
    if (error || !data) { setMessage(error?.message || 'Could not join the league.'); return; }
    void sendLeaguePushEvent(supabase, { eventType: 'roster_claimed', leagueId: data });
    router.push(`/leagues/${data}`);
  }

  return <main className="page-shell"><TopNav /><div className="card">
    <div className="card-title" style={{ color: '#FFCB05' }}>Join a League</div>
    <div className="card-subtitle">Use the code and roster position provided by your league organizer.</div>
    {message ? <div className="notice" style={{ marginTop: 14 }}>{message}</div> : null}
    <div className="grid" style={{ gap: 14, marginTop: 16 }}>
      <div><label className="label">League code</label><input className="input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /></div>
      <div><label className="label">Your roster position</label><input className="input" type="number" min={1} max={32} value={position} onChange={(event) => setPosition(Number(event.target.value))} /></div>
      <button className="button primary" type="button" onClick={join} disabled={joining || !code.trim()}>{joining ? 'Joining...' : 'Claim Roster Position'}</button>
    </div>
  </div></main>;
}
