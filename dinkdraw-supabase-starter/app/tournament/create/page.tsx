'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

function makeJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function CreateTournamentPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [title, setTitle] = useState('Saturday Round Robin');
  const [organizerName, setOrganizerName] = useState('');
  const [playerCount, setPlayerCount] = useState(8);
  const [courts, setCourts] = useState(2);
  const [rounds, setRounds] = useState(4);
  const [gamesTo, setGamesTo] = useState(11);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadUser() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, email')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.display_name) {
        setOrganizerName(profile.display_name);
      } else {
        setOrganizerName(user.email?.split('@')[0] || '');
      }
    }

    loadUser();
  }, [supabase]);

  async function handleCreate() {
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      setMessage('Sign in first.');
      return;
    }

    const safeOrganizerName = organizerName.trim() || user.email?.split('@')[0] || 'Organizer';

    // make sure the profile row exists
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      display_name: safeOrganizerName,
      email: user.email
    });

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    const joinCode = makeJoinCode();

    const { data: tournament, error } = await supabase
      .from('tournaments')
      .insert({
        title,
        organizer_user_id: user.id,
        organizer_name: safeOrganizerName,
        join_code: joinCode,
        player_count: playerCount,
        courts,
        rounds,
        games_to: gamesTo,
        status: 'draft'
      })
      .select()
      .single();

    if (error || !tournament) {
      setMessage(error?.message || 'Could not create tournament.');
      return;
    }

    const playerRows = Array.from({ length: playerCount }, (_, idx) => ({
      tournament_id: tournament.id,
      slot_number: idx + 1,
      display_name: ''
    }));

    const { error: playersError } = await supabase
      .from('tournament_players')
      .insert(playerRows);

    if (playersError) {
      setMessage(playersError.message);
      return;
    }

    router.push(`/tournament/${tournament.id}`);
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">Create Tournament</h1>
          <p className="hero-subtitle">This writes a real tournament to Supabase.</p>
        </div>
      </div>

      <TopNav />

      <div className="card">
        <div className="grid">
          <div>
            <label className="label">Event name</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="label">Organizer name</label>
            <input className="input" value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
          </div>

          <div className="two-col">
            <div>
              <label className="label">Number of players</label>
              <input className="input" type="number" min={4} max={40} value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value) || 8)} />
            </div>
            <div>
              <label className="label">Courts</label>
              <input className="input" type="number" min={1} max={20} value={courts} onChange={(e) => setCourts(Number(e.target.value) || 2)} />
            </div>
          </div>

          <div className="two-col">
            <div>
              <label className="label">Rounds</label>
              <input className="input" type="number" min={1} max={30} value={rounds} onChange={(e) => setRounds(Number(e.target.value) || 4)} />
            </div>
            <div>
              <label className="label">Games to</label>
              <input className="input" type="number" min={1} max={21} value={gamesTo} onChange={(e) => setGamesTo(Number(e.target.value) || 11)} />
            </div>
          </div>

          <button className="button primary" onClick={handleCreate}>Create tournament</button>
          {message ? <div className="notice">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}
