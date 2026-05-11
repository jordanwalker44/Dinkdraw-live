'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';
import {
  buildCreamOfTheCropStageSchedule,
  buildNextCreamOfTheCropStagePlayers
} from '../../../lib/scheduler';

export const dynamic = 'force-dynamic';

type Tournament = {
  id: string;
  title: string;
  join_code: string;
  organizer_user_id: string;
  organizer_name: string | null;
  co_organizer_email: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  player_count: number;
  courts: number;
  rounds: number;
  games_to: number;
  status: string;
  tournament_mode: string | null;
  started_at: string | null;
  format: string;
  match_format: string;
  doubles_mode: string | null;
  court_labels: string[] | null;
  allow__score_reporting: boolean | null;
  playoff_format: string | null;
  playoff_advance_count: number | null;
  playoff_seeding_style: string | null;
  playoff_status: string | null;
  champion_player_1_id: string | null;
  champion_player_2_id: string | null;
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

type PlayoffMatch = {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  round_label: string | null;
  team_a_seed: number | null;
  team_b_seed: number | null;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_team: string | null;
  winner_player_1_id: string | null;
  winner_player_2_id: string | null;
  next_match_id: string | null;
  next_match_team: string | null;
  is_bye: boolean;
  is_complete: boolean;
};

type SavedCoOrganizer = {
  id: string;
  name: string | null;
  email: string;
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
  const output: ScheduleRow[] = [];

  const hasBye = ids.length % 2 !== 0;
  const rotationPlayers = hasBye ? [...ids, 'BYE'] : [...ids];

  const playerCountForRotation = rotationPlayers.length;
  const maxRounds = playerCountForRotation - 1;
  const roundsToGenerate = Math.min(rounds, maxRounds);

  let rotating = [...rotationPlayers];

  for (let round = 1; round <= roundsToGenerate; round += 1) {
    let courtNumber = 1;

    for (let i = 0; i < playerCountForRotation / 2; i += 1) {
      const playerA = rotating[i];
      const playerB = rotating[playerCountForRotation - 1 - i];

      if (playerA === 'BYE' || playerB === 'BYE') {
        const byePlayerId = playerA === 'BYE' ? playerB : playerA;

        output.push({
          round_number: round,
          court_number: null,
          court_label: null,
          team_a_player_1_id: byePlayerId,
          team_a_player_2_id: null,
          team_b_player_1_id: null,
          team_b_player_2_id: null,
          team_a_score: null,
          team_b_score: null,
          is_bye: true,
          is_complete: false,
        });

        continue;
      }

      if (courtNumber > courts) continue;

      output.push({
        round_number: round,
        court_number: courtNumber,
        court_label: null,
        team_a_player_1_id: playerA,
        team_a_player_2_id: null,
        team_b_player_1_id: playerB,
        team_b_player_2_id: null,
        team_a_score: null,
        team_b_score: null,
        is_bye: false,
        is_complete: false,
      });

      courtNumber += 1;
    }

    rotating = [
      rotating[0],
      rotating[rotating.length - 1],
      ...rotating.slice(1, rotating.length - 1),
    ];
  }

  return output;
}

function groupKey(ids: string[]): string {
  return [...ids].sort().join('|');
}

type MatchResult = {
  a1: string;
  a2: string;
  b1: string;
  b2: string;
};

type ScoringOpts = {
  enforceGroupCooldown: boolean;
  enforceConsecutive: boolean;
};

class PartnerTracker {
  private used = new Map<string, number>();
  private distinctCount = new Map<string, number>();

  timesPartnered(a: string, b: string): number {
    return this.used.get(pairKey(a, b)) ?? 0;
  }

  distinctPartners(id: string): number {
    return this.distinctCount.get(id) ?? 0;
  }

  canPartner(a: string, b: string, totalValid: (id: string) => number): boolean {
    if (this.timesPartnered(a, b) === 0) return true;

    const aExhausted = this.distinctPartners(a) >= totalValid(a) - 1;
    const bExhausted = this.distinctPartners(b) >= totalValid(b) - 1;

    return aExhausted && bExhausted;
  }

  record(a: string, b: string): void {
    const key = pairKey(a, b);
    const prev = this.used.get(key) ?? 0;

    this.used.set(key, prev + 1);

    if (prev === 0) {
      this.distinctCount.set(a, (this.distinctCount.get(a) ?? 0) + 1);
      this.distinctCount.set(b, (this.distinctCount.get(b) ?? 0) + 1);
    }
  }
}

class MatchHistory {
  private opponentCounts = new Map<string, number>();
  private groupRounds = new Map<string, number[]>();
  private courtLog = new Map<string, number[]>();
  private lastSharedRound = new Map<string, number>();
  private consecutiveCount = new Map<string, number>();

  opponentTimes(a: string, b: string): number {
    return this.opponentCounts.get(pairKey(a, b)) ?? 0;
  }

  groupLastSeen(ids: string[]): number {
    const rounds = this.groupRounds.get(groupKey(ids));
    return rounds?.length ? rounds[rounds.length - 1] : -999;
  }

  lastCourt(id: string): number | null {
    const log = this.courtLog.get(id);
    return log?.length ? log[log.length - 1] : null;
  }

  consecutiveShared(a: string, b: string): number {
    return this.consecutiveCount.get(pairKey(a, b)) ?? 0;
  }

  record(a1: string, a2: string, b1: string, b2: string, court: number, round: number): void {
    const opponentPairs: Array<[string, string]> = [
      [a1, b1],
      [a1, b2],
      [a2, b1],
      [a2, b2],
    ];

    for (const [p, q] of opponentPairs) {
      this.opponentCounts.set(pairKey(p, q), (this.opponentCounts.get(pairKey(p, q)) ?? 0) + 1);
    }

    const currentGroupKey = groupKey([a1, a2, b1, b2]);
    this.groupRounds.set(currentGroupKey, [...(this.groupRounds.get(currentGroupKey) ?? []), round]);

    for (const id of [a1, a2, b1, b2]) {
      this.courtLog.set(id, [...(this.courtLog.get(id) ?? []), court]);
    }

    const allSharedPairs: Array<[string, string]> = [
      [a1, a2],
      [a1, b1],
      [a1, b2],
      [a2, b1],
      [a2, b2],
      [b1, b2],
    ];

    for (const [p, q] of allSharedPairs) {
      const key = pairKey(p, q);
      const last = this.lastSharedRound.get(key) ?? -999;
      const previousConsecutiveCount = this.consecutiveCount.get(key) ?? 0;

      this.consecutiveCount.set(
        key,
        last === round - 1 ? previousConsecutiveCount + 1 : 1
      );

      this.lastSharedRound.set(key, round);
    }
  }
}

function scoreDoublesMatch(
  a1: string,
  a2: string,
  b1: string,
  b2: string,
  court: number,
  round: number,
  partners: PartnerTracker,
  history: MatchHistory,
  totalValid: (id: string) => number,
  groupCooldown: number,
  opts: ScoringOpts
): number | null {
  if (!partners.canPartner(a1, a2, totalValid)) return null;
  if (!partners.canPartner(b1, b2, totalValid)) return null;

  const allSharedPairs: Array<[string, string]> = [
    [a1, a2],
    [a1, b1],
    [a1, b2],
    [a2, b1],
    [a2, b2],
    [b1, b2],
  ];

  if (opts.enforceConsecutive) {
    for (const [p, q] of allSharedPairs) {
      if (history.consecutiveShared(p, q) >= 2) return null;
    }
  }

  if (opts.enforceGroupCooldown) {
    if (round - history.groupLastSeen([a1, a2, b1, b2]) <= groupCooldown) {
      return null;
    }
  }

  let penalty = 0;

  penalty += partners.timesPartnered(a1, a2) * 500000;
  penalty += partners.timesPartnered(b1, b2) * 500000;

  if (!opts.enforceConsecutive) {
    for (const [p, q] of allSharedPairs) {
      const consecutiveCount = history.consecutiveShared(p, q);
      if (consecutiveCount >= 2) penalty += 200000 * consecutiveCount;
    }
  }

  penalty += history.opponentTimes(a1, b1) * 8000;
  penalty += history.opponentTimes(a1, b2) * 8000;
  penalty += history.opponentTimes(a2, b1) * 8000;
  penalty += history.opponentTimes(a2, b2) * 8000;

  if (history.lastCourt(a1) === court) penalty += 200;
  if (history.lastCourt(a2) === court) penalty += 200;
  if (history.lastCourt(b1) === court) penalty += 200;
  if (history.lastCourt(b2) === court) penalty += 200;

  penalty += Math.random() * 0.5;

  return penalty;
}

function backtrackDoublesRound(
  remaining: string[],
  current: MatchResult[],
  round: number,
  partners: PartnerTracker,
  history: MatchHistory,
  totalValid: (id: string) => number,
  groupCooldown: number,
  opts: ScoringOpts
): MatchResult[] | null {
  if (remaining.length === 0) return current;

  const first = remaining[0];
  const court = current.length + 1;

  type Candidate = {
    match: MatchResult;
    score: number;
    used: string[];
  };

  const candidates: Candidate[] = [];

  for (let i = 1; i < remaining.length; i += 1) {
    for (let j = i + 1; j < remaining.length; j += 1) {
      for (let k = j + 1; k < remaining.length; k += 1) {
        const group = [first, remaining[i], remaining[j], remaining[k]];

        const pairings: MatchResult[] = [
          { a1: group[0], a2: group[1], b1: group[2], b2: group[3] },
          { a1: group[0], a2: group[2], b1: group[1], b2: group[3] },
          { a1: group[0], a2: group[3], b1: group[1], b2: group[2] },
        ];

        for (const pairing of pairings) {
          const score = scoreDoublesMatch(
            pairing.a1,
            pairing.a2,
            pairing.b1,
            pairing.b2,
            court,
            round,
            partners,
            history,
            totalValid,
            groupCooldown,
            opts
          );

          if (score !== null) {
            candidates.push({
              match: pairing,
              score,
              used: group,
            });
          }
        }
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  for (const { match, used } of candidates) {
    const usedSet = new Set(used);
    const nextRemaining = remaining.filter((id) => !usedSet.has(id));

    const result = backtrackDoublesRound(
      nextRemaining,
      [...current, match],
      round,
      partners,
      history,
      totalValid,
      groupCooldown,
      opts
    );

    if (result !== null) return result;
  }

  return null;
}

function greedyDoublesRound(
  participants: string[],
  courts: number,
  round: number,
  partners: PartnerTracker,
  history: MatchHistory,
  totalValid: (id: string) => number,
  groupCooldown: number,
  opts: ScoringOpts,
  attempts: number
): MatchResult[] | null {
  let bestMatches: MatchResult[] | null = null;
  let bestPenalty = Infinity;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pool = shuffle(participants);
    const roundMatches: MatchResult[] = [];
    let totalPenalty = 0;
    let failed = false;

    for (let courtIndex = 0; courtIndex < courts; courtIndex += 1) {
      const group = pool.slice(courtIndex * 4, courtIndex * 4 + 4);

      if (group.length < 4) {
        failed = true;
        break;
      }

      const pairings: MatchResult[] = [
        { a1: group[0], a2: group[1], b1: group[2], b2: group[3] },
        { a1: group[0], a2: group[2], b1: group[1], b2: group[3] },
        { a1: group[0], a2: group[3], b1: group[1], b2: group[2] },
      ];

      let bestPairing: MatchResult | null = null;
      let bestScore = Infinity;

      for (const pairing of pairings) {
        const score = scoreDoublesMatch(
          pairing.a1,
          pairing.a2,
          pairing.b1,
          pairing.b2,
          courtIndex + 1,
          round,
          partners,
          history,
          totalValid,
          groupCooldown,
          opts
        );

        if (score !== null && score < bestScore) {
          bestScore = score;
          bestPairing = pairing;
        }
      }

      if (!bestPairing) {
        failed = true;
        break;
      }

      roundMatches.push(bestPairing);
      totalPenalty += bestScore;
    }

    if (!failed && totalPenalty < bestPenalty) {
      bestPenalty = totalPenalty;
      bestMatches = roundMatches;
    }
  }

  return bestMatches;
}

function makeCircleDoublesPartnerPairs(
  participants: string[],
  round: number
): Array<[string, string]> | null {
  if (participants.length % 2 !== 0) return null;

  const rotation = [...participants];
  const cycleRound = (round - 1) % (participants.length - 1);

  for (let i = 0; i < cycleRound; i += 1) {
    const fixed = rotation[0];
    const moved = rotation.pop();

    if (!moved) return null;

    rotation.splice(1, 0, moved);
    rotation[0] = fixed;
  }

  const pairs: Array<[string, string]> = [];

  for (let i = 0; i < rotation.length / 2; i += 1) {
    pairs.push([rotation[i], rotation[rotation.length - 1 - i]]);
  }

  return pairs;
}

function buildCirclePartnerDoublesRound(
  participants: string[],
  courts: number,
  round: number,
  partners: PartnerTracker,
  history: MatchHistory,
  totalValid: (id: string) => number,
  groupCooldown: number,
  opts: ScoringOpts
): MatchResult[] | null {
  if (participants.length < 4 || participants.length % 4 !== 0) return null;

  const partnerPairs = makeCircleDoublesPartnerPairs(participants, round);

  if (!partnerPairs) return null;

  type PartnerTeam = {
    p1: string;
    p2: string;
  };

  const teams: PartnerTeam[] = partnerPairs.map(([p1, p2]) => ({ p1, p2 }));

  if (teams.length !== courts * 2) return null;

  let bestMatches: MatchResult[] | null = null;
  let bestPenalty = Infinity;
  let searched = 0;
  const searchLimit = participants.length <= 24 ? 20000 : 6000;

  function search(
    remainingTeams: PartnerTeam[],
    currentMatches: MatchResult[],
    currentPenalty: number
  ): void {
    if (searched >= searchLimit) return;

    searched += 1;

    if (remainingTeams.length === 0) {
      if (currentPenalty < bestPenalty) {
        bestPenalty = currentPenalty;
        bestMatches = currentMatches;
      }

      return;
    }

    if (currentPenalty >= bestPenalty) return;

    const firstTeam = remainingTeams[0];
    const court = currentMatches.length + 1;

    type TeamOption = {
      index: number;
      match: MatchResult;
      score: number;
    };

    const options: TeamOption[] = [];

    for (let i = 1; i < remainingTeams.length; i += 1) {
      const secondTeam = remainingTeams[i];

      const match: MatchResult =
        (round + court) % 2 === 0
          ? {
              a1: secondTeam.p1,
              a2: secondTeam.p2,
              b1: firstTeam.p1,
              b2: firstTeam.p2,
            }
          : {
              a1: firstTeam.p1,
              a2: firstTeam.p2,
              b1: secondTeam.p1,
              b2: secondTeam.p2,
            };

      const score = scoreDoublesMatch(
        match.a1,
        match.a2,
        match.b1,
        match.b2,
        court,
        round,
        partners,
        history,
        totalValid,
        groupCooldown,
        opts
      );

      if (score !== null) {
        options.push({
          index: i,
          match,
          score,
        });
      }
    }

    options.sort((a, b) => a.score - b.score);

    for (const option of options) {
      const nextRemainingTeams = remainingTeams.filter(
        (_, index) => index !== 0 && index !== option.index
      );

      search(
        nextRemainingTeams,
        [...currentMatches, option.match],
        currentPenalty + option.score
      );
    }
  }

  search(teams, [], 0);

  return bestMatches;
}

function buildOneDoublesRound(
  participants: string[],
  courts: number,
  round: number,
  partners: PartnerTracker,
  history: MatchHistory,
  totalValid: (id: string) => number,
  groupCooldown: number
): MatchResult[] | null {
  const participantCount = participants.length;

  if (participantCount < 4 || participantCount % 4 !== 0) return null;

  const useBacktrack = participantCount < 16;
  const attempts = participantCount <= 8 ? 300 : participantCount <= 16 ? 120 : 400;

  function tryWith(cooldown: number, opts: ScoringOpts): MatchResult[] | null {
    if (participantCount >= 12) {
      const circleResult = buildCirclePartnerDoublesRound(
        participants,
        courts,
        round,
        partners,
        history,
        totalValid,
        cooldown,
        opts
      );

      if (circleResult !== null) return circleResult;
    }

    if (useBacktrack) {
      let bestMatches: MatchResult[] | null = null;
      let bestPenalty = Infinity;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const result = backtrackDoublesRound(
          shuffle(participants),
          [],
          round,
          partners,
          history,
          totalValid,
          cooldown,
          opts
        );

        if (result !== null) {
          let penalty = 0;

          result.forEach((match, index) => {
            penalty +=
              scoreDoublesMatch(
                match.a1,
                match.a2,
                match.b1,
                match.b2,
                index + 1,
                round,
                partners,
                history,
                totalValid,
                cooldown,
                opts
              ) ?? 0;
          });

          if (penalty < bestPenalty) {
            bestPenalty = penalty;
            bestMatches = result;
          }
        }
      }

      return bestMatches;
    }

    return greedyDoublesRound(
      participants,
      courts,
      round,
      partners,
      history,
      totalValid,
      cooldown,
      opts,
      attempts
    );
  }

  return (
    tryWith(groupCooldown, {
      enforceGroupCooldown: true,
      enforceConsecutive: true,
    }) ??
    tryWith(1, {
      enforceGroupCooldown: true,
      enforceConsecutive: true,
    }) ??
    tryWith(0, {
      enforceGroupCooldown: false,
      enforceConsecutive: true,
    }) ??
    tryWith(0, {
      enforceGroupCooldown: false,
      enforceConsecutive: false,
    })
  );
}

function chooseDoublesParticipants(
  ids: string[],
  courts: number,
  byeCounts: Map<string, number>,
  playedCounts: Map<string, number>
): { participants: string[]; benched: string[] } {
  const maxParticipants = courts * 4;

  if (ids.length <= maxParticipants) {
    return {
      participants: [...ids],
      benched: [],
    };
  }

  const sorted = [...ids].sort((a, b) => {
    const byeDifference = (byeCounts.get(b) ?? 0) - (byeCounts.get(a) ?? 0);
    if (byeDifference !== 0) return byeDifference;

    const playDifference = (playedCounts.get(a) ?? 0) - (playedCounts.get(b) ?? 0);
    if (playDifference !== 0) return playDifference;

    return Math.random() - 0.5;
  });

  return {
    participants: sorted.slice(0, maxParticipants),
    benched: sorted.slice(maxParticipants),
  };
}

function buildDoublesSchedule(
  players: PlayerSlot[],
  rounds: number,
  courts: number
): ScheduleRow[] {
  const activePlayers = players.filter((player) => (player.display_name ?? '').trim() !== '');

  if (activePlayers.length < 4) return [];

  const ids = activePlayers.map((player) => player.id);
  const totalValid = (_id: string) => ids.length - 1;
  const groupCooldown = Math.max(2, Math.ceil(ids.length / (courts * 2)));

  const partners = new PartnerTracker();
  const history = new MatchHistory();
  const byeCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const playedCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const output: ScheduleRow[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    const { participants, benched } = chooseDoublesParticipants(
      ids,
      courts,
      byeCounts,
      playedCounts
    );

    const activeCourts = Math.min(courts, Math.floor(participants.length / 4));
    const playing = participants.slice(0, activeCourts * 4);
    const extraBenched = participants.slice(activeCourts * 4);
    const allBenched = [...benched, ...extraBenched];

    const matches = buildOneDoublesRound(
      playing,
      activeCourts,
      round,
      partners,
      history,
      totalValid,
      groupCooldown
    );

    if (!matches) break;

    for (const id of allBenched) {
      byeCounts.set(id, (byeCounts.get(id) ?? 0) + 1);

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
    }

    matches.forEach(({ a1, a2, b1, b2 }, index) => {
      const court = index + 1;

      partners.record(a1, a2);
      partners.record(b1, b2);
      history.record(a1, a2, b1, b2, court, round);

      for (const id of [a1, a2, b1, b2]) {
        playedCounts.set(id, (playedCounts.get(id) ?? 0) + 1);
      }

      output.push({
        round_number: round,
        court_number: court,
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

function buildFixedPartnersSchedule(
  players: PlayerSlot[],
  rounds: number,
  courts: number
): ScheduleRow[] {
  const activePlayers = players.filter((p) => (p.display_name || '').trim() !== '');

  if (activePlayers.length < 4) return [];
  if (activePlayers.length % 2 !== 0) return [];

  type FixedTeam = {
    id: string;
    player1Id: string;
    player2Id: string;
  };

  const teams: FixedTeam[] = [];

  for (let i = 0; i < activePlayers.length; i += 2) {
    const player1 = activePlayers[i];
    const player2 = activePlayers[i + 1];

    if (!player1 || !player2) return [];

    teams.push({
      id: [player1.id, player2.id].sort().join('__'),
      player1Id: player1.id,
      player2Id: player2.id,
    });
  }

  if (teams.length < 2) return [];

  const output: ScheduleRow[] = [];
  const teamASideCounts = new Map<string, number>();
  const teamCourtHistory = new Map<string, number[]>();

  for (const team of teams) {
    teamASideCounts.set(team.id, 0);
    teamCourtHistory.set(team.id, []);
  }

  const hasBye = teams.length % 2 !== 0;
  const rotationTeams: Array<FixedTeam | null> = hasBye ? [...teams, null] : [...teams];
  const totalRotationSlots = rotationTeams.length;
  const maxRoundsWithoutRepeats = totalRotationSlots - 1;
  const requestedRounds = Math.max(0, rounds);
  const actualRounds = Math.min(requestedRounds, maxRoundsWithoutRepeats);

  function getCourtPenalty(team: FixedTeam, courtNumber: number): number {
    const history = teamCourtHistory.get(team.id) || [];
    return history.slice(-2).filter((court) => court === courtNumber).length * 100;
  }

  function chooseSides(team1: FixedTeam, team2: FixedTeam): { teamA: FixedTeam; teamB: FixedTeam } {
    const team1ACount = teamASideCounts.get(team1.id) || 0;
    const team2ACount = teamASideCounts.get(team2.id) || 0;

    if (team1ACount > team2ACount) {
      return { teamA: team2, teamB: team1 };
    }

    return { teamA: team1, teamB: team2 };
  }

  for (let round = 1; round <= actualRounds; round += 1) {
    const roundPairs: Array<{ team1: FixedTeam; team2: FixedTeam; score: number }> = [];

    for (let i = 0; i < totalRotationSlots / 2; i += 1) {
      const team1 = rotationTeams[i];
      const team2 = rotationTeams[totalRotationSlots - 1 - i];

      if (!team1 || !team2) continue;

      const projectedCourt = roundPairs.length + 1;
      const score =
        getCourtPenalty(team1, projectedCourt) +
        getCourtPenalty(team2, projectedCourt);

      roundPairs.push({
        team1,
        team2,
        score,
      });
    }

    roundPairs
      .sort((a, b) => a.score - b.score)
      .slice(0, courts)
      .forEach(({ team1, team2 }, index) => {
        const courtNumber = index + 1;
        const { teamA, teamB } = chooseSides(team1, team2);

        output.push({
          round_number: round,
          court_number: courtNumber,
          court_label: null,
          team_a_player_1_id: teamA.player1Id,
          team_a_player_2_id: teamA.player2Id,
          team_b_player_1_id: teamB.player1Id,
          team_b_player_2_id: teamB.player2Id,
          team_a_score: null,
          team_b_score: null,
          is_bye: false,
          is_complete: false,
        });

        teamASideCounts.set(teamA.id, (teamASideCounts.get(teamA.id) || 0) + 1);

        teamCourtHistory.set(teamA.id, [
          ...(teamCourtHistory.get(teamA.id) || []),
          courtNumber,
        ]);

        teamCourtHistory.set(teamB.id, [
          ...(teamCourtHistory.get(teamB.id) || []),
          courtNumber,
        ]);
      });

    const fixedTeam = rotationTeams[0];
    const rotatingTeams = rotationTeams.slice(1);
    const movedTeam = rotatingTeams.pop();

    if (movedTeam !== undefined) {
      rotationTeams.splice(0, rotationTeams.length, fixedTeam, movedTeam, ...rotatingTeams);
    }
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

  type MixedTeam = {
    maleId: string;
    femaleId: string;
  };

  type MixedMatch = {
    teamA: [string, string];
    teamB: [string, string];
  };

  const output: ScheduleRow[] = [];
  const partnerCounts = new Map<string, number>();
  const mixedTeamOpponentCounts = new Map<string, number>();
  const foursomeCounts = new Map<string, number>();
  const courtHistory = new Map<string, number[]>(
    activePlayers.map((player) => [player.id, []])
  );
  const recentSharedHistory = new Map<string, string[]>(
    activePlayers.map((player) => [player.id, []])
  );

  function getPartnerCount(a: string, b: string): number {
    return partnerCounts.get(pairKey(a, b)) || 0;
  }

  function getMixedTeamKey(team: [string, string]): string {
    return pairKey(team[0], team[1]);
  }

  function getMixedTeamOpponentKey(teamA: [string, string], teamB: [string, string]): string {
    return pairKey(getMixedTeamKey(teamA), getMixedTeamKey(teamB));
  }

  function getFoursomeKey(a1: string, a2: string, b1: string, b2: string): string {
    return [a1, a2, b1, b2].sort().join('|');
  }

  function scoreMixedMatch(match: MixedMatch, courtNumber: number): number {
    const [a1, a2] = match.teamA;
    const [b1, b2] = match.teamB;
    const allPlayers = [a1, a2, b1, b2];

    let penalty = 0;

    penalty += getPartnerCount(a1, a2) * 100000;
    penalty += getPartnerCount(b1, b2) * 100000;

    penalty +=
      (mixedTeamOpponentCounts.get(getMixedTeamOpponentKey(match.teamA, match.teamB)) || 0) *
      30000;

    penalty += (foursomeCounts.get(getFoursomeKey(a1, a2, b1, b2)) || 0) * 75000;

    for (const id of allPlayers) {
      const history = courtHistory.get(id) || [];
      const lastCourt = history[history.length - 1];

      if (lastCourt === courtNumber) penalty += 300;

      const lastTwo = history.slice(-2);
      if (lastTwo.length === 2 && lastTwo.every((court) => court === courtNumber)) {
        penalty += 1500;
      }
    }

    const sharedPairs: Array<[string, string]> = [
      [a1, a2],
      [a1, b1],
      [a1, b2],
      [a2, b1],
      [a2, b2],
      [b1, b2],
    ];

    for (const [p1, p2] of sharedPairs) {
      const p1History = recentSharedHistory.get(p1) || [];
      const p2History = recentSharedHistory.get(p2) || [];

      if (p1History.includes(p2) || p2History.includes(p1)) {
        penalty += 900;
      }
    }

    return penalty;
  }

  function buildTeamsForRound(round: number): MixedTeam[] {
    const femaleShift = (round - 1) % femalePlayers.length;

    return malePlayers.map((malePlayer, index) => ({
      maleId: malePlayer.id,
      femaleId: femalePlayers[(index + femaleShift) % femalePlayers.length].id,
    }));
  }

  function pairMixedTeams(teams: MixedTeam[]): MixedMatch[] | null {
    if (teams.length < 2 || teams.length % 2 !== 0) return null;

    let bestMatches: MixedMatch[] | null = null;
    let bestPenalty = Infinity;
    let searched = 0;
    const searchLimit = teams.length <= 10 ? 20000 : 8000;

    function search(
      remainingTeams: MixedTeam[],
      currentMatches: MixedMatch[],
      currentPenalty: number
    ): void {
      if (searched >= searchLimit) return;

      searched += 1;

      if (remainingTeams.length === 0) {
        if (currentPenalty < bestPenalty) {
          bestPenalty = currentPenalty;
          bestMatches = [...currentMatches];
        }

        return;
      }

      if (currentPenalty >= bestPenalty) return;

      const firstTeam = remainingTeams[0];
      const courtNumber = currentMatches.length + 1;
      const options: Array<{ index: number; match: MixedMatch; score: number }> = [];

      for (let i = 1; i < remainingTeams.length; i += 1) {
        const secondTeam = remainingTeams[i];

        const normalMatch: MixedMatch = {
          teamA: [firstTeam.maleId, firstTeam.femaleId],
          teamB: [secondTeam.maleId, secondTeam.femaleId],
        };

        const flippedMatch: MixedMatch = {
          teamA: [secondTeam.maleId, secondTeam.femaleId],
          teamB: [firstTeam.maleId, firstTeam.femaleId],
        };

        options.push({
          index: i,
          match: normalMatch,
          score: scoreMixedMatch(normalMatch, courtNumber),
        });

        options.push({
          index: i,
          match: flippedMatch,
          score: scoreMixedMatch(flippedMatch, courtNumber),
        });
      }

      options.sort((a, b) => a.score - b.score);

      for (const option of options.slice(0, 10)) {
        const nextRemainingTeams = remainingTeams.filter(
          (_, index) => index !== 0 && index !== option.index
        );

        search(
          nextRemainingTeams,
          [...currentMatches, option.match],
          currentPenalty + option.score
        );
      }
    }

    search(teams, [], 0);

    return bestMatches;
  }

  function recordMixedMatch(match: MixedMatch, courtNumber: number): void {
    const [a1, a2] = match.teamA;
    const [b1, b2] = match.teamB;

    partnerCounts.set(pairKey(a1, a2), getPartnerCount(a1, a2) + 1);
    partnerCounts.set(pairKey(b1, b2), getPartnerCount(b1, b2) + 1);

    const mixedTeamOpponentKey = getMixedTeamOpponentKey(match.teamA, match.teamB);
    mixedTeamOpponentCounts.set(
      mixedTeamOpponentKey,
      (mixedTeamOpponentCounts.get(mixedTeamOpponentKey) || 0) + 1
    );

    const foursomeKey = getFoursomeKey(a1, a2, b1, b2);
    foursomeCounts.set(foursomeKey, (foursomeCounts.get(foursomeKey) || 0) + 1);

    for (const id of [a1, a2, b1, b2]) {
      courtHistory.set(id, [...(courtHistory.get(id) || []), courtNumber]);
    }

    const sharedPairs: Array<[string, string]> = [
      [a1, a2],
      [a1, b1],
      [a1, b2],
      [a2, b1],
      [a2, b2],
      [b1, b2],
    ];

    for (const [p1, p2] of sharedPairs) {
      const p1History = recentSharedHistory.get(p1) || [];
      const p2History = recentSharedHistory.get(p2) || [];

      recentSharedHistory.set(p1, [...p1History, p2].slice(-4));
      recentSharedHistory.set(p2, [...p2History, p1].slice(-4));
    }
  }

  for (let round = 1; round <= rounds; round += 1) {
    const teams = buildTeamsForRound(round);
    const matches = pairMixedTeams(teams);

    if (!matches || !matches.length) break;

    matches.slice(0, courts).forEach((match, index) => {
      const courtNumber = index + 1;
      const [a1, a2] = match.teamA;
      const [b1, b2] = match.teamB;

      recordMixedMatch(match, courtNumber);

      output.push({
        round_number: round,
        court_number: courtNumber,
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

function validateScheduleRows(
  scheduleRows: ScheduleRow[],
  options: {
    format: string;
    tournamentMode: string | null;
    expectedRoundCount: number;
    availableCourts: number;
  }
): { isValid: boolean; message: string } {
  const playableRows = scheduleRows.filter((row) => !row.is_bye);

  if (!scheduleRows.length) {
    return {
      isValid: false,
      message: 'Could not generate a schedule.',
    };
  }

  if (!playableRows.length) {
    return {
      isValid: false,
      message: 'Could not generate any playable matches.',
    };
  }

  const generatedPlayableRounds = new Set(
    playableRows.map((row) => row.round_number)
  );

  if (generatedPlayableRounds.size < options.expectedRoundCount) {
    return {
      isValid: false,
      message: `Could only generate ${generatedPlayableRounds.size} of ${options.expectedRoundCount} required rounds. Please reduce rounds, reduce courts, or adjust player count.`,
    };
  }

  const playersByRound = new Map<number, Set<string>>();
  const courtsByRound = new Map<number, Set<number>>();

  for (const row of scheduleRows) {
    if (!Number.isFinite(row.round_number) || row.round_number < 1) {
      return {
        isValid: false,
        message: 'Schedule validation failed: invalid round number.',
      };
    }

    const playerIds = [
      row.team_a_player_1_id,
      row.team_a_player_2_id,
      row.team_b_player_1_id,
      row.team_b_player_2_id,
    ].filter(Boolean) as string[];

    const uniquePlayersInMatch = new Set(playerIds);

    if (uniquePlayersInMatch.size !== playerIds.length) {
      return {
        isValid: false,
        message: 'Schedule validation failed: the same player appears twice in one match.',
      };
    }

    if (!playersByRound.has(row.round_number)) {
      playersByRound.set(row.round_number, new Set<string>());
    }

    const roundPlayers = playersByRound.get(row.round_number)!;

    for (const playerId of playerIds) {
      if (roundPlayers.has(playerId)) {
        return {
          isValid: false,
          message: 'Schedule validation failed: a player appears more than once in the same round.',
        };
      }

      roundPlayers.add(playerId);
    }

    if (row.is_bye) continue;

    if (!row.team_a_player_1_id || !row.team_b_player_1_id) {
      return {
        isValid: false,
        message: 'Schedule validation failed: a match is missing required players.',
      };
    }

    const requiresDoublesPlayers =
      options.format === 'doubles' || options.tournamentMode === 'cream_of_the_crop';

    if (
      requiresDoublesPlayers &&
      (!row.team_a_player_2_id || !row.team_b_player_2_id)
    ) {
      return {
        isValid: false,
        message: 'Schedule validation failed: a doubles match is missing a partner.',
      };
    }

    if (
      row.court_number === null ||
      row.court_number < 1 ||
      row.court_number > options.availableCourts
    ) {
      return {
        isValid: false,
        message: 'Schedule validation failed: invalid court assignment.',
      };
    }

    if (!courtsByRound.has(row.round_number)) {
      courtsByRound.set(row.round_number, new Set<number>());
    }

    const roundCourts = courtsByRound.get(row.round_number)!;

    if (roundCourts.has(row.court_number)) {
      return {
        isValid: false,
        message: 'Schedule validation failed: two matches were assigned to the same court in the same round.',
      };
    }

    roundCourts.add(row.court_number);
  }

  return {
    isValid: true,
    message: '',
  };
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

function clearGame3IfSeriesDecidedInTwo(match: Match): Match {
  if (
    match.game_1_a === null ||
    match.game_1_b === null ||
    match.game_2_a === null ||
    match.game_2_b === null
  ) {
    return match;
  }

  const game1AWon = match.game_1_a > match.game_1_b;
  const game2AWon = match.game_2_a > match.game_2_b;

  if (game1AWon === game2AWon) {
    return {
      ...match,
      game_3_a: null,
      game_3_b: null,
    };
  }

  return match;
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

function nextPowerOfTwo(value: number) {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

function getPlayoffRoundLabel(roundNumber: number, totalRounds: number) {
  if (roundNumber === totalRounds) return 'Championship';
  if (roundNumber === totalRounds - 1) return 'Semifinals';
  if (roundNumber === totalRounds - 2) return 'Quarterfinals';
  return `Round ${roundNumber}`;
}

function getSeedPairs(seedCount: number, seedingStyle: string | null) {
  const seeds = Array.from({ length: seedCount }, (_, index) => index + 1);

  if (seedingStyle === 'simple') {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < Math.floor(seeds.length / 2); i += 1) {
      pairs.push([seeds[i], seeds[seeds.length - 1 - i]]);
    }
    return pairs;
  }

  const bracketSize = nextPowerOfTwo(seedCount);
  const slots: Array<number | null> = Array.from({ length: bracketSize }, () => null);

  for (let i = 0; i < Math.floor(bracketSize / 2); i += 1) {
    slots[i * 2] = i + 1;
    slots[i * 2 + 1] = bracketSize - i;
  }

  const pairs: Array<[number, number]> = [];

  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];

    if (a === null || b === null) continue;
    if (a > seedCount && b > seedCount) continue;

    pairs.push([a, b]);
  }

  return pairs;
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

export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playoffMatches, setPlayoffMatches] = useState<PlayoffMatch[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');

  function getTournamentLink(id: string) {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/tournament/${id}`;
  }
  return `/tournament/${id}`;
}
  const [savedCoOrganizers, setSavedCoOrganizers] = useState<SavedCoOrganizer[]>([]);
  const [selectedSavedCoOrganizerId, setSelectedSavedCoOrganizerId] = useState('');
  const [saveCoOrganizerForLater, setSaveCoOrganizerForLater] = useState(false);
  const [savedCoOrganizerName, setSavedCoOrganizerName] = useState('');
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [playoffScoreDrafts, setPlayoffScoreDrafts] = useState<
  Record<string, { team_a_score: string; team_b_score: string }>
  >({});
  const [isSavingNames, setIsSavingNames] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isEndingEarly, setIsEndingEarly] = useState(false);
  const [isDeletingTournament, setIsDeletingTournament] = useState(false);
  const [isRematching, setIsRematching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'players' | 'rounds' | 'standings'>('players');
  const [selectedRound, setSelectedRound] = useState(1);
  const [selectedPlayoffRound, setSelectedPlayoffRound] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [standingsView, setStandingsView] = useState<'leaderboard' | 'day'>('leaderboard');
  const [showSharingTools, setShowSharingTools] = useState(false);
  
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

  const claimedSlot = useMemo(
    () => playerSlots.find((slot) => slot.claimed_by_user_id === userId) || null,
    [playerSlots, userId]
  );

  const playersById = useMemo(
    () => Object.fromEntries(playerSlots.map((slot) => [slot.id, slot])),
    [playerSlots]
  );

  const yourMatch = useMemo(() => {
    if (!claimedSlot) return null;

    return (
      matches.find((m) => {
        if (m.is_bye || m.is_complete) return false;

        return (
          m.team_a_player_1_id === claimedSlot.id ||
          m.team_a_player_2_id === claimedSlot.id ||
          m.team_b_player_1_id === claimedSlot.id ||
          m.team_b_player_2_id === claimedSlot.id
        );
      }) || null
    );
  }, [matches, claimedSlot]);

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

  const finalRound = useMemo(
    () => roundsAvailable[roundsAvailable.length - 1] || 1,
    [roundsAvailable]
  );

  const completedMatchCount = useMemo(
    () => matches.filter((m) => !m.is_bye && m.is_complete).length,
    [matches]
  );

  const totalPlayableMatchCount = useMemo(
  () => matches.filter((m) => !m.is_bye).length,
  [matches]
);

const playableMatches = matches.filter((m) => !m.is_bye);
const completedPlayableMatches = playableMatches.filter((m) => m.is_complete);

let tournamentPhase:
  | 'not_started'
  | 'round_in_progress'
  | 'between_rounds'
  | 'round_robin_complete'
  | 'playoffs'
  | 'completed' = 'not_started';

if (isCompleted) {
  tournamentPhase = 'completed';
} else if (!isStarted) {
  tournamentPhase = 'not_started';
} else if (playoffMatches.length > 0) {
  const completedPlayoffMatches = playoffMatches.filter((m) => m.is_complete);

  if (completedPlayoffMatches.length === playoffMatches.length) {
    tournamentPhase = 'completed';
  } else {
    tournamentPhase = 'playoffs';
  }
} else if (
  playableMatches.length > 0 &&
  completedPlayableMatches.length === playableMatches.length
) {
  tournamentPhase = 'round_robin_complete';
} else {
  const liveRoundMatches = matches.filter(
    (m) => m.round_number === currentRound && !m.is_bye
  );

  const completedLiveRoundMatches = liveRoundMatches.filter((m) => m.is_complete);

  if (
    liveRoundMatches.length > 0 &&
    completedLiveRoundMatches.length === liveRoundMatches.length
  ) {
    tournamentPhase = 'between_rounds';
  } else {
    tournamentPhase = 'round_in_progress';
  }
}

const tournamentPhaseTitle =
  tournamentPhase === 'completed'
    ? 'Tournament Complete'
    : tournamentPhase === 'not_started'
    ? 'Ready to Start'
    : tournamentPhase === 'round_in_progress'
    ? `Round ${currentRound} In Progress`
    : tournamentPhase === 'between_rounds'
    ? `Round ${currentRound} Complete`
    : tournamentPhase === 'round_robin_complete'
    ? 'Round Robin Complete'
    : tournamentPhase === 'playoffs'
    ? 'Playoffs In Progress'
    : 'Tournament Status';

const tournamentPhaseSubtitle =
  tournamentPhase === 'completed'
    ? 'Final results are locked.'
    : tournamentPhase === 'not_started'
    ? 'The schedule will appear after the organizer starts the tournament.'
    : tournamentPhase === 'round_in_progress'
    ? `${completedMatchCount} of ${totalPlayableMatchCount} round robin matches complete.`
    : tournamentPhase === 'between_rounds'
    ? 'All matches in this round are complete. The next round is ready.'
    : tournamentPhase === 'round_robin_complete'
    ? 'All round robin matches are complete. Generate playoffs or review standings.'
    : tournamentPhase === 'playoffs'
    ? 'Playoff matches are active. Winners advance through the bracket.'
    : '';

const hasAnyScores = matches.some(
  (m) =>
    m.team_a_score !== null ||
    m.team_b_score !== null ||
    m.game_1_a !== null ||
    m.game_1_b !== null ||
    m.game_2_a !== null ||
    m.game_2_b !== null ||
    m.game_3_a !== null ||
    m.game_3_b !== null
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
      if (roundMatches.every((m) => m.is_complete)) statusMap.set(round, 'complete');
      else if (round === currentRound) statusMap.set(round, 'current');
      else if (round < currentRound) statusMap.set(round, 'complete');
      else statusMap.set(round, 'upcoming');
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

  const currentRoundMatches = useMemo(
    () => matches.filter((m) => m.round_number === currentRound && !m.is_bye),
    [matches, currentRound]
  );

  const nextUpMatch = useMemo(
    () => currentRoundMatches.find((m) => !m.is_complete) || null,
    [currentRoundMatches]
  );

  const playoffRounds = useMemo(() => {
  const rounds = new Map<number, PlayoffMatch[]>();

  for (const match of playoffMatches) {
    if (!rounds.has(match.round_number)) {
      rounds.set(match.round_number, []);
    }

    rounds.get(match.round_number)!.push(match);
  }

  return Array.from(rounds.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNumber, matches]) => ({
      roundNumber,
      label: matches[0]?.round_label || `Round ${roundNumber}`,
      matches: matches.sort((a, b) => a.match_number - b.match_number),
    }));
}, [playoffMatches]);

  useEffect(() => {
    setStandings(computeStandings(playerSlots, matches, isSingles, isBestOf3));
  }, [playerSlots, matches, isSingles, isBestOf3]);

  const isOrganizer = tournament?.organizer_user_id === userId;

  const isCoOrganizer =
  !!tournament?.co_organizer_email &&
  !!userEmail &&
  tournament.co_organizer_email.toLowerCase().trim() === userEmail.toLowerCase().trim();

  const canManageScores = isOrganizer || isCoOrganizer;

  const canReportScores =
  canManageScores ||
  (!!tournament?.allow_player_score_reporting && !!claimedSlot && isStarted && !isCompleted);

  useEffect(() => {
    if (!isOrganizer && isStarted) {
      setActiveTab('rounds');
    }
  }, [isOrganizer, isStarted]);

  const tournamentWinner = standings[0] || null;

  const biggestClimber = useMemo(() => {
  if (tournament?.tournament_mode !== 'cream_of_the_crop') return null;
  if (!standings.length) return null;

  const climbers = standings
    .map((row, index) => {
      const player = playerSlots.find((slot) => slot.id === row.playerId);
      if (!player) return null;

      const startingRank = player.slot_number;
      const finalRank = index + 1;
      const climb = startingRank - finalRank;

      return {
        ...row,
        startingRank,
        finalRank,
        climb,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (!a || !b) return 0;
      return b.climb - a.climb;
    });

  return climbers[0] || null;
}, [tournament?.tournament_mode, standings, playerSlots]);

  const canStartTournament = useMemo(() => {
    if (!tournament) return false;
    if (tournament.status === 'started' || tournament.status === 'completed') return false;
    const namedCount = playerSlots.filter((slot) => {
  const typedName = (newNames[slot.id] ?? '').trim();
  const savedName = (slot.display_name ?? '').trim();

  return typedName !== '' || savedName !== '' || !!slot.claimed_by_user_id;
}).length;
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

   const { data: matchesData } = await supabase
  .from('matches')
  .select('*')
  .eq('tournament_id', params.id)
  .order('round_number', { ascending: true })
  .order('court_number', { ascending: true });

const safeMatches = matchesData || [];
setMatches(safeMatches);
const { data: playoffMatchesData } = await supabase
  .from('playoff_matches')
  .select('*')
  .eq('tournament_id', params.id)
  .order('round_number', { ascending: true })
  .order('match_number', { ascending: true });

setPlayoffMatches(playoffMatchesData || []);

setScoreDrafts((prev) => {
  const next: Record<string, ScoreDraft> = {};

  for (const match of safeMatches) {
    next[match.id] = {
      team_a_score:
        prev[match.id]?.team_a_score !== undefined
          ? prev[match.id].team_a_score
          : match.team_a_score === null
          ? ''
          : String(match.team_a_score),

      team_b_score:
        prev[match.id]?.team_b_score !== undefined
          ? prev[match.id].team_b_score
          : match.team_b_score === null
          ? ''
          : String(match.team_b_score),

      game_1_a:
        prev[match.id]?.game_1_a !== undefined
          ? prev[match.id].game_1_a
          : match.game_1_a === null
          ? ''
          : String(match.game_1_a),

      game_1_b:
        prev[match.id]?.game_1_b !== undefined
          ? prev[match.id].game_1_b
          : match.game_1_b === null
          ? ''
          : String(match.game_1_b),

      game_2_a:
        prev[match.id]?.game_2_a !== undefined
          ? prev[match.id].game_2_a
          : match.game_2_a === null
          ? ''
          : String(match.game_2_a),

      game_2_b:
        prev[match.id]?.game_2_b !== undefined
          ? prev[match.id].game_2_b
          : match.game_2_b === null
          ? ''
          : String(match.game_2_b),

      game_3_a:
        prev[match.id]?.game_3_a !== undefined
          ? prev[match.id].game_3_a
          : match.game_3_a === null
          ? ''
          : String(match.game_3_a),

      game_3_b:
        prev[match.id]?.game_3_b !== undefined
          ? prev[match.id].game_3_b
          : match.game_3_b === null
          ? ''
          : String(match.game_3_b),
    };
  }

  return next;
});
}

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? '';
      const currentUserEmail = authData.user?.email ?? '';

      setUserEmail(currentUserEmail);
      if (currentUserId) {
      const { data: savedAdmins } = await supabase
    .from('saved_co_organizers')
    .select('id, name, email')
    .eq('user_id', currentUserId)
    .order('name', { ascending: true });

  setSavedCoOrganizers(savedAdmins || []);
}

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
  await loadTournamentData(userId);
}
)
      .on(
  'postgres_changes',
  {
    event: '*',
    schema: 'public',
    table: 'playoff_matches',
    filter: `tournament_id=eq.${params.id}`,
  },
  async () => {
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
  }, [params.id, supabase, userId]);

  useEffect(() => {
    if (!roundsAvailable.length) return;
    setSelectedRound((prev) => {
      if (!roundsAvailable.includes(prev)) return isCompleted ? finalRound : currentRound;
      return prev;
    });
  }, [roundsAvailable, currentRound, finalRound, isCompleted]);

  useEffect(() => {
    if (isCompleted) {
      setSelectedRound(finalRound);
      setActiveTab('standings');
      return;
    }
    if (isStarted && matches.length > 0) setSelectedRound(currentRound);
  }, [isStarted, isCompleted, matches.length, currentRound, finalRound]);

  useEffect(() => {
  if (!isStarted || isCompleted) return;

  const timeout = window.setTimeout(() => {
    const yourMatchCard = document.getElementById('your-match-card');

    if (yourMatchCard) {
      yourMatchCard.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    if (!nextUpMatch) return;

    const nextMatchCard = document.getElementById(getMatchElementId(nextUpMatch.id));
    if (!nextMatchCard) return;

    nextMatchCard.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, 150);

  return () => window.clearTimeout(timeout);
}, [yourMatch?.id, nextUpMatch?.id, isStarted, isCompleted]);

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
    } catch {
      setMessage('Could not share join link.');
    }
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

    const claimedName = profile?.display_name?.trim() || user.email?.split('@')[0] || 'Player';

    const { error } = await supabase
      .from('tournament_players')
      .update({ claimed_by_user_id: user.id, display_name: claimedName })
      .eq('id', slotId)
      .is('claimed_by_user_id', null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewNames((prev) => ({ ...prev, [slotId]: claimedName }));
    await loadTournamentData(user.id);
    setMessage('Spot claimed.');
  }

async function unclaimMySpot(slotId: string) {
  if (isLocked) {
    setMessage('Player spots are locked.');
    return;
  }

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    setMessage('Sign in first.');
    return;
  }

  const slot = playerSlots.find((s) => s.id === slotId);

  if (!slot || slot.claimed_by_user_id !== user.id) {
    setMessage('This spot is not claimed by your account.');
    await loadTournamentData(user.id);
    return;
  }

  const { error } = await supabase
    .from('tournament_players')
    .update({
      display_name: '',
      claimed_by_user_id: null,
      gender: null,
    })
    .eq('id', slotId)
    .eq('claimed_by_user_id', user.id);

  if (error) {
    setMessage(`Unclaim failed: ${error.message}`);
    return;
  }

  setNewNames((prev) => ({ ...prev, [slotId]: '' }));
  await loadTournamentData(user.id);
  setMessage('You have given up your spot.');
}

 async function saveAllPlayerNames() {
  if (isLocked) {
    setMessage('Player names are locked.');
    return;
  }

  setMessage('');
  setIsSavingNames(true);

  try {
    const updates = playerSlots
      .map((slot) => {
        const typedName = (newNames[slot.id] ?? '').trim();
        const savedName = (slot.display_name ?? '').trim();
        const nextName = typedName || savedName;

        if (slot.claimed_by_user_id && nextName === '') {
          return null;
        }

        return supabase
          .from('tournament_players')
          .update({ display_name: nextName })
          .eq('id', slot.id);
      })
      .filter(Boolean);

    const results = await Promise.all(updates);

    const failed = results.find((result) => result?.error);

    if (failed?.error) {
      setMessage(`Save failed: ${failed.error.message}`);
      setIsSavingNames(false);
      return;
    }

    await loadTournamentData(userId);
    setMessage('Player names saved.');
  } catch (err) {
    setMessage(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed.');
  }

  setIsSavingNames(false);
}

async function clearPlayerSlot(slotId: string) {
  if (!isOrganizer || isLocked) {
    setMessage('Player spots are locked.');
    return;
  }

  const confirmed = window.confirm('Clear this player spot?');
  if (!confirmed) return;

  const { error } = await supabase
    .from('tournament_players')
    .update({
      display_name: '',
      claimed_by_user_id: null,
      gender: null,
    })
    .eq('id', slotId);

  if (error) {
    setMessage(`Clear failed: ${error.message}`);
    return;
  }

  setNewNames((prev) => ({ ...prev, [slotId]: '' }));
  await loadTournamentData(userId);
  setMessage('Player cleared.');
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

  async function handleGenerateSiftRound() {
  if (!tournament) return;

  setMessage('');

    const existingSiftMatches = matches.filter(
  (m) => m.round_number >= 4 && m.round_number <= 6 && !m.is_bye
);

if (existingSiftMatches.length > 0) {
  setMessage('Re-Rank Round has already been created.');
  return;
}

  // 1. Check if Sort Round is complete
  const sortMatches = matches.filter(
    (m) => m.round_number >= 1 && m.round_number <= 3
  );

  const incomplete = sortMatches.some((m) => !m.is_complete);

  if (incomplete) {
    setMessage('Finish all Sort Round matches first.');
    return;
  }

  // 2. Build next stage players
  const nextPlayers = buildNextCreamOfTheCropStagePlayers(
    playerSlots,
    matches,
    1
  );

  if (!nextPlayers.length) {
    setMessage('Could not generate Re-Rank Round.');
    return;
  }

  // 3. Build Sift schedule (rounds 4–6)
  const siftSchedule = buildCreamOfTheCropStageSchedule(nextPlayers, 4);

  // 4. Insert into database
  const { error } = await supabase.from('matches').insert(
    siftSchedule.map((row) => ({
      tournament_id: tournament.id,
      ...row,
      court_label: getCourtLabel(tournament, row.court_number),
    }))
  );

  if (error) {
    setMessage(`Failed to create Sift Round: ${error.message}`);
    return;
  }

  await loadTournamentData(userId);
  setMessage('Re-Rank Round created.');
}

  async function handleGenerateFinalRound() {
  if (!tournament) return;

  setMessage('');

    const existingFinalMatches = matches.filter(
  (m) => m.round_number >= 7 && m.round_number <= 9 && !m.is_bye
);

if (existingFinalMatches.length > 0) {
  setMessage('Final Round has already been created.');
  return;
}

  // 1. Check if Sift Round is complete (rounds 4–6)
  const siftMatches = matches.filter(
    (m) => m.round_number >= 4 && m.round_number <= 6
  );

  const incomplete = siftMatches.some((m) => !m.is_complete);

  if (incomplete) {
    setMessage('Finish all Re-Rank Round matches first.');
    return;
  }

  // 2. Build next stage players (based on Sift results)
  const nextPlayers = buildNextCreamOfTheCropStagePlayers(
    playerSlots,
    matches,
    4
  );

  if (!nextPlayers.length) {
    setMessage('Could not generate Final Round.');
    return;
  }

  // 3. Build Final schedule (rounds 7–9)
  const finalSchedule = buildCreamOfTheCropStageSchedule(nextPlayers, 7);

  // 4. Insert into database
  const { error } = await supabase.from('matches').insert(
    finalSchedule.map((row) => ({
      tournament_id: tournament.id,
      ...row,
      court_label: getCourtLabel(tournament, row.court_number),
    }))
  );

  if (error) {
    setMessage(`Failed to create Final Round: ${error.message}`);
    return;
  }

  await loadTournamentData(userId);
  setMessage('Final Round created.');
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
      const updates = playerSlots
  .map((slot) => {
    const typedName = (newNames[slot.id] ?? '').trim();
    const savedName = (slot.display_name ?? '').trim();
    const nextName = typedName || savedName;

    return supabase
      .from('tournament_players')
      .update({ display_name: nextName })
      .eq('id', slot.id);
  });

    const results = await Promise.all(updates);

    const failed = results.find((r) => r?.error);
    if (failed?.error) {
  setMessage(`Save failed: ${failed.error.message}`);
  setIsStarting(false);
  return;
}
      const { data: freshPlayers, error: freshPlayersError } = await supabase
        .from('tournament_players')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('slot_number', { ascending: true });

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

      if (freshPlayersError) {
        setMessage(`Could not load players: ${freshPlayersError.message}`);
        setIsStarting(false);
        return;
      }

      const namedPlayers = (freshPlayers || []).filter(
        (slot) => (slot.display_name || '').trim() !== ''
      );

      if (namedPlayers.length < minPlayersRequired) {
        setMessage(`Please save at least ${minPlayersRequired} player names before starting.`);
        setIsStarting(false);
        return;
      }

      if (tournament.format === 'doubles' && tournament.doubles_mode === 'mixed') {
        const playersMissingGender = namedPlayers.filter((slot) => !slot.gender);

        if (playersMissingGender.length > 0) {
          setMessage(
            'Every player in a mixed doubles tournament must be marked male or female before starting.'
          );
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
      const availableCourts = Math.max(
        1,
        Math.min(tournament.courts, Math.floor(namedPlayers.length / playersPerCourt))
      );

      if (tournament.tournament_mode === 'cream_of_the_crop') {
      if (namedPlayers.length % 4 !== 0) {
        setMessage('Cream of the Crop requires players in groups of 4.');
        setIsStarting(false);
      return;
  }
}

      const scheduleRows =
        tournament.tournament_mode === 'cream_of_the_crop'
        ? buildCreamOfTheCropStageSchedule(namedPlayers, 1)
        : buildSchedule(
        namedPlayers,
        tournament.rounds,
        availableCourts,
        tournament.format,
        tournament.doubles_mode
      );

      const scheduleValidation = validateScheduleRows(scheduleRows, {
        format: tournament.format,
        tournamentMode: tournament.tournament_mode,
        expectedRoundCount:
        tournament.tournament_mode === 'cream_of_the_crop' ? 3 : tournament.rounds,
        availableCourts,
  });

if (!scheduleValidation.isValid) {
  setMessage(scheduleValidation.message);
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

      const { error: insertError } = await supabase.from('matches').insert(
        scheduleRows.map((row) => ({
          tournament_id: tournament.id,
          ...row,
          court_label: getCourtLabel(tournament, row.court_number),
        }))
      );

      if (insertError) {
        setMessage(`Generate failed: ${insertError.message}`);
        setIsStarting(false);
        return;
      }

      const { error: startError } = await supabase
        .from('tournaments')
        .update({ status: 'started', started_at: new Date().toISOString() })
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

  async function generatePlayoffBracket() {
  if (!tournament) return;

  if (!isOrganizer) {
    setMessage('Only the organizer can generate the playoff bracket.');
    return;
  }

  if (tournament.playoff_format === 'none') {
    setMessage('This tournament does not have playoffs enabled.');
    return;
  }

  if (!matches.length || !matches.every((match) => match.is_bye || match.is_complete)) {
    setMessage('Finish all round robin matches before generating playoffs.');
    return;
  }

  if (playoffMatches.length > 0) {
    setMessage('Playoff bracket already exists.');
    return;
  }

  const standingByPlayerId = Object.fromEntries(
    standings.map((row) => [row.playerId, row])
  );

  const competitors =
    tournament.format === 'doubles' && tournament.doubles_mode === 'fixed'
      ? playerSlots
          .filter((slot) => (slot.display_name || '').trim() !== '')
          .reduce<
            Array<{
              player1Id: string;
              player2Id: string | null;
              name: string;
              wins: number;
              pointDiff: number;
              pointsFor: number;
            }>
          >((teams, slot, index, activePlayers) => {
            if (index % 2 !== 0) return teams;

            const partner = activePlayers[index + 1];
            if (!partner) return teams;

            const standing =
              standingByPlayerId[slot.id] || standingByPlayerId[partner.id];

            teams.push({
              player1Id: slot.id,
              player2Id: partner.id,
              name: `${slot.display_name || `Player ${slot.slot_number}`} & ${
                partner.display_name || `Player ${partner.slot_number}`
              }`,
              wins: standing?.wins || 0,
              pointDiff: standing?.pointDiff || 0,
              pointsFor: standing?.pointsFor || 0,
            });

            return teams;
          }, [])
      : standings.map((row) => ({
          player1Id: row.playerId,
          player2Id: null,
          name: row.name,
          wins: row.wins,
          pointDiff: row.pointDiff,
          pointsFor: row.pointsFor,
        }));

  const sortedCompetitors = [...competitors].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.name.localeCompare(b.name);
  });

  const seedCount = Math.min(
    tournament.playoff_advance_count || sortedCompetitors.length,
    sortedCompetitors.length
  );

  if (seedCount < 2) {
    setMessage('At least 2 players or teams are needed for playoffs.');
    return;
  }

  const seededCompetitors = sortedCompetitors.slice(0, seedCount);

  function buildStandardSeedOrder(size: number): number[] {
    if (size === 1) return [1];

    let order = [1, 2];

    while (order.length < size) {
      const nextSize = order.length * 2;
      order = order.flatMap((seed) => [seed, nextSize + 1 - seed]);
    }

    return order;
  }

  const bracketSize =
    tournament.playoff_seeding_style === 'simple'
      ? seedCount
      : nextPowerOfTwo(seedCount);

  const firstRoundSlots =
    tournament.playoff_seeding_style === 'simple'
      ? Array.from({ length: seedCount }, (_, index) => index + 1).flatMap(
          (_, index, seeds) => {
            if (index >= Math.ceil(seeds.length / 2)) return [];
            const left = index + 1;
            const right = seeds.length - index;
            return left === right ? [left, null] : [left, right];
          }
        )
      : buildStandardSeedOrder(bracketSize).map((seed) =>
          seed <= seedCount ? seed : null
        );

  const firstRoundPairs: Array<[number | null, number | null]> = [];

  for (let i = 0; i < firstRoundSlots.length; i += 2) {
    firstRoundPairs.push([firstRoundSlots[i], firstRoundSlots[i + 1] || null]);
  }

  const roundMatchCounts: number[] = [];
  let currentRoundMatchCount = firstRoundPairs.length;

  while (currentRoundMatchCount >= 1) {
    roundMatchCounts.push(currentRoundMatchCount);
    if (currentRoundMatchCount === 1) break;
    currentRoundMatchCount = Math.ceil(currentRoundMatchCount / 2);
  }

  const totalRounds = roundMatchCounts.length;

  const rowsToInsert = roundMatchCounts.flatMap((matchCount, roundIndex) => {
  const roundNumber = roundIndex + 1;
  const normalizedRoundNumber = roundIndex + 1;

    return Array.from({ length: matchCount }, (_, matchIndex) => {
  const matchNumber = matchIndex + 1;
  const firstRoundPair = roundNumber === 1 ? firstRoundPairs[matchIndex] : null;

  const seedA = firstRoundPair?.[0] || null;
  const seedB = firstRoundPair?.[1] || null;

      const competitorA = seedA ? seededCompetitors[seedA - 1] : null;
      const competitorB = seedB ? seededCompetitors[seedB - 1] : null;

      const isBye = roundNumber === 1 && !!competitorA && !competitorB;

      return {
        tournament_id: tournament.id,
        round_number: normalizedRoundNumber,
        match_number: matchNumber,
        round_label: getPlayoffRoundLabel(roundNumber, totalRounds),

        team_a_seed: competitorA ? seedA : null,
        team_b_seed: competitorB ? seedB : null,

        team_a_player_1_id: competitorA?.player1Id || null,
        team_a_player_2_id: competitorA?.player2Id || null,
        team_b_player_1_id: competitorB?.player1Id || null,
        team_b_player_2_id: competitorB?.player2Id || null,

        team_a_score: null,
        team_b_score: null,

        winner_team: isBye ? 'A' : null,
        winner_player_1_id: isBye ? competitorA?.player1Id || null : null,
        winner_player_2_id: isBye ? competitorA?.player2Id || null : null,

        next_match_id: null,
        next_match_team: null,

        is_bye: isBye,
        is_complete: isBye,
      };
    });
  });

  const { error: deleteError } = await supabase
    .from('playoff_matches')
    .delete()
    .eq('tournament_id', tournament.id);

  if (deleteError) {
    setMessage(`Could not reset playoff bracket: ${deleteError.message}`);
    return;
  }

  const { data: insertedMatches, error: insertError } = await supabase
    .from('playoff_matches')
    .insert(rowsToInsert)
    .select('*');

  if (insertError || !insertedMatches) {
    setMessage(
      `Could not generate playoff bracket: ${
        insertError?.message || 'No matches returned.'
      }`
    );
    return;
  }

  const matchByRoundAndNumber = new Map<string, PlayoffMatch>();

  for (const match of insertedMatches as PlayoffMatch[]) {
    matchByRoundAndNumber.set(`${match.round_number}-${match.match_number}`, match);
  }

  const updatePromises: any[] = [];

  for (const match of insertedMatches as PlayoffMatch[]) {
    if (match.round_number >= totalRounds) continue;

    const nextMatchNumber = Math.ceil(match.match_number / 2);
    const nextMatchTeam = match.match_number % 2 === 1 ? 'A' : 'B';
    const nextMatch = matchByRoundAndNumber.get(
      `${match.round_number + 1}-${nextMatchNumber}`
    );

    if (!nextMatch) continue;

    updatePromises.push(
      supabase
        .from('playoff_matches')
        .update({
          next_match_id: nextMatch.id,
          next_match_team: nextMatchTeam,
        })
        .eq('id', match.id)
    );

    if (match.is_bye && match.winner_player_1_id) {
      updatePromises.push(
        supabase
          .from('playoff_matches')
          .update(
            nextMatchTeam === 'A'
              ? {
                  team_a_seed: match.team_a_seed,
                  team_a_player_1_id: match.winner_player_1_id,
                  team_a_player_2_id: match.winner_player_2_id,
                }
              : {
                  team_b_seed: match.team_a_seed,
                  team_b_player_1_id: match.winner_player_1_id,
                  team_b_player_2_id: match.winner_player_2_id,
                }
          )
          .eq('id', nextMatch.id)
      );
    }
  }

  const updateResults = await Promise.all(updatePromises);
  const failedUpdate = updateResults.find((result) => result.error);

  if (failedUpdate?.error) {
    setMessage(`Bracket generated, but linking failed: ${failedUpdate.error.message}`);
    await loadTournamentData(userId);
    return;
  }

  const { error: tournamentError } = await supabase
    .from('tournaments')
    .update({ playoff_status: 'started' })
    .eq('id', tournament.id);

  if (tournamentError) {
    setMessage(`Could not update playoff status: ${tournamentError.message}`);
    return;
  }

  await loadTournamentData(userId);
  setMessage('Playoff bracket generated.');
}

  async function rematchTournament() {
    if (!tournament) return;
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setMessage('Sign in first.');
      return;
    }

    setIsRematching(true);
    setMessage('');
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      const organizerName =
        profile?.display_name?.trim() ||
        user.email?.split('@')[0] ||
        tournament.organizer_name ||
        'Organizer';

      const rematchTitle = tournament.title.toLowerCase().includes('rematch')
        ? tournament.title
        : `${tournament.title} Rematch`;

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
        })
        .select()
        .single();

      if (tournamentError || !newTournament) {
        setMessage(tournamentError?.message || 'Could not create rematch tournament.');
        setIsRematching(false);
        return;
      }

      const playerRows = Array.from({ length: tournament.player_count }, (_, index) => {
        const oldSlot = playerSlots[index];
        return {
          tournament_id: newTournament.id,
          slot_number: index + 1,
          display_name: oldSlot?.display_name?.trim() || '',
          claimed_by_user_id: null,
        };
      });

      const { error: playersError } = await supabase
        .from('tournament_players')
        .insert(playerRows);

      if (playersError) {
        setMessage(playersError.message);
        setIsRematching(false);
        return;
      }

      try {
        window.localStorage.setItem(
          LAST_TOURNAMENT_KEY,
          JSON.stringify({ id: newTournament.id, title: newTournament.title })
        );
      } catch {}

      window.location.href = `/tournament/${newTournament.id}`;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create rematch tournament.');
      setIsRematching(false);
    }
  }

  function setDraftScore(matchId: string, field: keyof ScoreDraft, value: string) {
    if (isCompleted) return;

    const match = matches.find((m) => m.id === matchId);
    if (match?.is_complete) {
      setMessage('This match is locked. Reopen it before editing.');
      return;
    }
    
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
    if (!canReportScores) return;
    const match = matches.find((m) => m.id === matchId);
    if (match?.is_complete) return;
    const draft = scoreDrafts[matchId];
    if (!draft) return;
    const rawValue = draft[field];
    const numeric =
      rawValue.trim() === '' || Number.isNaN(Number(rawValue))
        ? null
        : Math.max(0, Number(rawValue));

    const { error } = await supabase.from('matches').update({ [field]: numeric }).eq('id', matchId);
    if (error) {
      setMessage(`Score save failed: ${error.message}`);
      return;
    }
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
    const roundNumbers = Array.from(new Set(updatedMatches.map((m) => m.round_number))).sort(
      (a, b) => a - b
    );
    for (const round of roundNumbers) {
      const roundMatches = updatedMatches.filter((m) => m.round_number === round && !m.is_bye);
      if (!roundMatches.length) continue;
      if (!roundMatches.every((m) => m.is_complete)) return round;
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

  async function deleteTournament() {
    if (!tournament || !isOrganizer || isCompleted || hasAnyScores) {
  setMessage('You can only delete a tournament before any scores are submitted.');
  return;
}
    const confirmed = window.confirm(
      'Are you sure you want to delete this tournament? This cannot be undone.'
    );
    if (!confirmed) return;
      setIsDeletingTournament(true);
    setMessage('');

const { error: matchesError } = await supabase
  .from('matches')
  .delete()
  .eq('tournament_id', tournament.id);

if (matchesError) {
  setMessage(`Delete failed: ${matchesError.message}`);
  setIsDeletingTournament(false);
  return;
}

    const { error: playersError } = await supabase
      .from('tournament_players')
      .delete()
      .eq('tournament_id', tournament.id);
    if (playersError) {
      setMessage(`Delete failed: ${playersError.message}`);
      setIsDeletingTournament(false);
      return;
    }

    const { error: tournamentError } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournament.id);
    if (tournamentError) {
      setMessage(`Delete failed: ${tournamentError.message}`);
      setIsDeletingTournament(false);
      return;
    }

    try {
      const saved = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id === tournament.id) window.localStorage.removeItem(LAST_TOURNAMENT_KEY);
      }
    } catch {}
    
    setIsDeletingTournament(false);
    router.push('/my-tournaments');
  }

  async function submitGame(matchId: string, game: 1 | 2 | 3) {
   if (isCompleted) {
  setMessage('Final results are locked.');
  return;
}

  const lockedMatch = matches.find((m) => m.id === matchId);
  if (lockedMatch?.is_complete) {
    setMessage('This match is locked. Reopen it before editing.');
    return;
  }

if (!canReportScores) {
  setMessage('Scores are locked for this tournament.');
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

    const optimisticMatchWithSubmittedGame: Match = {
      ...currentMatch,
      [`game_${game}_a`]: aNum,
      [`game_${game}_b`]: bNum,
    };

    const optimisticMatch = clearGame3IfSeriesDecidedInTwo(
      optimisticMatchWithSubmittedGame
    );

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

    const updateData: Record<string, number | boolean | null> = {
      [`game_${game}_a`]: aNum,
      [`game_${game}_b`]: bNum,
    };

    if (seriesNowComplete) {
      const { aScore, bScore } = getSeriesScore(optimisticMatch);
      updateData.team_a_score = aScore;
      updateData.team_b_score = bScore;
      updateData.is_complete = true;

      if (!needsGame3(optimisticMatch)) {
        updateData.game_3_a = null;
        updateData.game_3_b = null;
      }
    }

    const { error } = await supabase.from('matches').update(updateData).eq('id', matchId);

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
  async function submitPlayoffScore(matchId: string) {
  if (!tournament) return;

  if (!isOrganizer) {
    setMessage('Only the organizer can submit playoff scores.');
    return;
  }

  const match = playoffMatches.find((m) => m.id === matchId);
  if (!match) return;

  if (match.is_complete) {
    setMessage('This playoff match is already complete.');
    return;
  }

  if (!match.team_a_player_1_id || !match.team_b_player_1_id) {
    setMessage('Both playoff teams must be set before submitting a score.');
    return;
  }

  const draft = playoffScoreDrafts[matchId];

  const aRaw =
    draft?.team_a_score ??
    (match.team_a_score === null ? '' : String(match.team_a_score));

  const bRaw =
    draft?.team_b_score ??
    (match.team_b_score === null ? '' : String(match.team_b_score));

  if (aRaw.trim() === '' || bRaw.trim() === '') {
    setMessage('Enter both playoff scores before submitting.');
    return;
  }

  const aScore = Math.max(0, Number(aRaw));
  const bScore = Math.max(0, Number(bRaw));

  if (Number.isNaN(aScore) || Number.isNaN(bScore)) {
    setMessage('Playoff scores must be valid numbers.');
    return;
  }

  if (aScore === bScore) {
    setMessage('A playoff match cannot end in a tie.');
    return;
  }

  const teamAWins = aScore > bScore;

  const winnerPlayer1Id = teamAWins
    ? match.team_a_player_1_id
    : match.team_b_player_1_id;

  const winnerPlayer2Id = teamAWins
    ? match.team_a_player_2_id
    : match.team_b_player_2_id;

  const winnerSeed = teamAWins ? match.team_a_seed : match.team_b_seed;
  const winnerTeam = teamAWins ? 'A' : 'B';

  setMessage('Submitting playoff score...');

  const { error: matchError } = await supabase
    .from('playoff_matches')
    .update({
      team_a_score: aScore,
      team_b_score: bScore,
      winner_team: winnerTeam,
      winner_player_1_id: winnerPlayer1Id,
      winner_player_2_id: winnerPlayer2Id,
      is_complete: true,
    })
    .eq('id', match.id);

  if (matchError) {
    setMessage(`Playoff score failed: ${matchError.message}`);
    return;
  }

  if (match.next_match_id && match.next_match_team) {
    const nextUpdate =
      match.next_match_team === 'A'
        ? {
            team_a_seed: winnerSeed,
            team_a_player_1_id: winnerPlayer1Id,
            team_a_player_2_id: winnerPlayer2Id,
          }
        : {
            team_b_seed: winnerSeed,
            team_b_player_1_id: winnerPlayer1Id,
            team_b_player_2_id: winnerPlayer2Id,
          };

    const { error: nextError } = await supabase
      .from('playoff_matches')
      .update(nextUpdate)
      .eq('id', match.next_match_id);

    if (nextError) {
      setMessage(`Winner saved, but advance failed: ${nextError.message}`);
      await loadTournamentData(userId);
      return;
    }

    await loadTournamentData(userId);
    setMessage('Playoff score submitted. Winner advanced.');
    return;
  }

  const { error: tournamentError } = await supabase
    .from('tournaments')
    .update({
      playoff_status: 'completed',
      champion_player_1_id: winnerPlayer1Id,
      champion_player_2_id: winnerPlayer2Id,
      status: 'completed',
    })
    .eq('id', tournament.id);

  if (tournamentError) {
    setMessage(`Champion saved, but tournament update failed: ${tournamentError.message}`);
    await loadTournamentData(userId);
    return;
  }

  await loadTournamentData(userId);
  setMessage('🏆 Championship complete. Winner crowned!');
}
  async function submitMatchScore(matchId: string) {
  if (isCompleted) {
    setMessage('Final results are locked.');
    return;
  }

  const lockedMatch = matches.find((m) => m.id === matchId);
  if (lockedMatch?.is_complete) {
    setMessage('This match is locked. Reopen it before editing.');
    return;
  }

  if (!canReportScores) {
    setMessage('Scores are locked for this tournament.');
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

  const existingMatch = matches.find((m) => m.id === matchId);
  const isEditingCompletedMatch = !!existingMatch?.is_complete;

  const previousMatches = matches;

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
setMatches(optimisticMatches);

setScoreDrafts(() => {
  const next: Record<string, ScoreDraft> = {};

  for (const match of optimisticMatches) {
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

setStandings(computeStandings(playerSlots, optimisticMatches, isSingles, isBestOf3));

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

  const { error } = await supabase
    .from('matches')
    .update({
      team_a_score: aNum,
      team_b_score: bNum,
      is_complete: true,
    })
    .eq('id', matchId);

  if (error) {
    setMatches(previousMatches);
    setStandings(computeStandings(playerSlots, previousMatches, isSingles, isBestOf3));
    setMessage(`Submit failed: ${error.message}`);
    return;
  }

  const statsSaved = await upsertPlayerMatchStats(completedMatch, aNum, bNum);

  if (isEditingCompletedMatch) {
    await loadTournamentData(userId);
    setMessage(
  statsSaved
    ? 'Score updated successfully.'
    : 'Score updated, but stats update failed.'
);
    return;
  }

  if (!nextRound) {
    if (tournament?.tournament_mode === 'cream_of_the_crop') {
      const finalMatches = optimisticMatches.filter(
        (m) => m.round_number >= 7 && m.round_number <= 9 && !m.is_bye
      );

      const finalComplete =
        finalMatches.length > 0 &&
        finalMatches.every((m) => m.is_complete);

      if (!finalComplete) {
        setSelectedRound(submittedRound);
        setActiveTab('rounds');
        setMessage(
          statsSaved
            ? 'Stage complete. Generate the next Cream of the Crop round.'
            : 'Stage complete. Generate the next Cream of the Crop round. Stats update failed.'
        );
        return;
      }

      const completed = await markTournamentCompleted();
      if (!completed) return;

      setSelectedRound(finalRound);
      setActiveTab('standings');

      setMessage(
        statsSaved
          ? 'Final Round complete. Tournament finished.'
          : 'Final Round complete. Tournament finished, but stats update failed.'
      );
      return;
    }

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
    setSelectedRound(nextRound);
    setActiveTab('rounds');
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

  async function reopenMatch(matchId: string) {
  if (!isOrganizer) {
    setMessage('Only the organizer can reopen matches.');
    return;
  }

  if (isCompleted) {
    setMessage('Final results are locked.');
    return;
  }

  const match = matches.find((m) => m.id === matchId);

  if (!match) {
    setMessage('Match not found.');
    return;
  }

  if (!match.is_complete) {
    setMessage('This match is already open.');
    return;
  }

  const previousMatches = matches;

  const optimisticMatches = matches.map((m) =>
    m.id === matchId ? { ...m, is_complete: false } : m
  );

  setMatches(optimisticMatches);
  setStandings(computeStandings(playerSlots, optimisticMatches, isSingles, isBestOf3));
  setMessage('Reopening match...');

  const { error } = await supabase
    .from('matches')
    .update({ is_complete: false })
    .eq('id', matchId);

  if (error) {
    setMatches(previousMatches);
    setStandings(computeStandings(playerSlots, previousMatches, isSingles, isBestOf3));
    setMessage(`Reopen failed: ${error.message}`);
    return;
  }

  await loadTournamentData(userId);
  setMessage('Match reopened. You can now edit the score.');
}

  function renderPlayerName(id: string | null) {
    if (!id) return '-';
    return playersById[id]?.display_name || 'Player';
  }

  function renderTeam(a: string | null, b: string | null) {
    if (isSingles) return renderPlayerName(a);
    return `${renderPlayerName(a)} & ${renderPlayerName(b)}`;
  }

  function getMatchElementId(matchId: string) {
    return `live-match-${matchId}`;
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
    function renderGameScoreboard(
  gameLabel: string,
  aValue: string,
  bValue: string,
  aField: keyof ScoreDraft,
  bField: keyof ScoreDraft,
  gameNumber: 1 | 2 | 3,
  gameDone: boolean,
  gameDisabled: boolean
) {
  const aScoreNumber = Number(aValue);
  const bScoreNumber = Number(bValue);
  const hasBothScores = aValue !== '' && bValue !== '' && !Number.isNaN(aScoreNumber) && !Number.isNaN(bScoreNumber);
  const aIsWinner = hasBothScores && aScoreNumber > bScoreNumber;
  const bIsWinner = hasBothScores && bScoreNumber > aScoreNumber;

  return (
    <div
      className="list-item"
      style={{
        padding: 14,
        borderRadius: 18,
        marginBottom: 12,
        background: 'rgba(255,255,255,0.035)',
        border: gameDone
          ? '1px solid rgba(255,203,5,0.22)'
          : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: gameDone ? '#FFCB05' : 'rgba(255,255,255,0.62)',
          marginBottom: 10,
        }}
      >
        {gameLabel}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 88px',
            gap: 10,
            alignItems: 'center',
            padding: 10,
            borderRadius: 14,
            background: aIsWinner ? 'rgba(255,203,5,0.10)' : 'rgba(0,0,0,0.14)',
            border: aIsWinner ? '1px solid rgba(255,203,5,0.30)' : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.48)', marginBottom: 3 }}>
              TEAM A
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.2, color: aIsWinner ? '#FFCB05' : '#fff' }}>
              {teamAName}
            </div>
          </div>

          <input
  className="input"
  style={{
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 900,
    padding: '10px 6px',
    opacity: match.is_complete ? 0.65 : 1,
    cursor: match.is_complete ? 'not-allowed' : 'text',
  }}
  type="number"
  inputMode="numeric"
  pattern="[0-9]*"
  value={aValue}
  disabled={gameDisabled}
  onFocus={(e) => e.currentTarget.select()}
  onChange={(e) => setDraftScore(match.id, aField, e.target.value)}
  placeholder="0"
/>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 88px',
            gap: 10,
            alignItems: 'center',
            padding: 10,
            borderRadius: 14,
            background: bIsWinner ? 'rgba(255,203,5,0.10)' : 'rgba(0,0,0,0.14)',
            border: bIsWinner ? '1px solid rgba(255,203,5,0.30)' : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.48)', marginBottom: 3 }}>
              TEAM B
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.2, color: bIsWinner ? '#FFCB05' : '#fff' }}>
              {teamBName}
            </div>
          </div>

          <input
  className="input"
  style={{
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 900,
    padding: '10px 6px',
    opacity: match.is_complete ? 0.65 : 1,
    cursor: match.is_complete ? 'not-allowed' : 'text',
  }}
  type="number"
  inputMode="numeric"
  pattern="[0-9]*"
  value={bValue}
  disabled={gameDisabled}
  onFocus={(e) => e.currentTarget.select()}
  onChange={(e) => setDraftScore(match.id, bField, e.target.value)}
  placeholder="0"
/>
        </div>
      </div>

      {!gameDone && !seriesComplete && !isCompleted ? (
        <button
          className="button primary"
          onClick={() => submitGame(match.id, gameNumber)}
          disabled={!canReportScores}
          style={{
            width: '100%',
            fontWeight: 900,
            fontSize: 16,
            padding: '14px 16px',
            marginTop: 10,
          }}
        >
          {canReportScores ? `Submit ${gameLabel}` : 'Scores Locked'}
        </button>
      ) : hasBothScores ? (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(255,203,5,0.08)',
            border: '1px solid rgba(255,203,5,0.20)',
            fontWeight: 900,
            color: '#FFCB05',
            textAlign: 'center',
          }}
        >
          Winner: {aIsWinner ? teamAName : teamBName}
        </div>
      ) : null}
    </div>
  );
}
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
        <div className="row-between" style={{ marginBottom: 12, alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.6)',
                marginBottom: 4,
              }}
            >
              Court
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                lineHeight: 1.1,
              }}
            >
              {getCourtLabel(tournament, match.court_number) || '-'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isNextUp ? (
              <span
                className="tag"
                style={{
                  background: 'rgba(255,203,5,0.14)',
                  border: '1px solid rgba(255,203,5,0.35)',
                  color: '#FFCB05',
                  fontWeight: 800,
                }}
              >
                NEXT UP
              </span>
            ) : null}

            <span
  className={match.is_complete ? 'tag green' : 'tag'}
  style={!match.is_complete ? { fontWeight: 800 } : undefined}
>
  {match.is_complete ? 'COMPLETE' : 'LIVE'}
</span>

{canManageScores && match.is_complete && !isCompleted ? (
  <button
  type="button"
  className="button secondary"
  onClick={() => reopenMatch(match.id)}
  style={{
    width: '100%',
    fontWeight: 900,
    fontSize: 16,
    padding: '14px 16px',
    borderColor: 'rgba(255,203,5,0.6)',
    background: 'rgba(255,203,5,0.08)',
    boxShadow: '0 0 0 1px rgba(255,203,5,0.2) inset',
  }}
>
  🔓 Reopen Match to Edit Scores
</button>
) : null}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 12,
              ...getWinnerStyle('a', match),
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.6)',
                marginBottom: 6,
              }}
            >
              Team A
            </div>

            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                lineHeight: 1.25,
                whiteSpace: 'pre-line',
              }}
            >
              {teamAName}
            </div>
          </div>

          <div
            style={{
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            VS
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 12,
              ...getWinnerStyle('b', match),
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.6)',
                marginBottom: 6,
              }}
            >
              Team B
            </div>

            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                lineHeight: 1.25,
                whiteSpace: 'pre-line',
              }}
            >
              {teamBName}
            </div>
          </div>
        </div>

        {renderGameScoreboard(
  'Game 1',
  draft.game_1_a,
  draft.game_1_b,
  'game_1_a',
  'game_1_b',
  1,
  game1Done,
  game1Done || seriesComplete || isCompleted
)}

{renderGameScoreboard(
  'Game 2',
  draft.game_2_a,
  draft.game_2_b,
  'game_2_a',
  'game_2_b',
  2,
  game2Done,
  !game1Done || game2Done || seriesComplete || isCompleted
)}

{showGame3 || (game1Done && game2Done && match.game_3_a !== null) ? (
  renderGameScoreboard(
    'Game 3',
    draft.game_3_a,
    draft.game_3_b,
    'game_3_a',
    'game_3_b',
    3,
    match.game_3_a !== null && match.game_3_b !== null,
    match.game_3_a !== null || seriesComplete || isCompleted
  )
) : game1Done && game2Done && !seriesComplete ? (
  <div
    className="list-item"
    style={{
      padding: 12,
      textAlign: 'center',
      border: '1px solid rgba(255,203,5,0.25)',
      background: 'rgba(255,203,5,0.08)',
    }}
  >
    <div style={{ fontWeight: 900, color: '#FFCB05' }}>
      {aWins > bWins ? teamAName : teamBName} wins the series 2-0!
    </div>
  </div>
) : null}

        {seriesComplete ? (
  <div className="list-item" style={{ padding: 10, textAlign: 'center', marginTop: 8 }}>
    <div style={{ fontWeight: 800, color: '#FFCB05', marginBottom: 10 }}>
      {aWins > bWins ? teamAName : teamBName} wins {aWins}-{bWins}!
    </div>

    {isOrganizer && !isCompleted ? (
      <button
  type="button"
  className="button secondary"
  onClick={() => reopenMatch(match.id)}
  style={{
    width: '100%',
    fontWeight: 900,
    fontSize: 16,
    padding: '14px 16px',
    borderColor: 'rgba(255,203,5,0.6)',
    background: 'rgba(255,203,5,0.08)',
    boxShadow: '0 0 0 1px rgba(255,203,5,0.2) inset',
  }}
>
  🔓 Reopen Match to Edit Scores
</button>
    ) : null}
  </div>
) : null}
      </div>
    );
  }

  return (
    <main className="page-shell">
      <TopNav />

      {isStarted && yourMatch && (
  <div
    id="your-match-card"
    className="card"
    style={{
      position: 'sticky',
      top: 10,
      zIndex: 20,
      border: '1px solid rgba(255,203,5,0.72)',
      background:
        'linear-gradient(180deg, rgba(255,203,5,0.18), rgba(255,203,5,0.07))',
      boxShadow: '0 18px 44px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,203,5,0.16) inset',
      marginBottom: 14,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 950,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#FFCB05',
        }}
      >
        Your Match
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 950,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: '#001830',
          background: '#FFCB05',
          borderRadius: 999,
          padding: '6px 10px',
          whiteSpace: 'nowrap',
        }}
      >
        Go Now
      </div>
    </div>

    <div
      style={{
        fontSize: 26,
        fontWeight: 950,
        lineHeight: 1,
        color: '#ffffff',
        marginBottom: 10,
      }}
    >
      {getCourtLabel(tournament, yourMatch.court_number)}
    </div>

    <div
      style={{
        fontSize: 15,
        fontWeight: 800,
        lineHeight: 1.35,
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 12,
      }}
    >
      {renderTeam(yourMatch.team_a_player_1_id, yourMatch.team_a_player_2_id)}
      {' vs '}
      {renderTeam(yourMatch.team_b_player_1_id, yourMatch.team_b_player_2_id)}
    </div>

    <button
      type="button"
      className="button primary"
      style={{
        width: '100%',
        minHeight: 46,
        fontWeight: 950,
      }}
      onClick={() => {
        setActiveTab('rounds');
        setSelectedRound(yourMatch.round_number);

        setTimeout(() => {
          document
            .getElementById(getMatchElementId(yourMatch.id))
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }}
    >
      Open Scorecard
    </button>
  </div>
)}

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          className={`button ${activeTab === 'players' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('players')}
        >
          Players
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'rounds' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('rounds')}
        >
          Rounds
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'standings' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveTab('standings')}
        >
          Standings
        </button>
      </div>

      {activeTab === 'players' && (
        <>
{isOrganizer ? (
  <div className="card" style={{ marginBottom: 14 }}>
    <div className="card-title">Invite Players</div>

    <div className="grid">
      <button type="button" className="button secondary" onClick={copyJoinCode}>
        {copied ? 'Join Code Copied' : 'Copy Join Code'}
      </button>

      <button type="button" className="button primary" onClick={shareJoinLink}>
        Share Join Link
      </button>
    </div>
  </div>
) : null}

<div className="card" style={{ marginBottom: 14 }}>
  <div className="card-title">Players</div>
  <div className="card-subtitle">
    {isCompleted
      ? 'Tournament is complete. Player list is locked.'
      : isStarted
      ? 'Tournament has started. Player list is locked.'
      : isSingles
      ? 'Singles tournament — each player competes individually.'
      : 'Players can claim a spot, or the organizer can type names manually.'}
  </div>

  {isLoading ? (
  <div className="muted">Loading player spots...</div>
) : (
  <div className="grid">
    {tournament?.format === 'doubles' && tournament?.doubles_mode === 'fixed' ? (
      <div style={{ display: 'grid', gap: 16 }}>
        {Array.from({ length: Math.ceil(playerSlots.length / 2) }).map((_, teamIndex) => {
          const player1 = playerSlots[teamIndex * 2];
          const player2 = playerSlots[teamIndex * 2 + 1];

          if (!player1 || !player2) return null;

          return (
            <div
              key={`team-${teamIndex}`}
              className="card"
              style={{
                padding: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  fontWeight: 800,
                  marginBottom: 10,
                  color: '#FFCB05',
                  letterSpacing: 0.5,
                }}
              >
                Team {teamIndex + 1}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                {[player1, player2].map((slot) => (
                  <div key={slot.id}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 6,
                        opacity: 0.7,
                      }}
                    >
                      Player {slot.slot_number}
                    </div>

                    <input
                      className="input"
                      value={
                        (newNames[slot.id] ?? '').trim() !== ''
                          ? newNames[slot.id]
                          : slot.display_name ?? ''
                      }
                      onChange={(e) =>
                        setNewNames((prev) => ({
                          ...prev,
                          [slot.id]: e.target.value,
                        }))
                      }
                      placeholder={`Player ${slot.slot_number}`}
                      disabled={isLocked && !isOrganizer}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      playerSlots.map((slot) => {
        const isMine = slot.claimed_by_user_id === userId;
        const isClaimedBySomeone = !!slot.claimed_by_user_id;
        const canClaim = !isClaimedBySomeone && !claimedSlot && !isLocked;
        const firstOpenSlot = playerSlots.find((player) => !player.claimed_by_user_id);
        const isFirstOpenSlot = firstOpenSlot?.id === slot.id;
        const canEditName = !isLocked && (isOrganizer || isMine || !isClaimedBySomeone);

        return (
          <div
            key={slot.id}
            className="list-item"
            onClick={() =>
              setEditingSlot(editingSlot === slot.id ? null : slot.id)
            }
            style={{
              borderColor:
                editingSlot === slot.id
                  ? 'rgba(255,203,5,0.7)'
                  : canClaim && isFirstOpenSlot
                  ? 'rgba(255,203,5,0.6)'
                  : isMine
                  ? 'rgba(255,203,5,0.45)'
                  : undefined,

              boxShadow:
                editingSlot === slot.id
                  ? '0 0 0 2px rgba(255,203,5,0.25), 0 8px 24px rgba(0,0,0,0.35)'
                  : canClaim && isFirstOpenSlot
                  ? '0 0 0 2px rgba(255,203,5,0.18), 0 6px 20px rgba(0,0,0,0.3)'
                  : isMine
                  ? '0 0 0 1px rgba(255,203,5,0.18) inset'
                  : undefined,

              background:
                editingSlot === slot.id
                  ? 'rgba(255,255,255,0.06)'
                  : canClaim && isFirstOpenSlot
                  ? 'rgba(255,203,5,0.06)'
                  : undefined,

              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr 110px',
                alignItems: 'center',
                marginBottom: 10,
                padding: '0 4px',
              }}
            >
              <div style={{ fontWeight: 800 }}>
                Player {slot.slot_number}
              </div>

              <div
                style={{
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: 16,
                }}
              >
                <div>{slot.display_name || 'Open'}</div>

                {canClaim && isFirstOpenSlot ? (
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#ffcb05',
                      letterSpacing: '0.02em',
                    }}
                  >
                    Tap to Join
                  </div>
                ) : null}
              </div>

              <div style={{ width: 110, display: 'flex', justifyContent: 'flex-end' }}>
                {isMine ? (
                  <span className="tag yours">Yours</span>
                ) : isClaimedBySomeone ? (
                  <span className="tag">Claimed</span>
                ) : isLocked ? (
                  <span className="tag">Locked</span>
                ) : canClaim && isFirstOpenSlot ? (
                  <button
                    type="button"
                    className={`button primary ${isFirstOpenSlot ? 'claim-pulse' : ''}`}
                    style={{
                      minHeight: 40,
                      padding: '8px 16px',
                      fontSize: 14,
                      fontWeight: 800,
                      borderRadius: 999,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      claimSlot(slot.id);
                    }}
                  >
                    Join Game
                  </button>
                ) : (
                  <span className="tag">Open</span>
                )}
              </div>
            </div>

            {isMine && !isLocked ? (
              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                Need to give up your spot? Ask the organizer to clear it.
              </div>
            ) : null}

            {editingSlot === slot.id ? (
              <div
                className="grid"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  className="input"
                  value={
                    (newNames[slot.id] ?? '').trim() !== ''
                      ? newNames[slot.id]
                      : slot.display_name ?? ''
                  }
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
                  <button
                    className="button primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      claimSlot(slot.id);
                    }}
                  >
                    Claim Spot
                  </button>
                ) : null}

                {isOrganizer && !isLocked && (slot.display_name || slot.claimed_by_user_id) ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => clearPlayerSlot(slot.id)}
                    style={{
                      borderColor: 'rgba(255,80,80,0.35)',
                      background: 'rgba(255,80,80,0.10)',
                      color: '#ff9b9b',
                      fontWeight: 800,
                    }}
                  >
                    Clear Player
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })
    )}
  </div>
)}

<?div>  

<div className="card" style={{ marginTop: 16, marginBottom: 14 }}>
  <div className="card-title">Tournament Controls</div>
  <div className="card-subtitle">
    Save names first, then start the tournament when everyone is ready.
  </div>

  <div className="grid">
    {!isLocked ? (
      <button
        className="button secondary"
        onClick={saveAllPlayerNames}
        disabled={isSavingNames}
      >
        {isSavingNames ? 'Saving...' : 'Save Player Names'}
      </button>
    ) : null}

    {canManageScores ? (
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

        {isOrganizer ? (
          <div className="card" style={{ marginTop: 14 }}>
  <div className="card-title">Co-Organizer</div>
  <div className="card-subtitle">
    Add one trusted person who can submit and edit scores.
  </div>
        
  {savedCoOrganizers.length ? (
    <select
      className="input"
      value={selectedSavedCoOrganizerId}
      onChange={(e) => {
        const selectedId = e.target.value;
        setSelectedSavedCoOrganizerId(selectedId);

        const selected = savedCoOrganizers.find((item) => item.id === selectedId);
        if (selected) {
          setTournament((prev) =>
            prev ? { ...prev, co_organizer_email: selected.email } : prev
          );
          setSavedCoOrganizerName(selected.name || selected.email);
        }
      }}
      style={{ marginTop: 10 }}
    >
      <option value="">Choose saved co-organizer...</option>
      {savedCoOrganizers.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name || item.email}
        </option>
      ))}
    </select>
  ) : null}

  <input
    className="input"
    type="email"
    value={tournament?.co_organizer_email || ''}
    onChange={(e) => {
      setTournament((prev) =>
        prev ? { ...prev, co_organizer_email: e.target.value } : prev
      );
      setSelectedSavedCoOrganizerId('');
    }}
    placeholder="coorganizer@email.com"
    style={{ marginTop: 10 }}
  />

  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
      fontSize: 13,
      fontWeight: 700,
    }}
  >
    <input
      type="checkbox"
      checked={saveCoOrganizerForLater}
      onChange={(e) => setSaveCoOrganizerForLater(e.target.checked)}
    />
    Save this co-organizer for next time
  </label>

  {saveCoOrganizerForLater ? (
    <input
      className="input"
      value={savedCoOrganizerName}
      onChange={(e) => setSavedCoOrganizerName(e.target.value)}
      placeholder="Name, like Jordan or Assistant Coach"
      style={{ marginTop: 10 }}
    />
  ) : null}

  <button
    type="button"
    className="button secondary"
    onClick={async () => {
      if (!tournament) return;

      const cleanEmail = tournament.co_organizer_email?.trim() || '';

      const { error } = await supabase
        .from('tournaments')
        .update({
          co_organizer_email: cleanEmail || null,
        })
        .eq('id', tournament.id);

      if (error) {
        setMessage(`Co-organizer save failed: ${error.message}`);
        return;
      }

      if (saveCoOrganizerForLater && cleanEmail) {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;

        if (user) {
          await supabase.from('saved_co_organizers').upsert(
            {
              user_id: user.id,
              name: savedCoOrganizerName.trim() || cleanEmail,
              email: cleanEmail,
            },
            { onConflict: 'user_id,email' }
          );

          const { data: savedAdmins } = await supabase
            .from('saved_co_organizers')
            .select('id, name, email')
            .eq('user_id', user.id)
            .order('name', { ascending: true });

          setSavedCoOrganizers(savedAdmins || []);
        }
      }

      setMessage('Co-organizer saved.');
      await loadTournamentData(userId);
    }}
    style={{ marginTop: 10 }}
  >
    Save Co-Organizer
  </button>

<button
  type="button"
  className="button secondary"
  onClick={async () => {
    if (!tournament) return;

    const link = getTournamentLink(tournament.id);

    const message = `You’ve been added as a co-organizer for a DinkDraw tournament.

Use this link to access it:
${link}

Sign in with this same email address to submit and edit scores.`;

    try {
      await navigator.clipboard.writeText(message);
      setMessage('Invite message copied.');
    } catch {
      setMessage('Could not copy invite message.');
    }
  }}
  style={{ marginTop: 10 }}
>
  Copy Invite Message
</button>         
</div>
) : null}

        {!isCompleted && !hasAnyScores ? (
          <button
            type="button"
            className="button secondary"
            onClick={deleteTournament}
            disabled={isDeletingTournament}
            style={{
              width: '100%',
              marginTop: 10,
              borderColor: 'rgba(255,80,80,0.35)',
              background: 'rgba(255,80,80,0.10)',
              color: '#ff9b9b',
              fontWeight: 800,
            }}
          >
            {isDeletingTournament ? 'Deleting...' : 'Delete Tournament'}
          </button>
        ) : null}
      </>
    ) : null}
  </div>
</div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Tournament Info</div>
            <div className="grid" style={{ marginBottom: 14 }}>
              <div className="list-item">
                <div className="label">Join Code</div>
                <div className="row-between">
                  <strong style={{ letterSpacing: '0.08em' }}>{tournament?.join_code || '...'}</strong>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className={isLive ? 'tag green' : 'tag'}>
                      {isLive ? 'Live' : 'Connecting'}
                    </span>
                    <span className="tag">{isSingles ? 'Singles' : 'Doubles'}</span>
                    <span className="tag">{isBestOf3 ? 'Best of 3' : 'Single Game'}</span>
                  </div>
                </div>
              </div>

              <div className="list-item">
                <div className="row-between">
                  <span className="muted">Organizer</span>
                  <strong>{tournament?.organizer_name || '-'}</strong>
                </div>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="muted">Status</span>
                  <strong>{isCompleted ? 'Completed' : isStarted ? 'Started' : 'Setup'}</strong>
                </div>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="muted">Progress</span>
                  <strong>
                    {completedMatchCount}/{totalPlayableMatchCount} matches
                  </strong>
                </div>
              </div>

              <div className="list-item">
                <div className="row-between">
                  <span className="muted">Date</span>
                  <strong>{tournament?.event_date || '-'}</strong>
                </div>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="muted">Time</span>
                  <strong>{tournament?.event_time || '-'}</strong>
                </div>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="muted">Location</span>
                  <strong style={{ textAlign: 'right' }}>{tournament?.location || '-'}</strong>
                </div>
              </div>
            </div>

            {isOrganizer ? (
              <div className="grid">
               {isCompleted ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={rematchTournament}
                    disabled={isRematching}
                  >
                    {isRematching ? 'Creating Rematch...' : 'Rematch Tournament'}
                  </button>
                ) : null}
                {isCompleted ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => router.push(`/tournament/${params.id}/results`)}
                    style={{ fontWeight: 800, fontSize: 16 }}
                  >
                    🏆 View Results
                  </button>
                ) : null}
                {!isCompleted && !hasAnyScores ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={deleteTournament}
                    style={{ borderColor: 'rgba(248,113,113,.4)', color: '#f87171' }}
                  >
                    Delete Tournament
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {isOrganizer && publicViewUrl ? (
            <div className="card" style={{ marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setShowSharingTools((prev) => !prev)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div className="row-between" style={{ alignItems: 'center', gap: 12 }}>
                  <div>
                    <div className="card-title" style={{ marginBottom: 4 }}>
                      Sharing & Public View
                    </div>
                    <div className="card-subtitle" style={{ marginBottom: 0 }}>
                      QR code, public link, and spectator sharing tools
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: '#FFCB05',
                      lineHeight: 1,
                    }}
                  >
                    {showSharingTools ? '−' : '+'}
                  </div>
                </div>
              </button>

              {showSharingTools ? (
                <div style={{ marginTop: 14, textAlign: 'center' }}>
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
            </div>
          ) : null}
        </>
      )}

      {activeTab === 'rounds' && (
  <>

    {(
  isOrganizer &&
  tournament?.playoff_format !== 'none' &&
  (isStarted || isCompleted) &&
  matches.length > 0 &&
  matches.every((m) => m.is_bye || m.is_complete) &&
  playoffRounds.length === 0
) ? (
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Playoff Bracket</div>
        <div className="card-subtitle">
          Round robin is complete. Generate the seeded playoff bracket.
        </div>

        <button
          className="button primary"
          onClick={generatePlayoffBracket}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: 16,
            fontWeight: 900,
            borderRadius: 12,
          }}
        >
          Generate Playoff Bracket
        </button>
      </div>
    ) : null}
        <div className="card">
          {isStarted && !isCompleted ? (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 10,
                background: 'rgba(255, 203, 5, 0.08)',
                border: '1px solid rgba(255, 203, 5, 0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#FFCB05',
                  letterSpacing: 1,
                }}
              >
                CURRENT ROUND
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  marginTop: 2,
                }}
              >
                Round {currentRound}
              </div>
            </div>
          ) : null}

          {isOrganizer && isStarted && !isCompleted ? (
  <div style={{ marginBottom: 12 }}>
    <button
      type="button"
      className="button secondary"
      onClick={endTournamentEarly}
      disabled={isEndingEarly}
      style={{
        width: '100%',
        borderColor: 'rgba(255,80,80,0.35)',
        background: 'rgba(255,80,80,0.10)',
        color: '#ff9b9b',
        fontWeight: 800,
      }}
    >
      {isEndingEarly ? 'Ending Tournament...' : 'End Tournament Early'}
    </button>
  </div>
) : null}

          {tournament?.tournament_mode === 'cream_of_the_crop' && (
  <div style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
    {!matches.some((m) => m.round_number >= 4 && m.round_number <= 6 && !m.is_bye) && (
      <button
        className="button primary"
        onClick={handleGenerateSiftRound}
      >
        Generate Re-Rank Round
      </button>
    )}

    {matches.some((m) => m.round_number >= 4 && m.round_number <= 6 && !m.is_bye) &&
      !matches.some((m) => m.round_number >= 7 && m.round_number <= 9 && !m.is_bye) && (
        <button
          className="button primary"
          onClick={handleGenerateFinalRound}
        >
          Generate Final Round
        </button>
      )}
  </div>
)}

          <div className="card-title">All Rounds</div>
<div className="card-subtitle">
  {tournamentPhaseSubtitle}

  {!isCompleted && isStarted ? (
    <div style={{ marginTop: 6, fontSize: 13, color: '#FFCB05', fontWeight: 700 }}>
      {tournamentPhaseTitle}
    </div>
  ) : null}
</div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 12,
              marginBottom: 18,
              overflowX: 'auto',
              paddingBottom: 6,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {roundsAvailable.map((round) => {
              const status = roundStatusByRound.get(round);
              const isSelected = selectedRound === round;
              const isCurrent = status === 'current';

              return (
                <button
                  key={round}
                  type="button"
                  onClick={() => {
                    setSelectedRound(round);
                    setSelectedPlayoffRound(null);
                  }}
                  style={{
                    minWidth: 132,
                    padding: '14px 16px',
                    borderRadius: 14,
                    flex: '0 0 auto',
                    border:
                    selectedPlayoffRound === null && isSelected
                    ? '1px solid rgba(255, 203, 5, 0.85)'
                    : '1px solid rgba(255,255,255,0.08)',
                    background:
                    selectedPlayoffRound === null && isSelected
                    ? 'rgba(255, 203, 5, 0.14)'
                    : 'rgba(255,255,255,0.03)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 1,
                      color: isCurrent ? '#FFCB05' : 'rgba(255,255,255,0.5)',
                      marginBottom: 6,
                    }}
                  >
                    {isCurrent ? 'LIVE' : 'ROUND'}
                  </div>

                  <div
  style={{
    fontSize: 20,
    fontWeight: 800,
    color: '#fff',
  }}
>
  {tournament?.tournament_mode === 'cream_of_the_crop'
  ? round <= 3
    ? `Sort • Round ${round}`
    : round <= 6
    ? `Re-Rank • Round ${round}`
    : `Final • Round ${round}`
  : `Round ${round}`}
</div>
                </button>
              );
            })}
{playoffRounds.length > 0 && (
  <>
    {playoffRounds.map((round) => {
      const isSelected = selectedPlayoffRound === round.roundNumber;

      return (
        <button
          key={`playoff-${round.roundNumber}`}
          type="button"
          onClick={() => {
            setSelectedPlayoffRound(round.roundNumber);
            setSelectedRound(round.roundNumber);
          }}
          className="round-card"
          style={{
            border: isSelected
            ? '1px solid rgba(255, 203, 5, 0.85)'
            : '1px solid rgba(255,255,255,0.08)',

            background: isSelected
            ? 'rgba(255, 203, 5, 0.14)'
            : 'rgba(255,255,255,0.03)',
            minWidth: 158,
            padding: '14px 16px',
            borderRadius: 14,
            flex: '0 0 auto',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: 2,
              opacity: 0.7,
              marginBottom: 6,
            }}
          >
            PLAYOFF
          </div>

          <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>
            {round.label}
          </div>
        </button>
      );
    })}
  </>
)}
          </div>

{playoffRounds.length > 0 && selectedPlayoffRound !== null ? (
  <div className="card" style={{ marginTop: 14 }}>
    <div className="card-title">Playoffs</div>

    {playoffRounds
      .filter((round) => round.roundNumber === selectedPlayoffRound)
      .map((round) => (
        <div
          id={`playoff-round-${round.roundNumber}`}
          key={round.roundNumber}
          style={{ marginBottom: 18 }}
        >
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            marginBottom: 8,
            color: '#FFCB05',
            letterSpacing: 1,
          }}
        >
          {round.label.toUpperCase()}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {round.matches.map((match) => {
            const playoffCourtLabel =
                tournament?.court_labels?.[match.match_number - 1]?.trim() ||
                `Court ${match.match_number}`;
          
            const teamAName = match.team_a_player_1_id
              ? renderPlayerName(match.team_a_player_1_id) +
                (match.team_a_player_2_id
                  ? ` & ${renderPlayerName(match.team_a_player_2_id)}`
                  : '')
              : 'TBD';

            const teamBName = match.team_b_player_1_id
              ? renderPlayerName(match.team_b_player_1_id) +
                (match.team_b_player_2_id
                  ? ` & ${renderPlayerName(match.team_b_player_2_id)}`
                  : '')
              : 'TBD';

            return (
              <div
                key={match.id}
                className="list-item"
                style={{ padding: 12 }}
              >
               {!match.is_bye ? (
  <div
    style={{
      fontSize: 12,
      fontWeight: 900,
      color: 'rgba(255,255,255,0.55)',
      marginBottom: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
    }}
  >
    {playoffCourtLabel}
  </div>
) : null}
          <div style={{ display: 'grid', gap: 8 }}>
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 64px',
      gap: 10,
      alignItems: 'center',
      padding: 10,
      borderRadius: 12,
      background: match.is_bye
      ? 'rgba(34,197,94,0.12)'
      : match.winner_team === 'A'
      ? 'rgba(255,203,5,0.10)'
      : 'rgba(255,255,255,0.035)',

      border: match.is_bye
      ? '1px solid rgba(34,197,94,0.45)'
      : match.winner_team === 'A'
      ? '1px solid rgba(255,203,5,0.35)'
      : '1px solid rgba(255,255,255,0.08)',
    }}
  >
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>
        {match.team_a_seed ? `SEED ${match.team_a_seed}` : 'TEAM A'}
      </div>
      <div>
  <div
    style={{
      fontSize: 10,
      fontWeight: 900,
      letterSpacing: 1.2,
      color: match.is_bye ? '#22C55E' : 'transparent',
      marginBottom: 2,
    }}
  >
    {match.is_bye ? 'ADVANCES' : ''}
  </div>

  <div
    style={{
      fontWeight: 900,
      color: match.is_bye
        ? '#22C55E'
        : match.winner_team === 'A'
        ? '#FFCB05'
        : '#fff',
    }}
  >
    {teamAName}
  </div>
</div>
    </div>

    <input
      className="input"
      type="number"
      value={
        playoffScoreDrafts[match.id]?.team_a_score ??
        (match.team_a_score === null ? '' : String(match.team_a_score))
      }
      onChange={(e) =>
        setPlayoffScoreDrafts((prev) => ({
          ...prev,
          [match.id]: {
            team_a_score: e.target.value.replace(/[^\d]/g, ''),
            team_b_score:
              prev[match.id]?.team_b_score ??
              (match.team_b_score === null ? '' : String(match.team_b_score)),
          },
        }))
      }
      disabled={match.is_complete}
      placeholder="0"
      style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 900 }}
    />
  </div>

  <div
  style={{
    display: 'grid',
    gridTemplateColumns: '1fr 64px',
    gap: 10,
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    background: match.is_bye
      ? 'rgba(139, 92, 246, 0.08)'
      : match.winner_team === 'B'
      ? 'rgba(255,203,5,0.10)'
      : 'rgba(255,255,255,0.035)',
    border: match.is_bye
      ? '1px dashed rgba(196, 181, 253, 0.35)'
      : match.winner_team === 'B'
      ? '1px solid rgba(255,203,5,0.35)'
      : '1px solid rgba(255,255,255,0.08)',
    opacity: match.is_bye ? 0.55 : 1,
  }}
>
  <div>
    <div
      style={{
        fontSize: 11,
        fontWeight: 900,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 3,
      }}
    >
      {match.is_bye
        ? 'NO OPPONENT'
        : match.team_b_seed
        ? `SEED ${match.team_b_seed}`
        : 'TEAM B'}
    </div>

    <div
      style={{
        fontWeight: 900,
        color: match.is_bye
          ? 'rgba(255,255,255,0.65)'
          : match.winner_team === 'B'
          ? '#FFCB05'
          : '#fff',
      }}
    >
      {match.is_bye ? 'Bye' : teamBName}
    </div>
  </div>

  <input
    className="input"
    type="number"
    value={
      playoffScoreDrafts[match.id]?.team_b_score ??
      (match.team_b_score === null ? '' : String(match.team_b_score))
    }
    onChange={(e) =>
      setPlayoffScoreDrafts((prev) => ({
        ...prev,
        [match.id]: {
          team_a_score:
            prev[match.id]?.team_a_score ??
            (match.team_a_score === null ? '' : String(match.team_a_score)),
          team_b_score: e.target.value.replace(/[^\d]/g, ''),
        },
      }))
    }
    disabled={match.is_complete || !match.team_b_player_1_id}
    placeholder="0"
    style={{
      textAlign: 'center',
      padding: '8px 4px',
      fontWeight: 900,
      opacity: match.is_bye ? 0.45 : 1,
    }}
  />
</div>
            </div>

                {!match.is_complete && !match.is_bye ? (
  <button
    className="button primary"
    onClick={() => submitPlayoffScore(match.id)}
    disabled={!isOrganizer || !match.team_a_player_1_id || !match.team_b_player_1_id}
    style={{
      width: '100%',
      marginTop: 10,
      fontWeight: 900,
      padding: '12px 14px',
    }}
  >
    {isOrganizer ? 'Submit Playoff Score' : 'Scores Locked'}
  </button>
) : match.is_complete && !match.is_bye ? (
  <div
    style={{
      marginTop: 10,
      padding: '10px 12px',
      borderRadius: 12,
      background: 'rgba(255,203,5,0.08)',
      border: '1px solid rgba(255,203,5,0.20)',
      fontWeight: 900,
      color: '#FFCB05',
      textAlign: 'center',
    }}
  >
    Winner Advanced
  </div>
) : null}
             {match.is_bye ? (
  <div
    style={{
  marginTop: 12,
  padding: '14px 16px',
  borderRadius: 14,
  background: 'rgba(139, 92, 246, 0.16)',
  border: '1px dashed rgba(196, 181, 253, 0.65)',
  color: '#DDD6FE',
  fontWeight: 900,
  textAlign: 'center',
  letterSpacing: 0.4,
  boxShadow: 'inset 0 0 0 1px rgba(139, 92, 246, 0.12)',
}}
  >
    <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, marginBottom: 4 }}>
  AUTO ADVANCE
</div>
<div>
  BYE — Advances Automatically
</div>
  </div>
) : null}
              </div>
            );
          })}
        </div>
      </div>
    ))}
  </div>
) : null}

          {selectedPlayoffRound === null && !matchesForSelectedRound.length && !byesForSelectedRound.length ? (
            <div className="muted">No matches in this round yet.</div>
          ) : (
            <div className="grid" style={{ display: selectedPlayoffRound === null ? undefined : 'none' }}>
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
                    <div className="row-between" style={{ marginBottom: 12, alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.6)',
                            marginBottom: 4,
                          }}
                        >
                          Court
                        </div>

                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 900,
                            lineHeight: 1.1,
                          }}
                        >
                          {getCourtLabel(tournament, match.court_number) || '-'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {isNextUp ? (
                          <span
                            className="tag"
                            style={{
                              background: 'rgba(255,203,5,0.14)',
                              border: '1px solid rgba(255,203,5,0.35)',
                              color: '#FFCB05',
                              fontWeight: 800,
                            }}
                          >
                            CURRENT
                          </span>
                        ) : null}

                        <span
                          className={match.is_complete ? 'tag green' : 'tag'}
                          style={!match.is_complete ? { fontWeight: 800 } : undefined}
                        >
                          {match.is_complete ? 'COMPLETE' : 'LIVE'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                      <div
                        className="list-item"
                        style={{
                          padding: 12,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.6)',
                            marginBottom: 6,
                          }}
                        >
                          Team A
                        </div>

                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 18,
                            lineHeight: 1.25,
                            marginBottom: 10,
                            ...getWinnerStyle('a', match),
                          }}
                        >
                          {renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}
                        </div>

                        <input
  className="input"
  style={{
    textAlign: 'center',
    fontSize: 22,
    fontWeight: 800,
    opacity: match.is_complete ? 0.65 : 1,
    cursor: match.is_complete ? 'not-allowed' : 'text',
  }}
  type="number"
  inputMode="numeric"
  pattern="[0-9]*"
  value={
    match.is_complete
      ? match.team_a_score === null
        ? ''
        : String(match.team_a_score)
      : draft.team_a_score
  }
  disabled={isCompleted || match.is_complete || !canReportScores}
  onFocus={(e) => e.currentTarget.select()}
  onChange={(e) => setDraftScore(match.id, 'team_a_score', e.target.value)}
  placeholder={canReportScores ? '0' : 'Scores locked'}
