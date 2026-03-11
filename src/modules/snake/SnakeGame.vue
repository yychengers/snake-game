<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import {
  ACHIEVEMENTS,
  addLeaderboardEntry,
  advanceState,
  applyRunAchievements,
  backfillAchievements,
  clearLeaderboard,
  createInitialState,
  GAME_MODES,
  getFastestCompletion,
  getTickMs,
  getTopScore,
  getTopScoreByMode,
  LEVEL_TARGET_SCORE,
  loadAnalytics,
  loadAchievements,
  loadLeaderboard,
  loadSettings,
  markAchievementUnlocksSeen,
  MAX_LEVEL,
  MODE_LABEL,
  patchSettings,
  renderGameToCanvas,
  restartCurrentLevel,
  saveAnalytics,
  saveAchievements,
  saveLeaderboard,
  saveSettings,
  setDirection,
  SNAKE_SKINS,
  togglePause,
  trackFinish,
  trackStart,
  THEME_OPTIONS,
  THEME_PRESETS,
  resetAchievements,
  type AchievementId,
  type AchievementStore,
  type AnalyticsData,
  type Direction,
  type GameMode,
  type GameState,
  type GameSettings,
  type LeaderboardData,
  type SnakeSkinId,
} from './index';

const selectedMode = ref<GameMode>('classic');
const settings = ref<GameSettings>(loadSettings());
const hasStarted = ref(false);
const state = ref<GameState>(
  createInitialState({
    width: settings.value.gridSize,
    height: settings.value.gridSize,
    mode: selectedMode.value,
  }),
);
const rafId = ref<number | null>(null);
const lastFrameTime = ref<number | null>(null);
const tickAccumulator = ref(0);
const showTouchControls = ref(false);
const startedAt = ref<number | null>(null);
const leaderboard = ref<LeaderboardData>({ recent: [] });
const analytics = ref<AnalyticsData>(loadAnalytics());
const boardRef = ref<HTMLCanvasElement | null>(null);
const achievements = ref<AchievementStore>(loadAchievements());
const achievementFilter = ref<'all' | 'unlocked' | 'locked' | 'hidden'>('all');
const achievementExpandedId = ref<AchievementId | null>(null);
const leaderboardModeFilter = ref<'all' | GameMode>('all');
const leaderboardSort = ref<'latest' | 'score' | 'duration'>('latest');
const achievementToast = ref<{ id: AchievementId; title: string } | null>(null);
const runTracker = ref<{
  mode: GameMode;
  foodsEaten: number;
  speedFoods: number;
  slowFoods: number;
  maxCombo: number;
} | null>(null);
let achievementToastTimer: number | null = null;
let audioCtx: AudioContext | null = null;

const activeTab = ref<'game' | 'achievements' | 'leaderboard' | 'stats'>('game');
const showSettingsModal = ref(false);
const showMoreMenu = ref(false);

const statusText = computed(() => {
  if (!hasStarted.value) return '选择模式后开始游戏';
  if (state.value.isGameOver) return '游戏结束，按 R 重开本关';
  if (state.value.isCompleted) return '恭喜通关，按 N 开始新游戏';
  if (state.value.isPaused) return '已暂停，按空格/P继续';
  return '方向键/WASD 控制；每关 100 粒解锁下一关';
});

const pauseButtonText = computed(() => (state.value.isPaused ? '继续' : '暂停'));
const pauseDisabled = computed(() => !hasStarted.value || state.value.isGameOver || state.value.isCompleted);
const modeLabel = computed(() => MODE_LABEL[state.value.mode]);
const isSettled = computed(() => hasStarted.value && (state.value.isGameOver || state.value.isCompleted));
const runDurationMs = computed(() => (startedAt.value ? Date.now() - startedAt.value : 0));
const modeGuide = computed(() => {
  if (selectedMode.value === 'classic') return '经典节奏，逐关推进，适合稳定冲分。';
  if (selectedMode.value === 'endless') return '无尽生存，速度会随分数递进，挑战耐力上限。';
  if (selectedMode.value === 'obstacle') return '棋盘含障碍，走位更讲究，建议提前规划路线。';
  if (selectedMode.value === 'timed') return '120秒限时挑战，收集道具获取优势。';
  return '挑战模式更快更激进，适合熟练玩家冲击极限操作。';
});
const levelProgressPct = computed(() =>
  state.value.mode === 'endless'
    ? 100
    : Math.max(0, Math.min(100, Math.floor((state.value.levelScore / LEVEL_TARGET_SCORE) * 100))),
);
const themeOptions = THEME_OPTIONS;
const currentTheme = computed(() => THEME_PRESETS[settings.value.theme]);
const currentSkin = computed(() => SNAKE_SKINS[settings.value.snakeSkin]);
const shellStyle = computed<CSSProperties>(() => ({
  '--shell-bg': currentTheme.value.shellBg,
  '--shell-border': currentTheme.value.shellBorder,
  '--shell-shadow': currentTheme.value.shellShadow,
  '--panel-border': currentTheme.value.panelBorder,
  '--board-border': currentTheme.value.boardBorder,
  '--button-bg': currentTheme.value.buttonBg,
  '--button-border': currentTheme.value.buttonBorder,
  '--button-text': currentTheme.value.buttonText,
  '--button-active-bg': currentTheme.value.buttonActiveBg,
  '--button-active-border': currentTheme.value.buttonActiveBorder,
  '--text-color': currentTheme.value.text,
  '--muted-text': currentTheme.value.mutedText,
  '--modal-overlay': currentTheme.value.overlay,
  '--modal-bg': currentTheme.value.modalBg,
  '--theme-font': currentTheme.value.fontFamily,
  '--food-normal': currentTheme.value.canvas.foodNormal,
  '--food-speed': currentTheme.value.canvas.foodSpeed,
  '--food-slow': currentTheme.value.canvas.foodSlow,
  '--food-double': currentTheme.value.canvas.foodDouble,
  '--obstacle-color': currentTheme.value.canvas.obstacle,
}));

