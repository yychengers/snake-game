import { DIRECTIONS, LEVEL_TARGET_SCORE, MAX_LEVEL, OPPOSITE } from './constants';
import { MODE_BALANCE } from './config';
import {
  applyFoodEffect,
  boostCombo,
  computeMultiplier,
  createObstacles,
  decayCombo,
  decayEffects,
  getTickMsByRule,
  hasBodyOrObstacleCollision,
  placeItem,
  rollFoodType,
} from './rules';
import { normalizeLevel, pointKey } from './utils';
import type { AdvanceOptions, Food, GameMode, GameState, InitOptions, Point } from './types';

/**
 * 该文件是游戏"状态引擎"：
 * 1) 接收当前 GameState
 * 2) 推进一帧（advanceState）
 * 3) 返回新的 GameState
 *
 * 约束：所有函数保持"输入状态 -> 输出新状态"的纯函数风格，
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
  const startX = Math.floor(width / 2);
  const startY = Math.floor(height / 2);
  const normalizedLevel = normalizeLevel(level);
  const normalizedUnlocked = Math.max(normalizedLevel, normalizeLevel(unlockedLevel));

  const snake: Point[] = [{ x: startX, y: startY }];
  const obstacles = createObstacles({ width, height, level: normalizedLevel, mode, snake });

  const balance = MODE_BALANCE[mode];
  const timeLimit = balance.timeLimit ?? 0;
  const timeRemaining = balance.timeLimit ?? 0;

  const baseState: GameState = {
    width,
    height,
    mode,
    snake,
    obstacles,
    direction: 'right',
    nextDirection: 'right',
    food: { x: 0, y: 0, type: 'normal' },
    item: null,
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
    hasShield: false,
    timeRemaining,
    timeLimit,
    isGameOver: false,
    isPaused: false,
    isCompleted: false,
  };

  return {
    ...baseState,
    food: placeFood(baseState, randomFn),
    item: placeItem(baseState, randomFn),
  };
}

/** Queues direction change while preventing direct reverse into body. */
export function setDirection(state: GameState, direction: GameState['direction']): GameState {
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
  if (state.isGameOver || state.isPaused || state.isCompleted) {
    return state;
  }

  const balance = MODE_BALANCE[state.mode];
  let nextTimeRemaining = state.timeRemaining;
  if (balance.timeLimit && balance.timeLimit > 0) {
    nextTimeRemaining = state.timeRemaining - 1;
    if (nextTimeRemaining <= 0) {
      return {
        ...state,
        timeRemaining: 0,
        isGameOver: true,
      };
    }
  }

  const effects = decayEffects(state.effects);
  const comboAfterDecay = decayCombo(state);
  const multiplier = computeMultiplier(comboAfterDecay.comboCount, effects.doubleTicks > 0);

  const direction = state.nextDirection;
  const offset = DIRECTIONS[direction];
  const currentHead = state.snake[0];
  const newHead: Point = {
    x: currentHead.x + offset.x,
    y: currentHead.y + offset.y,
  };

  const hitWall =
    newHead.x < 0 || newHead.x >= state.width || newHead.y < 0 || newHead.y >= state.height;

  if (hitWall) {
    if (state.hasShield) {
      const newDirection =
        direction === 'left'
          ? 'right'
          : direction === 'right'
            ? 'left'
            : direction === 'up'
              ? 'down'
              : 'up';
      let safeHead = currentHead;
      if (newHead.x < 0) safeHead = { x: 0, y: currentHead.y };
      else if (newHead.x >= state.width) safeHead = { x: state.width - 1, y: currentHead.y };
      else if (newHead.y < 0) safeHead = { x: currentHead.x, y: 0 };
      else if (newHead.y >= state.height) safeHead = { x: currentHead.x, y: state.height - 1 };

      return {
        ...state,
        direction: newDirection,
        nextDirection: newDirection,
        hasShield: false,
        timeRemaining: nextTimeRemaining,
      };
    }
    return failState(state, {
      direction,
      effects,
      ...comboAfterDecay,
      multiplier,
      timeRemaining: nextTimeRemaining,
    });
  }

  const isEating = newHead.x === state.food.x && newHead.y === state.food.y;
  const isCollectingItem = state.item && newHead.x === state.item.x && newHead.y === state.item.y;

  if (hasBodyOrObstacleCollision(state.snake, state.obstacles, newHead, isEating)) {
    if (state.hasShield) {
      return {
        ...state,
        direction: OPPOSITE[direction],
        nextDirection: OPPOSITE[direction],
        hasShield: false,
        timeRemaining: nextTimeRemaining,
      };
    }
    return failState(state, {
      direction,
      effects,
      ...comboAfterDecay,
      multiplier,
      timeRemaining: nextTimeRemaining,
    });
  }

  let nextSnake = [newHead, ...state.snake];
  let nextObstacles = [...state.obstacles];
  let nextHasShield = state.hasShield;
  let nextItem = state.item;

  if (isCollectingItem && state.item) {
    if (state.item.type === 'shield') {
      nextHasShield = true;
    } else if (state.item.type === 'teleport') {
      const freeSpots: Point[] = [];
      const blocked = new Set<string>();
      for (const part of nextSnake) blocked.add(pointKey(part));
      for (const obs of nextObstacles) blocked.add(pointKey(obs));
      for (let y = 0; y < state.height; y += 1) {
        for (let x = 0; x < state.width; x += 1) {
          if (!blocked.has(`${x},${y}`)) {
            freeSpots.push({ x, y });
          }
        }
      }
      if (freeSpots.length > 0) {
        const idx = Math.floor(randomFn() * freeSpots.length);
        const newHeadPos = freeSpots[idx];
        nextSnake = [newHeadPos, ...nextSnake.slice(0, -1)];
      }
    } else if (state.item.type === 'clear_obstacles') {
      nextObstacles = [];
    }
    nextItem = placeItem(
      {
        width: state.width,
        height: state.height,
        mode: state.mode,
        snake: nextSnake,
        obstacles: nextObstacles,
        food: state.food,
      },
      randomFn,
    );
  }

  if (!isEating) {
    nextSnake.pop();
    return {
      ...state,
      direction,
      snake: nextSnake,
      obstacles: nextObstacles,
      effects,
      comboCount: comboAfterDecay.comboCount,
      comboTicksRemaining: comboAfterDecay.comboTicksRemaining,
      multiplier,
      hasShield: nextHasShield,
      item: nextItem,
      timeRemaining: nextTimeRemaining,
    };
  }

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
    obstacles: nextObstacles,
    levelScore: state.levelScore + 1,
    totalScore: state.totalScore + multiplierAfterEat,
    comboCount: comboAfterEat.comboCount,
    comboTicksRemaining: comboAfterEat.comboTicksRemaining,
    multiplier: multiplierAfterEat,
    effects: effectsAfterEat,
    hasShield: nextHasShield,
    timeRemaining: nextTimeRemaining,
  };

  const withFood = {
    ...withEat,
    food: placeFood(withEat, randomFn),
    item: placeItem({ ...withEat, food: withEat.food }, randomFn),
  };

  return advanceLevelIfNeeded(withFood, randomFn);
}

