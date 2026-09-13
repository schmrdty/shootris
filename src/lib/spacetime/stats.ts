'use client';

import { useEffect, useMemo, useState } from 'react';
import type * as moduleBindings from '@/spacetime_module_bindings';
import { LEVELS_PER_STAGE } from '@/lib/tetris/types';

type DbConnection = moduleBindings.DbConnection;
type GameRun = moduleBindings.GameRun;
type PvpMatch = moduleBindings.PvpMatch;

/**
 * Re-render when any row in game_runs, pvp_matches or pvp_leaderboard changes.
 * Subscription rows arrive as a burst of inserts, so bumps are coalesced.
 */
export function useLiveTables(connection: DbConnection | null): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!connection) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setVersion((v) => v + 1);
      }, 100);
    };

    const { gameRuns, pvpMatches, pvpLeaderboard } = connection.db;
    gameRuns.onInsert(bump);
    gameRuns.onUpdate(bump);
    gameRuns.onDelete(bump);
    pvpMatches.onInsert(bump);
    pvpMatches.onUpdate(bump);
    pvpMatches.onDelete(bump);
    pvpLeaderboard.onInsert(bump);
    pvpLeaderboard.onUpdate(bump);
    pvpLeaderboard.onDelete(bump);
    bump(); // pick up rows already in the cache

    return () => {
      if (timer) clearTimeout(timer);
      gameRuns.removeOnInsert(bump);
      gameRuns.removeOnUpdate(bump);
      gameRuns.removeOnDelete(bump);
      pvpMatches.removeOnInsert(bump);
      pvpMatches.removeOnUpdate(bump);
      pvpMatches.removeOnDelete(bump);
      pvpLeaderboard.removeOnInsert(bump);
      pvpLeaderboard.removeOnUpdate(bump);
      pvpLeaderboard.removeOnDelete(bump);
    };
  }, [connection]);

  return version;
}

/** A single-player run counts as won once it clears its first stage. */
export function runWon(run: Pick<GameRun, 'levelReached'>): boolean {
  return run.levelReached > LEVELS_PER_STAGE;
}

export interface PlayerStats {
  played: number;
  won: number;
  lost: number;
  inProgress: number;
  singlePlayer: { runs: number; stagesCleared: number; bestScore: bigint; bestLevel: number };
  pvp: { played: number; won: number; lost: number };
}

/**
 * Pure: derive a wallet's record from its runs and matches.
 * - Single player: a run is won if it cleared a stage. The wallet's newest
 *   run is "in progress" while still active (the player may pay to
 *   continue); any other run is finished, since starting a new run retires
 *   the old one.
 * - PvP: only completed matches count; the winner is recorded by the server.
 */
export function computePlayerStats(wallet: string, runs: GameRun[], matches: PvpMatch[]): PlayerStats {
  const w = wallet.toLowerCase();

  const mine = runs.filter((r) => r.wallet.toLowerCase() === w);
  const newestRunId = mine.reduce<bigint | null>((max, r) => (max === null || r.runId > max ? r.runId : max), null);
  let spWon = 0;
  let spInProgress = 0;
  let bestScore = BigInt(0);
  let bestLevel = 0;
  let stagesCleared = 0;
  for (const r of mine) {
    if (r.score > bestScore) bestScore = r.score;
    if (r.levelReached > bestLevel) bestLevel = r.levelReached;
    stagesCleared += Math.floor((r.levelReached - 1) / LEVELS_PER_STAGE);
    if (runWon(r)) spWon++;
    else if (r.active && r.runId === newestRunId) spInProgress++;
  }

  let pvpPlayed = 0;
  let pvpWon = 0;
  for (const m of matches) {
    if (m.status.tag !== 'Completed') continue;
    const inMatch = m.player1Wallet.toLowerCase() === w || m.player2Wallet?.toLowerCase() === w;
    if (!inMatch) continue;
    pvpPlayed++;
    if (m.winnerWallet?.toLowerCase() === w) pvpWon++;
  }

  const spRuns = mine.length;
  const played = spRuns + pvpPlayed;
  const won = spWon + pvpWon;
  return {
    played,
    won,
    lost: Math.max(0, played - won - spInProgress),
    inProgress: spInProgress,
    singlePlayer: { runs: spRuns, stagesCleared, bestScore, bestLevel },
    pvp: { played: pvpPlayed, won: pvpWon, lost: pvpPlayed - pvpWon },
  };
}

export function usePlayerStats(connection: DbConnection | null, wallet: string | null): PlayerStats | null {
  const version = useLiveTables(connection);
  return useMemo(() => {
    if (!connection || !wallet) return null;
    return computePlayerStats(
      wallet,
      Array.from(connection.db.gameRuns.iter()),
      Array.from(connection.db.pvpMatches.iter())
    );
    // version is the change signal for the connection's live cache
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, wallet, version]);
}

export interface SpLeaderRow {
  wallet: string;
  bestScore: bigint;
  bestLevel: number;
  bestLines: number;
  runs: number;
}

/**
 * Pure: best single-player score per wallet, ranked. Built from game_runs
 * directly so it is always current (the sp_leaderboard table is a snapshot
 * that only refreshes when rebuild_leaderboard is called).
 */
export function computeSpLeaderboard(runs: GameRun[]): SpLeaderRow[] {
  const byWallet = new Map<string, SpLeaderRow>();
  for (const r of runs) {
    const w = r.wallet.toLowerCase();
    const row = byWallet.get(w) ?? { wallet: w, bestScore: BigInt(0), bestLevel: 0, bestLines: 0, runs: 0 };
    row.runs++;
    if (r.score > row.bestScore) row.bestScore = r.score;
    if (r.levelReached > row.bestLevel) row.bestLevel = r.levelReached;
    if (r.linesCleared > row.bestLines) row.bestLines = r.linesCleared;
    byWallet.set(w, row);
  }
  return Array.from(byWallet.values())
    .filter((row) => row.bestScore > BigInt(0))
    .sort((a, b) => {
      if (a.bestScore !== b.bestScore) return a.bestScore > b.bestScore ? -1 : 1;
      if (a.bestLines !== b.bestLines) return b.bestLines - a.bestLines;
      return a.wallet.localeCompare(b.wallet);
    });
}
