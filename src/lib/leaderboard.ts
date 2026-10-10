// Public, read-only leaderboard data, read from SpacetimeDB on the server.
//
// The in-app leaderboard subscribes to the database directly, which needs a
// websocket and a browser. This is the flat version: anyone can fetch it,
// including D3MYUR or anything else that wants the standings, without an
// account and without the SpacetimeDB dashboard (which is not public).
//
// Reads run as an anonymous identity minted here and kept in memory, so the
// owner token never touches a public endpoint. Every table it reads is
// already public.

import { sql } from '@/lib/spacetimeSql';

const CACHE_TTL_MS = 30_000;

export interface SoloRow {
  rank: number;
  wallet: string;
  bestScore: number;
  bestLines: number;
  bestLevel: number;
  runs: number;
}

export interface PvpRow {
  rank: number;
  wallet: string;
  wins: number;
  played: number;
  floorDuelWins: number;
  scoreRaceWins: number;
}

export interface Leaderboard {
  updatedAt: string;
  solo: SoloRow[];
  pvp: PvpRow[];
}

let cached: { data: Leaderboard; at: number } | null = null;

// u64 columns can arrive as a number or a string depending on size
function num(cell: unknown): number {
  return typeof cell === 'number' ? cell : Number(cell ?? 0);
}

export async function getLeaderboard(): Promise<Leaderboard> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const [runRows, pvpRows] = await Promise.all([
    sql('SELECT wallet, score, lines_cleared, level_reached FROM game_runs'),
    sql(
      'SELECT wallet, total_pvp_wins, total_pvp_played, floor_duel_wins, score_race_wins FROM pvp_leaderboard'
    ),
  ]);

  const byWallet = new Map<string, SoloRow>();
  for (const row of runRows) {
    const wallet = String(row[0] ?? '').toLowerCase();
    if (!wallet) continue;
    const entry =
      byWallet.get(wallet) ??
      { rank: 0, wallet, bestScore: 0, bestLines: 0, bestLevel: 0, runs: 0 };
    entry.runs += 1;
    entry.bestScore = Math.max(entry.bestScore, num(row[1]));
    entry.bestLines = Math.max(entry.bestLines, num(row[2]));
    entry.bestLevel = Math.max(entry.bestLevel, num(row[3]));
    byWallet.set(wallet, entry);
  }

  const solo = [...byWallet.values()]
    .filter((row) => row.bestScore > 0)
    .sort((a, b) => b.bestScore - a.bestScore || b.bestLines - a.bestLines || a.wallet.localeCompare(b.wallet))
    .map((row, i) => ({ ...row, rank: i + 1 }));

  // Ties go to the player who needed fewer matches, as in the in-app board
  const pvp = pvpRows
    .map((row) => ({
      rank: 0,
      wallet: String(row[0] ?? '').toLowerCase(),
      wins: num(row[1]),
      played: num(row[2]),
      floorDuelWins: num(row[3]),
      scoreRaceWins: num(row[4]),
    }))
    .filter((row) => row.wallet && row.played > 0)
    .sort((a, b) => b.wins - a.wins || a.played - b.played || a.wallet.localeCompare(b.wallet))
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const data: Leaderboard = { updatedAt: new Date().toISOString(), solo, pvp };
  cached = { data, at: Date.now() };
  return data;
}
