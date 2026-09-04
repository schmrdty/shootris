import type { GameState, Tetromino, BoardSnapshot, PvpFloorHitState, TimeTrialState } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT, INITIAL_MOVE_SPEED, SPEED_MULTIPLIER, LINES_PER_LEVEL, LEVELS_PER_STAGE, MIN_MOVE_SPEED, OBSTACLE_BAND_HEIGHT } from './types';
import { getRandomTetromino, rotatePiece } from './tetrominoes';

export function createEmptyBoard(): (string | null)[][] {
  return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null));
}

export function createInitialGameState(): GameState {
  return {
    board: createEmptyBoard(),
    currentPiece: null,
    nextPiece: getRandomTetromino(),
    heldPiece: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    gameOver: false,
    isPaused: false,
    moveSpeed: INITIAL_MOVE_SPEED,
  };
}

export function spawnNewPiece(state: GameState): GameState {
  const newPiece = state.nextPiece;
  if (!newPiece) {
    return state;
  }

  // Check if spawn position is blocked (game over)
  if (checkCollision(state.board, newPiece, newPiece.position)) {
    return {
      ...state,
      gameOver: true,
    };
  }

  return {
    ...state,
    currentPiece: newPiece,
    nextPiece: getRandomTetromino(),
    canHold: true, // Reset hold ability when new piece spawns
  };
}

export function checkCollision(
  board: (string | null)[][],
  piece: Tetromino,
  position: { x: number; y: number }
): boolean {
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        const newX = position.x + x;
        const newY = position.y + y;

        // Check boundaries
        if (newX < 0 || newX >= BOARD_WIDTH || newY < 0 || newY >= BOARD_HEIGHT) {
          return true;
        }

        // Check collision with existing blocks
        if (board[newY][newX]) {
          return true;
        }
      }
    }
  }
  return false;
}

// INVERTED TETRIS: Pieces move UP not DOWN
export function movePieceUp(state: GameState): GameState {
  if (!state.currentPiece || state.gameOver || state.isPaused) {
    return state;
  }

  const newPosition = {
    x: state.currentPiece.position.x,
    y: state.currentPiece.position.y + 1, // Move UP (inverted)
  };

  if (checkCollision(state.board, state.currentPiece, newPosition)) {
    // Lock piece and spawn new one
    return lockPiece(state);
  }

  return {
    ...state,
    currentPiece: {
      ...state.currentPiece,
      position: newPosition,
    },
  };
}

export function movePieceLeft(state: GameState): GameState {
  if (!state.currentPiece || state.gameOver || state.isPaused) {
    return state;
  }

  const newPosition = {
    x: state.currentPiece.position.x - 1,
    y: state.currentPiece.position.y,
  };

  if (checkCollision(state.board, state.currentPiece, newPosition)) {
    return state;
  }

  return {
    ...state,
    currentPiece: {
      ...state.currentPiece,
      position: newPosition,
    },
  };
}

export function movePieceRight(state: GameState): GameState {
  if (!state.currentPiece || state.gameOver || state.isPaused) {
    return state;
  }

  const newPosition = {
    x: state.currentPiece.position.x + 1,
    y: state.currentPiece.position.y,
  };

  if (checkCollision(state.board, state.currentPiece, newPosition)) {
    return state;
  }

  return {
    ...state,
    currentPiece: {
      ...state.currentPiece,
      position: newPosition,
    },
  };
}

export function rotatePieceAction(state: GameState): GameState {
  if (!state.currentPiece || state.gameOver || state.isPaused) {
    return state;
  }

  const rotated = rotatePiece(state.currentPiece);

  if (checkCollision(state.board, rotated, state.currentPiece.position)) {
    return state;
  }

  return {
    ...state,
    currentPiece: rotated,
  };
}

// Hard launch upward (instant drop to top)
export function hardLaunchUp(state: GameState): GameState {
  if (!state.currentPiece || state.gameOver || state.isPaused) {
    return state;
  }

  // Find the highest valid position by checking each row
  let targetY = state.currentPiece.position.y;
  const currentX = state.currentPiece.position.x;
  
  // Move up one row at a time until collision
  while (!checkCollision(state.board, state.currentPiece, { x: currentX, y: targetY + 1 })) {
    targetY++;
  }

  // Update position to the final valid row and lock immediately
  const finalState = {
    ...state,
    currentPiece: {
      ...state.currentPiece,
      position: { x: currentX, y: targetY },
    },
  };

  // Lock at the final grid-aligned position
  return lockPiece(finalState);
}

// Hold piece mechanic
export function holdPiece(state: GameState): GameState {
  if (!state.currentPiece || state.gameOver || state.isPaused || !state.canHold) {
    return state;
  }

  // If no held piece, move current to hold and spawn next
  if (!state.heldPiece) {
    return {
      ...spawnNewPiece({
        ...state,
        heldPiece: { ...state.currentPiece, position: { x: 3, y: 0 } },
        currentPiece: null,
      }),
      canHold: false,
    };
  }

  // Swap current and held pieces
  const swappedHeld = { ...state.heldPiece, position: { x: 3, y: 0 } };
  const swappedCurrent = { ...state.currentPiece, position: { x: 3, y: 0 } };

  // Check if swapped piece can spawn
  if (checkCollision(state.board, swappedHeld, swappedHeld.position)) {
    return state; // Can't swap if held piece can't fit
  }

  return {
    ...state,
    currentPiece: swappedHeld,
    heldPiece: swappedCurrent,
    canHold: false,
  };
}