/** Places next food on any free non-snake, non-obstacle tile. */
export function placeFood(
  state: Pick<GameState, 'width' | 'height' | 'snake' | 'obstacles' | 'mode'>,
  randomFn: () => number = Math.random,
): Food {
  const blocked = new Set<string>();
  for (const part of state.snake) blocked.add(pointKey(part));
  for (const obstacle of state.obstacles) blocked.add(pointKey(obstacle));

  let selected: Point | null = null;
  let freeCount = 0;
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if (blocked.has(`${x},${y}`)) continue;
      freeCount += 1;
      if (randomFn() < 1 / freeCount) {
        selected = { x, y };
      }
    }
  }

  if (!selected) {
    return {
      ...state.snake[0],
      type: 'normal',
    };
  }

  return {
    ...selected,
    type: rollFoodType(state.mode, randomFn),
  };
}

/** Restarts the current stage while preserving accumulated meta progress. */
export function restartCurrentLevel(
  state: GameState,
  randomFn: () => number = Math.random,
): GameState {
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
    'direction' | 'effects' | 'comboCount' | 'comboTicksRemaining' | 'multiplier' | 'timeRemaining'
  >,
): GameState {
  return {
    ...state,
    ...update,
    isGameOver: true,
  };
}

/** Handles 100-score gate and auto-transition between levels/modes. */
function advanceLevelIfNeeded(state: GameState, randomFn: () => number): GameState {
  if (state.mode === 'endless' || state.mode === 'timed') {
    return state;
  }

  if (state.levelScore < LEVEL_TARGET_SCORE) {
    return state;
  }

  if (state.level >= MAX_LEVEL) {
    return {
      ...state,
      isCompleted: true,
      isPaused: true,
    };
  }

  const nextLevel = state.level + 1;
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
