import type { TetrisGameMode, TetrisLeaderboardEntry } from './types';

const LEADERBOARD_KEY = 'tetris_leaderboard_v1';
const MAX_ENTRIES = 20;

export function loadTetrisLeaderboard(): TetrisLeaderboardEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) {
      return [];
    }

    return JSON.parse(raw) as TetrisLeaderboardEntry[];
  } catch {
    return [];
  }
}

export function saveTetrisLeaderboard(entries: TetrisLeaderboardEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  const sorted = [...entries]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);

  window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(sorted));
}

export function addTetrisLeaderboardEntry(
  mode: TetrisGameMode,
  score: number,
  level: number,
  lines: number,
  durationMs: number,
): TetrisLeaderboardEntry {
  const entry: TetrisLeaderboardEntry = {
    mode,
    score,
    level,
    lines,
    durationMs,
    playedAt: new Date().toISOString(),
  };

  const entries = loadTetrisLeaderboard();
  entries.push(entry);
  saveTetrisLeaderboard(entries);

  return entry;
}

export function getTetrisTopScores(mode?: TetrisGameMode): TetrisLeaderboardEntry[] {
  const entries = loadTetrisLeaderboard();

  if (mode) {
    return entries.filter((e) => e.mode === mode).slice(0, 10);
  }

  return entries.slice(0, 10);
}

export function clearTetrisLeaderboard(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(LEADERBOARD_KEY);
}
