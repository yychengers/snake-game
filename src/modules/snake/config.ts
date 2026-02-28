import type { GameMode } from './types';

export type ModeBalance = {
  baseTickDelta: number;
  obstacleBase: number;
  obstaclePerLevel: number;
  foodWeights: {
    normal: number;
    speed: number;
    slow: number;
    double: number;
  };
};

/** 可调平衡表：速度、障碍数量、食物概率都集中在这里。 */
export const MODE_BALANCE: Record<GameMode, ModeBalance> = {
  classic: {
    baseTickDelta: 0,
    obstacleBase: 0,
    obstaclePerLevel: 0,
    foodWeights: { normal: 70, speed: 10, slow: 10, double: 10 },
  },
  endless: {
    baseTickDelta: 0,
    obstacleBase: 0,
    obstaclePerLevel: 0,
    foodWeights: { normal: 72, speed: 8, slow: 10, double: 10 },
  },
  obstacle: {
    baseTickDelta: -10,
    obstacleBase: 5,
    obstaclePerLevel: 2,
    foodWeights: { normal: 68, speed: 10, slow: 12, double: 10 },
  },
  challenge: {
    baseTickDelta: -20,
    obstacleBase: 8,
    obstaclePerLevel: 2,
    foodWeights: { normal: 50, speed: 20, slow: 15, double: 15 },
  },
};

export type GameSettings = {
  audioEnabled: boolean;
  gridSize: number;
  speedScale: number;
  keymap: 'arrows' | 'wasd' | 'both';
  theme: ThemeId;
};

export const THEME_IDS = [
  'sage',
  'sunset',
  'ocean',
  'noir',
  'paper',
  'retro',
  'neon',
  'sand',
  'forest',
  'ice',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** 默认设置，用户可在 UI 中覆盖并持久化。 */
export const DEFAULT_SETTINGS: GameSettings = {
  audioEnabled: false,
  gridSize: 20,
  speedScale: 1,
  keymap: 'both',
  theme: 'sage',
};
