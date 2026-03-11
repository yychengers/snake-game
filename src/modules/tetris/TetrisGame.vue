<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  TETRIS_ACHIEVEMENTS,
  addTetrisLeaderboardEntry,
  checkCollision,
  checkTetrisAchievements,
  clearTetrisLeaderboard,
  createTetrisGameState,
  getTetrisTopScores,
  hardDrop,
  loadTetrisAchievements,
  loadTetrisAnalytics,
  loadTetrisLeaderboard,
  loadTetrisSettings,
  movePiece,
  patchTetrisSettings,
  renderTetrisBoard,
  renderTetrisPreview,
  rotateCurrentPiece,
  saveTetrisAchievements,
  saveTetrisAnalytics,
  saveTetrisLeaderboard,
  saveTetrisSettings,
  spawnNewPiece,
  trackTetrisFinish,
  trackTetrisStart,
  updateTetrisGame,
} from './index';
import type {
  TetrisGameMode,
  TetrisGameState,
  TetrisLeaderboardEntry,
  TetrisSettings,
  TetrisAchievement,
} from './types';

const GAME_MODES: TetrisGameMode[] = ['classic', 'zen'];
const MODE_LABEL: Record<TetrisGameMode, string> = {
  classic: '经典模式',
  zen: '禅模式',
};

const selectedMode = ref<TetrisGameMode>('classic');
const settings = ref<TetrisSettings>(loadTetrisSettings());
const hasStarted = ref(false);
const state = ref<TetrisGameState>(createTetrisGameState({ mode: selectedMode.value }));
const rafId = ref<number | null>(null);
const lastFrameTime = ref<number | null>(null);
const startedAt = ref<number | null>(null);
const leaderboard = ref<TetrisLeaderboardEntry[]>([]);
const analytics = ref(loadTetrisAnalytics());
const boardRef = ref<HTMLCanvasElement | null>(null);
const previewRef = ref<HTMLCanvasElement | null>(null);
const achievements = ref<Map<string, string>>(loadTetrisAchievements());
const activeTab = ref<'game' | 'achievements' | 'leaderboard' | 'stats'>('game');
const showSettingsModal = ref(false);
const showMoreMenu = ref(false);
const cellSize = ref(25);
const previewCellSize = ref(20);

const statusText = computed(() => {
  if (!hasStarted.value) return '选择模式后开始游戏';
  if (state.value.isGameOver) return '游戏结束，按 R 重新开始';
  if (state.value.isPaused) return '已暂停，按空格/P继续';
  return '←→↓ 控制移动，↑ 旋转，空格 硬下落';
});

const modeLabel = computed(() => MODE_LABEL[state.value.mode]);
const isSettled = computed(() => hasStarted.value && state.value.isGameOver);
const runDurationMs = computed(() => (startedAt.value ? Date.now() - startedAt.value : 0));

const topScore = computed(() => {
  const scores = getTetrisTopScores(selectedMode.value);
  return scores.length > 0 ? scores[0].score : 0;
});

const modeGuide = computed(() => {
  if (selectedMode.value === 'classic') return '经典模式：逐级递进，挑战最高分。';
  if (selectedMode.value === 'zen') return '禅模式：无等级压力，自由放松游玩。';
  return '';
});

const unlockedAchievements = computed(() => {
  return TETRIS_ACHIEVEMENTS.filter((a) => achievements.value.has(a.id)).length;
});

const sortedLeaderboard = computed(() => {
  return [...leaderboard.value].sort((a, b) => b.score - a.score).slice(0, 20);
});

const filteredLeaderboardByMode = computed(() => {
  return sortedLeaderboard.value.filter((e) => e.mode === selectedMode.value).slice(0, 10);
});

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function initGame(): void {
  if (typeof window === 'undefined') return;

  const container = boardRef.value?.parentElement;
  if (!container) return;

  const containerWidth = Math.min(container.clientWidth - 20, 320);
  cellSize.value = Math.floor(containerWidth / 10);
  if (cellSize.value > 30) cellSize.value = 30;
  if (cellSize.value < 15) cellSize.value = 15;

  previewCellSize.value = Math.min(20, Math.floor(containerWidth / 5));

  if (boardRef.value && previewRef.value) {
    const board = boardRef.value;
    const preview = previewRef.value;
    board.width = cellSize.value * 10;
    board.height = cellSize.value * 20;
    preview.width = previewCellSize.value * 4;
    preview.height = previewCellSize.value * 4;
  }

  drawBoard();
}

