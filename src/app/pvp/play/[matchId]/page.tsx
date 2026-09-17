'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import {
  createInitialGameState,
  spawnNewPiece,
  movePieceUp,
  movePieceLeft,
  movePieceRight,
  rotatePieceAction,
  hardLaunchUp,
  holdPiece,
} from '@/lib/tetris/game-engine';
import type { GameState } from '@/lib/tetris/types';
import { BOARD_WIDTH, BOARD_HEIGHT, OBSTACLE_BAND_HEIGHT } from '@/lib/tetris/types';
import type { PvpMatch } from '@/spacetime_module_bindings';
import { Trophy, Skull } from 'lucide-react';
import { useGameTheme } from '@/lib/theme';
import { MATCH_TIMEOUT_MS, formatCountdown, useTimeout } from '@/lib/pvp';
import { MobileControls } from '@/components/MobileControls';
import { useTouchControls, useBoardCellSize, CONTROL_DECK_HEIGHT } from '@/hooks/useTouchControls';

const OBSTACLE_COLOR = '#6b7280';
const OBSTACLE_START_ROW = 12;

// Deterministic PRNG so both players get the identical obstacle layout for a match
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface OpponentInfo {
  board: (string | null)[][] | null;
  lines: number;
  level: number;
  gameOver: boolean;
}

function parseOpponentBoard(json: string): OpponentInfo {
  try {
    const data = JSON.parse(json);
    if (data && Array.isArray(data.board)) {
      return {
        board: data.board,
        lines: data.lines ?? 0,
        level: data.level ?? 1,
        gameOver: !!data.gameOver,
      };
    }
  } catch {
    // Not yet synced or malformed — treat as empty
  }
  return { board: null, lines: 0, level: 1, gameOver: false };
}

