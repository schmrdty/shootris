'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Award } from 'lucide-react';

export interface StageBreak {
  /** The stage just finished. */
  cleared: number;
  /** The stage about to start. */
  next: number;
  /** Bonus awarded for clearing, already included in `score`. */
  bonus: number;
  /** Running total after the bonus. */
  score: number;
  /** Lines cleared so far this run. */
  lines: number;
}

const ROLL_MS = 1100;

/** Counts from `from` up to `to`, or jumps straight there if motion is off. */
function useRollingNumber(from: number, to: number): number {
  const [value, setValue] = useState(from);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || to <= from) {
      setValue(to);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / ROLL_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to]);

  return value;
}

/**
 * The break between Journey stages: what was just cleared, the score rolling
 * up to include the stage bonus, and what comes next. The run stays paused
 * until the player starts the next stage, so nobody comes back from a stage
 * clear to a board already in motion.
 */
export function StageBreakCard({ stageBreak, onStart }: { stageBreak: StageBreak; onStart: () => void }) {
  const { cleared, next, bonus, score, lines } = stageBreak;
  const rolling = useRollingNumber(Math.max(0, score - bonus), score);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm border-4 border-yellow-400 bg-gray-950 p-6 text-center shadow-[0_0_40px_rgba(250,204,21,0.6)]">
        <p className="flex items-center justify-center gap-2 text-2xl font-black tracking-wider text-yellow-300">
          <Award className="h-7 w-7" aria-hidden="true" /> STAGE {cleared} CLEAR
        </p>

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Score</p>
          <p className="font-mono text-5xl font-black tabular-nums text-white">
            {rolling.toLocaleString()}
          </p>
          <p className="mt-1 text-sm font-bold text-cyan-300">
            +{bonus.toLocaleString()} stage bonus
          </p>
          <p className="text-sm font-semibold text-gray-400">{lines.toLocaleString()} lines cleared</p>
        </div>

        <div className="mt-5 rounded-lg border border-purple-500/50 bg-purple-950/40 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-300">Next stage</p>
          <p className="text-2xl font-black text-purple-200">
            STAGE {next} &middot; LEVEL 1
          </p>
          <p className="mt-1 text-xs font-semibold text-gray-400">
            Fresh board, and the speed ramp starts over.
          </p>
        </div>

        <Button
          onClick={onStart}
          autoFocus
          className="mt-5 w-full bg-yellow-500 py-6 text-lg font-black text-black hover:bg-yellow-400"
        >
          Start Stage {next}
        </Button>
      </Card>
    </div>
  );
}
