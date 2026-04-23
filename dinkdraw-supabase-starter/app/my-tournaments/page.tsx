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

    joinedTournaments = (joinedData || []).filter(
      (t: Tournament) => t.organizer_user_id !== user.id
    );
  }

  setOrganized(organizedData || []);
  setJoined(joinedTournaments);
  setIsLoading(false);
}

    load();
  }, [supabase]);

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <h1 className="hero-title">My Tournaments</h1>
          <p className="hero-subtitle">
            Pick up where you left off without needing the join code again.
          </p>
        </div>
      </div>

      <TopNav />

      {message ? <div className="notice" style={{ marginBottom: 16 }}>{message}</div> : null}

      {isLoading ? (
        <div className="card">
          <div className="muted">Loading tournaments...</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-title">Organized by me</div>
            <div className="card-subtitle">Tournaments you created.</div>

            {!organized.length ? (
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
            )}
          </div>

          <div className="card">
            <div className="card-title">Joined by me</div>
            <div className="card-subtitle">Tournaments where you claimed a spot.</div>

            {!joined.length ? (
              <div className="muted">No joined tournaments yet.</div>
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
                          <span className="tag green">Joined</span>
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
        </>
      )}
    </main>
  );
}