function drawBoard(): void {
  if (!boardRef.value || !previewRef.value) return;

  const boardCtx = boardRef.value.getContext('2d');
  const previewCtx = previewRef.value.getContext('2d');

  if (boardCtx) {
    renderTetrisBoard(boardCtx, state.value, cellSize.value);
  }
  if (previewCtx) {
    renderTetrisPreview(previewCtx, state.value.nextPiece, previewCellSize.value);
  }
}

function gameLoop(timestamp: number): void {
  if (lastFrameTime.value === null) {
    lastFrameTime.value = timestamp;
  }

  const deltaTime = timestamp - lastFrameTime.value;
  lastFrameTime.value = timestamp;

  if (state.value.isPlaying && !state.value.isPaused && !state.value.isGameOver) {
    state.value = updateTetrisGame(state.value, deltaTime, Math.random);
    drawBoard();

    if (state.value.isGameOver) {
      persistResult();
    }
  }

  rafId.value = requestAnimationFrame(gameLoop);
}

function startGame(): void {
  selectedMode.value = selectedMode.value;
  hasStarted.value = true;
  startedAt.value = Date.now();
  
  let newState = createTetrisGameState({ mode: selectedMode.value });
  newState = { ...newState, isPlaying: true };
  newState = spawnNewPiece(newState, Math.random);
  state.value = newState;

  analytics.value = trackTetrisStart(analytics.value, selectedMode.value);
  saveTetrisAnalytics(analytics.value);

  if (rafId.value === null) {
    lastFrameTime.value = null;
    rafId.value = requestAnimationFrame(gameLoop);
  }
  
  drawBoard();
}

function restartGame(): void {
  if (!hasStarted.value) return;
  state.value = createTetrisGameState({ mode: selectedMode.value });
  startedAt.value = Date.now();
  analytics.value = trackTetrisStart(analytics.value, selectedMode.value);
  saveTetrisAnalytics(analytics.value);
  drawBoard();
}

function togglePauseAction(): void {
  if (!hasStarted.value || state.value.isGameOver) return;
  state.value = { ...state.value, isPaused: !state.value.isPaused };
}

function persistResult(): void {
  if (startedAt.value === null || !state.value.isGameOver) return;

  const durationMs = Date.now() - startedAt.value;

  const entry = addTetrisLeaderboardEntry(
    state.value.mode,
    state.value.score,
    state.value.level,
    state.value.lines,
    durationMs,
  );

  leaderboard.value = loadTetrisLeaderboard();

  analytics.value = trackTetrisFinish(
    analytics.value,
    state.value.mode,
    state.value.score,
    state.value.level,
    state.value.lines,
    durationMs,
  );
  saveTetrisAnalytics(analytics.value);

  const stats = {
    totalGames: analytics.value.totalGames,
    totalScore: analytics.value.totalScore,
    totalLines: analytics.value.totalLines,
    bestScore: analytics.value.bestScore,
    bestLevel: analytics.value.bestLevel,
    maxLinesCleared: state.value.lines,
    maxLevel: state.value.level,
  };

  const newlyUnlocked = checkTetrisAchievements(achievements.value, stats);
  achievements.value = loadTetrisAchievements();
  saveTetrisAchievements(achievements.value);

  if (newlyUnlocked.length > 0) {
    setTimeout(() => {
      alert(`🏆 成就解锁: ${newlyUnlocked[0].title}\n${newlyUnlocked[0].description}`);
    }, 500);
  }

  startedAt.value = null;
}

function onKeyDown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  const controlKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'p', 'r', 'enter'];
  if (controlKeys.includes(key)) event.preventDefault();

  if (!hasStarted.value) {
    if (key === 'enter' || key === ' ') startGame();
    return;
  }

  if (state.value.isPaused || state.value.isGameOver) {
    if (key === 'r') restartGame();
    if (key === 'enter' || key === ' ') startGame();
    return;
  }

  if (key === 'arrowleft') {
    const newPiece = { ...state.value.currentPiece!, x: state.value.currentPiece!.x - 1 };
    if (!checkCollision(state.value.board, newPiece)) {
      state.value = { ...state.value, currentPiece: newPiece };
      drawBoard();
    }
  } else if (key === 'arrowright') {
    const newPiece = { ...state.value.currentPiece!, x: state.value.currentPiece!.x + 1 };
    if (!checkCollision(state.value.board, newPiece)) {
      state.value = { ...state.value, currentPiece: newPiece };
      drawBoard();
    }
  } else if (key === 'arrowdown') {
    const newPiece = { ...state.value.currentPiece!, y: state.value.currentPiece!.y + 1 };
    if (!checkCollision(state.value.board, newPiece)) {
      state.value = { ...state.value, currentPiece: newPiece, score: state.value.score + 1 };
      drawBoard();
    }
  } else if (key === 'arrowup') {
    state.value = rotateCurrentPiece(state.value);
    drawBoard();
  } else if (key === ' ') {
    state.value = hardDrop(state.value);
    drawBoard();
  } else if (key === 'p') {
    togglePauseAction();
  } else if (key === 'r') {
    restartGame();
  }
}

