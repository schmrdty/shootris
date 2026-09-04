'use client';

import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, Timer, Swords, BrickWall, Flag, Star, ChartColumn, Flame, CircleCheck } from 'lucide-react';

export default function PvPPage() {
  const router = useRouter();
  const { address } = useAccount();

  if (!address) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-black to-blue-950 pt-16">
        <Card className="p-8 bg-black/80 border-purple-500" style={{ boxShadow: '0 0 20px rgba(176, 48, 255, 0.3)' }}>
          <p className="text-white">Wallet required. Please connect to play PvP.</p>
          <Button onClick={() => router.push('/')} className="mt-4">
            Back to Menu
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-blue-950 px-4 py-8 pt-16">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            ← Back
          </Button>
          <h1 className="text-3xl font-bold neon-purple">
            PvP Modes
          </h1>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Floor Hit Duel */}
          <Card 
            className="bg-black/80 border-cyan-500/50 hover:border-cyan-500 transition-all cursor-pointer group"
            style={{ boxShadow: '0 0 20px rgba(0, 240, 255, 0.2)' }}
            onClick={() => router.push('/pvp/floor-duel')}
          >
            <CardHeader>
              <CardTitle className="text-cyan-400 group-hover:neon-cyan transition-all flex items-center gap-2">
                <Target className="h-5 w-5" aria-hidden="true" /> Floor Hit Duel
              </CardTitle>
              <CardDescription className="text-gray-400">
                First Blood Battle
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-gray-300 space-y-2">
                <p className="flex items-center gap-2"><Swords className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" /> Two players face off in real-time</p>
                <p className="flex items-center gap-2"><BrickWall className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" /> Break through obstacles and the center wall</p>
                <p className="flex items-center gap-2"><Target className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" /> First to hit opponent's floor wins</p>
                <p className="flex items-center gap-2"><Timer className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" /> Lose if you top out first</p>
              </div>
              <Button className="w-full bg-cyan-600 hover:bg-cyan-700" style={{ boxShadow: '0 0 10px rgba(0, 240, 255, 0.5)' }}>
                Challenge →
              </Button>
            </CardContent>
          </Card>

          {/* Score Race Time Trial */}
          <Card 
            className="bg-black/80 border-yellow-500/50 hover:border-yellow-500 transition-all cursor-pointer group"
            style={{ boxShadow: '0 0 20px rgba(250, 204, 21, 0.2)' }}
            onClick={() => router.push('/pvp/score-race')}
          >
            <CardHeader>
              <CardTitle className="text-yellow-400 group-hover:neon-yellow transition-all flex items-center gap-2">
                <Timer className="h-5 w-5" aria-hidden="true" /> Score Race Time Trial
              </CardTitle>
              <CardDescription className="text-gray-400">
                180-Second Sprint
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-gray-300 space-y-2">
                <p className="flex items-center gap-2"><Flag className="h-4 w-4 text-yellow-400 shrink-0" aria-hidden="true" /> Race against time and opponent</p>
                <p className="flex items-center gap-2"><Star className="h-4 w-4 text-yellow-400 shrink-0" aria-hidden="true" /> Highest score after 3 minutes wins</p>
                <p className="flex items-center gap-2"><ChartColumn className="h-4 w-4 text-yellow-400 shrink-0" aria-hidden="true" /> Clear lines for maximum points</p>
                <p className="flex items-center gap-2"><Flame className="h-4 w-4 text-yellow-400 shrink-0" aria-hidden="true" /> Strategy meets speed</p>
              </div>
              <Button className="w-full bg-yellow-600 hover:bg-yellow-700" style={{ boxShadow: '0 0 10px rgba(250, 204, 21, 0.5)' }}>
                Race →
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* How PvP Works */}
        <Card className="bg-black/80 border-purple-500/50" style={{ boxShadow: '0 0 20px rgba(176, 48, 255, 0.2)' }}>
          <CardHeader>
            <CardTitle className="text-purple-400">How PvP Works</CardTitle>
          </CardHeader>
          <CardContent className="text-gray-300 space-y-2">
            <p className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-green-400 shrink-0" aria-hidden="true" /> Create a new match or join an existing one</p>
            <p className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-green-400 shrink-0" aria-hidden="true" /> Wait for an opponent to join (shows in real-time)</p>
            <p className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-green-400 shrink-0" aria-hidden="true" /> Both players&apos; boards update live via SpacetimeDB</p>
            <p className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-green-400 shrink-0" aria-hidden="true" /> Winner is determined automatically by match rules</p>
            <p className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-green-400 shrink-0" aria-hidden="true" /> All stats tracked on the PvP Leaderboard</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
