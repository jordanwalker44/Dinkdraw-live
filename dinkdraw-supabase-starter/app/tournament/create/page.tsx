'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

function makeJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '56px 1fr 56px',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="button secondary"
          onClick={() => onChange(clamp(value - 1, min, max))}
          disabled={value <= min}
          style={{ height: 56, fontSize: 24 }}
        >
          −
        </button>

        <div
          className="input"
          style={{
            textAlign: 'center',
            fontSize: 28,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 56,
          }}
        >
          {value}
        </div>

        <button
          type="button"
          className="button secondary"
          onClick={() => onChange(clamp(value + 1, min, max))}
          disabled={value >= max}
          style={{ height: 56, fontSize: 24 }}
        >
          +
        </button>
      </div>
    </div>
  );
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
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
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
    setIsCreating(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError) {
        setMessage(authError.message);
        setIsCreating(false);
        return;
      }

      const user = authData.user;
      if (!user) {
        setMessage('Sign in first.');
        setIsCreating(false);
        return;
      }

      const safeOrganizerName =
        organizerName.trim() || user.email?.split('@')[0] || 'Organizer';

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: safeOrganizerName,
        email: user.email,
      });

      if (profileError) {
        setMessage(profileError.message);
        setIsCreating(false);
        return;
      }

      const joinCode = makeJoinCode();

      const { data: tournament, error: tournamentError } = await supabase
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
          status: 'draft',
        })
        .select()
        .single();

      if (tournamentError || !tournament) {
        setMessage(tournamentError?.message || 'Could not create tournament.');
        setIsCreating(false);
        return;
      }

      const playerRows = Array.from({ length: playerCount }, (_, idx) => ({
        tournament_id: tournament.id,
        slot_number: idx + 1,
        display_name: '',
      }));

      const { error: playersError } = await supabase
        .from('tournament_players')
        .insert(playerRows);

      if (playersError) {
        setMessage(playersError.message);
        setIsCreating(false);
        return;
      }

      router.push(`/tournament/${tournament.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }

    setIsCreating(false);
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">Create Tournament</h1>
          <p className="hero-subtitle">
            Create the event first, then share the join code so players can claim spots and enter their own names.
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card">
        <div className="grid">
          <div>
            <label className="label">Event name</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Organizer name</label>
            <input
              className="input"
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
            />
          </div>

          <Stepper
            label="Number of players"
            value={playerCount}
            min={4}
            max={40}
            onChange={setPlayerCount}
          />

          <Stepper
            label="Courts"
            value={courts}
            min={1}
            max={20}
            onChange={setCourts}
          />

          <Stepper
            label="Rounds"
            value={rounds}
            min={1}
            max={30}
            onChange={setRounds}
          />

          <Stepper
            label="Games to"
            value={gamesTo}
            min={1}
            max={21}
            onChange={setGamesTo}
          />

          <button
            type="button"
            className="button primary"
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create tournament'}
          </button>

          {message ? <div className="notice">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}