function updateSettings(patch: Partial<TetrisSettings>): void {
  settings.value = patchTetrisSettings(settings.value, patch);
  saveTetrisSettings(settings.value);
}

function chooseMode(mode: TetrisGameMode): void {
  selectedMode.value = mode;
}

function clearRecords(): void {
  if (typeof window !== 'undefined' && !window.confirm('确认清空排行榜吗？')) return;
  leaderboard.value = [];
  clearTetrisLeaderboard();
}

onMounted(() => {
  if (typeof window === 'undefined') return;

  leaderboard.value = loadTetrisLeaderboard();
  analytics.value = loadTetrisAnalytics();
  achievements.value = loadTetrisAchievements();

  setTimeout(() => {
    initGame();
  }, 100);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', initGame);
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;

  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', initGame);

  if (rafId.value !== null) {
    cancelAnimationFrame(rafId.value);
  }
});

watch(
  () => state.value.isPlaying,
  (playing) => {
    if (playing && rafId.value === null) {
      rafId.value = requestAnimationFrame(gameLoop);
    }
  },
);
</script>

<template>
  <div class="tetris-shell">
    <header class="top-bar">
      <div class="top-bar-left">
        <h1 class="game-title">俄罗斯方块</h1>
      </div>
      <div class="top-bar-center">
        <div class="hud-mini">
          <span class="hud-item">得分: {{ state.score }}</span>
          <span class="hud-item">等级: {{ state.level }}</span>
          <span class="hud-item">行数: {{ state.lines }}</span>
        </div>
      </div>
      <div class="top-bar-right">
        <button class="icon-btn" @click="showSettingsModal = true" title="设置">
          <span>⚙️</span>
        </button>
        <button class="icon-btn" @click="showMoreMenu = !showMoreMenu" title="更多">
          <span>☰</span>
        </button>
      </div>
    </header>

    <div v-if="showMoreMenu" class="more-menu-dropdown" @click.stop>
      <div class="mode-select-section">
        <label class="section-label">游戏模式</label>
        <div class="mode-buttons">
          <button
            v-for="mode in GAME_MODES"
            :key="mode"
            :class="['mode-btn', { active: selectedMode === mode }]"
            @click="chooseMode(mode)"
          >
            {{ MODE_LABEL[mode] }}
          </button>
        </div>
      </div>
    </div>

    <nav class="tab-nav">
      <button
        v-for="tab in (['game', 'achievements', 'leaderboard', 'stats'] as const)"
        :key="tab"
        :class="['tab-btn', { active: activeTab === tab }]"
        @click="activeTab = tab"
      >
        {{ { game: '游戏', achievements: '成就', leaderboard: '排行榜', stats: '统计' }[tab] }}
      </button>
    </nav>

    <main class="main-content">
      <section v-if="activeTab === 'game'" class="game-view">
        <div class="game-layout">
          <div class="game-container">
            <div class="game-board-wrapper">
              <canvas ref="boardRef" class="game-board"></canvas>
            </div>
            <div class="game-info-panel">
              <div class="next-piece-box">
                <h4>下一个</h4>
                <canvas ref="previewRef" class="preview-canvas"></canvas>
              </div>
              <div class="score-box">
                <div class="score-row">
                  <span class="label">得分</span>
                  <span class="value">{{ state.score }}</span>
                </div>
                <div class="score-row">
                  <span class="label">等级</span>
                  <span class="value">{{ state.level }}</span>
                </div>
                <div class="score-row">
                  <span class="label">行数</span>
                  <span class="value">{{ state.lines }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="game-controls">
            <div class="status-bar">
              <span class="status-text">{{ statusText }}</span>
            </div>

            <div class="control-buttons">
              <button v-if="!hasStarted || state.isGameOver" class="primary-btn" @click="startGame">
                {{ hasStarted ? '再来一局' : '开始游戏' }}
              </button>
              <button
                v-else
                :class="['secondary-btn', { active: state.isPaused }]"
                @click="togglePauseAction"
              >
                {{ state.isPaused ? '继续' : '暂停' }}
              </button>
              <button
                v-if="hasStarted && !state.isGameOver"
                class="secondary-btn"
                @click="restartGame"
              >
                重新开始
              </button>
            </div>

            <div class="mode-guide">
              <small>{{ modeGuide }}</small>
            </div>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'achievements'" class="content-panel">
        <div class="panel-header">
          <h3>成就系统</h3>
          <span class="achievement-count">{{ unlockedAchievements }} / {{ TETRIS_ACHIEVEMENTS.length }}</span>
        </div>
        <div class="achievement-list">
          <div
            v-for="achievement in TETRIS_ACHIEVEMENTS"
            :key="achievement.id"
            :class="['achievement-card', { unlocked: achievements.has(achievement.id) }]"
          >
            <span class="achievement-icon">{{ achievement.icon }}</span>
            <div class="achievement-info">
              <h4>{{ achievement.title }}</h4>
              <p>{{ achievement.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'leaderboard'" class="content-panel">
        <div class="panel-header">
          <h3>排行榜</h3>
          <button class="text-btn danger" @click="clearRecords">清空</button>
        </div>
        <div class="leaderboard-tabs">
          <button
            v-for="mode in GAME_MODES"
            :key="mode"
            :class="['tab-btn-small', { active: selectedMode === mode }]"
            @click="selectedMode = mode"
          >
            {{ MODE_LABEL[mode] }}
          </button>
        </div>
        <div class="leaderboard-list">
          <div
            v-for="(entry, index) in filteredLeaderboardByMode"
            :key="index"
            class="leaderboard-row"
          >
            <span class="rank">{{ index + 1 }}</span>
            <span class="score">{{ entry.score }}</span>
            <span class="detail">Lv.{{ entry.level }} · {{ entry.lines }}行</span>
            <span class="date">{{ formatDate(entry.playedAt) }}</span>
          </div>
          <div v-if="filteredLeaderboardByMode.length === 0" class="empty-state">
            暂无记录
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'stats'" class="content-panel">
        <div class="panel-header">
          <h3>游戏统计</h3>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ analytics.totalGames }}</span>
            <span class="stat-label">总局数</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ analytics.bestScore }}</span>
            <span class="stat-label">最高分</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ analytics.bestLevel }}</span>
            <span class="stat-label">最高等级</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ analytics.totalLines }}</span>
            <span class="stat-label">总消行</span>
          </div>
        </div>
      </section>
    </main>

    <div v-if="showSettingsModal" class="modal-mask" @click="showSettingsModal = false">
      <section class="modal-card settings-modal" @click.stop>
        <header class="modal-header">
          <h3>设置</h3>
          <button class="close-btn" @click="showSettingsModal = false">×</button>
        </header>
        <div class="modal-body">
          <label class="setting-item">
            <span>操作方式</span>
            <select
              :value="settings.keymap"
              @change="updateSettings({ keymap: ($event.target as HTMLSelectElement).value as any })"
            >
              <option value="arrows">方向键</option>
              <option value="wasd">WASD</option>
              <option value="both">全部</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tetris-shell {
  --shell-bg: #1a1a2e;
  --shell-border: #16213e;
  --shell-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  --panel-border: #0f3460;
  --board-border: #e94560;
  --button-bg: #0f3460;
  --button-border: #e94560;
  --button-text: #fff;
  --button-active-bg: #e94560;
  --button-active-border: #e94560;
  --text-color: #eaeaea;
  --muted-text: #888;
  --modal-overlay: rgba(0, 0, 0, 0.7);
  --modal-bg: #1a1a2e;

  min-height: 100vh;
  background: var(--shell-bg);
  color: var(--text-color);
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--shell-border);
  border-bottom: 1px solid var(--panel-border);
}

