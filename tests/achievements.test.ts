import { describe, expect, it } from 'vitest';

import {
  ACHIEVEMENTS,
  applyRunAchievements,
  backfillAchievements,
  loadAchievements,
  markAchievementUnlocksSeen,
  type AchievementStore,
} from '../src/modules/snake';

function freshStore(): AchievementStore {
  const store = loadAchievements();
  store.backfilledAt = null;
  for (const item of ACHIEVEMENTS) {
    store.entries[item.id] = { unlocked: false, unlockedAt: null, progress: 0 };
  }
  store.pendingUnlockIds = [];
  store.totals = {
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
  };
  return store;
}

describe('achievement logic', () => {
  it('unlocks first bite and tracks pending notifications', () => {
    const store = freshStore();
    const result = applyRunAchievements(store, {
      mode: 'classic',
      completed: false,
      totalScore: 1,
      finalLevel: 1,
      foodsEaten: 1,
      speedFoods: 0,
      slowFoods: 0,
      maxCombo: 1,
    });

    expect(result.store.entries.first_bite.unlocked).toBe(true);
    expect(result.newlyUnlocked).toContain('first_bite');
    expect(result.store.pendingUnlockIds).toContain('first_bite');

    const cleared = markAchievementUnlocksSeen(result.store);
    expect(cleared.pendingUnlockIds.length).toBe(0);
  });

  it('unlocks speed and combo achievements from one strong run', () => {
    const store = freshStore();
    const result = applyRunAchievements(store, {
      mode: 'challenge',
      completed: true,
      totalScore: 140,
      finalLevel: 3,
      foodsEaten: 18,
      speedFoods: 3,
      slowFoods: 1,
      maxCombo: 8,
    });

    expect(result.store.entries.combo_rookie.unlocked).toBe(true);
    expect(result.store.entries.combo_master.unlocked).toBe(true);
    expect(result.store.entries.speed_runner.unlocked).toBe(true);
    expect(result.store.entries.challenge_pulse.unlocked).toBe(true);
  });

  it('backfills from analytics and leaderboard-derived metrics', () => {
    const store = freshStore();
    const backfilled = backfillAchievements(
      store,
      {
        sessions: 22,
        finishes: 12,
        completions: 3,
        totalDurationMs: 10000,
        modeStarts: { classic: 10, endless: 5, obstacle: 5, challenge: 2 },
        modeFinishes: { classic: 8, endless: 2, obstacle: 1, challenge: 1 },
      },
      {
        recent: [
          {
            mode: 'classic',
            totalScore: 130,
            level: 10,
            completed: true,
            durationMs: 3000,
            playedAt: '2026-02-28T00:00:00.000Z',
          },
          {
            mode: 'obstacle',
            totalScore: 80,
            level: 5,
            completed: false,
            durationMs: 2200,
            playedAt: '2026-02-28T00:10:00.000Z',
          },
          {
            mode: 'endless',
            totalScore: 125,
            level: 1,
            completed: false,
            durationMs: 2100,
            playedAt: '2026-02-28T00:20:00.000Z',
          },
        ],
      },
    );

    expect(backfilled.entries.marathon_snake.unlocked).toBe(true);
    expect(backfilled.entries.score_chaser.unlocked).toBe(true);
    expect(backfilled.entries.classic_cleared.unlocked).toBe(true);
    expect(backfilled.entries.obstacle_ace.unlocked).toBe(true);
    expect(backfilled.entries.endless_spirit.unlocked).toBe(true);
    expect(backfilled.backfilledAt).not.toBeNull();
  });
});
