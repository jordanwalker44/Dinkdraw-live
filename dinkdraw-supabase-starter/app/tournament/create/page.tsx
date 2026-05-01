'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

function makeJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

type FavoriteLocation = {
  id: string;
  name: string;
  location: string;
};

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
    gridTemplateColumns: '64px 1fr 64px',
    gap: 10,
    alignItems: 'center',
  }}
>
        <button
  type="button"
  className="button secondary"
  onClick={() => onChange(clamp(value - 1, min, max))}
  disabled={value <= min}
  style={{
    height: 64,
    fontSize: 28,
    borderRadius: 18,
    borderColor: 'rgba(255,203,5,0.28)',
  }}
>
  −
</button>
        <div
  style={{
    height: 56,
    borderRadius: 16,
    background: '#001428',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 800,
  }}
>
  {value}
</div>
        <button
  type="button"
  className="button secondary"
  onClick={() => onChange(clamp(value + 1, min, max))}
  disabled={value >= max}
  style={{
    height: 64,
    fontSize: 28,
    borderRadius: 18,
    borderColor: 'rgba(255,203,5,0.28)',
  }}
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
  const [tournamentMode, setTournamentMode] = useState<'round_robin' | 'cream_of_the_crop'>('round_robin');
  const [matchFormat, setMatchFormat] = useState<'single' | 'best_of_3'>('single');
  const [doublesMode, setDoublesMode] = useState<'rotating' | 'fixed' | 'mixed'>('rotating');
  const [title, setTitle] = useState('Saturday Round Robin');
  const [organizerName, setOrganizerName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [favoriteLocations, setFavoriteLocations] = useState<FavoriteLocation[]>([]);
  const [selectedFavoriteLocationId, setSelectedFavoriteLocationId] = useState('');
  const [saveLocationForLater, setSaveLocationForLater] = useState(false);
  const [favoriteLocationName, setFavoriteLocationName] = useState('');
  const [allowPlayerScoreReporting, setAllowPlayerScoreReporting] = useState(false);
  const [playoffFormat, setPlayoffFormat] = useState<'none' | 'everyone' | 'top_4' | 'top_8' | 'top_16' | 'custom'>('none');
  const [playoffAdvanceCount, setPlayoffAdvanceCount] = useState(8);
  const [playoffSeedingStyle, setPlayoffSeedingStyle] = useState<'traditional' | 'simple'>('traditional');
  
  const [playerCount, setPlayerCount] = useState(8);
  const [courts, setCourts] = useState(2);
  const [courtLabels, setCourtLabels] = useState<string[]>([]);
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
      const { data: savedLocations } = await supabase
  .from('favorite_locations')
  .select('id, name, location')
  .order('name', { ascending: true });

setFavoriteLocations(savedLocations || []);
    }

    loadUser();
  }, [supabase]);

  useEffect(() => {
    if (courts > maxCourtsAllowed) {
      setCourts(maxCourtsAllowed);
    }
  }, [playerCount, format, courts, maxCourtsAllowed]);
    useEffect(() => {
    setCourtLabels((prev) =>
      Array.from({ length: courts }, (_, i) => prev[i] ?? `Court ${i + 1}`)
    );
  }, [courts]);

  useEffect(() => {
  if (tournamentMode === 'cream_of_the_crop') {
    setFormat('doubles');
    setMatchFormat('single');
    setDoublesMode('rotating');
    setRounds(9);
    setGamesTo(11);

    if (playerCount % 4 !== 0) {
      setPlayerCount(Math.max(4, Math.ceil(playerCount / 4) * 4));
      return;
    }

    setCourts(Math.max(1, Math.floor(playerCount / 4)));
  }
}, [tournamentMode, playerCount]);

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

      if (tournamentMode === 'cream_of_the_crop' && playerCount % 4 !== 0) {
  setMessage('Cream of the Crop requires players in groups of 4.');
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
  match_format: matchFormat,
  doubles_mode: doublesMode,
  tournament_mode: tournamentMode,
  court_labels: courtLabels.map((label, index) => label.trim() || `Court ${index + 1}`),
  allow_player_score_reporting: allowPlayerScoreReporting,

  playoff_format: playoffFormat,
  playoff_advance_count:
    playoffFormat === 'custom'
      ? playoffAdvanceCount
      : playoffFormat === 'everyone'
      ? playerCount
      : playoffFormat === 'top_4'
      ? 4
      : playoffFormat === 'top_8'
      ? 8
      : playoffFormat === 'top_16'
      ? 16
      : null,
  playoff_seeding_style: playoffSeedingStyle,
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

if (saveLocationForLater && location.trim()) {
  await supabase.from('favorite_locations').insert({
    user_id: user.id,
    name: favoriteLocationName.trim() || location.trim(),
    location: location.trim(),
  });
}

router.push(`/tournament/${tournament.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }

    setIsCreating(false);
  }

  return (
    <main className="page-shell">
      <TopNav />

      <div className="card">
        <div className="grid">

          <div>
            <div className="card-title" style={{ color: '#FFCB05', marginBottom: 6 }}>
    Game Setup
  </div>
</div>

            <div>
  <label className="label">Tournament Mode</label>
              {tournamentMode === 'cream_of_the_crop' && (
  <div
    style={{
      marginTop: 10,
      padding: 14,
      borderRadius: 16,
      border: '1px solid rgba(255,203,5,0.25)',
      background: 'rgba(255,203,5,0.06)',
    }}
  >
    <div style={{ fontWeight: 800, marginBottom: 6 }}>
      Cream of the Crop Format
    </div>
    <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
      • Doubles only<br />
      • 3 stages (Sort, Re-Rank, Final)<br />
      • 9 total rounds<br />
      • Players move up/down based on performance
    </div>
  </div>
)}
  <select
    className="input"
    value={tournamentMode}
    onChange={(e) =>
      setTournamentMode(e.target.value as 'round_robin' | 'cream_of_the_crop')
    }
  >
    <option value="round_robin">Round Robin</option>
    <option value="cream_of_the_crop">Cream of the Crop</option>
  </select>
</div>

{tournamentMode === 'round_robin' && (
  <div>
    <label className="label">Player Format</label>
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
)}

{tournamentMode === 'round_robin' && (
  <div>
    <label className="label">Match Format</label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      <button
        type="button"
        className={`button ${matchFormat === 'single' ? 'primary' : 'secondary'}`}
        onClick={() => setMatchFormat('single')}
      >
        Single Game
      </button>
      <button
        type="button"
        className={`button ${matchFormat === 'best_of_3' ? 'primary' : 'secondary'}`}
        onClick={() => setMatchFormat('best_of_3')}
      >
        Best of 3
      </button>
    </div>
  </div>
)}
           
                    {format === 'doubles' && tournamentMode === 'round_robin' ? (
            <div>
              <label className="label">Doubles Mode</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className={`button ${doublesMode === 'rotating' ? 'primary' : 'secondary'}`}
                  onClick={() => setDoublesMode('rotating')}
                >
                  Rotating
                </button>
                <button
                  type="button"
                  className={`button ${doublesMode === 'fixed' ? 'primary' : 'secondary'}`}
                  onClick={() => setDoublesMode('fixed')}
                >
                  Fixed Partners
                </button>
                <button
                  type="button"
                  className={`button ${doublesMode === 'mixed' ? 'primary' : 'secondary'}`}
                  onClick={() => setDoublesMode('mixed')}
                >
                  Mixed Rotate
                </button>
              </div>
            </div>
          ) : null}

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

       <div style={{ maxWidth: 310 }}>
  <label className="label">Date</label>
  <input
    className="input"
    type="date"
    value={eventDate}
    onChange={(e) => setEventDate(e.target.value)}
  />
</div>

<div style={{ maxWidth: 310 }}>
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

  {favoriteLocations.length ? (
    <div style={{ marginBottom: 10 }}>
      <select
        className="input"
        value={selectedFavoriteLocationId}
        onChange={(e) => {
          const selectedId = e.target.value;
          setSelectedFavoriteLocationId(selectedId);

          const selected = favoriteLocations.find((item) => item.id === selectedId);
          if (selected) {
            setLocation(selected.location);
            setFavoriteLocationName(selected.name);
          }
        }}
      >
        <option value="">Choose a saved location...</option>
        {favoriteLocations.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  ) : null}

  <input
    className="input"
    value={location}
    onChange={(e) => {
      setLocation(e.target.value);
      setSelectedFavoriteLocationId('');
    }}
    placeholder="Courts, gym, park..."
  />
</div>

  {tournamentMode === 'round_robin' && playoffFormat === 'custom' && (
  <div>
    <label className="label">Number of Teams Advancing</label>
    <input
      type="number"
      className="input"
      value={playoffAdvanceCount}
      onChange={(e) => setPlayoffAdvanceCount(Number(e.target.value))}
      min={2}
    />
  </div>
)}

{tournamentMode === 'round_robin' && playoffFormat !== 'none' && (
  <div>
    <label className="label">Seeding Style</label>
    <select
      className="input"
      value={playoffSeedingStyle}
      onChange={(e) => setPlayoffSeedingStyle(e.target.value as any)}
    >
      <option value="traditional">Traditional (Byes for top seeds)</option>
      <option value="simple">Simple (1 vs Last)</option>
    </select>
  </div>
)}        

   <div
  className="list-item"
  style={{
    padding: 14,
    borderRadius: 16,
    border: '1px solid rgba(255,203,5,0.18)',
    background: 'rgba(255,203,5,0.05)',
  }}
>
  <label className="label">Saved Location</label>

  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <input
      type="checkbox"
      checked={saveLocationForLater}
      onChange={(e) => setSaveLocationForLater(e.target.checked)}
      style={{ marginTop: 4 }}
    />

    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 800 }}>
        Save this location for next time
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
        Use this court, gym, or park again when creating future tournaments.
      </div>

      {saveLocationForLater ? (
        <input
          className="input"
          value={favoriteLocationName}
          onChange={(e) => setFavoriteLocationName(e.target.value)}
          placeholder="Location nickname, like Legacy Courts"
          style={{ marginTop: 10 }}
        />
      ) : null}
    </div>
  </div>
</div>       

          <div
  className="list-item"
  style={{
    padding: 14,
    borderRadius: 16,
    border: '1px solid rgba(255,203,5,0.18)',
    background: 'rgba(255,203,5,0.05)',
  }}
>
  <label className="label">Score Reporting</label>

  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <input
      type="checkbox"
      checked={allowPlayerScoreReporting}
      onChange={(e) => setAllowPlayerScoreReporting(e.target.checked)}
      style={{ marginTop: 4 }}
    />

    <div>
      <div style={{ fontWeight: 800 }}>
        Allow players to report scores
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
        Joined players can enter match scores from their device. The organizer can still edit scores.
      </div>
    </div>
  </div>
</div>

          <Stepper
  label={`Players (min ${minPlayers})`}
  value={playerCount}
  min={minPlayers}
  max={40}
  onChange={(next) => {
    if (tournamentMode === 'cream_of_the_crop') {
      const diff = next - playerCount;

      if (diff > 0) {
        setPlayerCount(Math.min(40, playerCount + 4));
      } else if (diff < 0) {
        setPlayerCount(Math.max(minPlayers, playerCount - 4));
      }
    } else {
      setPlayerCount(next);
    }
  }}
/>

          {tournamentMode === 'round_robin' ? (
  <Stepper
    label={`Courts (max ${maxCourtsAllowed})`}
    value={courts}
    min={1}
    max={maxCourtsAllowed}
    onChange={setCourts}
  />
) : (
  <div>
    <label className="label">Courts</label>
    <div
      style={{
        height: 56,
        borderRadius: 16,
        background: '#001428',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 800,
      }}
    >
      {courts} (auto-calculated)
    </div>
  </div>
)}

          {tournamentMode === 'round_robin' && (
  <Stepper
    label="Rounds"
    value={rounds}
    min={1}
    max={30}
    onChange={setRounds}
  />
)}

          <Stepper
            label="Games to"
            value={gamesTo}
            min={1}
            max={21}
            onChange={setGamesTo}
          />

          <div
  className="list-item"
  style={{
    border: '1px solid rgba(255,203,5,0.25)',
    background: 'rgba(255,203,5,0.06)',
  }}
>
  <div
    style={{
      fontWeight: 800,
      marginBottom: 6,
      color: '#FFCB05',
      fontSize: 15,
    }}
  >
    Tournament Summary
  </div>

 <div style={{ fontSize: 15, lineHeight: 1.5 }}>
  {tournamentMode === 'cream_of_the_crop' ? (
    <>
      Cream of the Crop • Doubles • 3 stages (9 rounds) • {playerCount} players • {courts} courts
    </>
  ) : (
    <>
      {format === 'singles' ? 'Singles' : 'Doubles'} •{' '}
      {matchFormat === 'best_of_3' ? 'Best of 3' : 'Single Game'} •{' '}
      {playerCount} players • {courts} courts • {rounds} rounds
    </>
  )}
</div>
</div>

          <div className="muted" style={{ marginBottom: 8, textAlign: 'center' }}>
  Review your setup, then create your tournament
</div>

<div style={{ marginTop: 16, marginBottom: 8 }}>
  <button
    type="button"
    className="button primary"
    onClick={handleCreate}
    disabled={isCreating}
    style={{
      height: 56,
      fontSize: 16,
      borderRadius: 16,
    }}
  >
    {isCreating ? 'Creating...' : 'Create Tournament'}
  </button>
</div>

{message ? <div className="notice">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}