.top-bar-left, .top-bar-center, .top-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-bar-center {
  flex: 1;
  justify-content: center;
}

.game-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--button-active-bg);
}

.hud-mini {
  display: flex;
  gap: 20px;
  font-size: 0.9rem;
  color: var(--text-color);
}

.hud-item {
  padding: 4px 12px;
  background: var(--panel-border);
  border-radius: 4px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--button-bg);
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: var(--button-active-bg);
}

.more-menu-dropdown {
  position: absolute;
  top: 60px;
  right: 20px;
  background: var(--modal-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 16px;
  z-index: 100;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.section-label {
  display: block;
  font-size: 0.85rem;
  color: var(--muted-text);
  margin-bottom: 8px;
}

.mode-buttons {
  display: flex;
  gap: 8px;
}

.mode-btn {
  padding: 8px 16px;
  border: 1px solid var(--button-border);
  background: transparent;
  color: var(--text-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active, .mode-btn:hover {
  background: var(--button-active-bg);
  border-color: var(--button-active-bg);
}

.tab-nav {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  background: var(--shell-border);
  border-bottom: 1px solid var(--panel-border);
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--muted-text);
  font-size: 0.95rem;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--button-active-bg);
  color: #fff;
  font-weight: 500;
}

.main-content {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.game-view {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.game-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.game-container {
  display: flex;
  gap: 20px;
  justify-content: center;
}

.game-board-wrapper {
  background: var(--shell-border);
  border: 2px solid var(--board-border);
  border-radius: 8px;
  padding: 4px;
}

.game-board {
  display: block;
  background: #0a0a15;
}

.game-info-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.next-piece-box {
  background: var(--shell-border);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 12px;
}

.next-piece-box h4 {
  margin: 0 0 8px 0;
  font-size: 0.9rem;
  color: var(--muted-text);
}

.preview-canvas {
  display: block;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.score-box {
  background: var(--shell-border);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 12px;
}

.score-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--panel-border);
}

.score-row:last-child {
  border-bottom: none;
}

.score-row .label {
  color: var(--muted-text);
  font-size: 0.9rem;
}

.score-row .value {
  font-weight: 600;
  color: var(--button-active-bg);
}

.game-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.status-bar {
  padding: 10px 20px;
  background: var(--shell-border);
  border-radius: 8px;
  width: 100%;
  text-align: center;
}

.status-text {
  color: var(--muted-text);
  font-size: 0.9rem;
}

.control-buttons {
  display: flex;
  gap: 12px;
}

.primary-btn {
  padding: 12px 32px;
  border: none;
  background: var(--button-active-bg);
  color: #fff;
  font-size: 1rem;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(233, 69, 96, 0.4);
}

.secondary-btn {
  padding: 12px 24px;
  border: 1px solid var(--button-border);
  background: transparent;
  color: var(--text-color);
  font-size: 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-btn.active, .secondary-btn:hover {
  background: var(--button-active-bg);
  border-color: var(--button-active-bg);
}

.mode-guide {
  color: var(--muted-text);
  font-size: 0.85rem;
}

.content-panel {
  background: var(--shell-border);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 20px;
  animation: fadeIn 0.3s ease;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.achievement-count {
  font-size: 0.9rem;
  color: var(--muted-text);
}

.achievement-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.achievement-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  opacity: 0.5;
}

.achievement-card.unlocked {
  opacity: 1;
  border-color: var(--button-active-bg);
  background: rgba(233, 69, 96, 0.1);
}

.achievement-icon {
  font-size: 1.8rem;
}

.achievement-info h4 {
  margin: 0;
  font-size: 0.95rem;
}

.achievement-info p {
  margin: 4px 0 0;
  font-size: 0.8rem;
  color: var(--muted-text);
}

.leaderboard-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-btn-small {
  padding: 6px 14px;
  border: 1px solid var(--panel-border);
  background: transparent;
  color: var(--muted-text);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}

.tab-btn-small.active {
  background: var(--button-active-bg);
  border-color: var(--button-active-bg);
  color: #fff;
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.leaderboard-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.rank {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--button-active-bg);
  border-radius: 50%;
  font-size: 0.85rem;
  font-weight: 600;
}

.score {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--button-active-bg);
  min-width: 80px;
}

.detail {
  flex: 1;
  color: var(--muted-text);
  font-size: 0.85rem;
}

.date {
  color: var(--muted-text);
  font-size: 0.8rem;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--muted-text);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--button-active-bg);
}

.stat-label {
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--muted-text);
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: var(--modal-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: fadeIn 0.2s ease;
}

.modal-card {
  background: var(--modal-bg);
  border: 1px solid var(--panel-border);
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  animation: scaleIn 0.2s ease;
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--panel-border);
}

.modal-header h3 {
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted-text);
  font-size: 1.5rem;
  cursor: pointer;
  border-radius: 6px;
}

.close-btn:hover {
  background: var(--button-bg);
}

.modal-body {
  padding: 20px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--panel-border);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-item select {
  padding: 8px 12px;
  background: var(--button-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text-color);
  font-size: 0.9rem;
}

.text-btn {
  background: none;
  border: none;
  color: var(--button-active-bg);
  cursor: pointer;
  font-size: 0.9rem;
}

.text-btn.danger {
  color: #ff6b6b;
}

.text-btn:hover {
  text-decoration: underline;
}
</style>
