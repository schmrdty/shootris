'use client';

import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import { useGameTheme } from '@/lib/theme';
import Link from 'next/link';
import { Sprout, Zap, Sparkles } from 'lucide-react';
import { SET_LABELS, PIECE_KEYS, FREE_SETS } from '@/lib/skins';

export default function SettingsPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { connection, player } = useSpacetimeDB(address || null);
  const { theme, setTheme, isEarthen, appliedSkins, applySkins, clearSkins } = useGameTheme();
  const skinCount = PIECE_KEYS.filter((p) => appliedSkins[p]).length;

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

        <Card className="bg-black/80 border-green-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-green-400">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="theme-toggle" className="text-base flex items-center gap-2">
                  {isEarthen ? <Sprout className="h-4 w-4" aria-hidden="true" /> : <Zap className="h-4 w-4" aria-hidden="true" />}
                  {isEarthen ? 'Earthen (light)' : 'Neon (dark)'}
                </Label>
                <p className="text-sm text-gray-400">
                  Neon: lasers and glow in the dark. Earthen: moss, clay, and mycelium in the light.
                </p>
              </div>
              <Switch
                id="theme-toggle"
                checked={isEarthen}
                onCheckedChange={(on) => setTheme(on ? 'earthen' : 'neon')}
              />
            </div>
            <p className="text-xs text-gray-500">
              Current theme: {theme}. Saved on this device — no wallet needed.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/80 border-yellow-500/50">
          <CardHeader>
            <CardTitle className="text-xl text-yellow-400 flex items-center gap-2">
              <Sparkles className="h-5 w-5" aria-hidden="true" /> Card Art
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-800">
              <span className="text-xs text-gray-400 self-center">Free for everyone:</span>
              {FREE_SETS.map((set) => (
                <Button
                  key={set}
                  size="sm"
                  variant="outline"
                  onClick={() => applySkins(Object.fromEntries(PIECE_KEYS.map((p) => [p, set])))}
                >
                  {SET_LABELS[set]}
                </Button>
              ))}
            </div>
            {skinCount === 0 ? (
              <p className="text-sm text-gray-400">
                Using default piece art. Collect Shootris cards on vibe.market and they&apos;ll be
                offered here the next time you sign in.
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-300">
                  {skinCount} of {PIECE_KEYS.length} pieces are using your card art:
                </p>
                <div className="flex flex-wrap gap-2">
                  {PIECE_KEYS.filter((p) => appliedSkins[p]).map((p) => (
                    <span key={p} className="text-xs bg-gray-800/50 rounded px-2 py-1 text-yellow-400">
                      {p} · {SET_LABELS[appliedSkins[p]!]}
                    </span>
                  ))}
                </div>
                <Button variant="outline" onClick={clearSkins} className="w-full">
                  Reset to default art
                </Button>
              </>
            )}
          </CardContent>
        </Card>

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
