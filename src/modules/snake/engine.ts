import { DIRECTIONS, LEVEL_TARGET_SCORE, MAX_LEVEL, OPPOSITE } from './constants';
import {
  applyFoodEffect,
  boostCombo,
  computeMultiplier,
  createObstacles,
  decayCombo,
  decayEffects,
  getTickMsByRule,
  hasBodyOrObstacleCollision,
  rollFoodType,
} from './rules';
import { containsPoint, normalizeLevel } from './utils';
import type { AdvanceOptions, Food, GameMode, GameState, InitOptions, Point } from './types';

/**
 * 该文件是游戏“状态引擎”：
 * 1) 接收当前 GameState
 * 2) 推进一帧（advanceState）
 * 3) 返回新的 GameState
 *
 * 约束：所有函数保持“输入状态 -> 输出新状态”的纯函数风格，
 * 便于测试、调试和后续规则扩展。
 */

/** Creates a fresh game state under current mode/level/progress settings. */
export function createInitialState({
  width = 20,
  height = 20,
  mode = 'classic',
  level = 1,
  unlockedLevel = 1,
  totalScore = 0,
  randomFn = Math.random,
}: InitOptions = {}): GameState {
  // 生成初始出生点：棋盘中心
  const startX = Math.floor(width / 2);
  const startY = Math.floor(height / 2);
  // 关卡做归一化，避免外部输入越界
  const normalizedLevel = normalizeLevel(level);
  // 已解锁关卡必须 >= 当前关卡
  const normalizedUnlocked = Math.max(normalizedLevel, normalizeLevel(unlockedLevel));

  const snake: Point[] = [{ x: startX, y: startY }];
  // 障碍由模式 + 关卡共同决定
  const obstacles = createObstacles({ width, height, level: normalizedLevel, mode, snake });

  const baseState: GameState = {
    width,
    height,
    mode,
    snake,
    obstacles,
    direction: 'right',
    nextDirection: 'right',
    food: { x: 0, y: 0, type: 'normal' },
    level: normalizedLevel,
    levelScore: 0,
    totalScore,
    unlockedLevel: normalizedUnlocked,
    comboCount: 0,
    comboTicksRemaining: 0,
    multiplier: 1,
    effects: {
      speedTicks: 0,
      slowTicks: 0,
      doubleTicks: 0,
    },
    isGameOver: false,
    isPaused: false,
    isCompleted: false,
  };

  // 初始食物也走统一 placeFood 逻辑，避免与后续规则分叉
  return {
    ...baseState,
    food: placeFood(baseState, randomFn),
  };
}

/** Queues direction change while preventing direct reverse into body. */
export function setDirection(state: GameState, direction: GameState['direction']): GameState {
  // 蛇长度 > 1 时禁止 180° 反向，避免“瞬间撞自己”
  if (state.snake.length > 1 && OPPOSITE[state.direction] === direction) {
    return state;
  }

  return {
    ...state,
    nextDirection: direction,
  };
}

/** Toggles pause; disabled after failure or full completion. */
export function togglePause(state: GameState): GameState {
  if (state.isGameOver || state.isCompleted) {
    return state;
  }

  return {
    ...state,
    isPaused: !state.isPaused,
  };
}

/** Advances game by one tick: move, collision, scoring, effects, and level flow. */
export function advanceState(
  state: GameState,
  { randomFn = Math.random }: AdvanceOptions = {},
): GameState {
  // 终止态 / 暂停态不推进
  if (state.isGameOver || state.isPaused || state.isCompleted) {
    return state;
  }

  // 每帧先衰减效果与连击窗口，再根据当前连击重算倍率
  const effects = decayEffects(state.effects);
  const comboAfterDecay = decayCombo(state);
  const multiplier = computeMultiplier(comboAfterDecay.comboCount, effects.doubleTicks > 0);

  // 计算“下一帧头部”坐标
  const direction = state.nextDirection;
  const offset = DIRECTIONS[direction];
  const currentHead = state.snake[0];
  const newHead: Point = {
    x: currentHead.x + offset.x,
    y: currentHead.y + offset.y,
  };

  const hitWall =
    newHead.x < 0 || newHead.x >= state.width || newHead.y < 0 || newHead.y >= state.height;

  // 判定顺序 1：撞墙
  if (hitWall) {
    return failState(state, { direction, effects, ...comboAfterDecay, multiplier });
  }

  // 判定顺序 2：是否吃到当前食物
  const isEating = newHead.x === state.food.x && newHead.y === state.food.y;
  // 判定顺序 3：撞自己 / 撞障碍
  if (hasBodyOrObstacleCollision(state.snake, state.obstacles, newHead, isEating)) {
    return failState(state, { direction, effects, ...comboAfterDecay, multiplier });
  }

  // 先统一执行“头插入”，若没吃到则再弹出尾部
  const nextSnake = [newHead, ...state.snake];
  if (!isEating) {
    nextSnake.pop();
    return {
      ...state,
      direction,
      snake: nextSnake,
      effects,
      comboCount: comboAfterDecay.comboCount,
      comboTicksRemaining: comboAfterDecay.comboTicksRemaining,
      multiplier,
    };
  }

  // 吃到食物后：连击提升 -> 效果应用 -> 重新计算倍率 -> 结算总分
  const comboAfterEat = boostCombo(comboAfterDecay);
  const effectsAfterEat = applyFoodEffect(effects, state.food.type);
  const multiplierAfterEat = computeMultiplier(
    comboAfterEat.comboCount,
    effectsAfterEat.doubleTicks > 0,
  );

  const withEat: GameState = {
    ...state,
    direction,
    snake: nextSnake,
    levelScore: state.levelScore + 1,
    totalScore: state.totalScore + multiplierAfterEat,
    comboCount: comboAfterEat.comboCount,
    comboTicksRemaining: comboAfterEat.comboTicksRemaining,
    multiplier: multiplierAfterEat,
    effects: effectsAfterEat,
  };

  const withFood = {
    ...withEat,
    food: placeFood(withEat, randomFn),
  };

  // 非无尽模式下检查“每关 100 粒”是否触发升级 / 通关
  return advanceLevelIfNeeded(withFood, randomFn);
}

