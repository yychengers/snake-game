import { describe, expect, it } from 'vitest';

import {
  advanceState,
  createInitialState,
  EFFECT_TICKS,
  getTickMs,
  LEVEL_TARGET_SCORE,
  MODE_BALANCE,
  patchSettings,
  placeFood,
  restartCurrentLevel,
  resetGame,
  togglePause,
  type GameState,
} from '../src/modules/snake';

describe('snake game expanded logic', () => {
  it('eating one food always adds one level progress', () => {
    const state = createInitialState({ width: 8, height: 8, mode: 'classic', randomFn: () => 0 });
    state.food = { x: state.snake[0].x + 1, y: state.snake[0].y, type: 'normal' };

    const next = advanceState(state, { randomFn: () => 0 });
    expect(next.levelScore).toBe(1);
  });

  it('obstacle mode has obstacles and collision ends game', () => {
    const state = createInitialState({ width: 12, height: 12, mode: 'obstacle', level: 3, randomFn: () => 0 });
    expect(state.obstacles.length).toBeGreaterThan(0);

    const obstacle = state.obstacles[0];
    const collideState: GameState = {
      ...state,
      snake: [{ x: obstacle.x - 1, y: obstacle.y }],
      direction: 'right',
      nextDirection: 'right',
      food: { x: 0, y: 0, type: 'normal' },
    };

    const next = advanceState(collideState, { randomFn: () => 0 });
    expect(next.isGameOver).toBe(true);
  });

  it('speed food applies speed effect and lowers tick delay', () => {
    const state: GameState = {
      ...createInitialState({ width: 8, height: 8, mode: 'classic', randomFn: () => 0 }),
      snake: [{ x: 2, y: 2 }],
      obstacles: [],
      direction: 'right',
      nextDirection: 'right',
      food: { x: 3, y: 2, type: 'speed' },
    };

    const before = getTickMs(state);
    const next = advanceState(state, { randomFn: () => 0 });
    expect(next.effects.speedTicks).toBe(EFFECT_TICKS);
    expect(getTickMs(next)).toBeLessThan(before);
  });

  it('combo and multiplier increase with continuous eating', () => {
    let state: GameState = {
      ...createInitialState({ width: 8, height: 8, mode: 'classic', randomFn: () => 0 }),
      snake: [{ x: 1, y: 1 }],
      obstacles: [],
      direction: 'right',
      nextDirection: 'right',
      food: { x: 2, y: 1, type: 'normal' },
    };

    state = advanceState(state, { randomFn: () => 0 });
    state.food = { x: state.snake[0].x + 1, y: state.snake[0].y, type: 'normal' };
    state = advanceState(state, { randomFn: () => 0 });
    state.food = { x: state.snake[0].x + 1, y: state.snake[0].y, type: 'normal' };
    state = advanceState(state, { randomFn: () => 0 });
    state.food = { x: state.snake[0].x + 1, y: state.snake[0].y, type: 'normal' };
    state = advanceState(state, { randomFn: () => 0 });

    expect(state.comboCount).toBe(4);
    expect(state.multiplier).toBeGreaterThan(1);
  });

  it('classic mode unlocks next level after 100 foods', () => {
    const state = createInitialState({ width: 8, height: 8, mode: 'classic', level: 1, randomFn: () => 0 });
    state.levelScore = LEVEL_TARGET_SCORE - 1;
    state.food = { x: state.snake[0].x + 1, y: state.snake[0].y, type: 'normal' };

    const next = advanceState(state, { randomFn: () => 0 });
    expect(next.level).toBe(2);
    expect(next.levelScore).toBe(0);
    expect(next.unlockedLevel).toBe(2);
  });

  it('endless mode never auto-levels after 100 foods', () => {
    const state = createInitialState({ width: 8, height: 8, mode: 'endless', level: 1, randomFn: () => 0 });
    state.levelScore = LEVEL_TARGET_SCORE - 1;
    state.food = { x: state.snake[0].x + 1, y: state.snake[0].y, type: 'normal' };

    const next = advanceState(state, { randomFn: () => 0 });
    expect(next.mode).toBe('endless');
    expect(next.level).toBe(1);
    expect(next.levelScore).toBe(LEVEL_TARGET_SCORE);
  });

  it('food never spawns on snake or obstacles', () => {
    const food = placeFood(
      {
        width: 3,
        height: 3,
        mode: 'obstacle',
        snake: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 0, y: 2 },
        ],
        obstacles: [{ x: 1, y: 2 }],
      },
      () => 0,
    );

    expect(food.x).toBe(2);
    expect(food.y).toBe(2);
  });

  it('resetGame starts from level 1 in target mode', () => {
    const seed = createInitialState({ width: 20, height: 20, mode: 'classic' });
    const next = resetGame(seed, 'challenge', () => 0);
    expect(next.mode).toBe('challenge');
    expect(next.level).toBe(1);
    expect(next.totalScore).toBe(0);
  });

  it('combo resets after combo window expires', () => {
    let state = createInitialState({ width: 60, height: 8, mode: 'classic', randomFn: () => 0 });
    state.food = { x: state.snake[0].x + 1, y: state.snake[0].y, type: 'normal' };
    state = advanceState(state, { randomFn: () => 0 });
    expect(state.comboCount).toBe(1);

    // 让连击窗口自然衰减到 0
    for (let i = 0; i < 30; i += 1) {
      state.food = { x: 0, y: 0, type: 'normal' };
      state = advanceState(state, { randomFn: () => 0 });
      if (state.isGameOver) break;
    }
    expect(state.comboCount).toBe(0);
  });

  it('double food multiplies gained score immediately', () => {
    const state = createInitialState({ width: 8, height: 8, mode: 'classic', randomFn: () => 0 });
    state.food = { x: state.snake[0].x + 1, y: state.snake[0].y, type: 'double' };
    const next = advanceState(state, { randomFn: () => 0 });
    expect(next.effects.doubleTicks).toBe(EFFECT_TICKS);
    expect(next.totalScore).toBe(2);
  });

  it('togglePause flips paused state and blocks in terminal state', () => {
    const running = createInitialState({ width: 8, height: 8, mode: 'classic', randomFn: () => 0 });
    const paused = togglePause(running);
    expect(paused.isPaused).toBe(true);
    expect(togglePause(paused).isPaused).toBe(false);

    const over = togglePause({ ...running, isGameOver: true });
    expect(over.isPaused).toBe(false);
  });

  it('restartCurrentLevel keeps meta progress but resets round state', () => {
    const seed = createInitialState({ width: 10, height: 10, mode: 'challenge', randomFn: () => 0 });
    const progressed: GameState = {
      ...seed,
      level: 4,
      unlockedLevel: 5,
      totalScore: 88,
      levelScore: 42,
      comboCount: 3,
      comboTicksRemaining: 7,
      snake: [{ x: 4, y: 4 }, { x: 3, y: 4 }],
      isPaused: true,
    };

    const next = restartCurrentLevel(progressed, () => 0);
    expect(next.mode).toBe('challenge');
    expect(next.level).toBe(4);
    expect(next.unlockedLevel).toBe(5);
    expect(next.totalScore).toBe(88);
    expect(next.levelScore).toBe(0);
    expect(next.comboCount).toBe(0);
    expect(next.snake.length).toBe(1);
    expect(next.isPaused).toBe(false);
  });

  it('patchSettings clamps values into allowed ranges', () => {
    const next = patchSettings(
      { audioEnabled: false, gridSize: 20, speedScale: 1, keymap: 'both', theme: 'sage' },
      { gridSize: 200, speedScale: 0.2, keymap: 'invalid' as never, theme: 'invalid' as never },
    );

    expect(next.gridSize).toBe(36);
    expect(next.speedScale).toBe(0.7);
    expect(next.keymap).toBe('both');
    expect(next.theme).toBe('sage');
  });

  it('obstacles never spawn near initial center area', () => {
    const state = createInitialState({ width: 20, height: 20, mode: 'obstacle', level: 4, randomFn: () => 0 });
    const center = Math.floor(state.width / 2);
    const invalid = state.obstacles.some((p) => Math.abs(p.x - center) <= 2 && Math.abs(p.y - center) <= 2);
    expect(invalid).toBe(false);
  });

  it('mode balance config drives obstacle count growth', () => {
    const level = 5;
    const state = createInitialState({ width: 30, height: 30, mode: 'obstacle', level, randomFn: () => 0 });
    const expectedMin = MODE_BALANCE.obstacle.obstacleBase + level * MODE_BALANCE.obstacle.obstaclePerLevel;
    expect(state.obstacles.length).toBeGreaterThanOrEqual(expectedMin);
  });
});
