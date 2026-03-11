import type { GameMode, SnakeSkin, SnakeSkinId } from './types';

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
  itemWeights?: {
    shield: number;
    teleport: number;
    clear_obstacles: number;
  };
  timeLimit?: number;
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
  timed: {
    baseTickDelta: -15,
    obstacleBase: 3,
    obstaclePerLevel: 1,
    foodWeights: { normal: 60, speed: 15, slow: 10, double: 15 },
    itemWeights: { shield: 5, teleport: 5, clear_obstacles: 5 },
    timeLimit: 120,
  },
};

export type GameSettings = {
  audioEnabled: boolean;
  gridSize: number;
  speedScale: number;
  keymap: 'arrows' | 'wasd' | 'both';
  theme: ThemeId;
  snakeSkin: SnakeSkinId;
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
  snakeSkin: 'classic',
};

export const SNAKE_SKINS: Record<SnakeSkinId, SnakeSkin> = {
  classic: {
    id: 'classic',
    label: '经典',
    headColor: '#5f7f64',
    bodyColor: '#6b8f71',
    hasAnimation: false,
  },
  cute: {
    id: 'cute',
    label: '萌趣',
    headColor: '#ff9a9e',
    bodyColor: '#fecfef',
    hasAnimation: true,
  },
  pixel: {
    id: 'pixel',
    label: '像素',
    headColor: '#9dffb5',
    bodyColor: '#6df08f',
    hasAnimation: true,
  },
  neon: {
    id: 'neon',
    label: '霓虹',
    headColor: '#78e4ff',
    bodyColor: '#5ed8ff',
    hasAnimation: true,
  },
  forest: {
    id: 'forest',
    label: '森林',
    headColor: '#89e0a8',
    bodyColor: '#68d08d',
    hasAnimation: true,
  },
  dragon: {
    id: 'dragon',
    label: '神龙',
    headColor: '#ffd700',
    bodyColor: '#ff8c00',
    hasAnimation: true,
  },
};

export { type SnakeSkinId } from './types';
