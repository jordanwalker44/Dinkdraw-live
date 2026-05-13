'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

type Tournament = {
  id: string;
  title: string;
  join_code: string;
  organizer_user_id: string;
  organizer_name: string | null;
  created_at?: string;
  status?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  location?: string | null;
};

type PlayerSlot = {
  tournament_id: string;
  claimed_by_user_id: string | null;
};

function formatCreatedAt(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusLabel(status?: string | null) {
  if (status === 'completed') return 'Completed';
  if (status === 'started') return 'In Progress';
  return 'Setup';
}

function statusTagClass(status?: string | null) {
  if (status === 'completed') return 'tag';
  if (status === 'started') return 'tag green';
  return 'tag';
}

function eventSummary(tournament: Tournament) {
  const parts = [tournament.event_date, tournament.event_time, tournament.location].filter(Boolean);
  return parts.length ? parts.join(' • ') : 'No event details yet';
}

export default function MyTournamentsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [organized, setOrganized] = useState<Tournament[]>([]);
  const [joined, setJoined] = useState<Tournament[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'organized' | 'joined'>('organized');

  useEffect(() => {
    async function load() {
  setIsLoading(true);
  setMessage('');

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;

  if (!user) {
    setMessage('Sign in to view your tournaments.');
    setIsLoading(false);
    return;
  }

  const { data: organizedData, error: organizedError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('organizer_user_id', user.id)
    .order('created_at', { ascending: false });

  if (organizedError) {
    setMessage(organizedError.message);
    setIsLoading(false);
    return;
  }

  const { data: joinedSlots, error: joinedError } = await supabase
    .from('tournament_players')
    .select('tournament_id, claimed_by_user_id')
    .eq('claimed_by_user_id', user.id);

  if (joinedError) {
    setMessage(joinedError.message);
    setIsLoading(false);
    return;
  }

  const joinedIds = Array.from(
    new Set((joinedSlots || []).map((row: PlayerSlot) => row.tournament_id))
  );

  let joinedTournaments: Tournament[] = [];

  if (joinedIds.length > 0) {
    const { data: joinedData, error: joinedTournamentError } = await supabase
      .from('tournaments')
      .select('*')
      .in('id', joinedIds)
      .order('created_at', { ascending: false });

    if (joinedTournamentError) {
      setMessage(joinedTournamentError.message);
      setIsLoading(false);
      return;
    }

    joinedTournaments = joinedData || [];
  }

  setOrganized(organizedData || []);
  setJoined(joinedTournaments);
  setIsLoading(false);
}

    load();
  }, [supabase]);

  return (
    <main className="page-shell">
      <div
  className="card soft-enter"
  style={{
    marginBottom: 14,
    padding: 18,
    background:
      'linear-gradient(180deg, rgba(255,203,5,0.12), rgba(255,255,255,0.025))',
    border: '1px solid rgba(255,203,5,0.18)',
    boxShadow:
      '0 1px 0 rgba(255,255,255,0.05) inset, 0 14px 34px rgba(0,0,0,0.24)',
  }}
>
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 14,
    }}
  >
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#FFCB05',
          marginBottom: 8,
        }}
      >
        Dashboard
      </div>

      <h1
        style={{
          margin: 0,
          fontSize: 28,
          lineHeight: 1.05,
          fontWeight: 950,
          letterSpacing: '-0.04em',
        }}
      >
        My Tournaments
      </h1>

      <p
        className="muted"
        style={{
          margin: '8px 0 0',
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        Pick up where you left off, manage events, and jump back into your latest tournaments.
      </p>
    </div>

    <div
      aria-hidden="true"
      style={{
        width: 46,
        height: 46,
        borderRadius: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,203,5,0.12)',
        border: '1px solid rgba(255,203,5,0.22)',
        boxShadow: '0 10px 24px rgba(255,203,5,0.10)',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 24 }}>🏟️</span>
    </div>
  </div>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 10,
      marginTop: 16,
    }}
  >
    <div
      className="list-item"
      style={{
        padding: 12,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.035)',
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        Organized
      </div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{organized.length}</div>
    </div>

    <div
      className="list-item"
      style={{
        padding: 12,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.035)',
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        Played
      </div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{joined.length}</div>
    </div>
  </div>
</div>

      <TopNav />

      {message ? <div className="notice" style={{ marginBottom: 16 }}>{message}</div> : null}

      {isLoading ? (
        <div className="card">
          <div className="muted">Loading tournaments...</div>
        </div>
      ) : (
        <div className="card">
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 8,
      marginBottom: 16,
    }}
  >
    <button
      type="button"
      className={`button ${viewMode === 'organized' ? 'primary' : 'secondary'}`}
      onClick={() => setViewMode('organized')}
      style={{ minHeight: 44, fontWeight: 900 }}
    >
      Organized
    </button>

    <button
      type="button"
      className={`button ${viewMode === 'joined' ? 'primary' : 'secondary'}`}
      onClick={() => setViewMode('joined')}
      style={{ minHeight: 44, fontWeight: 900 }}
    >
      Played
    </button>
  </div>

  <div className="card-title">
    {viewMode === 'organized' ? 'Organized by me' : 'Played by me'}
  </div>

  <div className="card-subtitle">
    {viewMode === 'organized'
      ? 'Tournaments you created.'
      : 'Tournaments where you participated.'}
  </div>

  {viewMode === 'organized' ? (
    !organized.length ? (
      <div className="muted">No organized tournaments yet.</div>
    ) : (
      <div className="grid">
        {organized.map((tournament) => (
          <Link key={tournament.id} href={`/tournament/${tournament.id}`}>
            <div className="list-item" style={{ cursor: 'pointer' }}>
              <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ marginBottom: 4 }}>
                    <strong>{tournament.title}</strong>
                  </div>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    Join code: {tournament.join_code}
                  </div>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {eventSummary(tournament)}
                  </div>
                  <div className="muted">
                    {formatCreatedAt(tournament.created_at)
                      ? `Created ${formatCreatedAt(tournament.created_at)}`
                      : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <span className="tag green">Organizer</span>
                  <span className={statusTagClass(tournament.status)}>
                    {statusLabel(tournament.status)}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    )
  ) : !joined.length ? (
    <div className="muted">No played tournaments yet.</div>
  ) : (
    <div className="grid">
      {joined.map((tournament) => (
        <Link key={tournament.id} href={`/tournament/${tournament.id}`}>
          <div className="list-item" style={{ cursor: 'pointer' }}>
            <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 4 }}>
                  <strong>{tournament.title}</strong>
                </div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  Join code: {tournament.join_code}
                </div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  {eventSummary(tournament)}
                </div>
                <div className="muted">
                  {formatCreatedAt(tournament.created_at)
                    ? `Created ${formatCreatedAt(tournament.created_at)}`
                    : ''}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <span className="tag green">Played</span>
                <span className={statusTagClass(tournament.status)}>
                  {statusLabel(tournament.status)}
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )}
</div>
      )}
    </main>
  );
}
