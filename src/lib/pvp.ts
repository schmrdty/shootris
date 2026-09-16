'use client';

import { useEffect, useState } from 'react';

// Matches don't wait forever. The module's sweeper (sweep_matches in
// spacetime-server/spacetimedb/src/lib.rs) cancels an invite nobody joined
// and decides a match somebody walked away from, both after five minutes.
// These mirror it so players can see the clock instead of guessing.
export const MATCH_TIMEOUT_MS = 5 * 60 * 1000;
export const MATCH_TIMEOUT_LABEL = '5 minutes';

/** m:ss, never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Milliseconds left of a five-minute window that opened at `startedMs`. */
export function useTimeout(startedMs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedMs === null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedMs]);

  if (startedMs === null) return null;
  return Math.max(0, startedMs + MATCH_TIMEOUT_MS - now);
}
