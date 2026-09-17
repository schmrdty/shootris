'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import { createInitialGameState, spawnNewPiece, movePieceUp, movePieceLeft, movePieceRight, rotatePieceAction, hardLaunchUp, holdPiece, createBoardSnapshot, restoreFromSnapshot, getStage, getLevelInStage } from '@/lib/tetris/game-engine';
import { LEVELS_PER_STAGE, BOARD_HEIGHT } from '@/lib/tetris/types';
import { useGameTheme } from '@/lib/theme';
import type { GameState, BoardSnapshot } from '@/lib/tetris/types';
import { PAYOUT_SPLIT_ADDRESS, MYU_TOKEN_ADDRESS, MYU_DECIMALS, CONTINUE_PRICE_MYU, MYU_CONFIGURED } from '@/app/config/onchainkit';
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem';
import { useSendTransaction, useReadContract, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { InGameMusicControls } from '@/components/InGameMusicControls';
import { StageAmbience } from '@/components/StageAmbience';
import { useMusicPreference } from '@/lib/music';
import { MobileControls } from '@/components/MobileControls';
import { useTouchControls, useBoardCellSize, CONTROL_DECK_HEIGHT } from '@/hooks/useTouchControls';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { RunSaveStatus } from '@/components/RunSaveStatus';
import { Swap, SwapAmountInput, SwapToggleButton, SwapButton, SwapMessage, SwapToast } from '@coinbase/onchainkit/swap';
import { MYU_TOKEN, SWAP_FROM_TOKENS } from '@/app/config/onchainkit';
import { Infinity as InfinityIcon, Map as MapIcon, Award, Pause, Play } from 'lucide-react';
import { StageBreakCard, type StageBreak } from '@/components/StageBreakCard';

type PlayMode = 'free' | 'journey';

// Journey mode: each level must be cleared before its timer runs out;
// budgets shrink as levels climb.
const JOURNEY_BASE_TIME = 90;
const JOURNEY_MIN_TIME = 45;
const levelTimeBudget = (level: number) =>
  Math.max(JOURNEY_MIN_TIME, JOURNEY_BASE_TIME - 3 * (level - 1));

export default function SinglePlayerPage() {
  const router = useRouter();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { connection, player, bound, binding, retryBinding } = useSpacetimeDB(address || null);
  const persistMusic = useCallback(
    (on: boolean) => {
      if (connection && address) connection.reducers.setPlayerMusic(address.toLowerCase(), on);
    },
    [connection, address]
  );
  const [musicOn, setMusicOn] = useMusicPreference(player?.musicOn, persistMusic);
  // Phones and tablets: on-screen controls, board sized to fit above them
  const touch = useTouchControls();
  const cell = useBoardCellSize(touch, 220);
  // Deterministic first render (no random piece) so SSR and client match;
  // the mount effect spawns the real random state client-side.
  const [gameState, setGameState] = useState<GameState>(() => ({ ...createInitialGameState(), nextPiece: null }));
  const [runId, setRunId] = useState<bigint | null>(null);
  const [showContinueModal, setShowContinueModal] = useState(false);
  // One continue = one payment. The lock is a ref so a second tap in the same
  // frame is refused too; the state drives the disabled buttons.
  const payingRef = useRef(false);
  const [paying, setPaying] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<BoardSnapshot | null>(null);
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const [levelDeadline, setLevelDeadline] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [mintUnlocked, setMintUnlocked] = useState(false);
  // Three separate reasons the board can be still: the player asked for it,
  // a Journey stage break is waiting to be acknowledged, or a paid continue
  // is giving them a moment before pieces start moving again.
  const [userPaused, setUserPaused] = useState(false);
  const [stageBreak, setStageBreak] = useState<StageBreak | null>(null);
  const [grace, setGrace] = useState(false);
  const halted = userPaused || stageBreak !== null || grace;
  const boardRef = useRef<HTMLDivElement>(null);
  const gameOverRef = useRef(false);
  gameOverRef.current = gameState.gameOver;
  const scoreRef = useRef(gameState.score);
  scoreRef.current = gameState.score;
  const linesRef = useRef(gameState.lines);
  linesRef.current = gameState.lines;
  const gameLoopRef = useRef<number | null>(null);
  const { sendTransactionAsync } = useSendTransaction();
  const { isEarthen, cellStyle } = useGameTheme();

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

  const continuePrice = parseUnits(CONTINUE_PRICE_MYU, MYU_DECIMALS);
  const { data: myuBalance, refetch: refetchMyuBalance } = useReadContract({
    address: MYU_TOKEN_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address && MYU_CONFIGURED },
  });
  const hasEnoughMyu = (myuBalance ?? BigInt(0)) >= continuePrice;

  // The engine only moves pieces while isPaused is false, so keep that flag
  // in step with whichever reason is currently holding the board.
  useEffect(() => {
    setGameState((prev) => (prev.isPaused === halted ? prev : { ...prev, isPaused: halted }));
  }, [halted]);

  const pause = useCallback(() => {
    if (gameOverRef.current) return;
    setUserPaused(true);
  }, []);
  const resume = useCallback(() => setUserPaused(false), []);
  const togglePause = useCallback(() => {
    if (gameOverRef.current) return;
    setUserPaused((p) => !p);
  }, []);

  // Stage clear: Free Play gets a banner, Journey stops for a card the player
  // has to acknowledge (see StageBreakCard).
  const stage = getStage(gameState.level);
  const prevStageRef = useRef(stage);
  const [clearedStageBanner, setClearedStageBanner] = useState<number | null>(null);
  useEffect(() => {
    if (stage > prevStageRef.current) {
      const cleared = prevStageRef.current;
      prevStageRef.current = stage;
      if (mode === 'journey') {
        // Journey milestone: clearing a stage (100 lines) unlocks the NFT mint
        setMintUnlocked(true);
        setStageBreak({
          cleared,
          next: stage,
          bonus: 5000 * cleared,
          score: scoreRef.current,
          lines: linesRef.current,
        });
        return;
      }
      setClearedStageBanner(cleared);
      const t = setTimeout(() => setClearedStageBanner(null), 2500);
      return () => clearTimeout(t);
    }
    prevStageRef.current = stage;
  }, [stage, mode]);

  // Start a fresh run locally. The server-side run is created separately,
  // once the wallet is verified (see below).
  const startNewRun = useCallback(() => {
    setGameState(spawnNewPiece(createInitialGameState()));
    setLastSnapshot(null);
    setShowContinueModal(false);
    setMintUnlocked(false);
    setUserPaused(false);
    setStageBreak(null);
    setGrace(false);
    setRunId(null);
    setRunNonce((n) => n + 1);
  }, []);

  // Initialize the game once a mode is chosen, and track run IDs
  useEffect(() => {
    if (mode === null) return;
    startNewRun();
  }, [mode, startNewRun]);

  useEffect(() => {
    if (!connection || !address) return;
    const handleRunInsert = (_ctx: unknown, newRun: { runId: bigint; wallet: string }) => {
      if (newRun.wallet.toLowerCase() === address.toLowerCase()) {
        setRunId(newRun.runId);
      }
    };
    connection.db.gameRuns.onInsert(handleRunInsert);
    return () => {
      connection.db.gameRuns.removeOnInsert(handleRunInsert);
    };
  }, [connection, address]);

  // Create the run on the server. The module rejects writes from an
  // unverified wallet, so this waits for the binding instead of firing the
  // moment the socket connects — and still fires if verification (or the
  // wallet itself) only arrives mid-game.
  const startedForRunRef = useRef<number | null>(null);
  useEffect(() => {
    if (mode === null || !connection || !address || !bound) return;
    if (startedForRunRef.current === runNonce) return;
    startedForRunRef.current = runNonce;
    const emptyBoard = JSON.stringify(Array(20).fill(Array(10).fill(null)));
    connection.reducers.startSingleRun(address.toLowerCase(), emptyBoard, 1);
  }, [mode, connection, address, bound, runNonce]);

  // Journey level timer: a fresh budget on each new level (or new run), and
  // the clock genuinely stops while the board is held, rather than handing
  // out a full new budget on every resume.
  const frozenMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== 'journey') return;
    frozenMsRef.current = null;
    setLevelDeadline(Date.now() + levelTimeBudget(gameState.level) * 1000);
  }, [mode, gameState.level, runNonce]);

  useEffect(() => {
    if (mode !== 'journey') return;
    if (halted) {
      setLevelDeadline((deadline) => {
        if (deadline === null) return deadline;
        frozenMsRef.current = Math.max(0, deadline - Date.now());
        return null;
      });
    } else if (frozenMsRef.current !== null) {
      const remaining = frozenMsRef.current;
      frozenMsRef.current = null;
      setLevelDeadline(Date.now() + remaining);
    }
  }, [mode, halted]);

  useEffect(() => {
    if (mode !== 'journey' || levelDeadline === null || gameState.gameOver) return;
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, [mode, levelDeadline, gameState.gameOver]);

  useEffect(() => {
    if (mode !== 'journey' || levelDeadline === null || gameState.gameOver || halted) return;
    if (nowTick >= levelDeadline) {
      setGameState((prev) => ({ ...prev, gameOver: true }));
    }
  }, [mode, levelDeadline, nowTick, gameState.gameOver, halted]);

  const journeyMsLeft =
    mode !== 'journey' || gameState.gameOver
      ? null
      : levelDeadline !== null
        ? Math.max(0, levelDeadline - nowTick)
        : frozenMsRef.current;
  const journeyTimeLeft = journeyMsLeft === null ? null : Math.ceil(journeyMsLeft / 1000);

  // Game over: snapshot the board, record the score, and prompt to continue
  useEffect(() => {
    if (!gameState.gameOver || showContinueModal) return;
    setLastSnapshot(createBoardSnapshot(gameState));
    setShowContinueModal(true);
    // Persist the score now so it counts even if the player just leaves
    if (connection && runId) {
      connection.reducers.updateSingleRun(
        runId,
        BigInt(gameState.score),
        gameState.lines,
        gameState.level,
        JSON.stringify(gameState.board),
        true, // still active — the player may pay to continue
        false
      );
    }
  }, [gameState, showContinueModal, connection, runId]);

  // Game loop
  useEffect(() => {
    if (gameState.gameOver || gameState.isPaused) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
      return;
    }

    gameLoopRef.current = window.setInterval(() => {
      setGameState(prev => movePieceUp(prev));
    }, gameState.moveSpeed);

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [gameState.gameOver, gameState.isPaused, gameState.moveSpeed]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (gameState.gameOver) return;

      // P (or Escape) pauses and unpauses; nothing else reaches the board
      // while it is held.
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (halted) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          setGameState(prev => movePieceLeft(prev));
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          setGameState(prev => movePieceRight(prev));
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          setGameState(prev => movePieceUp(prev)); // forward one space
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          setGameState(prev => rotatePieceAction(prev));
          break;
        case ' ':
          e.preventDefault();
          setGameState(prev => hardLaunchUp(prev));
          break;
        case 'Shift':
        case 'c':
        case 'C':
          e.preventDefault();
          setGameState(prev => holdPiece(prev));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState.gameOver, halted, togglePause]);

  // Leaving the game pauses it: switching tab or window, and on desktop
  // clicking anywhere outside the board that is not itself a control.
  useEffect(() => {
    if (mode === null) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [mode, pause]);

  useEffect(() => {
    // Touch devices pause from the button in the header: on a phone every
    // tap outside the board is either the control deck or a scroll.
    if (touch || mode === null || halted || gameState.gameOver) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (boardRef.current?.contains(el)) return;
      // Buttons, links and dialogs are interactions in their own right
      if (el.closest('button, a, input, select, textarea, [role="dialog"]')) return;
      pause();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [touch, mode, halted, gameState.gameOver, pause]);

  const handlePayAndContinue = useCallback(async () => {
    if (!address || !lastSnapshot || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);

    try {
      // EOA wallets are often sitting on another network — MYU lives on Base
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      // Send CONTINUE_PRICE_MYU $MYU to the payout address
      const txHash = await sendTransactionAsync({
        to: MYU_TOKEN_ADDRESS as `0x${string}`,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [PAYOUT_SPLIT_ADDRESS as `0x${string}`, continuePrice],
        }),
        chainId: base.id,
      });

      // Record payment in SpacetimeDB (amount is whole $MYU tokens, in the legacy amount_cents field)
      if (connection && runId) {
        const amountMyu = BigInt(Math.round(Number(CONTINUE_PRICE_MYU)));
        connection.reducers.recordContinuePayment(address.toLowerCase(), runId, amountMyu, txHash);
      }
      refetchMyuBalance();

      // Restore from the snapshot, clearing the rows nearest the spawn area so the
      // revived run isn't an instant re-game-over, then spawn a fresh piece paused.
      const clearedBoard = lastSnapshot.board.map((row, y) =>
        y < 8 ? row.map(() => null) : [...row]
      );
      const restoredState = spawnNewPiece({
        ...gameState,
        ...restoreFromSnapshot(lastSnapshot),
        board: clearedBoard,
        currentPiece: null,
        isPaused: true,
      });
      setGrace(true);
      setUserPaused(false);
      setGameState(restoredState);
      setShowContinueModal(false);

      // Give grace period
      setTimeout(() => setGrace(false), 3000);
    } catch (error) {
      console.error('Payment failed:', error);
      alert('Payment failed. Please try again.');
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  }, [address, chainId, switchChainAsync, lastSnapshot, sendTransactionAsync, connection, runId, gameState, continuePrice, refetchMyuBalance]);

  const handleQuit = useCallback(() => {
    if (connection && runId) {
      const boardState = JSON.stringify(gameState.board);
      connection.reducers.updateSingleRun(
        runId,
        BigInt(gameState.score),
        gameState.lines,
        gameState.level,
        boardState,
        false, // active = false (game ended)
        false  // won = false (player quit)
      );
    }
    router.push('/');
  }, [connection, runId, gameState, router]);

  // Render board
  const renderBoard = () => {
    const board = gameState.board.map(row => [...row]);

    // Draw current piece
    if (gameState.currentPiece) {
      const piece = gameState.currentPiece;
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (piece.shape[y][x]) {
            const boardY = piece.position.y + y;
            const boardX = piece.position.x + x;
            if (boardY >= 0 && boardY < 20 && boardX >= 0 && boardX < 10) {
              board[boardY][boardX] = piece.color;
            }
          }
        }
      }
    }

    return board.slice().reverse().map((row, y) => (
      <div key={y} className="flex" style={{ height: `${cell}px` }}>
        {row.map((color, x) => (
          <div key={x} className="relative" style={cellStyle(color, cell)}>
            {/* Thin grid line */}
            <div className="absolute inset-0 border border-cyan-900/20" />
          </div>
        ))}
      </div>
    ));
  };

  // Touch controls run the same engine actions as the keyboard
  const touchAction = useCallback((action: (state: GameState) => GameState) => {
    setGameState((prev) => (prev.gameOver ? prev : action(prev)));
  }, []);

  const renderMiniPiece = (piece: GameState['heldPiece'], size: number, dim = false) =>
    piece ? (
      <div className="inline-block" style={{ opacity: dim ? 0.4 : 1 }}>
        {piece.shape.map((row, y) => (
          <div key={y} className="flex" style={{ height: `${size}px` }}>
            {row.map((c, x) => (
              <div key={x} style={cellStyle(c ? piece.color : null, size)} />
            ))}
          </div>
        ))}
      </div>
    ) : (
      <span className="text-[10px] text-gray-600">empty</span>
    );

  // Single-player is always available — no wallet required. Connecting a wallet
  // adds score persistence, leaderboards, and $MYU continues.

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-gray-950 via-black to-blue-950 px-4 ${touch ? 'pt-14' : 'py-8 pt-16'}`}
      style={touch ? { paddingBottom: CONTROL_DECK_HEIGHT + 8 } : undefined}
    >
      {/* Per-stage backdrop + music (files load as they're produced) */}
      <StageAmbience stage={stage} isEarthen={isEarthen} muted={!musicOn} />

      {/* In-Game Music Controls */}
      <InGameMusicControls musicOn={musicOn} onToggle={setMusicOn} />

      {/* Mode chooser — shown until the player picks how to play */}
      {mode === null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-lg bg-gray-900 border-purple-500 p-4 sm:p-6 space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-purple-400 text-center">Choose Your Game</h2>
            <button
              onClick={() => setMode('free')}
              className="w-full text-left rounded-lg border-2 border-cyan-500/60 hover:border-cyan-400 bg-black/60 p-4 transition-all"
            >
              <p className="font-bold text-cyan-400 flex items-center gap-2 text-base sm:text-lg">
                <InfinityIcon className="h-5 w-5" aria-hidden="true" /> Free Play
              </p>
              <p className="text-sm text-gray-300 mt-1">
                No timer, no pressure. The run only ends when there&apos;s no room left for pieces.
              </p>
            </button>
            <button
              onClick={() => setMode('journey')}
              className="w-full text-left rounded-lg border-2 border-yellow-500/60 hover:border-yellow-400 bg-black/60 p-4 transition-all"
            >
              <p className="font-bold text-yellow-400 flex items-center gap-2 text-base sm:text-lg">
                <MapIcon className="h-5 w-5" aria-hidden="true" /> Journey
              </p>
              <p className="text-sm text-gray-300 mt-1">
                Beat the clock through 10-line levels and 10-level stages, each one faster and
                shorter on time. Clear Stage 1 (100 lines) to unlock the collector&apos;s NFT mint.
              </p>
            </button>
            <Button variant="outline" onClick={() => router.push('/')} className="w-full">
              Back to Menu
            </Button>
          </Card>
        </div>
      )}

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Game Board */}
          <div className="flex-1">
            <Card className={`bg-black/80 border-purple-500/50 ${touch ? 'p-2' : 'p-4'}`}>
              <div className={`${touch ? 'mb-2' : 'mb-4'} flex justify-between items-center`}>
                <Button variant="outline" onClick={() => router.push('/')}>
                  ← Menu
                </Button>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-purple-400">SHOOTRIS</h2>
                  <p className="text-xs text-gray-400">
                    {mode === 'journey' ? 'Journey' : 'Free Play'} · Pieces Rise from Bottom
                  </p>
                  {/* Where you are in the run, without looking away from the
                      board. Phones get the same numbers in the strip below. */}
                  {!touch && (
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-cyan-200">
                      SCORE {gameState.score.toLocaleString()} · STAGE {stage} · LEVEL{' '}
                      {getLevelInStage(gameState.level)}/{LEVELS_PER_STAGE}
                    </p>
                  )}
                  {journeyTimeLeft !== null && (
                    <p className={`text-2xl font-black ${journeyTimeLeft <= 10 && !halted ? 'text-red-400' : 'text-yellow-400'}`}>
                      {journeyTimeLeft}s{halted ? ' (held)' : ''}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  aria-label={userPaused ? 'Resume' : 'Pause'}
                  disabled={mode === null || gameState.gameOver || stageBreak !== null}
                  onClick={togglePause}
                  className="w-20 border-cyan-500 text-cyan-300"
                >
                  {userPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>

              {/* Compact hold / stats / next strip — replaces the side panels on phones */}
              {touch && (
                <div className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded border border-gray-800 bg-black/60 px-2 py-1">
                  <div className="flex min-w-[52px] flex-col items-center">
                    <span className="text-[9px] font-bold text-yellow-400">HOLD</span>
                    {renderMiniPiece(gameState.heldPiece, 9, !gameState.canHold)}
                  </div>
                  <div className="grid grid-cols-3 text-center text-[11px] leading-tight">
                    <div>
                      <p className="text-gray-400">Score</p>
                      <p className="font-bold text-white">{gameState.score}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Lines</p>
                      <p className="font-bold text-white">{gameState.lines}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">S{stage} Lv</p>
                      <p className="font-bold text-yellow-400">{getLevelInStage(gameState.level)}/{LEVELS_PER_STAGE}</p>
                    </div>
                  </div>
                  <div className="flex min-w-[52px] flex-col items-center">
                    <span className="text-[9px] font-bold text-green-400">NEXT</span>
                    {renderMiniPiece(gameState.nextPiece, 9)}
                  </div>
                </div>
              )}
              {touch && (
                <RunSaveStatus
                  address={address}
                  bound={bound}
                  binding={binding}
                  retryBinding={retryBinding}
                  runId={runId}
                  compact
                />
              )}

              <div className="flex justify-center" ref={boardRef}>
                <div className="inline-block relative border-4 border-cyan-500 rounded" style={{ boxShadow: '0 0 20px rgba(0, 240, 255, 0.5), inset 0 0 20px rgba(0, 240, 255, 0.2)' }}>
                  {renderBoard()}
                  {animRows.map((y) => (
                    <div
                      key={`clear-${lastClearEventRef.current}-${y}`}
                      className={isEarthen ? 'line-clear-earthen' : 'line-clear-neon'}
                      style={{ top: `${(BOARD_HEIGHT - 1 - y) * cell}px`, height: `${cell}px` }}
                    />
                  ))}
                </div>
              </div>

              {/* Controls hint */}
              <div className="mt-4 p-3 bg-gray-900/50 rounded border border-gray-700 hidden md:block">
                <p className="text-xs text-gray-400 text-center">
                  <span className="font-bold text-purple-400">Controls:</span> ← → or A/D: Move | ↑ or W: Forward | ↓ or S: Rotate | Space: Shoot | Shift/C: Hold | P: Pause
                </p>
              </div>
            </Card>
          </div>

          {/* Stats Panel */}
          <div className="md:w-64 space-y-4">
            <Card className={`bg-black/80 border-blue-500/50 p-4 ${touch ? 'hidden' : ''}`}>
              <h3 className="text-lg font-bold text-blue-400 mb-3">Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Score:</span>
                  <span className="text-white font-bold">{gameState.score}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Lines:</span>
                  <span className="text-white font-bold">{gameState.lines}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Stage:</span>
                  <span className="text-yellow-400 font-bold">{stage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Level:</span>
                  <span className="text-white font-bold">{getLevelInStage(gameState.level)} / {LEVELS_PER_STAGE}</span>
                </div>
              </div>
              <RunSaveStatus
                address={address}
                bound={bound}
                binding={binding}
                retryBinding={retryBinding}
                runId={runId}
              />
            </Card>

            {/* Journey milestone: stage cleared → NFT mint unlocked */}
            {mintUnlocked && (
              <Card className="bg-black/80 border-yellow-500 p-4">
                <p className="font-bold text-yellow-400 flex items-center gap-2">
                  <Award className="h-5 w-5" aria-hidden="true" /> STAGE CONQUERED
                </p>
                <p className="text-sm text-gray-300 mt-1">
                  100 lines cleared. Collector&apos;s NFT mint unlocked.
                </p>
                {process.env.NEXT_PUBLIC_MILESTONE_NFT_URL ? (
                  <a href={process.env.NEXT_PUBLIC_MILESTONE_NFT_URL} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full mt-2 bg-yellow-600 hover:bg-yellow-700 text-white">Mint Your NFT</Button>
                  </a>
                ) : (
                  <p className="text-xs text-gray-500 mt-2">Mint page coming soon.</p>
                )}
              </Card>
            )}

            {/* Hold Piece */}
            <Card className={`bg-black/80 border-yellow-500/50 p-4 ${touch ? 'hidden' : ''}`}>
              <h3 className="text-lg font-bold text-yellow-400 mb-3">Hold (Shift/C)</h3>
              <div className="flex justify-center items-center" style={{ minHeight: '96px' }}>
                {gameState.heldPiece ? (
                  <div className="inline-block" style={{ opacity: gameState.canHold ? 1 : 0.4 }}>
                    {gameState.heldPiece.shape.map((row, y) => (
                      <div key={y} className="flex" style={{ height: '24px' }}>
                        {row.map((cell, x) => (
                          <div
                            key={x}
                            className="relative"
                            style={cellStyle(cell ? gameState.heldPiece!.color : null, 24)}
                          >
                            <div className="absolute inset-0 border border-cyan-900/20" />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-600 text-xs text-center">No piece held</div>
                )}
              </div>
            </Card>

            {/* Next Piece */}
            <Card className={`bg-black/80 border-green-500/50 p-4 ${touch ? 'hidden' : ''}`}>
              <h3 className="text-lg font-bold text-green-400 mb-3">Next Piece</h3>
              <div className="flex justify-center">
                {gameState.nextPiece && (
                  <div className="inline-block">
                    {gameState.nextPiece.shape.map((row, y) => (
                      <div key={y} className="flex" style={{ height: '24px' }}>
                        {row.map((cell, x) => (
                          <div
                            key={x}
                            className="relative"
                            style={cellStyle(cell ? gameState.nextPiece!.color : null, 24)}
                          >
                            <div className="absolute inset-0 border border-cyan-900/20" />
                          </div>
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

      {touch && mode !== null && (
        <MobileControls
          onLeft={() => touchAction(movePieceLeft)}
          onRight={() => touchAction(movePieceRight)}
          onForward={() => touchAction(movePieceUp)}
          onShoot={() => touchAction(hardLaunchUp)}
          onRotate={() => touchAction(rotatePieceAction)}
          onHold={() => touchAction(holdPiece)}
          canHold={gameState.canHold}
          disabled={gameState.gameOver || showContinueModal || halted}
        />
      )}

      {/* Journey stage break: acknowledged by the player, which starts the
          first level of the next stage. */}
      {stageBreak && (
        <StageBreakCard stageBreak={stageBreak} onStart={() => setStageBreak(null)} />
      )}

      {/* Paused */}
      {userPaused && mode !== null && !gameState.gameOver && !stageBreak && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={resume}
        >
          <Card
            className="w-full max-w-xs border-4 border-cyan-400 bg-gray-950 p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-3xl font-black tracking-widest text-cyan-300">PAUSED</p>
            <p className="mt-2 text-sm font-semibold text-gray-400">
              {mode === 'journey' ? 'The level timer is stopped too.' : 'Nothing is moving.'}
            </p>
            <Button
              onClick={resume}
              autoFocus
              className="mt-5 w-full bg-cyan-600 py-6 text-lg font-black text-white hover:bg-cyan-500"
            >
              Resume
            </Button>
            <Button variant="outline" onClick={handleQuit} className="mt-2 w-full">
              Quit to Menu
            </Button>
            {!touch && <p className="mt-3 text-xs text-gray-500">Press P to resume</p>}
          </Card>
        </div>
      )}

      {/* Stage clear banner */}
      {clearedStageBanner !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-black/80 border-4 border-yellow-400 rounded-lg px-10 py-6 shadow-[0_0_40px_rgba(250,204,21,0.7)]">
            <p className="text-4xl font-black text-yellow-300 neon-yellow tracking-wider text-center">STAGE {clearedStageBanner} CLEAR!</p>
            <p className="text-center text-cyan-300 font-bold mt-2">+{5000 * clearedStageBanner} BONUS · FRESH BOARD</p>
          </div>
        </div>
      )}

      {/* Continue Modal */}
      <Dialog
        open={showContinueModal}
        // Closing mid-payment would let the dialog reopen with a live Pay button
        onOpenChange={(open) => {
          if (!payingRef.current) setShowContinueModal(open);
        }}
      >
        <DialogContent className="bg-gray-900 border-purple-500 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl text-purple-400">Game Over!</DialogTitle>
            <DialogDescription className="text-gray-300">
              You scored {gameState.score} points and cleared {gameState.lines} lines.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {address ? (
              <p className="text-center text-white">
                Continue from just before you failed for <span className="text-green-400 font-bold">{Number(CONTINUE_PRICE_MYU).toLocaleString()} $MYU</span> on Base?
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-center text-gray-300">
                  Connect a wallet to use <span className="text-green-400 font-bold">$MYU</span> continues and save your scores.
                </p>
                <div className="flex justify-center">
                  <ConnectWalletButton className="rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 px-6 py-3 font-bold text-white hover:from-purple-500 hover:to-cyan-500" />
                </div>
              </div>
            )}
            {address && MYU_CONFIGURED && myuBalance !== undefined && (
              <p className="text-center text-sm text-gray-300">
                Your balance: <span className={hasEnoughMyu ? 'text-cyan-400 font-bold' : 'text-red-400 font-bold'}>
                  {Number(myuBalance) / 10 ** MYU_DECIMALS} $MYU
                </span>
              </p>
            )}
            {/* Not enough MYU? Swap for it right here in the modal */}
            {address && MYU_CONFIGURED && !hasEnoughMyu && (
              <div className="rounded-lg border border-cyan-500/40 p-2">
                <p className="text-center text-sm text-yellow-400 mb-1">
                  Not enough $MYU. Swap for it right here:
                </p>
                <Swap onSuccess={() => refetchMyuBalance()}>
                  <SwapAmountInput label="Sell" swappableTokens={SWAP_FROM_TOKENS} token={SWAP_FROM_TOKENS[0]} type="from" />
                  <SwapToggleButton />
                  <SwapAmountInput label="Buy" token={MYU_TOKEN} type="to" />
                  <SwapButton />
                  <SwapMessage />
                  <SwapToast />
                </Swap>
              </div>
            )}
            <p className="text-xs text-gray-400 text-center">
              All purchases are final. Completing payment implies acceptance of the Terms of Service.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleQuit} disabled={paying} className="w-full sm:w-auto">
              Quit
            </Button>
            <Button variant="outline" onClick={startNewRun} disabled={paying} className="w-full sm:w-auto border-purple-500 text-purple-400">
              New Game
            </Button>
            {address && (hasEnoughMyu || paying) && (
              <Button onClick={handlePayAndContinue} disabled={paying} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white">
                {paying ? 'Confirm in your wallet…' : `Pay ${Number(CONTINUE_PRICE_MYU).toLocaleString()} $MYU & Continue`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
