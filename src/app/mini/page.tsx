'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { BOARD_HEIGHT, BOARD_WIDTH } from '@/lib/tetris/types';
import { MobileControls, CrosshairIcon } from '@/components/MobileControls';
import { CONTROL_DECK_HEIGHT } from '@/hooks/useTouchControls';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

// Embeddable build of Shootris, served at /mini.
//
// Runs inside a sandboxed iframe in another application, so it is
// deliberately self-contained: no wallet, no SpacetimeDB, no account and no
// network calls. The embedding page owns identity and persistence; this
// build only reports what happened, by postMessage.
//
// Message API (full details in docs/mini-embed.md):
//   out: {type:'shootris:start'}
//        {type:'shootris:score', score, durationMs}   on game over
//   in:  {type:'host:pause'}   pause at once
//        {type:'host:resume'}  back to the pause screen, never auto-play

const BEST_SCORE_KEY = 'shootris_mini_best';
const SOUND_KEY = 'shootris_mini_sound';

type Phase = 'idle' | 'playing' | 'paused' | 'over';

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0; // storage is often partitioned or blocked inside an iframe
  }
}

function writeBest(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // fine — the run just isn't remembered on this device
  }
}

/** Fire-and-forget: never block on a parent that may not be listening. */
function report(message: Record<string, unknown>): void {
  try {
    if (typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  } catch {
    // no parent, or it rejected the message
  }
}

export default function MiniShootris() {
  const [gameState, setGameState] = useState<GameState>(() => ({ ...createInitialGameState(), nextPiece: null }));
  const [phase, setPhase] = useState<Phase>('idle');
  const [best, setBest] = useState(0);
  const [soundOn, setSoundOn] = useState(false); // muted until the player asks
  const [cell, setCell] = useState(16);
  const loopRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const reportedFor = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setBest(readBest());
    try {
      setSoundOn(localStorage.getItem(SOUND_KEY) === '1');
    } catch {
      // stays muted
    }
  }, []);

  // Fit the board to the frame: the container may be only ~360px wide, and
  // the control deck owns the bottom of the screen.
  useEffect(() => {
    const fit = () => {
      const byWidth = Math.floor((window.innerWidth - 24) / BOARD_WIDTH);
      const byHeight = Math.floor((window.innerHeight - CONTROL_DECK_HEIGHT - 96) / BOARD_HEIGHT);
      setCell(Math.max(10, Math.min(22, byWidth, byHeight)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const blip = useCallback(
    (frequency: number) => {
      if (!soundOn) return;
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        audioRef.current ??= new Ctor();
        const ctx = audioRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } catch {
        // audio unavailable in this frame
      }
    },
    [soundOn]
  );

  const startGame = useCallback(() => {
    setGameState(spawnNewPiece(createInitialGameState()));
    startedAt.current = Date.now();
    reportedFor.current = 0;
    setPhase('playing');
    report({ type: 'shootris:start' });
  }, []);

  const act = useCallback(
    (action: (state: GameState) => GameState) => {
      setPhase((p) => {
        if (p === 'playing') setGameState((prev) => (prev.gameOver ? prev : action(prev)));
        return p;
      });
    },
    []
  );

  // Game loop
  useEffect(() => {
    if (phase !== 'playing' || gameState.gameOver) {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
      return;
    }
    loopRef.current = window.setInterval(() => {
      setGameState((prev) => movePieceUp(prev));
    }, gameState.moveSpeed);
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, [phase, gameState.gameOver, gameState.moveSpeed]);

  // Game over: report once per run
  useEffect(() => {
    if (!gameState.gameOver || phase === 'over' || phase === 'idle') return;
    setPhase('over');
    if (reportedFor.current !== startedAt.current) {
      reportedFor.current = startedAt.current;
      report({
        type: 'shootris:score',
        score: Math.round(gameState.score),
        durationMs: Math.max(0, Date.now() - startedAt.current),
      });
    }
    if (gameState.score > best) {
      setBest(gameState.score);
      writeBest(gameState.score);
    }
    blip(160);
  }, [gameState.gameOver, gameState.score, phase, best, blip]);

  // Pause on background/blur, and when the embedding page says so: hiding
  // a container with display:none fires neither of the first two.
  useEffect(() => {
    const pause = () => setPhase((p) => (p === 'playing' ? 'paused' : p));
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    const onParentMessage = (e: MessageEvent) => {
      const type = (e.data as { type?: string } | null)?.type;
      if (type === 'host:pause') pause();
      // Resume returns to the pause screen; the player decides when to play
      if (type === 'host:resume') setPhase((p) => (p === 'playing' ? 'paused' : p));
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', pause);
    window.addEventListener('message', onParentMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', pause);
      window.removeEventListener('message', onParentMessage);
    };
  }, []);

  // Keyboard (desktop) — same mapping as the full game, plus P/Esc to pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault();
        setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p));
        return;
      }
      if (phase !== 'playing') {
        if (e.key === 'Enter' && phase !== 'over') startGame();
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          act(movePieceLeft);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          act(movePieceRight);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          act(movePieceUp);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          act(rotatePieceAction);
          break;
        case ' ':
          e.preventDefault();
          act(hardLaunchUp);
          blip(440);
          break;
        case 'Shift':
        case 'c':
        case 'C':
          e.preventDefault();
          act(holdPiece);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, act, startGame, blip]);

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      try {
        localStorage.setItem(SOUND_KEY, next ? '1' : '0');
      } catch {
        // preference just isn't remembered
      }
      return next;
    });
  };

  const board = gameState.board.map((row) => [...row]);
  if (gameState.currentPiece) {
    const piece = gameState.currentPiece;
    piece.shape.forEach((row, y) =>
      row.forEach((filled, x) => {
        if (!filled) return;
        const by = piece.position.y + y;
        const bx = piece.position.x + x;
        if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) board[by][bx] = piece.color;
      })
    );
  }

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center overflow-x-hidden bg-[#05060f] text-white"
      style={{ paddingBottom: CONTROL_DECK_HEIGHT + 8 }}
    >
      {/* Top bar: score, best, and the required controls */}
      <div className="flex w-full max-w-md items-center justify-between gap-2 px-3 py-2">
        <div className="text-xs leading-tight">
          <p className="font-bold text-cyan-300">
            {gameState.score}
            <span className="ml-2 font-normal text-gray-400">best {best}</span>
          </p>
          <p className="text-gray-500">lines {gameState.lines}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
            onClick={toggleSound}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-500/60 text-cyan-300"
          >
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            type="button"
            aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
            disabled={phase === 'idle' || phase === 'over'}
            onClick={() => setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p))}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-500/60 text-cyan-300 disabled:opacity-40"
          >
            {phase === 'paused' ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          <button
            type="button"
            aria-label="Restart"
            onClick={startGame}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-purple-500/60 text-purple-300"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="relative">
        <div className="inline-block rounded border-2 border-cyan-500/80" style={{ boxShadow: '0 0 16px rgba(0,240,255,0.35)' }}>
          {board
            .slice()
            .reverse()
            .map((row, y) => (
              <div key={y} className="flex" style={{ height: cell }}>
                {row.map((color, x) => (
                  <div
                    key={x}
                    style={{
                      width: cell,
                      height: cell,
                      backgroundColor: color ?? '#0a0e27',
                      boxShadow: color ? 'inset 0 0 4px rgba(255,255,255,0.35)' : undefined,
                      border: '1px solid rgba(0,240,255,0.08)',
                    }}
                  />
                ))}
              </div>
            ))}
        </div>

        {/* In-page panels — the sandbox blocks alert/confirm/prompt */}
        {phase !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded bg-black/85 px-4 text-center">
            {phase === 'idle' && (
              <>
                <CrosshairIcon className="h-10 w-10 text-cyan-300" />
                <p className="text-lg font-black tracking-wide text-cyan-300">SHOOTRIS</p>
                <p className="text-xs text-gray-300">Pieces rise from the bottom. Shoot them into place and clear lines.</p>
              </>
            )}
            {phase === 'paused' && <p className="text-lg font-black text-yellow-300">PAUSED</p>}
            {phase === 'over' && (
              <>
                <p className="text-lg font-black text-purple-300">GAME OVER</p>
                <p className="text-sm text-white">
                  {gameState.score} points · {gameState.lines} lines
                </p>
                {gameState.score >= best && best > 0 && <p className="text-xs text-yellow-300">New best!</p>}
              </>
            )}
            <button
              type="button"
              onClick={() => (phase === 'paused' ? setPhase('playing') : startGame())}
              className="mt-1 min-h-11 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 px-6 py-2 font-bold text-white"
            >
              {phase === 'idle' ? 'Tap to play' : phase === 'paused' ? 'Resume' : 'Play again'}
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 hidden px-3 text-center text-[11px] text-gray-500 sm:block">
        ← → move · ↑ forward · ↓ rotate · Space shoot · C hold · P pause
      </p>

      <MobileControls
        onLeft={() => act(movePieceLeft)}
        onRight={() => act(movePieceRight)}
        onForward={() => act(movePieceUp)}
        onRotate={() => act(rotatePieceAction)}
        onShoot={() => {
          act(hardLaunchUp);
          blip(440);
        }}
        onHold={() => act(holdPiece)}
        canHold={gameState.canHold}
        disabled={phase !== 'playing'}
        haptics={false}
      />
    </div>
  );
}