/>
                      </div>

                      <div
                        style={{
                          textAlign: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: '0.12em',
                          color: 'rgba(255,255,255,0.45)',
                        }}
                      >
                        VS
                      </div>

                      <div
                        className="list-item"
                        style={{
                          padding: 12,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.6)',
                            marginBottom: 6,
                          }}
                        >
                          Team B
                        </div>

                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 18,
                            lineHeight: 1.25,
                            marginBottom: 10,
                            ...getWinnerStyle('b', match),
                          }}
                        >
                          {renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}
                        </div>

                        <input
  className="input"
  style={{
    textAlign: 'center',
    fontSize: 22,
    fontWeight: 800,
    opacity: match.is_complete ? 0.65 : 1,
    cursor: match.is_complete ? 'not-allowed' : 'text',
  }}
  type="number"
  inputMode="numeric"
  pattern="[0-9]*"
  value={
    match.is_complete
      ? match.team_b_score === null
        ? ''
        : String(match.team_b_score)
      : draft.team_b_score
  }
  disabled={isCompleted || match.is_complete || !canReportScores}
  onFocus={(e) => e.currentTarget.select()}
  onChange={(e) => setDraftScore(match.id, 'team_b_score', e.target.value)}
  placeholder={canReportScores ? '0' : 'Scores locked'}