const topScore = computed(() => getTopScore(leaderboard.value));
const fastestCompletion = computed(() => getFastestCompletion(leaderboard.value));
const suggestedNextAction = computed(() => {
  if (state.value.isCompleted) {
    return selectedMode.value === 'classic'
      ? '建议：试试挑战模式，冲击高连击。'
      : '建议：尝试更高难度模式继续冲分。';
  }
  if (state.value.isGameOver) {
    if (state.value.mode === 'obstacle') return '建议：障碍模式优先贴边走位，降低封路风险。';
    if (state.value.mode === 'challenge') return '建议：挑战模式先稳住路线，再追求连击。';
    return '建议：下一局保持中速节奏，优先扩大安全活动区。';
  }
  return '建议：保持稳定节奏，优先确保走位空间。';
});
const unlockedAchievements = computed(
  () => ACHIEVEMENTS.filter((item) => achievements.value.entries[item.id].unlocked).length,
);
const pendingAchievementCount = computed(() => achievements.value.pendingUnlockIds.length);
const filteredAchievements = computed(() =>
  ACHIEVEMENTS.map((item) => {
    const entry = achievements.value.entries[item.id];
    const hiddenLocked = Boolean(item.hidden && !entry.unlocked);
    return {
      id: item.id,
      title: hiddenLocked ? '???' : item.title,
      description: hiddenLocked ? item.hint ?? '解锁后查看完整条件。' : item.description,
      hidden: Boolean(item.hidden),
      unlocked: entry.unlocked,
      unlockedAt: entry.unlockedAt,
      progress: Math.min(entry.progress, item.target),
      target: item.target,
      progressPct: Math.min(100, Math.floor((Math.min(entry.progress, item.target) / item.target) * 100)),
    };
  }).filter((item) => {
    if (achievementFilter.value === 'all') return true;
    if (achievementFilter.value === 'hidden') return item.hidden;
    if (achievementFilter.value === 'unlocked') return item.unlocked;
    return !item.unlocked;
  }),
);
const filteredLeaderboard = computed(() => {
  const base =
    leaderboardModeFilter.value === 'all'
      ? [...leaderboard.value.recent]
      : leaderboard.value.recent.filter((item) => item.mode === leaderboardModeFilter.value);

  if (leaderboardSort.value === 'score') {
    return base.sort((a, b) => b.totalScore - a.totalScore);
  }
  if (leaderboardSort.value === 'duration') {
    return base.sort((a, b) => a.durationMs - b.durationMs);
  }
  return base;
});
const topByMode = computed(() =>
  GAME_MODES.map((mode) => ({
    mode,
    entry: getTopScoreByMode(leaderboard.value, mode),
  })),
);
const skinOptions = computed(() => Object.values(SNAKE_SKINS));

onMounted(() => {
  leaderboard.value = loadLeaderboard();
  analytics.value = loadAnalytics();
  const backfilled = backfillAchievements(loadAchievements(), analytics.value, leaderboard.value);
  achievements.value = backfilled;
  saveAchievements(backfilled);
  showTouchControls.value = window.matchMedia('(pointer: coarse)').matches;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', drawBoard);
  applyPageTheme();
  drawBoard();
  startLoop();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', drawBoard);
  if (rafId.value !== null) {
    cancelAnimationFrame(rafId.value);
  }
  if (achievementToastTimer !== null) {
    clearTimeout(achievementToastTimer);
  }
});

watch(() => state.value, drawBoard);
watch(
  () => settings.value.theme,
  () => {
    applyPageTheme();
    drawBoard();
  },
);

