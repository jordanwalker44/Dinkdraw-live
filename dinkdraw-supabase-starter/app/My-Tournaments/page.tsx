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
};

type PlayerSlot = {
  tournament_id: string;
  claimed_by_user_id: string | null;
};

export default function MyTournamentsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [organized, setOrganized] = useState<Tournament[]>([]);
  const [joined, setJoined] = useState<Tournament[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setMessage(authError.message);
        setIsLoading(false);
        return;
      }

      const user = authData.user;
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

      const joinedIds = Array.from(new Set((joinedSlots || []).map((row: PlayerSlot) => row.tournament_id)));

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
  }, []);

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
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
                      <div className="row-between">
                        <div>
                          <div><strong>{tournament.title}</strong></div>
                          <div className="muted">Join code: {tournament.join_code}</div>
                        </div>
                        <span className="tag green">Organizer</span>
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
                      <div className="row-between">
                        <div>
                          <div><strong>{tournament.title}</strong></div>
                          <div className="muted">Join code: {tournament.join_code}</div>
                        </div>
                        <span className="tag green">Joined</span>
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
