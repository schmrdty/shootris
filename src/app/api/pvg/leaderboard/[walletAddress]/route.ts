import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await context.params;
    
    // This endpoint would normally query SpacetimeDB via the client
    // For now, return mock data structure
    // In a real implementation, you'd fetch specific wallet stats from sp_leaderboard
    
    return NextResponse.json({
      wallet: walletAddress,
      rank: null,
      bestScore: 0,
      totalRuns: 0,
      message: 'Use SpacetimeDB client for real-time data'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch wallet stats' },
      { status: 500 }
    );
  }
}