function startLoop(): void {
  const run = (now: number) => {
    if (lastFrameTime.value === null) {
      lastFrameTime.value = now;
    }

    const elapsed = Math.min(120, now - lastFrameTime.value);
    lastFrameTime.value = now;

    if (hasStarted.value) {
      tickAccumulator.value += elapsed;
      let guard = 0;

      while (guard < 8) {
        const tickMs = getTickMs(state.value, settings.value.speedScale);
        if (tickAccumulator.value < tickMs) break;

        tickAccumulator.value -= tickMs;
        guard += 1;

        const prev = state.value;
        state.value = advanceState(state.value);
        updateRunTracker(prev, state.value);

        if (state.value.totalScore > prev.totalScore) {
          playEffectTone(660, 0.03);
        }

        if ((!prev.isGameOver && state.value.isGameOver) || (!prev.isCompleted && state.value.isCompleted)) {
          persistResult();
          playEffectTone(state.value.isCompleted ? 840 : 220, 0.12);
        }
      }
    } else {
      tickAccumulator.value = 0;
    }

    rafId.value = requestAnimationFrame(run);
  };

  rafId.value = requestAnimationFrame(run);
}

function drawBoard(): void {
  if (!boardRef.value) return;
  renderGameToCanvas(boardRef.value, state.value, currentTheme.value.canvas, currentSkin.value);
}

function applyPageTheme(): void {
  if (typeof window === 'undefined') return;
  document.body.style.background = currentTheme.value.pageBackground;
  document.body.style.color = currentTheme.value.text;
}

function onKeyDown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  const controlKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'p', 'r', 'n', 'w', 'a', 's', 'd'];
  if (controlKeys.includes(key)) event.preventDefault();

  if (!hasStarted.value) {
    if (key === 'n' || key === 'enter') startGame(selectedMode.value);
    return;
  }

  const allowArrows = settings.value.keymap === 'arrows' || settings.value.keymap === 'both';
  const allowWasd = settings.value.keymap === 'wasd' || settings.value.keymap === 'both';

  const map: Record<string, Direction> = {};
  if (allowArrows) {
    map.arrowup = 'up';
    map.arrowdown = 'down';
    map.arrowleft = 'left';
    map.arrowright = 'right';
  }
  if (allowWasd) {
    map.w = 'up';
    map.s = 'down';
    map.a = 'left';
    map.d = 'right';
  }

  if (map[key]) {
    state.value = setDirection(state.value, map[key]);
    return;
  }
  if (key === ' ' || key === 'p') {
    state.value = togglePause(state.value);
    return;
  }
  if (key === 'r') {
    restartLevel();
    return;
  }
  if (key === 'n') {
    startGame(selectedMode.value);
  }
}

function startGame(mode: GameMode): void {
  selectedMode.value = mode;
  hasStarted.value = true;
  startedAt.value = Date.now();
  state.value = createInitialState({
    width: settings.value.gridSize,
    height: settings.value.gridSize,
    mode,
  });

  analytics.value = trackStart(analytics.value, mode);
  saveAnalytics(analytics.value);
  runTracker.value = createRunTracker(mode);
}

function onTouchDirection(direction: Direction): void {
  if (!hasStarted.value) return;
  state.value = setDirection(state.value, direction);
}

function togglePauseAction(): void {
  if (!hasStarted.value) return;
  state.value = togglePause(state.value);
}

function restartLevel(): void {
  if (!hasStarted.value) return;
  state.value = restartCurrentLevel(state.value);
  runTracker.value = createRunTracker(state.value.mode);
}

function persistResult(): void {
  if (startedAt.value === null) return;

  const durationMs = Date.now() - startedAt.value;

  const nextLeaderboard = addLeaderboardEntry(leaderboard.value, {
    mode: state.value.mode,
    totalScore: state.value.totalScore,
    level: state.value.level,
    completed: state.value.isCompleted,
    durationMs,
    playedAt: new Date().toISOString(),
  });

  leaderboard.value = nextLeaderboard;
  saveLeaderboard(nextLeaderboard);

  analytics.value = trackFinish(analytics.value, state.value.mode, durationMs, state.value.isCompleted);
  saveAnalytics(analytics.value);

  const tracker = runTracker.value;
  const summary = {
    mode: state.value.mode,
    completed: state.value.isCompleted,
    totalScore: state.value.totalScore,
    finalLevel: state.value.level,
    foodsEaten: tracker?.foodsEaten ?? 0,
    speedFoods: tracker?.speedFoods ?? 0,
    slowFoods: tracker?.slowFoods ?? 0,
    maxCombo: Math.max(tracker?.maxCombo ?? 0, state.value.comboCount),
  };
  const achievementResult = applyRunAchievements(achievements.value, summary);
  achievements.value = achievementResult.store;
  saveAchievements(achievementResult.store);

  if (achievementResult.newlyUnlocked.length > 0) {
    showAchievementUnlockToast(achievementResult.newlyUnlocked[0]);
  }
  runTracker.value = null;
}

function chooseMode(mode: GameMode): void {
  selectedMode.value = mode;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function clearRecords(): void {
  leaderboard.value = clearLeaderboard();
  saveLeaderboard(leaderboard.value);
}

function markUnlockNotificationsRead(): void {
  achievements.value = markAchievementUnlocksSeen(achievements.value);
  saveAchievements(achievements.value);
}

function toggleAchievementExpand(id: AchievementId): void {
  achievementExpandedId.value = achievementExpandedId.value === id ? null : id;
}

function resetAchievementProgress(): void {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm('确认重置所有成就进度吗？此操作不可撤销。');
    if (!confirmed) return;
  }
  achievements.value = resetAchievements();
  achievementFilter.value = 'all';
}

