import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await context.params;
    
    // This endpoint would normally query SpacetimeDB via the client
    // For now, return mock data structure
    // In a real implementation, you'd fetch Score Race stats for specific wallet
    
    return NextResponse.json({
      wallet: walletAddress,
      scoreRaceWins: 0,
      scoreRacePlayed: 0,
      message: 'Use SpacetimeDB client for real-time data'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch Score Race wallet stats' },
      { status: 500 }
    );
  }
}
