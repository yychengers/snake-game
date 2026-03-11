import type { TetrisGameMode } from './types';

export type TetrisAnalyticsData = {
  totalGames: number;
  totalScore: number;
  totalLines: number;
  totalTimeMs: number;
  bestScore: number;
  bestLevel: number;
  modeStarts: Record<TetrisGameMode, number>;
  modeFinishes: Record<TetrisGameMode, number>;
};

const ANALYTICS_KEY = 'tetris_analytics_v1';

export function loadTetrisAnalytics(): TetrisAnalyticsData {
  if (typeof window === 'undefined') {
    return emptyTetrisAnalytics();
  }

  try {
    const raw = window.localStorage.getItem(ANALYTICS_KEY);
    if (!raw) {
      return emptyTetrisAnalytics();
    }

    const parsed = JSON.parse(raw) as Partial<TetrisAnalyticsData>;
    return normalizeTetrisAnalytics(parsed);
  } catch {
    return emptyTetrisAnalytics();
  }
}

export function saveTetrisAnalytics(data: TetrisAnalyticsData): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(normalizeTetrisAnalytics(data)));
}

export function trackTetrisStart(data: TetrisAnalyticsData, mode: TetrisGameMode): TetrisAnalyticsData {
  const next = normalizeTetrisAnalytics(data);
  next.totalGames += 1;
  next.modeStarts[mode] += 1;
  return next;
}

export function trackTetrisFinish(
  data: TetrisAnalyticsData,
  mode: TetrisGameMode,
  score: number,
  level: number,
  lines: number,
  durationMs: number,
): TetrisAnalyticsData {
  const next = normalizeTetrisAnalytics(data);
  next.modeFinishes[mode] += 1;
  next.totalScore += score;
  next.totalLines += lines;
  next.totalTimeMs += Math.max(0, durationMs);

  if (score > next.bestScore) {
    next.bestScore = score;
  }
  if (level > next.bestLevel) {
    next.bestLevel = level;
  }

  return next;
}

function emptyTetrisAnalytics(): TetrisAnalyticsData {
  return {
    totalGames: 0,
    totalScore: 0,
    totalLines: 0,
    totalTimeMs: 0,
    bestScore: 0,
    bestLevel: 0,
    modeStarts: { classic: 0, zen: 0 },
    modeFinishes: { classic: 0, zen: 0 },
  };
}

function normalizeTetrisAnalytics(input: Partial<TetrisAnalyticsData>): TetrisAnalyticsData {
  const base = emptyTetrisAnalytics();
  return {
    totalGames: Number(input.totalGames ?? base.totalGames),
    totalScore: Number(input.totalScore ?? base.totalScore),
    totalLines: Number(input.totalLines ?? base.totalLines),
    totalTimeMs: Number(input.totalTimeMs ?? base.totalTimeMs),
    bestScore: Number(input.bestScore ?? base.bestScore),
    bestLevel: Number(input.bestLevel ?? base.bestLevel),
    modeStarts: {
      classic: Number(input.modeStarts?.classic ?? base.modeStarts.classic),
      zen: Number(input.modeStarts?.zen ?? base.modeStarts.zen),
    },
    modeFinishes: {
      classic: Number(input.modeFinishes?.classic ?? base.modeFinishes.classic),
      zen: Number(input.modeFinishes?.zen ?? base.modeFinishes.zen),
    },
  };
}
