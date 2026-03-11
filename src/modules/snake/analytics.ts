import type { GameMode } from './types';

export type AnalyticsData = {
  sessions: number;
  finishes: number;
  completions: number;
  totalDurationMs: number;
  modeStarts: Record<GameMode, number>;
  modeFinishes: Record<GameMode, number>;
};

const ANALYTICS_KEY = 'snake_analytics_v1';

/** 读取本地埋点统计。 */
export function loadAnalytics(): AnalyticsData {
  if (typeof window === 'undefined') {
    return emptyAnalytics();
  }

  try {
    const raw = window.localStorage.getItem(ANALYTICS_KEY);
    if (!raw) {
      return emptyAnalytics();
    }

    const parsed = JSON.parse(raw) as Partial<AnalyticsData>;
    return normalizeAnalytics(parsed);
  } catch {
    return emptyAnalytics();
  }
}

/** 落盘埋点统计。 */
export function saveAnalytics(data: AnalyticsData): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(normalizeAnalytics(data)));
}

/** 记录开局事件。 */
export function trackStart(data: AnalyticsData, mode: GameMode): AnalyticsData {
  const next = normalizeAnalytics(data);
  next.sessions += 1;
  next.modeStarts[mode] += 1;
  return next;
}

/** 记录结束事件（失败或通关）。 */
export function trackFinish(
  data: AnalyticsData,
  mode: GameMode,
  durationMs: number,
  completed: boolean,
): AnalyticsData {
  const next = normalizeAnalytics(data);
  next.finishes += 1;
  next.modeFinishes[mode] += 1;
  next.totalDurationMs += Math.max(0, durationMs);
  if (completed) {
    next.completions += 1;
  }
  return next;
}

function emptyAnalytics(): AnalyticsData {
  return {
    sessions: 0,
    finishes: 0,
    completions: 0,
    totalDurationMs: 0,
    modeStarts: { classic: 0, endless: 0, obstacle: 0, challenge: 0, timed: 0 },
    modeFinishes: { classic: 0, endless: 0, obstacle: 0, challenge: 0, timed: 0 },
  };
}

function normalizeAnalytics(input: Partial<AnalyticsData>): AnalyticsData {
  const base = emptyAnalytics();
  return {
    sessions: Number(input.sessions ?? base.sessions),
    finishes: Number(input.finishes ?? base.finishes),
    completions: Number(input.completions ?? base.completions),
    totalDurationMs: Number(input.totalDurationMs ?? base.totalDurationMs),
    modeStarts: {
      classic: Number(input.modeStarts?.classic ?? base.modeStarts.classic),
      endless: Number(input.modeStarts?.endless ?? base.modeStarts.endless),
      obstacle: Number(input.modeStarts?.obstacle ?? base.modeStarts.obstacle),
      challenge: Number(input.modeStarts?.challenge ?? base.modeStarts.challenge),
      timed: Number(input.modeStarts?.timed ?? base.modeStarts.timed),
    },
    modeFinishes: {
      classic: Number(input.modeFinishes?.classic ?? base.modeFinishes.classic),
      endless: Number(input.modeFinishes?.endless ?? base.modeFinishes.endless),
      obstacle: Number(input.modeFinishes?.obstacle ?? base.modeFinishes.obstacle),
      challenge: Number(input.modeFinishes?.challenge ?? base.modeFinishes.challenge),
      timed: Number(input.modeFinishes?.timed ?? base.modeFinishes.timed),
    },
  };
}
