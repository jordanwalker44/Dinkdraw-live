'use client';


import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';
import { ShareResultsButton } from '../../../components/ShareResultsButton';
import {
  OrganizationBrandBanner,
  type OrganizationBrand,
} from '../../../components/OrganizationBrandBanner';
import { loadPublicOrganizationBrand } from '../../../lib/organization-brand';
import { sendTournamentPushEvent } from '../../../lib/tournament-push';
import { TournamentAnnouncementsLink } from '../../../components/TournamentAnnouncementsLink';
import { TournamentBracket } from '../../../components/TournamentBracket';
import { PoolStandingsTables } from '../../../components/PoolStandingsTables';
import { TournamentPrizePool } from '../../../components/TournamentPrizePool';
import { CreamStageTeamStatus } from '../../../components/CreamStageStatus';
import {
  buildCreamStageStatusMap,
  getCreamStageLabel,
  SHOW_CREAM_STAGE_STATUS,
} from '../../../lib/cream-stage-status';
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
  co_organizer_user_id: string | null;
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
  allow_player_score_reporting: boolean | null;
  allow_any_player_score_reporting: boolean | null;
  playoff_format: string | null;
  playoff_advance_count: number | null;
  playoff_seeding_style: string | null;
  playoff_status: string | null;
  champion_player_1_id: string | null;
  champion_player_2_id: string | null;
  ask_for_dupr_id: boolean | null;
  organization_id: string | null;
  pool_brackets_enabled: boolean | null;
  pool_count: number | null;
  pool_qualifiers_per_gender: number | null;
  bracket_match_format: 'single' | 'best_of_3' | null;
  bracket_games_to: number | null;
  bracket_deciding_game_to: number | null;
};

type PlayerSlot = {
  id: string;
  tournament_id: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id: string | null;
  gender: string | null;
  dupr_id: string | null;
  pool_number: number | null;
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
  dupr_id: string | null;
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
  initialRank: number;
  finalCourt: number | null;
  finalCourtWins: number;
  finalCourtLosses: number;
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
  bracket_type: 'championship' | 'consolation';
  match_format: 'single' | 'best_of_3';
  games_to: number | null;
  deciding_game_to: number | null;
  game_1_a: number | null;
  game_1_b: number | null;
  game_2_a: number | null;
  game_2_b: number | null;
  game_3_a: number | null;
  game_3_b: number | null;
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

type SinglesMatchResult = {
  a: string;
  b: string;
  court: number | null;
};

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
  const playedCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const byeCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const firstServerCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const courtCounts = new Map<string, Map<number, number>>();
  const lastCourts = new Map<string, number | null>(ids.map((id) => [id, null]));
  const opponentCounts = new Map<string, number>();

  const maxRounds = ids.length - 1;
  const roundsToGenerate = Math.min(rounds, maxRounds);

  function singlesCourtCount(playerId: string, court: number) {
    return courtCounts.get(playerId)?.get(court) ?? 0;
  }

  function recordSinglesCourt(playerId: string, court: number) {
    const playerCourtCounts = courtCounts.get(playerId) || new Map<number, number>();
    playerCourtCounts.set(court, (playerCourtCounts.get(court) ?? 0) + 1);
    courtCounts.set(playerId, playerCourtCounts);
    lastCourts.set(playerId, court);
  }

  function scoreSinglesCourt(match: SinglesMatchResult, court: number) {
    let penalty = 0;

    for (const playerId of [match.a, match.b]) {
      if (lastCourts.get(playerId) === court) penalty += 1000000;
      penalty += singlesCourtCount(playerId, court) * 1000;
    }

    return penalty;
  }

  function assignSinglesCourts(matches: SinglesMatchResult[]) {
    let bestAssignments: SinglesMatchResult[] | null = null;
    let bestPenalty = Infinity;
    const activeCourts = Math.min(courts, matches.length);

    function search(
      remainingMatches: SinglesMatchResult[],
      availableCourts: number[],
      currentAssignments: SinglesMatchResult[],
      currentPenalty: number
    ) {
      if (currentPenalty >= bestPenalty) return;

      if (!remainingMatches.length) {
        bestAssignments = currentAssignments;
        bestPenalty = currentPenalty;
        return;
      }

      const [match, ...restMatches] = remainingMatches;

      for (const court of availableCourts) {
        const assignmentPenalty = scoreSinglesCourt(match, court);
        search(
          restMatches,
          availableCourts.filter((availableCourt) => availableCourt !== court),
          [...currentAssignments, { ...match, court }],
          currentPenalty + assignmentPenalty
        );
      }
    }

    search(
      matches.slice(0, activeCourts),
      Array.from({ length: activeCourts }, (_, index) => index + 1),
      [],
      0
    );

    return (
      bestAssignments ||
      matches.slice(0, activeCourts).map((match, index) => ({
        ...match,
        court: index + 1,
      }))
    );
  }

  function orientSinglesServingSides(matches: SinglesMatchResult[]) {
    let bestMatches: SinglesMatchResult[] | null = null;
    let bestPenalty = Infinity;

    function scoreOrientation(orientedMatches: SinglesMatchResult[]) {
      const projectedCounts = new Map(firstServerCounts);

      for (const match of orientedMatches) {
        projectedCounts.set(match.a, (projectedCounts.get(match.a) ?? 0) + 1);
      }

      const values = Array.from(projectedCounts.values());
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce(
        (sum, value) => sum + Math.pow(value - average, 2),
        0
      );

      return (Math.max(...values) - Math.min(...values)) * 100000 + variance;
    }

    function search(index: number, currentMatches: SinglesMatchResult[]) {
      if (index >= matches.length) {
        const penalty = scoreOrientation(currentMatches);

        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestMatches = currentMatches;
        }

        return;
      }

      const match = matches[index];
      search(index + 1, [...currentMatches, match]);
      search(index + 1, [
        ...currentMatches,
        {
          ...match,
          a: match.b,
          b: match.a,
        },
      ]);
    }

    search(0, []);

    return bestMatches || matches;
  }

  function balanceSinglesServingSidesInSchedule(rows: ScheduleRow[]) {
    const greedyCounts = new Map<string, number>(ids.map((id) => [id, 0]));
    let balancedRows = rows.map((row) => {
      if (row.is_bye || !row.team_a_player_1_id || !row.team_b_player_1_id) {
        return row;
      }

      const teamACount = greedyCounts.get(row.team_a_player_1_id) ?? 0;
      const teamBCount = greedyCounts.get(row.team_b_player_1_id) ?? 0;
      const shouldFlip = teamACount > teamBCount;
      const balancedRow = shouldFlip
        ? {
            ...row,
            team_a_player_1_id: row.team_b_player_1_id,
            team_b_player_1_id: row.team_a_player_1_id,
        }
        : row;
      const firstServerId = balancedRow.team_a_player_1_id;

      if (!firstServerId) return balancedRow;

      greedyCounts.set(
        firstServerId,
        (greedyCounts.get(firstServerId) ?? 0) + 1
      );

      return balancedRow;
    });

    function scoreRows(candidateRows: ScheduleRow[]) {
      const counts = new Map<string, number>(ids.map((id) => [id, 0]));

      for (const row of candidateRows) {
        if (row.is_bye || !row.team_a_player_1_id) continue;
        counts.set(
          row.team_a_player_1_id,
          (counts.get(row.team_a_player_1_id) ?? 0) + 1
        );
      }

      const values = Array.from(counts.values());
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce(
        (sum, value) => sum + Math.pow(value - average, 2),
        0
      );

      return (Math.max(...values) - Math.min(...values)) * 100000 + variance;
    }

    let bestScore = scoreRows(balancedRows);
    let improved = true;

    while (improved) {
      improved = false;

      for (let index = 0; index < balancedRows.length; index += 1) {
        const row = balancedRows[index];

        if (row.is_bye || !row.team_a_player_1_id || !row.team_b_player_1_id) {
          continue;
        }

        const flippedRows = balancedRows.map((candidate, candidateIndex) =>
          candidateIndex === index
            ? {
                ...candidate,
                team_a_player_1_id: row.team_b_player_1_id,
                team_b_player_1_id: row.team_a_player_1_id,
              }
            : candidate
        );
        const flippedScore = scoreRows(flippedRows);

        if (flippedScore < bestScore) {
          balancedRows = flippedRows;
          bestScore = flippedScore;
          improved = true;
        }
      }
    }

    return balancedRows;
  }

  function chooseSinglesParticipants() {
    const activePlayerCount = Math.min(courts * 2, ids.length);
    const evenActivePlayerCount =
      activePlayerCount % 2 === 0 ? activePlayerCount : activePlayerCount - 1;

    return [...ids]
      .sort((a, b) => {
        const playedDifference = (playedCounts.get(a) ?? 0) - (playedCounts.get(b) ?? 0);
        if (playedDifference !== 0) return playedDifference;

        const byeDifference = (byeCounts.get(b) ?? 0) - (byeCounts.get(a) ?? 0);
        if (byeDifference !== 0) return byeDifference;

        return ids.indexOf(a) - ids.indexOf(b);
      })
      .slice(0, evenActivePlayerCount);
  }

  function pairSinglesParticipants(participantIds: string[]) {
    let bestMatches: SinglesMatchResult[] | null = null;
    let bestPenalty = Infinity;
    let searched = 0;
    const searchLimit = participantIds.length <= 14 ? 30000 : 10000;

    function scorePair(a: string, b: string) {
      return (opponentCounts.get(singlesMatchupKey(a, b)) ?? 0) * 1000000;
    }

    function search(
      remainingIds: string[],
      currentMatches: SinglesMatchResult[],
      currentPenalty: number
    ) {
      if (searched >= searchLimit || currentPenalty >= bestPenalty) return;
      searched += 1;

      if (!remainingIds.length) {
        const assignedMatches = assignSinglesCourts(currentMatches);
        const courtPenalty = assignedMatches.reduce(
          (sum, match) =>
            match.court === null ? sum : sum + scoreSinglesCourt(match, match.court),
          0
        );
        const totalPenalty = currentPenalty + courtPenalty;

        if (totalPenalty < bestPenalty) {
          bestMatches = currentMatches;
          bestPenalty = totalPenalty;
        }

        return;
      }

      const first = remainingIds[0];
      const options = remainingIds
        .slice(1)
        .map((opponentId) => ({
          opponentId,
          penalty: scorePair(first, opponentId),
        }))
        .sort((a, b) => {
          if (a.penalty !== b.penalty) return a.penalty - b.penalty;
          return (
            (playedCounts.get(a.opponentId) ?? 0) -
            (playedCounts.get(b.opponentId) ?? 0)
          );
        });

      for (const option of options) {
        const nextRemainingIds = remainingIds.filter(
          (id) => id !== first && id !== option.opponentId
        );

        search(
          nextRemainingIds,
          [
            ...currentMatches,
            {
              a: first,
              b: option.opponentId,
              court: null,
            },
          ],
          currentPenalty + option.penalty
        );
      }
    }

    search(participantIds, [], 0);

    return bestMatches;
  }

  for (let round = 1; round <= roundsToGenerate; round += 1) {
    const participants = chooseSinglesParticipants();
    const playingIds = new Set(participants);
    const benchedIds = ids.filter((id) => !playingIds.has(id));

    for (const byePlayerId of benchedIds) {
      byeCounts.set(byePlayerId, (byeCounts.get(byePlayerId) ?? 0) + 1);

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
    }

    const matchesToPlay = pairSinglesParticipants(participants);
    if (!matchesToPlay) break;

    const assignedMatches = assignSinglesCourts(matchesToPlay);

    for (const match of orientSinglesServingSides(assignedMatches)) {
      if (match.court === null) continue;

      playedCounts.set(match.a, (playedCounts.get(match.a) ?? 0) + 1);
      playedCounts.set(match.b, (playedCounts.get(match.b) ?? 0) + 1);
      firstServerCounts.set(match.a, (firstServerCounts.get(match.a) ?? 0) + 1);
      opponentCounts.set(
        singlesMatchupKey(match.a, match.b),
        (opponentCounts.get(singlesMatchupKey(match.a, match.b)) ?? 0) + 1
      );
      recordSinglesCourt(match.a, match.court);
      recordSinglesCourt(match.b, match.court);

      output.push({
        round_number: round,
        court_number: match.court,
        court_label: null,
        team_a_player_1_id: match.a,
        team_a_player_2_id: null,
        team_b_player_1_id: match.b,
        team_b_player_2_id: null,
        team_a_score: null,
        team_b_score: null,
        is_bye: false,
        is_complete: false,
      });
    }
  }

  return balanceSinglesServingSidesInSchedule(output);
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

