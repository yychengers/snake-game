<script setup lang="ts">
import { ref } from 'vue';
import SnakeGame from './modules/snake/SnakeGame.vue';
import TetrisGame from './modules/tetris/TetrisGame.vue';

type GameType = 'snake' | 'tetris';

const currentGame = ref<GameType>('snake');
</script>

<template>
  <div class="app-container">
    <nav class="game-selector">
      <button
        :class="['game-tab', { active: currentGame === 'snake' }]"
        @click="currentGame = 'snake'"
      >
        🐍 贪吃蛇
      </button>
      <button
        :class="['game-tab', { active: currentGame === 'tetris' }]"
        @click="currentGame = 'tetris'"
      >
        🧱 俄罗斯方块
      </button>
    </nav>
    <main class="game-content">
      <SnakeGame v-if="currentGame === 'snake'" />
      <TetrisGame v-else-if="currentGame === 'tetris'" />
    </main>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-container {
  min-height: 100vh;
  background: #0d1117;
}

.game-selector {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 12px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
}

.game-tab {
  padding: 10px 24px;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 1rem;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
}

.game-tab.active {
  background: #238636;
  color: #fff;
}

.game-tab:hover:not(.active) {
  background: #21262d;
  color: #c9d1d9;
}

.game-content {
  min-height: calc(100vh - 60px);
}
</style>
