'use client';

import { useEffect, useState } from 'react';

// Matches don't wait forever. The module's sweeper (sweep_matches in
// spacetime-server/spacetimedb/src/lib.rs) cancels a public match nobody
// joined and decides a match somebody walked away from, both after five
// minutes. An invite-code match stays open for 24 hours, since the friend it
// was sent to may play later. These mirror the module so players can see
// the clock instead of guessing.
export const MATCH_TIMEOUT_MS = 5 * 60 * 1000;
export const INVITE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const INVITE_TIMEOUT_LABEL = '24 hours';

/** m:ss, or h:mm:ss from an hour up. Never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Milliseconds left of a window (five minutes by default) that opened at `startedMs`. */
export function useTimeout(startedMs: number | null, windowMs: number = MATCH_TIMEOUT_MS): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedMs === null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedMs]);

  if (startedMs === null) return null;
  return Math.max(0, startedMs + windowMs - now);
}
