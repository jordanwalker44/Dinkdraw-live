'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../../../components/TopNav';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

type TournamentRow = {
  id: string;
  title: string | null;
  organizer_user_id: string;
  organizer_name: string | null;
  join_code: string;
  status: string;
  player_count: number;
  courts: number;
  rounds: number;
  format: string | null;
  tournament_mode: string | null;
  location: string | null;
  created_at: string | null;
  started_at: string | null;
  event_date: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type PlayerRow = {
  tournament_id: string;
  claimed_by_user_id: string | null;
  display_name: string | null;
};

type LocationUsageRow = {
  location: string;
  tournament_count: number;
  participant_uses: number;
  claimed_uses: number;
  manual_uses: number;
  distinct_claimed_accounts: number;
  latest_tournament_at: string | null;
};

type MatchRow = {
  tournament_id: string;
  is_complete: boolean;
  is_bye: boolean;
};

type MonitorTournament = TournamentRow & {
  organizerEmail: string;
  organizerDisplayName: string;
  participantUseCount: number;
  manualCount: number;
  claimedCount: number;
  completeMatchCount: number;
  playableMatchCount: number;
};

function formatStatus(status: string) {
  if (status === 'started') return 'Live';
  if (status === 'completed') return 'Complete';
  if (status === 'draft') return 'Draft';
  return status || 'Unknown';
}

function statusClass(status: string) {
  if (status === 'started') return 'tag green';
  if (status === 'completed') return 'tag';
  return 'tag';
}

function formatMode(tournament: TournamentRow) {
  if (tournament.tournament_mode === 'cream_of_the_crop') return 'Cream of the Crop';
  if (tournament.format === 'singles') return 'Singles';
  return 'Round Robin';
}

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function AdminMonitorPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState('');
  const [tournaments, setTournaments] = useState<MonitorTournament[]>([]);
  const [locationUsage, setLocationUsage] = useState<LocationUsageRow[]>([]);

  async function loadMonitor() {
    setIsLoading(true);
    setMessage('');

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setIsAdmin(false);
      setTournaments([]);
      setLocationUsage([]);
      setMessage('Sign in with your DinkDraw admin account to view tournament monitoring.');
      setIsLoading(false);
      return;
    }

    const { data: adminData, error: adminError } = await supabase.rpc('is_dinkdraw_admin');
    if (adminError || adminData !== true) {
      setIsAdmin(false);
      setTournaments([]);
      setLocationUsage([]);
      setMessage(adminError?.message || 'This page is only available to DinkDraw admins.');
      setIsLoading(false);
      return;
    }

    setIsAdmin(true);

    const [tournamentsResult, locationUsageResult] = await Promise.all([
      supabase
        .from('tournaments')
        .select(
          'id, title, organizer_user_id, organizer_name, join_code, status, player_count, courts, rounds, format, tournament_mode, location, created_at, started_at, event_date',
        )
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.rpc('admin_get_location_usage_report'),
    ]);

    if (tournamentsResult.error || locationUsageResult.error) {
      setMessage(
        tournamentsResult.error?.message ||
          locationUsageResult.error?.message ||
          'Could not load tournament reporting.',
      );
      setTournaments([]);
      setLocationUsage([]);
      setIsLoading(false);
      return;
    }

    const rows = (tournamentsResult.data || []) as TournamentRow[];
    setLocationUsage((locationUsageResult.data || []) as LocationUsageRow[]);
    const tournamentIds = rows.map((tournament) => tournament.id);
    const organizerIds = Array.from(new Set(rows.map((tournament) => tournament.organizer_user_id)));

    const [profilesResult, playersResult, matchesResult] = await Promise.all([
      organizerIds.length
        ? supabase.rpc('admin_get_profiles_by_ids', { p_user_ids: organizerIds })
        : Promise.resolve({ data: [], error: null }),
      tournamentIds.length
        ? supabase
            .from('tournament_players')
            .select('tournament_id, claimed_by_user_id, display_name')
            .in('tournament_id', tournamentIds)
        : Promise.resolve({ data: [], error: null }),
      tournamentIds.length
        ? supabase
            .from('matches')
            .select('tournament_id, is_complete, is_bye')
            .in('tournament_id', tournamentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error || playersResult.error || matchesResult.error) {
      setMessage(
        profilesResult.error?.message ||
          playersResult.error?.message ||
          matchesResult.error?.message ||
          'Could not load tournament monitor.',
      );
      setTournaments([]);
      setLocationUsage([]);
      setIsLoading(false);
      return;
    }

    const profilesById = new Map(
      ((profilesResult.data || []) as ProfileRow[]).map((profile) => [profile.id, profile]),
    );
    const players = (playersResult.data || []) as PlayerRow[];
    const matches = (matchesResult.data || []) as MatchRow[];

    setTournaments(
      rows.map((tournament) => {
        const profile = profilesById.get(tournament.organizer_user_id);
        const tournamentPlayers = players.filter((player) => player.tournament_id === tournament.id);
        const tournamentMatches = matches.filter(
          (match) => match.tournament_id === tournament.id && !match.is_bye,
        );
        const usedPlayers = tournamentPlayers.filter(
          (player) => !!player.claimed_by_user_id || !!player.display_name?.trim(),
        );
        const claimedCount = usedPlayers.filter((player) => !!player.claimed_by_user_id).length;

        return {
          ...tournament,
          organizerEmail: profile?.email || '',
          organizerDisplayName:
            tournament.organizer_name || profile?.display_name || profile?.email || 'Unknown organizer',
          participantUseCount: usedPlayers.length,
          claimedCount,
          manualCount: usedPlayers.length - claimedCount,
          playableMatchCount: tournamentMatches.length,
          completeMatchCount: tournamentMatches.filter((match) => match.is_complete).length,
        };
      }),
    );

    setIsLoading(false);
  }

  useEffect(() => {
    void loadMonitor();
  }, []);

  return (
    <main className="page-shell admin-monitor-shell">
      <TopNav />

      <div className="card admin-monitor-card">
        <div className="admin-monitor-header">
          <div className="admin-monitor-heading">
            <div className="card-title admin-monitor-title" style={{ color: '#FFCB05' }}>
              Tournament Monitor
            </div>
            <div className="card-subtitle admin-monitor-subtitle">
              Recent DinkDraw tournaments with quick links back into live and completed events.
            </div>
          </div>

          <button
            type="button"
            className="button secondary"
            onClick={loadMonitor}
            disabled={isLoading}
            style={{ width: 'auto' }}
          >
            Refresh
          </button>
        </div>

        {message ? <div className="notice" style={{ marginTop: 14 }}>{message}</div> : null}

        {isLoading ? <div className="muted" style={{ marginTop: 14 }}>Loading monitor...</div> : null}

        {!isLoading && isAdmin ? (
          <div className="grid" style={{ gap: 12, marginTop: 16 }}>
            <section className="admin-usage-section">
              <div className="admin-usage-heading">
                <h2>Location Usage</h2>
                <div className="muted">
                  Filled roster spots by tournament location. Manual entries count as participant
                  uses, but not as confirmed app accounts.
                </div>
              </div>

              {locationUsage.length ? (
                <div className="admin-usage-grid">
                  {locationUsage.map((row) => (
                    <div className="list-item admin-usage-item" key={row.location}>
                      <div className="admin-usage-location">{row.location}</div>
                      <div className="admin-usage-total">
                        {row.participant_uses} participant {row.participant_uses === 1 ? 'use' : 'uses'}
                      </div>
                      <div className="admin-usage-breakdown">
                        <span>
                          {row.tournament_count}{' '}
                          {row.tournament_count === 1 ? 'tournament' : 'tournaments'}
                        </span>
                        <span>{row.claimed_uses} claimed</span>
                        <span>{row.manual_uses} manual</span>
                        <span>{row.distinct_claimed_accounts} distinct accounts</span>
                      </div>
                      <div className="muted admin-usage-latest">
                        Latest tournament: {formatDate(row.latest_tournament_at) || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">No filled tournament rosters found yet.</div>
              )}
            </section>

            <div className="admin-monitor-section-title">Recent Tournaments</div>
            {tournaments.length ? (
              tournaments.map((tournament) => (
                <div
                  key={tournament.id}
                  className="list-item admin-monitor-item"
                  style={{
                    borderColor:
                      tournament.status === 'started'
                        ? 'rgba(34,197,94,0.32)'
                        : tournament.status === 'completed'
                        ? 'rgba(255,203,5,0.2)'
                        : 'rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="admin-monitor-item-header">
                    <div className="admin-monitor-item-main">
                      <div className="admin-monitor-item-title">
                        {tournament.title || 'Untitled Tournament'}
                      </div>
                      <div className="muted admin-monitor-meta">
                        {formatMode(tournament)} • {tournament.player_count} players • {tournament.courts} courts •{' '}
                        {tournament.rounds} rounds
                      </div>
                    </div>

                    <span className={statusClass(tournament.status)}>
                      {formatStatus(tournament.status)}
                    </span>
                  </div>

                  <div
                    className="admin-monitor-details"
                    style={{
                      display: 'grid',
                      gap: 8,
                      marginTop: 12,
                      fontSize: 14,
                    }}
                  >
                    <div>
                      <strong>Organizer:</strong> {tournament.organizerDisplayName}
                      {tournament.organizerEmail ? ` • ${tournament.organizerEmail}` : ''}
                    </div>
                    <div>
                      <strong>Location:</strong> {tournament.location || 'No location entered'}
                    </div>
                    <div>
                      <strong>Participant uses:</strong> {tournament.participantUseCount}
                      {' • '}{tournament.claimedCount} claimed • {tournament.manualCount} manual
                    </div>
                    <div>
                      <strong>Matches:</strong> {tournament.completeMatchCount}/{tournament.playableMatchCount || 0}{' '}
                      complete
                    </div>
                    <div>
                      <strong>Created:</strong> {formatDate(tournament.created_at) || '-'}
                      {tournament.started_at ? ` • Started ${formatDate(tournament.started_at)}` : ''}
                    </div>
                    <div>
                      <strong>Join code:</strong> {tournament.join_code}
                    </div>
                  </div>

                  <div className="admin-monitor-actions">
                    <Link className="button secondary" href={`/tournament/${tournament.id}`}>
                      Open
                    </Link>
                    <Link className="button secondary" href={`/tournament/view/${tournament.id}`}>
                      Public
                    </Link>
                    <Link className="button secondary" href={`/tournament/${tournament.id}/results`}>
                      Results
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">No tournaments found yet.</div>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
