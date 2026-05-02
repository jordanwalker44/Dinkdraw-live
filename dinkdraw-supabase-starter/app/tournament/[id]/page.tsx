'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

export const dynamic = 'force-dynamic';

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
  format: string;
  match_format: string;
  doubles_mode: string | null;
  court_labels: string[] | null;
};

type PlayerSlot = {
  id: string;
  tournament_id: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id: string | null;
  gender: string | null;
};

type Match = {
  id: string;
  round_number: number;
  court_number: number | null;
  court_label: string | null;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  game_1_a: number | null;
  game_1_b: number | null;
  game_2_a: number | null;
  game_2_b: number | null;
  game_3_a: number | null;
  game_3_b: number | null;
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
  game_1_a: string;
  game_1_b: string;
  game_2_a: string;
  game_2_b: string;
  game_3_a: string;
  game_3_b: string;
};

type ScheduleRow = {
  round_number: number;
  court_number: number | null;
  court_label: string | null;
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

function singlesMatchupKey(a: string, b: string) {
  return [a, b].sort().join(' vs ');
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

function makeJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getCourtLabel(
  tournament: Tournament | null,
  courtNumber: number | null
) {
  if (courtNumber === null) return null;
  return tournament?.court_labels?.[courtNumber - 1]?.trim() || `Court ${courtNumber}`;
}

function buildSinglesSchedule(players: PlayerSlot[], rounds: number, courts: number): ScheduleRow[] {
  const activePlayers = players.filter((p) => (p.display_name || '').trim() !== '');
  if (activePlayers.length < 3) return [];

  const ids = activePlayers.map((p) => p.id);
  const maxParticipantsPerRound = Math.min(courts * 2, ids.length);
  const matchupCounts = new Map<string, number>();
  const playedCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const byeCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const courtHistory = new Map<string, number[]>(ids.map((id) => [id, []]));
  const output: ScheduleRow[] = [];

  function getMatchupCount(a: string, b: string) {
    return matchupCounts.get(singlesMatchupKey(a, b)) || 0;
  }

  function chooseParticipantsForRound() {
    const sorted = [...ids].sort((a, b) => {
      const byeDiff = (byeCounts.get(b) || 0) - (byeCounts.get(a) || 0);
      if (byeDiff !== 0) return byeDiff;
      const playDiff = (playedCounts.get(a) || 0) - (playedCounts.get(b) || 0);
      if (playDiff !== 0) return playDiff;
      return Math.random() - 0.5;
    });
    const count = Math.min(maxParticipantsPerRound, sorted.length);
    return count % 2 === 0 ? sorted.slice(0, count) : sorted.slice(0, count - 1);
  }

  function findBestSinglesMatches(participants: string[]) {
    let bestResult: Array<{ playerA: string; playerB: string }> | null = null;
    let bestPenalty = Infinity;

    for (let attempt = 0; attempt < 500; attempt++) {
      const shuffled = shuffle(participants);
      const pairs = chunkIntoGroups(shuffled, 2).filter((g) => g.length === 2);
      let penalty = 0;
      for (const [a, b] of pairs) {
        penalty += getMatchupCount(a, b) * 1000;
        penalty += (playedCounts.get(a) || 0) + (playedCounts.get(b) || 0);
        penalty += Math.random();
      }
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestResult = pairs.map(([a, b]) => ({ playerA: a, playerB: b }));
      }
    }
    return bestResult || [];
  }

  for (let round = 1; round <= rounds; round++) {
    const participants = chooseParticipantsForRound();
    const benched = ids.filter((id) => !participants.includes(id));
    const matches = findBestSinglesMatches(participants);
    if (!matches.length) break;

    benched.forEach((id) => {
      byeCounts.set(id, (byeCounts.get(id) || 0) + 1);
      output.push({ round_number: round, court_number: null, court_label: null, team_a_player_1_id: id, team_a_player_2_id: null, team_b_player_1_id: null, team_b_player_2_id: null, team_a_score: null, team_b_score: null, is_bye: true, is_complete: false });
    });

    matches.forEach((match, index) => {
      const { playerA, playerB } = match;
      matchupCounts.set(singlesMatchupKey(playerA, playerB), getMatchupCount(playerA, playerB) + 1);
      playedCounts.set(playerA, (playedCounts.get(playerA) || 0) + 1);
      playedCounts.set(playerB, (playedCounts.get(playerB) || 0) + 1);
output.push({ round_number: round, court_number: index + 1, court_label: null, team_a_player_1_id: playerA, team_a_player_2_id: null, team_b_player_1_id: playerB, team_b_player_2_id: null, team_a_score: null, team_b_score: null, is_bye: false, is_complete: false });    });
  }
  return output;
}

function buildDoublesSchedule(players: PlayerSlot[], rounds: number, courts: number): ScheduleRow[] {
  const MAX_ATTEMPTS = 40;

  for (let scheduleAttempt = 0; scheduleAttempt < MAX_ATTEMPTS; scheduleAttempt++) {
    const activePlayers = players.filter((p) => (p.display_name || '').trim() !== '');
    if (activePlayers.length < 4) return [];

    const ids = shuffle(activePlayers.map((p) => p.id));
    const maxParticipantsPerRound = Math.min(courts * 4, ids.length);

    const partnerCounts = new Map<string, number>();
    const matchupCounts = new Map<string, number>();
    const playedCounts = new Map<string, number>(ids.map((id) => [id, 0]));
    const byeCounts = new Map<string, number>(ids.map((id) => [id, 0]));
    const courtHistory = new Map<string, number[]>(ids.map((id) => [id, []]));
    const recentMatchHistory = new Map<string, string[]>(ids.map((id) => [id, []]));
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

    function getAllPairings(group: string[]): Array<{ teamA: [string, string]; teamB: [string, string] }> {
      if (group.length !== 4) return [];
      const [a, b, c, d] = group;
      return [
        { teamA: [a, b], teamB: [c, d] },
        { teamA: [a, c], teamB: [b, d] },
        { teamA: [a, d], teamB: [b, c] },
      ];
    }

    function scoreMatch(
      teamA: [string, string],
      teamB: [string, string],
      allowRepeatPartners: boolean,
      courtNumber: number
    ) {
      const [a1, a2] = teamA;
      const [b1, b2] = teamB;

      const partnerRepeatA = getPartnerCount(a1, a2);
      const partnerRepeatB = getPartnerCount(b1, b2);

      if (!allowRepeatPartners && (partnerRepeatA > 0 || partnerRepeatB > 0)) {
        return null;
      }

      let penalty = 0;

      penalty += partnerRepeatA * 100000;
      penalty += partnerRepeatB * 100000;
      penalty += getMatchupCount(a1, a2, b1, b2) * 5000;

      penalty += (playedCounts.get(a1) || 0) * 10;
      penalty += (playedCounts.get(a2) || 0) * 10;
      penalty += (playedCounts.get(b1) || 0) * 10;
      penalty += (playedCounts.get(b2) || 0) * 10;

      const allPlayers = [a1, a2, b1, b2];

      for (const id of allPlayers) {
        const history = courtHistory.get(id) || [];
        const lastTwo = history.slice(-2);

        if (lastTwo.length === 2 && lastTwo.every((c) => c === courtNumber)) {
          penalty += 1200;
        }
      }

      for (const id of allPlayers) {
        const history = courtHistory.get(id) || [];
        const lastCourt = history[history.length - 1];

        if (lastCourt === courtNumber) penalty += 300;
      }

      const recentPairs: Array<[string, string]> = [
        [a1, a2],
        [a1, b1],
        [a1, b2],
        [a2, b1],
        [a2, b2],
        [b1, b2],
      ];

      for (const [p1, p2] of recentPairs) {
        const history1 = recentMatchHistory.get(p1) || [];
        const history2 = recentMatchHistory.get(p2) || [];

        if (history1.includes(p2) || history2.includes(p1)) {
          penalty += 800;
        }
      }

      penalty += Math.random();
      return penalty;
    }

    function buildRoundMatches(
      participants: string[],
      allowRepeatPartners: boolean
    ): Array<{ teamA: [string, string]; teamB: [string, string] }> | null {
      if (participants.length % 4 !== 0) return null;

      let bestMatches: Array<{ teamA: [string, string]; teamB: [string, string] }> | null = null;
      let bestPenalty = Infinity;

      function backtrack(
        remaining: string[],
        current: Array<{ teamA: [string, string]; teamB: [string, string] }>,
        currentPenalty: number
      ) {
        if (remaining.length === 0) {
          if (currentPenalty < bestPenalty) {
            bestPenalty = currentPenalty;
            bestMatches = [...current];
          }
          return;
        }

        if (currentPenalty >= bestPenalty) return;

        const first = remaining[0];

        for (let i = 1; i < remaining.length; i++) {
          for (let j = i + 1; j < remaining.length; j++) {
            for (let k = j + 1; k < remaining.length; k++) {
              const group = [first, remaining[i], remaining[j], remaining[k]];
              const pairings = getAllPairings(group);

              for (const pairing of pairings) {
                const courtNumber = current.length + 1;
                const score = scoreMatch(pairing.teamA, pairing.teamB, allowRepeatPartners, courtNumber);
                if (score === null) continue;

                const used = new Set(group);
                const nextRemaining = remaining.filter((id) => !used.has(id));

                current.push(pairing);
                backtrack(nextRemaining, current, currentPenalty + score);
                current.pop();
              }
            }
          }
        }
      }

      backtrack(shuffle([...participants]), [], 0);
      return bestMatches;
    }

    let success = true;

    for (let round = 1; round <= rounds; round++) {
      const participants = chooseParticipantsForRound();
      const benched = ids.filter((id) => !participants.includes(id));

      let matches: Array<{ teamA: [string, string]; teamB: [string, string] }> | null = null;

      for (let roundAttempt = 0; roundAttempt < 25; roundAttempt++) {
        matches = buildRoundMatches(shuffle(participants), false);
        if (matches) break;
      }

      if (!matches) {
        matches = buildRoundMatches(participants, true);
      }

      if (!matches || !matches.length) {
        success = false;
        break;
      }

      benched.forEach((id) => {
        byeCounts.set(id, (byeCounts.get(id) || 0) + 1);
        output.push({
          round_number: round,
          court_number: null,
          court_label: null,
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

          const courtEntries = courtHistory.get(id) || [];
          courtEntries.push(index + 1);
          courtHistory.set(id, courtEntries);
        });

        const sameMatchPairs: Array<[string, string]> = [
          [a1, a2],
          [a1, b1],
          [a1, b2],
          [a2, b1],
          [a2, b2],
          [b1, b2],
        ];

        sameMatchPairs.forEach(([p1, p2]) => {
          const p1History = recentMatchHistory.get(p1) || [];
          const p2History = recentMatchHistory.get(p2) || [];

          p1History.push(p2);
          p2History.push(p1);

          recentMatchHistory.set(p1, p1History.slice(-4));
          recentMatchHistory.set(p2, p2History.slice(-4));
        });

        output.push({
          round_number: round,
          court_number: index + 1,
          court_label: null,
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

    if (success) {
      const generatedRounds = new Set(
        output.filter((row) => !row.is_bye).map((row) => row.round_number)
      );

      if (generatedRounds.size >= rounds) {
        return output;
      }
    }
  }

  return [];
}

    function buildFixedPartnersSchedule(
  players: PlayerSlot[],
  rounds: number,
  courts: number
): ScheduleRow[] {
  const activePlayers = players.filter((p) => (p.display_name || '').trim() !== '');
  if (activePlayers.length < 4) return [];
  if (activePlayers.length % 2 !== 0) return [];

  const teams = [];
  for (let i = 0; i < activePlayers.length; i += 2) {
    const player1 = activePlayers[i];
    const player2 = activePlayers[i + 1];

    if (!player1 || !player2) return [];

    teams.push({
      player1Id: player1.id,
      player2Id: player2.id,
    });
  }

  if (teams.length < 2) return [];

  const allMatchups: Array<{
    teamA: { player1Id: string; player2Id: string };
    teamB: { player1Id: string; player2Id: string };
  }> = [];

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      allMatchups.push({
        teamA: teams[i],
        teamB: teams[j],
      });
    }
  }

  if (!allMatchups.length) return [];

  const output: ScheduleRow[] = [];
  let matchupIndex = 0;

  for (let round = 1; round <= rounds; round += 1) {
    let courtsUsedThisRound = 0;
    const usedTeamIndexes = new Set<number>();

    for (let i = 0; i < allMatchups.length; i += 1) {
      if (courtsUsedThisRound >= courts) break;

      const currentIndex = (matchupIndex + i) % allMatchups.length;
      const matchup = allMatchups[currentIndex];

      const teamAIndex = teams.findIndex(
        (t) =>
          t.player1Id === matchup.teamA.player1Id &&
          t.player2Id === matchup.teamA.player2Id
      );

      const teamBIndex = teams.findIndex(
        (t) =>
          t.player1Id === matchup.teamB.player1Id &&
          t.player2Id === matchup.teamB.player2Id
      );

      if (usedTeamIndexes.has(teamAIndex) || usedTeamIndexes.has(teamBIndex)) {
        continue;
      }

      usedTeamIndexes.add(teamAIndex);
      usedTeamIndexes.add(teamBIndex);
      courtsUsedThisRound += 1;

      output.push({
        round_number: round,
        court_number: courtsUsedThisRound,
        court_label: null,
        team_a_player_1_id: matchup.teamA.player1Id,
        team_a_player_2_id: matchup.teamA.player2Id,
        team_b_player_1_id: matchup.teamB.player1Id,
        team_b_player_2_id: matchup.teamB.player2Id,
        team_a_score: null,
        team_b_score: null,
        is_bye: false,
        is_complete: false,
      });
    }

    matchupIndex = (matchupIndex + courtsUsedThisRound) % allMatchups.length;
  }

  return output;
}

function buildMixedDoublesSchedule(
  players: PlayerSlot[],
  rounds: number,
  courts: number
): ScheduleRow[] {
  const activePlayers = players.filter((p) => (p.display_name || '').trim() !== '');
  if (activePlayers.length < 4) return [];
  if (activePlayers.length % 2 !== 0) return [];

  const malePlayers = activePlayers.filter((p) => p.gender === 'male');
  const femalePlayers = activePlayers.filter((p) => p.gender === 'female');

  if (!malePlayers.length || !femalePlayers.length) return [];
  if (malePlayers.length !== femalePlayers.length) return [];

  const maxParticipantsPerRound = Math.min(courts * 4, activePlayers.length);

  const partnerCounts = new Map<string, number>();
  const matchupCounts = new Map<string, number>();
  const playedCounts = new Map<string, number>(
    activePlayers.map((player) => [player.id, 0])
  );
  const byeCounts = new Map<string, number>(
    activePlayers.map((player) => [player.id, 0])
  );
  const courtHistory = new Map<string, number[]>(
    activePlayers.map((player) => [player.id, []])
  );
  const recentMatchHistory = new Map<string, string[]>(
    activePlayers.map((player) => [player.id, []])
  );

  const output: ScheduleRow[] = [];

  function getPartnerCount(a: string, b: string) {
    return partnerCounts.get(pairKey(a, b)) || 0;
  }

  function getMatchupCount(a1: string, a2: string, b1: string, b2: string) {
    return matchupCounts.get(matchupKey(a1, a2, b1, b2)) || 0;
  }

  function chooseParticipantsForRound() {
    const maleSorted = [...malePlayers].sort((a, b) => {
      const byeDiff = (byeCounts.get(b.id) || 0) - (byeCounts.get(a.id) || 0);
      if (byeDiff !== 0) return byeDiff;

      const playDiff = (playedCounts.get(a.id) || 0) - (playedCounts.get(b.id) || 0);
      if (playDiff !== 0) return playDiff;

      return Math.random() - 0.5;
    });

    const femaleSorted = [...femalePlayers].sort((a, b) => {
      const byeDiff = (byeCounts.get(b.id) || 0) - (byeCounts.get(a.id) || 0);
      if (byeDiff !== 0) return byeDiff;

      const playDiff = (playedCounts.get(a.id) || 0) - (playedCounts.get(b.id) || 0);
      if (playDiff !== 0) return playDiff;

      return Math.random() - 0.5;
    });

    const pairsPerRound = Math.min(
      Math.floor(maxParticipantsPerRound / 4) * 2,
      maleSorted.length,
      femaleSorted.length
    );

    return {
      selectedMaleIds: maleSorted.slice(0, pairsPerRound).map((p) => p.id),
      selectedFemaleIds: femaleSorted.slice(0, pairsPerRound).map((p) => p.id),
    };
  }

  function getAllMixedPairings(
    maleIds: string[],
    femaleIds: string[]
  ): Array<{ teamA: [string, string]; teamB: [string, string] }> {
    if (maleIds.length !== 2 || femaleIds.length !== 2) return [];

    const [m1, m2] = maleIds;
    const [f1, f2] = femaleIds;

    return [
      { teamA: [m1, f1], teamB: [m2, f2] },
      { teamA: [m1, f2], teamB: [m2, f1] },
    ];
  }

  function scoreMatch(
    teamA: [string, string],
    teamB: [string, string],
    allowRepeatPartners: boolean,
    courtNumber: number
  ) {
    const [a1, a2] = teamA;
    const [b1, b2] = teamB;

    const partnerRepeatA = getPartnerCount(a1, a2);
    const partnerRepeatB = getPartnerCount(b1, b2);

    if (!allowRepeatPartners && (partnerRepeatA > 0 || partnerRepeatB > 0)) {
      return null;
    }

    let penalty = 0;

    penalty += partnerRepeatA * 100000;
    penalty += partnerRepeatB * 100000;
    penalty += getMatchupCount(a1, a2, b1, b2) * 5000;

    penalty += (playedCounts.get(a1) || 0) * 10;
    penalty += (playedCounts.get(a2) || 0) * 10;
    penalty += (playedCounts.get(b1) || 0) * 10;
    penalty += (playedCounts.get(b2) || 0) * 10;

    const allPlayers = [a1, a2, b1, b2];

    for (const id of allPlayers) {
      const history = courtHistory.get(id) || [];
      const lastTwo = history.slice(-2);

      if (lastTwo.length === 2 && lastTwo.every((c) => c === courtNumber)) {
        return null;
      }
    }

    for (const id of allPlayers) {
      const history = courtHistory.get(id) || [];
      const lastCourt = history[history.length - 1];

      if (lastCourt === courtNumber) penalty += 300;
    }

    const recentPairs: Array<[string, string]> = [
      [a1, a2],
      [a1, b1],
      [a1, b2],
      [a2, b1],
      [a2, b2],
      [b1, b2],
    ];

    for (const [p1, p2] of recentPairs) {
      const history1 = recentMatchHistory.get(p1) || [];
      const history2 = recentMatchHistory.get(p2) || [];

      if (history1.includes(p2) || history2.includes(p1)) {
        penalty += 800;
      }
    }

    penalty += Math.random();

    return penalty;
  }

  function buildRoundMatches(
    selectedMaleIds: string[],
    selectedFemaleIds: string[],
    allowRepeatPartners: boolean
  ): Array<{ teamA: [string, string]; teamB: [string, string] }> | null {
    if (selectedMaleIds.length !== selectedFemaleIds.length) return null;
    if ((selectedMaleIds.length + selectedFemaleIds.length) % 4 !== 0) return null;

    let bestMatches: Array<{ teamA: [string, string]; teamB: [string, string] }> | null = null;
    let bestPenalty = Infinity;

    function backtrack(
      remainingMaleIds: string[],
      remainingFemaleIds: string[],
      current: Array<{ teamA: [string, string]; teamB: [string, string] }>,
      currentPenalty: number
    ) {
      if (remainingMaleIds.length === 0 && remainingFemaleIds.length === 0) {
        if (currentPenalty < bestPenalty) {
          bestPenalty = currentPenalty;
          bestMatches = [...current];
        }
        return;
      }

      if (currentPenalty >= bestPenalty) return;
      if (remainingMaleIds.length < 2 || remainingFemaleIds.length < 2) return;

      const firstMale = remainingMaleIds[0];

      for (let i = 1; i < remainingMaleIds.length; i += 1) {
        for (let j = 0; j < remainingFemaleIds.length; j += 1) {
          for (let k = j + 1; k < remainingFemaleIds.length; k += 1) {
            const maleGroup = [firstMale, remainingMaleIds[i]];
            const femaleGroup = [remainingFemaleIds[j], remainingFemaleIds[k]];
            const pairings = getAllMixedPairings(maleGroup, femaleGroup);

            for (const pairing of pairings) {
              const courtNumber = current.length + 1;
              const score = scoreMatch(
                pairing.teamA,
                pairing.teamB,
                allowRepeatPartners,
                courtNumber
              );

              if (score === null) continue;

              const usedMale = new Set(maleGroup);
              const usedFemale = new Set(femaleGroup);

              const nextRemainingMaleIds = remainingMaleIds.filter((id) => !usedMale.has(id));
              const nextRemainingFemaleIds = remainingFemaleIds.filter((id) => !usedFemale.has(id));

              current.push(pairing);
              backtrack(
                nextRemainingMaleIds,
                nextRemainingFemaleIds,
                current,
                currentPenalty + score
              );
              current.pop();
            }
          }
        }
      }
    }

    backtrack(
      shuffle([...selectedMaleIds]),
      shuffle([...selectedFemaleIds]),
      [],
      0
    );

    return bestMatches;
  }

  for (let round = 1; round <= rounds; round += 1) {
    const { selectedMaleIds, selectedFemaleIds } = chooseParticipantsForRound();
    const participants = new Set([...selectedMaleIds, ...selectedFemaleIds]);

    const benched = activePlayers
      .map((player) => player.id)
      .filter((id) => !participants.has(id));

    let matches = null;

    for (let attempt = 0; attempt < 25; attempt += 1) {
      matches = buildRoundMatches(
        shuffle([...selectedMaleIds]),
        shuffle([...selectedFemaleIds]),
        false
      );
      if (matches) break;
    }

    if (!matches) {
      matches = buildRoundMatches(selectedMaleIds, selectedFemaleIds, true);
    }

    if (!matches || !matches.length) break;

    benched.forEach((id) => {
      byeCounts.set(id, (byeCounts.get(id) || 0) + 1);
      output.push({
        round_number: round,
        court_number: null,
        court_label: null,
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

        const courtEntries = courtHistory.get(id) || [];
        courtEntries.push(index + 1);
        courtHistory.set(id, courtEntries);
      });

      const sameMatchPairs: Array<[string, string]> = [
        [a1, a2],
        [a1, b1],
        [a1, b2],
        [a2, b1],
        [a2, b2],
        [b1, b2],
      ];

      sameMatchPairs.forEach(([p1, p2]) => {
        const p1History = recentMatchHistory.get(p1) || [];
        const p2History = recentMatchHistory.get(p2) || [];

        p1History.push(p2);
        p2History.push(p1);

        recentMatchHistory.set(p1, p1History.slice(-4));
        recentMatchHistory.set(p2, p2History.slice(-4));
      });

      output.push({
        round_number: round,
        court_number: index + 1,
        court_label: null,
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

function buildSchedule(
  players: PlayerSlot[],
  rounds: number,
  courts: number,
  format: string,
  doublesMode: string | null
): ScheduleRow[] {
  if (format === 'singles') {
    return buildSinglesSchedule(players, rounds, courts);
  }

    if (doublesMode === 'fixed') {
    return buildFixedPartnersSchedule(players, rounds, courts);
  }

    if (doublesMode === 'mixed') {
    return buildMixedDoublesSchedule(players, rounds, courts);
  }

  return buildDoublesSchedule(players, rounds, courts);
}

// Best of 3 helpers
function getSeriesWins(match: Match): { aWins: number; bWins: number } {
  let aWins = 0;
  let bWins = 0;
  if (match.game_1_a !== null && match.game_1_b !== null) {
    if (match.game_1_a > match.game_1_b) aWins++;
    else if (match.game_1_b > match.game_1_a) bWins++;
  }
  if (match.game_2_a !== null && match.game_2_b !== null) {
    if (match.game_2_a > match.game_2_b) aWins++;
    else if (match.game_2_b > match.game_2_a) bWins++;
  }
  if (match.game_3_a !== null && match.game_3_b !== null) {
    if (match.game_3_a > match.game_3_b) aWins++;
    else if (match.game_3_b > match.game_3_a) bWins++;
  }
  return { aWins, bWins };
}

function isSeriesComplete(match: Match): boolean {
  const { aWins, bWins } = getSeriesWins(match);
  if (aWins === 2 || bWins === 2) return true;
  return false;
}

function needsGame3(match: Match): boolean {
  if (match.game_1_a === null || match.game_1_b === null) return false;
  if (match.game_2_a === null || match.game_2_b === null) return false;
  const game1AWon = match.game_1_a > match.game_1_b;
  const game2AWon = match.game_2_a > match.game_2_b;
  return game1AWon !== game2AWon;
}

function getSeriesScore(match: Match): { aScore: number; bScore: number } {
  let aTotal = 0;
  let bTotal = 0;
  if (match.game_1_a !== null) aTotal += match.game_1_a;
  if (match.game_1_b !== null) bTotal += match.game_1_b;
  if (match.game_2_a !== null) aTotal += match.game_2_a;
  if (match.game_2_b !== null) bTotal += match.game_2_b;
  if (match.game_3_a !== null) aTotal += match.game_3_a;
  if (match.game_3_b !== null) bTotal += match.game_3_b;
  return { aScore: aTotal, bScore: bTotal };
}
function computeStandings(
  playerSlots: PlayerSlot[],
  matches: Match[],
  isSingles: boolean,
  isBestOf3: boolean
): StandingRow[] {
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
      match.team_a_player_1_id === null ||
      match.team_b_player_1_id === null
    ) {
      continue;
    }

    const aIds = isSingles
      ? [match.team_a_player_1_id]
      : ([match.team_a_player_1_id, match.team_a_player_2_id].filter(Boolean) as string[]);

    const bIds = isSingles
      ? [match.team_b_player_1_id]
      : ([match.team_b_player_1_id, match.team_b_player_2_id].filter(Boolean) as string[]);

    if (isBestOf3) {
      const games = [
        [match.game_1_a, match.game_1_b],
        [match.game_2_a, match.game_2_b],
        [match.game_3_a, match.game_3_b],
      ] as const;

      for (const [gA, gB] of games) {
        if (gA === null || gB === null) continue;

        for (const id of [...aIds, ...bIds]) {
          const row = rows.get(id);
          if (row) row.played += 1;
        }

        for (const id of aIds) {
          const row = rows.get(id);
          if (!row) continue;
          row.pointsFor += gA;
          row.pointsAgainst += gB;
        }

        for (const id of bIds) {
          const row = rows.get(id);
          if (!row) continue;
          row.pointsFor += gB;
          row.pointsAgainst += gA;
        }

        if (gA > gB) {
          aIds.forEach((id) => {
            const row = rows.get(id);
            if (row) row.wins += 1;
          });
          bIds.forEach((id) => {
            const row = rows.get(id);
            if (row) row.losses += 1;
          });
        } else if (gB > gA) {
          bIds.forEach((id) => {
            const row = rows.get(id);
            if (row) row.wins += 1;
          });
          aIds.forEach((id) => {
            const row = rows.get(id);
            if (row) row.losses += 1;
          });
        }
      }

      continue;
    }

    if (match.team_a_score === null || match.team_b_score === null) continue;

    const aScore = match.team_a_score;
    const bScore = match.team_b_score;

    for (const id of [...aIds, ...bIds]) {
      const row = rows.get(id);
      if (row) row.played += 1;
    }

    for (const id of aIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.pointsFor += aScore;
      row.pointsAgainst += bScore;
    }

    for (const id of bIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.pointsFor += bScore;
      row.pointsAgainst += aScore;
    }

    if (aScore > bScore) {
      aIds.forEach((id) => {
        const row = rows.get(id);
        if (row) row.wins += 1;
      });
      bIds.forEach((id) => {
        const row = rows.get(id);
        if (row) row.losses += 1;
      });
    } else if (bScore > aScore) {
      bIds.forEach((id) => {
        const row = rows.get(id);
        if (row) row.wins += 1;
      });
      aIds.forEach((id) => {
        const row = rows.get(id);
        if (row) row.losses += 1;
      });
    }
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      pointDiff: row.pointsFor - row.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.name.localeCompare(b.name);
    });
}
export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [isSavingNames, setIsSavingNames] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isEndingEarly, setIsEndingEarly] = useState(false);
  const [isRematching, setIsRematching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'players' | 'rounds' | 'standings'>('players');
  const [selectedRound, setSelectedRound] = useState(1);
  const [copied, setCopied] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [standingsView, setStandingsView] = useState<'leaderboard' | 'day'>('leaderboard');

   const isSingles = tournament?.format === 'singles';
  const isBestOf3 = tournament?.match_format === 'best_of_3';
  const isStarted = tournament?.status === 'started';
  const isCompleted = tournament?.status === 'completed';
  const isLocked = isStarted || isCompleted;
  const isScheduleLocked = isStarted || isCompleted || matches.length > 0;
  const publicViewUrl =
    typeof window !== 'undefined' && tournament?.id
      ? `${window.location.origin}/tournament/view/${tournament.id}`
      : '';
  const minPlayersRequired = isSingles ? 3 : 4;
  const tournamentModeBadges = getTournamentModeBadges(tournament);

  const claimedSlot = useMemo(() => playerSlots.find((slot) => slot.claimed_by_user_id === userId) || null, [playerSlots, userId]);
  const playersById = useMemo(() => Object.fromEntries(playerSlots.map((slot) => [slot.id, slot])), [playerSlots]);

  const roundsAvailable = useMemo(() => {
    const roundSet = new Set<number>();
    matches.forEach((m) => roundSet.add(m.round_number));
    if (!roundSet.size && tournament?.rounds) {
      for (let i = 1; i <= tournament.rounds; i++) roundSet.add(i);
    }
    return Array.from(roundSet).sort((a, b) => a - b);
  }, [matches, tournament]);

  const currentRound = useMemo(() => {
    if (!matches.length) return roundsAvailable[0] || 1;
    for (const round of roundsAvailable) {
      const roundMatches = matches.filter((m) => m.round_number === round && !m.is_bye);
      if (!roundMatches.length) continue;
      if (!roundMatches.every((m) => m.is_complete)) return round;
    }
    return roundsAvailable[roundsAvailable.length - 1] || 1;
  }, [matches, roundsAvailable]);

  const finalRound = useMemo(() => roundsAvailable[roundsAvailable.length - 1] || 1, [roundsAvailable]);
  const completedMatchCount = useMemo(() => matches.filter((m) => !m.is_bye && m.is_complete).length, [matches]);
  const totalPlayableMatchCount = useMemo(() => matches.filter((m) => !m.is_bye).length, [matches]);

  const roundStatusByRound = useMemo(() => {
    const statusMap = new Map<number, 'current' | 'complete' | 'upcoming'>();
    for (const round of roundsAvailable) {
      const roundMatches = matches.filter((m) => m.round_number === round && !m.is_bye);
      if (!roundMatches.length) {
        statusMap.set(round, round === currentRound ? 'current' : round < currentRound ? 'complete' : 'upcoming');
        continue;
      }
      if (roundMatches.every((m) => m.is_complete)) statusMap.set(round, 'complete');
      else if (round === currentRound) statusMap.set(round, 'current');
      else if (round < currentRound) statusMap.set(round, 'complete');
      else statusMap.set(round, 'upcoming');
    }
    return statusMap;
  }, [matches, roundsAvailable, currentRound]);

  const matchesForSelectedRound = useMemo(() => matches.filter((m) => m.round_number === selectedRound && !m.is_bye), [matches, selectedRound]);
  const byesForSelectedRound = useMemo(() => matches.filter((m) => m.round_number === selectedRound && m.is_bye), [matches, selectedRound]);
const currentRoundMatches = useMemo(
  () => matches.filter((m) => m.round_number === currentRound && !m.is_bye),
  [matches, currentRound]
);

const nextUpMatch = useMemo(
  () => currentRoundMatches.find((m) => !m.is_complete) || null,
  [currentRoundMatches]
);

const upcomingMatch = useMemo(
  () =>
    nextUpMatch
      ? matches.find(
          (m) =>
            !m.is_complete &&
            !m.is_bye &&
            m.id !== nextUpMatch.id &&
            (
              m.round_number > nextUpMatch.round_number ||
              (
                m.round_number === nextUpMatch.round_number &&
                (m.court_number ?? 0) > (nextUpMatch.court_number ?? 0)
              )
            )
        ) || null
      : null,
  [matches, nextUpMatch]
);

const currentRoundComplete = useMemo(
  () =>
    currentRoundMatches.length > 0 &&
    currentRoundMatches.every((m) => m.is_complete),
  [currentRoundMatches]
);
  useEffect(() => {
  setStandings(computeStandings(playerSlots, matches, isSingles, isBestOf3));
}, [playerSlots, matches, isSingles, isBestOf3]);

  const isOrganizer = tournament?.organizer_user_id === userId;
  useEffect(() => {
  if (!isOrganizer && isStarted) {
    setActiveTab('rounds');
  }
}, [isOrganizer, isStarted]);
  const tournamentWinner = standings[0] || null;

  const canStartTournament = useMemo(() => {
    if (!tournament) return false;
    if (tournament.status === 'started' || tournament.status === 'completed') return false;
    const namedCount = playerSlots.filter((slot) => (newNames[slot.id] ?? slot.display_name ?? '').trim() !== '').length;
    return namedCount >= minPlayersRequired;
  }, [tournament, playerSlots, newNames, minPlayersRequired]);

  async function loadTournamentData(currentUserId?: string) {
  const [tournamentResult, playersResult] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('tournament_players')
      .select('*')
      .eq('tournament_id', params.id)
      .order('slot_number', { ascending: true }),
  ]);

  const tournamentData = tournamentResult.data;
  const playersData = playersResult.data;

  setTournament(tournamentData || null);
  setPlayerSlots(playersData || []);

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
        if (typeof next[slot.id] !== 'string') {
          next[slot.id] = slot.display_name || '';
        }
      }
      return next;
    });
  }

  if (currentUserId) setUserId(currentUserId);

  // 👇 load matches AFTER UI renders
  setTimeout(async () => {
    const { data: matchesData } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', params.id)
      .order('round_number', { ascending: true })
      .order('court_number', { ascending: true });

    const safeMatches = matchesData || [];
    setMatches(safeMatches);

  setScoreDrafts(() => {
  const next: Record<string, ScoreDraft> = {};
  for (const match of safeMatches) {
    next[match.id] = {
      team_a_score: match.team_a_score === null ? '' : String(match.team_a_score),
      team_b_score: match.team_b_score === null ? '' : String(match.team_b_score),
      game_1_a: match.game_1_a === null ? '' : String(match.game_1_a),
      game_1_b: match.game_1_b === null ? '' : String(match.game_1_b),
      game_2_a: match.game_2_a === null ? '' : String(match.game_2_a),
      game_2_b: match.game_2_b === null ? '' : String(match.game_2_b),
      game_3_a: match.game_3_a === null ? '' : String(match.game_3_a),
      game_3_b: match.game_3_b === null ? '' : String(match.game_3_b),
    };
  }
  return next;
});
  }, 0);
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
    .channel(`organizer-tournament-live-${params.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `tournament_id=eq.${params.id}`,
      },
      async () => {
  const { data } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', params.id)
    .order('round_number', { ascending: true })
    .order('court_number', { ascending: true });

  const safeMatches = data || [];
  setMatches(safeMatches);

  setScoreDrafts(() => {
    const next: Record<string, ScoreDraft> = {};
    for (const match of safeMatches) {
      next[match.id] = {
        team_a_score: match.team_a_score === null ? '' : String(match.team_a_score),
        team_b_score: match.team_b_score === null ? '' : String(match.team_b_score),
        game_1_a: match.game_1_a === null ? '' : String(match.game_1_a),
        game_1_b: match.game_1_b === null ? '' : String(match.game_1_b),
        game_2_a: match.game_2_a === null ? '' : String(match.game_2_a),
        game_2_b: match.game_2_b === null ? '' : String(match.game_2_b),
        game_3_a: match.game_3_a === null ? '' : String(match.game_3_a),
        game_3_b: match.game_3_b === null ? '' : String(match.game_3_b),
      };
    }
    return next;
  });
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
        await loadTournamentData();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tournaments',
        filter: `id=eq.${params.id}`,
      },
      async () => {
        await loadTournamentData();
      }
    )
    .subscribe((status) => {
      setIsLive(status === 'SUBSCRIBED');
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}, [params.id, supabase]);

  useEffect(() => {
    if (!roundsAvailable.length) return;
    setSelectedRound((prev) => {
      if (!roundsAvailable.includes(prev)) return isCompleted ? finalRound : currentRound;
      return prev;
    });
  }, [roundsAvailable, currentRound, finalRound, isCompleted]);

  useEffect(() => {
    if (isCompleted) { setSelectedRound(finalRound); setActiveTab('standings'); return; }
    if (isStarted && matches.length > 0) setSelectedRound(currentRound);
  }, [isStarted, isCompleted, matches.length, currentRound, finalRound]);
  useEffect(() => {
  if (!isStarted || isCompleted || !nextUpMatch) return;

  const timeout = window.setTimeout(() => {
    const el = document.getElementById(getMatchElementId(nextUpMatch.id));
    if (!el) return;

    el.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, 150);

  return () => window.clearTimeout(timeout);
}, [nextUpMatch?.id, isStarted, isCompleted]);

  async function copyJoinCode() {
    try {
      if (!tournament?.join_code) return;
      await navigator.clipboard.writeText(tournament.join_code);
      setCopied(true);
      setMessage('Join code copied.');
      setTimeout(() => setCopied(false), 1500);
    } catch { setMessage('Could not copy join code.'); }
  }

  async function shareJoinLink() {
    try {
      if (!tournament?.join_code) return;
      const url = `https://dinkdraw.app/tournament/join?code=${encodeURIComponent(tournament.join_code)}`;
      if (navigator.share) {
        await navigator.share({
          title: `Join ${tournament.title || 'DinkDraw Tournament'}`,
          text: `Join ${tournament.title || 'this tournament'} on DinkDraw! Tap the link to claim your spot:`,
          url,
        });
        setMessage('Share link opened.');
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage('Join link copied.');
    } catch { setMessage('Could not share join link.'); }
  }

  async function copyPublicLink() {
    try {
      if (!publicViewUrl) return;
      await navigator.clipboard.writeText(publicViewUrl);
      setMessage('Public link copied.');
    } catch {
      setMessage('Could not copy public link.');
    }
  }

  async function claimSlot(slotId: string) {
    setMessage('');
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) { setMessage('Sign in first.'); return; }
    if (claimedSlot) { setMessage('You already claimed a spot in this tournament.'); return; }
    if (isLocked) { setMessage('Tournament already started. Player spots are locked.'); return; }

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const claimedName = profile?.display_name?.trim() || user.email?.split('@')[0] || 'Player';

    const { error } = await supabase.from('tournament_players').update({ claimed_by_user_id: user.id, display_name: claimedName }).eq('id', slotId).is('claimed_by_user_id', null);
    if (error) { setMessage(error.message); return; }

    setNewNames((prev) => ({ ...prev, [slotId]: claimedName }));
    await loadTournamentData(user.id);
    setMessage('Spot claimed.');
  }

    async function clearPlayerSpot(slotId: string) {
    if (!isOrganizer) {
      setMessage('Only the organizer can clear player spots.');
      return;
    }

    if (isLocked) {
      setMessage('Tournament already started. Player spots are locked.');
      return;
    }

    setMessage('');

    const { error } = await supabase
      .from('tournament_players')
      .update({
        claimed_by_user_id: null,
        display_name: '',
        gender: null,
      })
      .eq('id', slotId);

    if (error) {
      setMessage(`Clear failed: ${error.message}`);
      return;
    }

    setNewNames((prev) => ({ ...prev, [slotId]: '' }));
    await loadTournamentData(userId);
    setMessage('Player spot cleared.');
  }

  async function saveAllPlayerNames() {
    if (isLocked) { setMessage('Player names are locked.'); return; }
    setMessage('');
    setIsSavingNames(true);
    try {
      for (const slot of playerSlots) {
        const nextName = (newNames[slot.id] ?? slot.display_name ?? '').trim();
        const { error } = await supabase.from('tournament_players').update({ display_name: nextName }).eq('id', slot.id);
        if (error) { setMessage(`Save failed: ${error.message}`); setIsSavingNames(false); return; }
      }
      await loadTournamentData(userId);
      setMessage('Player names saved.');
    } catch (err) { setMessage(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed.'); }
    setIsSavingNames(false);
  }

  async function updatePlayerGender(slotId: string, gender: 'male' | 'female' | '') {
    if (isLocked) {
      setMessage('Player settings are locked.');
      return;
    }

    setMessage('');

    const nextGender = gender === '' ? null : gender;

    const { error } = await supabase
      .from('tournament_players')
      .update({ gender: nextGender })
      .eq('id', slotId);

    if (error) {
      setMessage(`Gender save failed: ${error.message}`);
      return;
    }

    await loadTournamentData(userId);
    setMessage('Player gender saved.');
  }
  
  async function generateScheduleAndStart() {
  if (!tournament) return;

  if (isScheduleLocked) {
    setMessage('Schedule is locked once the tournament has started.');
    return;
  }

  setMessage('');
  setIsStarting(true);
    try {
      for (const slot of playerSlots) {
        const nextName = (newNames[slot.id] ?? slot.display_name ?? '').trim();
        const { error } = await supabase.from('tournament_players').update({ display_name: nextName }).eq('id', slot.id);
        if (error) { setMessage(`Save failed: ${error.message}`); setIsStarting(false); return; }
      }

      const { data: freshPlayers, error: freshPlayersError } = await supabase.from('tournament_players').select('*').eq('tournament_id', tournament.id).order('slot_number', { ascending: true });
      const { data: existingMatches, error: existingMatchesError } = await supabase
  .from('matches')
  .select('id')
  .eq('tournament_id', tournament.id)
  .limit(1);

if (existingMatchesError) {
  setMessage(`Could not verify schedule lock: ${existingMatchesError.message}`);
  setIsStarting(false);
  return;
}

if ((existingMatches || []).length > 0 || tournament.status !== 'draft') {
  setMessage('Schedule is locked once the tournament has started.');
  setIsStarting(false);
  return;
}
      if (freshPlayersError) { setMessage(`Could not load players: ${freshPlayersError.message}`); setIsStarting(false); return; }

      const namedPlayers = (freshPlayers || []).filter((slot) => (slot.display_name || '').trim() !== '');
      if (namedPlayers.length < minPlayersRequired) { setMessage(`Please save at least ${minPlayersRequired} player names before starting.`); setIsStarting(false); return; }

      if (tournament.format === 'doubles' && tournament.doubles_mode === 'mixed') {
        const playersMissingGender = namedPlayers.filter((slot) => !slot.gender);

      if (playersMissingGender.length > 0) {
          setMessage('Every player in a mixed doubles tournament must be marked male or female before starting.');
          setIsStarting(false);
          return;
        }

        const maleCount = namedPlayers.filter((slot) => slot.gender === 'male').length;
        const femaleCount = namedPlayers.filter((slot) => slot.gender === 'female').length;

        if (namedPlayers.length % 2 !== 0) {
          setMessage('Mixed doubles requires an even number of players.');
          setIsStarting(false);
          return;
        }

        if (maleCount !== femaleCount) {
          setMessage('Mixed doubles requires the same number of male and female players.');
          setIsStarting(false);
          return;
        }
      }

      const playersPerCourt = isSingles ? 2 : 4;
      const availableCourts = Math.max(1, Math.min(tournament.courts, Math.floor(namedPlayers.length / playersPerCourt)));
      const scheduleRows = buildSchedule(namedPlayers, tournament.rounds, availableCourts, tournament.format, tournament.doubles_mode);
      const generatedRounds = new Set(
  scheduleRows
    .filter((row) => !row.is_bye)
    .map((row) => row.round_number)
);

if (generatedRounds.size < tournament.rounds) {
  setMessage(
    `Could only generate ${generatedRounds.size} of ${tournament.rounds} requested rounds. Please try again.`
  );
  setIsStarting(false);
  return;
}
      if (!scheduleRows.length) { setMessage('Could not generate a schedule.'); setIsStarting(false); return; }

      const { error: deleteError } = await supabase.from('matches').delete().eq('tournament_id', tournament.id);
      if (deleteError) { setMessage(`Delete old matches failed: ${deleteError.message}`); setIsStarting(false); return; }

      const { error: insertError } = await supabase
  .from('matches')
  .insert(
    scheduleRows.map((row) => ({
      tournament_id: tournament.id,
      ...row,
      court_label: getCourtLabel(tournament, row.court_number),
    }))
  );
      if (insertError) { setMessage(`Generate failed: ${insertError.message}`); setIsStarting(false); return; }

      const { error: startError } = await supabase.from('tournaments').update({ status: 'started', started_at: new Date().toISOString() }).eq('id', tournament.id);
      if (startError) { setMessage(`Start failed: ${startError.message}`); setIsStarting(false); return; }

      await loadTournamentData(userId);
      setActiveTab('rounds');
      setSelectedRound(1);
      setMessage('Tournament started.');
    } catch (err) { setMessage(err instanceof Error ? `Start failed: ${err.message}` : 'Start failed.'); }
    setIsStarting(false);
  }

  async function rematchTournament() {
    if (!tournament) return;
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) { setMessage('Sign in first.'); return; }

    setIsRematching(true);
    setMessage('');
    try {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
      const organizerName = profile?.display_name?.trim() || user.email?.split('@')[0] || tournament.organizer_name || 'Organizer';
      const rematchTitle = tournament.title.toLowerCase().includes('rematch') ? tournament.title : `${tournament.title} Rematch`;

      const { data: newTournament, error: tournamentError } = await supabase
        .from('tournaments')
.insert({
  title: rematchTitle,
  organizer_user_id: user.id,
  organizer_name: organizerName,
  join_code: makeJoinCode(),
  event_date: tournament.event_date,
  event_time: tournament.event_time,
  location: tournament.location,
  player_count: tournament.player_count,
  courts: tournament.courts,
  rounds: tournament.rounds,
  games_to: tournament.games_to,
  status: 'draft',
  started_at: null,
  format: tournament.format,
  match_format: tournament.match_format,
  doubles_mode: tournament.doubles_mode,
  court_labels: tournament.court_labels,
})        .select().single();

      if (tournamentError || !newTournament) { setMessage(tournamentError?.message || 'Could not create rematch tournament.'); setIsRematching(false); return; }

      const playerRows = Array.from({ length: tournament.player_count }, (_, index) => {
        const oldSlot = playerSlots[index];
        return { tournament_id: newTournament.id, slot_number: index + 1, display_name: oldSlot?.display_name?.trim() || '', claimed_by_user_id: null };
      });

      const { error: playersError } = await supabase.from('tournament_players').insert(playerRows);
      if (playersError) { setMessage(playersError.message); setIsRematching(false); return; }

      try { window.localStorage.setItem(LAST_TOURNAMENT_KEY, JSON.stringify({ id: newTournament.id, title: newTournament.title })); } catch {}
      window.location.href = `/tournament/${newTournament.id}`;
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not create rematch tournament.'); setIsRematching(false); }
  }

  function setDraftScore(matchId: string, field: keyof ScoreDraft, value: string) {
    if (isCompleted) return;
    const sanitized = value.replace(/[^\d]/g, '');
    setScoreDrafts((prev) => ({
      ...prev,
      [matchId]: {
        team_a_score: prev[matchId]?.team_a_score ?? '',
        team_b_score: prev[matchId]?.team_b_score ?? '',
        game_1_a: prev[matchId]?.game_1_a ?? '',
        game_1_b: prev[matchId]?.game_1_b ?? '',
        game_2_a: prev[matchId]?.game_2_a ?? '',
        game_2_b: prev[matchId]?.game_2_b ?? '',
        game_3_a: prev[matchId]?.game_3_a ?? '',
        game_3_b: prev[matchId]?.game_3_b ?? '',
        [field]: sanitized,
      },
    }));
  }

  async function saveScoreField(matchId: string, field: 'team_a_score' | 'team_b_score') {
    if (isCompleted) return;
    const match = matches.find((m) => m.id === matchId);
    if (match?.is_complete) return;
    const draft = scoreDrafts[matchId];
    if (!draft) return;
    const rawValue = draft[field];
    const numeric = rawValue.trim() === '' || Number.isNaN(Number(rawValue)) ? null : Math.max(0, Number(rawValue));
    const { error } = await supabase.from('matches').update({ [field]: numeric }).eq('id', matchId);
    if (error) { setMessage(`Score save failed: ${error.message}`); return; }
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, [field]: numeric } : m)));
  }

  async function upsertPlayerMatchStats(match: Match, aScore: number, bScore: number) {
  if (!tournament) return true;

  const { data: freshPlayers } = await supabase
    .from('tournament_players')
    .select('*')
    .eq('tournament_id', tournament.id);

  if (!freshPlayers) return true;

  const freshPlayersById = Object.fromEntries(freshPlayers.map((p) => [p.id, p]));

  const a1 = match.team_a_player_1_id ? freshPlayersById[match.team_a_player_1_id] : null;
  const a2 = match.team_a_player_2_id ? freshPlayersById[match.team_a_player_2_id] : null;
  const b1 = match.team_b_player_1_id ? freshPlayersById[match.team_b_player_1_id] : null;
  const b2 = match.team_b_player_2_id ? freshPlayersById[match.team_b_player_2_id] : null;

  const teamAUsers = isSingles
    ? [a1]
        .filter((s): s is PlayerSlot => !!s && !!s.claimed_by_user_id)
        .map((s) => s.claimed_by_user_id as string)
    : [a1, a2]
        .filter((s): s is PlayerSlot => !!s && !!s.claimed_by_user_id)
        .map((s) => s.claimed_by_user_id as string);

  const teamBUsers = isSingles
    ? [b1]
        .filter((s): s is PlayerSlot => !!s && !!s.claimed_by_user_id)
        .map((s) => s.claimed_by_user_id as string)
    : [b1, b2]
        .filter((s): s is PlayerSlot => !!s && !!s.claimed_by_user_id)
        .map((s) => s.claimed_by_user_id as string);

  const playedAt = new Date().toISOString();
  const matchFormat = tournament.format || 'doubles';

  function buildRow(
    currentUserId: string,
    partnerUserId: string | null,
    opponentUserIds: string[],
    wins: number,
    losses: number,
    pointsFor: number,
    pointsAgainst: number
  ) {
    const isTie = wins === losses;
    return {
      user_id: currentUserId,
      tournament_id: tournament!.id,
      match_id: match.id,
      round_number: match.round_number,
      played_at: playedAt,
      partner_user_id: partnerUserId,
      opponent_1_user_id: opponentUserIds[0] || null,
      opponent_2_user_id: opponentUserIds[1] || null,
      result: isTie ? 'tie' : wins > losses ? 'win' : 'loss',
      wins,
      losses,
      ties: isTie ? 1 : 0,
      points_for: pointsFor,
      points_against: pointsAgainst,
      point_diff: pointsFor - pointsAgainst,
      format: matchFormat,
    };
  }

  let aWins = 0;
  let bWins = 0;
  let aPoints = 0;
  let bPoints = 0;

  if (isBestOf3) {
    const games = [
      [match.game_1_a, match.game_1_b],
      [match.game_2_a, match.game_2_b],
      [match.game_3_a, match.game_3_b],
    ] as const;

    for (const [gA, gB] of games) {
      if (gA === null || gB === null) continue;

      aPoints += gA;
      bPoints += gB;

      if (gA > gB) aWins += 1;
      else if (gB > gA) bWins += 1;
    }
  } else {
    aPoints = aScore;
    bPoints = bScore;

    if (aScore > bScore) aWins = 1;
    else if (bScore > aScore) bWins = 1;
  }

  const rows = [
    ...teamAUsers.map((currentUserId) =>
      buildRow(
        currentUserId,
        isSingles ? null : teamAUsers.find((id) => id !== currentUserId) || null,
        teamBUsers,
        aWins,
        bWins,
        aPoints,
        bPoints
      )
    ),
    ...teamBUsers.map((currentUserId) =>
      buildRow(
        currentUserId,
        isSingles ? null : teamBUsers.find((id) => id !== currentUserId) || null,
        teamAUsers,
        bWins,
        aWins,
        bPoints,
        aPoints
      )
    ),
  ];

  if (!rows.length) return true;

  const { error } = await supabase
    .from('player_match_stats')
    .upsert(rows, { onConflict: 'match_id,user_id' });

  if (error) {
    setMessage(`Score submitted, but stats update failed: ${error.message}`);
    return false;
  }

  return true;
}
  function getNextIncompleteRound(updatedMatches: Match[]) {
    const roundNumbers = Array.from(new Set(updatedMatches.map((m) => m.round_number))).sort((a, b) => a - b);
    for (const round of roundNumbers) {
      const roundMatches = updatedMatches.filter((m) => m.round_number === round && !m.is_bye);
      if (!roundMatches.length) continue;
      if (!roundMatches.every((m) => m.is_complete)) return round;
    }
    return null;
  }

  async function markTournamentCompleted() {
    if (!tournament || isCompleted) return true;
    const { error } = await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournament.id);
    if (error) { setMessage(`Tournament completion failed: ${error.message}`); return false; }
    setTournament((prev) => (prev ? { ...prev, status: 'completed' } : prev));
    return true;
  }

  async function endTournamentEarly() {
    if (!tournament || !isOrganizer || !isStarted || isCompleted) return;
    const confirmed = window.confirm('End this tournament now? Any unfinished rounds will be locked and the current standings will become final.');
    if (!confirmed) return;
    setIsEndingEarly(true);
    setMessage('');
    const completed = await markTournamentCompleted();
    if (completed) { setActiveTab('standings'); setSelectedRound(currentRound); setMessage('Tournament ended early. Final results are now locked.'); }
    setIsEndingEarly(false);
  }

  async function deleteTournament() {
    if (!tournament || !isOrganizer || isStarted || isCompleted) return;
    const confirmed = window.confirm('Are you sure you want to delete this tournament? This cannot be undone.');
    if (!confirmed) return;
    setMessage('');

    const { error: playersError } = await supabase.from('tournament_players').delete().eq('tournament_id', tournament.id);
    if (playersError) { setMessage(`Delete failed: ${playersError.message}`); return; }

    const { error: tournamentError } = await supabase.from('tournaments').delete().eq('id', tournament.id);
    if (tournamentError) { setMessage(`Delete failed: ${tournamentError.message}`); return; }

    try {
      const saved = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id === tournament.id) window.localStorage.removeItem(LAST_TOURNAMENT_KEY);
      }
    } catch {}

    router.push('/my-tournaments');
  }

  async function submitGame(matchId: string, game: 1 | 2 | 3) {
  if (isCompleted) {
    setMessage('Final results are locked.');
    return;
  }

  const draft = scoreDrafts[matchId];
  if (!draft) return;

  const aKey = `game_${game}_a` as keyof ScoreDraft;
  const bKey = `game_${game}_b` as keyof ScoreDraft;
  const aVal = draft[aKey].trim();
  const bVal = draft[bKey].trim();

  if (aVal === '' || bVal === '') {
    setMessage(`Enter both scores for Game ${game}.`);
    return;
  }

  const aNum = Math.max(0, Number(aVal));
  const bNum = Math.max(0, Number(bVal));

  if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
    setMessage('Scores must be valid numbers.');
    return;
  }

  if (aNum === bNum) {
    setMessage('Game cannot end in a tie — one team must win.');
    return;
  }

  const previousMatches = matches;

  const currentMatch = matches.find((m) => m.id === matchId);
  if (!currentMatch) return;

  const optimisticMatch: Match = {
    ...currentMatch,
    [`game_${game}_a`]: aNum,
    [`game_${game}_b`]: bNum,
  };

  const seriesNowComplete = isSeriesComplete(optimisticMatch);

  let finalOptimisticMatch: Match = optimisticMatch;

  if (seriesNowComplete) {
    const { aScore, bScore } = getSeriesScore(optimisticMatch);
    finalOptimisticMatch = {
      ...optimisticMatch,
      team_a_score: aScore,
      team_b_score: bScore,
      is_complete: true,
    };
  }

  const optimisticMatches = matches.map((m) =>
    m.id === matchId ? finalOptimisticMatch : m
  );

  setMessage(`Submitting Game ${game}...`);

  const submittedRound = finalOptimisticMatch.round_number ?? selectedRound;
  const submittedRoundMatches = optimisticMatches.filter(
    (m) => m.round_number === submittedRound && !m.is_bye
  );
  const submittedRoundComplete =
    submittedRoundMatches.length > 0 &&
    submittedRoundMatches.every((m) => m.is_complete);

  const nextRound = getNextIncompleteRound(optimisticMatches);

  if (seriesNowComplete) {
    if (!nextRound) {
      setSelectedRound(finalRound);
      setActiveTab('standings');
      setMessage('Series complete. Tournament finished!');
    } else if (submittedRoundComplete && nextRound !== submittedRound) {
      setSelectedRound(nextRound);
      setMessage(
        `Series complete. Round ${submittedRound} done. Advancing to Round ${nextRound}.`
      );
    } else {
      const { aWins, bWins } = getSeriesWins(finalOptimisticMatch);
      setMessage(
        `Game ${game} submitted. Series complete — ${aWins > bWins ? 'Team A' : 'Team B'} wins!`
      );
    }
  } else {
    setMessage(`Game ${game} submitted.`);
  }

  const updateData: Record<string, number | boolean> = {
    [`game_${game}_a`]: aNum,
    [`game_${game}_b`]: bNum,
  };

  if (seriesNowComplete) {
    const { aScore, bScore } = getSeriesScore(optimisticMatch);
    updateData.team_a_score = aScore;
    updateData.team_b_score = bScore;
    updateData.is_complete = true;
  }

  const { error } = await supabase
    .from('matches')
    .update(updateData)
    .eq('id', matchId);

  if (error) {
  setMatches(previousMatches);
  setStandings(computeStandings(playerSlots, previousMatches, isSingles, isBestOf3));
  setMessage(`Submit failed: ${error.message}`);
  return;
}

