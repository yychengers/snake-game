import type { AnalyticsData } from './analytics';
import type { GameMode } from './types';
import type { LeaderboardData } from './types';

const STORAGE_KEY = 'snake_achievements_v1';
const VERSION = 1;

export type AchievementId =
  | 'first_bite'
  | 'getting_warmed_up'
  | 'score_chaser'
  | 'marathon_snake'
  | 'combo_rookie'
  | 'combo_master'
  | 'speed_runner'
  | 'control_specialist'
  | 'classic_cleared'
  | 'obstacle_ace'
  | 'challenge_pulse'
  | 'endless_spirit';

export type AchievementDefinition = {
  id: AchievementId;
  title: string;
  description: string;
  hidden?: boolean;
  hint?: string;
  target: number;
};

export type AchievementEntry = {
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
};

export type AchievementTotals = {
  runsPlayed: number;
  foodsEaten: number;
  bestScore: number;
  bestCombo: number;
  bestSingleRunSpeedFoods: number;
  bestSingleRunSlowFoods: number;
  classicCompletions: number;
  obstacleBestLevel: number;
  bestChallengeCombo: number;
  bestEndlessScore: number;
};

export type AchievementStore = {
  version: number;
  totals: AchievementTotals;
  entries: Record<AchievementId, AchievementEntry>;
  pendingUnlockIds: AchievementId[];
  backfilledAt: string | null;
};

export type RunAchievementSummary = {
  mode: GameMode;
  completed: boolean;
  totalScore: number;
  finalLevel: number;
  foodsEaten: number;
  speedFoods: number;
  slowFoods: number;
  maxCombo: number;
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'first_bite', title: '初尝一口', description: '首次吃到食物。', target: 1 },
  { id: 'getting_warmed_up', title: '状态渐入', description: '累计吃到 50 个食物。', target: 50 },
  { id: 'score_chaser', title: '分数追猎者', description: '单局总分达到 100。', target: 100 },
  { id: 'marathon_snake', title: '耐力之蛇', description: '累计完成 20 局游戏。', target: 20 },
  { id: 'combo_rookie', title: '连击新秀', description: '单局最高连击达到 3。', target: 3 },
  { id: 'combo_master', title: '连击大师', description: '单局最高连击达到 8。', target: 8 },
  { id: 'speed_runner', title: '极速玩家', description: '单局吃到 3 个加速果。', target: 3 },
  { id: 'control_specialist', title: '控场专家', description: '单局吃到 3 个减速果。', target: 3 },
  { id: 'classic_cleared', title: '经典通关', description: '经典模式通关 1 次。', target: 1 },
  { id: 'obstacle_ace', title: '障碍王牌', description: '障碍模式达到第 5 关。', target: 5 },
  {
    id: 'challenge_pulse',
    title: '挑战脉冲',
    description: '在挑战模式完成一局高连击对局。',
    hidden: true,
    hint: '在挑战模式中完成一局较高连击的对局。',
    target: 6,
  },
  {
    id: 'endless_spirit',
    title: '无尽意志',
    description: '在无尽模式中单局分数达到 120。',
    hidden: true,
    hint: '在无尽模式坚持更久并拿到更高分。',
    target: 120,
  },
];

export function loadAchievements(): AchievementStore {
  if (typeof window === 'undefined') {
    return createDefaultAchievementStore();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultAchievementStore();
    const parsed = JSON.parse(raw) as Partial<AchievementStore>;
    return normalizeStore(parsed);
  } catch {
    return createDefaultAchievementStore();
  }
}

export function saveAchievements(store: AchievementStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeStore(store)));
}

export function resetAchievements(): AchievementStore {
  const fresh = createDefaultAchievementStore();
  saveAchievements(fresh);
  return fresh;
}

export function markAchievementUnlocksSeen(store: AchievementStore): AchievementStore {
  return {
    ...store,
    pendingUnlockIds: [],
  };
}

