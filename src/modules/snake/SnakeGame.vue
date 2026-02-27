<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  addLeaderboardEntry,
  advanceState,
  clearLeaderboard,
  createInitialState,
  GAME_MODES,
  getFastestCompletion,
  getTickMs,
  getTopScore,
  getTopScoreByMode,
  LEVEL_TARGET_SCORE,
  loadAnalytics,
  loadLeaderboard,
  loadSettings,
  MAX_LEVEL,
  MODE_LABEL,
  patchSettings,
  renderGameToCanvas,
  resetGame,
  restartCurrentLevel,
  saveAnalytics,
  saveLeaderboard,
  saveSettings,
  setDirection,
  togglePause,
  trackFinish,
  trackStart,
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
const timeoutId = ref<number | null>(null);
const showTouchControls = ref(false);
const startedAt = ref<number | null>(null);
const leaderboard = ref<LeaderboardData>({ recent: [] });
const analytics = ref<AnalyticsData>(loadAnalytics());
const boardRef = ref<HTMLCanvasElement | null>(null);
const showSettings = ref(false);

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

const topScore = computed(() => getTopScore(leaderboard.value));
const fastestCompletion = computed(() => getFastestCompletion(leaderboard.value));
const topByMode = computed(() =>
  GAME_MODES.map((mode) => ({
    mode,
    entry: getTopScoreByMode(leaderboard.value, mode),
  })),
);

onMounted(() => {
  leaderboard.value = loadLeaderboard();
  analytics.value = loadAnalytics();
  showTouchControls.value = window.matchMedia('(pointer: coarse)').matches;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', drawBoard);
  drawBoard();
  scheduleTick();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', drawBoard);
  if (timeoutId.value !== null) clearTimeout(timeoutId.value);
});

watch(
  () => state.value,
  () => drawBoard(),
  { deep: true },
);

/** 主循环：每帧推进状态，必要时记录结果和播放提示音。 */
function scheduleTick(): void {
  if (timeoutId.value !== null) clearTimeout(timeoutId.value);

  const delay = hasStarted.value ? getTickMs(state.value, settings.value.speedScale) : 220;
  timeoutId.value = window.setTimeout(() => {
    if (hasStarted.value) {
      const prev = state.value;
      state.value = advanceState(state.value);

      if (state.value.totalScore > prev.totalScore) {
        playEffectTone(660, 0.03);
      }

      if ((!prev.isGameOver && state.value.isGameOver) || (!prev.isCompleted && state.value.isCompleted)) {
        persistResult();
        playEffectTone(state.value.isCompleted ? 840 : 220, 0.12);
      }
    }

    scheduleTick();
  }, delay);
}

/** canvas 绘制入口。 */
function drawBoard(): void {
  if (!boardRef.value) return;
  renderGameToCanvas(boardRef.value, state.value);
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

/** 简单提示音；默认关闭，可在设置里开启。 */
function playEffectTone(freq: number, durationSec: number): void {
  if (!settings.value.audioEnabled || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  gain.gain.value = 0.03;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + durationSec);
}
</script>

<template>
  <main class="game-shell">
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

    <div v-if="state.isPaused && !isSettled" class="modal-mask" @click.self="togglePauseAction">
      <section class="modal-card">
        <h3>游戏已暂停</h3>
        <p>当前分数 {{ state.totalScore }}，关卡 {{ state.level }}</p>
        <div class="modal-actions">
          <button type="button" @click="togglePauseAction">继续</button>
          <button type="button" @click="restartLevel">重开本关</button>
        </div>
      </section>
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
  </main>
</template>
