'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import { MatchType, MatchStatus, type PvpMatch } from '@/spacetime_module_bindings';
import MicroShootris from '@/components/MicroShootris';
import { Copy, Share2, Target, BrickWall, Rocket, Sparkles, Skull } from 'lucide-react';
import { useMyuFee } from '@/hooks/useMyuFee';
import { GetMyuDialog } from '@/components/GetMyuDialog';
import { PVP_ENTRY_FEE_MYU, MYU_DECIMALS } from '@/app/config/onchainkit';

export default function FloorDuelPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { connection } = useSpacetimeDB(address || null);
  const [waitingMatches, setWaitingMatches] = useState<PvpMatch[]>([]);
  const [myMatches, setMyMatches] = useState<PvpMatch[]>([]);
  const [showInviteFlow, setShowInviteFlow] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [inQueue, setInQueue] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [showGetMyu, setShowGetMyu] = useState(false);
  const { balance: myuBalance, hasEnough, feeRequired, payFee, refetchBalance } = useMyuFee(PVP_ENTRY_FEE_MYU);

  // Charge the $MYU entry fee (if configured) before running a matchmaking action
  const withEntryFee = useCallback(async (action: () => void) => {
    if (feeRequired && !hasEnough) {
      setShowGetMyu(true);
      return;
    }
    try {
      await payFee();
      action();
    } catch (error) {
      console.error('Entry fee payment failed:', error);
      alert('Entry fee payment failed. Please try again.');
    }
  }, [feeRequired, hasEnough, payFee]);

  useEffect(() => {
    if (!connection) return;

    // Find waiting matches
    const waiting: PvpMatch[] = [];
    const mine: PvpMatch[] = [];

    for (const match of connection.db.pvpMatches.iter()) {
      if (match.matchType.tag === 'FloorHitDuel') {
        if (match.status.tag === 'Waiting' && match.player1Wallet.toLowerCase() !== address?.toLowerCase()) {
          waiting.push(match);
        }
        if (address && (
          match.player1Wallet.toLowerCase() === address.toLowerCase() ||
          match.player2Wallet?.toLowerCase() === address.toLowerCase()
        )) {
          mine.push(match);
          // Check if match became active
          if (match.status.tag === 'Active' && inQueue) {
            setMatchFound(true);
            const foundMatchId = match.matchId;
            setTimeout(() => {
              setInQueue(false);
              setMatchFound(false);
              router.push(`/pvp/play/${foundMatchId}`);
            }, 2000);
          }
        }
      }
    }

    setWaitingMatches(waiting);
    setMyMatches(mine);
  }, [connection, address, inQueue]);

  const createMatch = useCallback(() => {
    if (!connection || !address) return;
    withEntryFee(() => {
      connection.reducers.createPvpMatch(address.toLowerCase(), MatchType.FloorHitDuel);
    });
  }, [connection, address, withEntryFee]);

  const createMatchWithCode = useCallback(() => {
    if (!connection || !address) return;
    withEntryFee(() => {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setInviteCode(code);
      setShowInviteFlow(true);
      connection.reducers.createPvpMatchWithCode(address.toLowerCase(), MatchType.FloorHitDuel, code);
    });
  }, [connection, address, withEntryFee]);

  const joinMatchByCode = useCallback(() => {
    if (!connection || !address || !joinCode.trim()) return;
    withEntryFee(() => {
      connection.reducers.joinPvpMatchByCode(address.toLowerCase(), joinCode.trim().toUpperCase());
      setJoinCode('');
    });
  }, [connection, address, joinCode, withEntryFee]);

  const joinQueue = useCallback(() => {
    if (!connection || !address) return;
    withEntryFee(() => {
      setInQueue(true);
      connection.reducers.joinMatchQueue(address.toLowerCase(), MatchType.FloorHitDuel);
    });
  }, [connection, address, withEntryFee]);

  const leaveQueue = useCallback(() => {
    if (!connection || !address) return;
    setInQueue(false);
    connection.reducers.leaveMatchQueue(address.toLowerCase());
  }, [connection, address]);

  const copyInviteCode = useCallback(() => {
    navigator.clipboard.writeText(inviteCode);
  }, [inviteCode]);

  const shareOnFarcaster = useCallback(() => {
    const text = `Join my Shootris Floor Hit Duel match! Code: ${inviteCode}`;
    const url = window.location.origin;
    window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`, '_blank');
  }, [inviteCode]);

  const joinMatch = useCallback((matchId: bigint) => {
    if (!connection || !address) return;
    withEntryFee(() => {
      connection.reducers.joinPvpMatch(address.toLowerCase(), matchId);
      router.push(`/pvp/play/${matchId}`);
    });
  }, [connection, address, withEntryFee, router]);

  const cancelMatch = useCallback((matchId: bigint) => {
    if (!connection) return;
    connection.reducers.cancelPvpMatch(matchId);
  }, [connection]);

  if (!address) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-black to-blue-950 pt-16">
        <Card className="p-8 bg-black/80 border-cyan-500">
          <p className="text-white">Wallet required to play PvP.</p>
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
          <Button variant="outline" onClick={() => router.push('/pvp')}>
            ← Back
          </Button>
          <h1 className="text-3xl font-bold neon-cyan">
            Floor Hit Duel
          </h1>
        </div>

        {feeRequired && (
          <Card className="bg-black/80 border-yellow-500/50 p-4" style={{ boxShadow: '0 0 20px rgba(250, 204, 21, 0.2)' }}>
            <p className="text-yellow-400 font-bold">
              Entry fee: {PVP_ENTRY_FEE_MYU} $MYU per match or queue entry (non-refundable)
            </p>
            <p className="text-sm text-gray-300 mt-1">
              Your balance: {myuBalance !== undefined ? Number(myuBalance) / 10 ** MYU_DECIMALS : '…'} $MYU
              {!hasEnough && <span className="text-red-400 ml-2">— not enough; you can swap for $MYU in-app</span>}
            </p>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Match */}
          <Card className="bg-black/80 border-cyan-500/50 p-6" style={{ boxShadow: '0 0 20px rgba(0, 240, 255, 0.2)' }}>
            <h3 className="text-xl font-bold text-cyan-400 mb-4">Create New Match</h3>
            <div className="space-y-3">
              <Button onClick={createMatch} className="w-full bg-cyan-600 hover:bg-cyan-700">
                Quick Match
              </Button>
              <Button onClick={createMatchWithCode} variant="outline" className="w-full border-cyan-500 text-cyan-400">
                Create with Invite Code
              </Button>
              <Button onClick={joinQueue} disabled={inQueue} className="w-full bg-purple-600 hover:bg-purple-700">
                {inQueue ? 'In Queue...' : 'Join Queue'}
              </Button>
              {inQueue && (
                <Button onClick={leaveQueue} variant="outline" className="w-full">
                  Leave Queue
                </Button>
              )}
            </div>
          </Card>

          {/* Join by Code */}
          <Card className="bg-black/80 border-purple-500/50 p-6" style={{ boxShadow: '0 0 20px rgba(176, 48, 255, 0.2)' }}>
            <h3 className="text-xl font-bold text-purple-400 mb-4">Join by Code</h3>
            <p className="text-gray-300 mb-4 text-sm">Have an invite code? Enter it here.</p>
            <div className="flex gap-2">
              <Input 
                placeholder="Enter code" 
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="bg-gray-900 border-purple-500"
              />
              <Button onClick={joinMatchByCode} disabled={!joinCode.trim()} className="bg-purple-600 hover:bg-purple-700">
                Join
              </Button>
            </div>
          </Card>
        </div>

        {/* Invite Code Dialog */}
        {showInviteFlow && inviteCode && (
          <Card className="bg-black/80 border-green-500/50 p-6" style={{ boxShadow: '0 0 20px rgba(34, 197, 94, 0.2)' }}>
            <h3 className="text-xl font-bold text-green-400 mb-4">Match Created!</h3>
            <p className="text-gray-300 mb-4">Share this code with your opponent:</p>
            <div className="bg-gray-900 p-4 rounded border border-green-500 mb-4">
              <p className="text-3xl font-bold text-green-400 text-center tracking-wider">{inviteCode}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyInviteCode} className="flex-1 bg-cyan-600 hover:bg-cyan-700">
                <Copy className="h-4 w-4 mr-2" />
                Copy Code
              </Button>
              <Button onClick={shareOnFarcaster} className="flex-1 bg-purple-600 hover:bg-purple-700">
                <Share2 className="h-4 w-4 mr-2" />
                Share on Farcaster
              </Button>
            </div>
            <Button onClick={() => setShowInviteFlow(false)} variant="outline" className="w-full mt-3">
              Close
            </Button>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          {/* Waiting Matches */}
          <Card className="bg-black/80 border-purple-500/50 p-6" style={{ boxShadow: '0 0 20px rgba(176, 48, 255, 0.2)' }}>
            <h3 className="text-xl font-bold text-purple-400 mb-4">Available Matches</h3>
            {waitingMatches.length === 0 ? (
              <p className="text-gray-400">No matches waiting. Create one!</p>
            ) : (
              <div className="space-y-2">
                {waitingMatches.map((match) => (
                  <div key={match.matchId.toString()} className="flex justify-between items-center p-3 bg-gray-900/50 rounded">
                    <span className="text-cyan-400 font-mono text-sm">
                      {match.player1Wallet.slice(0, 6)}...{match.player1Wallet.slice(-4)}
                    </span>
                    <Button onClick={() => joinMatch(match.matchId)} size="sm" className="bg-purple-600 hover:bg-purple-700">
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* My Matches */}
        {myMatches.length > 0 && (
          <Card className="bg-black/80 border-green-500/50 p-6" style={{ boxShadow: '0 0 20px rgba(34, 197, 94, 0.2)' }}>
            <h3 className="text-xl font-bold text-green-400 mb-4">My Matches</h3>
            <div className="space-y-3">
              {myMatches.map((match) => (
                <div key={match.matchId.toString()} className="p-4 bg-gray-900/50 rounded">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-400">
                        Match #{match.matchId.toString()}
                      </p>
                      <p className="font-mono text-cyan-400 text-sm">
                        vs {match.player2Wallet ? 
                          `${match.player2Wallet.slice(0, 6)}...${match.player2Wallet.slice(-4)}` : 
                          'Waiting for opponent...'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {match.status.tag === 'Waiting' && (
                        <>
                          <Button onClick={() => router.push(`/pvp/play/${match.matchId}`)} size="sm" className="bg-cyan-600 hover:bg-cyan-700">
                            Open
                          </Button>
                          <Button onClick={() => cancelMatch(match.matchId)} variant="outline" size="sm">
                            Cancel
                          </Button>
                        </>
                      )}
                      {match.status.tag === 'Active' && (
                        <Button onClick={() => router.push(`/pvp/play/${match.matchId}`)} className="bg-green-600 hover:bg-green-700">
                          Play
                        </Button>
                      )}
                      {match.status.tag === 'Completed' && (
                        <span className="text-yellow-400 font-bold">
                          Winner: {match.winnerWallet?.slice(0, 6)}...{match.winnerWallet?.slice(-4)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Rules */}
        <Card className="bg-black/80 border-gray-700 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Rules</h3>
          <div className="text-gray-300 space-y-2">
            <p className="flex items-center gap-2"><Target className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" /> Both players start with obstacles to clear on their own side</p>
            <p className="flex items-center gap-2"><BrickWall className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" /> A thick obstacle barrier blocks your path upward</p>
            <p className="flex items-center gap-2"><Rocket className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" /> Clear through the barrier to reach the opponent&apos;s floor</p>
            <p className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" /> First player to land a piece on the far wall wins!</p>
            <p className="flex items-center gap-2"><Skull className="h-4 w-4 text-red-400 shrink-0" aria-hidden="true" /> Alternatively, if you top out, you lose</p>
          </div>
        </Card>
      </div>

      {/* Buy MYU via in-app swap */}
      <GetMyuDialog
        open={showGetMyu}
        onOpenChange={setShowGetMyu}
        onSwapSuccess={() => {
          refetchBalance();
          setShowGetMyu(false);
        }}
      />

      {/* Micro-Shootris Overlay */}
      {inQueue && <MicroShootris onClose={leaveQueue} matchFound={matchFound} />}
    </div>
  );
}
