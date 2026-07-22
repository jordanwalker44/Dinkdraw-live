export type LeaguePairing = {
  sessionNumber: number;
  teamNumber: number;
  player1Index: number;
  player2Index: number;
};

/**
 * Builds a round-robin partnership cycle. With an even roster of N players,
 * every player partners with every other player exactly once across N - 1 sessions.
 */
export function buildPartnershipRotation(playerCount: number, sessionCount: number) {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount % 2 !== 0) {
    throw new Error('Rotating doubles leagues require an even roster of at least 4 players.');
  }
  if (!Number.isInteger(sessionCount) || sessionCount < 1) {
    throw new Error('A league needs at least one session.');
  }

  const cycleLength = playerCount - 1;
  const pairings: LeaguePairing[] = [];

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const cycleIndex = sessionIndex % cycleLength;
    const cycleNumber = Math.floor(sessionIndex / cycleLength);
    const rotating = Array.from({ length: playerCount - 1 }, (_, index) => index + 1);

    // A different offset on later cycles changes the repeated week order while
    // preserving the complete everyone-partners-everyone property.
    const offset = (cycleIndex + cycleNumber) % rotating.length;
    const shifted = [...rotating.slice(offset), ...rotating.slice(0, offset)];
    const order = [0, ...shifted];

    for (let teamIndex = 0; teamIndex < playerCount / 2; teamIndex += 1) {
      pairings.push({
        sessionNumber: sessionIndex + 1,
        teamNumber: teamIndex + 1,
        player1Index: order[teamIndex],
        player2Index: order[playerCount - 1 - teamIndex],
      });
    }
  }

  return pairings;
}

export function partnershipRotationIsComplete(playerCount: number, pairings: LeaguePairing[]) {
  const seen = new Set<string>();

  for (const pairing of pairings) {
    const key = [pairing.player1Index, pairing.player2Index].sort((a, b) => a - b).join(':');
    if (seen.has(key)) return false;
    seen.add(key);
  }

  return seen.size === (playerCount * (playerCount - 1)) / 2;
}
