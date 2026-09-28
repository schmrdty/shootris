import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/leaderboard';

// Public standings, no account needed.
//
//   GET /api/leaderboard          -> top 100 of each board
//   GET /api/leaderboard?limit=10 -> top 10
//
// Served from a 30 second cache, so a busy page or another app polling this
// does not hammer the database.

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const asked = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    const board = await getLeaderboard();
    return NextResponse.json(
      { updatedAt: board.updatedAt, solo: board.solo.slice(0, limit), pvp: board.pvp.slice(0, limit) },
      { headers: { 'Cache-Control': 'public, max-age=30', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error) {
    console.error('[leaderboard] read failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Leaderboard unavailable' }, { status: 503 });
  }
}
