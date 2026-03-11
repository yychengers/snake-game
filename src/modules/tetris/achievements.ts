export type TetrisAchievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  condition: (stats: TetrisAchievementStats) => boolean;
  unlockedAt?: string;
};

export type TetrisAchievementStats = {
  totalGames: number;
  totalScore: number;
  totalLines: number;
  bestScore: number;
  bestLevel: number;
  maxLinesCleared: number;
  maxLevel: number;
};

const ACHIEVEMENTS_KEY = 'tetris_achievements_v1';

export const TETRIS_ACHIEVEMENTS: TetrisAchievement[] = [
  {
    id: 'first_game',
    title: '初体验',
    description: '完成第一局俄罗斯方块',
    icon: '🎮',
    condition: (stats) => stats.totalGames >= 1,
  },
  {
    id: 'score_1000',
    title: '初露头角',
    description: '单局得分达到 1000',
    icon: '⭐',
    condition: (stats) => stats.bestScore >= 1000,
  },
  {
    id: 'score_5000',
    title: '小有所成',
    description: '单局得分达到 5000',
    icon: '🌟',
    condition: (stats) => stats.bestScore >= 5000,
  },
  {
    id: 'score_10000',
    title: '方块大师',
    description: '单局得分达到 10000',
    icon: '🏆',
    condition: (stats) => stats.bestScore >= 10000,
  },
  {
    id: 'score_50000',
    title: '传奇玩家',
    description: '单局得分达到 50000',
    icon: '👑',
    condition: (stats) => stats.bestScore >= 50000,
  },
  {
    id: 'level_5',
    title: '进阶玩家',
    description: '达到 5 级',
    icon: '📈',
    condition: (stats) => stats.bestLevel >= 5,
  },
  {
    id: 'level_10',
    title: '高级玩家',
    description: '达到 10 级',
    icon: '🚀',
    condition: (stats) => stats.bestLevel >= 10,
  },
  {
    id: 'lines_50',
    title: '消行达人',
    description: '累计消除 50 行',
    icon: '📊',
    condition: (stats) => stats.totalLines >= 50,
  },
  {
    id: 'lines_100',
    title: '消行专家',
    description: '累计消除 100 行',
    icon: '💯',
    condition: (stats) => stats.totalLines >= 100,
  },
  {
    id: 'lines_500',
    title: '消行传奇',
    description: '累计消除 500 行',
    icon: '🔥',
    condition: (stats) => stats.totalLines >= 500,
  },
  {
    id: 'games_10',
    title: '熟能生巧',
    description: '完成 10 局游戏',
    icon: '🎯',
    condition: (stats) => stats.totalGames >= 10,
  },
  {
    id: 'games_50',
    title: '俄罗斯方块爱好者',
    description: '完成 50 局游戏',
    icon: '❤️',
    condition: (stats) => stats.totalGames >= 50,
  },
];

export function loadTetrisAchievements(): Map<string, string> {
  if (typeof window === 'undefined') {
    return new Map();
  }

  try {
    const raw = window.localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) {
      return new Map();
    }

    return new Map(JSON.parse(raw) as [string, string][]);
  } catch {
    return new Map();
  }
}

export function saveTetrisAchievements(achievements: Map<string, string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify([...achievements.entries()])
  );
}

export function checkTetrisAchievements(
  achievements: Map<string, string>,
  stats: TetrisAchievementStats,
): TetrisAchievement[] {
  const newlyUnlocked: TetrisAchievement[] = [];

  for (const achievement of TETRIS_ACHIEVEMENTS) {
    if (achievements.has(achievement.id)) {
      continue;
    }

    if (achievement.condition(stats)) {
      const unlockedAt = new Date().toISOString();
      achievements.set(achievement.id, unlockedAt);
      newlyUnlocked.push({ ...achievement, unlockedAt });
    }
  }

  if (newlyUnlocked.length > 0) {
    saveTetrisAchievements(achievements);
  }

  return newlyUnlocked;
}

export function getUnlockedAchievements(): TetrisAchievement[] {
  const unlockedMap = loadTetrisAchievements();
  const results: TetrisAchievement[] = [];

  for (const achievement of TETRIS_ACHIEVEMENTS) {
    const unlockedAt = unlockedMap.get(achievement.id);
    if (unlockedAt) {
      results.push({ ...achievement, unlockedAt });
    }
  }

  return results;
}

export function getLockedAchievements(): TetrisAchievement[] {
  const unlockedMap = loadTetrisAchievements();

  return TETRIS_ACHIEVEMENTS.filter((a) => !unlockedMap.has(a.id));
}
