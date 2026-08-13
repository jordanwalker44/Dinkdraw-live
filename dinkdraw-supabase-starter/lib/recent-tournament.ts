export const LAST_TOURNAMENT_KEY = 'dinkdraw_last_tournament';
export const RECENT_COMPLETED_TOURNAMENT_DAYS = 7;

export type RecentTournament = {
  id: string;
  title: string;
  status?: string | null;
  expiresAt?: string | null;
};

export function readRecentTournament(): RecentTournament | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw) as RecentTournament;
    if (!saved?.id || !saved?.title) return null;

    if (saved.expiresAt && new Date(saved.expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(LAST_TOURNAMENT_KEY);
      return null;
    }

    return saved;
  } catch {
    return null;
  }
}

export function saveRecentTournament(tournament: {
  id: string;
  title: string;
  status?: string | null;
  updated_at?: string | null;
}) {
  if (typeof window === 'undefined') return;

  const completedAt = tournament.updated_at ? new Date(tournament.updated_at) : new Date();
  const expiresAt = tournament.status === 'completed'
    ? new Date(completedAt.getTime() + RECENT_COMPLETED_TOURNAMENT_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;

  window.localStorage.setItem(
    LAST_TOURNAMENT_KEY,
    JSON.stringify({
      id: tournament.id,
      title: tournament.title,
      status: tournament.status ?? null,
      expiresAt,
    } satisfies RecentTournament)
  );
}
