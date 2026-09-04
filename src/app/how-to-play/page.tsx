'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HowToPlayPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 px-4 py-8 pt-16">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            ← Back
          </Button>
          <h1 className="text-3xl font-bold text-purple-400">How to Play</h1>
        </div>

        <Card className="bg-black/80 border-purple-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-purple-400">Inverted Tetris Basics</CardTitle>
            <CardDescription>Classic Tetris, but pieces rise from the bottom</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-bold text-white mb-2">Gameplay:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Tetrominoes spawn at the <span className="text-purple-400 font-bold">bottom</span> of the board</li>
                <li>Pieces automatically move <span className="text-purple-400 font-bold">upward</span> toward the top</li>
                <li>Complete horizontal lines to clear them and score points</li>
                <li>Game ends when a new piece cannot spawn at the bottom</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-white mb-2">Desktop Controls:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><kbd className="px-2 py-1 bg-gray-800 rounded">← →</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded">A D</kbd>: Move piece left/right</li>
                <li><kbd className="px-2 py-1 bg-gray-800 rounded">↓</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded">S</kbd>: Rotate piece</li>
                <li><kbd className="px-2 py-1 bg-gray-800 rounded">↑</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded">W</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded">Space</kbd>: Shoot the tetromino (instant launch to the top)</li>
                <li><kbd className="px-2 py-1 bg-gray-800 rounded">Shift</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded">C</kbd>: Hold piece</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-white mb-2">Difficulty Curve:</h3>
              <p className="text-sm">
                Every <span className="text-yellow-400 font-bold">10 lines</span> cleared = 1 level, and every{' '}
                <span className="text-yellow-400 font-bold">25 levels</span> = 1 stage. Piece speed ramps up each level
                and resets at the start of each stage — clearing a stage grants a{' '}
                <span className="text-cyan-400 font-bold">score bonus and a fresh board</span>.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/80 border-blue-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-blue-400">PVP: Floor Hit Duel</CardTitle>
            <CardDescription>Break through and hit opponent's floor</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-bold text-white mb-2">How It Works:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Two boards stacked vertically with a <span className="text-blue-400 font-bold">shared obstacle band</span> in the middle</li>
                <li>Each player's pieces spawn at their own floor and rise toward the middle</li>
                <li>Clear lines that touch the obstacle band to remove shared obstacles</li>
                <li>Break through the obstacle band to reach opponent's side</li>
                <li><span className="text-green-400 font-bold">Win condition:</span> Get your tetromino to hit and lock on opponent's floor</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/80 border-green-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-green-400">PVP: Time-Trial</CardTitle>
            <CardDescription>Last to lose wins</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-bold text-white mb-2">How It Works:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Two players each have their own independent board</li>
                <li>Both start simultaneously with identical piece sequences</li>
                <li>No board interaction - pure survival skills</li>
                <li>When a player tops out, their survival time is recorded</li>
                <li><span className="text-green-400 font-bold">Win condition:</span> Survive longer than your opponent</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/80 border-yellow-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-yellow-400">$MYU Continue</CardTitle>
            <CardDescription>Spend $MYU to continue your run</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-bold text-white mb-2">How It Works:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>When you lose in single-player mode, you can spend <span className="text-yellow-400 font-bold">$MYU</span> on Base to continue</li>
                <li>No $MYU? Swap ETH or other tokens you hold for $MYU right inside the game</li>
                <li>Transaction sends $MYU to the payout address and records payment in SpacetimeDB</li>
                <li>Game restores from snapshot just before you lost</li>
                <li>You get a <span className="text-green-400 font-bold">3-second grace period</span> to stabilize</li>
                <li>Only <span className="text-red-400">one continue per run</span> by default</li>
              </ul>
            </div>

            <p className="text-xs text-gray-500 border-t border-gray-700 pt-3 mt-3">
              All purchases are final. Connecting a wallet and completing a payment implies acceptance of the Terms of Service.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
