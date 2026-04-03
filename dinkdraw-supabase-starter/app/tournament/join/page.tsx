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

type ScheduleRow = {
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

const LAST_TOURNAMENT_KEY = 'dinkdraw_last_tournament';

function pairKey(a: string, b: string) {
  return [a, b].sort().join('|');
}

function matchupKey(a1: string, a2: string, b1: string, b2: string) {
  const teamA = [a1, a2].sort().join('|');
  const teamB = [b1, b2].sort().join('|');
  return [teamA, teamB].sort().join(' vs ');
}

function shuffle<T>(array: T[]) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function chunkIntoGroups<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

function buildSchedule(players: PlayerSlot[], rounds: number, courts: number): ScheduleRow[] {
  const activePlayers = players.filter((p) => (p.display_name || '').trim() !== '');
  if (activePlayers.length < 4) return [];

  const ids = activePlayers.map((p) => p.id);
  const maxParticipantsPerRound = Math.min(courts * 4, ids.length);

  const partnerCounts = new Map<string, number>();
  const matchupCounts = new Map<string, number>();
  const playedCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const byeCounts = new Map<string, number>(ids.map((id) => [id, 0]));

  const output: ScheduleRow[] = [];

  function getPartnerCount(a: string, b: string) {
    return partnerCounts.get(pairKey(a, b)) || 0;
  }

  function getMatchupCount(a1: string, a2: string, b1: string, b2: string) {
    return matchupCounts.get(matchupKey(a1, a2, b1, b2)) || 0;
  }

  function chooseParticipantsForRound() {
    const sorted = [...ids].sort((a, b) => {
      const byeDiff = (byeCounts.get(b) || 0) - (byeCounts.get(a) || 0);
      if (byeDiff !== 0) return byeDiff;

      const playDiff = (playedCounts.get(a) || 0) - (playedCounts.get(b) || 0);
      if (playDiff !== 0) return playDiff;

      return Math.random() - 0.5;
    });

    return sorted.slice(0, maxParticipantsPerRound);
  }

  function bestLayoutsForParticipants(participants: string[]) {
    const groups = chunkIntoGroups(shuffle(participants), 4).filter((g) => g.length === 4);
    if (!groups.length) return null;

    let totalPenalty = 0;
    const matches: Array<{ teamA: [string, string]; teamB: [string, string] }> = [];

    for (const group of groups) {
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

      let best:
        | {
            teamA: [string, string];
            teamB: [string, string];
            penalty: number;
          }
        | null = null;

      for (const layout of layouts) {
        const [a1, a2] = layout.teamA;
        const [b1, b2] = layout.teamB;

        const partnerPenalty =
          getPartnerCount(a1, a2) * 1000 +
          getPartnerCount(b1, b2) * 1000;

        const matchupPenalty = getMatchupCount(a1, a2, b1, b2) * 400;

        const usagePenalty =
          (playedCounts.get(a1) || 0) +
          (playedCounts.get(a2) || 0) +
          (playedCounts.get(b1) || 0) +
          (playedCounts.get(b2) || 0);

        const penalty = partnerPenalty + matchupPenalty + usagePenalty + Math.random();

        if (!best || penalty < best.penalty) {
          best = {
            teamA: [a1, a2],
            teamB: [b1, b2],
            penalty,
          };
        }
      }

      if (!best) return null;

      matches.push({
        teamA: best.teamA,
        teamB: best.teamB,
      });
      totalPenalty += best.penalty;
    }

    return { matches, totalPenalty };
  }

  function findBestRoundMatches(participants: string[]) {
    let bestResult:
      | {
          matches: Array<{ teamA: [string, string]; teamB: [string, string] }>;
          totalPenalty: number;
        }
      | null = null;

    for (let attempt = 0; attempt < 700; attempt += 1) {
      const candidate = bestLayoutsForParticipants(participants);
      if (!candidate) continue;

      if (!bestResult || candidate.totalPenalty < bestResult.totalPenalty) {
        bestResult = candidate;
      }
    }

    return bestResult?.matches || [];
  }

  for (let round = 1; round <= rounds; round += 1) {
    const participants = chooseParticipantsForRound();
    const benched = ids.filter((id) => !participants.includes(id));
    const matches = findBestRoundMatches(participants);

    if (!matches.length) break;

    benched.forEach((id) => {
      byeCounts.set(id, (byeCounts.get(id) || 0) + 1);
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

      partnerCounts.set(pairKey(a1, a2), getPartnerCount(a1, a2) + 1);
      partnerCounts.set(pairKey(b1, b2), getPartnerCount(b1, b2) + 1);

      matchupCounts.set(
        matchupKey(a1, a2, b1, b2),
        getMatchupCount(a1, a2, b1, b2) + 1
      );

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
  const [isStarting, setIsStarting] = useState(false);
  const [isEndingEarly, setIsEndingEarly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'players' | 'rounds' | 'standings'>('players');
  const [selectedRound, setSelectedRound] = useState(1);
  const [copied, setCopied] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const isStarted = tournament?.status === 'started';
  const isCompleted = tournament?.status === 'completed';
  const isLocked = isStarted || isCompleted;

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

  const currentRound = useMemo(() => {
    if (!matches.length) return roundsAvailable[0] || 1;

    for (const round of roundsAvailable) {
      const roundMatches = matches.filter((m) => m.round_number === round && !m.is_bye);
      if (!roundMatches.length) continue;

      const allComplete = roundMatches.every((m) => m.is_complete);
      if (!allComplete) return round;
    }

    return roundsAvailable[roundsAvailable.length - 1] || 1;
  }, [matches, roundsAvailable]);

  const finalRound = useMemo(() => {
    return roundsAvailable[roundsAvailable.length - 1] || 1;
  }, [roundsAvailable]);

  const completedMatchCount = useMemo(
    () => matches.filter((m) => !m.is_bye && m.is_complete).length,
    [matches]
  );

  const totalPlayableMatchCount = useMemo(
    () => matches.filter((m) => !m.is_bye).length,
    [matches]
  );

  const roundStatusByRound = useMemo(() => {
    const statusMap = new Map<number, 'current' | 'complete' | 'upcoming'>();

    for (const round of roundsAvailable) {
      const roundMatches = matches.filter((m) => m.round_number === round && !m.is_bye);

      if (!roundMatches.length) {
        statusMap.set(
          round,
          round === currentRound ? 'current' : round < currentRound ? 'complete' : 'upcoming'
        );
        continue;
      }

      const allComplete = roundMatches.every((m) => m.is_complete);
      if (allComplete) {
        statusMap.set(round, 'complete');
      } else if (round === currentRound) {
        statusMap.set(round, 'current');
      } else if (round < currentRound) {
        statusMap.set(round, 'complete');
      } else {
        statusMap.set(round, 'upcoming');
      }
    }

    return statusMap;
  }, [matches, roundsAvailable, currentRound]);

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
    tournament.status !== 'completed' &&
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
      setNewNames((prev) => {
        const next = { ...prev };

        for (const slot of playersData || []) {
          const existing = next[slot.id];
          const saved = slot.display_name || '';
          next[slot.id] = typeof existing === 'string' ? existing : saved;
        }

        return next;
      });
    }

    setScoreDrafts((prev) => {
      const next = { ...prev };
      for (const match of matchesData || []) {
        const existingA = prev[match.id]?.team_a_score;
        const existingB = prev[match.id]?.team_b_score;

        next[match.id] = {
          team_a_score:
            typeof existingA === 'string' && existingA !== '' && !match.is_complete
              ? existingA
              : match.team_a_score === null
              ? ''
              : String(match.team_a_score),
          team_b_score:
            typeof existingB === 'string' && existingB !== '' && !match.is_complete
              ? existingB
              : match.team_b_score === null
              ? ''
              : String(match.team_b_score),
        };
      }
      return next;
    });

    if (currentUserId) setUserId(currentUserId);
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
  }, [params.id, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`tournament-live-${params.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournaments',
          filter: `id=eq.${params.id}`,
        },
        async () => {
          setIsLive(true);
          await loadTournamentData(userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_players',
          filter: `tournament_id=eq.${params.id}`,
        },
        async () => {
          setIsLive(true);
          await loadTournamentData(userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${params.id}`,
        },
        async () => {
          setIsLive(true);
          await loadTournamentData(userId);
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [params.id, supabase, userId]);

  useEffect(() => {
    if (!roundsAvailable.length) return;
    setSelectedRound((prev) => {
      if (!roundsAvailable.includes(prev)) {
        return isCompleted ? finalRound : currentRound;
      }
      return prev;
    });
  }, [roundsAvailable, currentRound, finalRound, isCompleted]);

  useEffect(() => {
    if (isCompleted) {
      setSelectedRound(finalRound);
      setActiveTab('standings');
      return;
    }

    if (isStarted && matches.length > 0) {
      setSelectedRound(currentRound);
    }
  }, [isStarted, isCompleted, matches.length, currentRound, finalRound]);

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

  async function shareJoinLink() {
    try {
      if (!tournament?.join_code) return;

      const url = `${window.location.origin}/tournament/join?code=${encodeURIComponent(
        tournament.join_code
      )}`;

      if (navigator.share) {
        await navigator.share({
          title: tournament.title || 'Join DinkDraw Tournament',
          text: `Join ${tournament.title || 'this tournament'} on DinkDraw`,
          url,
        });
        setMessage('Share link opened.');
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage('Join link copied.');
    } catch {
      setMessage('Could not share join link.');
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

    if (isLocked) {
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

    setNewNames((prev) => ({
      ...prev,
      [slotId]: claimedName,
    }));

    await loadTournamentData(user.id);
    setMessage('Spot claimed.');
  }

  async function saveAllPlayerNames() {
    if (isLocked) {
      setMessage('Player names are locked.');
      return;
    }

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

      const { data: freshPlayers, error: freshPlayersError } = await supabase
        .from('tournament_players')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('slot_number', { ascending: true });

      if (freshPlayersError) {
        setMessage(`Could not load players: ${freshPlayersError.message}`);
        setIsStarting(false);
        return;
      }

      const namedPlayers = (freshPlayers || []).filter(
        (slot) => (slot.display_name || '').trim() !== ''
      );

      if (namedPlayers.length < 4) {
        setMessage('Please save at least 4 player names before starting.');
        setIsStarting(false);
        return;
      }

      const availableCourts = Math.max(1, Math.min(tournament.courts, Math.floor(namedPlayers.length / 4)));
      const scheduleRows = buildSchedule(namedPlayers, tournament.rounds, availableCourts);

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
      setSelectedRound(1);
      setMessage('Tournament started.');
    } catch (err) {
      setMessage(err instanceof Error ? `Start failed: ${err.message}` : 'Start failed.');
    }

    setIsStarting(false);
  }

  function setDraftScore(matchId: string, field: 'team_a_score' | 'team_b_score', value: string) {
    if (isCompleted) return;

    const sanitized = value.replace(/[^\d]/g, '');

    setScoreDrafts((prev) => ({
      ...prev,
      [matchId]: {
        team_a_score: prev[matchId]?.team_a_score ?? '',
        team_b_score: prev[matchId]?.team_b_score ?? '',
        [field]: sanitized,
      },
    }));
  }

  async function saveScoreField(matchId: string, field: 'team_a_score' | 'team_b_score') {
    if (isCompleted) {
      setMessage('Final results are locked.');
      return;
    }

    const match = matches.find((m) => m.id === matchId);
    if (match?.is_complete) return;

    const draft = scoreDrafts[matchId];
    if (!draft) return;

    const rawValue = draft[field];
    const numeric =
      rawValue.trim() === '' || Number.isNaN(Number(rawValue))
        ? null
        : Math.max(0, Number(rawValue));

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

  function getNextIncompleteRound(updatedMatches: Match[]) {
    const roundNumbers = Array.from(new Set(updatedMatches.map((m) => m.round_number))).sort((a, b) => a - b);

    for (const round of roundNumbers) {
      const roundMatches = updatedMatches.filter((m) => m.round_number === round && !m.is_bye);
      if (!roundMatches.length) continue;

      const allComplete = roundMatches.every((m) => m.is_complete);
      if (!allComplete) return round;
    }

    return null;
  }

  async function markTournamentCompleted() {
    if (!tournament || isCompleted) return true;

    const { error } = await supabase
      .from('tournaments')
      .update({ status: 'completed' })
      .eq('id', tournament.id);

    if (error) {
      setMessage(`Tournament completion failed: ${error.message}`);
      return false;
    }

    setTournament((prev) => (prev ? { ...prev, status: 'completed' } : prev));
    return true;
  }

  async function endTournamentEarly() {
    if (!tournament || !isOrganizer || !isStarted || isCompleted) return;

    const confirmed = window.confirm(
      'End this tournament now? Any unfinished rounds will be locked and the current standings will become final.'
    );

    if (!confirmed) return;

    setIsEndingEarly(true);
    setMessage('');

    const completed = await markTournamentCompleted();

    if (completed) {
      setActiveTab('standings');
      setSelectedRound(currentRound);
      setMessage('Tournament ended early. Final results are now locked.');
    }

    setIsEndingEarly(false);
  }

  async function submitMatchScore(matchId: string) {
    if (isCompleted) {
      setMessage('Final results are locked.');
      return;
    }

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

    if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
      setMessage('Scores must be valid numbers.');
      return;
    }

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

    const updatedMatches = matches.map((m) =>
      m.id === matchId
        ? { ...m, team_a_score: aNum, team_b_score: bNum, is_complete: true }
        : m
    );

    setMatches(updatedMatches);

    const submittedMatch = updatedMatches.find((m) => m.id === matchId);
    const submittedRound = submittedMatch?.round_number ?? selectedRound;
    const submittedRoundMatches = updatedMatches.filter(
      (m) => m.round_number === submittedRound && !m.is_bye
    );
    const submittedRoundComplete =
      submittedRoundMatches.length > 0 &&
      submittedRoundMatches.every((m) => m.is_complete);

    const nextRound = getNextIncompleteRound(updatedMatches);

    if (!nextRound) {
      const completed = await markTournamentCompleted();
      if (!completed) return;

      setSelectedRound(finalRound);
      setActiveTab('standings');
      setMessage('Score submitted. Tournament complete. Final results are now locked.');
      return;
    }

    if (submittedRoundComplete && nextRound !== submittedRound) {
      setSelectedRound(nextRound);
      setMessage(`Score submitted. Round ${submittedRound} complete. Advancing to Round ${nextRound}.`);
      return;
    }

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
            <button type="button" className="button primary" onClick={shareJoinLink}>
              Share Link
            </button>
            <span className={isLive ? 'tag green' : 'tag'}>
              {isLive ? 'Live Sync On' : 'Connecting...'}
            </span>
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
            <strong>
              {isCompleted ? 'Completed' : isStarted ? 'Started' : 'Setup'}
            </strong>
          </div>
          <div className="row-between">
            <span className="muted">Completed Matches</span>
            <strong>
              {completedMatchCount}/{totalPlayableMatchCount}
            </strong>
          </div>
          {isStarted && !isCompleted ? (
            <div className="row-between">
              <span className="muted">Live Round</span>
              <strong>Round {currentRound}</strong>
            </div>
          ) : null}
          {isCompleted ? (
            <div className="row-between">
              <span className="muted">Final Round View</span>
              <strong>Round {selectedRound}</strong>
            </div>
          ) : null}
        </div>

        {isOrganizer && isStarted && !isCompleted ? (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="button secondary"
              onClick={endTournamentEarly}
              disabled={isEndingEarly}
              style={{ width: '100%' }}
            >
              {isEndingEarly ? 'Ending Tournament...' : 'End Tournament Now'}
            </button>
          </div>
        ) : null}
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
            {isCompleted
              ? 'Tournament is complete. Player list is locked.'
              : isStarted
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
                const canClaim = !isClaimedBySomeone && !claimedSlot && !isLocked;
                const canEditName =
                  !isLocked &&
                  (isOrganizer || isMine || !isClaimedBySomeone);

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
                        ) : isLocked ? (
                          <button className="button secondary" disabled>
                            Locked
                          </button>
                        ) : canClaim ? (
                          <button className="button primary" onClick={() => claimSlot(slot.id)}>
                            Claim
                          </button>
                        ) : (
                          <span className="tag green">Open</span>
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

              {!isLocked ? (
                <>
                  <button className="button primary" onClick={saveAllPlayerNames} disabled={isSavingNames}>
                    {isSavingNames ? 'Saving...' : 'Save all player names'}
                  </button>

                  {isOrganizer ? (
                    <button
                      className="button secondary"
                      onClick={generateScheduleAndStart}
                      disabled={isStarting || !canStartTournament}
                    >
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
            {roundsAvailable.map((round) => {
              const status = roundStatusByRound.get(round);
              const isSelected = selectedRound === round;

              return (
                <button
                  key={round}
                  type="button"
                  className={`button ${isSelected ? 'primary' : 'secondary'}`}
                  onClick={() => setSelectedRound(round)}
                  style={{
                    minWidth: 84,
                    minHeight: 56,
                    flexShrink: 0,
                    fontWeight: 800,
                    fontSize: 20,
                    transform: isSelected ? 'scale(1.04)' : 'scale(1)',
                    boxShadow: isSelected ? '0 0 0 2px rgba(163,230,53,.25)' : undefined,
                    opacity: status === 'upcoming' ? 0.9 : 1,
                  }}
                >
                  {status === 'complete' ? `✓ R${round}` : status === 'current' ? `● R${round}` : `R${round}`}
                </button>
              );
            })}
          </div>

          <div className="card">
            <div className="card-title">Round {selectedRound}</div>
            <div className="card-subtitle">
              {isCompleted
                ? 'Tournament is complete. Scores are locked.'
                : selectedRound === currentRound && isStarted
                ? 'This is the current live round.'
                : roundStatusByRound.get(selectedRound) === 'complete'
                ? 'This round is complete.'
                : 'Keep one round on screen at a time so players always know where they are.'}
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
                              disabled={match.is_complete || isCompleted}
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
                              disabled={match.is_complete || isCompleted}
                              onChange={(e) => setDraftScore(match.id, 'team_b_score', e.target.value)}
                              onBlur={() => saveScoreField(match.id, 'team_b_score')}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {match.is_complete || isCompleted ? (
                          <button className="button secondary" disabled style={{ width: '100%' }}>
                            {isCompleted ? 'Final Locked' : 'Score Submitted'}
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
          <div className="card-title">{isCompleted ? 'Final Results' : 'Standings'}</div>
          <div className="card-subtitle">
            {isCompleted
              ? 'Tournament complete. Final results are locked.'
              : 'Wins first, then point differential.'}
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
