export type TetrisGameMode = 'classic' | 'zen';

export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export type TetrisSettings = {
  theme: string;
  keymap: 'arrows' | 'wasd' | 'both';
  audioEnabled: boolean;
};

export type TetrisAchievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  condition: (stats: TetrisAchievementStats) => boolean;
  unlockedAt?: string;
};

export type TetrisAchievementStats = {
  totalGames: number;
  totalScore: number;
  totalLines: number;
  bestScore: number;
  bestLevel: number;
  maxLinesCleared: number;
  maxLevel: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Tetromino = {
  type: TetrominoType;
  shape: number[][];
  color: string;
  x: number;
  y: number;
  rotation: number;
};

export type TetrisGameState = {
  board: string[][];
  currentPiece: Tetromino | null;
  nextPiece: Tetromino | null;
  score: number;
  level: number;
  lines: number;
  mode: TetrisGameMode;
  isGameOver: boolean;
  isPaused: boolean;
  isPlaying: boolean;
  dropInterval: number;
  lastDropTime: number;
};

export type TetrisLeaderboardEntry = {
  mode: TetrisGameMode;
  score: number;
  level: number;
  lines: number;
  durationMs: number;
  playedAt: string;
};

export type TetrisLeaderboardData = {
  recent: TetrisLeaderboardEntry[];
};

export type TetrisStats = {
  totalGames: number;
  totalScore: number;
  totalLines: number;
  totalTimeMs: number;
  bestScore: number;
  bestLevel: number;
};

export type TetrisInitOptions = {
  mode?: TetrisGameMode;
  level?: number;
  randomFn?: () => number;
};
