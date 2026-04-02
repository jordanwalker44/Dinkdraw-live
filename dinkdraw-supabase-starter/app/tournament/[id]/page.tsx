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

type StandingRow = {
  playerId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
};

type ScoreDraft = {
  team_a_score: string;
  team_b_score: string;
};

const LAST_TOURNAMENT_KEY = 'dinkdraw_last_tournament';

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
    is_complete: boolean;
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
        is_complete: false,
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
        is_complete: false,
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
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [isSavingNames, setIsSavingNames] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'players' | 'rounds' | 'standings'>('players');
  const [selectedRound, setSelectedRound] = useState(1);
  const [copied, setCopied] = useState(false);

  const claimedSlot = useMemo(
    () => playerSlots.find((slot) => slot.claimed_by_user_id === userId) || null,
    [playerSlots, userId]
  );

  const playersById = useMemo(
    () => Object.fromEntries(playerSlots.map((slot) => [slot.id, slot])),
    [playerSlots]
  );

  const roundsAvailable = useMemo(() => {
    const roundSet = new Set<number>();
    matches.forEach((m) => roundSet.add(m.round_number));
    if (!roundSet.size && tournament?.rounds) {
      for (let i = 1; i <= tournament.rounds; i += 1) roundSet.add(i);
    }
    return Array.from(roundSet).sort((a, b) => a - b);
  }, [matches, tournament]);

  const matchesForSelectedRound = useMemo(
    () => matches.filter((m) => m.round_number === selectedRound && !m.is_bye),
    [matches, selectedRound]
  );

  const byesForSelectedRound = useMemo(
    () => matches.filter((m) => m.round_number === selectedRound && m.is_bye),
    [matches, selectedRound]
  );

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
      });
    }

    for (const match of matches) {
      if (
        match.is_bye ||
        !match.is_complete ||
        match.team_a_score === null ||
        match.team_b_score === null ||
        match.team_a_player_1_id === null ||
        match.team_a_player_2_id === null ||
        match.team_b_player_1_id === null ||
        match.team_b_player_2_id === null
      ) {
        continue;
      }

      const aIds = [match.team_a_player_1_id, match.team_a_player_2_id];
      const bIds = [match.team_b_player_1_id, match.team_b_player_2_id];

      for (const id of [...aIds, ...bIds]) {
        const row = rows.get(id);
        if (!row) continue;
        row.played += 1;
      }

      for (const id of aIds) {
        const row = rows.get(id);
        if (!row) continue;
        row.pointsFor += match.team_a_score;
        row.pointsAgainst += match.team_b_score;
      }

      for (const id of bIds) {
        const row = rows.get(id);
        if (!row) continue;
        row.pointsFor += match.team_b_score;
        row.pointsAgainst += match.team_a_score;
      }

      if (match.team_a_score > match.team_b_score) {
        for (const id of aIds) {
          const row = rows.get(id);
          if (row) row.wins += 1;
        }
        for (const id of bIds) {
          const row = rows.get(id);
          if (row) row.losses += 1;
        }
      } else if (match.team_b_score > match.team_a_score) {
        for (const id of bIds) {
          const row = rows.get(id);
          if (row) row.wins += 1;
        }
        for (const id of aIds) {
          const row = rows.get(id);
          if (row) row.losses += 1;
        }
      }
    }

    const result = Array.from(rows.values()).map((row) => ({
      ...row,
      pointDiff: row.pointsFor - row.pointsAgainst,
    }));

    result.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [playerSlots, matches]);

  const isOrganizer = tournament?.organizer_user_id === userId;
  const canStartTournament =
    !!tournament &&
    tournament.status !== 'started' &&
    playerSlots.filter((slot) => (newNames[slot.id] ?? slot.display_name ?? '').trim() !== '').length >= 4;

  async function loadTournamentData(currentUserId?: string) {
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
      .order('round_number', { ascending: true })
      .order('court_number', { ascending: true });

    setTournament(tournamentData || null);
    setPlayerSlots(playersData || []);
    setMatches(matchesData || []);

    if (tournamentData) {
      try {
        window.localStorage.setItem(
          LAST_TOURNAMENT_KEY,
          JSON.stringify({ id: tournamentData.id, title: tournamentData.title })
        );
      } catch {}
    }

   if ((playersData || []).length > 0) {

    if ((matchesData || []).length > 0) {
      setScoreDrafts((prev) => {
        const next = { ...prev };
        for (const match of matchesData || []) {
          next[match.id] = {
            team_a_score: match.team_a_score === null ? '' : String(match.team_a_score),
            team_b_score: match.team_b_score === null ? '' : String(match.team_b_score),
          };
        }
        return next;
      });
    }

    if (currentUserId) setUserId(currentUserId);

    if ((matchesData || []).length > 0) {
      const firstRound = [...new Set((matchesData || []).map((m) => m.round_number))].sort((a, b) => a - b)[0];
      if (firstRound) setSelectedRound(firstRound);
    } else if (tournamentData?.rounds) {
      setSelectedRound(1);
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

  async function copyJoinCode() {
    try {
      if (!tournament?.join_code) return;
      await navigator.clipboard.writeText(tournament.join_code);
      setCopied(true);
      setMessage('Join code copied.');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage('Could not copy join code.');
    }
  }

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

  if (tournament?.status === 'started') {
    setMessage('Tournament already started. Player spots are locked.');
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const claimedName =
    profile?.display_name?.trim() || user.email?.split('@')[0] || 'Player';

  const { error } = await supabase
    .from('tournament_players')
    .update({
      claimed_by_user_id: user.id,
      display_name: claimedName,
    })
    .eq('id', slotId)
    .is('claimed_by_user_id', null);

  if (error) {
    setMessage(error.message);
    return;
  }

  // Update local input state immediately so the name box shows the claimed name.
  setNewNames((prev) => ({
    ...prev,
    [slotId]: claimedName,
  }));

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

  async function generateScheduleAndStart() {
    if (!tournament) return;

    setMessage('');
    setIsStarting(true);

    try {
      for (const slot of playerSlots) {
        const nextName = (newNames[slot.id] ?? '').trim();

        const { error } = await supabase
          .from('tournament_players')
          .update({ display_name: nextName })
          .eq('id', slot.id);

        if (error) {
          setMessage(`Save failed: ${error.message}`);
          setIsStarting(false);
          return;
        }
      }

      const { data: freshPlayers } = await supabase
        .from('tournament_players')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('slot_number', { ascending: true });

      const namedPlayers = (freshPlayers || []).filter((slot) => (slot.display_name || '').trim() !== '');

      if (namedPlayers.length < 4) {
        setMessage('Please save at least 4 player names before starting.');
        setIsStarting(false);
        return;
      }

      const scheduleRows = buildSchedule(freshPlayers || [], tournament.rounds, tournament.courts);

      if (!scheduleRows.length) {
        setMessage('Could not generate a schedule.');
        setIsStarting(false);
        return;
      }

      const { error: deleteError } = await supabase
        .from('matches')
        .delete()
        .eq('tournament_id', tournament.id);

      if (deleteError) {
        setMessage(`Delete old matches failed: ${deleteError.message}`);
        setIsStarting(false);
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
        setIsStarting(false);
        return;
      }

      const { error: startError } = await supabase
        .from('tournaments')
        .update({
          status: 'started',
          started_at: new Date().toISOString(),
        })
        .eq('id', tournament.id);

      if (startError) {
        setMessage(`Start failed: ${startError.message}`);
        setIsStarting(false);
        return;
      }

      await loadTournamentData(userId);
      setActiveTab('rounds');
      setMessage('Tournament started.');
    } catch (err) {
      setMessage(err instanceof Error ? `Start failed: ${err.message}` : 'Start failed.');
    }

    setIsStarting(false);
  }

  function setDraftScore(matchId: string, field: 'team_a_score' | 'team_b_score', value: string) {
    setScoreDrafts((prev) => ({
      ...prev,
      [matchId]: {
        team_a_score: prev[matchId]?.team_a_score ?? '',
        team_b_score: prev[matchId]?.team_b_score ?? '',
        [field]: value,
      },
    }));
  }

  async function saveScoreField(matchId: string, field: 'team_a_score' | 'team_b_score') {
    const draft = scoreDrafts[matchId];
    if (!draft) return;

    const rawValue = draft[field];
    const numeric = rawValue === '' ? null : Math.max(0, Number(rawValue));

    const { error } = await supabase
      .from('matches')
      .update({ [field]: numeric })
      .eq('id', matchId);

    if (error) {
      setMessage(`Score save failed: ${error.message}`);
      return;
    }

    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, [field]: numeric } : m))
    );
  }

  async function submitMatchScore(matchId: string) {
    const draft = scoreDrafts[matchId];
    if (!draft) {
      setMessage('Enter both scores first.');
      return;
    }

    const a = draft.team_a_score.trim();
    const b = draft.team_b_score.trim();

    if (a === '' || b === '') {
      setMessage('Enter both scores before submitting.');
      return;
    }

    const aNum = Math.max(0, Number(a));
    const bNum = Math.max(0, Number(b));

    const { error } = await supabase
      .from('matches')
      .update({
        team_a_score: aNum,
        team_b_score: bNum,
        is_complete: true,
      })
      .eq('id', matchId);

    if (error) {
      setMessage(`Submit failed: ${error.message}`);
      return;
    }

    setMatches((prev) =>
      prev.map((m) =>
        m.id === matchId
          ? { ...m, team_a_score: aNum, team_b_score: bNum, is_complete: true }
          : m
      )
    );

    setMessage('Score submitted.');
  }

  function renderPlayerName(id: string | null) {
    if (!id) return '-';
    return playersById[id]?.display_name || 'Player';
  }

  function renderTeam(a: string | null, b: string | null) {
    return `${renderPlayerName(a)} & ${renderPlayerName(b)}`;
  }

  function getWinnerStyle(team: 'a' | 'b', match: Match) {
    if (match.team_a_score === null || match.team_b_score === null) return {};
    const aWins = match.team_a_score > match.team_b_score;
    const bWins = match.team_b_score > match.team_a_score;
    const isWinner = (team === 'a' && aWins) || (team === 'b' && bWins);

    return isWinner ? { color: '#a3e635' } : {};
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">{tournament?.title || 'Tournament'}</h1>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 12,
            }}
          >
            <p className="hero-subtitle" style={{ margin: 0 }}>
              Join code: <span className="code-pill">{tournament?.join_code || '...'}</span>
            </p>
            <button type="button" className="button secondary" onClick={copyJoinCode}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <TopNav />

      {message ? <div className="notice" style={{ marginBottom: 16 }}>{message}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Tournament Details</div>
        <div className="grid">
          <div className="row-between">
            <span className="muted">Organizer</span>
            <strong>{tournament?.organizer_name || '-'}</strong>
          </div>
          <div className="row-between">
            <span className="muted">Date</span>
            <strong>{tournament?.event_date || '-'}</strong>
          </div>
          <div className="row-between">
            <span className="muted">Time</span>
            <strong>{tournament?.event_time || '-'}</strong>
          </div>
          <div className="row-between">
            <span className="muted">Place</span>
            <strong>{tournament?.location || '-'}</strong>
          </div>
          <div className="row-between">
            <span className="muted">Status</span>
            <strong>{tournament?.status === 'started' ? 'Started' : 'Setup'}</strong>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <button
          className={`button ${activeTab === 'players' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('players')}
          type="button"
        >
          Players
        </button>
        <button
          className={`button ${activeTab === 'rounds' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('rounds')}
          type="button"
        >
          Rounds
        </button>
        <button
          className={`button ${activeTab === 'standings' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('standings')}
          type="button"
        >
          Standings
        </button>
      </div>

      {activeTab === 'players' && (
        <div className="card">
          <div className="card-title">Player spots</div>
          <div className="card-subtitle">
            {tournament?.status === 'started'
              ? 'Tournament has started. Player list is locked.'
              : 'Share this join code now. Players can claim a spot and enter their own name, or the organizer can fill in names manually.'}
          </div>

          {isLoading ? (
            <div className="muted">Loading player spots...</div>
          ) : (
            <div className="grid">
              {playerSlots.map((slot) => {
                const isMine = slot.claimed_by_user_id === userId;
                const isClaimedBySomeone = !!slot.claimed_by_user_id;
                const canClaim = !isClaimedBySomeone && !claimedSlot && tournament?.status !== 'started';
                const canEditName = tournament?.status !== 'started' && (isOrganizer || isMine || !isClaimedBySomeone);

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
                        ) : (
                          <button className="button secondary" disabled>
                            Locked
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

              {tournament?.status !== 'started' ? (
                <>
                  <button className="button primary" onClick={saveAllPlayerNames} disabled={isSavingNames}>
                    {isSavingNames ? 'Saving...' : 'Save all player names'}
                  </button>

                  {isOrganizer ? (
                    <button className="button secondary" onClick={generateScheduleAndStart} disabled={isStarting || !canStartTournament}>
                      {isStarting ? 'Starting...' : 'Start Tournament'}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {activeTab === 'rounds' && (
        <>
          <div className="row" style={{ gap: 10, overflowX: 'auto', marginBottom: 16 }}>
            {roundsAvailable.map((round) => (
              <button
                key={round}
                type="button"
                className={`button ${selectedRound === round ? 'primary' : 'secondary'}`}
                onClick={() => setSelectedRound(round)}
                style={{
                  minWidth: 72,
                  minHeight: 56,
                  flexShrink: 0,
                  fontWeight: 800,
                  fontSize: 20,
                  transform: selectedRound === round ? 'scale(1.04)' : 'scale(1)',
                  boxShadow:
                    selectedRound === round ? '0 0 0 2px rgba(163,230,53,.25)' : undefined,
                }}
              >
                R{round}
              </button>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Round {selectedRound}</div>
            <div className="card-subtitle">
              Keep one round on screen at a time so players always know where they are.
            </div>

            {!matchesForSelectedRound.length && !byesForSelectedRound.length ? (
              <div className="muted">No matches in this round yet.</div>
            ) : (
              <>
                <div className="two-col">
                  {matchesForSelectedRound.map((match) => {
                    const draft = scoreDrafts[match.id] || {
                      team_a_score: match.team_a_score === null ? '' : String(match.team_a_score),
                      team_b_score: match.team_b_score === null ? '' : String(match.team_b_score),
                    };

                    return (
                      <div key={match.id} className="list-item" style={{ marginBottom: 16 }}>
                        <div className="tag green" style={{ marginBottom: 16, display: 'inline-block' }}>
                          Court {match.court_number ?? '-'}
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 92px',
                            gap: 12,
                            alignItems: 'center',
                            marginBottom: 14,
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 18, ...getWinnerStyle('a', match) }}>
                            {renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}
                          </div>
                          <div>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Score</div>
                            <input
                              className="input"
                              style={{ textAlign: 'center', fontSize: 22, fontWeight: 700 }}
                              type="number"
                              value={draft.team_a_score}
                              disabled={match.is_complete}
                              onChange={(e) => setDraftScore(match.id, 'team_a_score', e.target.value)}
                              onBlur={() => saveScoreField(match.id, 'team_a_score')}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 92px',
                            gap: 12,
                            alignItems: 'center',
                            marginBottom: 16,
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 18, ...getWinnerStyle('b', match) }}>
                            {renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}
                          </div>
                          <div>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Score</div>
                            <input
                              className="input"
                              style={{ textAlign: 'center', fontSize: 22, fontWeight: 700 }}
                              type="number"
                              value={draft.team_b_score}
                              disabled={match.is_complete}
                              onChange={(e) => setDraftScore(match.id, 'team_b_score', e.target.value)}
                              onBlur={() => saveScoreField(match.id, 'team_b_score')}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {match.is_complete ? (
                          <button className="button secondary" disabled style={{ width: '100%' }}>
                            Score Submitted
                          </button>
                        ) : (
                          <button
                            className="button primary"
                            style={{ width: '100%' }}
                            onClick={() => submitMatchScore(match.id)}
                          >
                            Submit Score
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {byesForSelectedRound.length ? (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="card-title" style={{ fontSize: 18 }}>Byes this round</div>
                    <div className="grid">
                      {byesForSelectedRound.map((bye) => (
                        <div key={bye.id} className="list-item">
                          {renderPlayerName(bye.team_a_player_1_id)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}

      {activeTab === 'standings' && (
        <div className="card">
          <div className="card-title">Standings</div>
          <div className="card-subtitle">
            Wins first, then point differential.
          </div>

          {!standings.length ? (
            <div className="muted">No players yet.</div>
          ) : (
            <div className="grid">
              {standings.map((row, index) => (
                <div key={row.playerId} className="list-item">
                  <div className="row-between">
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {index + 1}. {row.name}
                      </div>
                      <div className="muted">
                        {row.wins}-{row.losses} • Played {row.played}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>
                        {row.pointDiff >= 0 ? `+${row.pointDiff}` : row.pointDiff}
                      </div>
                      <div className="muted">
                        {row.pointsFor}-{row.pointsAgainst}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