export function backfillAchievements(
  store: AchievementStore,
  analytics: AnalyticsData,
  leaderboard: LeaderboardData,
): AchievementStore {
  if (store.backfilledAt) return store;

  const next = cloneStore(store);
  next.totals.runsPlayed = Math.max(next.totals.runsPlayed, Math.max(0, analytics.sessions));
  next.totals.bestScore = Math.max(next.totals.bestScore, getBestScoreFromLeaderboard(leaderboard));
  next.totals.obstacleBestLevel = Math.max(
    next.totals.obstacleBestLevel,
    getBestLevelByMode(leaderboard, 'obstacle'),
  );
  next.totals.classicCompletions = Math.max(
    next.totals.classicCompletions,
    getCompletedCountByMode(leaderboard, 'classic'),
  );
  next.totals.bestEndlessScore = Math.max(
    next.totals.bestEndlessScore,
    getBestScoreByMode(leaderboard, 'endless'),
  );
  next.backfilledAt = new Date().toISOString();

  return recomputeProgressAndUnlock(next);
}

export function applyRunAchievements(
  store: AchievementStore,
  run: RunAchievementSummary,
): {
  store: AchievementStore;
  newlyUnlocked: AchievementId[];
} {
  const next = cloneStore(store);
  const previouslyUnlocked = new Set<AchievementId>(
    ACHIEVEMENTS.filter((item) => next.entries[item.id].unlocked).map((item) => item.id),
  );

  next.totals.runsPlayed += 1;
  next.totals.foodsEaten += Math.max(0, run.foodsEaten);
  next.totals.bestScore = Math.max(next.totals.bestScore, run.totalScore);
  next.totals.bestCombo = Math.max(next.totals.bestCombo, run.maxCombo);
  next.totals.bestSingleRunSpeedFoods = Math.max(next.totals.bestSingleRunSpeedFoods, run.speedFoods);
  next.totals.bestSingleRunSlowFoods = Math.max(next.totals.bestSingleRunSlowFoods, run.slowFoods);

  if (run.mode === 'classic' && run.completed) {
    next.totals.classicCompletions += 1;
  }
  if (run.mode === 'obstacle') {
    next.totals.obstacleBestLevel = Math.max(next.totals.obstacleBestLevel, run.finalLevel);
  }
  if (run.mode === 'challenge' && run.completed) {
    next.totals.bestChallengeCombo = Math.max(next.totals.bestChallengeCombo, run.maxCombo);
  }
  if (run.mode === 'endless') {
    next.totals.bestEndlessScore = Math.max(next.totals.bestEndlessScore, run.totalScore);
  }

  const withUnlocks = recomputeProgressAndUnlock(next);
  const newlyUnlocked = ACHIEVEMENTS.filter(
    (item) => withUnlocks.entries[item.id].unlocked && !previouslyUnlocked.has(item.id),
  ).map((item) => item.id);

  return {
    store: withUnlocks,
    newlyUnlocked,
  };
}

function createDefaultAchievementStore(): AchievementStore {
  const entries = {} as Record<AchievementId, AchievementEntry>;
  for (const item of ACHIEVEMENTS) {
    entries[item.id] = { unlocked: false, unlockedAt: null, progress: 0 };
  }
  return {
    version: VERSION,
    totals: {
      runsPlayed: 0,
      foodsEaten: 0,
      bestScore: 0,
      bestCombo: 0,
      bestSingleRunSpeedFoods: 0,
      bestSingleRunSlowFoods: 0,
      classicCompletions: 0,
      obstacleBestLevel: 0,
      bestChallengeCombo: 0,
      bestEndlessScore: 0,
    },
    entries,
    pendingUnlockIds: [],
    backfilledAt: null,
  };
}

