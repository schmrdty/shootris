'use client';

import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import Link from 'next/link';

export default function SettingsPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { connection, player } = useSpacetimeDB(address || null);

  const handleMusicToggle = (enabled: boolean) => {
    if (!connection || !address) return;
    connection.reducers.setPlayerMusic(address.toLowerCase(), enabled);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 px-4 py-8 pt-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            ← Back
          </Button>
          <h1 className="text-3xl font-bold text-purple-400">Settings</h1>
        </div>

        <Card className="bg-black/80 border-purple-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-purple-400">Audio Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="music-toggle" className="text-base">
                  Music
                </Label>
                <p className="text-sm text-gray-400">
                  Toggle chopped & screwed background music
                </p>
              </div>
              <Switch
                id="music-toggle"
                checked={player?.musicEnabled ?? true}
                onCheckedChange={handleMusicToggle}
                disabled={!address}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/80 border-blue-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-blue-400">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {address ? (
              <div>
                <Label className="text-sm text-gray-400">Connected Wallet</Label>
                <p className="font-mono text-purple-400 mt-1">
                  {address.slice(0, 10)}...{address.slice(-8)}
                </p>
                {player && (
                  <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Games Played:</span>
                      <span className="text-white font-bold">{player.totalGamesPlayed}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Games Won:</span>
                      <span className="text-green-400 font-bold">{player.totalGamesWon}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">PVP Duel Wins:</span>
                      <span className="text-purple-400 font-bold">{player.totalPvpDuelWins}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Time Trial Wins:</span>
                      <span className="text-blue-400 font-bold">{player.totalTimeTrialWins}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No wallet connected</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-black/80 border-gray-700/50">
          <CardHeader>
            <CardTitle className="text-xl text-gray-400">Legal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Link href="/terms" className="block">
              <Button variant="ghost" className="w-full justify-start text-purple-400 hover:text-purple-300">
                Terms of Service
              </Button>
            </Link>
            <p className="text-xs text-gray-500 pt-3 border-t border-gray-800">
              All purchases are final. Connecting a wallet and completing a payment implies acceptance of the Terms of Service.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
