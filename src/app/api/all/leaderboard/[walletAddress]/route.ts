import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await context.params;
    
    // This endpoint would normally query SpacetimeDB via the client
    // For now, return mock data structure
    // In a real implementation, you'd aggregate stats from all modes for specific wallet
    
    return NextResponse.json({
      wallet: walletAddress,
      singlePlayer: {
        bestScore: 0,
        totalRuns: 0
      },
      floorDuel: {
        wins: 0,
        played: 0
      },
      scoreRace: {
        wins: 0,
        played: 0
      },
      message: 'Use SpacetimeDB client for real-time data'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch aggregated wallet stats' },
      { status: 500 }
    );
  }
}
