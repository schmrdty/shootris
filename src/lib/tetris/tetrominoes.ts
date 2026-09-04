import type { Tetromino } from './types';

export const TETROMINOES = {
  I: {
    shape: [
      [1, 1, 1, 1],
    ],
    color: '#00f0f0',
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: '#f0f000',
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    color: '#a000f0',
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: '#00f000',
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: '#f00000',
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: '#0000f0',
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: '#f0a000',
  },
};

export function getRandomTetromino(): Tetromino {
  const keys = Object.keys(TETROMINOES) as Array<keyof typeof TETROMINOES>;
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  const piece = TETROMINOES[randomKey];
  
  return {
    shape: piece.shape,
    color: piece.color,
    position: { x: 3, y: 0 }, // Start at bottom (inverted)
  };
}

export function rotatePiece(piece: Tetromino): Tetromino {
  const newShape = piece.shape[0].map((_, index) =>
    piece.shape.map(row => row[index]).reverse()
  );
  
  return {
    ...piece,
    shape: newShape,
  };
}