function updateSettings(patch: Partial<GameSettings>): void {
  settings.value = patchSettings(settings.value, patch);
  saveSettings(settings.value);

  if (!hasStarted.value) {
    state.value = createInitialState({
      width: settings.value.gridSize,
      height: settings.value.gridSize,
      mode: selectedMode.value,
    });
    drawBoard();
  }
}

function applySettingsAndRestart(): void {
  if (!hasStarted.value) {
    state.value = createInitialState({
      width: settings.value.gridSize,
      height: settings.value.gridSize,
      mode: selectedMode.value,
    });
    drawBoard();
    return;
  }
  startGame(selectedMode.value);
}

function createRunTracker(mode: GameMode): {
  mode: GameMode;
  foodsEaten: number;
  speedFoods: number;
  slowFoods: number;
  maxCombo: number;
} {
  return {
    mode,
    foodsEaten: 0,
    speedFoods: 0,
    slowFoods: 0,
    maxCombo: 0,
  };
}

function updateRunTracker(prev: GameState, next: GameState): void {
  if (!runTracker.value) return;
  runTracker.value.maxCombo = Math.max(runTracker.value.maxCombo, next.comboCount);
  if (next.totalScore <= prev.totalScore) return;

  runTracker.value.foodsEaten += 1;
  if (prev.food.type === 'speed') {
    runTracker.value.speedFoods += 1;
  } else if (prev.food.type === 'slow') {
    runTracker.value.slowFoods += 1;
  }
}

function showAchievementUnlockToast(id: AchievementId): void {
  const definition = ACHIEVEMENTS.find((item) => item.id === id);
  if (!definition) return;
  achievementToast.value = { id, title: definition.title };
  if (achievementToastTimer !== null) {
    clearTimeout(achievementToastTimer);
  }
  achievementToastTimer = window.setTimeout(() => {
    achievementToast.value = null;
  }, 2300);
  playEffectTone(980, 0.08);
}

function playEffectTone(freq: number, durationSec: number): void {
  if (!settings.value.audioEnabled || typeof window === 'undefined') return;
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  audioCtx ??= new AudioContextClass();
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }

  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  gain.gain.value = 0.03;
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + durationSec);
}
</script>

