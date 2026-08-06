'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '../../../components/TopNav';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { detectDeviceTimeZone, timeZoneOptions } from '../../../lib/time-zones';

type Organization = { id: string; name: string; hasLeagueAccess: boolean };

function localDateInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function CreateLeaguePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [name, setName] = useState('Rotating Doubles League');
  const [startDate, setStartDate] = useState(localDateInput());
  const [startTime, setStartTime] = useState('18:00');
  const [timeZone, setTimeZone] = useState('America/Denver');
  const [location, setLocation] = useState('');
  const [playerCount, setPlayerCount] = useState(12);
  const [sessionCount, setSessionCount] = useState(11);
  const [courts, setCourts] = useState(3);
  const [gamesTo, setGamesTo] = useState(11);
  const [gameFormat, setGameFormat] = useState<'single' | 'two_game' | 'best_of_3'>('two_game');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setMessage('Sign in before creating a league.');
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase.from('profiles').select('time_zone').eq('id', user.id).maybeSingle();
      const detectedTimeZone = detectDeviceTimeZone();
      const preferredTimeZone = profile?.time_zone || detectedTimeZone || 'America/Denver';
      setTimeZone(preferredTimeZone);
      if (!profile?.time_zone && detectedTimeZone) {
        void supabase.from('profiles').update({ time_zone: detectedTimeZone }).eq('id', user.id);
      }

      const { data: memberships, error } = await supabase
        .from('organization_members')
        .select('organization_id, role, organizations(id, name)')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin']);

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const organizationIds = (memberships || []).map((item) => item.organization_id);
      const { data: entitlements } = organizationIds.length
        ? await supabase
            .from('feature_entitlements')
            .select('organization_id')
            .in('organization_id', organizationIds)
            .eq('feature_key', 'league_mode')
            .eq('status', 'active')
        : { data: [] as { organization_id: string }[] };
      const enabledIds = new Set((entitlements || []).map((item) => item.organization_id));

      const loaded = (memberships || []).map((membership: any) => ({
        id: membership.organizations.id,
        name: membership.organizations.name,
        hasLeagueAccess: enabledIds.has(membership.organization_id),
      }));
      setOrganizations(loaded);
      const requestedOrganizationId = new URLSearchParams(window.location.search).get('organizationId');
      const requestedOrganization = loaded.find((item) => item.id === requestedOrganizationId && item.hasLeagueAccess);
      setOrganizationId(requestedOrganization?.id || loaded.find((item) => item.hasLeagueAccess)?.id || loaded[0]?.id || '');
      setLoading(false);
    }

    void load();
  }, [supabase]);

  useEffect(() => {
    setSessionCount(playerCount - 1);
    setCourts(Math.max(1, Math.floor(playerCount / 4)));
  }, [playerCount]);

  const selectedOrganization = organizations.find((item) => item.id === organizationId);
  const teamCount = playerCount / 2;
  const opponentRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  const gamesPerMatch = gameFormat === 'single' ? 1 : gameFormat === 'two_game' ? 2 : 3;

  async function createLeague() {
    setMessage('');
    if (!selectedOrganization?.hasLeagueAccess) {
      setMessage('This organization does not have League access. Contact DinkDraw to enable this premium feature.');
      return;
    }
    if (!name.trim()) {
      setMessage('Enter a league name.');
      return;
    }
    if (!startTime) {
      setMessage('Choose a start time so attendance reminders can be scheduled.');
      return;
    }
    if (playerCount % 4 !== 0) {
      setMessage('Rotating doubles leagues require a player count in multiples of four.');
      return;
    }

    setCreating(true);
    const { data: leagueId, error } = await supabase.rpc('create_rotating_doubles_league', {
      p_organization_id: organizationId,
      p_name: name.trim(),
      p_start_date: startDate,
      p_session_count: sessionCount,
      p_regular_player_count: playerCount,
      p_courts: courts,
      p_games_to: gamesTo,
      p_default_time: startTime || null,
      p_default_location: location.trim() || null,
    });

    if (error || !leagueId) {
      setMessage(error?.message || 'Could not create the league.');
      setCreating(false);
      return;
    }

    const { error: formatError } = await supabase
      .from('leagues')
      .update({ game_format: gameFormat, matches_per_opponent: gamesPerMatch, time_zone: timeZone })
      .eq('id', leagueId);
    if (formatError) {
      setMessage(`League created, but the game format could not be saved: ${formatError.message}`);
      setCreating(false);
      return;
    }

    router.push(`/leagues/${leagueId}`);
  }

  return (
    <main className="page-shell league-page league-create-page">
      <TopNav />
      <div className="card">
        <div className="card-title" style={{ color: '#FFCB05' }}>Create Rotating Doubles League</div>
        <div className="card-subtitle">
          Partners stay together for one session, play every other team, and change the following week.
        </div>

        {message ? <div className="notice" style={{ margin: '14px 0' }}>{message}</div> : null}
        {loading ? <div className="muted">Loading organization access...</div> : (
          <div className="grid" style={{ gap: 14, marginTop: 16 }}>
            <div>
              <label className="label">Club or organization</label>
              <select className="input" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}{organization.hasLeagueAccess ? '' : ' — League access required'}
                  </option>
                ))}
              </select>
            </div>
            <div><label className="label">League name</label><input className="input" value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="grid two">
              <div className="league-native-field"><label className="label">First play date</label><input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
              <div className="league-native-field"><label className="label">Start time</label><input className="input" type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
            </div>
            <div><label className="label">League timezone</label><select className="input" value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{timeZoneOptions(timeZone).map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select><div className="muted" style={{ marginTop: 5, fontSize: 12 }}>Defaults to your profile or device timezone. Attendance reminders use this timezone.</div></div>
            <div><label className="label">Location</label><input className="input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Club or court location" /></div>
            <div className="grid two">
              <div>
                <label className="label">Regular players</label>
                <select className="input" value={playerCount} onChange={(event) => setPlayerCount(Number(event.target.value))}>
                  {[4, 8, 12, 16, 20, 24, 28, 32].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Length of league</label>
                <select className="input" value={sessionCount} onChange={(event) => setSessionCount(Number(event.target.value))}>
                  {Array.from({ length: 52 }, (_, index) => index + 1).map((weeks) => (
                    <option key={weeks} value={weeks}>{weeks} {weeks === 1 ? 'week' : 'weeks'}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Game format</label>
              <select className="input" value={gameFormat} onChange={(event) => setGameFormat(event.target.value as typeof gameFormat)}>
                <option value="single">Single game</option>
                <option value="two_game">Two games (both always played)</option>
                <option value="best_of_3">Best 2 of 3</option>
              </select>
            </div>
            <div className="grid two">
              <div><label className="label">Courts required</label><input className="input" type="number" value={courts} readOnly /></div>
              <div><label className="label">Play each match to</label><input className="input" type="number" min={1} max={99} value={gamesTo} onChange={(event) => setGamesTo(Number(event.target.value))} /></div>
            </div>

            <div className="notice">
              <strong>{teamCount} teams</strong> • {opponentRounds} opponent rounds • {gamesPerMatch === 3 ? 'up to 3' : gamesPerMatch} {gamesPerMatch === 1 ? 'game' : 'games'} per opponent
              <br />A complete partnership cycle is {playerCount - 1} sessions.
            </div>

            <button className="button primary" type="button" disabled={creating || !selectedOrganization?.hasLeagueAccess} onClick={createLeague}>
              {creating ? 'Creating league...' : 'Create League and Partnership Plan'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
