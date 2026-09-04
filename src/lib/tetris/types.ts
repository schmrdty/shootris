export interface Position {
  x: number;
  y: number;
}

export interface Tetromino {
  shape: number[][];
  color: string;
  position: Position;
}

export interface GameState {
  board: (string | null)[][];
  currentPiece: Tetromino | null;
  nextPiece: Tetromino | null;
  heldPiece: Tetromino | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
  isPaused: boolean;
  moveSpeed: number;
}

export interface PvpGameState {
  board: (string | null)[][];
  currentPiece: Tetromino | null;
  nextPiece: Tetromino | null;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
  survivalTime: number;
}

export interface ObstacleBand {
  startRow: number;
  endRow: number;
  blocks: (string | null)[][];
}

export interface PvpFloorHitState {
  player1: PvpGameState;
  player2: PvpGameState;
  obstacleBand: ObstacleBand;
  winner: 'player1' | 'player2' | null;
}

export interface TimeTrialState {
  player1: PvpGameState;
  player2: PvpGameState;
  startTime: number;
  player1EndTime: number | null;
  player2EndTime: number | null;
  winner: 'player1' | 'player2' | 'tie' | null;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  space: boolean;
}

export interface BoardSnapshot {
  board: (string | null)[][];
  currentPiece: Tetromino | null;
  score: number;
  lines: number;
  level: number;
}

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const OBSTACLE_BAND_HEIGHT = 4;
export const INITIAL_MOVE_SPEED = 500; // ms
export const SPEED_MULTIPLIER = 1.169;
export const LINES_PER_LEVEL = 32;
