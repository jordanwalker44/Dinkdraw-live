// Node runs this TypeScript file directly with type stripping and therefore
// requires the explicit extension; Next's application compiler does not.
// @ts-ignore -- intentional direct-Node TypeScript import
const { buildFirstRoundConsolationGraph, buildFixedEliminationGraph } = await import('../lib/multi-elimination.ts');

for (const teamCount of [2, 3, 4, 6, 8, 12, 16]) {
  for (const lossLimit of [1, 2, 3] as const) {
    const graph = buildFixedEliminationGraph(teamCount, lossLimit);
    const keys = new Set(graph.matches.map((match) => match.key));
    if (keys.size !== graph.matches.length) throw new Error(`Duplicate match key for ${teamCount}/${lossLimit}`);
    for (const match of graph.matches) {
      for (const source of [match.inputA, match.inputB]) {
        if (source.kind === 'match' && !keys.has(source.matchKey)) {
          throw new Error(`Missing source ${source.matchKey} for ${match.key}`);
        }
      }
    }
    if (!graph.champions.main) throw new Error(`Missing main champion for ${teamCount}/${lossLimit}`);
    if (lossLimit >= 2 && !graph.champions.second_chance) throw new Error(`Missing second-chance champion for ${teamCount}`);
    if (lossLimit === 3 && teamCount >= 4 && !graph.champions.last_chance) throw new Error(`Missing last-chance champion for ${teamCount}`);

    for (let scenario = 0; scenario < 40; scenario += 1) {
      const results = new Map<string, { winner: number; loser: number }>();
      const losses = new Map(Array.from({ length: teamCount }, (_, index) => [index + 1, 0]));
      const resolve = (source: { kind: string; seed?: number; matchKey?: string; outcome?: string }) =>
        source.kind === 'seed'
          ? source.seed!
          : results.get(source.matchKey!)?.[source.outcome as 'winner' | 'loser'];
      for (const [matchIndex, match] of graph.matches.entries()) {
        const teamA = resolve(match.inputA);
        const teamB = resolve(match.inputB);
        if (!teamA || !teamB || teamA === teamB) throw new Error(`Invalid route into ${match.key} for ${teamCount}/${lossLimit}`);
        const aWins = (scenario + matchIndex * 7) % 3 !== 0;
        const winner = aWins ? teamA : teamB;
        const loser = aWins ? teamB : teamA;
        losses.set(loser, (losses.get(loser) || 0) + 1);
        results.set(match.key, { winner, loser });
      }
      const resolveChampion = (section: 'main' | 'second_chance' | 'last_chance') => {
        const source = graph.champions[section];
        return source ? resolve(source) : undefined;
      };
      const mainChampion = resolveChampion('main');
      if ((losses.get(mainChampion!) || 0) !== 0) throw new Error(`Main champion has a loss for ${teamCount}`);
      if (lossLimit >= 2 && (losses.get(resolveChampion('second_chance')!) || 0) !== 1) throw new Error(`Second-chance champion loss mismatch for ${teamCount}`);
      if (lossLimit === 3 && graph.champions.last_chance && (losses.get(resolveChampion('last_chance')!) || 0) !== 2) throw new Error(`Last-chance champion loss mismatch for ${teamCount}`);
    }
  }
}

for (const teamCount of [3, 4, 6, 8, 12, 16]) {
  const graph = buildFirstRoundConsolationGraph(teamCount);
  if (!graph.champions.main || !graph.champions.second_chance) throw new Error(`Incomplete consolation graph for ${teamCount}`);
}

console.log('Multi-elimination graph validation passed.');