<template>
  <main class="game-shell" :style="shellStyle">
    <header class="top-bar">
      <div class="top-bar-left">
        <h1 class="game-title">贪吃蛇</h1>
      </div>
      <div class="top-bar-center">
        <div class="hud-mini">
          <span class="hud-item">
            <small>模式</small>
            <strong>{{ modeLabel }}</strong>
          </span>
          <span v-if="hasStarted" class="hud-item">
            <small>关卡</small>
            <strong>{{ state.level }}/{{ state.mode === 'endless' ? '∞' : MAX_LEVEL }}</strong>
          </span>
          <span v-if="hasStarted" class="hud-item">
            <small>分数</small>
            <strong>{{ state.totalScore }}</strong>
          </span>
          <span v-if="hasStarted && state.mode === 'timed'" class="hud-item timed">
            <small>剩余</small>
            <strong>{{ Math.floor(state.timeRemaining / 60) }}:{{ String(state.timeRemaining % 60).padStart(2, '0') }}</strong>
          </span>
        </div>
      </div>
      <div class="top-bar-right">
        <button type="button" class="icon-btn" @click="showSettingsModal = true" title="设置">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button type="button" class="icon-btn" @click="showMoreMenu = !showMoreMenu" title="更多">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="12" cy="19" r="2"></circle>
          </svg>
        </button>
      </div>
    </header>

    <div v-if="showMoreMenu" class="more-menu-dropdown">
      <div class="mode-select-section">
        <h4>选择模式</h4>
        <div class="mode-grid">
          <button
            v-for="mode in GAME_MODES"
            :key="mode"
            type="button"
            :class="['mode-btn-compact', { active: selectedMode === mode }]"
            @click="chooseMode(mode)"
          >
            {{ MODE_LABEL[mode] }}
          </button>
        </div>
        <p class="mode-guide-text">{{ modeGuide }}</p>
      </div>
      <div class="theme-select-section">
        <h4>选择主题</h4>
        <div class="theme-grid">
          <button
            v-for="theme in themeOptions"
            :key="theme.id"
            type="button"
            :class="['theme-chip', { active: settings.theme === theme.id }]"
            @click="updateSettings({ theme: theme.id })"
          >
            {{ theme.label }}
          </button>
        </div>
      </div>
    </div>

    <nav class="tab-nav">
      <button
        type="button"
        :class="['tab-btn', { active: activeTab === 'game' }]"
        @click="activeTab = 'game'"
      >
        游戏
      </button>
      <button
        type="button"
        :class="['tab-btn', { active: activeTab === 'achievements' }]"
        @click="activeTab = 'achievements'"
      >
        成就
        <span v-if="pendingAchievementCount > 0" class="badge">{{ pendingAchievementCount }}</span>
      </button>
      <button
        type="button"
        :class="['tab-btn', { active: activeTab === 'leaderboard' }]"
        @click="activeTab = 'leaderboard'"
      >
        排行榜
      </button>
      <button
        type="button"
        :class="['tab-btn', { active: activeTab === 'stats' }]"
        @click="activeTab = 'stats'"
      >
        统计
      </button>
    </nav>

    <section v-if="activeTab === 'game'" class="game-view">
      <div class="board-container">
        <canvas ref="boardRef" class="game-canvas" aria-label="snake game board" />
        <div class="legend-mini">
          <span><i class="legend-dot food-normal" />普通</span>
          <span><i class="legend-dot food-speed" />加速</span>
          <span><i class="legend-dot food-slow" />减速</span>
          <span><i class="legend-dot food-double" />双倍</span>
          <span><i class="legend-dot obstacle" />障碍</span>
        </div>
      </div>

      <div class="game-actions">
        <button
          v-if="!hasStarted"
          type="button"
          class="start-btn-large"
          @click="startGame(selectedMode)"
        >
          开始游戏
        </button>
        <template v-else>
          <button
            type="button"
            class="action-btn primary"
            :disabled="pauseDisabled"
            @click="togglePauseAction"
          >
            {{ pauseButtonText }}
          </button>
          <button type="button" class="action-btn" @click="restartLevel">重开</button>
          <button type="button" class="action-btn primary" @click="startGame(selectedMode)">新游戏</button>
        </template>
      </div>

      <div class="status-bar">
        <span>{{ statusText }}</span>
        <div v-if="hasStarted && state.mode !== 'endless' && state.mode !== 'timed'" class="progress-mini">
          <div class="progress-fill" :style="{ width: `${levelProgressPct}%` }" />
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'achievements'" class="content-panel">
      <div class="panel-header">
        <h3>成就系统</h3>
        <div class="panel-controls">
          <select v-model="achievementFilter">
            <option value="all">全部</option>
            <option value="locked">未解锁</option>
            <option value="unlocked">已解锁</option>
            <option value="hidden">隐藏</option>
          </select>
          <button v-if="pendingAchievementCount > 0" type="button" class="btn-sm" @click="markUnlockNotificationsRead">
            新解锁 ({{ pendingAchievementCount }})
          </button>
        </div>
      </div>
      <p class="stats-summary">已解锁 {{ unlockedAchievements }}/{{ ACHIEVEMENTS.length }}</p>
      <ul class="achievement-list">
        <li v-for="item in filteredAchievements" :key="item.id" :class="['achievement-card', { unlocked: item.unlocked }]">
          <div class="achievement-header">
            <strong>{{ item.title }}</strong>
            <span class="achievement-status">{{ item.unlocked ? '已解锁' : '未解锁' }}</span>
          </div>
          <p class="achievement-desc">{{ item.description }}</p>
          <div class="achievement-progress">
            <div class="progress-bar" :style="{ width: `${item.progressPct}%` }" />
          </div>
          <div class="achievement-footer">
            <small>{{ item.progress }} / {{ item.target }}</small>
            <button type="button" class="btn-link" @click="toggleAchievementExpand(item.id)">
              {{ achievementExpandedId === item.id ? '收起' : '详情' }}
            </button>
          </div>
          <div v-if="achievementExpandedId === item.id" class="achievement-detail">
            <p v-if="item.unlocked && item.unlockedAt">
              解锁时间：{{ new Date(item.unlockedAt).toLocaleString() }}
            </p>
            <p v-else>尚未解锁，继续加油。</p>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="activeTab === 'leaderboard'" class="content-panel">
      <div class="panel-header">
        <h3>排行榜</h3>
        <div class="panel-controls">
          <select v-model="leaderboardModeFilter">
            <option value="all">全部模式</option>
            <option v-for="mode in GAME_MODES" :key="mode" :value="mode">{{ MODE_LABEL[mode] }}</option>
          </select>
          <select v-model="leaderboardSort">
            <option value="latest">最近</option>
            <option value="score">分数</option>
            <option value="duration">时长</option>
          </select>
        </div>
      </div>
      <div class="stats-summary">
        <p v-if="topScore">最高分：{{ MODE_LABEL[topScore.mode] }} {{ topScore.totalScore }}</p>
        <p v-if="fastestCompletion">最快通关：{{ MODE_LABEL[fastestCompletion.mode] }} {{ formatDuration(fastestCompletion.durationMs) }}</p>
      </div>
      <div class="best-by-mode">
        <div v-for="item in topByMode" :key="item.mode" class="best-item">
          <span>{{ MODE_LABEL[item.mode] }}</span>
          <strong>{{ item.entry ? item.entry.totalScore : '-' }}</strong>
        </div>
      </div>
      <h4>最近战绩</h4>
      <ul class="record-list">
        <li v-for="(item, index) in filteredLeaderboard" :key="`${item.playedAt}-${index}`">
          <span class="record-mode">{{ MODE_LABEL[item.mode] }}</span>
          <span class="record-score">{{ item.totalScore }}分</span>
          <span class="record-level">关{{ item.level }}</span>
          <span class="record-time">{{ formatDuration(item.durationMs) }}</span>
          <strong v-if="item.completed" class="record-completed">通关</strong>
        </li>
        <li v-if="filteredLeaderboard.length === 0" class="empty-state">暂无记录</li>
      </ul>
      <button type="button" class="btn-danger" @click="clearRecords">清空记录</button>
    </section>

    <section v-if="activeTab === 'stats'" class="content-panel">
      <h3>本地统计</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <strong>{{ analytics.sessions }}</strong>
          <small>开局次数</small>
        </div>
        <div class="stat-card">
          <strong>{{ analytics.finishes }}</strong>
          <small>结束次数</small>
        </div>
        <div class="stat-card">
          <strong>{{ analytics.completions }}</strong>
          <small>通关次数</small>
        </div>
        <div class="stat-card">
          <strong>{{ analytics.finishes ? formatDuration(Math.floor(analytics.totalDurationMs / analytics.finishes)) : '0:00' }}</strong>
          <small>平均时长</small>
        </div>
      </div>
      <h4>模式分布</h4>
      <div class="mode-stats">
        <div v-for="mode in GAME_MODES" :key="mode" class="mode-stat">
          <span>{{ MODE_LABEL[mode] }}</span>
          <div class="stat-bar">
            <div
              class="stat-bar-fill"
              :style="{
                width: `${
                  analytics.sessions
                    ? Math.min(100, (analytics.modeStarts[mode] / analytics.sessions) * 100)
                    : 0
                }%`
              }"
            />
          </div>
          <small>{{ analytics.modeStarts[mode] }}</small>
        </div>
      </div>
    </section>

    <div v-if="showTouchControls" class="touch-controls" aria-label="touch controls">
      <button type="button" @click="onTouchDirection('up')">↑</button>
      <div class="touch-row">
        <button type="button" @click="onTouchDirection('left')">←</button>
        <button type="button" @click="onTouchDirection('down')">↓</button>
        <button type="button" @click="onTouchDirection('right')">→</button>
      </div>
    </div>

    <div v-if="isSettled" class="modal-mask" @click.self="startGame(selectedMode)">
      <section class="modal-card">
        <h3>{{ state.isCompleted ? '通关成功' : '本局结束' }}</h3>
        <div class="result-stats">
          <div class="result-item">
            <small>总分</small>
            <strong>{{ state.totalScore }}</strong>
          </div>
          <div class="result-item">
            <small>关卡</small>
            <strong>{{ state.level }}</strong>
          </div>
          <div class="result-item">
            <small>连击</small>
            <strong>x{{ state.multiplier }}</strong>
          </div>
          <div class="result-item">
            <small>用时</small>
            <strong>{{ formatDuration(runDurationMs) }}</strong>
          </div>
        </div>
        <p class="settled-tip">{{ suggestedNextAction }}</p>
        <div class="modal-actions">
          <button type="button" class="btn-primary" @click="startGame(selectedMode)">再来一局</button>
          <button type="button" @click="restartLevel">重开本关</button>
        </div>
      </section>
    </div>

    <div v-if="showSettingsModal" class="modal-mask" @click.self="showSettingsModal = false">
      <section class="modal-card settings-modal">
        <h3>设置</h3>
        <div class="settings-form">
          <label class="setting-item">
            <span>网格大小</span>
            <div class="range-wrap">
              <input
                type="range"
                min="12"
                max="36"
                :value="settings.gridSize"
                @input="updateSettings({ gridSize: Number(($event.target as HTMLInputElement).value) })"
              />
              <span class="range-value">{{ settings.gridSize }}</span>
            </div>
          </label>
          <label class="setting-item">
            <span>速度倍率</span>
            <div class="range-wrap">
              <input
                type="range"
                min="0.7"
                max="1.4"
                step="0.05"
                :value="settings.speedScale"
                @input="updateSettings({ speedScale: Number(($event.target as HTMLInputElement).value) })"
              />
              <span class="range-value">{{ settings.speedScale.toFixed(2) }}</span>
            </div>
          </label>
          <label class="setting-item">
            <span>键位方案</span>
            <select
              :value="settings.keymap"
              @change="updateSettings({ keymap: ($event.target as HTMLSelectElement).value as GameSettings['keymap'] })"
            >
              <option value="both">方向键 + WASD</option>
              <option value="arrows">仅方向键</option>
              <option value="wasd">仅 WASD</option>
            </select>
          </label>
          <label class="setting-item">
            <span>音效</span>
            <input
              type="checkbox"
              :checked="settings.audioEnabled"
              @change="updateSettings({ audioEnabled: ($event.target as HTMLInputElement).checked })"
            />
          </label>
          <label class="setting-item">
            <span>蛇身皮肤</span>
            <select
              :value="settings.snakeSkin"
              @change="updateSettings({ snakeSkin: ($event.target as HTMLSelectElement).value as SnakeSkinId })"
            >
              <option v-for="skin in skinOptions" :key="skin.id" :value="skin.id">
                {{ skin.label }}
                <span v-if="skin.hasAnimation"> ✨</span>
              </option>
            </select>
          </label>
          <label class="setting-item">
            <span>主题</span>
            <select
              :value="settings.theme"
              @change="updateSettings({ theme: ($event.target as HTMLSelectElement).value as GameSettings['theme'] })"
            >
              <option v-for="theme in themeOptions" :key="theme.id" :value="theme.id">
                {{ theme.label }}
              </option>
            </select>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-primary" @click="applySettingsAndRestart">应用并新开</button>
          <button type="button" @click="showSettingsModal = false">关闭</button>
        </div>
      </section>
    </div>

    <div v-if="achievementToast" class="achievement-toast">
      <strong>🏆 成就解锁</strong>
      <span>{{ achievementToast.title }}</span>
    </div>
  </main>
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--theme-font, system-ui, sans-serif);
  background: var(--shell-bg);
  color: var(--text-color);
  min-height: 100vh;
  transition: background 0.3s, color 0.3s;
}

