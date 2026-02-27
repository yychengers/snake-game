/** 四个基础移动方向。 */
export type Direction = 'up' | 'down' | 'left' | 'right';
/** 游戏模式：经典/无尽/障碍/挑战。 */
export type GameMode = 'classic' | 'endless' | 'obstacle' | 'challenge';
/** 食物类型：普通/加速/减速/双倍。 */
export type FoodType = 'normal' | 'speed' | 'slow' | 'double';

export type Point = {
  x: number;
  y: number;
};

/** 食物是带类型标记的坐标点。 */
export type Food = Point & {
  type: FoodType;
};

/** 临时效果的剩余帧数。 */
export type ActiveEffects = {
  speedTicks: number;
  slowTicks: number;
  doubleTicks: number;
};

/** 游戏主状态：UI 与引擎都基于此对象读写。 */
export type GameState = {
  width: number;
  height: number;
  mode: GameMode;
  snake: Point[];
  obstacles: Point[];
  direction: Direction;
  nextDirection: Direction;
  food: Food;
  level: number;
  levelScore: number;
  totalScore: number;
  unlockedLevel: number;
  comboCount: number;
  comboTicksRemaining: number;
  multiplier: number;
  effects: ActiveEffects;
  isGameOver: boolean;
  isPaused: boolean;
  isCompleted: boolean;
};

/** 单条排行榜记录。 */
export type LeaderboardEntry = {
  mode: GameMode;
  totalScore: number;
  level: number;
  completed: boolean;
  durationMs: number;
  playedAt: string;
};

/** 排行榜持久化结构。 */
export type LeaderboardData = {
  recent: LeaderboardEntry[];
};

/** 初始化状态时可传入的可选参数。 */
export type InitOptions = {
  width?: number;
  height?: number;
  mode?: GameMode;
  level?: number;
  unlockedLevel?: number;
  totalScore?: number;
  randomFn?: () => number;
};

/** 每帧推进时的可选参数（当前用于注入随机函数便于测试）。 */
export type AdvanceOptions = {
  randomFn?: () => number;
};
