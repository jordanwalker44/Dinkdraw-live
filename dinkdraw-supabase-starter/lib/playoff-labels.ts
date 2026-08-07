export function formatPlayoffRoundLabel(roundLabel: string | null | undefined): string {
  const normalized = (roundLabel || '').trim();
  const lower = normalized.toLowerCase();

  if (lower.includes('semi')) return 'Semi-Final';
  if (lower.includes('quarter')) return 'Quarter-Final';
  if (lower.includes('championship')) return 'Championship';
  if (lower === 'final' || lower === 'finals') return 'Final';

  return normalized || 'Playoff Round';
}

export function formatPlayoffGameLabel(
  bracketType: 'championship' | 'consolation',
  roundLabel: string | null | undefined
): string {
  const bracketLabel =
    bracketType === 'consolation' ? 'Consolation Bracket' : 'Championship Bracket';

  return `${bracketLabel} - ${formatPlayoffRoundLabel(roundLabel)}`;
}
