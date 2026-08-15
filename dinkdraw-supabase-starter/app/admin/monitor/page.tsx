'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../../../components/TopNav';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

type TournamentRow = {
  id: string;
  title: string | null;
  join_code: string;
  status: string;
  location: string | null;
  created_at: string | null;
  started_at: string | null;
  finalized_at: string | null;
  event_date: string | null;
};

type LocationUsageRow = {
  location: string;
  tournament_count: number;
  tournament_ids: string[] | null;
  claimed_user_ids: string[] | null;
};

type GeographyRow = {
  key: string;
  label: string;
  userIds: Set<string>;
  tournamentIds: Set<string>;
};

type GeographyFilter = { type: 'country' | 'state'; key: string; label: string } | null;

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

const COUNTRY_ALIASES: Record<string, string> = {
  us: 'United States', usa: 'United States', 'u.s.': 'United States',
  'u.s.a.': 'United States', 'united states': 'United States',
  'united states of america': 'United States', canada: 'Canada', ca: 'Canada',
  mexico: 'Mexico', mx: 'Mexico',
};

function getUsState(location: string) {
  const parts = location.split(',').map((part) => part.trim());
  for (const part of parts) {
    const abbreviation = part.match(/\b([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/)?.[1];
    if (abbreviation && US_STATES[abbreviation]) {
      return { code: abbreviation, name: US_STATES[abbreviation] };
    }
    const normalized = part.replace(/\s+\d{5}(?:-\d{4})?$/, '').toLowerCase();
    const state = Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === normalized);
    if (state) return { code: state[0], name: state[1] };
  }
  return null;
}

function getCountry(location: string) {
  if (getUsState(location)) return { key: 'US', name: 'United States' };
  const lastPart = location.split(',').at(-1)?.trim().toLowerCase() || '';
  const name = COUNTRY_ALIASES[lastPart];
  if (name) return { key: name === 'United States' ? 'US' : name, name };
  return { key: 'unknown', name: 'Country not recognized' };
}

function addUsage(
  map: Map<string, GeographyRow>,
  key: string,
  label: string,
  row: LocationUsageRow,
) {
  const current = map.get(key) || {
    key,
    label,
    userIds: new Set<string>(),
    tournamentIds: new Set<string>(),
  };
  for (const userId of row.claimed_user_ids || []) current.userIds.add(userId);
  for (const tournamentId of row.tournament_ids || []) current.tournamentIds.add(tournamentId);
  map.set(key, current);
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(value));
}

function formatStatus(status: string) {
  if (status === 'started') return 'Live';
  if (status === 'completed') return 'Finished';
  if (status === 'draft') return 'Not started';
  return status || 'Unknown';
}