export default function PvpPlayPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const { connection } = useSpacetimeDB(address || null);

  const matchId = useMemo(() => {
    try {
      return BigInt(String(params.matchId));
    } catch {
      return null;
    }
  }, [params.matchId]);

  const [match, setMatch] = useState<PvpMatch | null>(null);
  // Deterministic first render (no random piece) so SSR and client match
  const [gameState, setGameState] = useState<GameState>(() => ({ ...createInitialGameState(), nextPiece: null }));
  const [initialized, setInitialized] = useState(false);
  const [now, setNow] = useState(Date.now());
  const gameLoopRef = useRef<number | null>(null);
  const stateRef = useRef(gameState);
  const { isEarthen, cellStyle } = useGameTheme();
  // Phones and tablets: on-screen controls, board sized to fit above them
  const touch = useTouchControls();
  const cell = useBoardCellSize(touch, 250, 24, 12);

  // Line-clear animation rows (retriggered by the engine's clearEvent counter)
  const [animRows, setAnimRows] = useState<number[]>([]);
  const lastClearEventRef = useRef(0);
  useEffect(() => {
    if (gameState.clearEvent > lastClearEventRef.current) {
      lastClearEventRef.current = gameState.clearEvent;
      setAnimRows(gameState.lastClearedRows);
      const t = setTimeout(() => setAnimRows([]), 900);
      return () => clearTimeout(t);
    }
  }, [gameState.clearEvent, gameState.lastClearedRows]);
  const matchRef = useRef<PvpMatch | null>(null);
  const completedRef = useRef(false);
  const expiryHandledRef = useRef(false);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  // Track the match row live
  useEffect(() => {
    if (!connection || matchId === null) return;

    for (const m of connection.db.pvpMatches.iter()) {
      if (m.matchId === matchId) {
        setMatch({ ...m });
        break;
      }
    }

    const onUpdate = (_ctx: unknown, _old: PvpMatch, m: PvpMatch) => {
      if (m.matchId === matchId) setMatch({ ...m });
    };
    const onInsert = (_ctx: unknown, m: PvpMatch) => {
      if (m.matchId === matchId) setMatch({ ...m });
    };
    connection.db.pvpMatches.onUpdate(onUpdate);
    connection.db.pvpMatches.onInsert(onInsert);
    return () => {
      connection.db.pvpMatches.removeOnUpdate(onUpdate);
      connection.db.pvpMatches.removeOnInsert(onInsert);
    };
  }, [connection, matchId]);

  const myWallet = address ? address.toLowerCase() : null;
  const isP1 = !!(match && myWallet && match.player1Wallet.toLowerCase() === myWallet);
  const isP2 = !!(match && myWallet && match.player2Wallet && match.player2Wallet.toLowerCase() === myWallet);
  const isParticipant = isP1 || isP2;
  const opponentWallet = match ? (isP1 ? match.player2Wallet ?? null : match.player1Wallet) : null;
  const opponentScore = match ? (isP1 ? match.player2Score : match.player1Score) : BigInt(0);
  const opponentInfo = useMemo(
    () => parseOpponentBoard(match ? (isP1 ? match.player2BoardState : match.player1BoardState) : ''),
    [match, isP1]
  );
  const opponentFingerprint = `${opponentScore}|${opponentInfo.lines}|${opponentInfo.gameOver}|${
    opponentInfo.board ? opponentInfo.board.flat().filter(Boolean).length : -1
  }`;
  const [opponentSeenAt, setOpponentSeenAt] = useState<number | null>(null);
  useEffect(() => {
    setOpponentSeenAt(Date.now());
  }, [opponentFingerprint]);
  const opponentIdleLeftMs = useTimeout(opponentSeenAt);

  const isFloorDuel = match?.matchType.tag === 'FloorHitDuel';
  const waitingSinceMs =
    match && match.status.tag === 'Waiting'
      ? Number(match.createdAt.microsSinceUnixEpoch / BigInt(1000))
      : null;
  const inviteLeftMs = useTimeout(waitingSinceMs);
  const matchCompleted = match?.status.tag === 'Completed';
  const matchCancelled = match?.status.tag === 'Cancelled';

  // Score race countdown
  const startedAtMs = match?.startedAt ? Number(match.startedAt.microsSinceUnixEpoch / BigInt(1000)) : null;
  const durationMs = match ? Number(match.matchDurationSeconds) * 1000 : 0;
  const timeLeftMs =
    match && !isFloorDuel && startedAtMs !== null ? Math.max(0, startedAtMs + durationMs - now) : null;
  const timeExpired = timeLeftMs !== null && timeLeftMs <= 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Initialize my board once the match is active
  useEffect(() => {
    if (initialized || !match || !isParticipant || matchId === null) return;
    if (match.status.tag !== 'Active') return;

    let state = createInitialGameState();
    if (match.matchType.tag === 'FloorHitDuel') {
      const rand = mulberry32(Number(matchId % BigInt(2147483647)));
      const board = state.board.map((row) => [...row]);
      for (let y = OBSTACLE_START_ROW; y < OBSTACLE_START_ROW + OBSTACLE_BAND_HEIGHT; y++) {
        let filled = 0;
        for (let x = 0; x < BOARD_WIDTH; x++) {
          if (rand() < 0.6) {
            board[y][x] = OBSTACLE_COLOR;
            filled++;
          }
        }
        if (filled === BOARD_WIDTH) {
          board[y][Math.floor(rand() * BOARD_WIDTH)] = null;
        }
      }
      state = { ...state, board };
    }
    setGameState(spawnNewPiece(state));
    setInitialized(true);
  }, [match, initialized, isParticipant, matchId]);

  // Push my board + score to the match row
  const sendBoardUpdate = useCallback(() => {
    if (!connection || matchId === null || !myWallet) return;
    const s = stateRef.current;
    const payload = JSON.stringify({ board: s.board, lines: s.lines, level: s.level, gameOver: s.gameOver });
    try {
      connection.reducers.updatePvpBoard(matchId, myWallet, payload, BigInt(s.score));
    } catch (error) {
      console.error('Failed to sync board:', error);
    }
  }, [connection, matchId, myWallet]);

  useEffect(() => {
    if (!initialized || matchCompleted || matchCancelled) return;
    sendBoardUpdate();
    const t = setInterval(sendBoardUpdate, 1000);
    return () => clearInterval(t);
  }, [initialized, matchCompleted, matchCancelled, sendBoardUpdate]);

  // Finalize the match (reducer rejects a second completion, so a race is harmless)
  const tryComplete = useCallback(
    (winnerWallet: string) => {
      if (!connection || matchId === null || completedRef.current) return;
      completedRef.current = true;
      sendBoardUpdate();
      try {
        connection.reducers.completePvpMatch(matchId, winnerWallet.toLowerCase());
      } catch (error) {
        console.error('Failed to complete match:', error);
      }
    },
    [connection, matchId, sendBoardUpdate]
  );

  // Floor duel: touch the far wall (top row) to win; top out and you lose
  useEffect(() => {
    if (!isFloorDuel || !initialized || matchCompleted || !myWallet || !opponentWallet) return;
    const reachedFloor = gameState.board[BOARD_HEIGHT - 1].some((cell) => cell !== null);
    if (reachedFloor) {
      tryComplete(myWallet);
    } else if (gameState.gameOver) {
      tryComplete(opponentWallet);
    }
  }, [gameState, isFloorDuel, initialized, matchCompleted, myWallet, opponentWallet, tryComplete]);

  // Score race: when time expires, sync final score, then both clients derive the same
  // winner from the match row — the first completion wins, the second is rejected.
  useEffect(() => {
    if (isFloorDuel || !initialized || matchCompleted || !timeExpired) return;
    if (expiryHandledRef.current) return;
    expiryHandledRef.current = true;
    sendBoardUpdate();
    const t = setTimeout(() => {
      const m = matchRef.current;
      if (!m || m.status.tag === 'Completed' || m.status.tag === 'Cancelled') return;
      const winner =
        m.player2Score > m.player1Score && m.player2Wallet ? m.player2Wallet : m.player1Wallet;
      tryComplete(winner);
    }, 1500);
    return () => clearTimeout(t);
  }, [isFloorDuel, initialized, matchCompleted, timeExpired, sendBoardUpdate, tryComplete]);

  // Game loop
  const playHalted = gameState.gameOver || matchCompleted || matchCancelled || timeExpired || !initialized;
  useEffect(() => {
    if (playHalted) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
      return;
    }
    gameLoopRef.current = window.setInterval(() => {
      setGameState((prev) => movePieceUp(prev));
    }, gameState.moveSpeed);
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [playHalted, gameState.moveSpeed]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (playHalted) return;
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          setGameState((prev) => movePieceLeft(prev));
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          setGameState((prev) => movePieceRight(prev));
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          setGameState((prev) => movePieceUp(prev)); // forward one space
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          setGameState((prev) => rotatePieceAction(prev));
          break;
        case ' ':
          e.preventDefault();
          setGameState((prev) => hardLaunchUp(prev));
          break;
        case 'Shift':
        case 'c':
        case 'C':
          e.preventDefault();
          setGameState((prev) => holdPiece(prev));
          break;
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [playHalted]);

  // Touch controls run the same engine actions as the keyboard
  const touchAction = useCallback(
    (action: (state: GameState) => GameState) => {
      if (playHalted) return;
      setGameState((prev) => action(prev));
    },
    [playHalted]
  );

  const renderBoard = (board: (string | null)[][], cellSize: number, piece = gameState.currentPiece, drawPiece = true) => {
    const view = board.map((row) => [...row]);
    if (drawPiece && piece) {
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (piece.shape[y][x]) {
            const by = piece.position.y + y;
            const bx = piece.position.x + x;
            if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
              view[by][bx] = piece.color;
            }
          }
        }
      }
    }
    return view
      .slice()
      .reverse()
      .map((row, y) => (
        <div key={y} className="flex" style={{ height: `${cellSize}px` }}>
          {row.map((cell, x) => (
            <div key={x} className="relative" style={cellStyle(cell, cellSize)}>
              <div className="absolute inset-0 border border-cyan-900/20" />
            </div>
          ))}
        </div>
      ));
  };

  if (!address) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-black to-blue-950 pt-16">
        <Card className="p-8 bg-black/80 border-cyan-500">
          <p className="text-white">Wallet required to play PvP.</p>
          <Button onClick={() => router.push('/pvp')} className="mt-4">
            Back to PvP
          </Button>
        </Card>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-black to-blue-950 pt-16">
        <Card className="p-8 bg-black/80 border-cyan-500">
          <p className="text-white">Loading match #{String(params.matchId)}…</p>
          <Button onClick={() => router.push('/pvp')} variant="outline" className="mt-4">
            Back to PvP
          </Button>
        </Card>
      </div>
    );
  }

  if (!isParticipant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-black to-blue-950 pt-16">
        <Card className="p-8 bg-black/80 border-red-500">
          <p className="text-white">You are not a participant in this match.</p>
          <Button onClick={() => router.push('/pvp')} className="mt-4">
            Back to PvP
          </Button>
        </Card>
      </div>
    );
  }

  if (match.status.tag === 'Waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-black to-blue-950 pt-16">
        <Card className="p-8 bg-black/80 border-yellow-500 text-center">
          <p className="text-yellow-400 text-xl font-bold mb-2">Waiting for an opponent…</p>
          <p className="text-gray-400 text-sm mb-1">The game starts automatically when someone joins.</p>
          <p className={`mb-4 text-sm font-bold ${inviteLeftMs === 0 ? 'text-red-400' : 'text-cyan-300'}`}>
            {inviteLeftMs === 0
              ? 'Invite expired. The match was cancelled'
              : `Invite expires in ${formatCountdown(inviteLeftMs ?? MATCH_TIMEOUT_MS)}`}
          </p>
          <Button onClick={() => router.push('/pvp')} variant="outline">
            Back to PvP
          </Button>
        </Card>
      </div>
    );
  }

  const iWon = matchCompleted && match.winnerWallet?.toLowerCase() === myWallet;
  const timeLeftLabel =
    timeLeftMs !== null
      ? `${Math.floor(timeLeftMs / 60000)}:${String(Math.floor((timeLeftMs % 60000) / 1000)).padStart(2, '0')}`
      : null;

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-gray-950 via-black to-blue-950 px-4 ${touch ? 'pt-14' : 'py-8 pt-16'}`}
      style={touch ? { paddingBottom: CONTROL_DECK_HEIGHT + 8 } : undefined}
    >
      <div className="max-w-7xl mx-auto">
        <div className={`${touch ? 'mb-2' : 'mb-4'} flex justify-between items-center`}>
          <Button variant="outline" onClick={() => router.push('/pvp')}>
            ← Leave
          </Button>
          <div className="text-center">
            <h2 className={`${touch ? 'text-lg' : 'text-2xl'} font-bold ${isFloorDuel ? 'text-cyan-400' : 'text-yellow-400'}`}>
              {isFloorDuel ? 'FLOOR HIT DUEL' : 'SCORE RACE'}
            </h2>
            {timeLeftLabel && (
              <p className={`${touch ? 'text-xl' : 'text-3xl'} font-black ${timeLeftMs! < 30000 ? 'text-red-400' : 'text-white'}`}>
                {timeLeftLabel}
              </p>
            )}
            {isFloorDuel && !touch && (
              <p className="text-xs text-gray-400">Break through the barrier and touch the far wall to win!</p>
            )}
          </div>
          <div className="w-20" />
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* My board */}
          <div className="flex-1">
            <Card className={`bg-black/80 border-purple-500/50 ${touch ? 'p-2' : 'p-4'}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-purple-400 font-bold">YOU</span>
                {touch && gameState.nextPiece && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-green-400">
                    NEXT
                    <span className="inline-block">
                      {gameState.nextPiece.shape.map((row, y) => (
                        <span key={y} className="flex" style={{ height: '8px' }}>
                          {row.map((c, x) => (
                            <span key={x} style={cellStyle(c ? gameState.nextPiece!.color : null, 8)} />
                          ))}
                        </span>
                      ))}
                    </span>
                  </span>
                )}
                <span className="text-white font-bold">Score: {gameState.score}</span>
              </div>
              <div className="flex justify-center items-start gap-2">
                <div
                  className="inline-block relative border-4 border-cyan-500 rounded"
                  style={{ boxShadow: '0 0 20px rgba(0, 240, 255, 0.5), inset 0 0 20px rgba(0, 240, 255, 0.2)' }}
                >
                  {renderBoard(gameState.board, cell)}
                  {animRows.map((y) => (
                    <div
                      key={`clear-${lastClearEventRef.current}-${y}`}
                      className={isEarthen ? 'line-clear-earthen' : 'line-clear-neon'}
                      style={{ top: `${(BOARD_HEIGHT - 1 - y) * cell}px`, height: `${cell}px` }}
                    />
                  ))}
                </div>
                {/* Opponent at a glance; the side panel is hidden on phones */}
                {touch && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-red-400">OPP {Number(opponentScore)}</span>
                    {opponentInfo.board ? (
                      <div className="inline-block border border-red-500/50 rounded">
                        {renderBoard(opponentInfo.board, 6, null, false)}
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-500">waiting</span>
                    )}
                  </div>
                )}
              </div>
              {!matchCompleted &&
                opponentIdleLeftMs !== null &&
                opponentIdleLeftMs < MATCH_TIMEOUT_MS - 60_000 && (
                  <p className="mt-3 text-center text-sm font-bold text-yellow-400">
                    Opponent idle. You win in {formatCountdown(opponentIdleLeftMs)} if they stay away
                  </p>
                )}
              {gameState.gameOver && !matchCompleted && (
                <p className="text-center text-red-400 font-bold mt-3">
                  {isFloorDuel ? 'Topped out!' : 'Topped out. Your score stands until time runs out.'}
                </p>
              )}
              <div className="mt-4 p-3 bg-gray-900/50 rounded border border-gray-700 hidden md:block">
                <p className="text-xs text-gray-400 text-center">
                  <span className="font-bold text-purple-400">Controls:</span> ← → or A/D: Move | ↑ or W: Forward | ↓ or S: Rotate | Space: Shoot | Shift/C: Hold
                </p>
              </div>
            </Card>
          </div>

          {/* Opponent + stats */}
          <div className={`md:w-72 space-y-4 ${touch ? 'hidden' : ''}`}>
            <Card className="bg-black/80 border-red-500/50 p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-red-400 font-bold">
                  {opponentWallet ? `${opponentWallet.slice(0, 6)}…${opponentWallet.slice(-4)}` : 'OPPONENT'}
                </span>
                <span className="text-white font-bold">{Number(opponentScore)}</span>
              </div>
              <div className="flex justify-center">
                {opponentInfo.board ? (
                  <div className="inline-block border-2 border-red-500/50 rounded">
                    {renderBoard(opponentInfo.board, 10, null, false)}
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs py-8">Waiting for opponent data…</p>
                )}
              </div>
              {opponentInfo.gameOver && !matchCompleted && (
                <p className="text-center text-yellow-400 text-xs font-bold mt-2">Opponent topped out!</p>
              )}
            </Card>

            <Card className="bg-black/80 border-blue-500/50 p-4">
              <h3 className="text-lg font-bold text-blue-400 mb-3">Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Your Lines:</span>
                  <span className="text-white font-bold">{gameState.lines}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Your Level:</span>
                  <span className="text-white font-bold">{gameState.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Opponent Lines:</span>
                  <span className="text-white font-bold">{opponentInfo.lines}</span>
                </div>
              </div>
            </Card>

            {/* Next Piece */}
            <Card className="bg-black/80 border-green-500/50 p-4">
              <h3 className="text-lg font-bold text-green-400 mb-3">Next Piece</h3>
              <div className="flex justify-center">
                {gameState.nextPiece && (
                  <div className="inline-block">
                    {gameState.nextPiece.shape.map((row, y) => (
                      <div key={y} className="flex" style={{ height: '20px' }}>
                        {row.map((cell, x) => (
                          <div key={x} style={cellStyle(cell ? gameState.nextPiece!.color : null, 20)} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {touch && (
        <MobileControls
          onLeft={() => touchAction(movePieceLeft)}
          onRight={() => touchAction(movePieceRight)}
          onForward={() => touchAction(movePieceUp)}
          onShoot={() => touchAction(hardLaunchUp)}
          onRotate={() => touchAction(rotatePieceAction)}
          onHold={() => touchAction(holdPiece)}
          canHold={gameState.canHold}
          disabled={playHalted}
        />
      )}

      {/* Result overlay */}
      <Dialog open={matchCompleted || matchCancelled}>
        <DialogContent className="bg-gray-900 border-purple-500" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className={`text-3xl text-center flex items-center justify-center gap-3 ${matchCancelled ? 'text-gray-400' : iWon ? 'text-green-400' : 'text-red-400'}`}>
              {matchCancelled ? (
                'Match Cancelled'
              ) : iWon ? (
                <><Trophy className="h-8 w-8" aria-hidden="true" /> VICTORY!</>
              ) : (
                <><Skull className="h-8 w-8" aria-hidden="true" /> DEFEAT</>
              )}
            </DialogTitle>
            <DialogDescription className="text-center text-gray-300">
              {matchCancelled
                ? 'This match was cancelled.'
                : `Final score. You: ${isP1 ? Number(match.player1Score) : Number(match.player2Score)} | Opponent: ${Number(opponentScore)}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button onClick={() => router.push('/leaderboard')} variant="outline" className="w-full sm:w-auto">
              Leaderboard
            </Button>
            <Button onClick={() => router.push('/pvp')} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white">
              Back to PvP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