await loadTournamentData(userId);

  if (seriesNowComplete) {
    const { aScore, bScore } = getSeriesScore(finalOptimisticMatch);
    await upsertPlayerMatchStats(finalOptimisticMatch, aScore, bScore);

    if (!nextRound) {
      const completed = await markTournamentCompleted();
      if (!completed) return;
      setSelectedRound(finalRound);
      setActiveTab('standings');
      setMessage('Series complete. Tournament finished!');
      return;
    }
  }
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

  // ✅ SAVE CURRENT STATE (for rollback if needed)
  const previousMatches = matches;

  // ✅ UPDATE UI IMMEDIATELY (optimistic update)
  const optimisticMatches = matches.map((m) =>
    m.id === matchId
      ? {
          ...m,
          team_a_score: aNum,
          team_b_score: bNum,
          is_complete: true,
        }
      : m
  );

setMessage('Submitting score...');

  const completedMatch = optimisticMatches.find((m) => m.id === matchId);
  if (!completedMatch) return;

  const submittedRound = completedMatch.round_number ?? selectedRound;
  const submittedRoundMatches = optimisticMatches.filter(
    (m) => m.round_number === submittedRound && !m.is_bye
  );
  const submittedRoundComplete =
    submittedRoundMatches.length > 0 &&
    submittedRoundMatches.every((m) => m.is_complete);

  const nextRound = getNextIncompleteRound(optimisticMatches);

  if (!nextRound) {
    setSelectedRound(finalRound);
    setActiveTab('standings');
  } else if (submittedRoundComplete && nextRound !== submittedRound) {
    setSelectedRound(nextRound);
  }

  // ✅ SAVE TO DATABASE AFTER UI UPDATE
  const { error } = await supabase
    .from('matches')
    .update({
      team_a_score: aNum,
      team_b_score: bNum,
      is_complete: true,
    })
    .eq('id', matchId);

  // ❌ IF FAILED → ROLLBACK UI
  if (error) {
  setMatches(previousMatches);
  setStandings(computeStandings(playerSlots, previousMatches, isSingles, isBestOf3));
  setMessage(`Submit failed: ${error.message}`);
  return;
}

  const statsSaved = await upsertPlayerMatchStats(completedMatch, aNum, bNum);

  if (!nextRound) {
    const completed = await markTournamentCompleted();
    if (!completed) return;

    setSelectedRound(finalRound);
    setActiveTab('standings');

    setMessage(
      statsSaved
        ? 'Score submitted. Tournament complete.'
        : 'Score submitted. Tournament complete, but stats update failed.'
    );
    return;
  }

  if (submittedRoundComplete && nextRound !== submittedRound) {
    setMessage(
      statsSaved
        ? `Score submitted. Round ${submittedRound} complete. Advancing to Round ${nextRound}.`
        : `Score submitted. Round ${submittedRound} complete. Advancing to Round ${nextRound}. Stats update failed.`
    );
    return;
  }

  setMessage(
    statsSaved ? 'Score submitted.' : 'Score submitted, but stats update failed.'
 );
}

