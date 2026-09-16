'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { RotateCw, ArrowLeftRight } from 'lucide-react';
import { CONTROL_DECK_HEIGHT } from '@/hooks/useTouchControls';

/** Mirrors the keyboard: ←/→ move, ↑ forward one space, ↓ rotate, Space shoot, Shift hold. */
export interface MobileControlActions {
  onLeft: () => void;
  onRight: () => void;
  onForward: () => void;
  onRotate: () => void;
  onShoot: () => void;
  onHold: () => void;
}

interface MobileControlsProps extends MobileControlActions {
  disabled?: boolean;
  /** Dim the hold button when the piece can't be swapped right now. */
  canHold?: boolean;
  /** Off for the embedded build, which must not talk to a mini-app host. */
  haptics?: boolean;
}

// Held directions repeat like keyboard auto-repeat: one step at once, a
// short delay, then a steady rate.
const REPEAT_DELAY_MS = 170;
const REPEAT_RATE_MS = 60;
const DEAD_ZONE = 0.28; // fraction of the pad's half-width
const FLICK = 0.62; // how far down counts as a rotate flick

type StickDirection = 'left' | 'right' | 'forward' | null;

// Host haptics are opt-in and loaded lazily: importing the mini-app SDK
// starts its own postMessage channel to the parent frame, which the
// embeddable build (app/mini) must not do.
let hostHaptics = true;

function tick() {
  if (hostHaptics) {
    import('@farcaster/miniapp-sdk')
      .then(({ sdk }) => sdk.haptics.impactOccurred('light'))
      .catch(() => undefined);
  }
  // Vibration API covers Android browsers; skipped where unsupported
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8);
}

function Joystick({
  onLeft,
  onRight,
  onForward,
  onRotate,
  disabled,
}: Pick<MobileControlActions, 'onLeft' | 'onRight' | 'onForward' | 'onRotate'> & { disabled?: boolean }) {
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const dirRef = useRef<StickDirection>(null);
  const rotateArmed = useRef(true);
  const activePointer = useRef<number | null>(null);
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});
  const actions = useRef({ onLeft, onRight, onForward, onRotate });
  actions.current = { onLeft, onRight, onForward, onRotate };

  const stopRepeat = useCallback(() => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
    timers.current = {};
  }, []);

  const setDirection = useCallback(
    (dir: StickDirection) => {
      if (dir === dirRef.current) return;
      dirRef.current = dir;
      stopRepeat();
      if (!dir) return;
      const step = () => {
        if (dir === 'left') actions.current.onLeft();
        else if (dir === 'right') actions.current.onRight();
        else actions.current.onForward();
      };
      step();
      tick();
      timers.current.delay = setTimeout(() => {
        timers.current.repeat = setInterval(step, REPEAT_RATE_MS);
      }, REPEAT_DELAY_MS);
    },
    [stopRepeat]
  );

  const track = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = padRef.current!.getBoundingClientRect();
    const half = rect.width / 2;
    const nx = Math.max(-1, Math.min(1, (e.clientX - rect.left - half) / half));
    const ny = Math.max(-1, Math.min(1, (e.clientY - rect.top - half) / half));
    setKnob({ x: nx, y: ny });

    const horizontal = Math.abs(nx) >= Math.abs(ny);
    if (horizontal && Math.abs(nx) > DEAD_ZONE) setDirection(nx < 0 ? 'left' : 'right');
    else if (!horizontal && ny < -DEAD_ZONE) setDirection('forward');
    else setDirection(null);

    // Rotate fires once per downward flick and re-arms when the stick recentres
    if (!horizontal && ny > FLICK && rotateArmed.current) {
      rotateArmed.current = false;
      actions.current.onRotate();
      tick();
    } else if (ny < DEAD_ZONE) {
      rotateArmed.current = true;
    }
  };

  const release = useCallback(() => {
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    setDirection(null);
    rotateArmed.current = true;
  }, [setDirection]);

  useEffect(() => stopRepeat, [stopRepeat]);
  useEffect(() => {
    if (disabled) release();
  }, [disabled, release]);

  return (
    <div
      ref={padRef}
      role="application"
      aria-label="Joystick: left or right to move, up to move forward, flick down to rotate"
      className="relative h-36 w-36 shrink-0 rounded-2xl border-2 border-cyan-500/70 bg-gray-950 shadow-[inset_0_0_24px_rgba(0,240,255,0.18)] touch-none select-none"
      onPointerDown={(e) => {
        if (disabled) return;
        activePointer.current = e.pointerId;
        try {
          // Keep receiving moves when the thumb slides off the pad
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // capture unavailable (some webviews) — moves over the pad still work
        }
        track(e);
      }}
      onPointerMove={(e) => {
        if (!disabled && activePointer.current === e.pointerId) track(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-cyan-500/50">◀</span>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-cyan-500/50">▶</span>
      <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-cyan-500/50">▲</span>
      <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-cyan-500/50">ROTATE</span>
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 rounded-xl border-2 border-cyan-300 bg-cyan-500/30"
        style={{
          transform: `translate(calc(-50% + ${knob.x * 36}px), calc(-50% + ${knob.y * 36}px))`,
          transition: knob.x === 0 && knob.y === 0 ? 'transform 120ms ease-out' : undefined,
        }}
      />
    </div>
  );
}

/** Circle with axis lines that stop short of the centre, around a red dot. */
export function CrosshairIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <g stroke="currentColor" strokeWidth="4.5" strokeLinecap="round">
        <line x1="32" y1="4" x2="32" y2="22" />
        <line x1="32" y1="42" x2="32" y2="60" />
        <line x1="4" y1="32" x2="22" y2="32" />
        <line x1="42" y1="32" x2="60" y2="32" />
      </g>
      <circle cx="32" cy="32" r="4" fill="#ef4444" />
      <circle cx="32" cy="32" r="1.6" fill="#fff" />
    </svg>
  );
}

