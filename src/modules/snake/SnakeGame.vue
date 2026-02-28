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
} from './index';

/**
 * SnakeGame.vue 负责：
 * 1) 读取设置/排行榜/统计
 * 2) 驱动游戏主循环
 * 3) 管理输入与菜单
 * 4) 渲染 canvas
 */

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
const showSettings = ref(false);
const achievements = ref<AchievementStore>(loadAchievements());
const achievementFilter = ref<'all' | 'unlocked' | 'locked' | 'hidden'>('all');
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
const themeOptions = THEME_OPTIONS;
const currentTheme = computed(() => THEME_PRESETS[settings.value.theme]);
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
      description: hiddenLocked ? item.hint ?? 'Unlock to reveal details.' : item.description,
      hidden: Boolean(item.hidden),
      unlocked: entry.unlocked,
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
const topByMode = computed(() =>
  GAME_MODES.map((mode) => ({
    mode,
    entry: getTopScoreByMode(leaderboard.value, mode),
  })),
);

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

/** 主循环：使用 rAF + accumulator 提升时间精度与动画平滑性。 */
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

/** canvas 绘制入口。 */
function drawBoard(): void {
  if (!boardRef.value) return;
  renderGameToCanvas(boardRef.value, state.value, currentTheme.value.canvas);
}

function applyPageTheme(): void {
  if (typeof window === 'undefined') return;
  document.body.style.background = currentTheme.value.pageBackground;
  document.body.style.color = currentTheme.value.text;
}

/** 键盘输入处理，支持按设置切换的键位方案。 */
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

/** 开始新局，并记录 analytics 开局事件。 */
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

/** 结束时写入战绩和统计。 */
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

function resetAchievementProgress(): void {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm('确认重置所有成就进度吗？此操作不可撤销。');
    if (!confirmed) return;
  }
  achievements.value = resetAchievements();
  achievementFilter.value = 'all';
}

/** 局部更新设置并立即持久化。 */
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

