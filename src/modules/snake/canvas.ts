import type { GameState } from './types';

/** 在 canvas 上绘制整张棋盘，替代大量 DOM 网格节点。 */
export function renderGameToCanvas(canvas: HTMLCanvasElement, state: GameState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ratio = window.devicePixelRatio || 1;
  const size = Math.min(canvas.clientWidth, canvas.clientHeight);
  const pixel = Math.max(1, Math.floor(size / state.width));
  const drawSize = pixel * state.width;

  if (canvas.width !== drawSize * ratio || canvas.height !== drawSize * ratio) {
    canvas.width = drawSize * ratio;
    canvas.height = drawSize * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  ctx.clearRect(0, 0, drawSize, drawSize);
  ctx.fillStyle = '#f2f7ef';
  ctx.fillRect(0, 0, drawSize, drawSize);

  // 先画网格底线
  ctx.strokeStyle = '#e1eadc';
  ctx.lineWidth = 1;
  for (let i = 0; i <= state.width; i += 1) {
    const p = i * pixel;
    ctx.beginPath();
    ctx.moveTo(p + 0.5, 0);
    ctx.lineTo(p + 0.5, drawSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p + 0.5);
    ctx.lineTo(drawSize, p + 0.5);
    ctx.stroke();
  }

  // 障碍
  ctx.fillStyle = '#a8b3a1';
  for (const block of state.obstacles) {
    ctx.fillRect(block.x * pixel + 1, block.y * pixel + 1, pixel - 1, pixel - 1);
  }

  // 蛇身
  ctx.fillStyle = '#6b8f71';
  for (const part of state.snake) {
    ctx.fillRect(part.x * pixel + 1, part.y * pixel + 1, pixel - 1, pixel - 1);
  }

  // 蛇头
  const head = state.snake[0];
  ctx.fillStyle = '#5f7f64';
  ctx.fillRect(head.x * pixel + 1, head.y * pixel + 1, pixel - 1, pixel - 1);

  // 食物
  ctx.fillStyle =
    state.food.type === 'speed'
      ? '#efb36a'
      : state.food.type === 'slow'
        ? '#9ac4dd'
        : state.food.type === 'double'
          ? '#d5a6e6'
          : '#e58f7f';
  ctx.fillRect(state.food.x * pixel + 1, state.food.y * pixel + 1, pixel - 1, pixel - 1);
}