/** Places next food on any free non-snake, non-obstacle tile. */
export function placeFood(
  state: Pick<GameState, 'width' | 'height' | 'snake' | 'obstacles' | 'mode'>,
  randomFn: () => number = Math.random,
): Food {
  const available: Point[] = [];

  // 扫描棋盘空位：不能和蛇身或障碍重叠
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const point = { x, y };
      if (!containsPoint(state.snake, point) && !containsPoint(state.obstacles, point)) {
        available.push(point);
      }
    }
  }

  // 极端场景：无可用空位，返回蛇头位置（避免返回非法点）
  if (available.length === 0) {
    return {
      ...state.snake[0],
      type: 'normal',
    };
  }

  const idx = Math.floor(randomFn() * available.length);
  const point = available[Math.max(0, Math.min(idx, available.length - 1))];

  // 食物类型也在这里统一抽样（普通/加速/减速/双倍）
  return {
    ...point,
    type: rollFoodType(state.mode, randomFn),
  };
}

/** Restarts the current stage while preserving accumulated meta progress. */
export function restartCurrentLevel(
  state: GameState,
  randomFn: () => number = Math.random,
): GameState {
  // 保留 mode/level/unlocked/totalScore，不保留当前局部状态（蛇长、连击等）
  return createInitialState({
    width: state.width,
    height: state.height,
    mode: state.mode,
    level: state.level,
    unlockedLevel: state.unlockedLevel,
    totalScore: state.totalScore,
    randomFn,
  });
}

/** Starts a brand new run in selected mode. */
export function resetGame(
  state: Pick<GameState, 'width' | 'height'>,
  mode: GameMode,
  randomFn: () => number = Math.random,
): GameState {
  // 新游戏总是从 level=1、unlocked=1、totalScore=0 开始
  return createInitialState({
    width: state.width,
    height: state.height,
    mode,
    level: 1,
    unlockedLevel: 1,
    totalScore: 0,
    randomFn,
  });
}

/** Returns current tick interval from dynamic mode/effect rules. */
export function getTickMs(
  state: Pick<GameState, 'mode' | 'level' | 'totalScore' | 'effects'>,
  speedScale = 1,
): number {
  // 先做 level 归一化，再交由规则层计算最终 tick
  return getTickMsByRule({
    mode: state.mode,
    level: normalizeLevel(state.level),
    totalScore: state.totalScore,
    effects: state.effects,
    speedScale,
  });
}

/** Produces a failure state snapshot with shared bookkeeping fields. */
function failState(
  state: GameState,
  update: Pick<
    GameState,
    'direction' | 'effects' | 'comboCount' | 'comboTicksRemaining' | 'multiplier'
  >,
): GameState {
  // 失败态保留必要运行数据，统一设置 isGameOver
  return {
    ...state,
    ...update,
    isGameOver: true,
  };
}

/** Handles 100-score gate and auto-transition between levels/modes. */
function advanceLevelIfNeeded(state: GameState, randomFn: () => number): GameState {
  // 无尽模式不走 100 粒关卡门槛
  if (state.mode === 'endless') {
    return state;
  }

  // 未达到门槛继续当前关
  if (state.levelScore < LEVEL_TARGET_SCORE) {
    return state;
  }

  // 最后一关达到门槛后进入 completed
  if (state.level >= MAX_LEVEL) {
    return {
      ...state,
      isCompleted: true,
      isPaused: true,
    };
  }

  const nextLevel = state.level + 1;
  // 升级后重新开新局面，但继承总分和解锁进度
  return createInitialState({
    width: state.width,
    height: state.height,
    mode: state.mode,
    level: nextLevel,
    unlockedLevel: Math.max(state.unlockedLevel, nextLevel),
    totalScore: state.totalScore,
    randomFn,
  });
}