/** 简单提示音；默认关闭，可在设置里开启。 */
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
    <header class="hud">
      <div>模式：<strong>{{ modeLabel }}</strong></div>
      <div>关卡：<strong>{{ state.level }}/{{ state.mode === 'endless' ? '∞' : MAX_LEVEL }}</strong></div>
      <div v-if="state.mode !== 'endless'">本关：<strong>{{ state.levelScore }}/{{ LEVEL_TARGET_SCORE }}</strong></div>
      <div>总分：<strong>{{ state.totalScore }}</strong></div>
      <div>连击：<strong>x{{ state.multiplier }}</strong></div>
      <div>{{ statusText }}</div>
    </header>

    <section class="mode-panel">
      <button
        v-for="mode in GAME_MODES"
        :key="mode"
        type="button"
        :class="['mode-btn', { active: selectedMode === mode }]"
        @click="chooseMode(mode)"
      >
        {{ MODE_LABEL[mode] }}
      </button>
      <button type="button" class="start-btn" @click="startGame(selectedMode)">
        {{ hasStarted ? '新游戏 (N)' : '开始游戏' }}
      </button>
      <button type="button" @click="showSettings = !showSettings">{{ showSettings ? '收起设置' : '展开设置' }}</button>
    </section>
    <section class="theme-strip">
      <button
        v-for="theme in themeOptions"
        :key="theme.id"
        type="button"
        :class="['theme-chip', { active: settings.theme === theme.id }]"
        @click="updateSettings({ theme: theme.id })"
      >
        {{ theme.label }}
      </button>
    </section>

    <section v-if="showSettings" class="settings-panel">
      <label>
        网格大小
        <input type="range" min="12" max="36" :value="settings.gridSize" @input="updateSettings({ gridSize: Number(($event.target as HTMLInputElement).value) })" />
        <span>{{ settings.gridSize }}</span>
      </label>
      <label>
        速度倍率
        <input type="range" min="0.7" max="1.4" step="0.05" :value="settings.speedScale" @input="updateSettings({ speedScale: Number(($event.target as HTMLInputElement).value) })" />
        <span>{{ settings.speedScale.toFixed(2) }}</span>
      </label>
      <label>
        键位
        <select :value="settings.keymap" @change="updateSettings({ keymap: ($event.target as HTMLSelectElement).value as GameSettings['keymap'] })">
          <option value="both">方向键+WASD</option>
          <option value="arrows">仅方向键</option>
          <option value="wasd">仅 WASD</option>
        </select>
      </label>
      <label>
        音效
        <input type="checkbox" :checked="settings.audioEnabled" @change="updateSettings({ audioEnabled: ($event.target as HTMLInputElement).checked })" />
      </label>
      <label>
        主题
        <select :value="settings.theme" @change="updateSettings({ theme: ($event.target as HTMLSelectElement).value as GameSettings['theme'] })">
          <option v-for="theme in themeOptions" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
        </select>
      </label>
      <button type="button" @click="applySettingsAndRestart">应用并新开</button>
    </section>

    <section class="board">
      <canvas ref="boardRef" class="game-canvas" aria-label="snake game board" />
    </section>

    <div class="legend">
      <span><i class="legend-dot food-normal" /> 普通</span>
      <span><i class="legend-dot food-speed" /> 加速果</span>
      <span><i class="legend-dot food-slow" /> 减速果</span>
      <span><i class="legend-dot food-double" /> 双倍果</span>
      <span><i class="legend-dot obstacle" /> 障碍</span>
    </div>

    <div class="actions">
      <button type="button" :disabled="pauseDisabled" @click="togglePauseAction">{{ pauseButtonText }}</button>
      <button type="button" :disabled="!hasStarted" @click="restartLevel">重开本关 (R)</button>
      <button type="button" @click="startGame(selectedMode)">新游戏 (N)</button>
    </div>

    <section class="achievements-panel">
      <div class="achievements-head">
        <h3>Achievements</h3>
        <div class="achievements-controls">
          <select v-model="achievementFilter">
            <option value="all">全部</option>
            <option value="locked">未解锁</option>
            <option value="unlocked">已解锁</option>
            <option value="hidden">隐藏</option>
          </select>
          <button v-if="pendingAchievementCount > 0" type="button" @click="markUnlockNotificationsRead">
            查看新解锁 ({{ pendingAchievementCount }})
          </button>
          <button type="button" @click="resetAchievementProgress">重置成就</button>
        </div>
      </div>
      <p>已解锁 {{ unlockedAchievements }}/{{ ACHIEVEMENTS.length }}</p>
      <ul class="achievement-list">
        <li v-for="item in filteredAchievements" :key="item.id" :class="{ unlocked: item.unlocked }">
          <div class="achievement-row">
            <strong>{{ item.title }}</strong>
            <span>{{ item.unlocked ? 'Unlocked' : 'Locked' }}</span>
          </div>
          <p>{{ item.description }}</p>
          <div class="achievement-progress">
            <div class="achievement-progress-bar" :style="{ width: `${item.progressPct}%` }" />
          </div>
          <small>{{ item.progress }} / {{ item.target }}</small>
        </li>
      </ul>
    </section>

    <section class="leaderboard">
      <div class="leaderboard-head">
        <h3>排行榜</h3>
        <button type="button" @click="clearRecords">清空记录</button>
      </div>
      <p v-if="topScore">总榜最高分：{{ MODE_LABEL[topScore.mode] }} {{ topScore.totalScore }}</p>
      <p v-if="fastestCompletion">最快通关：{{ MODE_LABEL[fastestCompletion.mode] }} {{ formatDuration(fastestCompletion.durationMs) }}</p>
      <ul>
        <li v-for="item in topByMode" :key="item.mode">
          {{ MODE_LABEL[item.mode] }} 最佳：{{ item.entry ? item.entry.totalScore : '-' }}
        </li>
      </ul>
      <h4>最近战绩</h4>
      <ul>
        <li v-for="(item, index) in leaderboard.recent" :key="`${item.playedAt}-${index}`">
          {{ MODE_LABEL[item.mode] }} | 分数 {{ item.totalScore }} | 关卡 {{ item.level }} | 时长 {{ formatDuration(item.durationMs) }}
          <strong v-if="item.completed"> 通关</strong>
        </li>
        <li v-if="leaderboard.recent.length === 0">暂无记录</li>
      </ul>
    </section>

    <section class="analytics-panel">
      <h3>本地统计</h3>
      <p>开局 {{ analytics.sessions }} 次，结束 {{ analytics.finishes }} 次，通关 {{ analytics.completions }} 次</p>
      <p>平均时长：{{ analytics.finishes ? formatDuration(Math.floor(analytics.totalDurationMs / analytics.finishes)) : '0:00' }}</p>
      <p>
        模式占比：
        经典 {{ analytics.modeStarts.classic }} /
        无尽 {{ analytics.modeStarts.endless }} /
        障碍 {{ analytics.modeStarts.obstacle }} /
        挑战 {{ analytics.modeStarts.challenge }}
      </p>
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
        <p>总分：{{ state.totalScore }}</p>
        <p>关卡：{{ state.level }}</p>
        <p>连击倍率：x{{ state.multiplier }}</p>
        <p>用时：{{ formatDuration(runDurationMs) }}</p>
        <div class="modal-actions">
          <button type="button" @click="startGame(selectedMode)">再来一局</button>
          <button type="button" @click="restartLevel">重开本关</button>
        </div>
      </section>
    </div>

    <div v-if="achievementToast" class="achievement-toast">
      <strong>Achievement Unlocked</strong>
      <span>{{ achievementToast.title }}</span>
    </div>
  </main>
</template>