type AssignedMatchResult = MatchResult & {
  court: number;
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

    const aExhausted = this.distinctPartners(a) >= totalValid(a);
    const bExhausted = this.distinctPartners(b) >= totalValid(b);

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

  groupTimes(ids: string[]): number {
    return this.groupRounds.get(groupKey(ids))?.length ?? 0;
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
  penalty += history.groupTimes([a1, a2, b1, b2]) * 200000;

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

  const teamOffset = (round - 1) % teams.length;
  const orderedTeams = [...teams.slice(teamOffset), ...teams.slice(0, teamOffset)];

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

  search(orderedTeams, [], 0);

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
  const attempts = participantCount <= 8 ? 500 : participantCount <= 16 ? 1000 : 400;

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

function courtCountForPlayer(
  courtCounts: Map<string, Map<number, number>>,
  playerId: string,
  court: number
) {
  return courtCounts.get(playerId)?.get(court) ?? 0;
}

function scoreCourtAssignment(
  match: MatchResult,
  court: number,
  history: { lastCourt(playerId: string): number | null },
  courtCounts: Map<string, Map<number, number>>
) {
  const players = [match.a1, match.a2, match.b1, match.b2];
  let penalty = 0;

  for (const playerId of players) {
    if (history.lastCourt(playerId) === court) penalty += 1000000;
    penalty += courtCountForPlayer(courtCounts, playerId, court) * 1000;
  }

  return penalty;
}

function assignDoublesCourts(
  matches: MatchResult[],
  activeCourts: number,
  history: { lastCourt(playerId: string): number | null },
  courtCounts: Map<string, Map<number, number>>
): AssignedMatchResult[] {
  let bestAssignments: AssignedMatchResult[] | null = null;
  let bestPenalty = Infinity;

  function search(
    remainingMatches: MatchResult[],
    availableCourts: number[],
    currentAssignments: AssignedMatchResult[],
    currentPenalty: number
  ) {
    if (currentPenalty >= bestPenalty) return;

    if (!remainingMatches.length) {
      bestAssignments = currentAssignments;
      bestPenalty = currentPenalty;
      return;
    }

    const [match, ...restMatches] = remainingMatches;

    for (const court of availableCourts) {
      const assignmentPenalty = scoreCourtAssignment(match, court, history, courtCounts);
      search(
        restMatches,
        availableCourts.filter((availableCourt) => availableCourt !== court),
        [...currentAssignments, { ...match, court }],
        currentPenalty + assignmentPenalty
      );
    }
  }

  search(
    matches,
    Array.from({ length: activeCourts }, (_, index) => index + 1),
    [],
    0
  );

  return bestAssignments || matches.map((match, index) => ({ ...match, court: index + 1 }));
}

function recordCourtAssignment(
  courtCounts: Map<string, Map<number, number>>,
  playerId: string,
  court: number
) {
  const playerCourtCounts = courtCounts.get(playerId) || new Map<number, number>();
  playerCourtCounts.set(court, (playerCourtCounts.get(court) ?? 0) + 1);
  courtCounts.set(playerId, playerCourtCounts);
}

function scoreFirstTwosomeBalance(counts: Map<string, number>) {
  const values = Array.from(counts.values());
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variancePenalty = values.reduce(
    (sum, value) => sum + Math.pow(value - average, 2),
    0
  );

  return (max - min) * 100000 + variancePenalty + max * 100;
}

function orientDoublesServingSides(
  matches: AssignedMatchResult[],
  firstTwosomeCounts: Map<string, number>
): AssignedMatchResult[] {
  let bestMatches: AssignedMatchResult[] | null = null;
  let bestPenalty = Infinity;

  function increment(counts: Map<string, number>, playerId: string) {
    counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
  }

  function search(
    index: number,
    currentMatches: AssignedMatchResult[],
    currentCounts: Map<string, number>
  ) {
    if (index >= matches.length) {
      const penalty = scoreFirstTwosomeBalance(currentCounts);

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMatches = currentMatches;
      }

      return;
    }

    const match = matches[index];

    const normalCounts = new Map(currentCounts);
    increment(normalCounts, match.a1);
    increment(normalCounts, match.a2);
    search(index + 1, [...currentMatches, match], normalCounts);

    const flippedMatch = {
      a1: match.b1,
      a2: match.b2,
      b1: match.a1,
      b2: match.a2,
      court: match.court,
    };
    const flippedCounts = new Map(currentCounts);
    increment(flippedCounts, flippedMatch.a1);
    increment(flippedCounts, flippedMatch.a2);
    search(index + 1, [...currentMatches, flippedMatch], flippedCounts);
  }

  search(0, [], new Map(firstTwosomeCounts));

  return bestMatches || matches;
}

function scoreFirstTwosomeSchedule(rows: ScheduleRow[], playerIds: string[]) {
  const counts = new Map<string, number>(playerIds.map((id) => [id, 0]));

  for (const row of rows) {
    if (row.is_bye) continue;
    if (row.team_a_player_1_id) {
      counts.set(row.team_a_player_1_id, (counts.get(row.team_a_player_1_id) ?? 0) + 1);
    }
    if (row.team_a_player_2_id) {
      counts.set(row.team_a_player_2_id, (counts.get(row.team_a_player_2_id) ?? 0) + 1);
    }
  }

  return scoreFirstTwosomeBalance(counts);
}

function balanceDoublesServingSidesInSchedule(
  rows: ScheduleRow[],
  playerIds: string[]
) {
  const orientableIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        !row.is_bye &&
        !!row.team_a_player_1_id &&
        !!row.team_a_player_2_id &&
        !!row.team_b_player_1_id &&
        !!row.team_b_player_2_id
    )
    .map(({ index }) => index);

  if (orientableIndexes.length > 0 && orientableIndexes.length <= 18) {
    let bestRows = rows;
    let bestScore = scoreFirstTwosomeSchedule(rows, playerIds);

    function increment(counts: Map<string, number>, playerId: string | null) {
      if (!playerId) return;
      counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
    }

    function search(
      orientationIndex: number,
      currentRows: ScheduleRow[],
      counts: Map<string, number>
    ) {
      if (orientationIndex >= orientableIndexes.length) {
        const score = scoreFirstTwosomeBalance(counts);

        if (score < bestScore) {
          bestScore = score;
          bestRows = currentRows;
        }

        return;
      }

      const rowIndex = orientableIndexes[orientationIndex];
      const row = currentRows[rowIndex];

      const normalCounts = new Map(counts);
      increment(normalCounts, row.team_a_player_1_id);
      increment(normalCounts, row.team_a_player_2_id);
      search(orientationIndex + 1, currentRows, normalCounts);

      const flippedRow = {
        ...row,
        team_a_player_1_id: row.team_b_player_1_id,
        team_a_player_2_id: row.team_b_player_2_id,
        team_b_player_1_id: row.team_a_player_1_id,
        team_b_player_2_id: row.team_a_player_2_id,
      };
      const flippedRows = currentRows.map((candidate, candidateIndex) =>
        candidateIndex === rowIndex ? flippedRow : candidate
      );
      const flippedCounts = new Map(counts);
      increment(flippedCounts, flippedRow.team_a_player_1_id);
      increment(flippedCounts, flippedRow.team_a_player_2_id);
      search(orientationIndex + 1, flippedRows, flippedCounts);
    }

    search(0, rows, new Map<string, number>(playerIds.map((id) => [id, 0])));

    return bestRows;
  }

  let balancedRows = [...rows];
  let bestScore = scoreFirstTwosomeSchedule(balancedRows, playerIds);
  let improved = true;

  while (improved) {
    improved = false;

    for (let index = 0; index < balancedRows.length; index += 1) {
      const row = balancedRows[index];
      if (
        row.is_bye ||
        !row.team_a_player_1_id ||
        !row.team_a_player_2_id ||
        !row.team_b_player_1_id ||
        !row.team_b_player_2_id
      ) {
        continue;
      }

      const flippedRows = balancedRows.map((candidate, candidateIndex) =>
        candidateIndex === index
          ? {
              ...candidate,
              team_a_player_1_id: row.team_b_player_1_id,
              team_a_player_2_id: row.team_b_player_2_id,
              team_b_player_1_id: row.team_a_player_1_id,
              team_b_player_2_id: row.team_a_player_2_id,
            }
          : candidate
      );

      const flippedScore = scoreFirstTwosomeSchedule(flippedRows, playerIds);

      if (flippedScore < bestScore) {
        balancedRows = flippedRows;
        bestScore = flippedScore;
        improved = true;
      }
    }
  }

  return balancedRows;
}

function doublesRowPlayerIds(row: ScheduleRow) {
  return [
    row.team_a_player_1_id,
    row.team_a_player_2_id,
    row.team_b_player_1_id,
    row.team_b_player_2_id,
  ].filter(Boolean) as string[];
}

function scoreDoublesCourtSchedule(rows: ScheduleRow[], playerIds: string[]) {
  const allCourts = Array.from(
    new Set(
      rows
        .filter((row) => !row.is_bye && row.court_number !== null)
        .map((row) => row.court_number as number)
    )
  ).sort((a, b) => a - b);

  const lastCourt = new Map<string, number | null>(
    playerIds.map((playerId) => [playerId, null])
  );
  const currentStreak = new Map<string, number>(
    playerIds.map((playerId) => [playerId, 0])
  );
  const longestStreak = new Map<string, number>(
    playerIds.map((playerId) => [playerId, 0])
  );
  const courtCounts = new Map<string, Map<number, number>>(
    playerIds.map((playerId) => [playerId, new Map()])
  );

  const playableRows = [...rows]
    .filter((row) => !row.is_bye && row.court_number !== null)
    .sort(
      (a, b) =>
        a.round_number - b.round_number ||
        (a.court_number ?? 999) - (b.court_number ?? 999)
    );

  for (const row of playableRows) {
    const court = row.court_number as number;

    for (const playerId of doublesRowPlayerIds(row)) {
      const nextStreak =
        lastCourt.get(playerId) === court
          ? (currentStreak.get(playerId) ?? 0) + 1
          : 1;

      lastCourt.set(playerId, court);
      currentStreak.set(playerId, nextStreak);
      longestStreak.set(
        playerId,
        Math.max(longestStreak.get(playerId) ?? 0, nextStreak)
      );

      const playerCourtCounts = courtCounts.get(playerId) || new Map<number, number>();
      playerCourtCounts.set(court, (playerCourtCounts.get(court) ?? 0) + 1);
      courtCounts.set(playerId, playerCourtCounts);
    }
  }

  let score = 0;

  for (const playerId of playerIds) {
    const longest = longestStreak.get(playerId) ?? 0;
    const counts = courtCounts.get(playerId) || new Map<number, number>();
    const values = allCourts.map((court) => counts.get(court) ?? 0);
    const courtSpread = values.length
      ? Math.max(...values) - Math.min(...values)
      : 0;

    score += Math.pow(longest, 4) * 100000;
    score += courtSpread * 1000;
  }

  return score;
}

