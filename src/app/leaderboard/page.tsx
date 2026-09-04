'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import { useAccount } from 'wagmi';
import type { SpLeaderboardEntry, PvpLeaderboard } from '@/spacetime_module_bindings';
import { Medal } from 'lucide-react';

export default function LeaderboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { connection } = useSpacetimeDB(address || null);
  const [spLeaderboard, setSpLeaderboard] = useState<SpLeaderboardEntry[]>([]);
  const [pvpLeaderboard, setPvpLeaderboard] = useState<PvpLeaderboard[]>([]);

  useEffect(() => {
    if (!connection) return;

    // Single-player leaderboard
    const spEntries: SpLeaderboardEntry[] = [];
    for (const entry of connection.db.spLeaderboard.iter()) {
      spEntries.push(entry);
    }
    // Already sorted by rank from server
    setSpLeaderboard(spEntries.slice(0, 20));

    // PvP leaderboard
    const pvpEntries: PvpLeaderboard[] = [];
    for (const entry of connection.db.pvpLeaderboard.iter()) {
      pvpEntries.push(entry);
    }
    // Sort by total wins descending
    pvpEntries.sort((a, b) => {
      const diff = Number(b.totalPvpWins) - Number(a.totalPvpWins);
      if (diff !== 0) return diff;
      return Number(b.totalPvpPlayed) - Number(a.totalPvpPlayed);
    });
    setPvpLeaderboard(pvpEntries.slice(0, 20));
  }, [connection]);

  const formatScore = (score: bigint): string => {
    return score.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-blue-950 px-4 py-8 pt-16">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            ← Back
          </Button>
          <h1 className="text-3xl font-bold neon-cyan">
            Leaderboards
          </h1>
        </div>

        <Tabs defaultValue="single-player" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-black/80">
            <TabsTrigger value="single-player">Single Player</TabsTrigger>
            <TabsTrigger value="pvp">PvP</TabsTrigger>
          </TabsList>

          <TabsContent value="single-player">
            <Card className="bg-black/80 border-cyan-500/50" style={{ boxShadow: '0 0 20px rgba(0, 240, 255, 0.2)' }}>
              <CardHeader>
                <CardTitle className="text-cyan-400">Top Scores</CardTitle>
              </CardHeader>
              <CardContent>
                {spLeaderboard.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 text-lg mb-4">No runs recorded yet.</p>
                    <p className="text-cyan-400">Play a game to claim the top spot!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {spLeaderboard.map((entry, index) => (
                      <div
                        key={entry.id.toString()}
                        className={`flex items-center gap-4 p-3 rounded transition-all ${
                          index < 3
                            ? 'bg-gradient-to-r from-cyan-900/30 to-transparent border border-cyan-500/30'
                            : 'bg-gray-900/30 hover:bg-gray-800/30'
                        }`}
                      >
                        <div className="w-12 text-center font-bold text-xl">
                          {index === 0 && <Medal className="h-8 w-8 text-yellow-400" aria-hidden="true" />}
                          {index === 1 && <Medal className="h-8 w-8 text-gray-300" aria-hidden="true" />}
                          {index === 2 && <Medal className="h-8 w-8 text-amber-600" aria-hidden="true" />}
                          {index > 2 && <span className="text-gray-500">#{entry.rank}</span>}
                        </div>
                        <div className="flex-1">
                          <p className="font-mono text-sm text-cyan-400">
                            {entry.wallet.slice(0, 6)}...{entry.wallet.slice(-4)}
                          </p>
                        </div>
                        <div className="flex gap-8 text-sm">
                          <div className="text-right">
                            <p className="text-gray-400 text-xs">Best Score</p>
                            <p className="text-cyan-400 font-bold text-lg">{formatScore(entry.bestScore)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-400 text-xs">Total Runs</p>
                            <p className="text-purple-400 font-bold">{entry.totalRuns.toString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pvp">
            <Card className="bg-black/80 border-purple-500/50" style={{ boxShadow: '0 0 20px rgba(176, 48, 255, 0.2)' }}>
              <CardHeader>
                <CardTitle className="text-purple-400">PvP Champions</CardTitle>
              </CardHeader>
              <CardContent>
                {pvpLeaderboard.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 text-lg mb-4">No PvP matches yet.</p>
                    <p className="text-purple-400">Challenge someone to be the first!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pvpLeaderboard.map((entry, index) => (
                      <div
                        key={entry.wallet}
                        className={`flex items-center gap-4 p-3 rounded transition-all ${
                          index < 3
                            ? 'bg-gradient-to-r from-purple-900/30 to-transparent border border-purple-500/30'
                            : 'bg-gray-900/30 hover:bg-gray-800/30'
                        }`}
                      >
                        <div className="w-12 text-center font-bold text-xl">
                          {index === 0 && <Medal className="h-8 w-8 text-yellow-400" aria-hidden="true" />}
                          {index === 1 && <Medal className="h-8 w-8 text-gray-300" aria-hidden="true" />}
                          {index === 2 && <Medal className="h-8 w-8 text-amber-600" aria-hidden="true" />}
                          {index > 2 && <span className="text-gray-500">#{index + 1}</span>}
                        </div>
                        <div className="flex-1">
                          <p className="font-mono text-sm text-purple-400">
                            {entry.wallet.slice(0, 6)}...{entry.wallet.slice(-4)}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="text-right">
                            <p className="text-gray-400 text-xs">Total Wins</p>
                            <p className="text-green-400 font-bold">{entry.totalPvpWins.toString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-400 text-xs">Floor Duel</p>
                            <p className="text-cyan-400 font-bold">{entry.floorDuelWins.toString()}/{entry.floorDuelPlayed.toString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-400 text-xs">Score Race</p>
                            <p className="text-yellow-400 font-bold">{entry.scoreRaceWins.toString()}/{entry.scoreRacePlayed.toString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
