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
import { useCollection } from '@/lib/collection';
import { useCallback } from 'react';
import { useMusicPreference } from '@/lib/music';
import { usePlayerStats } from '@/lib/spacetime/stats';
import { PlayerName } from '@/components/PlayerName';
import { ExternalLink } from '@/components/ExternalLink';
import { SHOOTRIS_CARDS } from '@/app/config/onchainkit';

export default function SettingsPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { connection, player } = useSpacetimeDB(address || null);
  const { theme, setTheme, isEarthen, appliedSkins, applySkins, clearSkins } = useGameTheme();
  const { setProgress, unlockedSets, loading: collectionLoading } = useCollection();

  const stats = usePlayerStats(connection, address ?? null);
  const persistMusic = useCallback(
    (on: boolean) => {
      if (connection && address) connection.reducers.setPlayerMusic(address.toLowerCase(), on);
    },
    [connection, address]
  );
  const [musicOn, setMusicOn] = useMusicPreference(player?.musicOn, persistMusic);

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
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-300">
              Collect all 7 cards of a set on vibe.market to unlock it in game. Collect all 28 to
              unlock every set.
            </p>
            <div className="flex flex-wrap gap-3 text-sm font-bold">
              <ExternalLink href={SHOOTRIS_CARDS.vibeMarketUrl} className="text-yellow-300 underline hover:text-yellow-200">
                Packs on vibe.market
              </ExternalLink>
              <ExternalLink href={SHOOTRIS_CARDS.openSeaUrl} className="text-cyan-300 underline hover:text-cyan-200">
                Cards on OpenSea
              </ExternalLink>
            </div>

            {!address ? (
              <p className="text-sm text-yellow-400">
                Connect the wallet that holds your Shootris cards to see your progress.
              </p>
            ) : collectionLoading ? (
              <p className="text-sm text-gray-400">Checking your cards…</p>
            ) : null}

            <div className="space-y-2">
              {setProgress.map((p) => (
                <div key={p.set} className="flex items-center justify-between gap-3 rounded border border-gray-800 p-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{SET_LABELS[p.set]}</p>
                    <p className="text-xs text-gray-400">
                      {p.held.length}/{p.total}
                      {p.held.length > 0 && p.held.length < p.total && ` — have ${p.held.join(' ')}`}
                    </p>
                  </div>
                  {p.complete ? (
                    <Button
                      size="sm"
                      onClick={() => applySkins(Object.fromEntries(PIECE_KEYS.map((k) => [k, p.set])))}
                      className="bg-yellow-600 hover:bg-yellow-700 shrink-0"
                    >
                      Use
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-500 shrink-0">Locked</span>
                  )}
                </div>
              ))}

              {FREE_SETS.map((set) => (
                <div key={set} className="flex items-center justify-between gap-3 rounded border border-gray-800 p-2">
                  <div>
                    <p className="text-sm font-bold text-white">{SET_LABELS[set]}</p>
                    <p className="text-xs text-gray-400">Free for every player</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applySkins(Object.fromEntries(PIECE_KEYS.map((k) => [k, set])))}
                    className="shrink-0"
                  >
                    Use
                  </Button>
                </div>
              ))}
            </div>

            {PIECE_KEYS.some((k) => appliedSkins[k] && unlockedSets.includes(appliedSkins[k]!)) && (
              <Button variant="outline" onClick={clearSkins} className="w-full">
                Reset to default art
              </Button>
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
                  Stage music. Saved on this device, and to your profile when a wallet is connected.
                </p>
              </div>
              <Switch id="music-toggle" checked={musicOn} onCheckedChange={setMusicOn} />
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
                <p className="mt-1 text-purple-400">
                  <PlayerName wallet={address} className="font-bold" />
                </p>
                <p className="font-mono text-xs text-gray-500 break-all">{address}</p>
                {stats ? (
                  <div className="mt-4 pt-4 border-t border-gray-700 space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded border border-gray-800 p-2">
                        <p className="text-2xl font-bold text-white">{stats.played}</p>
                        <p className="text-xs text-gray-400">Played</p>
                      </div>
                      <div className="rounded border border-gray-800 p-2">
                        <p className="text-2xl font-bold text-green-400">{stats.won}</p>
                        <p className="text-xs text-gray-400">Won</p>
                      </div>
                      <div className="rounded border border-gray-800 p-2">
                        <p className="text-2xl font-bold text-red-400">{stats.lost}</p>
                        <p className="text-xs text-gray-400">Lost</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Single-player runs</span>
                        <span className="text-white font-bold">{stats.singlePlayer.runs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Stages cleared</span>
                        <span className="text-yellow-400 font-bold">{stats.singlePlayer.stagesCleared}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Best score</span>
                        <span className="text-cyan-400 font-bold">{stats.singlePlayer.bestScore.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">PvP won / lost</span>
                        <span className="font-bold">
                          <span className="text-green-400">{stats.pvp.won}</span>
                          <span className="text-gray-500"> / </span>
                          <span className="text-red-400">{stats.pvp.lost}</span>
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      A single-player run counts as a win once it clears a stage (10 levels).
                      {stats.inProgress > 0 && ' Your latest run is still open, so it is not counted as a loss yet.'}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-gray-500">Loading your stats…</p>
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