.game-shell {
  max-width: 680px;
  margin: 0 auto;
  padding: 12px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--shell-bg);
  border: 1px solid var(--shell-border);
  border-radius: 12px;
  box-shadow: var(--shell-shadow);
  margin-bottom: 12px;
}

.top-bar-left,
.top-bar-center,
.top-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.game-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-color);
  letter-spacing: -0.02em;
}

.hud-mini {
  display: flex;
  gap: 16px;
}

.hud-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
}

.hud-item small {
  font-size: 0.65rem;
  color: var(--muted-text);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.hud-item strong {
  font-size: 0.95rem;
  color: var(--text-color);
}

.hud-item.timed strong {
  color: #e58f7f;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--button-active-bg);
  border-color: var(--button-active-border);
}

.more-menu-dropdown {
  background: var(--shell-bg);
  border: 1px solid var(--shell-border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shell-shadow);
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.more-menu-dropdown h4 {
  font-size: 0.8rem;
  color: var(--muted-text);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.mode-btn-compact {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-btn-compact:hover {
  background: var(--button-active-bg);
}

.mode-btn-compact.active {
  background: var(--button-active-bg);
  border-color: var(--button-active-border);
  color: var(--button-active-border);
}

.mode-guide-text {
  font-size: 0.8rem;
  color: var(--muted-text);
  font-style: italic;
}

.theme-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.theme-chip {
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-chip:hover {
  background: var(--button-active-bg);
}

.theme-chip.active {
  background: var(--button-active-bg);
  border-color: var(--button-active-border);
}

.tab-nav {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--shell-bg);
  border: 1px solid var(--shell-border);
  border-radius: 10px;
  margin-bottom: 12px;
}

.tab-btn {
  flex: 1;
  padding: 10px 8px;
  border: none;
  background: transparent;
  color: var(--muted-text);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.tab-btn:hover {
  color: var(--text-color);
  background: var(--button-active-bg);
}

.tab-btn.active {
  background: var(--button-active-bg);
  color: var(--button-active-border);
}

.badge {
  background: #e58f7f;
  color: white;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.game-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.board-container {
  background: var(--shell-bg);
  border: 1px solid var(--board-border);
  border-radius: 12px;
  padding: 12px;
  box-shadow: var(--shell-shadow);
}

.game-canvas {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  display: block;
}

.legend-mini {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 0.7rem;
  color: var(--muted-text);
}

.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 3px;
}

.legend-dot.food-normal { background: var(--food-normal); }
.legend-dot.food-speed { background: var(--food-speed); }
.legend-dot.food-slow { background: var(--food-slow); }
.legend-dot.food-double { background: var(--food-double); }
.legend-dot.obstacle { background: var(--obstacle-color); }

.game-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.start-btn-large {
  width: 100%;
  padding: 14px 24px;
  font-size: 1.1rem;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #6b8f71, #5f7f64);
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(95, 127, 100, 0.3);
}

.start-btn-large:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(95, 127, 100, 0.4);
}

.action-btn {
  flex: 1;
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: var(--button-active-bg);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--button-active-bg);
  border-color: var(--button-active-border);
  color: var(--button-active-border);
}

.status-bar {
  text-align: center;
  font-size: 0.8rem;
  color: var(--muted-text);
  padding: 8px;
  background: var(--shell-bg);
  border: 1px solid var(--shell-border);
  border-radius: 8px;
}

.progress-mini {
  height: 4px;
  background: var(--panel-border);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--button-active-border), #8da98d);
  transition: width 0.3s;
}

.content-panel {
  background: var(--shell-bg);
  border: 1px solid var(--shell-border);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shell-shadow);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-header h3 {
  font-size: 1rem;
}

.panel-controls {
  display: flex;
  gap: 8px;
}

.panel-controls select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 0.8rem;
}

.stats-summary {
  font-size: 0.85rem;
  color: var(--muted-text);
  margin-bottom: 12px;
}

.stats-summary p {
  margin-bottom: 4px;
}

.achievement-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
}