function renderPlayerName(id: string | null) {
  if (!id) return '-';
  return playersById[id]?.display_name || 'Player';
}

function renderTeam(a: string | null, b: string | null) {
  if (isSingles) return renderPlayerName(a);
  return `${renderPlayerName(a)} & ${renderPlayerName(b)}`;
}

function renderMatchLabel(match: Match) {
  return `${renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)} vs ${renderTeam(
    match.team_b_player_1_id,
    match.team_b_player_2_id
  )}`;
}

function getInitials(playerId1?: string | null, playerId2?: string | null) {
  const getInitial = (id?: string | null) => {
    if (!id) return '?';

    const player = playerSlots.find((p) => p.id === id);
    const name = player?.display_name || '';

    return name.trim().charAt(0).toUpperCase() || '?';
  };

  const a = getInitial(playerId1);
  const b = getInitial(playerId2);

  return `${a} & ${b}`;
}  

function getMatchElementId(matchId: string) {
  return `live-match-${matchId}`;
}

function getTournamentModeBadges(tournament: Tournament | null) {
  if (!tournament) return [];

  const badges = [];

  badges.push(tournament.format === 'singles' ? 'Singles' : 'Doubles');

  if (tournament.format === 'doubles') {
    if (tournament.doubles_mode === 'fixed') {
      badges.push('Fixed Partners');
    } else if (tournament.doubles_mode === 'mixed') {
      badges.push('Mixed Rotate');
    } else {
      badges.push('Rotating Partners');
    }
  }

  badges.push(
    tournament.match_format === 'best_of_3' ? 'Best of 3' : 'Single Game'
  );

  return badges;
}  