function lockPiece(state: GameState): GameState {
  if (!state.currentPiece) {
    return state;
  }

  const newBoard = state.board.map(row => [...row]);
  const piece = state.currentPiece;

  // Place piece on board
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        const boardY = piece.position.y + y;
        const boardX = piece.position.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
          newBoard[boardY][boardX] = piece.color;
        }
      }
    }
  }

  // Check for completed lines
  const { board: clearedBoard, linesCleared } = clearLines(newBoard);
  
  const newLines = state.lines + linesCleared;
  const newLevel = Math.floor(newLines / LINES_PER_LEVEL) + 1;

  // PvE progression: the speed ramp runs within a stage and resets each stage,
  // with a hard floor so late levels stay humanly playable
  const levelInStage = ((newLevel - 1) % LEVELS_PER_STAGE) + 1;
  const newMoveSpeed = Math.max(MIN_MOVE_SPEED, INITIAL_MOVE_SPEED / Math.pow(SPEED_MULTIPLIER, levelInStage - 1));

  // Completing LEVELS_PER_STAGE levels clears the stage: fresh board + bonus
  const oldStage = Math.floor((state.level - 1) / LEVELS_PER_STAGE);
  const newStage = Math.floor((newLevel - 1) / LEVELS_PER_STAGE);
  const stageCleared = newStage > oldStage;
  const stageBonus = stageCleared ? 5000 * newStage : 0;

  const newScore = state.score + (linesCleared * 100 * newLevel) + stageBonus;

  const newState = {
    ...state,
    board: stageCleared ? createEmptyBoard() : clearedBoard,
    currentPiece: null,
    lines: newLines,
    level: newLevel,
    moveSpeed: newMoveSpeed,
    score: newScore,
  };

  return spawnNewPiece(newState);
}

function clearLines(board: (string | null)[][]): { board: (string | null)[][]; linesCleared: number } {
  const newBoard = [];
  let linesCleared = 0;

  for (let y = 0; y < BOARD_HEIGHT; y++) {
    if (board[y].every(cell => cell !== null)) {
      linesCleared++;
    } else {
      newBoard.push([...board[y]]);
    }
  }

  // Add empty rows at bottom (inverted)
  while (newBoard.length < BOARD_HEIGHT) {
    newBoard.unshift(Array(BOARD_WIDTH).fill(null));
  }

  return { board: newBoard, linesCleared };
}

// Stage helpers for UI display
export function getStage(level: number): number {
  return Math.floor((level - 1) / LEVELS_PER_STAGE) + 1;
}

export function getLevelInStage(level: number): number {
  return ((level - 1) % LEVELS_PER_STAGE) + 1;
}

export function createBoardSnapshot(state: GameState): BoardSnapshot {
  return {
    board: state.board.map(row => [...row]),
    currentPiece: state.currentPiece ? { ...state.currentPiece } : null,
    score: state.score,
    lines: state.lines,
    level: state.level,
  };
}

export function restoreFromSnapshot(snapshot: BoardSnapshot): Partial<GameState> {
  return {
    board: snapshot.board.map(row => [...row]),
    currentPiece: snapshot.currentPiece ? { ...snapshot.currentPiece } : null,
    score: snapshot.score,
    lines: snapshot.lines,
    level: snapshot.level,
    gameOver: false,
  };
}

// PVP Floor Hit Duel functions
export function createInitialPvpFloorHitState(): PvpFloorHitState {
  const midPoint = Math.floor(BOARD_HEIGHT / 2);
  const obstacleBand: (string | null)[][] = [];
  
  // Create obstacle band with random blocks
  for (let y = 0; y < OBSTACLE_BAND_HEIGHT; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      row.push(Math.random() > 0.5 ? '#808080' : null);
    }
    obstacleBand.push(row);
  }

  return {
    player1: {
      board: createEmptyBoard(),
      currentPiece: null,
      nextPiece: getRandomTetromino(),
      score: 0,
      lines: 0,
      level: 1,
      gameOver: false,
      survivalTime: 0,
    },
    player2: {
      board: createEmptyBoard(),
      currentPiece: null,
      nextPiece: getRandomTetromino(),
      score: 0,
      lines: 0,
      level: 1,
      gameOver: false,
      survivalTime: 0,
    },
    obstacleBand: {
      startRow: midPoint - Math.floor(OBSTACLE_BAND_HEIGHT / 2),
      endRow: midPoint + Math.ceil(OBSTACLE_BAND_HEIGHT / 2),
      blocks: obstacleBand,
    },
    winner: null,
  };
}

// Time Trial functions
export function createInitialTimeTrialState(): TimeTrialState {
  return {
    player1: {
      board: createEmptyBoard(),
      currentPiece: null,
      nextPiece: getRandomTetromino(),
      score: 0,
      lines: 0,
      level: 1,
      gameOver: false,
      survivalTime: 0,
    },
    player2: {
      board: createEmptyBoard(),
      currentPiece: null,
      nextPiece: getRandomTetromino(),
      score: 0,
      lines: 0,
      level: 1,
      gameOver: false,
      survivalTime: 0,
    },
    startTime: Date.now(),
    player1EndTime: null,
    player2EndTime: null,
    winner: null,
  };
}