function balanceDoublesCourtsInSchedule(
  rows: ScheduleRow[],
  playerIds: string[]
) {
  let balancedRows = [...rows];
  let bestScore = scoreDoublesCourtSchedule(balancedRows, playerIds);
  let improved = true;

  while (improved) {
    improved = false;

    const roundNumbers = Array.from(
      new Set(
        balancedRows
          .filter((row) => !row.is_bye && row.court_number !== null)
          .map((row) => row.round_number)
      )
    ).sort((a, b) => a - b);

    for (const roundNumber of roundNumbers) {
      const roundIndexes = balancedRows
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row }) =>
            !row.is_bye &&
            row.round_number === roundNumber &&
            row.court_number !== null
        )
        .map(({ index }) => index);

      if (roundIndexes.length <= 1) continue;

      for (let left = 0; left < roundIndexes.length - 1; left += 1) {
        for (let right = left + 1; right < roundIndexes.length; right += 1) {
          const leftIndex = roundIndexes[left];
          const rightIndex = roundIndexes[right];
          const leftRow = balancedRows[leftIndex];
          const rightRow = balancedRows[rightIndex];

          const candidateRows = balancedRows.map((row, index) => {
            if (index === leftIndex) {
              return {
                ...row,
                court_number: rightRow.court_number,
                court_label: null,
              };
            }

            if (index === rightIndex) {
              return {
                ...row,
                court_number: leftRow.court_number,
                court_label: null,
              };
            }

            return row;
          });
          const candidateScore = scoreDoublesCourtSchedule(candidateRows, playerIds);

          if (candidateScore < bestScore) {
            balancedRows = candidateRows;
            bestScore = candidateScore;
            improved = true;
          }
        }
      }
    }
  }

  return balancedRows;
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
  const firstTwosomeCounts = new Map<string, number>(ids.map((id) => [id, 0]));
  const courtCounts = new Map<string, Map<number, number>>();
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

    const assignedMatches = assignDoublesCourts(
      matches,
      activeCourts,
      history,
      courtCounts
    );

    orientDoublesServingSides(assignedMatches, firstTwosomeCounts).forEach((assignedMatch) => {
      const { a1, a2, b1, b2, court } = assignedMatch;

      partners.record(a1, a2);
      partners.record(b1, b2);
      history.record(a1, a2, b1, b2, court, round);
      firstTwosomeCounts.set(a1, (firstTwosomeCounts.get(a1) ?? 0) + 1);
      firstTwosomeCounts.set(a2, (firstTwosomeCounts.get(a2) ?? 0) + 1);

      for (const id of [a1, a2, b1, b2]) {
        playedCounts.set(id, (playedCounts.get(id) ?? 0) + 1);
        recordCourtAssignment(courtCounts, id, court);
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

  const sideBalancedRows = balanceDoublesServingSidesInSchedule(output, ids);

  return balanceDoublesCourtsInSchedule(sideBalancedRows, ids);
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
  const history = new MatchHistory();
  const firstTwosomeCounts = new Map<string, number>(
    activePlayers.map((player) => [player.id, 0])
  );
  const courtCounts = new Map<string, Map<number, number>>();

  const hasBye = teams.length % 2 !== 0;
  const rotationTeams: Array<FixedTeam | null> = hasBye ? [...teams, null] : [...teams];
  const totalRotationSlots = rotationTeams.length;
  const maxRoundsWithoutRepeats = totalRotationSlots - 1;
  const requestedRounds = Math.max(0, rounds);
  const actualRounds = Math.min(requestedRounds, maxRoundsWithoutRepeats);

  for (let round = 1; round <= actualRounds; round += 1) {
    const roundMatches: MatchResult[] = [];

    for (let i = 0; i < totalRotationSlots / 2; i += 1) {
      const team1 = rotationTeams[i];
      const team2 = rotationTeams[totalRotationSlots - 1 - i];

      if (!team1 || !team2) continue;

      roundMatches.push({
        a1: team1.player1Id,
        a2: team1.player2Id,
        b1: team2.player1Id,
        b2: team2.player2Id,
      });
    }

    const activeCourts = Math.min(courts, roundMatches.length);
    const assignedMatches = assignDoublesCourts(
      roundMatches.slice(0, activeCourts),
      activeCourts,
      history,
      courtCounts
    );

    orientDoublesServingSides(assignedMatches, firstTwosomeCounts).forEach((assignedMatch) => {
      const { a1, a2, b1, b2, court } = assignedMatch;

      history.record(a1, a2, b1, b2, court, round);
      firstTwosomeCounts.set(a1, (firstTwosomeCounts.get(a1) ?? 0) + 1);
      firstTwosomeCounts.set(a2, (firstTwosomeCounts.get(a2) ?? 0) + 1);

      for (const id of [a1, a2, b1, b2]) {
        recordCourtAssignment(courtCounts, id, court);
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

    const fixedTeam = rotationTeams[0];
    const rotatingTeams = rotationTeams.slice(1);
    const movedTeam = rotatingTeams.pop();

    if (movedTeam !== undefined) {
      rotationTeams.splice(0, rotationTeams.length, fixedTeam, movedTeam, ...rotatingTeams);
    }
  }

  const sideBalancedRows = balanceDoublesServingSidesInSchedule(
    output,
    activePlayers.map((player) => player.id)
  );

  return balanceDoublesCourtsInSchedule(
    sideBalancedRows,
    activePlayers.map((player) => player.id)
  );
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
  const byeCounts = new Map<string, number>(activePlayers.map((player) => [player.id, 0]));
  const playedCounts = new Map<string, number>(activePlayers.map((player) => [player.id, 0]));
  const firstTwosomeCounts = new Map<string, number>(
    activePlayers.map((player) => [player.id, 0])
  );
  const courtCounts = new Map<string, Map<number, number>>();
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

    penalty += (foursomeCounts.get(getFoursomeKey(a1, a2, b1, b2)) || 0) * 900000;

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

  function chooseMixedGenderParticipants(players: PlayerSlot[], maxCount: number) {
    if (players.length <= maxCount) {
      return {
        participants: [...players],
        benched: [],
      };
    }

    const sorted = [...players].sort((a, b) => {
      const byeDifference = (byeCounts.get(b.id) ?? 0) - (byeCounts.get(a.id) ?? 0);
      if (byeDifference !== 0) return byeDifference;

      const playDifference = (playedCounts.get(a.id) ?? 0) - (playedCounts.get(b.id) ?? 0);
      if (playDifference !== 0) return playDifference;

      return a.slot_number - b.slot_number;
    });

    return {
      participants: sorted.slice(0, maxCount),
      benched: sorted.slice(maxCount),
    };
  }

  function buildTeamsForRound(
    round: number,
    roundMalePlayers: PlayerSlot[],
    roundFemalePlayers: PlayerSlot[]
  ): MixedTeam[] {
    const femaleShift = (round - 1) % roundFemalePlayers.length;

    return roundMalePlayers.map((malePlayer, index) => ({
      maleId: malePlayer.id,
      femaleId: roundFemalePlayers[(index + femaleShift) % roundFemalePlayers.length].id,
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
    const maxPlayersPerGender = Math.max(
      2,
      Math.min(courts * 2, malePlayers.length, femalePlayers.length)
    );
    const evenPlayersPerGender =
      maxPlayersPerGender % 2 === 0 ? maxPlayersPerGender : maxPlayersPerGender - 1;
    const maleSelection = chooseMixedGenderParticipants(malePlayers, evenPlayersPerGender);
    const femaleSelection = chooseMixedGenderParticipants(femalePlayers, evenPlayersPerGender);
    const benchedPlayers = [...maleSelection.benched, ...femaleSelection.benched];

    for (const player of benchedPlayers) {
      byeCounts.set(player.id, (byeCounts.get(player.id) ?? 0) + 1);

      output.push({
        round_number: round,
        court_number: null,
        court_label: null,
        team_a_player_1_id: player.id,
        team_a_player_2_id: null,
        team_b_player_1_id: null,
        team_b_player_2_id: null,
        team_a_score: null,
        team_b_score: null,
        is_bye: true,
        is_complete: false,
      });
    }

    const teams = buildTeamsForRound(
      round,
      maleSelection.participants,
      femaleSelection.participants
    );
    const matches = pairMixedTeams(teams);

    if (!matches || !matches.length) break;

    const assignedMatches = assignDoublesCourts(
      matches.slice(0, courts).map((match) => ({
        a1: match.teamA[0],
        a2: match.teamA[1],
        b1: match.teamB[0],
        b2: match.teamB[1],
      })),
      Math.min(courts, matches.length),
      {
        lastCourt(id: string) {
          const history = courtHistory.get(id) || [];
          return history.length ? history[history.length - 1] : null;
        },
      },
      courtCounts
    );

    orientDoublesServingSides(assignedMatches, firstTwosomeCounts).forEach((assignedMatch) => {
      const { a1, a2, b1, b2, court } = assignedMatch;

      recordMixedMatch(
        {
          teamA: [a1, a2],
          teamB: [b1, b2],
        },
        court
      );
      firstTwosomeCounts.set(a1, (firstTwosomeCounts.get(a1) ?? 0) + 1);
      firstTwosomeCounts.set(a2, (firstTwosomeCounts.get(a2) ?? 0) + 1);

      for (const id of [a1, a2, b1, b2]) {
        playedCounts.set(id, (playedCounts.get(id) ?? 0) + 1);
        recordCourtAssignment(courtCounts, id, court);
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

  const sideBalancedRows = balanceDoublesServingSidesInSchedule(
    output,
    activePlayers.map((player) => player.id)
  );

  return balanceDoublesCourtsInSchedule(
    sideBalancedRows,
    activePlayers.map((player) => player.id)
  );
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

function assignPlayersToBalancedPools(players: PlayerSlot[], poolCount: number, mixed: boolean) {
  const assignments = new Map<string, number>();

  if (mixed) {
    const men = players.filter((player) => player.gender === 'male');
    const women = players.filter((player) => player.gender === 'female');

    men.forEach((player, index) => assignments.set(player.id, (index % poolCount) + 1));
    women.forEach((player, index) => assignments.set(player.id, (index % poolCount) + 1));
  } else {
    players.forEach((player, index) => assignments.set(player.id, (index % poolCount) + 1));
  }

  return players.map((player) => ({
    ...player,
    pool_number: assignments.get(player.id) || 1,
  }));
}

function buildPoolSchedule(
  players: PlayerSlot[],
  poolCount: number,
  rounds: number,
  courts: number,
  doublesMode: string | null
): ScheduleRow[] {
  const courtsPerPool = Math.floor(courts / poolCount);
  if (courtsPerPool < 1) return [];

  return Array.from({ length: poolCount }, (_, index) => index + 1).flatMap((poolNumber) => {
    const poolPlayers = players.filter((player) => player.pool_number === poolNumber);
    const rows = buildSchedule(poolPlayers, rounds, courtsPerPool, 'doubles', doublesMode);
    const courtOffset = (poolNumber - 1) * courtsPerPool;

    return rows.map((row) => ({
      ...row,
      court_number: row.court_number === null ? null : row.court_number + courtOffset,
    }));
  });
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

function hasCompletedBestOf3Game(match: Match): boolean {
  return (
    (match.game_1_a !== null && match.game_1_b !== null) ||
    (match.game_2_a !== null && match.game_2_b !== null) ||
    (match.game_3_a !== null && match.game_3_b !== null)
  );
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
  isBestOf3: boolean,
  tournamentMode?: string | null
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const playerInitialRanks = new Map<string, number>();

  for (const slot of playerSlots) {
    playerInitialRanks.set(slot.id, slot.slot_number);

    rows.set(slot.id, {
      playerId: slot.id,
      name: slot.display_name || `Player ${slot.slot_number}`,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      initialRank: slot.slot_number,
      finalCourt: null,
      finalCourtWins: 0,
      finalCourtLosses: 0,
    });
  }

  const completedMatches = matches.filter(
    (match) =>
      !match.is_bye &&
      (isBestOf3 ? hasCompletedBestOf3Game(match) : match.is_complete) &&
      match.team_a_player_1_id !== null &&
      match.team_b_player_1_id !== null
  );

  const latestCompletedRound = completedMatches.length
    ? Math.max(...completedMatches.map((match) => match.round_number))
    : 0;

  const latestMatchByPlayer = new Map<string, Match>();

  for (const match of completedMatches) {
    const aIds = isSingles
  ? ([match.team_a_player_1_id].filter(Boolean) as string[])
  : ([match.team_a_player_1_id, match.team_a_player_2_id].filter(Boolean) as string[]);

    const bIds = isSingles
  ? ([match.team_b_player_1_id].filter(Boolean) as string[])
  : ([match.team_b_player_1_id, match.team_b_player_2_id].filter(Boolean) as string[]);

    for (const id of [...aIds, ...bIds]) {
      const currentLatest = latestMatchByPlayer.get(id);

      if (
        !currentLatest ||
        match.round_number > currentLatest.round_number ||
        (match.round_number === currentLatest.round_number &&
          (match.court_number ?? 999) < (currentLatest.court_number ?? 999))
      ) {
        latestMatchByPlayer.set(id, match);
      }
    }

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
    .map((row) => {
      const latestMatch = latestMatchByPlayer.get(row.playerId);

      return {
        ...row,
        pointDiff: row.pointsFor - row.pointsAgainst,
        finalCourt: latestMatch?.court_number ?? null,
      };
    })
    .sort((a, b) => {
      if (tournamentMode === 'cream_of_the_crop') {
        const aCourt = a.finalCourt ?? 999;
        const bCourt = b.finalCourt ?? 999;

        if (aCourt !== bCourt) return aCourt - bCourt;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        return a.initialRank - b.initialRank;
      }

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

function buildStandardSeedOrder(size: number): number[] {
  if (size === 1) return [1];
  let order = [1, 2];
  while (order.length < size) {
    const nextSize = order.length * 2;
    order = order.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return order;
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

  badges.push(tournament.match_format === 'best_of_3'
    ? 'Best of 3'
    : tournament.match_format === 'two_game'
      ? 'Two Games'
      : 'Single Game');

  return badges;
}

export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [organizationBrand, setOrganizationBrand] = useState<OrganizationBrand | null>(null);
  const [leagueSession, setLeagueSession] = useState<{ league_id: string; session_number: number } | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playoffMatches, setPlayoffMatches] = useState<PlayoffMatch[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');

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
  const [newDuprIds, setNewDuprIds] = useState<Record<string, string>>({});
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [playoffScoreDrafts, setPlayoffScoreDrafts] = useState<
  Record<string, Partial<ScoreDraft>>
  >({});
  const [isSavingNames, setIsSavingNames] = useState(false);
  const [editedTournamentTitle, setEditedTournamentTitle] = useState('');
  const [isSavingTournamentTitle, setIsSavingTournamentTitle] = useState(false);
  const [isSavingScoreReporting, setIsSavingScoreReporting] = useState(false);
  const scoreSubmitLockRef = useRef(false);
  const pendingScoreSubmitIdsRef = useRef<Set<string>>(new Set());
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

function scheduleTournamentRefresh(currentUserId?: string) {
  if (refreshTimeoutRef.current) {
    clearTimeout(refreshTimeoutRef.current);
  }

  refreshTimeoutRef.current = setTimeout(() => {
    void loadTournamentData(currentUserId);
  }, 400);
}

function nowForScoreSubmitTiming() {
  if (typeof performance === 'undefined') return Date.now();
  return performance.now();
}

function scoreSubmitElapsedMs(startedAt: number) {
  return Math.round(nowForScoreSubmitTiming() - startedAt);
}

function logScoreSubmitTiming(
  label: string,
  startedAt: number,
  details: Record<string, unknown> = {}
) {
  if (typeof window === 'undefined') return;

  console.info('[DinkDraw score submit]', label, {
    durationMs: scoreSubmitElapsedMs(startedAt),
    ...details,
  });
}
  const [submittingScoreId, setSubmittingScoreId] = useState<string | null>(null);
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
  const playoffsAllowedForTournament =
  tournament?.tournament_mode === 'round_robin' &&
  (tournament?.pool_brackets_enabled || tournament?.format === 'singles' ||
    (tournament?.format === 'doubles' && tournament?.doubles_mode === 'fixed'));
  
  const isBestOf3 = tournament?.match_format === 'best_of_3';
  const isTwoGame = tournament?.match_format === 'two_game';
  const isMultiGame = isBestOf3 || isTwoGame;
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

  const getMatchPoolNumber = (match: Match) =>
    playersById[match.team_a_player_1_id || '']?.pool_number ||
    playersById[match.team_b_player_1_id || '']?.pool_number ||
    null;
  const getMatchLocationLabel = (match: Match) => {
    const court = getCourtLabel(tournament, match.court_number) || '-';
    const poolNumber = getMatchPoolNumber(match);
    return poolNumber ? `Pool ${poolNumber} • ${court}` : court;
  };

  const poolStandings = useMemo(() => {
    if (!tournament?.pool_brackets_enabled) return [];
    const poolNumbers = Array.from(new Set(playerSlots.map((player) => player.pool_number).filter((value): value is number => value !== null))).sort((a, b) => a - b);
    return poolNumbers.map((poolNumber) => {
      const poolPlayers = playerSlots.filter((player) => player.pool_number === poolNumber);
      const poolPlayerIds = new Set(poolPlayers.map((player) => player.id));
      const poolMatches = matches.filter((match) => !!match.team_a_player_1_id && poolPlayerIds.has(match.team_a_player_1_id));
      return {
        poolNumber,
        standings: computeStandings(poolPlayers, poolMatches, isSingles, isMultiGame, tournament.tournament_mode),
      };
    });
  }, [tournament, playerSlots, matches, isSingles, isMultiGame]);

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

    if (isCompleted) {
      const lastCompletedRound = [...roundsAvailable]
        .reverse()
        .find((round) =>
          matches.some(
            (m) => m.round_number === round && !m.is_bye && m.is_complete
          )
        );

      return lastCompletedRound || roundsAvailable[0] || 1;
    }

    for (const round of roundsAvailable) {
      const roundMatches = matches.filter((m) => m.round_number === round && !m.is_bye);
      if (!roundMatches.length) continue;
      if (!roundMatches.every((m) => m.is_complete)) return round;
    }

    return roundsAvailable[roundsAvailable.length - 1] || 1;
  }, [matches, roundsAvailable, isCompleted]);

    const finalRound = useMemo(() => {
    if (isCompleted) {
      const lastCompletedRound = [...roundsAvailable]
        .reverse()
        .find((round) =>
          matches.some(
            (m) => m.round_number === round && !m.is_bye && m.is_complete
          )
        );

      return lastCompletedRound || roundsAvailable[0] || 1;
    }

    return roundsAvailable[roundsAvailable.length - 1] || 1;
  }, [matches, roundsAvailable, isCompleted]);

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
    const statusMap = new Map<number, 'current' | 'complete' | 'upcoming' | 'not_played'>();

    for (const round of roundsAvailable) {
      const roundMatches = matches.filter((m) => m.round_number === round && !m.is_bye);

      if (isCompleted) {
        if (roundMatches.length && roundMatches.every((m) => m.is_complete)) {
          statusMap.set(round, 'complete');
        } else {
          statusMap.set(round, 'not_played');
        }
        continue;
      }

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
  }, [matches, roundsAvailable, currentRound, isCompleted]);

  const matchesForSelectedRound = useMemo(
    () => matches.filter((m) => m.round_number === selectedRound && !m.is_bye),
    [matches, selectedRound]
  );

  const currentCreamStageStatus = useMemo(
    () =>
      SHOW_CREAM_STAGE_STATUS && tournament?.tournament_mode === 'cream_of_the_crop'
        ? buildCreamStageStatusMap(playerSlots, matches, currentRound)
        : new Map(),
    [tournament?.tournament_mode, playerSlots, matches, currentRound]
  );

  const selectedCreamStageStatus = useMemo(
    () =>
      SHOW_CREAM_STAGE_STATUS && tournament?.tournament_mode === 'cream_of_the_crop'
        ? buildCreamStageStatusMap(playerSlots, matches, selectedRound)
        : new Map(),
    [tournament?.tournament_mode, playerSlots, matches, selectedRound]
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
    setStandings(
  computeStandings(
    playerSlots,
    matches,
    isSingles,
    isMultiGame,
    tournament?.tournament_mode
  )
);
  }, [playerSlots, matches, isSingles, isMultiGame, tournament?.tournament_mode]);

  const isOrganizer = tournament?.organizer_user_id === userId;

  const isCoOrganizer =
    !!tournament?.co_organizer_user_id &&
    !!userId &&
    tournament.co_organizer_user_id === userId;

  const canManageScores = isOrganizer || isCoOrganizer;

  function isClaimedPlayerInMatch(match: Match) {
    if (!claimedSlot) return false;

    return (
      match.team_a_player_1_id === claimedSlot.id ||
      match.team_a_player_2_id === claimedSlot.id ||
      match.team_b_player_1_id === claimedSlot.id ||
      match.team_b_player_2_id === claimedSlot.id
    );
  }

  function canReportMatchScore(match: Match) {
    if (canManageScores) return true;
    return (
      !!tournament?.allow_player_score_reporting &&
      !!claimedSlot &&
      isStarted &&
      !isCompleted &&
      (!!tournament.allow_any_player_score_reporting || isClaimedPlayerInMatch(match))
    );
  }

  function getScoreLockedLabel(match: Match) {
    if (canManageScores) return 'Scores Locked';
    if (!tournament?.allow_player_score_reporting) return 'Scores Locked';
    if (!claimedSlot) return 'Claim Your Spot to Score';
    if (tournament.allow_any_player_score_reporting) return 'Scores Locked';
    if (!isClaimedPlayerInMatch(match)) return 'Only Players in This Match Can Score';
    return 'Scores Locked';
  }

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
    const [
  tournamentResult,
  playersResult,
  matchesResult,
  playoffMatchesResult,
  leagueSessionResult,
] = await Promise.all([
  supabase.from('tournaments').select('*').eq('id', params.id).maybeSingle(),
  supabase
    .from('tournament_players')
    .select('*')
    .eq('tournament_id', params.id)
    .order('slot_number', { ascending: true }),
  supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', params.id)
    .order('round_number', { ascending: true })
    .order('court_number', { ascending: true }),
  supabase
    .from('playoff_matches')
    .select('*')
    .eq('tournament_id', params.id)
    .order('round_number', { ascending: true })
    .order('match_number', { ascending: true }),
  supabase.from('league_sessions').select('league_id, session_number').eq('tournament_id', params.id).maybeSingle(),
]);

const tournamentData = tournamentResult.data;
const playersData = playersResult.data;
const safeMatches = matchesResult.data || [];

const loadError =
  tournamentResult.error ||
  playersResult.error ||
  matchesResult.error ||
  playoffMatchesResult.error;

if (loadError) {
  console.error('Failed to refresh tournament data:', loadError);
  return;
}

setTournament(tournamentData || null);
setPlayerSlots(playersData || []);
setMatches((prev) => {
  if (!pendingScoreSubmitIdsRef.current.size) return safeMatches;

  const previousById = new Map(prev.map((match) => [match.id, match]));

  return safeMatches.map((match) => {
    if (!pendingScoreSubmitIdsRef.current.has(match.id)) return match;
    return previousById.get(match.id) || match;
  });
});
setPlayoffMatches(playoffMatchesResult.data || []);
setLeagueSession(leagueSessionResult.data || null);

setOrganizationBrand(await loadPublicOrganizationBrand(supabase, tournamentData?.organization_id));

setScoreDrafts((prev) => {
  const next: Record<string, ScoreDraft> = {};

  for (const match of safeMatches) {
    const previousDraft = prev[match.id];
    const draftValue = (field: keyof ScoreDraft, databaseValue: number | null) => {
      // Do not replace a score that someone is actively typing when polling or
      // Realtime refreshes an incomplete match.
      if (!match.is_complete && previousDraft) return previousDraft[field];
      return databaseValue === null ? '' : String(databaseValue);
    };

    next[match.id] = {
      team_a_score: draftValue('team_a_score', match.team_a_score),
      team_b_score: draftValue('team_b_score', match.team_b_score),
      game_1_a: draftValue('game_1_a', match.game_1_a),
      game_1_b: draftValue('game_1_b', match.game_1_b),
      game_2_a: draftValue('game_2_a', match.game_2_a),
      game_2_b: draftValue('game_2_b', match.game_2_b),
      game_3_a: draftValue('game_3_a', match.game_3_a),
      game_3_b: draftValue('game_3_b', match.game_3_b),
    };
  }

  return next;
});
}

  useEffect(() => {
    async function load() {
  setIsLoading(true);

  // Run auth AND tournament data at the same time instead of one after another
  const [{ data: authData }] = await Promise.all([
    supabase.auth.getUser(),
    loadTournamentData(),
  ]);

  const currentUserId = authData.user?.id ?? '';
  setUserId(currentUserId);

  // Load co-organizers after auth resolves, but don't block the page on it
  if (currentUserId) {
    supabase
      .from('saved_co_organizers')
      .select('id, name, email')
      .eq('user_id', currentUserId)
      .order('name', { ascending: true })
      .then(({ data: savedAdmins }) => {
        setSavedCoOrganizers(savedAdmins || []);
      });
  }

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
   () => {
  scheduleTournamentRefresh(userId);
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
  () => {
  scheduleTournamentRefresh(userId);
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
        () => {
  scheduleTournamentRefresh(userId);
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
        () => {
  scheduleTournamentRefresh(userId);
}
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [params.id, supabase, userId]);

  // Poll even while Realtime reports connected. Mobile WebViews can leave a
  // WebSocket looking subscribed after an app sleeps or changes networks.
useEffect(() => {
  const interval = setInterval(() => {
    void loadTournamentData(userId);
  }, 5000);

  return () => clearInterval(interval);
}, [userId]);

    useEffect(() => {
  async function handleVisibilityRefresh() {
    if (document.visibilityState !== 'visible') return;

    try {
      await loadTournamentData();
    } catch (err) {
      console.error(
        'Failed to refresh tournament after app resume',
        err
      );
    }
  }

  document.addEventListener(
    'visibilitychange',
    handleVisibilityRefresh
  );

  return () => {
    document.removeEventListener(
      'visibilitychange',
      handleVisibilityRefresh
    );
  };
}, []);

  useEffect(() => {
    let removeAppStateListener: (() => Promise<void>) | undefined;

    async function listenForNativeAppResume() {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void loadTournamentData(userId);
        });
        removeAppStateListener = () => listener.remove();
      } catch (err) {
        console.warn('Native app resume refresh is unavailable:', err);
      }
    }

    void listenForNativeAppResume();

    return () => {
      void removeAppStateListener?.();
    };
  }, [userId]);
    
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

    async function sharePublicLink() {
    try {
      if (!publicViewUrl) return;

      if (navigator.share) {
        await navigator.share({
          title: `${tournament?.title || 'DinkDraw Tournament'} Live View`,
          text: `Follow ${tournament?.title || 'this tournament'} live on DinkDraw:`,
          url: publicViewUrl,
        });

        setMessage('Share link opened.');
        return;
      }

      await navigator.clipboard.writeText(publicViewUrl);
      setMessage('Public link copied.');
    } catch {
      setMessage('Could not share public link.');
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
    const slot = playerSlots.find((player) => player.id === slotId);
    if (!slot) {
      setMessage('That player spot could not be found.');
      return;
    }

    const spotLabel = slot.display_name?.trim() || `Player ${slot.slot_number}`;
    const confirmed = window.confirm(
      `Claim ${spotLabel}? This links your DinkDraw account to this player's tournament results and cannot be undone after the tournament starts.`
    );
    if (!confirmed) return;

    const { data, error } = await supabase.rpc('claim_tournament_player_spot', {
      p_slot_id: slotId,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadTournamentData(user.id);
    const claimResult = Array.isArray(data) ? data[0] : data;
    if (claimResult?.tournament_status !== 'completed') {
      void sendTournamentPushEvent(supabase, {
        eventType: 'spot_claimed',
        tournamentId: params.id,
        slotId,
      });
    }
    setMessage(
      claimResult?.tournament_status === 'completed'
        ? 'Spot claimed. Your completed tournament results are now linked to your account.'
        : 'Spot claimed.'
    );
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
      spot_claim_push_claimed_at: null,
      spot_claim_push_completed_at: null,
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

async function unlinkClaimedAccount(slotId: string) {
  if (!canManageScores) {
    setMessage('Only a tournament organizer can unlink a player account.');
    return;
  }

  const slot = playerSlots.find((player) => player.id === slotId);
  if (!slot?.claimed_by_user_id) {
    setMessage('That player spot is not linked to an account.');
    return;
  }

  const playerName = slot.display_name?.trim() || `Player ${slot.slot_number}`;
  const confirmed = window.confirm(
    `Unlink the DinkDraw account from ${playerName}? The player name, scores, standings, and tournament results will remain unchanged. The linked account's personal stats from this tournament will be removed.`
  );
  if (!confirmed) return;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    setMessage('Sign in first.');
    return;
  }

  const { error } = await supabase.rpc('unlink_tournament_player_account', {
    p_slot_id: slotId,
  });

  if (error) {
    setMessage(`Could not unlink account: ${error.message}`);
    return;
  }

  await loadTournamentData(authData.user.id);
  setMessage(`${playerName}'s account was unlinked. The tournament results were preserved.`);
}

async function saveTournamentTitle() {
  if (!isOrganizer || !tournament) {
    setMessage('Only the organizer can rename this tournament.');
    return;
  }

  const nextTitle = editedTournamentTitle.trim();

  if (!nextTitle) {
    setMessage('Tournament name cannot be blank.');
    return;
  }

  if (nextTitle === tournament.title) {
    setMessage('Tournament name is already up to date.');
    return;
  }

  setIsSavingTournamentTitle(true);
  setMessage('');

  const { error } = await supabase
    .from('tournaments')
    .update({ title: nextTitle })
    .eq('id', tournament.id)
    .eq('organizer_user_id', userId);

  if (error) {
    setMessage(`Tournament name update failed: ${error.message}`);
    setIsSavingTournamentTitle(false);
    return;
  }

  setTournament((prev) => (prev ? { ...prev, title: nextTitle } : prev));
  setEditedTournamentTitle('');
  setMessage('Tournament name updated.');
  setIsSavingTournamentTitle(false);
}

async function updateScoreReportingSettings({
  allowOwnMatchScores,
  allowAnyMatchScores,
}: {
  allowOwnMatchScores: boolean;
  allowAnyMatchScores: boolean;
}) {
  if (!tournament || !isOrganizer) {
    setMessage('Only the organizer can change score reporting settings.');
    return;
  }

  const nextAllowAny = allowAnyMatchScores;
  const nextAllowOwn = allowOwnMatchScores || nextAllowAny;

  setIsSavingScoreReporting(true);
  setMessage('');

  const { error } = await supabase
    .from('tournaments')
    .update({
      allow_player_score_reporting: nextAllowOwn,
      allow_any_player_score_reporting: nextAllowAny,
    })
    .eq('id', tournament.id)
    .eq('organizer_user_id', userId);

  if (error) {
    setMessage(`Score reporting update failed: ${error.message}`);
    setIsSavingScoreReporting(false);
    return;
  }

  setTournament((prev) =>
    prev
      ? {
          ...prev,
          allow_player_score_reporting: nextAllowOwn,
          allow_any_player_score_reporting: nextAllowAny,
        }
      : prev
  );
  setMessage('Score reporting settings updated.');
  setIsSavingScoreReporting(false);
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

        const typedDuprId = (newDuprIds[slot.id] ?? slot.dupr_id ?? '').trim();
        const savedDuprId = (slot.dupr_id ?? '').trim();
        const nextDuprId = typedDuprId || null;

        const nameChanged = nextName !== savedName;
        const duprChanged = (nextDuprId ?? '') !== savedDuprId;

        if (!nameChanged && !duprChanged) {
          return null;
        }

        if (slot.claimed_by_user_id && nextName === '') {
          return null;
        }

        return supabase
          .from('tournament_players')
          .update({
            display_name: nextName,
            dupr_id: nextDuprId,
          })
          .eq('id', slot.id);
      })
      .filter(Boolean);

    if (updates.length === 0) {
      setMessage('No player name changes to save.');
      setIsSavingNames(false);
      return;
    }

    const results = await Promise.all(updates);

    const failed = results.find((result) => result?.error);

    if (failed?.error) {
      setMessage(`Save failed: ${failed.error.message}`);
      setIsSavingNames(false);
      return;
    }

    await loadTournamentData();
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
      dupr_id: null,
      spot_claim_push_claimed_at: null,
      spot_claim_push_completed_at: null,
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

  if (!canManageScores) {
    setMessage('Only the organizer or co-organizer can start this tournament.');
    return;
  }

    if (isScheduleLocked) {
      setMessage('Schedule is locked once the tournament has started.');
      return;
    }

    setMessage('');
    setIsStarting(true);
    try {
      const updates = playerSlots.flatMap((slot) => {
  const typedName = (newNames[slot.id] ?? '').trim();
  const savedName = (slot.display_name ?? '').trim();
  const nextName = typedName || savedName;

  if (nextName === savedName) {
    return [];
  }

  return [
    supabase
      .from('tournament_players')
      .update({ display_name: nextName })
      .eq('id', slot.id),
  ];
});

const results = updates.length > 0 ? await Promise.all(updates) : [];

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

      if (tournament.pool_brackets_enabled) {
        const unlinkedPlayers = namedPlayers.filter((slot) => !slot.claimed_by_user_id);
        if (unlinkedPlayers.length > 0) {
          setMessage(`Every player must claim their spot with a DinkDraw account before this tournament can start. ${unlinkedPlayers.length} player${unlinkedPlayers.length === 1 ? ' is' : 's are'} still unlinked.`);
          setIsStarting(false);
          return;
        }
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

      const poolCount = tournament.pool_count || 0;
      let scheduledPlayers = namedPlayers as PlayerSlot[];

      if (tournament.pool_brackets_enabled) {
        if (poolCount < 2 || namedPlayers.length % poolCount !== 0) {
          setMessage('Pool play requires players to divide evenly across every pool.');
          setIsStarting(false);
          return;
        }
        if (availableCourts < poolCount) {
          setMessage(`Pool play needs at least ${poolCount} courts so every pool can play each round.`);
          setIsStarting(false);
          return;
        }

        scheduledPlayers = assignPlayersToBalancedPools(
          namedPlayers as PlayerSlot[],
          poolCount,
          tournament.doubles_mode === 'mixed'
        );

        if (tournament.doubles_mode === 'mixed') {
          const poolsAreBalanced = Array.from({ length: poolCount }, (_, index) => index + 1).every((poolNumber) => {
            const pool = scheduledPlayers.filter((player) => player.pool_number === poolNumber);
            return pool.filter((player) => player.gender === 'male').length ===
              pool.filter((player) => player.gender === 'female').length;
          });
          if (!poolsAreBalanced) {
            setMessage('Each mixed pool must contain the same number of men and women.');
            setIsStarting(false);
            return;
          }
        }

        const poolUpdates = await Promise.all(
          scheduledPlayers.map((player) =>
            supabase.from('tournament_players').update({ pool_number: player.pool_number }).eq('id', player.id)
          )
        );
        const failedPoolUpdate = poolUpdates.find((result) => result.error);
        if (failedPoolUpdate?.error) {
          setMessage(`Could not save pool assignments: ${failedPoolUpdate.error.message}`);
          setIsStarting(false);
          return;
        }
      }

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
        : tournament.pool_brackets_enabled
        ? buildPoolSchedule(
            scheduledPlayers,
            poolCount,
            tournament.rounds,
            availableCourts,
            tournament.doubles_mode
          )
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
      void sendTournamentPushEvent(supabase, {
        eventType: 'tournament_started',
        tournamentId: tournament.id,
      });
      setActiveTab('rounds');
      setSelectedRound(1);
      setMessage('Tournament started.');
    } catch (err) {
      setMessage(err instanceof Error ? `Start failed: ${err.message}` : 'Start failed.');
    }
    setIsStarting(false);
  }

  async function generatePoolPostseasonBrackets() {
    if (!tournament) return;

    const standingByPlayerId = new Map(standings.map((standing) => [standing.playerId, standing]));
    const rankPlayers = (players: PlayerSlot[]) => [...players].sort((a, b) => {
      const aStanding = standingByPlayerId.get(a.id);
      const bStanding = standingByPlayerId.get(b.id);
      if ((bStanding?.wins || 0) !== (aStanding?.wins || 0)) return (bStanding?.wins || 0) - (aStanding?.wins || 0);
      if ((bStanding?.pointDiff || 0) !== (aStanding?.pointDiff || 0)) return (bStanding?.pointDiff || 0) - (aStanding?.pointDiff || 0);
      return a.slot_number - b.slot_number;
    });

    const championshipPlayers: PlayerSlot[] = [];
    const consolationPlayers: PlayerSlot[] = [];
    const poolCount = tournament.pool_count || 0;
    const qualifiersPerGender = tournament.pool_qualifiers_per_gender || 1;

    for (let poolNumber = 1; poolNumber <= poolCount; poolNumber += 1) {
      const pool = playerSlots.filter((player) => player.pool_number === poolNumber && (player.display_name || '').trim());
      if (tournament.doubles_mode === 'mixed') {
        for (const gender of ['male', 'female']) {
          const ranked = rankPlayers(pool.filter((player) => player.gender === gender));
          championshipPlayers.push(...ranked.slice(0, qualifiersPerGender));
          consolationPlayers.push(...ranked.slice(qualifiersPerGender));
        }
      } else {
        const ranked = rankPlayers(pool);
        const advanceCount = Math.floor(ranked.length / 2);
        championshipPlayers.push(...ranked.slice(0, advanceCount));
        consolationPlayers.push(...ranked.slice(advanceCount));
      }
    }

    type PostseasonTeam = { player1Id: string; player2Id: string; seed: number };
    const formTeams = (players: PlayerSlot[]): PostseasonTeam[] => {
      if (tournament.doubles_mode === 'mixed') {
        const men = rankPlayers(players.filter((player) => player.gender === 'male'));
        const women = rankPlayers(players.filter((player) => player.gender === 'female'));
        return men.slice(0, Math.min(men.length, women.length)).map((man, index) => ({
          player1Id: man.id,
          player2Id: women[index].id,
          seed: index + 1,
        }));
      }

      const ranked = rankPlayers(players);
      const teams: PostseasonTeam[] = [];
      for (let index = 0; index + 1 < ranked.length; index += 2) {
        teams.push({ player1Id: ranked[index].id, player2Id: ranked[index + 1].id, seed: teams.length + 1 });
      }
      return teams;
    };

    const brackets = [
      { type: 'championship' as const, teams: formTeams(championshipPlayers) },
      { type: 'consolation' as const, teams: formTeams(consolationPlayers) },
    ];

    if (brackets.some((bracket) => bracket.teams.length < 2)) {
      setMessage('Each postseason bracket needs at least two complete teams.');
      return;
    }

    const rows = brackets.flatMap((bracket) => {
      const bracketSize = nextPowerOfTwo(bracket.teams.length);
      const slotSeeds = buildStandardSeedOrder(bracketSize).map((seed) => seed <= bracket.teams.length ? seed : null);
      const firstRoundPairs: Array<[number | null, number | null]> = [];
      for (let index = 0; index < slotSeeds.length; index += 2) firstRoundPairs.push([slotSeeds[index], slotSeeds[index + 1]]);
      const roundCounts: number[] = [];
      for (let count = firstRoundPairs.length; count >= 1; count = Math.ceil(count / 2)) {
        roundCounts.push(count);
        if (count === 1) break;
      }

      return roundCounts.flatMap((matchCount, roundIndex) =>
        Array.from({ length: matchCount }, (_, matchIndex) => {
          const pair = roundIndex === 0 ? firstRoundPairs[matchIndex] : null;
          const seedA = pair?.[0] || null;
          const seedB = pair?.[1] || null;
          const teamA = seedA ? bracket.teams[seedA - 1] : null;
          const teamB = seedB ? bracket.teams[seedB - 1] : null;
          const isBye = roundIndex === 0 && !!teamA && !teamB;
          return {
            tournament_id: tournament.id,
            bracket_type: bracket.type,
            round_number: roundIndex + 1,
            match_number: matchIndex + 1,
            round_label: getPlayoffRoundLabel(roundIndex + 1, roundCounts.length),
            team_a_seed: seedA,
            team_b_seed: seedB,
            team_a_player_1_id: teamA?.player1Id || null,
            team_a_player_2_id: teamA?.player2Id || null,
            team_b_player_1_id: teamB?.player1Id || null,
            team_b_player_2_id: teamB?.player2Id || null,
            winner_team: isBye ? 'A' : null,
            winner_player_1_id: isBye ? teamA?.player1Id || null : null,
            winner_player_2_id: isBye ? teamA?.player2Id || null : null,
            next_match_id: null,
            next_match_team: null,
            is_bye: isBye,
            is_complete: isBye,
            match_format: tournament.bracket_match_format || 'single',
            games_to: tournament.bracket_games_to || 11,
            deciding_game_to: tournament.bracket_deciding_game_to,
          };
        })
      );
    });

    const { error: deleteError } = await supabase.from('playoff_matches').delete().eq('tournament_id', tournament.id);
    if (deleteError) { setMessage(`Could not reset postseason brackets: ${deleteError.message}`); return; }
    const { data: inserted, error: insertError } = await supabase.from('playoff_matches').insert(rows).select('*');
    if (insertError || !inserted) { setMessage(`Could not generate postseason brackets: ${insertError?.message || 'No matches returned.'}`); return; }

    const matchMap = new Map<string, PlayoffMatch>();
    for (const match of inserted as PlayoffMatch[]) matchMap.set(`${match.bracket_type}-${match.round_number}-${match.match_number}`, match);
    const updates: any[] = [];
    for (const match of inserted as PlayoffMatch[]) {
      const nextMatch = matchMap.get(`${match.bracket_type}-${match.round_number + 1}-${Math.ceil(match.match_number / 2)}`);
      if (!nextMatch) continue;
      const nextTeam = match.match_number % 2 === 1 ? 'A' : 'B';
      updates.push(supabase.from('playoff_matches').update({ next_match_id: nextMatch.id, next_match_team: nextTeam }).eq('id', match.id));
      if (match.is_bye && match.winner_player_1_id) {
        updates.push(supabase.from('playoff_matches').update(nextTeam === 'A' ? {
          team_a_seed: match.team_a_seed, team_a_player_1_id: match.winner_player_1_id, team_a_player_2_id: match.winner_player_2_id,
        } : {
          team_b_seed: match.team_a_seed, team_b_player_1_id: match.winner_player_1_id, team_b_player_2_id: match.winner_player_2_id,
        }).eq('id', nextMatch.id));
      }
    }
    const updateResults = await Promise.all(updates);
    const failed = updateResults.find((result) => result.error);
    if (failed?.error) { setMessage(`Brackets generated, but linking failed: ${failed.error.message}`); return; }
    const { error: tournamentError } = await supabase.from('tournaments').update({ playoff_status: 'started' }).eq('id', tournament.id);
    if (tournamentError) { setMessage(`Could not start postseason: ${tournamentError.message}`); return; }
    await loadTournamentData(userId);
    setMessage('Championship and consolation brackets generated. Partnerships are now locked.');
  }

  async function generatePlayoffBracket() {
  if (!tournament) return;

  if (!isOrganizer) {
    setMessage('Only the organizer can generate the playoff bracket.');
    return;
  }

  if (!tournament.pool_brackets_enabled && tournament.playoff_format === 'none') {
    setMessage('This tournament does not have playoffs enabled.');
    return;
  }

    if (!playoffsAllowedForTournament && !tournament.pool_brackets_enabled) {
  setMessage('Playoffs are only available for Singles and Fixed Partners tournaments.');
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

  if (tournament.pool_brackets_enabled) {
    await generatePoolPostseasonBrackets();
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
      } catch (err) {
  console.warn('Could not save rematch tournament shortcut:', err);
}

      window.location.href = `/tournament/${newTournament.id}`;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create rematch tournament.');
      setIsRematching(false);
    }
  }

  function setDraftScore(matchId: string, field: keyof ScoreDraft, value: string) {
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
    const match = matches.find((m) => m.id === matchId);
    if (!match || !canReportMatchScore(match)) return;
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

  async function markTournamentCompleted(force = false) {
    if (!tournament || isCompleted) return true;
    if (tournament.pool_brackets_enabled && tournament.playoff_status !== 'completed' && !force) {
      return true;
    }
    const { error } = await supabase
      .from('tournaments')
      .update({ status: 'completed' })
      .eq('id', tournament.id);
    if (error) {
      setMessage(`Tournament completion failed: ${error.message}`);
      return false;
    }
    setTournament((prev) => (prev ? { ...prev, status: 'completed' } : prev));
    void sendTournamentPushEvent(supabase, {
      eventType: 'tournament_completed',
      tournamentId: tournament.id,
    });
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
    const completed = await markTournamentCompleted(true);
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
    } catch (err) {
  console.warn('Could not clear last tournament shortcut:', err);
}
    
    setIsDeletingTournament(false);
    router.push('/my-tournaments');
  }

  async function runWithScoreSubmitLock(
  scoreId: string,
  action: () => Promise<void>
) {
  if (scoreSubmitLockRef.current) {
    setMessage('A score is already being submitted. Please wait.');
    return;
  }

  scoreSubmitLockRef.current = true;
  setSubmittingScoreId(scoreId);

  try {
    await action();
  } finally {
    scoreSubmitLockRef.current = false;
    setSubmittingScoreId(null);
  }
}

  async function submitGame(matchId: string, game: 1 | 2 | 3) {
   
  const lockedMatch = matches.find((m) => m.id === matchId);
  if (lockedMatch?.is_complete) {
    setMessage('This match is locked. Reopen it before editing.');
    return;
  }

if (!lockedMatch || !canReportMatchScore(lockedMatch)) {
  setMessage(
    lockedMatch && !canManageScores && claimedSlot && !isClaimedPlayerInMatch(lockedMatch)
      ? 'Only players in this match can submit this score.'
      : 'Scores are locked for this tournament.'
  );
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
    const submitStartedAt = nowForScoreSubmitTiming();

    const optimisticMatchWithSubmittedGame: Match = {
      ...currentMatch,
      [`game_${game}_a`]: aNum,
      [`game_${game}_b`]: bNum,
    };

    const optimisticMatch = isTwoGame
      ? optimisticMatchWithSubmittedGame
      : clearGame3IfSeriesDecidedInTwo(optimisticMatchWithSubmittedGame);

    const seriesNowComplete = isTwoGame
      ? optimisticMatch.game_1_a !== null && optimisticMatch.game_1_b !== null && optimisticMatch.game_2_a !== null && optimisticMatch.game_2_b !== null
      : isSeriesComplete(optimisticMatch);

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

    pendingScoreSubmitIdsRef.current.add(matchId);
    setMatches(optimisticMatches);
    setStandings(computeStandings(   playerSlots,   optimisticMatches,   isSingles,   isMultiGame,   tournament?.tournament_mode ));
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
        setActiveTab(tournament?.pool_brackets_enabled ? 'rounds' : 'standings');
        setMessage(tournament?.pool_brackets_enabled ? 'Pool play complete. Generate the postseason brackets.' : 'Series complete. Tournament finished!');
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

    const databaseStartedAt = nowForScoreSubmitTiming();

    const { error, count } = await supabase
      .from('matches')
      .update(updateData, { count: 'exact' })
      .eq('id', matchId);

    if (error || count === 0) {
      pendingScoreSubmitIdsRef.current.delete(matchId);
      setMatches(previousMatches);
      setStandings(computeStandings(   playerSlots,   previousMatches,   isSingles,   isMultiGame,   tournament?.tournament_mode ));
      setMessage(
        error
          ? `Submit failed: ${error.message}`
          : 'Submit failed: the database did not find this game. Please refresh and try again.'
      );
      return;
    }

    logScoreSubmitTiming('best-of-3 game saved', submitStartedAt, {
      databaseMs: scoreSubmitElapsedMs(databaseStartedAt),
      game,
      matchId,
      seriesComplete: seriesNowComplete,
    });

    pendingScoreSubmitIdsRef.current.delete(matchId);
    setMatches(optimisticMatches);
    setStandings(computeStandings(   playerSlots,   optimisticMatches,   isSingles,   isMultiGame,   tournament?.tournament_mode ));
    scheduleTournamentRefresh(userId);

    if (seriesNowComplete) {
      if (tournament) {
        void sendTournamentPushEvent(supabase, {
          eventType: 'match_score_submitted',
          tournamentId: tournament.id,
          matchId,
        });
      }

      if (!nextRound) {
        if (tournament?.pool_brackets_enabled) {
          setSelectedRound(finalRound);
          setActiveTab('rounds');
          setMessage('Pool play complete. Generate the postseason brackets.');
          return;
        }
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
  let aScore = 0;
  let bScore = 0;
  let teamAWins = false;
  let scoreUpdate: Record<string, number | null> = {};

  if (match.match_format === 'best_of_3') {
    const gameValues = [1, 2, 3].map((gameNumber) => {
      const aField = `game_${gameNumber}_a` as keyof ScoreDraft;
      const bField = `game_${gameNumber}_b` as keyof ScoreDraft;
      const storedA = match[aField as keyof PlayoffMatch] as number | null;
      const storedB = match[bField as keyof PlayoffMatch] as number | null;
      const rawA = draft?.[aField] ?? (storedA === null ? '' : String(storedA));
      const rawB = draft?.[bField] ?? (storedB === null ? '' : String(storedB));
      return { aField, bField, rawA, rawB };
    });
    if (gameValues.slice(0, 2).some((game) => !game.rawA?.trim() || !game.rawB?.trim())) {
      setMessage('Enter scores for the first two playoff games.');
      return;
    }
    const firstGameAWon = Number(gameValues[0].rawA) > Number(gameValues[0].rawB);
    const secondGameAWon = Number(gameValues[1].rawA) > Number(gameValues[1].rawB);
    if (firstGameAWon === secondGameAWon && (gameValues[2].rawA?.trim() || gameValues[2].rawB?.trim())) {
      setMessage('Game 3 is not played when a team wins the first two games.');
      return;
    }
    let aGameWins = 0;
    let bGameWins = 0;
    for (const [index, game] of gameValues.entries()) {
      if (!game.rawA?.trim() && !game.rawB?.trim()) continue;
      if (!game.rawA?.trim() || !game.rawB?.trim()) { setMessage(`Enter both scores for game ${index + 1}.`); return; }
      const gameA = Number(game.rawA);
      const gameB = Number(game.rawB);
      if (!Number.isFinite(gameA) || !Number.isFinite(gameB) || gameA === gameB) { setMessage(`Game ${index + 1} needs valid, non-tied scores.`); return; }
      scoreUpdate[game.aField] = gameA;
      scoreUpdate[game.bField] = gameB;
      if (gameA > gameB) aGameWins += 1; else bGameWins += 1;
    }
    if (aGameWins < 2 && bGameWins < 2) { setMessage('Enter a deciding third game for a 1–1 series.'); return; }
    aScore = aGameWins;
    bScore = bGameWins;
    teamAWins = aGameWins > bGameWins;
    scoreUpdate.team_a_score = aScore;
    scoreUpdate.team_b_score = bScore;
  } else {
    const aRaw = draft?.team_a_score ?? (match.team_a_score === null ? '' : String(match.team_a_score));
    const bRaw = draft?.team_b_score ?? (match.team_b_score === null ? '' : String(match.team_b_score));
    if (!aRaw?.trim() || !bRaw?.trim()) { setMessage('Enter both playoff scores before submitting.'); return; }
    aScore = Math.max(0, Number(aRaw));
    bScore = Math.max(0, Number(bRaw));
    if (Number.isNaN(aScore) || Number.isNaN(bScore)) { setMessage('Playoff scores must be valid numbers.'); return; }
    if (aScore === bScore) { setMessage('A playoff match cannot end in a tie.'); return; }
    teamAWins = aScore > bScore;
    scoreUpdate = { team_a_score: aScore, team_b_score: bScore };
  }

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
      ...scoreUpdate,
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

  if (tournament.pool_brackets_enabled) {
    const unfinishedOtherMatches = playoffMatches.filter((playoffMatch) => playoffMatch.id !== match.id && !playoffMatch.is_complete);
    const poolTournamentUpdate: Record<string, unknown> = {};
    if (match.bracket_type === 'championship') {
      poolTournamentUpdate.champion_player_1_id = winnerPlayer1Id;
      poolTournamentUpdate.champion_player_2_id = winnerPlayer2Id;
    }
    if (unfinishedOtherMatches.length === 0) {
      poolTournamentUpdate.playoff_status = 'completed';
      poolTournamentUpdate.status = 'completed';
    }
    const { error: poolTournamentError } = await supabase.from('tournaments').update(poolTournamentUpdate).eq('id', tournament.id);
    if (poolTournamentError) { setMessage(`Bracket winner saved, but tournament update failed: ${poolTournamentError.message}`); return; }
    if (unfinishedOtherMatches.length === 0) {
      void sendTournamentPushEvent(supabase, {
        eventType: 'tournament_completed',
        tournamentId: tournament.id,
      });
    }
    await loadTournamentData(userId);
    setMessage(
      unfinishedOtherMatches.length === 0
        ? '🏆 Champions crowned! Postseason complete.'
        : match.bracket_type === 'championship'
        ? '🏆 Champions crowned! Finish the consolation bracket to complete the tournament.'
        : '🏅 Consolation winners crowned! Finish the championship bracket to complete the tournament.'
    );
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
  void sendTournamentPushEvent(supabase, {
    eventType: 'tournament_completed',
    tournamentId: tournament.id,
  });
  setMessage('🏆 Championship complete. Winner crowned!');
}
  async function submitMatchScore(matchId: string) {
  
  const lockedMatch = matches.find((m) => m.id === matchId);
  if (lockedMatch?.is_complete) {
    setMessage('This match is locked. Reopen it before editing.');
    return;
  }

  if (!lockedMatch || !canReportMatchScore(lockedMatch)) {
    setMessage(
      lockedMatch && !canManageScores && claimedSlot && !isClaimedPlayerInMatch(lockedMatch)
        ? 'Only players in this match can submit this score.'
        : 'Scores are locked for this tournament.'
    );
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

  const submitStartedAt = nowForScoreSubmitTiming();
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
pendingScoreSubmitIdsRef.current.add(matchId);
setMatches(optimisticMatches);

setScoreDrafts((prev) => ({
  ...prev,
  [matchId]: {
    ...(prev[matchId] || {}),
    team_a_score: String(aNum),
    team_b_score: String(bNum),
  },
}));

setStandings(computeStandings(   playerSlots,   optimisticMatches,   isSingles,   isMultiGame,   tournament?.tournament_mode ));

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

  const databaseStartedAt = nowForScoreSubmitTiming();

  const { error, count } = await supabase
    .from('matches')
    .update({
      team_a_score: aNum,
      team_b_score: bNum,
      is_complete: true,
    }, { count: 'exact' })
    .eq('id', matchId);

  if (error || count === 0) {
    pendingScoreSubmitIdsRef.current.delete(matchId);
    setMatches(previousMatches);
    setStandings(computeStandings(   playerSlots,   previousMatches,   isSingles,   isMultiGame,   tournament?.tournament_mode ));
    setMessage(
      error
        ? `Submit failed: ${error.message}`
        : 'Submit failed: the database did not find this match. Please refresh and try again.'
    );
    return;
  }

  logScoreSubmitTiming('match score saved', submitStartedAt, {
    databaseMs: scoreSubmitElapsedMs(databaseStartedAt),
    isEditingCompletedMatch,
    isFinalScore: !nextRound,
    matchId,
  });

  pendingScoreSubmitIdsRef.current.delete(matchId);
  setMatches(optimisticMatches);
  setStandings(computeStandings(   playerSlots,   optimisticMatches,   isSingles,   isMultiGame,   tournament?.tournament_mode ));

  if (isEditingCompletedMatch) {
    scheduleTournamentRefresh(userId);
    setMessage('Score updated successfully.');
    return;
  }

  if (tournament) {
    void sendTournamentPushEvent(supabase, {
      eventType: 'match_score_submitted',
      tournamentId: tournament.id,
      matchId,
    });
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
        setMessage('Stage complete. Generate the next Cream of the Crop round.');
        return;
      }

      const completed = await markTournamentCompleted();
      if (!completed) return;

      setSelectedRound(finalRound);
      setActiveTab('standings');

      setMessage('Final Round complete. Tournament finished.');
      return;
    }

    if (tournament?.pool_brackets_enabled) {
      setSelectedRound(finalRound);
      setActiveTab('rounds');
      setMessage('Pool play complete. Generate the postseason brackets.');
      return;
    }

    const completed = await markTournamentCompleted();
    if (!completed) return;

    setSelectedRound(finalRound);
    setActiveTab('standings');

    setMessage('Score submitted. Tournament complete.');
    return;
  }

  if (submittedRoundComplete && nextRound !== submittedRound) {
    setSelectedRound(nextRound);
    setActiveTab('rounds');
    setMessage(`Score submitted. Round ${submittedRound} complete. Advancing to Round ${nextRound}.`);
    return;
  }

  setMessage('Score submitted.');
}

  async function reopenMatch(matchId: string) {
  if (!isOrganizer) {
    setMessage('Only the organizer can reopen matches.');
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
  setStandings(computeStandings(   playerSlots,   optimisticMatches,   isSingles,   isMultiGame,   tournament?.tournament_mode ));
  setMessage('Reopening match...');

  const { error } = await supabase
    .from('matches')
    .update({ is_complete: false })
    .eq('id', matchId);

  if (error) {
    setMatches(previousMatches);
    setStandings(computeStandings(   playerSlots,   previousMatches,   isSingles,   isMultiGame,   tournament?.tournament_mode ));
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

    function formatCsvValue(value: string | number | null | undefined) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function makeCsvFileName(title: string | null | undefined) {
    const safeTitle = (title || 'Tournament Results')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    return `DinkDraw-${safeTitle || 'Tournament-Results'}.csv`;
  }

  async function exportResultsCsv() {
    if (!tournament) return;

    const completedMatches = matches
      .filter((match) => match.is_complete && !match.is_bye)
      .sort(
        (a, b) =>
          a.round_number - b.round_number ||
          (a.court_number ?? 999) - (b.court_number ?? 999)
      );

    if (completedMatches.length === 0) {
      setMessage('No completed matches available to export.');
      return;
    }

    const headers = [
      'Tournament',
      'Date',
      'Location',
      'Tournament Mode',
      'Format',
      'Match Format',
      'Round',
      'Court',
      'Team A Player 1',
      'Team A Player 1 DUPR ID',
      'Team A Player 2',
      'Team A Player 2 DUPR ID',
      'Team B Player 1',
      'Team B Player 1 DUPR ID',
      'Team B Player 2',
      'Team B Player 2 DUPR ID',
      'Team A Score',
      'Team B Score',
      'Game 1 A',
      'Game 1 B',
      'Game 2 A',
      'Game 2 B',
      'Game 3 A',
      'Game 3 B',
      'Winner',
    ];

      const rows = completedMatches.map((match) => {
      const teamAName = renderTeam(match.team_a_player_1_id, match.team_a_player_2_id);
      const teamBName = renderTeam(match.team_b_player_1_id, match.team_b_player_2_id);

      const winner =
        match.team_a_score === null || match.team_b_score === null
          ? ''
          : match.team_a_score > match.team_b_score
          ? teamAName
          : teamBName;

      return [
        tournament.title,
        tournament.event_date || '',
        tournament.location || '',
        tournament.tournament_mode || '',
        tournament.format,
        tournament.match_format,
        match.round_number,
        match.court_label || match.court_number || '',
        renderPlayerName(match.team_a_player_1_id),
        renderPlayerDuprId(match.team_a_player_1_id),
        isSingles ? '' : renderPlayerName(match.team_a_player_2_id),
        isSingles ? '' : renderPlayerDuprId(match.team_a_player_2_id),
        renderPlayerName(match.team_b_player_1_id),
        renderPlayerDuprId(match.team_b_player_1_id),
        isSingles ? '' : renderPlayerName(match.team_b_player_2_id),
        isSingles ? '' : renderPlayerDuprId(match.team_b_player_2_id),
        match.team_a_score ?? '',
        match.team_b_score ?? '',
        match.game_1_a ?? '',
        match.game_1_b ?? '',
        match.game_2_a ?? '',
        match.game_2_b ?? '',
        match.game_3_a ?? '',
        match.game_3_b ?? '',
        winner,
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map(formatCsvValue).join(','))
      .join('\n');

    const fileName = makeCsvFileName(tournament.title);
    const csvBlob = new Blob([`\uFEFF${csvContent}`], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
    setMessage('CSV exported.');
  }

  function renderPlayerDuprId(id: string | null) {
  if (!id) return '';
  return playersById[id]?.dupr_id || '';
  }
  
  function getShortPlayerName(id: string | null) {
  const fullName = renderPlayerName(id);

  if (!fullName || fullName === '-') return 'Player';

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts[0]} ${parts[1][0]}.`;
}

function renderShortTeam(a: string | null, b: string | null) {
  if (isSingles) return getShortPlayerName(a);
  return `${getShortPlayerName(a)} & ${getShortPlayerName(b)}`;
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

  function renderMultiGameMatch(match: Match) {
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
  const game3Done = match.game_3_a !== null && match.game_3_b !== null;
  const showGame3 = isBestOf3 && game1Done && game2Done && needsGame3(match);
  const shouldShowGame3Column = showGame3 || game3Done;
  const seriesComplete = match.is_complete;
  const canReportThisMatch = canReportMatchScore(match);
  const scoreLockedLabel = getScoreLockedLabel(match);

  const teamAName = renderShortTeam(match.team_a_player_1_id, match.team_a_player_2_id);
  const teamBName = renderShortTeam(match.team_b_player_1_id, match.team_b_player_2_id);

  const isNextUp =
    !isCompleted &&
    match.round_number === currentRound &&
    nextUpMatch?.id === match.id;

  const nextGameNumber: 1 | 2 | 3 | null = !game1Done
    ? 1
    : !game2Done
    ? 2
    : showGame3 && !game3Done
    ? 3
    : null;

  function getGameWinner(aValue: string, bValue: string): 'a' | 'b' | null {
    const aScore = Number(aValue);
    const bScore = Number(bValue);

    if (aValue === '' || bValue === '') return null;
    if (Number.isNaN(aScore) || Number.isNaN(bScore)) return null;
    if (aScore > bScore) return 'a';
    if (bScore > aScore) return 'b';
    return null;
  }

  const game1Winner = getGameWinner(draft.game_1_a, draft.game_1_b);
  const game2Winner = getGameWinner(draft.game_2_a, draft.game_2_b);
  const game3Winner = getGameWinner(draft.game_3_a, draft.game_3_b);

  function getSubmitLabel() {
    if (nextGameNumber === 1) return 'Submit Game 1';

    if (nextGameNumber === 2) {
      if (
        game1Winner &&
        game2Winner &&
        game1Winner === game2Winner
      ) {
        return 'Complete Match';
      }

      return 'Submit Game 2';
    }

    if (nextGameNumber === 3) return 'Complete Match';

    return 'Scores Locked';
  }

  const gridColumns = shouldShowGame3Column
    ? 'minmax(0, 1fr) 42px 42px 42px'
    : 'minmax(0, 1fr) 42px 42px';

  function renderScoreInput({
    value,
    field,
    disabled,
    isWinner,
  }: {
    value: string;
    field: keyof ScoreDraft;
    disabled: boolean;
    isWinner: boolean;
  }) {
    return (
      <input
        className="input"
        style={{
          height: 46,
          width: 42,
          textAlign: 'center',
          fontSize: 22,
          fontWeight: 950,
          padding: '6px 4px',
          borderRadius: 14,
          color: isWinner ? '#FFCB05' : '#fff',
          borderColor: isWinner
            ? 'rgba(255,203,5,0.55)'
            : 'rgba(255,255,255,0.14)',
          background: isWinner
            ? 'rgba(255,203,5,0.10)'
            : 'rgba(0,0,0,0.16)',
          opacity: disabled ? 0.62 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        disabled={disabled}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraftScore(match.id, field, e.target.value)}
        placeholder="0"
      />
    );
  }

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
      <div
        className="row-between"
        style={{
          marginBottom: 10,
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 950,
            lineHeight: 1.05,
            color: '#FFCB05',
          }}
        >
          {getMatchLocationLabel(match)}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          {isNextUp ? (
            <span
              className="tag"
              style={{
                background: 'rgba(255,203,5,0.14)',
                border: '1px solid rgba(255,203,5,0.35)',
                color: '#FFCB05',
                fontWeight: 900,
              }}
            >
              ⭐ Your Match
            </span>
          ) : null}

          <span
            className={match.is_complete ? 'tag green' : 'tag'}
            style={!match.is_complete ? { fontWeight: 900 } : undefined}
          >
            {match.is_complete ? 'Final' : 'Live'}
          </span>
        </div>
      </div>

      <div
        style={{
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 16,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.14)',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns,
            gap: 8,
            alignItems: 'center',
            padding: '8px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.62)',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
          }}
        >
          <div>Team</div>
          <div style={{ textAlign: 'center' }}>G1</div>
          <div style={{ textAlign: 'center' }}>G2</div>
          {shouldShowGame3Column ? (
            <div style={{ textAlign: 'center' }}>G3</div>
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns,
            gap: 8,
            alignItems: 'center',
            padding: '10px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              minWidth: 0,
              fontWeight: 900,
              fontSize: 16,
              lineHeight: 1.2,
              color: seriesComplete && aWins > bWins ? '#FFCB05' : '#fff',
            }}
          >
            ⭐ {teamAName}
          </div>

          {renderScoreInput({
            value: draft.game_1_a,
            field: 'game_1_a',
            disabled: game1Done || seriesComplete || !canReportThisMatch,
            isWinner: game1Winner === 'a',
          })}

          {renderScoreInput({
            value: draft.game_2_a,
            field: 'game_2_a',
            disabled:
              !game1Done ||
              game2Done ||
              !canReportThisMatch,
            isWinner: game2Winner === 'a',
          })}

          {shouldShowGame3Column ? (
            renderScoreInput({
              value: draft.game_3_a,
              field: 'game_3_a',
              disabled:
                !showGame3 ||
                game3Done ||
                !canReportThisMatch,
              isWinner: game3Winner === 'a',
            })
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns,
            gap: 8,
            alignItems: 'center',
            padding: '10px',
          }}
        >
          <div
            style={{
              minWidth: 0,
              fontWeight: 900,
              fontSize: 16,
              lineHeight: 1.2,
              color: seriesComplete && bWins > aWins ? '#FFCB05' : '#fff',
            }}
          >
            {teamBName}
          </div>

          {renderScoreInput({
            value: draft.game_1_b,
            field: 'game_1_b',
            disabled: game1Done || seriesComplete || !canReportThisMatch,
            isWinner: game1Winner === 'b',
          })}

          {renderScoreInput({
            value: draft.game_2_b,
            field: 'game_2_b',
            disabled:
              !game1Done ||
              game2Done ||
              !canReportThisMatch,
            isWinner: game2Winner === 'b',
          })}

          {shouldShowGame3Column ? (
            renderScoreInput({
              value: draft.game_3_b,
              field: 'game_3_b',
              disabled:
                !showGame3 ||
                game3Done ||
                !canReportThisMatch,
              isWinner: game3Winner === 'b',
            })
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginBottom: 10,
          padding: '9px 10px',
          borderRadius: 14,
          background: 'rgba(255,203,5,0.07)',
          border: '1px solid rgba(255,203,5,0.18)',
          color: '#FFCB05',
          fontWeight: 900,
          textAlign: 'center',
          fontSize: 13,
        }}
      >
        {isTwoGame
          ? (seriesComplete ? `Both games complete • ${aWins}-${bWins}` : `Game wins: ${aWins}-${bWins} • Team A serves first in Game 1; Team B in Game 2`)
          : seriesComplete
            ? `${aWins > bWins ? teamAName : teamBName} win series ${aWins}-${bWins}`
            : `Series: ${aWins}-${bWins} • Team A serves first in Game 1; Team B in Game 2`}
      </div>

      {!seriesComplete && nextGameNumber ? (
        <button
          className="button primary"
          onClick={() =>
            runWithScoreSubmitLock(match.id, () =>
              submitGame(match.id, nextGameNumber)
            )
          }
          disabled={!canReportThisMatch || submittingScoreId === match.id}
          style={{
            width: '100%',
            fontWeight: 900,
            fontSize: 16,
            padding: '14px 16px',
          }}
        >
          {submittingScoreId === match.id
            ? 'Submitting...'
            : canReportThisMatch
            ? getSubmitLabel()
            : scoreLockedLabel}
        </button>
      ) : null}

      {seriesComplete && isOrganizer ? (
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
  );
}

  return (
    <main className="page-shell">
      <TopNav />
      {leagueSession ? (
        <Link href={`/leagues/${leagueSession.league_id}`} className="button secondary" style={{ marginBottom: 14, width: '100%' }}>
          ← Back to League • Week {leagueSession.session_number}
        </Link>
      ) : null}

      <OrganizationBrandBanner brand={organizationBrand} />

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
      {getMatchLocationLabel(yourMatch)}
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

    {SHOW_CREAM_STAGE_STATUS &&
    tournament.tournament_mode === 'cream_of_the_crop' ? (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <CreamStageTeamStatus
          players={[
            {
              id: yourMatch.team_a_player_1_id,
              name: renderPlayerName(yourMatch.team_a_player_1_id),
            },
            {
              id: yourMatch.team_a_player_2_id,
              name: renderPlayerName(yourMatch.team_a_player_2_id),
            },
          ]}
          statusByPlayer={currentCreamStageStatus}
        />
        <CreamStageTeamStatus
          players={[
            {
              id: yourMatch.team_b_player_1_id,
              name: renderPlayerName(yourMatch.team_b_player_1_id),
            },
            {
              id: yourMatch.team_b_player_2_id,
              name: renderPlayerName(yourMatch.team_b_player_2_id),
            },
          ]}
          statusByPlayer={currentCreamStageStatus}
        />
      </div>
    ) : null}

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

      <TournamentAnnouncementsLink
        tournamentId={params.id}
        userId={userId}
        isEligible={isOrganizer || isCoOrganizer || !!claimedSlot}
      />

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
  <div className="card-title">
  {tournament?.tournament_mode === 'cream_of_the_crop' ? 'Seeded Players' : 'Players'}
</div>
  <div className="card-subtitle">
  {tournament?.tournament_mode === 'cream_of_the_crop'
    ? isLocked
      ? 'Seed order is locked. Final placement uses final court, overall record, then initial seed.'
      : 'Organizer should enter players from strongest to weakest. Seed #1 starts highest and wins seed-based tie-breakers.'
    : isCompleted
    ? 'Tournament is complete. Player list is locked.'
    : isStarted
    ? 'Tournament has started. Player list is locked.'
    : isSingles
    ? 'Singles tournament — each player competes individually.'
    : 'Players can claim a spot, or the organizer can type names manually.'}
</div>

  {isLoading ? (
  <div className="muted">Loading player spots...</div>
) : tournament?.format === 'doubles' &&
  tournament?.doubles_mode === 'fixed' ? (
  <div className="grid">
    {Array.from({
      length: Math.ceil(playerSlots.length / 2),
    }).map((_, teamIndex) => {
      const player1 = playerSlots[teamIndex * 2];
      const player2 = playerSlots[teamIndex * 2 + 1];

      if (!player1 || !player2) return null;

      return (
        <div
          key={`team-${teamIndex}`}
          className="list-item"
        >
          <div
            style={{
              textAlign: 'center',
              fontWeight: 900,
              marginBottom: 12,
              color: '#FFCB05',
              fontSize: 18,
            }}
          >
            Team {teamIndex + 1}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            {[player1, player2].map((slot) => {
  const isMine = slot.claimed_by_user_id === userId;
  const isClaimedBySomeone = !!slot.claimed_by_user_id;
  const canClaim = !isClaimedBySomeone && !claimedSlot;
  const canEditName = !isLocked && (isOrganizer || isMine || !isClaimedBySomeone);

  return (
    <div key={slot.id}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 6,
          opacity: 0.75,
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
        disabled={!canEditName}
      />

      <div style={{ marginTop: 8 }}>
        {isMine ? (
          <span className="tag yours">Yours</span>
        ) : isClaimedBySomeone ? (
          <span className="tag">Claimed</span>
        ) : canClaim ? (
          <button
            type="button"
            className="button primary"
            style={{
              width: '100%',
              minHeight: 38,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 800,
              borderRadius: 999,
            }}
            onClick={() => claimSlot(slot.id)}
          >
            Claim Spot
          </button>
        ) : (
          <span className="tag">Open</span>
        )}
      </div>

      {isOrganizer && !isLocked && (slot.display_name || slot.claimed_by_user_id) ? (
        <button
          type="button"
          className="button secondary"
          onClick={() => clearPlayerSlot(slot.id)}
          style={{
            width: '100%',
            marginTop: 8,
            borderColor: 'rgba(255,80,80,0.35)',
            background: 'rgba(255,80,80,0.10)',
            color: '#ff9b9b',
            fontWeight: 800,
          }}
        >
          Clear
        </button>
      ) : null}

      {canManageScores && isLocked && isClaimedBySomeone ? (
        <button
          type="button"
          className="button secondary"
          onClick={() => unlinkClaimedAccount(slot.id)}
          style={{
            width: '100%',
            marginTop: 8,
            borderColor: 'rgba(255,203,5,0.35)',
            background: 'rgba(255,203,5,0.08)',
            color: '#FFCB05',
            fontWeight: 800,
          }}
        >
          Unlink Account
        </button>
      ) : null}
    </div>
  );
})}
          </div>
        </div>
      );
    })}
  </div>
) : (
  <div className="grid">
      {playerSlots.map((slot) => {
        const isMine = slot.claimed_by_user_id === userId;
        const isClaimedBySomeone = !!slot.claimed_by_user_id;
        const canClaim = !isClaimedBySomeone && !claimedSlot;
        const firstOpenSlot = playerSlots.find((player) => !player.claimed_by_user_id);
        const isFirstOpenSlot = firstOpenSlot?.id === slot.id;
        
    const hasAssignedNames = playerSlots.some(
  (p) => p.display_name?.trim()
);

const shouldShowClaimButton = canClaim && (
  hasAssignedNames
    ? !!slot.display_name
    : isFirstOpenSlot
);
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
    {tournament?.tournament_mode === 'cream_of_the_crop'
  ? `Seed ${slot.slot_number}`
  : `Player ${slot.slot_number}`}
  </div>

  <div
  style={{
    textAlign: 'center',
    fontWeight: 600,
    fontSize: 16,
  }}
>
  <div>{slot.display_name || 'Open'}</div>

  {shouldShowClaimButton ? (
    <div
      style={{
        marginTop: 3,
        fontSize: 11,
        fontWeight: 800,
        color: '#ffcb05',
        letterSpacing: '0.02em',
      }}
    >
      {slot.display_name
  ? 'This spot is assigned to you'
  : 'Tap to join this spot'}
    </div>
  ) : null}
</div>

  <div style={{ width: 110, display: 'flex', justifyContent: 'flex-end' }}>
  {isMine ? (
    <span className="tag yours">Yours</span>
  ) : isClaimedBySomeone ? (
    <span className="tag">Claimed</span>
  ) : shouldShowClaimButton ? (
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
      {slot.display_name ? 'Claim Spot' : 'Join Game'}
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

{canManageScores && isLocked && isClaimedBySomeone ? (
  <button
    type="button"
    className="button secondary"
    onClick={(e) => {
      e.stopPropagation();
      unlinkClaimedAccount(slot.id);
    }}
    style={{
      width: '100%',
      marginBottom: 10,
      borderColor: 'rgba(255,203,5,0.35)',
      background: 'rgba(255,203,5,0.08)',
      color: '#FFCB05',
      fontWeight: 800,
    }}
  >
    Unlink Account
  </button>
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
                placeholder={
  tournament?.tournament_mode === 'cream_of_the_crop'
    ? `Name for Seed ${slot.slot_number}`
    : `Name for Player ${slot.slot_number}`
}
disabled={!canEditName}
/>

{tournament?.ask_for_dupr_id ? (

  <input
    className="input"
    value={newDuprIds[slot.id] ?? slot.dupr_id ?? ''}
    onChange={(e) =>
      setNewDuprIds((prev) => ({
        ...prev,
        [slot.id]: e.target.value,
      }))
    }
    placeholder="DUPR ID optional"
    disabled={!canEditName}
  />
) : null}

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

              {canClaim ? (
                <button className="button primary" onClick={(e) => {
                  e.stopPropagation();
                  claimSlot(slot.id);
              }}>
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
    })}
  </div>
)}
 </div>

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
  <div className="card-title">Score Reporting</div>
  <div className="card-subtitle">
    Choose how much score entry help players can provide.
  </div>

  <label
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 10,
      fontSize: 13,
      fontWeight: 700,
    }}
  >
    <input
      type="checkbox"
      checked={!!tournament?.allow_player_score_reporting}
      onChange={(e) =>
        updateScoreReportingSettings({
          allowOwnMatchScores: e.target.checked,
          allowAnyMatchScores: e.target.checked
            ? !!tournament?.allow_any_player_score_reporting
            : false,
        })
      }
      disabled={isSavingScoreReporting}
      style={{ marginTop: 3 }}
    />
    <span>
      <span style={{ display: 'block', fontWeight: 900 }}>
        Allow players to submit their own match scores
      </span>
      <span className="muted" style={{ display: 'block', marginTop: 3 }}>
        Players can score only matches they are playing in.
      </span>
    </span>
  </label>

  <label
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 12,
      fontSize: 13,
      fontWeight: 700,
    }}
  >
    <input
      type="checkbox"
      checked={!!tournament?.allow_any_player_score_reporting}
      onChange={(e) =>
        updateScoreReportingSettings({
          allowOwnMatchScores: true,
          allowAnyMatchScores: e.target.checked,
        })
      }
      disabled={isSavingScoreReporting}
      style={{ marginTop: 3 }}
    />
    <span>
      <span style={{ display: 'block', fontWeight: 900 }}>
        Allow players to submit scores for any match
      </span>
      <span className="muted" style={{ display: 'block', marginTop: 3 }}>
        Use this when you trust players to help enter scores from other courts.
      </span>
    </span>
  </label>

  {isSavingScoreReporting ? (
    <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
      Saving score reporting settings...
    </div>
  ) : null}
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
            {isOrganizer ? (
  <div className="list-item" style={{ marginTop: 12, marginBottom: 14 }}>
    <div className="label">Tournament Name</div>

    <input
      className="input"
      value={editedTournamentTitle || tournament?.title || ''}
      onChange={(e) => setEditedTournamentTitle(e.target.value)}
      placeholder="Tournament name"
      style={{ marginTop: 8 }}
    />

    <button
      type="button"
      className="button secondary"
      onClick={saveTournamentTitle}
      disabled={isSavingTournamentTitle}
      style={{ width: '100%', marginTop: 10 }}
    >
      {isSavingTournamentTitle ? 'Saving...' : 'Save Tournament Name'}
    </button>
  </div>
) : null}
            <div className="grid" style={{ marginBottom: 14 }}>
              <div className="list-item">
                <div className="label">Join Code</div>
                <div className="row-between">
                  <strong style={{ letterSpacing: '0.08em' }}>{tournament?.join_code || '...'}</strong>
                  <div
  style={{
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  }}
>
  <span className={isLive ? 'tag green' : 'tag'}>
    {isLive ? '🔴 Live' : 'Connecting'}
  </span>

  <span className="tag">
    {isSingles ? '👤 Singles' : '👥 Doubles'}
  </span>

  <span className="tag">
    {isBestOf3 ? '🏆 Best of 3' : isTwoGame ? '🎾 Two Games' : '🎾 Single Game'}
  </span>
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
                  <>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => router.push(`/tournament/${params.id}/results`)}
                      style={{ fontWeight: 800, fontSize: 16 }}
                    >
                      🏆 View Results
                    </button>

                    <button
                      type="button"
                      className="button primary"
                      onClick={rematchTournament}
                      disabled={isRematching}
                    >
                      {isRematching ? 'Creating Rematch...' : 'Rematch Tournament'}
                    </button>
                  </>
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

          {(isOrganizer || !!claimedSlot) && publicViewUrl ? (
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
                      Share Live Tournament
                    </div>
                    <div className="card-subtitle" style={{ marginBottom: 0 }}>
                      Let friends and family follow along in real time
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

                  <div style={{ display: 'grid', gap: 10 }}>
  <button
    type="button"
    className="button primary"
    onClick={sharePublicLink}
  >
    📤 Share Link
  </button>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
    }}
  >
    <button
      type="button"
      className="button secondary"
      onClick={copyPublicLink}
    >
      🔗 Copy Link
    </button>

    <a
      href={publicViewUrl}
      target="_blank"
      rel="noreferrer"
      className="button secondary"
      style={{ textDecoration: 'none' }}
    >
      📺 Open Live View
    </a>
</div>
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
  playoffsAllowedForTournament &&
  (tournament?.pool_brackets_enabled || tournament?.playoff_format !== 'none') &&
  (isStarted || isCompleted) &&
  matches.length > 0 &&
  matches.every((m) => m.is_bye || m.is_complete) &&
  playoffRounds.length === 0
) ? (
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">{tournament?.pool_brackets_enabled ? 'Postseason Brackets' : 'Playoff Bracket'}</div>
        <div className="card-subtitle">
          {tournament?.pool_brackets_enabled
            ? 'Pool play is complete. Rank qualifiers, lock partnerships, and generate championship and consolation brackets.'
            : 'Round robin is complete. Generate the seeded playoff bracket.'}
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
          {tournament?.pool_brackets_enabled ? 'Generate Postseason Brackets' : 'Generate Playoff Bracket'}
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
                    {status === 'current'
                    ? 'LIVE'
                    : status === 'complete'
                    ? 'FINAL'
                    : status === 'not_played'
                    ? 'NOT PLAYED'
                    : 'ROUND'}
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

{playoffMatches.length > 0 ? (
  <div className="card" style={{ marginTop: 14 }}>
    <div className="card-title">Bracket Path</div>
    <div className="card-subtitle">Follow every team from its opening matchup to the championship.</div>
    <TournamentBracket
      matches={playoffMatches}
      players={playersById}
      bracketType="championship"
      title="Championship Bracket"
      accentColor="#FFCB05"
    />
    <TournamentBracket
      matches={playoffMatches}
      players={playersById}
      bracketType="consolation"
      title="Consolation Bracket"
      accentColor="#A78BFA"
    />
  </div>
) : null}

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
               {tournament?.pool_brackets_enabled ? (
                 <div style={{ color: match.bracket_type === 'championship' ? '#FFCB05' : '#A78BFA', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, marginBottom: 8, textTransform: 'uppercase' }}>
                   {match.bracket_type} bracket · {match.match_format === 'best_of_3' ? `Best of 3 to ${match.games_to || 11}` : `Single game to ${match.games_to || 11}`}
                 </div>
               ) : null}
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
      gridTemplateColumns: match.match_format === 'best_of_3' ? '1fr auto' : '1fr 64px',
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

    {match.match_format === 'best_of_3' ? (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 42px)', gap: 4 }}>
        {(['game_1_a', 'game_2_a', 'game_3_a'] as const).map((field, gameIndex) => (
          <input
            key={field}
            className="input"
            type="number"
            aria-label={`Team A game ${gameIndex + 1}`}
            value={playoffScoreDrafts[match.id]?.[field] ?? (match[field] === null ? '' : String(match[field]))}
            onChange={(e) => setPlayoffScoreDrafts((prev) => ({ ...prev, [match.id]: { ...prev[match.id], [field]: e.target.value.replace(/[^\d]/g, '') } }))}
            disabled={match.is_complete}
            placeholder={`G${gameIndex + 1}`}
            style={{ textAlign: 'center', padding: '8px 2px', fontWeight: 900 }}
          />
        ))}
      </div>
    ) : (
      <input
        className="input"
        type="number"
        value={playoffScoreDrafts[match.id]?.team_a_score ?? (match.team_a_score === null ? '' : String(match.team_a_score))}
        onChange={(e) => setPlayoffScoreDrafts((prev) => ({ ...prev, [match.id]: { ...prev[match.id], team_a_score: e.target.value.replace(/[^\d]/g, '') } }))}
        disabled={match.is_complete}
        placeholder="0"
        style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 900 }}
      />
    )}
  </div>

  <div
  style={{
    display: 'grid',
    gridTemplateColumns: match.match_format === 'best_of_3' ? '1fr auto' : '1fr 64px',
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

  {match.match_format === 'best_of_3' ? (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 42px)', gap: 4 }}>
      {(['game_1_b', 'game_2_b', 'game_3_b'] as const).map((field, gameIndex) => (
        <input
          key={field}
          className="input"
          type="number"
          aria-label={`Team B game ${gameIndex + 1}`}
          value={playoffScoreDrafts[match.id]?.[field] ?? (match[field] === null ? '' : String(match[field]))}
          onChange={(e) => setPlayoffScoreDrafts((prev) => ({ ...prev, [match.id]: { ...prev[match.id], [field]: e.target.value.replace(/[^\d]/g, '') } }))}
          disabled={match.is_complete || !match.team_b_player_1_id}
          placeholder={`G${gameIndex + 1}`}
          style={{ textAlign: 'center', padding: '8px 2px', fontWeight: 900 }}
        />
      ))}
    </div>
  ) : <input
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
  />}
</div>
            </div>

                {!match.is_complete && !match.is_bye ? (
  <button
    className="button primary"
    onClick={() =>
      runWithScoreSubmitLock(`playoff-${match.id}`, () =>
        submitPlayoffScore(match.id)
      )
    }
    disabled={
      !isOrganizer ||
      !match.team_a_player_1_id ||
      !match.team_b_player_1_id ||
      submittingScoreId === `playoff-${match.id}`
    }
    style={{
      width: '100%',
      marginTop: 10,
      fontWeight: 900,
      padding: '12px 14px',
    }}
  >
    {submittingScoreId === `playoff-${match.id}`
        ? 'Submitting...'
        : isOrganizer
        ? 'Submit Playoff Score'
        : 'Scores Locked'}
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
    {match.next_match_id
      ? 'Winner Advanced'
      : match.bracket_type === 'championship'
      ? '🏆 Champions Crowned'
      : '🏅 Consolation Winners Crowned'}
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
              {SHOW_CREAM_STAGE_STATUS &&
              tournament?.tournament_mode === 'cream_of_the_crop' ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,203,5,0.22)',
                    background: 'rgba(255,203,5,0.06)',
                    color: 'rgba(255,255,255,0.74)',
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: 1.35,
                  }}
                >
                  {getCreamStageLabel(selectedRound)} • Stage record and differential
                  reset at Round {selectedRound <= 3 ? 1 : selectedRound <= 6 ? 4 : 7} •
                  Ranked by stage wins, then point differential
                </div>
              ) : null}

              {matchesForSelectedRound.map((match) => {
                const isNextUp =
                  !isCompleted &&
                  match.round_number === currentRound &&
                  nextUpMatch?.id === match.id;

                if (isMultiGame) return renderMultiGameMatch(match);

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
                const canReportThisMatch = canReportMatchScore(match);
                const scoreLockedLabel = getScoreLockedLabel(match);

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
                    <div
  className="row-between"
  style={{
    marginBottom: 8,
    alignItems: 'center',
    gap: 10,
  }}
>
  <div
    style={{
      fontSize: 22,
      fontWeight: 950,
      lineHeight: 1.05,
      color: '#FFCB05',
    }}
  >
    {getMatchLocationLabel(match)}
  </div>

  <div
    style={{
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      alignItems: 'center',
    }}
  >
    {isNextUp ? (
      <span
        className="tag"
        style={{
          background: 'rgba(255,203,5,0.14)',
          border: '1px solid rgba(255,203,5,0.35)',
          color: '#FFCB05',
          fontWeight: 900,
        }}
      >
        ⭐ Your Match
      </span>
    ) : null}

    <span
      className={match.is_complete ? 'tag green' : 'tag'}
      style={!match.is_complete ? { fontWeight: 900 } : undefined}
    >
      {match.is_complete ? 'Final' : 'Live'}
    </span>
  </div>
</div>

                    <div
  style={{
    display: 'grid',
    gap: 6,
    marginBottom: 8,
  }}
>
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 74px',
      gap: 10,
      alignItems: 'center',
      padding: '8px 10px 8px 12px',
      borderRadius: 14,
      background: 'rgba(255,255,255,0.035)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}
  >
    <div
      style={{
        minWidth: 0,
        fontWeight: 900,
        fontSize: 16,
        lineHeight: 1.2,
        ...getWinnerStyle('a', match),
      }}
    >
      {renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}
      {SHOW_CREAM_STAGE_STATUS &&
      tournament?.tournament_mode === 'cream_of_the_crop' ? (
        <CreamStageTeamStatus
          players={[
            {
              id: match.team_a_player_1_id,
              name: renderPlayerName(match.team_a_player_1_id),
            },
            {
              id: match.team_a_player_2_id,
              name: renderPlayerName(match.team_a_player_2_id),
            },
          ]}
          statusByPlayer={selectedCreamStageStatus}
        />
      ) : null}
    </div>

    <input
      className="input"
      style={{
        height: 52,
        textAlign: 'center',
        fontSize: 32,
        fontWeight: 950,
        padding: '6px 4px',
        borderRadius: 14,
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
      disabled={match.is_complete || !canReportThisMatch}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraftScore(match.id, 'team_a_score', e.target.value)}
      placeholder={canReportThisMatch ? '0' : '-'}
    />
  </div>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 74px',
      gap: 10,
      alignItems: 'center',
      padding: '8px 10px 8px 12px',
      borderRadius: 14,
      background: 'rgba(255,255,255,0.035)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}
  >
    <div
      style={{
        minWidth: 0,
        fontWeight: 900,
        fontSize: 16,
        lineHeight: 1.2,
        ...getWinnerStyle('b', match),
      }}
    >
      {renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}
      {SHOW_CREAM_STAGE_STATUS &&
      tournament?.tournament_mode === 'cream_of_the_crop' ? (
        <CreamStageTeamStatus
          players={[
            {
              id: match.team_b_player_1_id,
              name: renderPlayerName(match.team_b_player_1_id),
            },
            {
              id: match.team_b_player_2_id,
              name: renderPlayerName(match.team_b_player_2_id),
            },
          ]}
          statusByPlayer={selectedCreamStageStatus}
        />
      ) : null}
    </div>

    <input
      className="input"
      style={{
        height: 52,
        textAlign: 'center',
        fontSize: 32,
        fontWeight: 950,
        padding: '6px 4px',
        borderRadius: 14,
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
      disabled={match.is_complete || !canReportThisMatch}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraftScore(match.id, 'team_b_score', e.target.value)}
      placeholder={canReportThisMatch ? '0' : '-'}
    />
  </div>
</div>

     {match.is_complete ? (
  canManageScores ? (
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
    onClick={() =>
      runWithScoreSubmitLock(match.id, () => submitMatchScore(match.id))
    }
    disabled={!canReportThisMatch || submittingScoreId === match.id}
    style={{
      width: '100%',
      fontWeight: 800,
      fontSize: 16,
      padding: '14px 16px',
    }}
  >
    {submittingScoreId === match.id
      ? 'Submitting...'
      : canReportThisMatch
      ? 'Submit Score'
      : scoreLockedLabel}
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
  {tournament?.tournament_mode === 'cream_of_the_crop'
    ? 'Ranked by final court, overall record, then initial seed.'
    : isCompleted
    ? 'Tournament complete. Final results are locked.'
    : 'Ranked by wins, then point differential, then points scored.'}
</div>

          <Link
  href={`/tournament/view/${params.id}/share-card`}
  className="button primary"
  style={{
    width: '100%',
    minHeight: 52,
    textDecoration: 'none',
    fontWeight: 900,
    fontSize: 17,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}
>
  🏆 Share Results
</Link>

     {canManageScores && isCompleted ? (
  <button
    type="button"
    className="button secondary"
    onClick={exportResultsCsv}
    style={{
      width: '100%',
      minHeight: 52,
      marginTop: 10,
      fontWeight: 900,
      fontSize: 17,
    }}
  >
    ⬇️ Export Results CSV
  </button>
) : null}     

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

          {tournament?.pool_brackets_enabled && tournament.id ? (
            <div style={{ margin: '14px 0 18px', padding: 14, borderRadius: 16, border: '1px solid rgba(255,203,5,0.2)', background: 'rgba(255,203,5,0.035)' }}>
              <div className="card-title" style={{ fontSize: 20 }}>Race to 3 + Prize Pot</div>
              <TournamentPrizePool tournamentId={tournament.id} canManage={canManageScores} />
            </div>
          ) : null}

          {!standings.length ? (
            <div className="muted">No players yet.</div>
          ) : (
            <>
            {tournament?.pool_brackets_enabled ? <PoolStandingsTables pools={poolStandings} /> : null}
            <div
              style={{
                display: tournament?.pool_brackets_enabled ? 'none' : 'block',
                marginTop: 4,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
                            
               {tournament?.tournament_mode === 'cream_of_the_crop' && standings.length > 0 && (
  <div
    className="card"
    style={{
      marginBottom: 14,
      border: '1px solid rgba(255,203,5,0.35)',
      background: 'rgba(255,203,5,0.08)',
    }}
  >
    <div
  className="card-title"
  style={{
    color: '#FFCB05',
    textAlign: 'center',
    fontSize: 32,
    marginBottom: 20,
  }}
>
  Cream of the Crop Results
</div>

    <div
      className="list-item"
      style={{
        marginTop: 12,
        border: '1px solid rgba(255,203,5,0.6)',
        background:
          'linear-gradient(135deg, rgba(255,203,5,0.18), rgba(255,203,5,0.05))',
        textAlign: 'center',
        padding: '24px 20px',
        boxShadow: '0 0 24px rgba(255,203,5,0.18)',
      }}
    >
      <div
  style={{
    fontWeight: 900,
    color: '#FFCB05',
    marginBottom: 8,
    fontSize: 24,
  }}
>
  👑 Cream of the Crop Champion
</div>
      <div
  style={{
    fontSize: 40,
    fontWeight: 900,
    lineHeight: 1.1,
    marginBottom: 8,
  }}
>
  {standings[0].name}
</div>
      <div
  className="muted"
  style={{
    fontSize: 16,
    marginTop: 8,
  }}
>
        {standings[0].wins} wins • {standings[0].pointDiff >= 0 ? '+' : ''}
        {standings[0].pointDiff} point diff • {standings[0].pointsFor} points for
      </div>
    </div>

    {biggestClimber && biggestClimber.climb > 0 && (
      <div
  className="list-item"
  style={{
    marginTop: 16,
    border: '1px solid rgba(255,203,5,0.35)',
    background: 'rgba(255,255,255,0.04)',
    textAlign: 'center',
    padding: '20px',
  }}
>
        <div style={{ fontWeight: 900, color: '#FFCB05', marginBottom: 4 }}>
         📈 Biggest Climber
        </div>
        <div
  style={{
    fontSize: 28,
    fontWeight: 900,
    marginTop: 6,
  }}
>
          {biggestClimber.name} climbed {biggestClimber.climb} spots
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Started #{biggestClimber.startingRank} → Finished #{biggestClimber.finalRank} •{' '}
          {biggestClimber.pointDiff >= 0 ? '+' : ''}
          {biggestClimber.pointDiff} point differential
        </div>
      </div>
    )}
  </div>
)}

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
                        {tournament?.pool_brackets_enabled ? (
                          <div className="muted" style={{ fontSize: 11, fontWeight: 800, marginTop: 2 }}>
                            Pool {playersById[row.playerId]?.pool_number || '—'}
                          </div>
                        ) : null}
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
            </>
          )}
        </div>
      )}
    </main>
  );
}
