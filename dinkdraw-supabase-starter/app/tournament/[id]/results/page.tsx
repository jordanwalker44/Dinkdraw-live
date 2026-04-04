'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../../lib/supabase-browser';
import { TopNav } from '../../../../components/TopNav';

type Tournament = {
  id: string;
  title: string;
  organizer_name: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  format: string;
  status: string;
  join_code: string;
};

type PlayerSlot = {
  id: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id: string | null;
};

type Match = {
  id: string;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  is_bye: boolean;
  is_complete: boolean;
};

type StandingRow = {
  playerId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  winPct: number;
};

export default function TournamentResultsPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      setUserId(authData.user?.id ?? '');

      const { data: tournamentData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', params.id)
        .maybeSingle();

      const { data: playersData } = await supabase
        .from('tournament_players')
        .select('*')
        .eq('tournament_id', params.id)
        .order('slot_number', { ascending: true });

      const { data: matchesData } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', params.id)
        .eq('is_complete', true);

      setTournament(tournamentData || null);
      setPlayerSlots(playersData || []);
      setMatches(matchesData || []);
      setLoading(false);
    }

    load();
  }, [params.id, supabase]);

  const isSingles = tournament?.format === 'singles';

  const isParticipant = useMemo(() => {
    if (!userId) return false;
    return playerSlots.some((slot) => slot.claimed_by_user_id === userId);
  }, [playerSlots, userId]);

  const standings = useMemo<StandingRow[]>(() => {
    const rows = new Map<string, StandingRow>();

    for (const slot of playerSlots) {
      rows.set(slot.id, {
        playerId: slot.id,
        name: slot.display_name || `Player ${slot.slot_number}`,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
        winPct: 0,
      });
    }

    for (const match of matches) {
      if (
        match.is_bye ||
        match.team_a_score === null ||
        match.team_b_score === null ||
        match.team_a_player_1_id === null ||
        match.team_b_player_1_id === null
      ) continue;

      const aIds = isSingles
        ? [match.team_a_player_1_id]
        : [match.team_a_player_1_id, match.team_a_player_2_id].filter(Boolean) as string[];

      const bIds = isSingles
        ? [match.team_b_player_1_id]
        : [match.team_b_player_1_id, match.team_b_player_2_id].filter(Boolean) as string[];

      for (const id of [...aIds, ...bIds]) {
        const row = rows.get(id);
        if (row) row.played += 1;
      }

      for (const id of aIds) {
        const row = rows.get(id);
        if (!row) continue;
        row.pointsFor += match.team_a_score;
        row.pointsAgainst += match.team_b_score;
        if (match.team_a_score > match.team_b_score) row.wins += 1;
        if (match.team_a_score < match.team_b_score) row.losses += 1;
      }

      for (const id of bIds) {
        const row = rows.get(id);
        if (!row) continue;
        row.pointsFor += match.team_b_score;
        row.pointsAgainst += match.team_a_score;
        if (match.team_b_score > match.team_a_score) row.wins += 1;
        if (match.team_b_score < match.team_a_score) row.losses += 1;
      }
    }

    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        pointDiff: row.pointsFor - row.pointsAgainst,
        winPct: row.played ? Math.round((row.wins / row.played) * 100) : 0,
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return a.name.localeCompare(b.name);
      });
  }, [playerSlots, matches, isSingles]);

  const podium = standings.slice(0, 3);

  const topWinRate = useMemo(() => {
    return standings
      .filter((r) => r.played >= 2)
      .sort((a, b) => b.winPct - a.winPct)[0] || null;
  }, [standings]);

  const topPointDiff = useMemo(() => {
    return standings
      .filter((r) => r.played >= 1)
      .sort((a, b) => b.pointDiff - a.pointDiff)[0] || null;
  }, [standings]);

  async function handleShare() {
    const url = `${window.location.origin}/tournament/${params.id}/results`;
    const text = tournament
      ? `Check out the results from ${tournament.title} on DinkDraw!`
      : 'Check out these tournament results on DinkDraw!';

    try {
      if (navigator.share) {
        await navigator.share({ title: 'DinkDraw Results', text, url });
        setMessage('Share opened!');
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage('Results link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage('Could not share results.');
    }
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/tournament/${params.id}/results`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage('Results link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage('Could not copy link.');
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (loading) {
    return (
      <main className="page-shell">
        <TopNav />
        <div className="card">
          <div className="muted">Loading results...</div>
        </div>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="page-shell">
        <TopNav />
        <div className="card">
          <div className="card-title">Tournament Not Found</div>
          <div className="card-subtitle">This tournament doesn't exist or has been removed.</div>
          <button className="button primary" onClick={() => router.push('/')}>Go Home</button>
        </div>
      </main>
    );
  }

  if (tournament.status !== 'completed') {
    return (
      <main className="page-shell">
        <TopNav />
        <div className="card">
          <div className="card-title">Tournament In Progress</div>
          <div className="card-subtitle">Results will be available once the tournament is complete.</div>
          <button
            className="button primary"
            onClick={() => router.push(`/tournament/${params.id}`)}
          >
            View Tournament
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">Final Results</h1>
          <p className="hero-subtitle">
            {tournament.title}
          </p>
        </div>
      </div>

      <TopNav />

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      {/* Tournament Info */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">{tournament.title}</div>
        <div className="grid">
          {tournament.event_date ? (
            <div className="list-item">
              <div className="row-between">
                <span className="muted">Date</span>
                <strong>{formatDate(tournament.event_date)}</strong>
              </div>
            </div>
          ) : null}

          {tournament.location ? (
            <div className="list-item">
              <div className="row-between">
                <span className="muted">Location</span>
                <strong>{tournament.location}</strong>
              </div>
            </div>
          ) : null}

          <div className="list-item">
            <div className="row-between">
              <span className="muted">Format</span>
              <strong>{isSingles ? 'Singles' : 'Doubles'}</strong>
            </div>
          </div>

          <div className="list-item">
            <div className="row-between">
              <span className="muted">Players</span>
              <strong>{standings.length}</strong>
            </div>
          </div>

          {tournament.organizer_name ? (
            <div className="list-item">
              <div className="row-between">
                <span className="muted">Organizer</span>
                <strong>{tournament.organizer_name}</strong>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Podium */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">🏆 Podium</div>
        <div className="grid">
          {podium.map((player, index) => {
            const place = index + 1;
            const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉';
            const isFirst = place === 1;

            return (
              <div
                key={player.playerId}
                className="list-item"
                style={{
                  borderColor: isFirst
                    ? 'rgba(255,203,5,.6)'
                    : 'rgba(255,203,5,.25)',
                  boxShadow: isFirst
                    ? '0 0 0 1px rgba(255,203,5,.35) inset'
                    : undefined,
                  padding: isFirst ? 20 : 14,
                }}
              >
                <div className="row-between">
                  <div>
                    <div style={{
                      fontWeight: 800,
                      fontSize: isFirst ? 24 : 18,
                      lineHeight: 1.15,
                      marginBottom: 6,
                    }}>
                      {medal} {player.name}
                    </div>
                    <div className="muted">
                      {player.wins}W — {player.losses}L • {player.played} played
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {player.winPct}% win rate • {player.pointDiff >= 0 ? `+${player.pointDiff}` : player.pointDiff} point diff
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: isFirst ? 32 : 22,
                      color: '#FFCB05',
                      lineHeight: 1,
                    }}>
                      #{place}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Standout Stats */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Standout Stats</div>
        <div className="grid">
          {topWinRate ? (
            <div className="list-item" style={{ borderColor: 'rgba(255,203,5,.35)' }}>
              <div className="muted" style={{ marginBottom: 6 }}>Highest Win Rate</div>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
                {topWinRate.name}
              </div>
              <div style={{ fontWeight: 800, fontSize: 28, color: '#FFCB05', lineHeight: 1 }}>
                {topWinRate.winPct}%
              </div>
              <div className="muted" style={{ marginTop: 4 }}>
                {topWinRate.wins}W — {topWinRate.losses}L
              </div>
            </div>
          ) : null}

          {topPointDiff ? (
            <div className="list-item" style={{ borderColor: 'rgba(255,203,5,.35)' }}>
              <div className="muted" style={{ marginBottom: 6 }}>Best Point Differential</div>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
                {topPointDiff.name}
              </div>
              <div style={{ fontWeight: 800, fontSize: 28, color: '#FFCB05', lineHeight: 1 }}>
                {topPointDiff.pointDiff >= 0 ? `+${topPointDiff.pointDiff}` : topPointDiff.pointDiff}
              </div>
              <div className="muted" style={{ marginTop: 4 }}>
                {topPointDiff.pointsFor} pts for • {topPointDiff.pointsAgainst} pts against
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Full Standings */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Full Standings</div>
        <div className="grid">
          {standings.map((row, index) => {
            const place = index + 1;
            const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : null;

            return (
              <div
                key={row.playerId}
                className="list-item"
                style={{
                  borderColor: place <= 3 ? 'rgba(255,203,5,.25)' : undefined,
                }}
              >
                <div className="row-between">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>
                      {medal ? `${medal} ` : `${place}. `}{row.name}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {row.wins}W — {row.losses}L • {row.winPct}% • {row.pointDiff >= 0 ? `+${row.pointDiff}` : row.pointDiff} diff
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800 }}>{row.pointsFor}</div>
                    <div className="muted" style={{ fontSize: 12 }}>pts for</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Share buttons — soft gate, only for participants */}
      {isParticipant ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">Share Results</div>
          <div className="card-subtitle">
            Share this tournament's results with your group.
          </div>
          <div className="grid">
            <button className="button primary" onClick={handleShare}>
              {copied ? 'Link Copied!' : 'Share Results'}
            </button>
            <button className="button secondary" onClick={handleCopyLink}>
              {copied ? 'Copied!' : 'Copy Results Link'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Back to tournament */}
      <div className="card">
        <button
          className="button secondary"
          onClick={() => router.push(`/tournament/${params.id}`)}
        >
          Back to Tournament
        </button>
      </div>
    </main>
  );
}
