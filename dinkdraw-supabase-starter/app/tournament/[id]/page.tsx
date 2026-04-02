'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

/* ================= TYPES ================= */

type Tournament = {
  id: string;
  title: string;
  join_code: string;
  organizer_user_id: string;
  organizer_name: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  player_count: number;
  courts: number;
  rounds: number;
  games_to: number;
  status: string;
  started_at: string | null;
};

type PlayerSlot = {
  id: string;
  tournament_id: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id: string | null;
};

type Match = {
  id: string;
  round_number: number;
  court_number: number | null;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  is_bye: boolean;
  is_complete: boolean;
};

type ScoreDraft = {
  team_a_score: string;
  team_b_score: string;
};

/* ================= HELPERS ================= */

const LAST_TOURNAMENT_KEY = 'dinkdraw_last_tournament';

function pairKey(a: string, b: string) {
  return [a, b].sort().join('|');
}

function shuffle<T>(array: T[]) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ================= MAIN ================= */

export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userId, setUserId] = useState('');
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const claimedSlot = useMemo(
    () => playerSlots.find((s) => s.claimed_by_user_id === userId) || null,
    [playerSlots, userId]
  );

  /* ================= LOAD ================= */

  async function loadTournamentData(currentUserId?: string) {
    const { data: t } = await supabase.from('tournaments').select('*').eq('id', params.id).maybeSingle();
    const { data: p } = await supabase.from('tournament_players').select('*').eq('tournament_id', params.id).order('slot_number');
    const { data: m } = await supabase.from('matches').select('*').eq('tournament_id', params.id);

    setTournament(t || null);
    setPlayerSlots(p || []);
    setMatches(m || []);

    // 🔥 FIX: Only set names if not already typed
    setNewNames((prev) => {
      const next = { ...prev };
      for (const slot of p || []) {
        if (!next[slot.id]) {
          next[slot.id] = slot.display_name || '';
        }
      }
      return next;
    });

    if (currentUserId) setUserId(currentUserId);
  }

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      const { data } = await supabase.auth.getUser();
      await loadTournamentData(data.user?.id);
      setIsLoading(false);
    }
    init();
  }, [params.id]);

  /* ================= CLAIM SLOT ================= */

  async function claimSlot(slotId: string) {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) return setMessage('Sign in first.');
    if (claimedSlot) return setMessage('Already claimed.');

    const name =
      user.email?.split('@')[0] || 'Player';

    const { error } = await supabase
      .from('tournament_players')
      .update({
        claimed_by_user_id: user.id,
        display_name: name,
      })
      .eq('id', slotId)
      .is('claimed_by_user_id', null);

    if (error) return setMessage(error.message);

    // 🔥 FIX: Immediately sync local state
    setNewNames((prev) => ({
      ...prev,
      [slotId]: name,
    }));

    await loadTournamentData(user.id);
  }

  /* ================= SAVE NAMES ================= */

  async function saveAllPlayerNames() {
    for (const slot of playerSlots) {
      const name = (newNames[slot.id] || '').trim();

      await supabase
        .from('tournament_players')
        .update({ display_name: name })
        .eq('id', slot.id);
    }

    await loadTournamentData(userId);
    setMessage('Saved.');
  }

  /* ================= START ================= */

  const validPlayers = playerSlots.filter(
    (s) => (newNames[s.id] || '').trim() !== ''
  );

  const canStartTournament =
    tournament?.status !== 'started' && validPlayers.length >= 4;

  async function startTournament() {
    if (!tournament) return;

    await saveAllPlayerNames();

    await supabase
      .from('tournaments')
      .update({ status: 'started', started_at: new Date().toISOString() })
      .eq('id', tournament.id);

    await loadTournamentData(userId);
  }

  /* ================= UI ================= */

  return (
    <main className="page-shell">
      <TopNav />

      <h1>{tournament?.title}</h1>

      {message && <div className="notice">{message}</div>}

      {/* ================= PLAYERS ================= */}

      <div className="card">
        <h2>Players</h2>

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <>
            {playerSlots.map((slot) => {
              const isMine = slot.claimed_by_user_id === userId;
              const isClaimed = !!slot.claimed_by_user_id;

              return (
                <div key={slot.id} className="list-item">
                  <div className="row-between">
                    <div>
                      Player {slot.slot_number}
                      <div className="muted">
                        {slot.display_name || 'Open'}
                      </div>
                    </div>

                    {tournament?.status === 'started' ? (
                      <span>Locked</span>
                    ) : !isClaimed ? (
                      <button onClick={() => claimSlot(slot.id)}>
                        Claim
                      </button>
                    ) : isMine ? (
                      <span>Yours</span>
                    ) : (
                      <span>Claimed</span>
                    )}
                  </div>

                  <input
                    value={newNames[slot.id] || ''}
                    onChange={(e) =>
                      setNewNames((p) => ({
                        ...p,
                        [slot.id]: e.target.value,
                      }))
                    }
                    disabled={tournament?.status === 'started'}
                  />
                </div>
              );
            })}

            {tournament?.status !== 'started' && (
              <>
                <button onClick={saveAllPlayerNames}>
                  Save Names
                </button>

                <button
                  onClick={startTournament}
                  disabled={!canStartTournament}
                >
                  Start Tournament
                </button>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