.achievement-card {
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--button-bg);
  transition: all 0.15s;
}

.achievement-card.unlocked {
  border-color: var(--button-active-border);
  background: var(--button-active-bg);
}

.achievement-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.achievement-status {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--panel-border);
}

.achievement-card.unlocked .achievement-status {
  background: var(--button-active-border);
  color: white;
}

.achievement-desc {
  font-size: 0.8rem;
  color: var(--muted-text);
  margin-bottom: 8px;
}

.achievement-progress {
  height: 6px;
  background: var(--panel-border);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--button-active-border), #8da98d);
  transition: width 0.3s;
}

.achievement-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--muted-text);
}

.btn-link {
  background: none;
  border: none;
  color: var(--button-active-border);
  cursor: pointer;
  font-size: 0.75rem;
}

.achievement-detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--panel-border);
  font-size: 0.75rem;
  color: var(--muted-text);
}

.best-by-mode {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.best-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px;
  background: var(--button-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
}

.best-item span {
  font-size: 0.7rem;
  color: var(--muted-text);
}

.best-item strong {
  font-size: 1.1rem;
  color: var(--text-color);
}

.record-list {
  list-style: none;
  margin-bottom: 12px;
}

.record-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--panel-border);
  font-size: 0.8rem;
}

.record-mode {
  font-weight: 500;
  min-width: 50px;
}

