'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

type Tournament = {
  id: string;
  title: string;
  join_code: string;
  organizer_user_id: string;
  organizer_name: string | null;
  player_count: number;
  courts: number;
  rounds: number;
  games_to: number;
  status: string;
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
};

function pairKey(a: string, b: string) {
  return [a, b].sort().join('|');
}

function shuffle<T>(array: T[]) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildSchedule(players: PlayerSlot[], rounds: number, courts: number) {
  const activePlayers = players.filter((p) => (p.display_name || '').trim());
  if (activePlayers.length < 4) return [];

  const ids = activePlayers.map((p) => p.id);
  const maxSlots = Math.min(courts * 4, ids.length);
  const partnerCounts = new Map<string, number>();
  const playedCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const benchCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const output: Array<{
    round_number: number;
    court_number: number | null;
    team_a_player_1_id: string | null;
    team_a_player_2_id: string | null;
    team_b_player_1_id: string | null;
    team_b_player_2_id: string | null;
    team_a_score: number | null;
    team_b_score: number | null;
    is_bye: boolean;
  }> = [];

  function partnerCount(a: string, b: string) {
    return partnerCounts.get(pairKey(a, b)) || 0;
  }

  function chooseParticipants() {
    return [...ids]
      .sort((a, b) => {
        const benchDiff = (benchCounts.get(b) || 0) - (benchCounts.get(a) || 0);
        if (benchDiff !== 0) return benchDiff;

        const playDiff = (playedCounts.get(a) || 0) - (playedCounts.get(b) || 0);
        if (playDiff !== 0) return playDiff;

        return Math.random() - 0.5;
      })
      .slice(0, maxSlots);
  }

  function bestMatches(participants: string[]) {
    let best:
      | {
          matches: Array<{ teamA: [string, string]; teamB: [string, string] }>;
          totalPenalty: number;
        }
      | null = null;

    for (let attempt = 0; attempt < 500; attempt += 1) {
      const sample = shuffle(participants);
      const matches: Array<{ teamA: [string, string]; teamB: [string, string] }> = [];
      let valid = true;
      let totalPenalty = 0;

      for (let i = 0; i < Math.floor(sample.length / 4); i += 1) {
        const group = sample.slice(i * 4, i * 4 + 4);
        if (group.length < 4) {
          valid = false;
          break;
        }

        const layouts = [
          {
            teamA: [group[0], group[1]] as [string, string],
            teamB: [group[2], group[3]] as [string, string],
          },
          {
            teamA: [group[0], group[2]] as [string, string],
            teamB: [group[1], group[3]] as [string, string],
          },
          {
            teamA: [group[0], group[3]] as [string, string],
            teamB: [group[1], group[2]] as [string, string],
          },
        ];

        let bestLayout:
          | {
              teamA: [string, string];
              teamB: [string, string];
              penalty: number;
            }
          | null = null;

        for (const layout of layouts) {
          const penalty =
            partnerCount(layout.teamA[0], layout.teamA[1]) * 1000 +
            partnerCount(layout.teamB[0], layout.teamB[1]) * 1000 +
            (playedCounts.get(layout.teamA[0]) || 0) +
            (playedCounts.get(layout.teamA[1]) || 0) +
            (playedCounts.get(layout.teamB[0]) || 0) +
            (playedCounts.get(layout.teamB[1]) || 0) +
            Math.random();

          if (!bestLayout || penalty < bestLayout.penalty) {
            bestLayout = { ...layout, penalty };
          }
        }

        if (!bestLayout) {
          valid = false;
          break;
        }

        matches.push({
          teamA: bestLayout.teamA,
          teamB: bestLayout.teamB,
        });
        totalPenalty += bestLayout.penalty;
      }

      if (valid && (!best || totalPenalty < best.totalPenalty)) {
        best = { matches, totalPenalty };
      }
    }

    return best ? best.matches : [];
  }

  for (let round = 1; round <= rounds; round += 1) {
    const participants = chooseParticipants();
    const bench = ids.filter((id) => !participants.includes(id));
    const matches = bestMatches(participants);
    if (!matches.length) break;

    bench.forEach((id) => {
      benchCounts.set(id, (benchCounts.get(id) || 0) + 1);
      output.push({
        round_number: round,
        court_number: null,
        team_a_player_1_id: id,
        team_a_player_2_id: null,
        team_b_player_1_id: null,
        team_b_player_2_id: null,
        team_a_score: null,
        team_b_score: null,
        is_bye: true,
      });
    });

    matches.forEach((match, index) => {
      const [a1, a2] = match.teamA;
      const [b1, b2] = match.teamB;

      partnerCounts.set(pairKey(a1, a2), partnerCount(a1, a2) + 1);
      partnerCounts.set(pairKey(b1, b2), partnerCount(b1, b2) + 1);

      [a1, a2, b1, b2].forEach((id) => {
        playedCounts.set(id, (playedCounts.get(id) || 0) + 1);
      });

      output.push({
        round_number: round,
        court_number: index + 1,
        team_a_player_1_id: a1,
        team_a_player_2_id: a2,
        team_b_player_1_id: b1,
        team_b_player_2_id: b2,
        team_a_score: null,
        team_b_score: null,
        is_bye: false,
      });
    });
  }

  return output;
}

