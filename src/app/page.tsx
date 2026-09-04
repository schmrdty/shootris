'use client'
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { sdk } from '@farcaster/miniapp-sdk';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import { useAddMiniApp } from "@/hooks/useAddMiniApp";
import { useQuickAuth } from "@/hooks/useQuickAuth";
import { useIsInFarcaster } from "@/hooks/useIsInFarcaster";
import { WalletConnect } from '@/components/wallet-connect';
import { ShareOnFarcaster } from '@/components/ShareOnFarcaster';
import { ChevronsUp, Gamepad2, Swords, Trophy, Settings, BookOpen, TriangleAlert } from 'lucide-react';

export default function Home() {
  const { address, status } = useAccount();
  const [farcasterUsername, setFarcasterUsername] = useState<string | null>(null);
  const { connected: dbConnected, player } = useSpacetimeDB(address || null);
    const { addMiniApp } = useAddMiniApp();
    const isInFarcaster = useIsInFarcaster()
    useQuickAuth(isInFarcaster)
    useEffect(() => {
      const tryAddMiniApp = async () => {
        try {
          await addMiniApp()
        } catch (error) {
          // warn, not error: always fails outside a Farcaster/Base host
          console.warn('Add mini app unavailable:', error instanceof Error ? error.message : error)
        }

      }

    

      tryAddMiniApp()
    }, [addMiniApp])

  useEffect(() => {
    async function loadFarcasterContext() {
      try {
        await sdk.actions.ready();
        const context = await sdk.context;
        setFarcasterUsername(context?.user?.username ?? null);
      } catch (error) {
        setFarcasterUsername(null);
      }
    }
    loadFarcasterContext();
  }, []);

  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900 px-4">
        <Card className="w-full max-w-md bg-black/80 border-purple-500/50">
          <CardHeader>
            <CardTitle className="text-2xl text-center text-purple-400">Shootris</CardTitle>
            <CardDescription className="text-center">Preparing smart wallet...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Allow viewing menu without wallet - only require wallet for gameplay

  return (
    <div className="min-h-screen grid-pattern px-4 py-8 pt-20" style={{ background: 'linear-gradient(135deg, #0a0e27 0%, #1a0a2e 50%, #0f0a1e 100%)' }}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Wallet Connect Bar */}
        <div className="flex justify-end gap-3 mb-4">
          <ShareOnFarcaster />
          <WalletConnect />
        </div>
        
        {/* Header */}
        <Card className="bg-black/90 border-4 border-cyan-400 shadow-[0_0_30px_rgba(0,240,255,0.5)]">
          <CardHeader>
            <CardTitle className="text-6xl text-center font-black tracking-wider neon-cyan">
              SHOOTRIS
            </CardTitle>
            <CardDescription className="text-center text-xl font-bold text-cyan-300 mt-4 tracking-wide flex items-center justify-center gap-2">
              <ChevronsUp className="h-6 w-6" aria-hidden="true" />
              INVERTED TETRIS - PIECES RISE FROM BOTTOM
              <ChevronsUp className="h-6 w-6" aria-hidden="true" />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {address ? (
              <div className="text-center space-y-2">
                <p className="text-lg font-bold text-green-400">
                  {address.slice(0, 6)}...{address.slice(-4)} 
                  {farcasterUsername && <span className="ml-2 text-purple-400">@{farcasterUsername}</span>}
                </p>
                <p className="text-base font-bold text-gray-300 flex items-center justify-center gap-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${dbConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500 animate-pulse'}`}
                    aria-hidden="true"
                  />
                  {dbConnected ? 'DATABASE ONLINE' : 'CONNECTING...'}
                </p>
                {player && (
                  <p className="text-xl font-bold text-blue-400">
                    GAMES: {Number(player.totalGames)} | WINS: {Number(player.totalWins)}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center space-y-4">
                <p className="text-2xl font-black text-yellow-300 tracking-wide neon-yellow flex items-center justify-center gap-2">
                  <TriangleAlert className="h-7 w-7" aria-hidden="true" />
                  WALLET NOT CONNECTED
                </p>
                <p className="text-lg font-bold text-gray-300">
                  Browse the menu below or connect your wallet to play
                </p>
                <p className="text-base font-semibold text-cyan-400">
                  Open in Farcaster/Base App or use Quick Auth to connect
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Menu */}
        <div className="grid gap-6 md:grid-cols-2">
          <Link href="/single-player" className="block group">
            <Card className="h-full bg-gradient-to-br from-purple-900/70 to-black/90 border-4 border-purple-500 hover:border-purple-300 transition-all cursor-pointer hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] hover:scale-105">
              <CardHeader>
                <CardTitle className="text-3xl font-black text-purple-300 tracking-wider group-hover:neon-purple flex items-center gap-3">
                  <Gamepad2 className="h-8 w-8" aria-hidden="true" /> SINGLE PLAYER
                </CardTitle>
                <CardDescription className="text-lg font-bold text-purple-200 mt-2">
                  Classic Inverted Tetris
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-base font-semibold text-gray-300 leading-relaxed">
                  Pieces spawn at bottom and rise upward. Clear lines to score.
                  Spend $MYU to continue on game over.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/pvp" className="block group">
            <Card className="h-full bg-gradient-to-br from-cyan-900/70 to-black/90 border-4 border-cyan-500 hover:border-cyan-300 transition-all cursor-pointer hover:shadow-[0_0_30px_rgba(0,240,255,0.6)] hover:scale-105">
              <CardHeader>
                <CardTitle className="text-3xl font-black text-cyan-300 tracking-wider group-hover:neon-cyan flex items-center gap-3">
                  <Swords className="h-8 w-8" aria-hidden="true" /> PVP MODES
                </CardTitle>
                <CardDescription className="text-lg font-bold text-cyan-200 mt-2">
                  Multiplayer Battles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-base font-semibold text-gray-300 leading-relaxed">
                  Floor Hit Duel • Score Race Time Trial • Real-time competition
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/leaderboard" className="block group">
            <Card className="h-full bg-gradient-to-br from-yellow-900/70 to-black/90 border-4 border-yellow-500 hover:border-yellow-300 transition-all cursor-pointer hover:shadow-[0_0_30px_rgba(250,204,21,0.6)] hover:scale-105">
              <CardHeader>
                <CardTitle className="text-3xl font-black text-yellow-300 tracking-wider group-hover:neon-yellow flex items-center gap-3">
                  <Trophy className="h-8 w-8" aria-hidden="true" /> LEADERBOARD
                </CardTitle>
                <CardDescription className="text-lg font-bold text-yellow-200 mt-2">
                  Top Players
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-base font-semibold text-gray-300 leading-relaxed">
                  View global rankings by wins, games played, and PVP victories.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/settings" className="block group">
            <Card className="h-full bg-gradient-to-br from-pink-900/70 to-black/90 border-4 border-pink-500 hover:border-pink-300 transition-all cursor-pointer hover:shadow-[0_0_30px_rgba(255,0,255,0.6)] hover:scale-105">
              <CardHeader>
                <CardTitle className="text-3xl font-black text-pink-300 tracking-wider group-hover:neon-pink flex items-center gap-3">
                  <Settings className="h-8 w-8" aria-hidden="true" /> SETTINGS
                </CardTitle>
                <CardDescription className="text-lg font-bold text-pink-200 mt-2">
                  Preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-base font-semibold text-gray-300 leading-relaxed">
                  Music toggle, terms of service, and game preferences.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Info Cards */}
        <div className="grid gap-6 md:grid-cols-1">
          <Link href="/how-to-play" className="block group">
            <Card className="bg-black/70 border-3 border-cyan-600/60 hover:border-cyan-400 transition-all cursor-pointer hover:shadow-[0_0_20px_rgba(0,240,255,0.4)]">
              <CardHeader>
                <CardTitle className="text-2xl font-black text-cyan-300 tracking-wide group-hover:neon-cyan flex items-center gap-3">
                  <BookOpen className="h-7 w-7" aria-hidden="true" /> HOW TO PLAY
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-base font-semibold text-gray-300">
                  Learn inverted Tetris mechanics and PVP strategies
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Footer Note */}
        <Card className="bg-black/50 border-3 border-gray-700/60">
          <CardContent className="pt-6 text-center">
            <p className="text-base font-bold text-gray-400 mb-2">
              All purchases are final. Connecting a wallet implies acceptance of Terms of Service.
            </p>
            <Link href="/terms" className="text-lg font-bold text-purple-400 hover:text-purple-300 underline tracking-wide">
              VIEW TERMS OF SERVICE
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