.record-score {
  color: var(--button-active-border);
}

.record-level,
.record-time {
  color: var(--muted-text);
}

.record-completed {
  color: #6b8f71;
  margin-left: auto;
}

.empty-state {
  text-align: center;
  color: var(--muted-text);
  padding: 20px;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  cursor: pointer;
}

.btn-danger {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: none;
  background: #fee2e2;
  color: #dc2626;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-danger:hover {
  background: #fecaca;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px;
  background: var(--button-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
}

.stat-card strong {
  font-size: 1.4rem;
  color: var(--button-active-border);
}

.stat-card small {
  font-size: 0.7rem;
  color: var(--muted-text);
  margin-top: 4px;
}

.mode-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
}

.mode-stat span {
  min-width: 50px;
}

.stat-bar {
  flex: 1;
  height: 8px;
  background: var(--panel-border);
  border-radius: 4px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--button-active-border), #8da98d);
  transition: width 0.3s;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: var(--modal-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-card {
  background: var(--modal-bg);
  border-radius: 16px;
  padding: 24px;
  max-width: 90%;
  width: 360px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  animation: scaleIn 0.2s;
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-card h3 {
  text-align: center;
  margin-bottom: 16px;
  font-size: 1.2rem;
}

.result-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.result-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  background: var(--button-bg);
  border-radius: 8px;
}

.result-item small {
  font-size: 0.7rem;
  color: var(--muted-text);
}

.result-item strong {
  font-size: 1.2rem;
  color: var(--button-active-border);
}

.settled-tip {
  text-align: center;
  font-size: 0.85rem;
  color: var(--muted-text);
  margin-bottom: 16px;
  font-style: italic;
}

.modal-actions {
  display: flex;
  gap: 8px;
}

.modal-actions button {
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s;
}

.modal-actions .btn-primary {
  background: var(--button-active-bg);
  border-color: var(--button-active-border);
  color: var(--button-active-border);
}

.settings-modal {
  width: 400px;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-item > span {
  font-size: 0.85rem;
  font-weight: 500;
}

.setting-item select,
.setting-item input[type="range"] {
  width: 100%;
}

.setting-item select {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 0.9rem;
}

.setting-item input[type="checkbox"] {
  width: 20px;
  height: 20px;
}

.range-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-wrap input[type="range"] {
  flex: 1;
}

.range-value {
  min-width: 40px;
  text-align: right;
  font-size: 0.85rem;
  color: var(--button-active-border);
}

.achievement-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--modal-bg);
  border: 1px solid var(--button-active-border);
  border-radius: 12px;
  padding: 12px 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: slideUp 0.3s ease;
  z-index: 200;
}

@keyframes slideUp {
  from {
    transform: translateX(-50%) translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

.achievement-toast strong {
  font-size: 0.9rem;
  color: var(--button-active-border);
}

.achievement-toast span {
  font-size: 0.85rem;
}

.touch-controls {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 50;
}

.touch-controls button {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  border: none;
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 1.4rem;
  box-shadow: var(--shell-shadow);
  cursor: pointer;
}

.touch-row {
  display: flex;
  gap: 8px;
}
</style>