function getWinnerStyle(team: 'a' | 'b', match: Match) {
  if (isBestOf3) {
    if (!match.is_complete) return {};
    const { aWins, bWins } = getSeriesWins(match);
    const isWinner = (team === 'a' && aWins > bWins) || (team === 'b' && bWins > aWins);
    return isWinner ? { color: '#FFCB05' } : {};
  }

  if (match.team_a_score === null || match.team_b_score === null) return {};

  const aWins = match.team_a_score > match.team_b_score;
  const bWins = match.team_b_score > match.team_a_score;
  const isWinner = (team === 'a' && aWins) || (team === 'b' && bWins);

  return isWinner ? { color: '#FFCB05' } : {};
}

function getLiveBannerWinnerStyle(side: 'a' | 'b', match: Match) {
  if (isBestOf3) {
    const { aScore, bScore } = getSeriesScore(match);
    if (aScore === bScore) return {};

    const isWinner =
      (side === 'a' && aScore > bScore) || (side === 'b' && bScore > aScore);

    return isWinner
      ? { color: '#FFCB05', transform: 'scale(1.04)' }
      : { opacity: 0.78 };
  }

  if (match.team_a_score === null || match.team_b_score === null) return {};
  if (match.team_a_score === match.team_b_score) return {};

  const isWinner =
    (side === 'a' && match.team_a_score > match.team_b_score) ||
    (side === 'b' && match.team_b_score > match.team_a_score);

  return isWinner
    ? { color: '#FFCB05', transform: 'scale(1.04)' }
    : { opacity: 0.78 };
}

