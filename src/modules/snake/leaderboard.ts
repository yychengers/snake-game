import type { LeaderboardData, LeaderboardEntry } from './types';

/** localStorage key，升级结构时可以通过版本号迁移。 */
const STORAGE_KEY = 'snake_leaderboard_v1';

/** Loads local leaderboard; returns empty data when unavailable/corrupted. */
export function loadLeaderboard(): LeaderboardData {
  // SSR / 非浏览器环境直接返回空数据
  if (typeof window === 'undefined') {
    return { recent: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { recent: [] };
    }

    const parsed = JSON.parse(raw) as Partial<LeaderboardData>;
    // 容错：字段不存在或结构损坏时回退为空
    if (!parsed || !Array.isArray(parsed.recent)) {
      return { recent: [] };
    }

    return {
      recent: parsed.recent.slice(0, 10).map(normalizeEntry),
    };
  } catch {
    return { recent: [] };
  }
}

/** Persists leaderboard to localStorage with top-10 cap. */
export function saveLeaderboard(data: LeaderboardData): void {
  // SSR 环境不执行落盘
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      recent: data.recent.slice(0, 10),
    }),
  );
}

/** Prepends a new result and keeps only latest 10 records. */
export function addLeaderboardEntry(
  data: LeaderboardData,
  entry: LeaderboardEntry,
): LeaderboardData {
  // 新数据永远插到最前，保留最近 10 条
  const normalized = normalizeEntry(entry);
  return {
    recent: [normalized, ...data.recent].slice(0, 10),
  };
}

/** 清空排行榜数据。 */
export function clearLeaderboard(): LeaderboardData {
  return { recent: [] };
}

/** 返回总榜最高分记录。 */
export function getTopScore(data: LeaderboardData): LeaderboardEntry | null {
  let best: LeaderboardEntry | null = null;
  for (const item of data.recent) {
    if (!best || item.totalScore > best.totalScore) {
      best = item;
    }
  }
  return best;
}

/** 返回指定模式最高分记录。 */
export function getTopScoreByMode(
  data: LeaderboardData,
  mode: LeaderboardEntry['mode'],
): LeaderboardEntry | null {
  let best: LeaderboardEntry | null = null;
  for (const item of data.recent) {
    if (item.mode !== mode) continue;
    if (!best || item.totalScore > best.totalScore) {
      best = item;
    }
  }
  return best;
}

/** 返回最快通关记录（仅统计 completed=true）。 */
export function getFastestCompletion(data: LeaderboardData): LeaderboardEntry | null {
  let fastest: LeaderboardEntry | null = null;
  for (const item of data.recent) {
    if (!item.completed) continue;
    if (!fastest || item.durationMs < fastest.durationMs) {
      fastest = item;
    }
  }
  return fastest;
}

/** Normalizes incoming record fields to safe values. */
function normalizeEntry(entry: Partial<LeaderboardEntry>): LeaderboardEntry {
  // 对外部输入做最小约束，避免历史脏数据破坏 UI
  return {
    mode: (entry.mode ?? 'classic') as LeaderboardEntry['mode'],
    totalScore: Number(entry.totalScore ?? 0),
    level: Number(entry.level ?? 1),
    completed: Boolean(entry.completed),
    durationMs: Math.max(0, Number(entry.durationMs ?? 0)),
    playedAt: String(entry.playedAt ?? new Date().toISOString()),
  };
}
