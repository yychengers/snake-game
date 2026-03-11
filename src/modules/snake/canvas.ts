import type { GameState, SnakeSkin } from './types';
import { SNAKE_SKINS } from './config';

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
  itemShield: string;
  itemTeleport: string;
  itemClearObstacles: string;
  particle: string;
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
  itemShield: '#ffd700',
  itemTeleport: '#bf80ff',
  itemClearObstacles: '#ff6b6b',
  particle: '#ffffff',
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

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

const CACHE = new WeakMap<HTMLCanvasElement, CanvasCache>();
const PARTICLES = new WeakMap<HTMLCanvasElement, Particle[]>();

export function createParticles(
  x: number,
  y: number,
  color: string,
  count: number = 8,
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 1 + Math.random() * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      color,
      size: 2 + Math.random() * 2,
    });
  }
  return particles;
}

export function updateParticles(particles: Particle[]): void {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life -= 0.03;
  }
}

export function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  pixel: number,
): void {
  for (const p of particles) {
    if (p.life <= 0) continue;
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * pixel + pixel / 2, p.y * pixel + pixel / 2, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function getParticles(canvas: HTMLCanvasElement): Particle[] {
  let particles = PARTICLES.get(canvas);
  if (!particles) {
    particles = [];
    PARTICLES.set(canvas, particles);
  }
  return particles;
}

export function addParticles(canvas: HTMLCanvasElement, newParticles: Particle[]): void {
  const particles = getParticles(canvas);
  particles.push(...newParticles);
}

export function clearParticles(canvas: HTMLCanvasElement): void {
  const particles = getParticles(canvas);
  particles.length = 0;
}

export function renderGameToCanvas(
  canvas: HTMLCanvasElement,
  state: GameState,
  theme: CanvasTheme = DEFAULT_CANVAS_THEME,
  skin: SnakeSkin = SNAKE_SKINS.classic,
  animationFrame: number = 0,
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

  ctx.fillStyle = theme.obstacle;
  for (const block of state.obstacles) {
    ctx.fillRect(block.x * pixel + 1, block.y * pixel + 1, pixel - 1, pixel - 1);
  }

  const hasAnimation = skin.hasAnimation && animationFrame > 0;
  const bodyColor = hasAnimation
    ? adjustColor(skin.bodyColor, Math.sin(animationFrame * 0.3) * 20)
    : skin.bodyColor;
  const headColor = hasAnimation
    ? adjustColor(skin.headColor, Math.sin(animationFrame * 0.3) * 20)
    : skin.headColor;

  ctx.fillStyle = bodyColor;
  for (let i = 1; i < state.snake.length; i++) {
    const part = state.snake[i];
    const offset =
      hasAnimation && skin.id !== 'classic' ? Math.sin(animationFrame * 0.2 + i * 0.5) * 1 : 0;
    ctx.fillRect(part.x * pixel + 1 + offset, part.y * pixel + 1 + offset, pixel - 2, pixel - 2);
  }

  const head = state.snake[0];
  ctx.fillStyle = headColor;
  ctx.fillRect(head.x * pixel + 1, head.y * pixel + 1, pixel - 1, pixel - 1);

  if (skin.hasAnimation) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(head.x * pixel + 1, head.y * pixel + 1, pixel / 3, pixel / 3);
  }

  if (state.hasShield) {
    ctx.strokeStyle = theme.itemShield;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(head.x * pixel + pixel / 2, head.y * pixel + pixel / 2, pixel * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = theme.itemShield;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle =
    state.food.type === 'speed'
      ? theme.foodSpeed
      : state.food.type === 'slow'
        ? theme.foodSlow
        : state.food.type === 'double'
          ? theme.foodDouble
          : theme.foodNormal;
  ctx.fillRect(state.food.x * pixel + 1, state.food.y * pixel + 1, pixel - 1, pixel - 1);

  if (state.item) {
    const itemColor =
      state.item.type === 'shield'
        ? theme.itemShield
        : state.item.type === 'teleport'
          ? theme.itemTeleport
          : theme.itemClearObstacles;
    ctx.fillStyle = itemColor;
    ctx.fillRect(state.item.x * pixel + 2, state.item.y * pixel + 2, pixel - 3, pixel - 3);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(state.item.x * pixel + 2, state.item.y * pixel + 2, pixel - 3, pixel - 3);
  }

  const particles = getParticles(canvas);
  updateParticles(particles);
  renderParticles(ctx, particles, pixel);
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
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