function renderBestOf3Match(match: Match) {
  const draft = scoreDrafts[match.id] || {
    team_a_score: '',
    team_b_score: '',
    game_1_a: '',
    game_1_b: '',
    game_2_a: '',
    game_2_b: '',
    game_3_a: '',
    game_3_b: '',
  };

  const { aWins, bWins } = getSeriesWins(match);
  const game1Done = match.game_1_a !== null && match.game_1_b !== null;
  const game2Done = match.game_2_a !== null && match.game_2_b !== null;
  const showGame3 = game1Done && game2Done && needsGame3(match);
  const seriesComplete = match.is_complete;
  const teamAName = renderTeam(match.team_a_player_1_id, match.team_a_player_2_id);
  const teamBName = renderTeam(match.team_b_player_1_id, match.team_b_player_2_id);
  const isNextUp =
    !isCompleted &&
    match.round_number === currentRound &&
    nextUpMatch?.id === match.id;

  return (
    <div
      id={getMatchElementId(match.id)}
      key={match.id}
      className="list-item"
      style={
        isNextUp
          ? {
              borderColor: 'rgba(255,203,5,.55)',
              boxShadow: '0 0 0 1px rgba(255,203,5,.25) inset',
            }
          : undefined
      }
    >
      <div className="row-between" style={{ marginBottom: 12 }}>
        <strong>Court {match.court_number ?? '-'}</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isNextUp ? <span className="tag">Next Up</span> : null}
          <span style={{ fontSize: 13, fontWeight: 800, color: '#FFCB05' }}>
            {aWins}-{bWins}
          </span>
          <span className={seriesComplete ? 'tag green' : 'tag'}>
            {seriesComplete ? 'Complete' : 'Live'}
          </span>
        </div>
      </div>

      <div className="row-between" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, ...getWinnerStyle('a', match) }}>
          {teamAName}
        </div>
        <div style={{ fontWeight: 800, ...getWinnerStyle('b', match) }}>
          {teamBName}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div
          className="muted"
          style={{
            fontSize: 12,
            fontWeight: 800,
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Game 1
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <input
            className="input"
            style={{ textAlign: 'center', fontSize: 20, fontWeight: 800 }}
            type="number"
            value={draft.game_1_a}
            disabled={game1Done || seriesComplete || isCompleted}
            onChange={(e) => setDraftScore(match.id, 'game_1_a', e.target.value)}
            placeholder={isOrganizer ? "0" : "Organizer only"}
          />
          <input
            className="input"
            style={{ textAlign: 'center', fontSize: 20, fontWeight: 800 }}
            type="number"
            value={draft.game_1_b}
            disabled={game1Done || seriesComplete || isCompleted}
            onChange={(e) => setDraftScore(match.id, 'game_1_b', e.target.value)}
            placeholder={isOrganizer ? "0" : "Organizer only"}
          />
        </div>
        {!game1Done && !seriesComplete && !isCompleted ? (
          <button className="button primary" onClick={() => submitGame(match.id, 1)}>
            Submit Game 1
          </button>
        ) : (
          <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            {match.game_1_a}-{match.game_1_b} —{' '}
            {match.game_1_a! > match.game_1_b! ? teamAName : teamBName} wins
          </div>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div
          className="muted"
          style={{
            fontSize: 12,
            fontWeight: 800,
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Game 2
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <input
            className="input"
            style={{ textAlign: 'center', fontSize: 20, fontWeight: 800 }}
            type="number"
            value={draft.game_2_a}
            disabled={!game1Done || game2Done || seriesComplete || isCompleted}
            onChange={(e) => setDraftScore(match.id, 'game_2_a', e.target.value)}
            placeholder={isOrganizer ? "0" : "Organizer only"}
          />
          <input
            className="input"
            style={{ textAlign: 'center', fontSize: 20, fontWeight: 800 }}
            type="number"
            value={draft.game_2_b}
            disabled={!game1Done || game2Done || seriesComplete || isCompleted}
            onChange={(e) => setDraftScore(match.id, 'game_2_b', e.target.value)}
            placeholder={isOrganizer ? "0" : "Organizer only"}
          />
        </div>
        {game1Done && !game2Done && !seriesComplete && !isCompleted ? (
          <button className="button primary" onClick={() => submitGame(match.id, 2)}>
            Submit Game 2
          </button>
        ) : game2Done ? (
          <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            {match.game_2_a}-{match.game_2_b} —{' '}
            {match.game_2_a! > match.game_2_b! ? teamAName : teamBName} wins
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            Waiting for Game 1
          </div>
        )}
      </div>

      {showGame3 || (game1Done && game2Done && match.game_3_a !== null) ? (
        <div style={{ marginBottom: 10 }}>
          <div
            className="muted"
            style={{
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Game 3
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <input
              className="input"
              style={{ textAlign: 'center', fontSize: 20, fontWeight: 800 }}
              type="number"
              value={draft.game_3_a}
              disabled={match.game_3_a !== null || seriesComplete || isCompleted}
              onChange={(e) => setDraftScore(match.id, 'game_3_a', e.target.value)}
              placeholder={isOrganizer ? "0" : "Organizer only"}
            />
            <input
              className="input"
              style={{ textAlign: 'center', fontSize: 20, fontWeight: 800 }}
              type="number"
              value={draft.game_3_b}
              disabled={match.game_3_b !== null || seriesComplete || isCompleted}
              onChange={(e) => setDraftScore(match.id, 'game_3_b', e.target.value)}
              placeholder={isOrganizer ? "0" : "Organizer only"}
            />
          </div>
          {match.game_3_a === null && !seriesComplete && !isCompleted ? (
            <button className="button primary" onClick={() => submitGame(match.id, 3)}>
              Submit Game 3
            </button>
          ) : match.game_3_a !== null ? (
            <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
              {match.game_3_a}-{match.game_3_b} —{' '}
              {match.game_3_a! > match.game_3_b! ? teamAName : teamBName} wins
            </div>
          ) : null}
        </div>
      ) : game1Done && game2Done && !seriesComplete ? (
        <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
          <div style={{ fontWeight: 800, color: '#FFCB05' }}>
            {aWins > bWins ? teamAName : teamBName} wins the series 2-0!
          </div>
        </div>
      ) : null}

      {seriesComplete ? (
        <div className="list-item" style={{ padding: 10, textAlign: 'center', marginTop: 8 }}>
          <div style={{ fontWeight: 800, color: '#FFCB05' }}>
            {aWins > bWins ? teamAName : teamBName} wins {aWins}-{bWins}!
          </div>
        </div>
      ) : null}
    </div>
  );
}

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">{tournament?.title || 'Tournament'}</h1>

                    {tournamentModeBadges.length ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 10,
                justifyContent: 'center',
              }}
            >
              {tournamentModeBadges.map((badge) => (
                <span key={badge} className="tag">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
          
          <p className="hero-subtitle">
            {isCompleted ? 'Finished tournament' : isStarted ? `Live now • Round ${currentRound}` : 'Set up players, then start when ready'}
          </p>
        </div>
      </div>

      <TopNav />

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      <div className="card" style={{ marginBottom: 14 }}>
                 {isCompleted ? (
            <div
              style={{
                marginBottom: 18,
                padding: 18,
                borderRadius: 18,
                background: 'linear-gradient(135deg, #0f1722, #0b1220)',
                border: '1px solid rgba(255,255,255,.12)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.72,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                🏆 Tournament Complete
              </div>

              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#FFCB05',
                  marginBottom: 6,
                }}
              >
                {tournamentWinner?.name || 'Winner'}
              </div>

                           <div className="muted" style={{ marginBottom: 12 }}>
                Final standings are locked and ready to share.
              </div>

              <button
                type="button"
                className="button primary"
                onClick={() => router.push(`/tournament/${params.id}/results`)}
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                }}
              >
                🏆 View Results
              </button>
            </div>
          ) : null}

          <div className="card-title">Tournament</div>
        <div className="grid" style={{ marginBottom: 14 }}>
          <div className="list-item">
            <div className="label">Join Code</div>
            <div className="row-between">
              <strong style={{ letterSpacing: '0.08em' }}>{tournament?.join_code || '...'}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className={isLive ? 'tag green' : 'tag'}>{isLive ? 'Live' : 'Connecting'}</span>
                <span className="tag">{isSingles ? 'Singles' : 'Doubles'}</span>
                <span className="tag">{isBestOf3 ? 'Best of 3' : 'Single Game'}</span>
              </div>
            </div>
            {isOrganizer ? (
    <button
      className="button secondary"
      style={{ marginTop: 10 }}
      onClick={copyPublicLink}
    >
      Copy Public Link
    </button>
  ) : null}
          </div>

          <div className="list-item">
            <div className="row-between"><span className="muted">Organizer</span><strong>{tournament?.organizer_name || '-'}</strong></div>
            <div className="row-between" style={{ marginTop: 8 }}><span className="muted">Status</span><strong>{isCompleted ? 'Completed' : isStarted ? 'Started' : 'Setup'}</strong></div>
            <div className="row-between" style={{ marginTop: 8 }}><span className="muted">Progress</span><strong>{completedMatchCount}/{totalPlayableMatchCount} matches</strong></div>
          </div>

          <div className="list-item">
            <div className="row-between"><span className="muted">Date</span><strong>{tournament?.event_date || '-'}</strong></div>
            <div className="row-between" style={{ marginTop: 8 }}><span className="muted">Time</span><strong>{tournament?.event_time || '-'}</strong></div>
            <div className="row-between" style={{ marginTop: 8 }}><span className="muted">Location</span><strong style={{ textAlign: 'right' }}>{tournament?.location || '-'}</strong></div>
          </div>
        </div>

                {isOrganizer && publicViewUrl ? (
          <div
            className="card"
            style={{
              marginBottom: 14,
              textAlign: 'center',
            }}
          >
            <div className="card-title">Public Tournament QR Code</div>
            <div className="card-subtitle" style={{ marginBottom: 16 }}>
              Players and spectators can scan this to open the live public tournament page.
            </div>

            <div
              style={{
                display: 'inline-flex',
                padding: 12,
                background: '#ffffff',
                borderRadius: 16,
                marginBottom: 12,
              }}
            >
              <QRCodeSVG
                value={publicViewUrl}
                size={220}
                bgColor="#ffffff"
                fgColor="#111111"
                includeMargin={true}
              />
            </div>

            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,.72)',
                wordBreak: 'break-all',
                marginBottom: 12,
              }}
            >
              {publicViewUrl}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              <button
                type="button"
                className="button secondary"
                onClick={copyPublicLink}
              >
                Copy Public Link
              </button>

              <a
                href={publicViewUrl}
                target="_blank"
                rel="noreferrer"
                className="button primary"
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Open Public View
              </a>
            </div>
          </div>
        ) : null}
        
        {isOrganizer ? (
        <div className="grid">
          <button type="button" className="button secondary" onClick={copyJoinCode}>
            {copied ? 'Join Code Copied' : 'Copy Join Code'}
          </button>
          <button type="button" className="button primary" onClick={shareJoinLink}>
            Share Join Link
          </button>
          {isStarted && !isCompleted ? (
            <button type="button" className="button secondary" onClick={endTournamentEarly} disabled={isEndingEarly}>
              {isEndingEarly ? 'Ending Tournament...' : 'End Tournament Early'}
            </button>
          ) : null}
          {isCompleted ? (
            <button type="button" className="button primary" onClick={rematchTournament} disabled={isRematching}>
              {isRematching ? 'Creating Rematch...' : 'Rematch Tournament'}
            </button>
          ) : null}
          {isCompleted ? (
  <button
    type="button"
    className="button primary"
    onClick={() => router.push(`/tournament/${params.id}/results`)}
    style={{
      fontWeight: 800,
      fontSize: 16,
    }}
  >
    🏆 View Results
  </button>
) : null}
          {!isStarted && !isCompleted ? (
            <button type="button" className="button secondary" onClick={deleteTournament} style={{ borderColor: 'rgba(248,113,113,.4)', color: '#f87171' }}>
              Delete Tournament
            </button>
          ) : null}
        </div>
) : null}
</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
        <button type="button" className={`button ${activeTab === 'players' ? 'primary' : 'secondary'}`} onClick={() => setActiveTab('players')}>Players</button>
        <button type="button" className={`button ${activeTab === 'rounds' ? 'primary' : 'secondary'}`} onClick={() => setActiveTab('rounds')}>Rounds</button>
        <button type="button" className={`button ${activeTab === 'standings' ? 'primary' : 'secondary'}`} onClick={() => setActiveTab('standings')}>Standings</button>
      </div>

      {activeTab === 'players' && (
        <div className="card">
          <div className="card-title">Players</div>
          <div className="card-subtitle">
            {isCompleted ? 'Tournament is complete. Player list is locked.' : isStarted ? 'Tournament has started. Player list is locked.' : isSingles ? 'Singles tournament — each player competes individually.' : 'Players can claim a spot, or the organizer can type names manually.'}
          </div>
          {isLoading ? (
            <div className="muted">Loading player spots...</div>
          ) : (
            <div className="grid">
              {playerSlots.map((slot) => {
                const isMine = slot.claimed_by_user_id === userId;
                const isClaimedBySomeone = !!slot.claimed_by_user_id;
                const canClaim = !isClaimedBySomeone && !claimedSlot && !isLocked;
                const canEditName = !isLocked && (isOrganizer || isMine || !isClaimedBySomeone);

                return (
                  <div key={slot.id} className="list-item" style={{ borderColor: isMine ? 'rgba(255,203,5,.45)' : undefined, boxShadow: isMine ? '0 0 0 1px rgba(255,203,5,.18) inset' : undefined }}>
                    <div className="row-between" style={{ marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>Player {slot.slot_number}</div>
                        <div className="muted">{slot.display_name || 'Open spot'}</div>
                      </div>
                      {isMine ? <span className="tag green">Yours</span> : isClaimedBySomeone ? <span className="tag green">Claimed</span> : isLocked ? <span className="tag">Locked</span> : <span className="tag">Open</span>}
                    </div>
                                        <div className="grid">
                      <input
                        className="input"
                        value={newNames[slot.id] ?? ''}
                        onChange={(e) =>
                          setNewNames((prev) => ({ ...prev, [slot.id]: e.target.value }))
                        }
                        placeholder={`Name for Player ${slot.slot_number}`}
                        disabled={!canEditName}
                      />

                      {tournament?.format === 'doubles' && tournament?.doubles_mode === 'mixed' ? (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                            gap: 8,
                          }}
                        >
                          <button
                            type="button"
                            className={`button ${slot.gender === 'male' ? 'primary' : 'secondary'}`}
                            onClick={() => updatePlayerGender(slot.id, 'male')}
                            disabled={isLocked}
                          >
                            Male
                          </button>
                          <button
                            type="button"
                            className={`button ${slot.gender === 'female' ? 'primary' : 'secondary'}`}
                            onClick={() => updatePlayerGender(slot.id, 'female')}
                            disabled={isLocked}
                          >
                            Female
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => updatePlayerGender(slot.id, '')}
                            disabled={isLocked}
                          >
                            Clear
                          </button>
                        </div>
                      ) : null}

                                            {!isLocked && canClaim ? (
                        <button className="button primary" onClick={() => claimSlot(slot.id)}>
                          Claim Spot
                        </button>
                      ) : null}

                      {!isLocked && isOrganizer && isClaimedBySomeone ? (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => clearPlayerSpot(slot.id)}
                          style={{
                            borderColor: 'rgba(248,113,113,.4)',
                            color: '#f87171',
                          }}
                        >
                          Clear Spot
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <>
  {!isLocked ? (
    <button
      className="button secondary"
      onClick={saveAllPlayerNames}
      disabled={isSavingNames}
    >
      {isSavingNames ? 'Saving...' : 'Save Player Names'}
    </button>
  ) : null}

  {isOrganizer ? (
    <>
      <button
        className="button primary"
        onClick={generateScheduleAndStart}
        disabled={isStarting || !canStartTournament || isScheduleLocked}
      >
        {isScheduleLocked
          ? 'Schedule Locked'
          : isStarting
          ? 'Starting...'
          : 'Start Tournament'}
      </button>

      {isScheduleLocked ? (
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Schedule is locked after the tournament starts.
        </div>
      ) : null}
    </>
  ) : null}
</>
            </div>
          )}
        </div>
      )}

     {activeTab === 'rounds' && (
  <div className="card">
    <div className="card-title">Rounds</div>
    <div className="card-subtitle">
      {isCompleted
        ? 'Tournament complete. Scores are locked.'
        : isStarted
        ? `Current live round: ${currentRound}`
        : 'Round schedule appears here after the tournament starts.'}

      {!isCompleted && isStarted ? (
        <div style={{ marginTop: 6, fontSize: 13, color: '#FFCB05', fontWeight: 600 }}>
          Organizer enters official scores
        </div>
      ) : null}
    </div>

    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-title">Current Round</div>

      {!isStarted ? (
        <div className="muted">Tournament has not started yet.</div>
      ) : isCompleted ? (
        <div className="muted">Tournament is complete. Final results are locked.</div>
      ) : currentRoundComplete ? (
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
            Round {currentRound} is complete
          </div>
          <div className="muted">
            All matches in the current round have been finished.
          </div>
        </div>
      ) : nextUpMatch ? (
        <div>
          <div
            style={{
              textAlign: 'center',
              marginBottom: 14,
              padding: '10px 12px 4px',
            }}
          >
            <div
              className="muted"
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Round {currentRound}
            </div>

            <div
              style={{
                fontSize: 30,
                fontWeight: 900,
                lineHeight: 1,
                marginBottom: 8,
                color: '#FFCB05',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Live Match
            </div>

            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              Court {nextUpMatch.court_number ?? '-'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span className="tag green">Live</span>
            </div>
          </div>

          <div
            className="list-item"
            style={{
              padding: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  marginBottom: 10,
                  textAlign: 'center',
                  opacity: 0.85,
                }}
              >
                {renderMatchLabel(nextUpMatch)}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    textAlign: 'center',
                    transition: 'all 160ms ease',
                    ...getLiveBannerWinnerStyle('a', nextUpMatch),
                  }}
                >
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    {getInitials(nextUpMatch.team_a_player_1_id, nextUpMatch.team_a_player_2_id)}
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900 }}>
                    {isBestOf3
                      ? getSeriesScore(nextUpMatch).aScore
                      : nextUpMatch.team_a_score ?? '-'}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    opacity: 0.7,
                  }}
                >
                  —
                </div>

                <div
                  style={{
                    textAlign: 'center',
                    transition: 'all 160ms ease',
                    ...getLiveBannerWinnerStyle('b', nextUpMatch),
                  }}
                >
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    {getInitials(nextUpMatch.team_b_player_1_id, nextUpMatch.team_b_player_2_id)}
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900 }}>
                    {isBestOf3
                      ? getSeriesScore(nextUpMatch).bScore
                      : nextUpMatch.team_b_score ?? '-'}
                  </div>
                </div>
              </div>
            </div>

            {selectedRound !== currentRound ? (
              <button
                type="button"
                className="button secondary"
                style={{ marginTop: 10 }}
                onClick={() => setSelectedRound(currentRound)}
              >
                Jump to Current Round
              </button>
            ) : null}
          </div>

          {upcomingMatch ? (
            <div
              className="list-item"
              style={{
                padding: 14,
                marginTop: 10,
                opacity: 0.85,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Up Next
              </div>

              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                {renderMatchLabel(upcomingMatch)}
              </div>

              <div className="muted" style={{ fontSize: 13 }}>
                Round {upcomingMatch.round_number} • Court {upcomingMatch.court_number ?? '-'}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="muted">Waiting for the next match.</div>
      )}
    </div>

    <div className="grid" style={{ marginBottom: 14 }}>
      {roundsAvailable.map((round) => {
        const status = roundStatusByRound.get(round);
        const isSelected = selectedRound === round;
        return (
          <button
            key={round}
            type="button"
            className={`button ${isSelected ? 'primary' : 'secondary'}`}
            onClick={() => setSelectedRound(round)}
          >
            {status === 'complete'
              ? `✓ Round ${round}`
              : status === 'current'
              ? `• Round ${round}`
              : `Round ${round}`}
          </button>
        );
      })}
    </div>

    {!matchesForSelectedRound.length && !byesForSelectedRound.length ? (
      <div className="muted">No matches in this round yet.</div>
    ) : (
      <div className="grid">
        {matchesForSelectedRound.map((match) => {
          const isNextUp =
            !isCompleted &&
            match.round_number === currentRound &&
            nextUpMatch?.id === match.id;

          if (isBestOf3) return renderBestOf3Match(match);

          const draft = scoreDrafts[match.id] || {
            team_a_score: match.team_a_score === null ? '' : String(match.team_a_score),
            team_b_score: match.team_b_score === null ? '' : String(match.team_b_score),
            game_1_a: '',
            game_1_b: '',
            game_2_a: '',
            game_2_b: '',
            game_3_a: '',
            game_3_b: '',
          };

          return (
            <div
              id={getMatchElementId(match.id)}
              key={match.id}
              className="list-item"
              style={
                isNextUp
                  ? {
                      borderColor: 'rgba(255,203,5,.55)',
                      boxShadow: '0 0 0 1px rgba(255,203,5,.25) inset',
                    }
                  : undefined
              }
            >
              <div className="row-between" style={{ marginBottom: 12 }}>
                <strong>Court {match.court_number ?? '-'}</strong>
                {isNextUp ? <span className="tag">Current Match</span> : null}
                <span className={match.is_complete ? 'tag green' : 'tag'}>
                  {match.is_complete ? 'Complete' : 'Live'}
                </span>
              </div>

              <div className="grid" style={{ marginBottom: 12 }}>
                <div className="list-item" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8, ...getWinnerStyle('a', match) }}>
                    {renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}
                  </div>
                  <input
                    className="input"
                    style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}
                    type="number"
                    value={draft.team_a_score}
                    disabled={!isOrganizer || match.is_complete || isCompleted}
                    onChange={(e) => setDraftScore(match.id, 'team_a_score', e.target.value)}
                    onBlur={() => saveScoreField(match.id, 'team_a_score')}
                    placeholder={isOrganizer ? '0' : 'Organizer only'}
                  />
                </div>

                <div className="list-item" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8, ...getWinnerStyle('b', match) }}>
                    {renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}
                  </div>
                  <input
                    className="input"
                    style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}
                    type="number"
                    value={draft.team_b_score}
                    disabled={!isOrganizer || match.is_complete || isCompleted}
                    onChange={(e) => setDraftScore(match.id, 'team_b_score', e.target.value)}
                    onBlur={() => saveScoreField(match.id, 'team_b_score')}
                    placeholder={isOrganizer ? '0' : 'Organizer only'}
                  />
                </div>
              </div>

              {match.is_complete || isCompleted ? (
                <button className="button secondary" disabled>
                  {isCompleted ? 'Final Locked' : 'Score Submitted'}
                </button>
              ) : (
                <button
                  className="button primary"
                  onClick={() => submitMatchScore(match.id)}
                  disabled={!isOrganizer}
                >
                  Submit Score
                </button>
              )}
            </div>
          );
        })}

        {byesForSelectedRound.length ? (
          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Byes This Round</div>
            <div className="grid">
              {byesForSelectedRound.map((bye) => (
                <div key={bye.id} className="list-item" style={{ padding: 10 }}>
                  {renderPlayerName(bye.team_a_player_1_id)}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )}
  </div>
)}

      {activeTab === 'standings' && (
  <div className="card">
    <div className="card-title">{isCompleted ? '🏆 Final Results' : 'Standings'}</div>
    <div className="card-subtitle">
      {isCompleted
        ? 'Tournament complete. Final results are locked.'
        : 'Ranked by wins, then point differential, then points scored.'}
    </div>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        marginTop: 12,
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        className={`button ${standingsView === 'leaderboard' ? 'primary' : 'secondary'}`}
        onClick={() => setStandingsView('leaderboard')}
      >
        Leaderboard
      </button>
      <button
        type="button"
        className={`button ${standingsView === 'day' ? 'primary' : 'secondary'}`}
        onClick={() => setStandingsView('day')}
      >
        Day Summary
      </button>
    </div>

    {!standings.length ? (
      <div className="muted">No players yet.</div>
    ) : (
      <div
        style={{
          marginTop: 4,
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              standingsView === 'leaderboard' ? '56px 1fr 62px 62px' : '56px 1fr 84px 62px',
            gap: 0,
            padding: '10px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.65)',
          }}
        >
          <div style={{ textAlign: 'center' }}>Place</div>
          <div>Player</div>
          <div style={{ textAlign: 'center' }}>
            {standingsView === 'leaderboard' ? 'Diff' : 'Record'}
          </div>
          <div style={{ textAlign: 'center' }}>
            {standingsView === 'leaderboard' ? 'W-L' : 'PF'}
          </div>
        </div>

        {standings.map((row, index) => {
          const place = index + 1;
          const initials = row.name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          const medal =
            place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '';

          const rowBackground =
            place === 1
              ? 'rgba(255,203,5,0.08)'
              : place <= 3
              ? 'rgba(255,255,255,0.02)'
              : 'transparent';

          return (
            <div
              key={row.playerId}
              style={{
                display: 'grid',
                gridTemplateColumns:
                  standingsView === 'leaderboard' ? '56px 1fr 62px 62px' : '56px 1fr 84px 62px',
                gap: 0,
                alignItems: 'center',
                minHeight: 74,
                borderBottom:
                  index === standings.length - 1
                    ? 'none'
                    : '1px solid rgba(255,255,255,0.08)',
                background: rowBackground,
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: 20,
                  padding: '10px 4px',
                  color: place <= 3 ? '#FFCB05' : undefined,
                }}
              >
                {place}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 8px',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.10)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 18,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {medal ? `${medal} ` : ''}
                    {row.name}
                  </div>
                </div>
              </div>

              <div
                style={{
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: standingsView === 'leaderboard' ? 22 : 16,
                  padding: '10px 4px',
                  color:
                    standingsView === 'leaderboard' && row.pointDiff > 0 ? '#FFCB05' : undefined,
                }}
              >
                {standingsView === 'leaderboard'
                  ? row.pointDiff > 0
                    ? `+${row.pointDiff}`
                    : row.pointDiff
                  : `${row.wins}-${row.losses}`}
              </div>

              <div
                style={{
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: 18,
                  padding: '10px 4px',
                }}
              >
                {standingsView === 'leaderboard' ? `${row.wins}-${row.losses}` : row.pointsFor}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
    </main>
    );
}