export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [isSavingNames, setIsSavingNames] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const claimedSlot = useMemo(
    () => playerSlots.find((slot) => slot.claimed_by_user_id === userId) || null,
    [playerSlots, userId]
  );

  const playersById = useMemo(
    () => Object.fromEntries(playerSlots.map((slot) => [slot.id, slot])),
    [playerSlots]
  );

  async function loadTournamentData(currentUserId?: string) {
    const { data: tournamentData, error: tournamentError } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (tournamentError) {
      setMessage(tournamentError.message);
    }

    const { data: playersData, error: playersError } = await supabase
      .from('tournament_players')
      .select('*')
      .eq('tournament_id', params.id)
      .order('slot_number', { ascending: true });

    if (playersError) {
      setMessage(playersError.message);
    }

    const { data: matchesData, error: matchesError } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', params.id)
      .order('round_number', { ascending: true });

    if (matchesError) {
      setMessage(matchesError.message);
    }

    setTournament(tournamentData || null);
    setPlayerSlots(playersData || []);
    setMatches(matchesData || []);

    if ((playersData || []).length > 0) {
      setNewNames((prev) => {
        const next = { ...prev };
        for (const slot of playersData || []) {
          if (!(slot.id in next)) {
            next[slot.id] = slot.display_name || '';
          }
        }
        return next;
      });
    }

    if (currentUserId) {
      setUserId(currentUserId);
    }
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? '';
      await loadTournamentData(currentUserId);
      setIsLoading(false);
    }

    load();
  }, [params.id]);

  async function claimSlot(slotId: string) {
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      setMessage('Sign in first.');
      return;
    }

    if (claimedSlot) {
      setMessage('You already claimed a spot in this tournament.');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    const updatePayload: { claimed_by_user_id: string; display_name?: string } = {
      claimed_by_user_id: user.id,
    };

    if (profile?.display_name) {
      updatePayload.display_name = profile.display_name;
    }

    const { error } = await supabase
      .from('tournament_players')
      .update(updatePayload)
      .eq('id', slotId)
      .is('claimed_by_user_id', null);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadTournamentData(user.id);
    setMessage('Spot claimed.');
  }

 async function saveAllPlayerNames() {
  setMessage('');
  setIsSavingNames(true);

  try {
    for (const slot of playerSlots) {
      const nextName = (newNames[slot.id] ?? '').trim();

      const { error } = await supabase
        .from('tournament_players')
        .update({ display_name: nextName })
        .eq('id', slot.id);

      if (error) {
        setMessage(`Save failed: ${error.message}`);
        setIsSavingNames(false);
        return;
      }
    }

    await loadTournamentData(userId);
    setMessage('Player names saved.');
  } catch (err) {
    setMessage(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed.');
  }

  setIsSavingNames(false);
}

  async function generateSchedule() {
    setMessage('');
    setIsGenerating(true);

    try {
      const namedPlayers = playerSlots.filter((slot) => {
        const currentName = (newNames[slot.id] ?? slot.display_name ?? '').trim();
        return currentName !== '';
      });

      if (namedPlayers.length < 4) {
        setMessage('Please save at least 4 player names before generating the schedule.');
        setIsGenerating(false);
        return;
      }

      if (!tournament) {
        setMessage('Tournament not loaded yet.');
        setIsGenerating(false);
        return;
      }

      const scheduleSource = playerSlots.map((slot) => ({
        ...slot,
        display_name: (newNames[slot.id] ?? slot.display_name ?? '').trim(),
      }));

      const scheduleRows = buildSchedule(scheduleSource, tournament.rounds, tournament.courts);

      if (!scheduleRows.length) {
        setMessage('Could not generate a schedule.');
        setIsGenerating(false);
        return;
      }

      const { error: deleteError } = await supabase
        .from('matches')
        .delete()
        .eq('tournament_id', tournament.id);

      if (deleteError) {
        setMessage(`Delete old matches failed: ${deleteError.message}`);
        setIsGenerating(false);
        return;
      }

      const rowsToInsert = scheduleRows.map((row) => ({
        tournament_id: tournament.id,
        ...row,
      }));

      const { error: insertError } = await supabase
        .from('matches')
        .insert(rowsToInsert);

      if (insertError) {
        setMessage(`Generate failed: ${insertError.message}`);
        setIsGenerating(false);
        return;
      }

      await loadTournamentData(userId);
      setMessage('Schedule generated.');
    } catch (err) {
      setMessage(err instanceof Error ? `Generate failed: ${err.message}` : 'Generate failed.');
    }

    setIsGenerating(false);
  }

  async function updateMatchScore(
    matchId: string,
    field: 'team_a_score' | 'team_b_score',
    value: string
  ) {
    const numeric = value === '' ? null : Math.max(0, Number(value));

    const { error } = await supabase
      .from('matches')
      .update({ [field]: numeric })
      .eq('id', matchId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadTournamentData(userId);
  }

  function renderPlayerName(id: string | null) {
    if (!id) return '-';
    return playersById[id]?.display_name || 'Player';
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">{tournament?.title || 'Tournament'}</h1>
          <p className="hero-subtitle">
            Join code: <span className="code-pill">{tournament?.join_code || '...'}</span>
          </p>
        </div>
      </div>

      <TopNav />

      {message ? <div className="notice" style={{ marginBottom: 16 }}>{message}</div> : null}

      <div className="card">
        <div className="card-title">Player spots</div>
        <div className="card-subtitle">
          Share this join code now. Players can claim a spot and enter their own name, or the organizer can fill in names manually.
        </div>

        {isLoading ? (
          <div className="muted">Loading player spots...</div>
        ) : (
          <div className="grid">
            {playerSlots.map((slot) => {
              const isMine = slot.claimed_by_user_id === userId;
              const isClaimedBySomeone = !!slot.claimed_by_user_id;
              const isOrganizer = tournament?.organizer_user_id === userId;
              const canClaim = !isClaimedBySomeone && !claimedSlot;
              const canEditName = isOrganizer || isMine || !isClaimedBySomeone;

              return (
                <div
                  key={slot.id}
                  className="list-item"
                  style={{
                    borderColor: isMine ? 'rgba(163,230,53,.45)' : undefined,
                    boxShadow: isMine ? '0 0 0 1px rgba(163,230,53,.18) inset' : undefined,
                  }}
                >
                  <div className="row-between">
                    <div>
                      <div><strong>Player {slot.slot_number}</strong></div>
                      <div className="muted">{slot.display_name || 'Open spot'}</div>
                    </div>

                    <div>
                      {isMine ? (
                        <span className="tag green">Yours</span>
                      ) : isClaimedBySomeone ? (
                        <span className="tag green">Claimed</span>
                      ) : canClaim ? (
                        <button className="button primary" onClick={() => claimSlot(slot.id)}>
                          Claim
                        </button>
                      ) : isOrganizer ? (
                        <span className="muted">Open</span>
                      ) : (
                        <button className="button secondary" disabled>
                          Unavailable
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: 12 }}>
                    <input
                      className="input"
                      value={newNames[slot.id] ?? ''}
                      onChange={(e) =>
                        setNewNames((prev) => ({
                          ...prev,
                          [slot.id]: e.target.value,
                        }))
                      }
                      placeholder={`Name for Player ${slot.slot_number}`}
                      disabled={!canEditName}
                    />
                  </div>
                </div>
              );
            })}

            <button className="button primary" onClick={saveAllPlayerNames} disabled={isSavingNames}>
              {isSavingNames ? 'Saving...' : 'Save all player names'}
            </button>

            <button className="button secondary" onClick={generateSchedule} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate round robin schedule'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Matches</div>
        <div className="card-subtitle">Generated matches will appear here.</div>

        {!matches.length ? (
          <div className="muted">
            No matches yet. Save player names, then tap “Generate round robin schedule”.
          </div>
        ) : (
          <div className="grid">
            {matches.map((match) => (
              <div key={match.id} className="list-item">
                <div className="row-between" style={{ marginBottom: 12 }}>
                  <div><strong>Round {match.round_number}</strong></div>
                  <div className="muted">
                    {match.is_bye ? 'Bye' : `Court ${match.court_number ?? '-'}`}
                  </div>
                </div>

                {match.is_bye ? (
                  <div className="muted">
                    Bye: {renderPlayerName(match.team_a_player_1_id)}
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <strong>
                        {renderPlayerName(match.team_a_player_1_id)} & {renderPlayerName(match.team_a_player_2_id)}
                      </strong>
                    </div>

                    <div className="muted" style={{ marginBottom: 10 }}>vs</div>

                    <div style={{ marginBottom: 14 }}>
                      <strong>
                        {renderPlayerName(match.team_b_player_1_id)} & {renderPlayerName(match.team_b_player_2_id)}
                      </strong>
                    </div>

                    <div className="row">
                      <input
                        className="input"
                        style={{ width: 100, textAlign: 'center', fontSize: 24, fontWeight: 700 }}
                        type="number"
                        value={match.team_a_score ?? ''}
                        onChange={(e) => updateMatchScore(match.id, 'team_a_score', e.target.value)}
                        placeholder="0"
                      />
                      <span className="muted">vs</span>
                      <input
                        className="input"
                        style={{ width: 100, textAlign: 'center', fontSize: 24, fontWeight: 700 }}
                        type="number"
                        value={match.team_b_score ?? ''}
                        onChange={(e) => updateMatchScore(match.id, 'team_b_score', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
