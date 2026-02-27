import { COMBO_WINDOW_TICKS, EFFECT_TICKS, LEVEL_TICK_MS } from './constants';
import { MODE_BALANCE } from './config';
import { containsPoint, pointKey } from './utils';
import type { ActiveEffects, FoodType, GameMode, Point } from './types';

/**
 * 该文件是“规则层”，不直接关心 UI/定时器。
 * 主要负责：障碍生成、食物概率、效果衰减、连击倍率、速度曲线。
 */

/** Generates deterministic obstacle positions by mode and level. */
export function createObstacles({
  width,
  height,
  level,
  mode,
  snake,
}: {
  width: number;
  height: number;
  level: number;
  mode: GameMode;
  snake: Point[];
}): Point[] {
  // 只有障碍/挑战模式启用障碍物
  if (mode !== 'obstacle' && mode !== 'challenge') {
    return [];
  }

  const balance = MODE_BALANCE[mode];
  // 随关卡增加障碍数量，具体策略在配置表中维护
  const targetCount = Math.min(
    balance.obstacleBase + level * balance.obstaclePerLevel,
    Math.floor((width * height) / 5),
  );

  const blocked = new Set(snake.map(pointKey));
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const obstacles: Point[] = [];

  // 用可复现公式替代纯随机，便于测试稳定性
  let i = 0;
  while (obstacles.length < targetCount && i < 800) {
    const x = (i * 7 + level * 3 + (mode === 'challenge' ? 2 : 0)) % width;
    const y = (i * 11 + level * 5 + (mode === 'challenge' ? 1 : 0)) % height;
    i += 1;

    const point = { x, y };
    const key = pointKey(point);
    // 出生区附近保留空白，降低开局即死概率
    const nearSpawn = Math.abs(x - centerX) <= 2 && Math.abs(y - centerY) <= 2;
    if (nearSpawn || blocked.has(key)) {
      continue;
    }

    blocked.add(key);
    obstacles.push(point);
  }

  return obstacles;
}

/** Randomly picks next food type by current mode probabilities. */
export function rollFoodType(mode: GameMode, randomFn: () => number): FoodType {
  const weights = MODE_BALANCE[mode].foodWeights;
  const total = weights.normal + weights.speed + weights.slow + weights.double;
  const r = randomFn() * total;

  if (r < weights.normal) return 'normal';
  if (r < weights.normal + weights.speed) return 'speed';
  if (r < weights.normal + weights.speed + weights.slow) return 'slow';
  return 'double';
}

/** Decrements temporary effect counters each tick. */
export function decayEffects(effects: ActiveEffects): ActiveEffects {
  return {
    speedTicks: Math.max(0, effects.speedTicks - 1),
    slowTicks: Math.max(0, effects.slowTicks - 1),
    doubleTicks: Math.max(0, effects.doubleTicks - 1),
  };
}

/** Applies the newly eaten food's effect into active effects. */
export function applyFoodEffect(effects: ActiveEffects, type: FoodType): ActiveEffects {
  // 普通食物不附带效果
  if (type === 'normal') {
    return effects;
  }

  // 加速和减速互斥，避免同帧冲突
  if (type === 'speed') {
    return {
      ...effects,
      speedTicks: EFFECT_TICKS,
      slowTicks: 0,
    };
  }

  if (type === 'slow') {
    return {
      ...effects,
      slowTicks: EFFECT_TICKS,
      speedTicks: 0,
    };
  }

  return {
    ...effects,
    doubleTicks: EFFECT_TICKS,
  };
}

/** Calculates score multiplier by combo stage and double-score effect. */
export function computeMultiplier(comboCount: number, hasDoubleEffect: boolean): number {
  // 每 3 次连击提升一档，最高 4 倍；双倍果可再乘 2
  const comboMultiplier = Math.min(4, 1 + Math.floor(Math.max(comboCount - 1, 0) / 3));
  return hasDoubleEffect ? comboMultiplier * 2 : comboMultiplier;
}

/** Returns updated combo window after one movement tick. */
export function decayCombo(state: { comboTicksRemaining: number; comboCount: number }): {
  comboTicksRemaining: number;
  comboCount: number;
} {
  // 连击窗口每帧衰减；窗口归零则连击归零
  const comboTicksRemaining = Math.max(0, state.comboTicksRemaining - 1);
  const comboCount = comboTicksRemaining > 0 ? state.comboCount : 0;
  return { comboTicksRemaining, comboCount };
}

/** Returns next combo values when food is eaten this tick. */
export function boostCombo(state: { comboTicksRemaining: number; comboCount: number }): {
  comboTicksRemaining: number;
  comboCount: number;
} {
  // 在窗口内继续吃到食物则连击+1，否则重置为 1 连击
  const comboCount = state.comboTicksRemaining > 0 ? state.comboCount + 1 : 1;
  return {
    comboCount,
    comboTicksRemaining: COMBO_WINDOW_TICKS,
  };
}

/** Computes dynamic tick duration by mode, level and active effects. */
export function getTickMsByRule(input: {
  mode: GameMode;
  level: number;
  totalScore: number;
  effects: ActiveEffects;
  speedScale?: number;
}): number {
  // 基础速度来自关卡速度表
  let base = LEVEL_TICK_MS[input.level];
  const balance = MODE_BALANCE[input.mode];

  // 模式修正：无尽按总分动态加速，其他模式按配置表加减
  if (input.mode === 'endless') {
    base = Math.max(68, 176 - Math.floor(input.totalScore / 20) * 4);
  } else {
    base += balance.baseTickDelta;
  }

  // 临时效果修正：加速果/减速果
  if (input.effects.speedTicks > 0) {
    base -= 26;
  }
  if (input.effects.slowTicks > 0) {
    base += 26;
  }

  // 速度倍率：<1 更快，>1 更慢
  const scaled = base * (input.speedScale ?? 1);
  // 限制上下界，避免过快/过慢影响可玩性
  return Math.max(45, Math.min(280, scaled));
}

/** Returns true if the new head collides with snake body or obstacles. */
export function hasBodyOrObstacleCollision(
  snake: Point[],
  obstacles: Point[],
  newHead: Point,
  isEating: boolean,
): boolean {
  // 不吃食物时尾巴会移动，所以碰撞检测可忽略最后一节尾巴
  const bodyToCheck = isEating ? snake : snake.slice(0, -1);
  return containsPoint(bodyToCheck, newHead) || containsPoint(obstacles, newHead);
}
