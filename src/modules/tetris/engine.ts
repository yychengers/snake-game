import type { TetrisGameState, TetrisInitOptions, Tetromino, TetrominoType } from './types';
import {
  TETRIS_BOARD_WIDTH,
  TETRIS_BOARD_HEIGHT,
  TETROMINOES,
  BASE_DROP_INTERVAL,
  DROP_INTERVAL_DECREASE,
  MIN_DROP_INTERVAL,
  LEVEL_UP_LINES,
} from './constants';

export function createEmptyBoard(): string[][] {
  return Array.from({ length: TETRIS_BOARD_HEIGHT }, () => Array(TETRIS_BOARD_WIDTH).fill(''));
}

export function createTetrisGameState(options?: TetrisInitOptions): TetrisGameState {
  return {
    board: createEmptyBoard(),
    currentPiece: null,
    nextPiece: null,
    score: 0,
    level: options?.level ?? 1,
    lines: 0,
    mode: options?.mode ?? 'classic',
    isGameOver: false,
    isPaused: false,
    isPlaying: false,
    dropInterval: BASE_DROP_INTERVAL,
    lastDropTime: 0,
  };
}

function getRandomTetrominoType(randomFn: () => number): TetrominoType {
  const types = Object.keys(TETROMINOES) as TetrominoType[];
  return types[Math.floor(randomFn() * types.length)];
}

export function createTetromino(type: TetrominoType, offsetX = 3, offsetY = 0): Tetromino {
  const template = TETROMINOES[type];
  return {
    type: type,
    shape: template.shape.map((row) => [...row]),
    color: template.color,
    x: offsetX,
    y: offsetY,
    rotation: 0,
  };
}

export function spawnNewPiece(state: TetrisGameState, randomFn: () => number): TetrisGameState {
  const nextPieceType = state.nextPiece ? state.nextPiece.type : getRandomTetrominoType(randomFn);
  const newNextPiece = createTetromino(getRandomTetrominoType(randomFn));

  const newPiece = createTetromino(nextPieceType);

  if (checkCollision(state.board, newPiece)) {
    return {
      ...state,
      currentPiece: newPiece,
      nextPiece: newNextPiece,
      isGameOver: true,
      isPlaying: false,
    };
  }

  return {
    ...state,
    currentPiece: newPiece,
    nextPiece: newNextPiece,
  };
}

export function checkCollision(board: string[][], piece: Tetromino): boolean {
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col] === 0) continue;

      const boardX = piece.x + col;
      const boardY = piece.y + row;

      if (boardX < 0 || boardX >= TETRIS_BOARD_WIDTH || boardY >= TETRIS_BOARD_HEIGHT) {
        return true;
      }

      if (boardY >= 0 && board[boardY][boardX] !== '') {
        return true;
      }
    }
  }
  return false;
}

export function rotatePiece(piece: Tetromino): Tetromino {
  const n = piece.shape.length;
  const rotated: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      rotated[col][n - 1 - row] = piece.shape[row][col];
    }
  }

  return {
    ...piece,
    shape: rotated,
    rotation: (piece.rotation + 1) % 4,
  };
}

export function movePiece(state: TetrisGameState, dx: number, dy: number): TetrisGameState {
  if (!state.currentPiece) return state;

  const newPiece = {
    ...state.currentPiece,
    x: state.currentPiece.x + dx,
    y: state.currentPiece.y + dy,
  };

  if (!checkCollision(state.board, newPiece)) {
    return {
      ...state,
      currentPiece: newPiece,
    };
  }

  return state;
}

export function rotateCurrentPiece(state: TetrisGameState): TetrisGameState {
  if (!state.currentPiece) return state;

  const rotated = rotatePiece(state.currentPiece);

  if (!checkCollision(state.board, rotated)) {
    return {
      ...state,
      currentPiece: rotated,
    };
  }

  const kickOffsets = [-1, 1, -2, 2];
  for (const offset of kickOffsets) {
    const kicked = { ...rotated, x: rotated.x + offset };
    if (!checkCollision(state.board, kicked)) {
      return {
        ...state,
        currentPiece: kicked,
      };
    }
  }

  return state;
}

export function lockPiece(state: TetrisGameState): TetrisGameState {
  if (!state.currentPiece) return state;

  const newBoard = state.board.map((row) => [...row]);

  for (let row = 0; row < state.currentPiece.shape.length; row++) {
    for (let col = 0; col < state.currentPiece.shape[row].length; col++) {
      if (state.currentPiece.shape[row][col] === 0) continue;

      const boardY = state.currentPiece.y + row;
      const boardX = state.currentPiece.x + col;

      if (
        boardY >= 0 &&
        boardY < TETRIS_BOARD_HEIGHT &&
        boardX >= 0 &&
        boardX < TETRIS_BOARD_WIDTH
      ) {
        newBoard[boardY][boardX] = state.currentPiece.color;
      }
    }
  }

  return {
    ...state,
    board: newBoard,
    currentPiece: null,
  };
}

export function clearLines(state: TetrisGameState): TetrisGameState {
  let linesCleared = 0;
  let newBoard = state.board.filter((row) => {
    const isFull = row.every((cell) => cell !== '');
    if (isFull) linesCleared++;
    return !isFull;
  });

  while (newBoard.length < TETRIS_BOARD_HEIGHT) {
    newBoard.unshift(Array(TETRIS_BOARD_WIDTH).fill(''));
  }

  const newLines = state.lines + linesCleared;
  const newLevel = Math.floor(newLines / LEVEL_UP_LINES) + 1;
  const levelBonus = newLevel > state.level ? (newLevel - state.level) * 500 : 0;

  const pointsPerLine = [0, 100, 300, 500, 800];
  const linePoints = pointsPerLine[linesCleared] || 800;
  const newScore = state.score + linePoints * state.level + levelBonus;

  const newDropInterval = Math.max(
    MIN_DROP_INTERVAL,
    BASE_DROP_INTERVAL - (newLevel - 1) * DROP_INTERVAL_DECREASE,
  );

  return {
    ...state,
    board: newBoard,
    score: newScore,
    level: newLevel,
    lines: newLines,
    dropInterval: newDropInterval,
  };
}

export function hardDrop(state: TetrisGameState): TetrisGameState {
  if (!state.currentPiece) return state;

  let newPiece = { ...state.currentPiece };
  while (!checkCollision(state.board, { ...newPiece, y: newPiece.y + 1 })) {
    newPiece.y++;
  }

  return {
    ...state,
    currentPiece: newPiece,
  };
}

export function updateTetrisGame(
  state: TetrisGameState,
  deltaTime: number,
  randomFn: () => number,
): TetrisGameState {
  if (!state.isPlaying || state.isPaused || state.isGameOver) {
    return state;
  }

  let newState = { ...state, lastDropTime: state.lastDropTime + deltaTime };

  if (newState.lastDropTime >= newState.dropInterval) {
    newState = movePiece(newState, 0, 1);
    newState.lastDropTime = 0;

    if (
      newState.currentPiece &&
      checkCollision(newState.board, { ...newState.currentPiece, y: newState.currentPiece.y + 1 })
    ) {
      newState = lockPiece(newState);
      newState = clearLines(newState);

      if (newState.board[0].some((cell) => cell !== '')) {
        return {
          ...newState,
          isGameOver: true,
          isPlaying: false,
        };
      }

      newState = spawnNewPiece(newState, randomFn);
    }
  }

  return newState;
}
