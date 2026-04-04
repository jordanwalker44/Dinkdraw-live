'use client';

import { useEffect, useMemo, useState } from 'react';
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
      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 56px', gap: 12 }}>
        <button
          type="button"
          className="button secondary"
          onClick={() => onChange(clamp(value - 1, min, max))}
          disabled={value <= min}
          style={{ height: 56, fontSize: 24 }}
        >
          −
        </button>
        <div className="input" style={{ textAlign: 'center', fontSize: 28, fontWeight: 700 }}>
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
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [format, setFormat] = useState<'singles' | 'doubles'>('doubles');
  const [title, setTitle] = useState('Saturday Round Robin');
  const [organizerName, setOrganizerName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');

  const [playerCount, setPlayerCount] = useState(8);
  const [courts, setCourts] = useState(2);
  const [rounds, setRounds] = useState(4);
  const [gamesTo, setGamesTo] = useState(11);

  const [message, setMessage] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const minPlayers = format === 'singles' ? 3 : 4;
  const playersPerCourt = format === 'singles' ? 2 : 4;
  const maxCourtsAllowed = Math.max(1, Math.floor(playerCount / playersPerCourt));
  const isValidSetup = playerCount >= minPlayers;

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

      setOrganizerName(profile?.display_name || user.email?.split('@')[0] || '');
    }

    loadUser();
  }, [supabase]);

  useEffect(() => {
    if (courts > maxCourtsAllowed) {
      setCourts(maxCourtsAllowed);
    }
  }, [playerCount, format, courts, maxCourtsAllowed]);

  useEffect(() => {
    if (format === 'singles' && playerCount < 3) {
      setPlayerCount(3);
    } else if (format === 'doubles' && playerCount < 4) {
      setPlayerCount(4);
    }
  }, [format]);

  async function handleCreate() {
    setMessage('');

    if (!isValidSetup) {
      setMessage(`You need at least ${minPlayers} players for ${format}.`);
      return;
    }

    if (!title.trim()) {
      setMessage('Please enter a tournament name.');
      return;
    }

    setIsCreating(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setMessage('Sign in first.');
        setIsCreating(false);
        return;
      }

      const safeOrganizerName =
        organizerName.trim() || user.email?.split('@')[0] || 'Organizer';

      await supabase.from('profiles').upsert({
        id: user.id,
        display_name: safeOrganizerName,
        email: user.email,
      });

      const joinCode = makeJoinCode();

      const { data: tournament, error } = await supabase
        .from('tournaments')
        .insert({
          title: title.trim(),
          organizer_user_id: user.id,
          organizer_name: safeOrganizerName,
          join_code: joinCode,
          event_date: eventDate || null,
          event_time: eventTime || null,
          location: location.trim() || null,
          player_count: playerCount,
          courts,
          rounds,
          games_to: gamesTo,
          status: 'draft',
          format,
        })
        .select()
        .single();

      if (error || !tournament) {
        setMessage(error?.message || 'Failed to create tournament.');
        setIsCreating(false);
        return;
      }

      const playerRows = Array.from({ length: playerCount }, (_, i) => ({
        tournament_id: tournament.id,
        slot_number: i + 1,
        display_name: '',
      }));

      await supabase.from('tournament_players').insert(playerRows);

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
            Set up your event in seconds, then share the join code at the courts.
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card">
        <div className="grid">

          <div>
            <label className="label">Format</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <button
                type="button"
                className={`button ${format === 'doubles' ? 'primary' : 'secondary'}`}
                onClick={() => setFormat('doubles')}
              >
                Doubles
              </button>
              <button
                type="button"
                className={`button ${format === 'singles' ? 'primary' : 'secondary'}`}
                onClick={() => setFormat('singles')}
              >
                Singles
              </button>
            </div>
          </div>

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

          <div>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Time</label>
            <input
              className="input"
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Location</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Courts, gym, park..."
            />
          </div>

          <Stepper
            label={`Players (min ${minPlayers})`}
            value={playerCount}
            min={minPlayers}
            max={40}
            onChange={setPlayerCount}
          />

          <Stepper
            label={`Courts (max ${maxCourtsAllowed})`}
            value={courts}
            min={1}
            max={maxCourtsAllowed}
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

          <div className="list-item">
            <div style={{ fontWeight: 700 }}>Quick summary</div>
            <div className="muted">
              {format === 'singles' ? 'Singles' : 'Doubles'} • {playerCount} players • {courts} courts • {rounds} rounds
            </div>
          </div>

          <button
            type="button"
            className="button primary"
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Tournament'}
          </button>

          {message ? <div className="notice">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}
