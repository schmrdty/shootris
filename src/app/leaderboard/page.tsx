'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import { useAccount } from 'wagmi';
import type { PvpLeaderboard } from '@/spacetime_module_bindings';
import { computeSpLeaderboard, useLiveTables, type SpLeaderRow } from '@/lib/spacetime/stats';
import { PlayerName } from '@/components/PlayerName';
import { Medal } from 'lucide-react';

const TOP_N = 20;

export default function LeaderboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { connection } = useSpacetimeDB(address || null);
  const version = useLiveTables(connection);
  const me = address?.toLowerCase() ?? null;

  const spRanked = useMemo(
    () => (connection ? computeSpLeaderboard(Array.from(connection.db.gameRuns.iter())) : []),
    // version is the change signal for the connection's live cache
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, version]
  );

  const pvpRanked = useMemo(() => {
    if (!connection) return [] as PvpLeaderboard[];
    return Array.from(connection.db.pvpLeaderboard.iter())
      .filter((e) => e.totalPvpPlayed > BigInt(0))
      .sort((a, b) => {
        if (a.totalPvpWins !== b.totalPvpWins) return a.totalPvpWins > b.totalPvpWins ? -1 : 1;
        if (a.totalPvpPlayed !== b.totalPvpPlayed) return a.totalPvpPlayed < b.totalPvpPlayed ? -1 : 1;
        return a.wallet.localeCompare(b.wallet);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, version]);

  const spTop = spRanked.slice(0, TOP_N);
  const mySpIndex = me ? spRanked.findIndex((r) => r.wallet === me) : -1;
  const pvpTop = pvpRanked.slice(0, TOP_N);
  const myPvpIndex = me ? pvpRanked.findIndex((r) => r.wallet.toLowerCase() === me) : -1;

  const formatScore = (score: bigint): string => {
    return score.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const rankBadge = (index: number) => (
    <div className="w-12 text-center font-bold text-xl shrink-0">
      {index === 0 && <Medal className="h-8 w-8 text-yellow-400 mx-auto" aria-hidden="true" />}
      {index === 1 && <Medal className="h-8 w-8 text-gray-300 mx-auto" aria-hidden="true" />}
      {index === 2 && <Medal className="h-8 w-8 text-amber-600 mx-auto" aria-hidden="true" />}
      {index > 2 && <span className="text-gray-500">#{index + 1}</span>}
    </div>
  );

  const spRow = (entry: SpLeaderRow, index: number) => (
    <div
      key={entry.wallet}
      className={`flex items-center gap-4 p-3 rounded transition-all ${
        entry.wallet === me
          ? 'bg-cyan-900/40 border border-cyan-400'
          : index < 3
            ? 'bg-gradient-to-r from-cyan-900/30 to-transparent border border-cyan-500/30'
            : 'bg-gray-900/30 hover:bg-gray-800/30'
      }`}
    >
      {rankBadge(index)}
      <div className="flex-1 min-w-0">
        <PlayerName wallet={entry.wallet} className="block truncate font-mono text-sm text-cyan-400" />
        {entry.wallet === me && <span className="text-xs text-cyan-200">You</span>}
      </div>
      <div className="flex gap-4 sm:gap-8 text-sm">
        <div className="text-right">
          <p className="text-gray-400 text-xs">Best Score</p>
          <p className="text-cyan-400 font-bold text-lg">{formatScore(entry.bestScore)}</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-gray-400 text-xs">Best Level</p>
          <p className="text-yellow-400 font-bold">{entry.bestLevel}</p>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-xs">Runs</p>
          <p className="text-purple-400 font-bold">{entry.runs}</p>
        </div>
      </div>
    </div>
  );

  const pvpRow = (entry: PvpLeaderboard, index: number) => {
    const isMe = entry.wallet.toLowerCase() === me;
    const lost = entry.totalPvpPlayed - entry.totalPvpWins;
    return (
      <div
        key={entry.wallet}
        className={`flex items-center gap-4 p-3 rounded transition-all ${
          isMe
            ? 'bg-purple-900/40 border border-purple-400'
            : index < 3
              ? 'bg-gradient-to-r from-purple-900/30 to-transparent border border-purple-500/30'
              : 'bg-gray-900/30 hover:bg-gray-800/30'
        }`}
      >
        {rankBadge(index)}
        <div className="flex-1 min-w-0">
          <PlayerName wallet={entry.wallet} className="block truncate font-mono text-sm text-purple-400" />
          {isMe && <span className="text-xs text-purple-200">You</span>}
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4 text-sm">
          <div className="text-right">
            <p className="text-gray-400 text-xs">W / L</p>
            <p className="font-bold">
              <span className="text-green-400">{entry.totalPvpWins.toString()}</span>
              <span className="text-gray-500"> / </span>
              <span className="text-red-400">{lost.toString()}</span>
            </p>
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
    );
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
                {spRanked.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 text-lg mb-4">No runs recorded yet.</p>
                    <p className="text-cyan-400">Play a game to claim the top spot!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {spTop.map(spRow)}
                    {mySpIndex >= TOP_N && (
                      <>
                        <p className="text-center text-gray-500 text-xs">…</p>
                        {spRow(spRanked[mySpIndex], mySpIndex)}
                      </>
                    )}
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
                {pvpRanked.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 text-lg mb-4">No PvP matches yet.</p>
                    <p className="text-purple-400">Challenge someone to be the first!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pvpTop.map(pvpRow)}
                    {myPvpIndex >= TOP_N && (
                      <>
                        <p className="text-center text-gray-500 text-xs">…</p>
                        {pvpRow(pvpRanked[myPvpIndex], myPvpIndex)}
                      </>
                    )}
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
