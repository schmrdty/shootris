import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // This endpoint would normally query SpacetimeDB via the client
    // For now, return mock data structure
    // In a real implementation, you'd fetch from SpacetimeDB sp_leaderboard table
    
    return NextResponse.json({
      leaderboard: [],
      message: 'Use SpacetimeDB client for real-time leaderboard data'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