export default function AdminMonitorPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState('');
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [locationUsage, setLocationUsage] = useState<LocationUsageRow[]>([]);
  const [filter, setFilter] = useState<GeographyFilter>(null);
  const [search, setSearch] = useState('');

  const geography = useMemo(() => {
    const countries = new Map<string, GeographyRow>();
    const states = new Map<string, GeographyRow>();
    for (const row of locationUsage) {
      const country = getCountry(row.location);
      addUsage(countries, country.key, country.name, row);
      const state = getUsState(row.location);
      if (state) addUsage(states, state.code, state.name, row);
    }
    const sortRows = (rows: GeographyRow[]) => rows.sort(
      (a, b) => b.userIds.size - a.userIds.size || b.tournamentIds.size - a.tournamentIds.size,
    );
    return { countries: sortRows([...countries.values()]), states: sortRows([...states.values()]) };
  }, [locationUsage]);

  const filteredTournaments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tournaments.filter((tournament) => {
      const location = tournament.location?.trim() || 'No location entered';
      const geographyRows = filter?.type === 'state' ? geography.states : geography.countries;
      const selectedIds = filter ? geographyRows.find((row) => row.key === filter.key)?.tournamentIds : null;
      const matchesGeography = !filter || selectedIds?.has(tournament.id) === true;
      const matchesSearch = !query || [tournament.title, location, tournament.join_code]
        .some((value) => value?.toLowerCase().includes(query));
      return matchesGeography && matchesSearch;
    });
  }, [filter, geography, search, tournaments]);

  const totals = useMemo(() => ({
    created: tournaments.length,
    started: tournaments.filter((row) => row.started_at || row.status === 'started' || row.status === 'completed').length,
    finished: tournaments.filter((row) => row.finalized_at || row.status === 'completed').length,
  }), [tournaments]);

  async function loadMonitor() {
    setIsLoading(true);
    setMessage('');
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setIsAdmin(false);
      setMessage('Sign in with your DinkDraw admin account to view tournament monitoring.');
      setIsLoading(false);
      return;
    }
    const { data: adminData, error: adminError } = await supabase.rpc('is_dinkdraw_admin');
    if (adminError || adminData !== true) {
      setIsAdmin(false);
      setMessage(adminError?.message || 'This page is only available to DinkDraw admins.');
      setIsLoading(false);
      return;
    }
    setIsAdmin(true);
    const [tournamentResult, usageResult] = await Promise.all([
      (async () => {
        const rows: TournamentRow[] = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const page = await supabase.from('tournaments')
            .select('id, title, join_code, status, location, created_at, started_at, finalized_at, event_date')
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);
          if (page.error) return { data: null, error: page.error };
          const pageRows = (page.data || []) as TournamentRow[];
          rows.push(...pageRows);
          if (pageRows.length < pageSize) return { data: rows, error: null };
        }
      })(),
      supabase.rpc('admin_get_geography_usage_report'),
    ]);
    if (tournamentResult.error || usageResult.error) {
      setMessage(tournamentResult.error?.message || usageResult.error?.message || 'Could not load monitoring.');
      setTournaments([]);
      setLocationUsage([]);
    } else {
      setTournaments((tournamentResult.data || []) as TournamentRow[]);
      setLocationUsage((usageResult.data || []) as LocationUsageRow[]);
    }
    setIsLoading(false);
  }

  useEffect(() => { void loadMonitor(); }, []);

  function geographyButton(type: 'country' | 'state', row: GeographyRow) {
    const isSelected = filter?.type === type && filter.key === row.key;
    return (
      <button
        type="button"
        className={`admin-geography-row${isSelected ? ' selected' : ''}`}
        key={row.key}
        onClick={() => setFilter(isSelected ? null : { type, key: row.key, label: row.label })}
      >
        <span>{row.label}</span>
        <span className="admin-geography-counts">
          <strong>{row.userIds.size}</strong> {row.userIds.size === 1 ? 'user' : 'users'}
          <small>{row.tournamentIds.size} {row.tournamentIds.size === 1 ? 'tournament' : 'tournaments'}</small>
        </span>
      </button>
    );
  }

  return (
    <main className="page-shell admin-monitor-shell">
      <TopNav />
      <div className="card admin-monitor-card">
        <div className="admin-monitor-header">
          <div>
            <div className="card-title admin-monitor-title" style={{ color: '#FFCB05' }}>Tournament Monitor</div>
            <div className="card-subtitle admin-monitor-subtitle">A simple view of DinkDraw activity.</div>
          </div>
          <button type="button" className="button secondary" onClick={loadMonitor} disabled={isLoading}>Refresh</button>
        </div>
        {message ? <div className="notice" style={{ marginTop: 14 }}>{message}</div> : null}
        {isLoading ? <div className="muted" style={{ marginTop: 14 }}>Loading monitor...</div> : null}

        {!isLoading && isAdmin ? (
          <div className="admin-monitor-content">
            <section className="admin-stat-grid" aria-label="Tournament totals">
              <div className="admin-stat-card"><span>Created</span><strong>{totals.created}</strong></div>
              <div className="admin-stat-card"><span>Started</span><strong>{totals.started}</strong></div>
              <div className="admin-stat-card"><span>Finished</span><strong>{totals.finished}</strong></div>
            </section>

            <div className="admin-geography-grid">
              <section className="admin-geography-section">
                <h2>Users by country</h2>
                <div className="muted">Distinct signed-in players</div>
                <div className="admin-geography-list">
                  {geography.countries.map((row) => geographyButton('country', row))}
                </div>
              </section>
              <section className="admin-geography-section">
                <h2>Users by state</h2>
                <div className="muted">Distinct signed-in players in the U.S.</div>
                <div className="admin-geography-list">
                  {geography.states.map((row) => geographyButton('state', row))}
                </div>
              </section>
            </div>

            <section className="admin-tournament-section">
              <div className="admin-tournament-heading">
                <div>
                  <h2>{filter ? `Tournaments in ${filter.label}` : 'All tournaments'}</h2>
                  <div className="muted">{filteredTournaments.length} shown</div>
                </div>
                {filter ? <button type="button" className="button secondary" onClick={() => setFilter(null)}>Clear filter</button> : null}
              </div>
              <input
                className="admin-tournament-search"
                type="search"
                placeholder="Search name, location, or join code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="admin-tournament-list">
                {filteredTournaments.map((tournament) => (
                  <div className="admin-tournament-row" key={tournament.id}>
                    <div className="admin-tournament-main">
                      <strong>{tournament.title || 'Untitled Tournament'}</strong>
                      <span>{tournament.location || 'No location entered'}</span>
                    </div>
                    <div className="admin-tournament-meta">
                      <span className={tournament.status === 'started' ? 'tag green' : 'tag'}>{formatStatus(tournament.status)}</span>
                      <span>{formatDate(tournament.event_date || tournament.created_at)}</span>
                      <span>Code {tournament.join_code}</span>
                    </div>
                    <Link className="button secondary" href={`/tournament/${tournament.id}`}>Open</Link>
                  </div>
                ))}
                {!filteredTournaments.length ? <div className="muted">No tournaments match this view.</div> : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
