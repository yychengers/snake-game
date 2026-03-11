import type { TetrisGameState, Tetromino } from './types';
import { TETRIS_BOARD_WIDTH, TETRIS_BOARD_HEIGHT } from './constants';

export type TetrisCanvasTheme = {
  background: string;
  grid: string;
  emptyCell: string;
  text: string;
};

const DEFAULT_TETRIS_THEME: TetrisCanvasTheme = {
  background: '#1a1a2e',
  grid: '#16213e',
  emptyCell: '#0f3460',
  text: '#e94560',
};

type TetrisCanvasCache = {
  background: HTMLCanvasElement;
  ratio: number;
  cellSize: number;
  previewCellSize: number;
};

const CACHE = new WeakMap<HTMLCanvasElement, TetrisCanvasCache>();

export function initTetrisCanvas(
  canvas: HTMLCanvasElement,
  preview: HTMLCanvasElement,
  containerWidth: number,
): { cellSize: number; previewCellSize: number } {
  const maxCellSize = Math.floor(containerWidth / TETRIS_BOARD_WIDTH);
  const cellSize = Math.min(maxCellSize, 30);
  const boardWidth = cellSize * TETRIS_BOARD_WIDTH;
  const boardHeight = cellSize * TETRIS_BOARD_HEIGHT;

  canvas.width = boardWidth;
  canvas.height = boardHeight;

  const previewCellSize = Math.min(20, Math.floor(containerWidth / 5));
  preview.width = previewCellSize * 4;
  preview.height = previewCellSize * 4;

  CACHE.set(canvas, {
    background: canvas,
    ratio: window.devicePixelRatio || 1,
    cellSize,
    previewCellSize,
  });

  return { cellSize, previewCellSize };
}

export function renderTetrisBoard(
  ctx: CanvasRenderingContext2D,
  state: TetrisGameState,
  cellSize: number,
  theme: TetrisCanvasTheme = DEFAULT_TETRIS_THEME,
): void {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 0.5;

  for (let row = 0; row <= TETRIS_BOARD_HEIGHT; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * cellSize);
    ctx.lineTo(TETRIS_BOARD_WIDTH * cellSize, row * cellSize);
    ctx.stroke();
  }

  for (let col = 0; col <= TETRIS_BOARD_WIDTH; col++) {
    ctx.beginPath();
    ctx.moveTo(col * cellSize, 0);
    ctx.lineTo(col * cellSize, TETRIS_BOARD_HEIGHT * cellSize);
    ctx.stroke();
  }

  for (let row = 0; row < TETRIS_BOARD_HEIGHT; row++) {
    for (let col = 0; col < TETRIS_BOARD_WIDTH; col++) {
      if (state.board[row][col]) {
        drawBlock(ctx, col, row, state.board[row][col], cellSize);
      }
    }
  }

  if (state.currentPiece) {
    drawTetromino(ctx, state.currentPiece, cellSize);
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  cellSize: number,
): void {
  const padding = 1;
  const xPos = x * cellSize + padding;
  const yPos = y * cellSize + padding;
  const size = cellSize - padding * 2;

  ctx.fillStyle = color;
  ctx.fillRect(xPos, yPos, size, size);

  const gradient = ctx.createLinearGradient(xPos, yPos, xPos + size, yPos + size);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
  ctx.fillStyle = gradient;
  ctx.fillRect(xPos, yPos, size, size);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(xPos, yPos, size, size);
}

function drawTetromino(
  ctx: CanvasRenderingContext2D,
  piece: Tetromino,
  cellSize: number,
): void {
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col] === 0) continue;
      const boardX = piece.x + col;
      const boardY = piece.y + row;
      if (boardY >= 0) {
        drawBlock(ctx, boardX, boardY, piece.color, cellSize);
      }
    }
  }
}

export function renderTetrisPreview(
  ctx: CanvasRenderingContext2D,
  piece: Tetromino | null,
  cellSize: number,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (!piece) return;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const shapeWidth = piece.shape[0].length;
  const shapeHeight = piece.shape.length;
  const offsetX = (4 - shapeWidth) / 2;
  const offsetY = (4 - shapeHeight) / 2;

  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col] === 0) continue;
      const x = (offsetX + col) * cellSize;
      const y = (offsetY + row) * cellSize;
      drawBlock(ctx, x / cellSize, y / cellSize, piece.color, cellSize);
    }
  }
}

export function clearTetrisCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