/>
                      </div>
                    </div>

     {match.is_complete ? (
  canManageScores && !isCompleted ? (
    <div>
      <button
  type="button"
  className="button secondary"
  onClick={() => reopenMatch(match.id)}
  style={{
    width: '100%',
    fontWeight: 900,
    fontSize: 16,
    padding: '14px 16px',
    borderColor: 'rgba(255,203,5,0.6)',
    background: 'rgba(255,203,5,0.08)',
    boxShadow: '0 0 0 1px rgba(255,203,5,0.2) inset',
  }}
>
  🔓 Reopen Match to Edit Scores
</button>

      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'center',
          color: 'rgba(255,203,5,0.85)',
          letterSpacing: '0.04em',
        }}
      >
        Match complete. Reopen to edit.
      </div>
    </div>
  ) : (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: 'rgba(34,197,94,0.10)',
        border: '1px solid rgba(34,197,94,0.25)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.6)',
          marginBottom: 4,
        }}
      >
        Status
      </div>

      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: isCompleted ? 'rgba(255,255,255,0.9)' : '#86efac',
        }}
      >
        {isCompleted ? 'Final Locked' : 'Score Submitted'}
      </div>
    </div>
  )
) : (
  <button
    className="button primary"
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => submitMatchScore(match.id)}
    disabled={!canReportScores}
    style={{
      width: '100%',
      fontWeight: 800,
      fontSize: 16,
      padding: '14px 16px',
    }}
  >
    {canReportScores ? 'Submit Score' : 'Scores Locked'}
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
        </>
      )}

      {activeTab === 'standings' && (
        <div className="card">
          <div className="card-title">{isCompleted ? '🏆 Final Results' : 'Standings'}</div>
          <div className="card-subtitle">
            {isCompleted
              ? 'Tournament complete. Final results are locked.'
              : 'Ranked by wins, then point differential, then points scored.'}
          </div>

          {isCompleted && tournamentWinner ? (
            <div
              style={{
                marginTop: 14,
                marginBottom: 14,
                padding: 16,
                borderRadius: 18,
                background: 'linear-gradient(135deg, rgba(255,203,5,0.16), rgba(255,203,5,0.06))',
                border: '1px solid rgba(255,203,5,0.28)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#FFCB05',
                  marginBottom: 6,
                }}
              >
                Champion
              </div>

              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#fff',
                  marginBottom: 6,
                }}
              >
                🏆 {tournamentWinner.name}
              </div>

              <div className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
                Finished 1st with {tournamentWinner.wins} wins and a{' '}
                {tournamentWinner.pointDiff >= 0 ? '+' : ''}
                {tournamentWinner.pointDiff} point differential.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <div className="list-item" style={{ padding: 10, textAlign: 'center', background: 'rgba(255,255,255,0.04)' }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Wins</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{tournamentWinner.wins}</div>
                </div>

                <div className="list-item" style={{ padding: 10, textAlign: 'center', background: 'rgba(255,255,255,0.04)' }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Record</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {tournamentWinner.wins}-{tournamentWinner.losses}
                  </div>
                </div>

                <div className="list-item" style={{ padding: 10, textAlign: 'center', background: 'rgba(255,255,255,0.04)' }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Diff</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {tournamentWinner.pointDiff >= 0 ? '+' : ''}
                    {tournamentWinner.pointDiff}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

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
                    standingsView === 'leaderboard'
                      ? '56px 1fr 62px 62px'
                      : '56px 1fr 84px 62px',
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

              {tournament?.tournament_mode === 'cream_of_the_crop' && standings.length > 0 && (
  <div
    className="card"
    style={{
      marginBottom: 14,
      border: '1px solid rgba(255,203,5,0.35)',
      background: 'rgba(255,203,5,0.08)',
    }}
  >
    <div className="card-title" style={{ color: '#FFCB05' }}>
      Cream of the Crop Results
    </div>

    {biggestClimber && biggestClimber.climb > 0 && (
  <div
    className="list-item"
    style={{
      marginTop: 12,
      border: '1px solid rgba(255,203,5,0.35)',
      background: 'rgba(255,203,5,0.10)',
    }}
  >
    <div style={{ fontWeight: 900, color: '#FFCB05', marginBottom: 4 }}>
      Biggest Climber
    </div>
    <div style={{ fontSize: 16, fontWeight: 800 }}>
      🚀 {biggestClimber.name} climbed {biggestClimber.climb} spots
    </div>
    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
      Started #{biggestClimber.startingRank} → Finished #{biggestClimber.finalRank}
    </div>
  </div>
)}

    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {standings.slice(0, 3).map((row, index) => (
        <div
          key={row.playerId}
          className="list-item"
          style={{
            border:
              index === 0
                ? '1px solid rgba(255,203,5,0.5)'
                : '1px solid rgba(255,255,255,0.10)',
            background:
              index === 0
                ? 'rgba(255,203,5,0.12)'
                : 'rgba(255,255,255,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 28 }}>
              {index === 0 ? '👑' : index === 1 ? '🥈' : '🥉'}
            </div>

            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                {index + 1}. {row.name}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {row.wins} wins • {row.pointDiff >= 0 ? '+' : ''}
                {row.pointDiff} point diff • {row.pointsFor} points for
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}

              {standings.map((row, index) => {
                const place = index + 1;
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
                        standingsView === 'leaderboard'
                          ? '56px 1fr 62px 62px'
                          : '56px 1fr 84px 62px',
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
                        gap: 6,
                        padding: '10px 8px',
                        minWidth: 0,
                      }}
                    >
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
                          standingsView === 'leaderboard' && row.pointDiff > 0
                            ? '#FFCB05'
                            : undefined,
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
                      {standingsView === 'leaderboard'
                        ? `${row.wins}-${row.losses}`
                        : row.pointsFor}
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
