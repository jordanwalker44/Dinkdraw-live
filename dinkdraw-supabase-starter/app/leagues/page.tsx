'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../../components/TopNav';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';

type League = {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string | null;
  session_count: number;
  regular_player_count: number;
  organizations: { name: string } | null;
};

export default function LeaguesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setMessage('Sign in to view your leagues.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, status, start_date, end_date, session_count, regular_player_count, organizations(name)')
        .order('start_date', { ascending: false });

      setLeagues((data || []) as unknown as League[]);
      setMessage(error?.message || '');
      setLoading(false);
    }

    void load();
  }, [supabase]);

  return (
    <main className="page-shell league-page">
      <TopNav />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="league-index-header">
          <div>
            <div className="card-title" style={{ color: '#FFCB05' }}>Leagues</div>
            <div className="card-subtitle">
              Run a full rotating-doubles season where everyone partners with everyone.
            </div>
          </div>
          <div className="league-index-actions">
            <Link className="button secondary" href="/leagues/join" style={{ width: 'auto' }}>Join League</Link>
            <Link className="button primary" href="/leagues/create" style={{ width: 'auto' }}>Create League</Link>
          </div>
        </div>
      </div>

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}
      {loading ? <div className="card"><div className="muted">Loading leagues...</div></div> : null}

      {!loading && leagues.length === 0 ? (
        <div className="card">
          <div className="card-title">No leagues yet</div>
          <div className="card-subtitle">
            League creation is a premium organization feature. Players can participate at no charge.
          </div>
        </div>
      ) : null}

      <div className="grid" style={{ gap: 12 }}>
        {leagues.map((league) => (
          <Link key={league.id} href={`/leagues/${league.id}`} className="card" style={{ textDecoration: 'none' }}>
            <div className="league-list-row">
              <div>
                <div className="card-title">{league.name}</div>
                <div className="card-subtitle">
                  {league.organizations?.name || 'Organization'} • {league.regular_player_count} players • {league.session_count} sessions
                </div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Starts {new Date(`${league.start_date}T12:00:00`).toLocaleDateString()}
                </div>
              </div>
              <span className="tag">{league.status === 'draft' ? 'Setup' : league.status}</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
