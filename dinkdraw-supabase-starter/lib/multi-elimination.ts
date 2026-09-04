export type EliminationSection = 'main' | 'second_chance' | 'last_chance';

export type BracketSource =
  | { kind: 'seed'; seed: number }
  | { kind: 'match'; matchKey: string; outcome: 'winner' | 'loser' };

export type EliminationMatchTemplate = {
  key: string;
  section: EliminationSection;
  sectionRound: number;
  matchNumber: number;
  inputA: BracketSource;
  inputB: BracketSource;
};

export type EliminationGraph = {
  matches: EliminationMatchTemplate[];
  sectionRounds: Record<EliminationSection, EliminationMatchTemplate[][]>;
  champions: Partial<Record<EliminationSection, BracketSource>>;
};

type MutableGraph = EliminationGraph & { nextKey: number };

const outcome = (matchKey: string, result: 'winner' | 'loser'): BracketSource => ({
  kind: 'match',
  matchKey,
  outcome: result,
});

export function standardSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  let order = [1, 2];
  for (let bracketSize = 4; bracketSize <= size; bracketSize *= 2) {
    const next: number[] = [];
    for (const seed of order) next.push(seed, bracketSize + 1 - seed);
    order = next;
  }
  return order;
}

function nextPowerOfTwo(value: number) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function addRound(
  graph: MutableGraph,
  section: EliminationSection,
  inputs: BracketSource[],
): { winners: BracketSource[]; losers: BracketSource[] } {
  if (inputs.length < 2) return { winners: inputs, losers: [] };
  const roundNumber = graph.sectionRounds[section].length + 1;
  const matches: EliminationMatchTemplate[] = [];
  const winners: BracketSource[] = [];
  const losers: BracketSource[] = [];

  for (let index = 0; index < inputs.length; index += 2) {
    const inputA = inputs[index];
    const inputB = inputs[index + 1];
    if (!inputB) {
      winners.push(inputA);
      continue;
    }
    const key = `${section}-${graph.nextKey++}`;
    const match: EliminationMatchTemplate = {
      key,
      section,
      sectionRound: roundNumber,
      matchNumber: matches.length + 1,
      inputA,
      inputB,
    };
    matches.push(match);
    graph.matches.push(match);
    winners.push(outcome(key, 'winner'));
    losers.push(outcome(key, 'loser'));
  }

  if (matches.length) graph.sectionRounds[section].push(matches);
  return { winners, losers };
}

function buildMainDraw(graph: MutableGraph, teamCount: number) {
  const bracketSize = nextPowerOfTwo(teamCount);
  const orderedSeeds = standardSeedOrder(bracketSize)
    .map((seed) => seed <= teamCount ? ({ kind: 'seed', seed } as BracketSource) : null);
  let active: BracketSource[] = [];
  const firstLosers: BracketSource[] = [];

  for (let index = 0; index < orderedSeeds.length; index += 2) {
    const pair = [orderedSeeds[index], orderedSeeds[index + 1]].filter(Boolean) as BracketSource[];
    if (pair.length === 1) active.push(pair[0]);
    if (pair.length === 2) {
      const result = addRound(graph, 'main', pair);
      active.push(...result.winners);
      firstLosers.push(...result.losers);
    }
  }

  // addRound is called per first-round pairing above, so normalize those
  // matches into one visual round.
  if (graph.sectionRounds.main.length > 1) {
    const firstRound = graph.sectionRounds.main.flat();
    firstRound.forEach((match, index) => {
      match.sectionRound = 1;
      match.matchNumber = index + 1;
    });
    graph.sectionRounds.main = [firstRound];
  }

  const loserCohorts: BracketSource[][] = [firstLosers];
  while (active.length > 1) {
    const result = addRound(graph, 'main', active);
    active = result.winners;
    loserCohorts.push(result.losers);
  }
  graph.champions.main = active[0];
  return loserCohorts.filter((cohort) => cohort.length);
}

function buildDropBracket(
  graph: MutableGraph,
  section: EliminationSection,
  incomingCohorts: BracketSource[][],
) {
  let active: BracketSource[] = [];
  const outgoingLoserCohorts: BracketSource[][] = [];

  incomingCohorts.forEach((cohort, cohortIndex) => {
    if (!active.length) active = [...cohort];
    else active = [...active, ...cohort];

    const nextIncomingSize = incomingCohorts[cohortIndex + 1]?.length ?? 1;
    while (active.length > nextIncomingSize) {
      const result = addRound(graph, section, active);
      if (result.winners.length === active.length) break;
      active = result.winners;
      if (result.losers.length) outgoingLoserCohorts.push(result.losers);
    }
  });

  while (active.length > 1) {
    const result = addRound(graph, section, active);
    active = result.winners;
    if (result.losers.length) outgoingLoserCohorts.push(result.losers);
  }
  graph.champions[section] = active[0];
  return outgoingLoserCohorts;
}

export function buildFixedEliminationGraph(teamCount: number, lossLimit: 1 | 2 | 3): EliminationGraph {
  if (!Number.isInteger(teamCount) || teamCount < 2) throw new Error('At least two teams are required.');
  const graph: MutableGraph = {
    matches: [],
    sectionRounds: { main: [], second_chance: [], last_chance: [] },
    champions: {},
    nextKey: 1,
  };

  const mainLosers = buildMainDraw(graph, teamCount);
  if (lossLimit >= 2) {
    const secondChanceLosers = buildDropBracket(graph, 'second_chance', mainLosers);
    if (lossLimit === 3) buildDropBracket(graph, 'last_chance', secondChanceLosers);
  }
  const { nextKey: _nextKey, ...result } = graph;
  return result;
}

export function buildFirstRoundConsolationGraph(teamCount: number): EliminationGraph {
  if (!Number.isInteger(teamCount) || teamCount < 2) throw new Error('At least two teams are required.');
  const graph: MutableGraph = {
    matches: [],
    sectionRounds: { main: [], second_chance: [], last_chance: [] },
    champions: {},
    nextKey: 1,
  };
  const firstRoundLosers = buildMainDraw(graph, teamCount)[0] || [];
  if (firstRoundLosers.length) buildDropBracket(graph, 'second_chance', [firstRoundLosers]);
  const { nextKey: _nextKey, ...result } = graph;
  return result;
}