function PadButton({
  label,
  onPress,
  disabled,
  dim,
  className,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  dim?: boolean;
  className: string;
  children: ReactNode;
}) {
  const press = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault(); // act on touch-down: no click delay, no double fire
    if (disabled) return;
    onPress();
    tick();
  };

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={press}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex items-center justify-center rounded-full border-2 touch-none select-none transition-transform active:scale-90 disabled:opacity-40 ${dim ? 'opacity-50' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * On-screen controls for touch devices: joystick on the left (move, forward,
 * rotate flick), three buttons on the right (hold, rotate, shoot).
 */
export function MobileControls({
  onLeft,
  onRight,
  onForward,
  onRotate,
  onShoot,
  onHold,
  disabled,
  canHold = true,
  haptics = true,
}: MobileControlsProps) {
  hostHaptics = haptics;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-cyan-500/30 bg-black/90 px-4 pt-3 backdrop-blur"
      style={{ height: CONTROL_DECK_HEIGHT, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex h-full max-w-md items-center justify-between gap-3">
        <Joystick onLeft={onLeft} onRight={onRight} onForward={onForward} onRotate={onRotate} disabled={disabled} />

        <div className="grid grid-cols-2 grid-rows-2 items-center justify-items-center gap-2">
          <PadButton
            label="Hold or swap piece"
            onPress={onHold}
            disabled={disabled}
            dim={!canHold}
            className="col-start-1 row-start-1 h-14 w-14 border-yellow-400 bg-yellow-500/15 text-yellow-300"
          >
            <span className="flex flex-col items-center text-[10px] font-bold leading-tight">
              <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
              HOLD
            </span>
          </PadButton>
          <PadButton
            label="Rotate piece"
            onPress={onRotate}
            disabled={disabled}
            className="col-start-1 row-start-2 h-14 w-14 border-purple-400 bg-purple-500/15 text-purple-200"
          >
            <span className="flex flex-col items-center text-[10px] font-bold leading-tight">
              <RotateCw className="h-5 w-5" aria-hidden="true" />
              ROTATE
            </span>
          </PadButton>
          <PadButton
            label="Shoot piece"
            onPress={onShoot}
            disabled={disabled}
            className="col-start-2 row-span-2 row-start-1 h-24 w-24 border-gray-300 bg-gradient-to-br from-gray-100 to-gray-300 text-gray-900 shadow-[0_4px_16px_rgba(255,255,255,0.15)]"
          >
            <CrosshairIcon className="h-16 w-16" />
          </PadButton>
        </div>
      </div>
    </div>
  );
}
