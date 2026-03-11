import type { Direction, GameMode, Point } from './types';

/** 方向到位移向量映射。 */
export const DIRECTIONS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** 每个方向的反方向，用于禁止蛇反向掉头。 */
export const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** 菜单展示顺序使用的模式列表。 */
export const GAME_MODES: GameMode[] = ['classic', 'endless', 'obstacle', 'challenge', 'timed'];

/** 模式名称的中文文案。 */
export const MODE_LABEL: Record<GameMode, string> = {
  classic: '经典',
  endless: '无尽',
  obstacle: '障碍',
  challenge: '挑战',
  timed: '计时赛',
};

/** 关卡与玩法节奏常量。 */
export const MAX_LEVEL = 10;
export const LEVEL_TARGET_SCORE = 100;
export const COMBO_WINDOW_TICKS = 18;
export const EFFECT_TICKS = 28;

/** 各关基础 tick（毫秒），数值越小速度越快。 */
export const LEVEL_TICK_MS: Record<number, number> = {
  1: 180,
  2: 165,
  3: 150,
  4: 138,
  5: 126,
  6: 116,
  7: 106,
  8: 98,
  9: 90,
  10: 82,
};
