import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addLeaderboardEntry,
  advanceState,
  createInitialState,
  getTopScore,
  loadAnalytics,
  loadLeaderboard,
  saveAnalytics,
  saveLeaderboard,
  trackFinish,
  trackStart,
} from '../src/modules/snake';

describe('game flow persistence', () => {
  let originalWindow: unknown;

  const storage = new Map<string, string>();
  const localStorageMock = {
    get length(): number {
      return storage.size;
    },
    clear(): void {
      storage.clear();
    },
    getItem(key: string): string | null {
      return storage.has(key) ? storage.get(key)! : null;
    },
    key(index: number): string | null {
      return [...storage.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      storage.delete(key);
    },
    setItem(key: string, value: string): void {
      storage.set(key, String(value));
    },
  };

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      localStorage: localStorageMock,
    };
    localStorageMock.clear();
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
      return;
    }
    (globalThis as any).window = originalWindow;
  });

  it('persists one full run into leaderboard and analytics', () => {
    let analytics = loadAnalytics();
    analytics = trackStart(analytics, 'classic');

    let state = createInitialState({ width: 8, height: 8, mode: 'classic', randomFn: () => 0 });
    state = {
      ...state,
      snake: [{ x: state.width - 1, y: 2 }],
      direction: 'right',
      nextDirection: 'right',
      food: { x: 0, y: 0, type: 'normal' },
    };
    state = advanceState(state, { randomFn: () => 0 });
    expect(state.isGameOver).toBe(true);

    const nextLeaderboard = addLeaderboardEntry(loadLeaderboard(), {
      mode: state.mode,
      totalScore: state.totalScore,
      level: state.level,
      completed: state.isCompleted,
      durationMs: 4200,
      playedAt: '2026-02-28T00:00:00.000Z',
    });
    saveLeaderboard(nextLeaderboard);

    analytics = trackFinish(analytics, state.mode, 4200, state.isCompleted);
    saveAnalytics(analytics);

    const persistedLeaderboard = loadLeaderboard();
    const persistedAnalytics = loadAnalytics();
    expect(persistedLeaderboard.recent.length).toBe(1);
    expect(getTopScore(persistedLeaderboard)?.playedAt).toBe('2026-02-28T00:00:00.000Z');
    expect(persistedAnalytics.sessions).toBe(1);
    expect(persistedAnalytics.finishes).toBe(1);
    expect(persistedAnalytics.totalDurationMs).toBe(4200);
  });
});
