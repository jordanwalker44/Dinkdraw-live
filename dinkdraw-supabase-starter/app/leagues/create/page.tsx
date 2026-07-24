'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '../../../components/TopNav';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

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
  const [location, setLocation] = useState('');
  const [playerCount, setPlayerCount] = useState(12);
  const [sessionCount, setSessionCount] = useState(11);
  const [courts, setCourts] = useState(3);
  const [gamesTo, setGamesTo] = useState(11);
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
  const matchesPerPlayer = (teamCount - 1) * 2;

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

    router.push(`/leagues/${leagueId}`);
  }

  return (
    <main className="page-shell league-page league-create-page">
      <TopNav />
      <div className="card">
        <div className="card-title" style={{ color: '#FFCB05' }}>Create Rotating Doubles League</div>
        <div className="card-subtitle">
          Partners stay together for one session, play every other team twice, and change the following week.
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
              <div className="league-native-field"><label className="label">Start time</label><input className="input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
            </div>
            <div><label className="label">Location</label><input className="input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Club or court location" /></div>
            <div className="grid two">
              <div>
                <label className="label">Regular players</label>
                <select className="input" value={playerCount} onChange={(event) => setPlayerCount(Number(event.target.value))}>
                  {[8, 10, 12, 14, 16, 18, 20].map((count) => <option key={count} value={count}>{count}</option>)}
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
            <div className="grid two">
              <div><label className="label">Courts required</label><input className="input" type="number" value={courts} readOnly /></div>
              <div><label className="label">Play each match to</label><input className="input" type="number" min={1} max={99} value={gamesTo} onChange={(event) => setGamesTo(Number(event.target.value))} /></div>
            </div>

            <div className="notice">
              <strong>{teamCount} teams</strong> • {opponentRounds} opponent rounds • {matchesPerPlayer} matches per player each session
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