function normalizeStore(input: Partial<AchievementStore>): AchievementStore {
  const base = createDefaultAchievementStore();
  const entries = { ...base.entries };
  for (const item of ACHIEVEMENTS) {
    const source = input.entries?.[item.id];
    entries[item.id] = {
      unlocked: Boolean(source?.unlocked),
      unlockedAt: source?.unlockedAt ? String(source.unlockedAt) : null,
      progress: Math.max(0, Number(source?.progress ?? 0)),
    };
  }

  const pending = Array.isArray(input.pendingUnlockIds)
    ? input.pendingUnlockIds.filter((id): id is AchievementId =>
        ACHIEVEMENTS.some((item) => item.id === id),
      )
    : [];

  return recomputeProgressAndUnlock({
    version: VERSION,
    totals: {
      runsPlayed: Math.max(0, Number(input.totals?.runsPlayed ?? base.totals.runsPlayed)),
      foodsEaten: Math.max(0, Number(input.totals?.foodsEaten ?? base.totals.foodsEaten)),
      bestScore: Math.max(0, Number(input.totals?.bestScore ?? base.totals.bestScore)),
      bestCombo: Math.max(0, Number(input.totals?.bestCombo ?? base.totals.bestCombo)),
      bestSingleRunSpeedFoods: Math.max(
        0,
        Number(input.totals?.bestSingleRunSpeedFoods ?? base.totals.bestSingleRunSpeedFoods),
      ),
      bestSingleRunSlowFoods: Math.max(
        0,
        Number(input.totals?.bestSingleRunSlowFoods ?? base.totals.bestSingleRunSlowFoods),
      ),
      classicCompletions: Math.max(
        0,
        Number(input.totals?.classicCompletions ?? base.totals.classicCompletions),
      ),
      obstacleBestLevel: Math.max(
        0,
        Number(input.totals?.obstacleBestLevel ?? base.totals.obstacleBestLevel),
      ),
      bestChallengeCombo: Math.max(
        0,
        Number(input.totals?.bestChallengeCombo ?? base.totals.bestChallengeCombo),
      ),
      bestEndlessScore: Math.max(
        0,
        Number(input.totals?.bestEndlessScore ?? base.totals.bestEndlessScore),
      ),
    },
    entries,
    pendingUnlockIds: pending,
    backfilledAt: input.backfilledAt ? String(input.backfilledAt) : null,
  });
}

function recomputeProgressAndUnlock(store: AchievementStore): AchievementStore {
  const next = cloneStore(store);
  const now = new Date().toISOString();

  for (const item of ACHIEVEMENTS) {
    const progress = getProgressById(item.id, next.totals);
    const entry = next.entries[item.id];
    entry.progress = progress;

    if (!entry.unlocked && progress >= item.target) {
      entry.unlocked = true;
      entry.unlockedAt = now;
      if (!next.pendingUnlockIds.includes(item.id)) {
        next.pendingUnlockIds.push(item.id);
      }
    }
  }

  return next;
}

function getProgressById(id: AchievementId, totals: AchievementTotals): number {
  switch (id) {
    case 'first_bite':
    case 'getting_warmed_up':
      return totals.foodsEaten;
    case 'score_chaser':
      return totals.bestScore;
    case 'marathon_snake':
      return totals.runsPlayed;
    case 'combo_rookie':
    case 'combo_master':
      return totals.bestCombo;
    case 'speed_runner':
      return totals.bestSingleRunSpeedFoods;
    case 'control_specialist':
      return totals.bestSingleRunSlowFoods;
    case 'classic_cleared':
      return totals.classicCompletions;
    case 'obstacle_ace':
      return totals.obstacleBestLevel;
    case 'challenge_pulse':
      return totals.bestChallengeCombo;
    case 'endless_spirit':
      return totals.bestEndlessScore;
    default:
      return 0;
  }
}

function getBestScoreFromLeaderboard(leaderboard: LeaderboardData): number {
  let best = 0;
  for (const item of leaderboard.recent) {
    best = Math.max(best, item.totalScore);
  }
  return best;
}

function getBestLevelByMode(leaderboard: LeaderboardData, mode: GameMode): number {
  let best = 0;
  for (const item of leaderboard.recent) {
    if (item.mode === mode) {
      best = Math.max(best, item.level);
    }
  }
  return best;
}

function getBestScoreByMode(leaderboard: LeaderboardData, mode: GameMode): number {
  let best = 0;
  for (const item of leaderboard.recent) {
    if (item.mode === mode) {
      best = Math.max(best, item.totalScore);
    }
  }
  return best;
}

function getCompletedCountByMode(leaderboard: LeaderboardData, mode: GameMode): number {
  let count = 0;
  for (const item of leaderboard.recent) {
    if (item.mode === mode && item.completed) {
      count += 1;
    }
  }
  return count;
}

function cloneStore(store: AchievementStore): AchievementStore {
  const entries = {} as Record<AchievementId, AchievementEntry>;
  for (const item of ACHIEVEMENTS) {
    const entry = store.entries[item.id];
    entries[item.id] = {
      unlocked: entry.unlocked,
      unlockedAt: entry.unlockedAt,
      progress: entry.progress,
    };
  }
  return {
    version: store.version,
    totals: { ...store.totals },
    entries,
    pendingUnlockIds: [...store.pendingUnlockIds],
    backfilledAt: store.backfilledAt,
  };
}
