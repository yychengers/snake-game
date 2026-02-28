import type { GameState } from './types';

export type CanvasTheme = {
  background: string;
  grid: string;
  obstacle: string;
  snake: string;
  snakeHead: string;
  foodNormal: string;
  foodSpeed: string;
  foodSlow: string;
  foodDouble: string;
};

const DEFAULT_CANVAS_THEME: CanvasTheme = {
  background: '#f2f7ef',
  grid: '#e1eadc',
  obstacle: '#a8b3a1',
  snake: '#6b8f71',
  snakeHead: '#5f7f64',
  foodNormal: '#e58f7f',
  foodSpeed: '#efb36a',
  foodSlow: '#9ac4dd',
  foodDouble: '#d5a6e6',
};

type CanvasCache = {
  background: HTMLCanvasElement;
  ratio: number;
  drawWidth: number;
  drawHeight: number;
  gridWidth: number;
  gridHeight: number;
  backgroundColor: string;
  gridColor: string;
};

const CACHE = new WeakMap<HTMLCanvasElement, CanvasCache>();

/** 在 canvas 上绘制整张棋盘，替代大量 DOM 网格节点。 */
export function renderGameToCanvas(
  canvas: HTMLCanvasElement,
  state: GameState,
  theme: CanvasTheme = DEFAULT_CANVAS_THEME,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ratio = window.devicePixelRatio || 1;
  const size = Math.min(canvas.clientWidth, canvas.clientHeight);
  const pixel = Math.max(1, Math.floor(Math.min(size / state.width, size / state.height)));
  const drawWidth = pixel * state.width;
  const drawHeight = pixel * state.height;

  if (canvas.width !== drawWidth * ratio || canvas.height !== drawHeight * ratio) {
    canvas.width = drawWidth * ratio;
    canvas.height = drawHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  const cache = getOrCreateBackgroundLayer(
    canvas,
    ratio,
    drawWidth,
    drawHeight,
    state.width,
    state.height,
    pixel,
    theme.background,
    theme.grid,
  );
  ctx.clearRect(0, 0, drawWidth, drawHeight);
  ctx.drawImage(cache.background, 0, 0, drawWidth, drawHeight);

  // 障碍
  ctx.fillStyle = theme.obstacle;
  for (const block of state.obstacles) {
    ctx.fillRect(block.x * pixel + 1, block.y * pixel + 1, pixel - 1, pixel - 1);
  }

  // 蛇身
  ctx.fillStyle = theme.snake;
  for (const part of state.snake) {
    ctx.fillRect(part.x * pixel + 1, part.y * pixel + 1, pixel - 1, pixel - 1);
  }

  // 蛇头
  const head = state.snake[0];
  ctx.fillStyle = theme.snakeHead;
  ctx.fillRect(head.x * pixel + 1, head.y * pixel + 1, pixel - 1, pixel - 1);

  // 食物
  ctx.fillStyle =
    state.food.type === 'speed'
      ? theme.foodSpeed
      : state.food.type === 'slow'
        ? theme.foodSlow
        : state.food.type === 'double'
          ? theme.foodDouble
          : theme.foodNormal;
  ctx.fillRect(state.food.x * pixel + 1, state.food.y * pixel + 1, pixel - 1, pixel - 1);
}

function getOrCreateBackgroundLayer(
  canvas: HTMLCanvasElement,
  ratio: number,
  drawWidth: number,
  drawHeight: number,
  gridWidth: number,
  gridHeight: number,
  pixel: number,
  backgroundColor: string,
  gridColor: string,
): CanvasCache {
  const current = CACHE.get(canvas);
  if (
    current &&
    current.ratio === ratio &&
    current.drawWidth === drawWidth &&
    current.drawHeight === drawHeight &&
    current.gridWidth === gridWidth &&
    current.gridHeight === gridHeight &&
    current.backgroundColor === backgroundColor &&
    current.gridColor === gridColor
  ) {
    return current;
  }

  const background = document.createElement('canvas');
  background.width = drawWidth * ratio;
  background.height = drawHeight * ratio;

  const bgCtx = background.getContext('2d');
  if (!bgCtx) {
    const fallback: CanvasCache = {
      background,
      ratio,
      drawWidth,
      drawHeight,
      gridWidth,
      gridHeight,
      backgroundColor,
      gridColor,
    };
    CACHE.set(canvas, fallback);
    return fallback;
  }

  bgCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  bgCtx.fillStyle = backgroundColor;
  bgCtx.fillRect(0, 0, drawWidth, drawHeight);
  bgCtx.strokeStyle = gridColor;
  bgCtx.lineWidth = 1;

  for (let i = 0; i <= gridWidth; i += 1) {
    const x = i * pixel;
    bgCtx.beginPath();
    bgCtx.moveTo(x + 0.5, 0);
    bgCtx.lineTo(x + 0.5, drawHeight);
    bgCtx.stroke();
  }
  for (let i = 0; i <= gridHeight; i += 1) {
    const y = i * pixel;
    bgCtx.beginPath();
    bgCtx.moveTo(0, y + 0.5);
    bgCtx.lineTo(drawWidth, y + 0.5);
    bgCtx.stroke();
  }

  const next: CanvasCache = {
    background,
    ratio,
    drawWidth,
    drawHeight,
    gridWidth,
    gridHeight,
    backgroundColor,
    gridColor,
  };
  CACHE.set(canvas, next);
  return next;
}
