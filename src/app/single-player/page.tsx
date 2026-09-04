'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';
import { createInitialGameState, spawnNewPiece, movePieceUp, movePieceLeft, movePieceRight, rotatePieceAction, hardLaunchUp, holdPiece, createBoardSnapshot, restoreFromSnapshot } from '@/lib/tetris/game-engine';
import type { GameState, BoardSnapshot } from '@/lib/tetris/types';
import { PAYOUT_SPLIT_ADDRESS, MYU_TOKEN_ADDRESS, MYU_DECIMALS, CONTINUE_PRICE_MYU, MYU_CONFIGURED } from '@/app/config/onchainkit';
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem';
import { useSendTransaction, useReadContract } from 'wagmi';
import { base } from 'wagmi/chains';
import { InGameMusicControls } from '@/components/InGameMusicControls';
import { GetMyuDialog } from '@/components/GetMyuDialog';

export default function SinglePlayerPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { connection, player } = useSpacetimeDB(address || null);
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const [runId, setRunId] = useState<bigint | null>(null);
  const [showContinueModal, setShowContinueModal] = useState(false);
  const [showGetMyuDialog, setShowGetMyuDialog] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<BoardSnapshot | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { sendTransactionAsync } = useSendTransaction();

  const continuePrice = parseUnits(CONTINUE_PRICE_MYU, MYU_DECIMALS);
  const { data: myuBalance, refetch: refetchMyuBalance } = useReadContract({
    address: MYU_TOKEN_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address && MYU_CONFIGURED },
  });
  const hasEnoughMyu = (myuBalance ?? BigInt(0)) >= continuePrice;

  // Start a fresh run (server deactivates any previous active run for this wallet)
  const startNewRun = useCallback(() => {
    setGameState(spawnNewPiece(createInitialGameState()));
    setLastSnapshot(null);
    setShowContinueModal(false);
    if (connection && address) {
      const emptyBoard = JSON.stringify(Array(20).fill(Array(10).fill(null)));
      connection.reducers.startSingleRun(address.toLowerCase(), emptyBoard, 1);
    }
  }, [connection, address]);

  // Initialize game and track run ID
  useEffect(() => {
    if (connection && address) {
      // Listen for new game runs for this wallet
      const handleRunInsert = (_ctx: unknown, newRun: { runId: bigint; wallet: string }) => {
        if (newRun.wallet.toLowerCase() === address.toLowerCase()) {
          setRunId(newRun.runId);
        }
      };
      connection.db.gameRuns.onInsert(handleRunInsert);
      startNewRun();
      return () => {
        connection.db.gameRuns.removeOnInsert(handleRunInsert);
      };
    }
    // No connection yet — still let the player play locally
    setGameState(spawnNewPiece(createInitialGameState()));
  }, [connection, address, startNewRun]);

  // Game over: snapshot the board, record the score, and prompt to continue
  useEffect(() => {
    if (!gameState.gameOver || showContinueModal) return;
    setLastSnapshot(createBoardSnapshot(gameState));
    setShowContinueModal(true);
    // Persist the score now so it counts even if the player just leaves
    if (connection && runId) {
      connection.reducers.updateSingleRun(
        runId,
        BigInt(gameState.score),
        gameState.lines,
        gameState.level,
        JSON.stringify(gameState.board),
        true, // still active — the player may pay to continue
        false
      );
    }
  }, [gameState, showContinueModal, connection, runId]);

  // Game loop
  useEffect(() => {
    if (gameState.gameOver || gameState.isPaused) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
      return;
    }

    gameLoopRef.current = window.setInterval(() => {
      setGameState(prev => movePieceUp(prev));
    }, gameState.moveSpeed);

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [gameState.gameOver, gameState.isPaused, gameState.moveSpeed]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (gameState.gameOver) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          setGameState(prev => movePieceLeft(prev));
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          setGameState(prev => movePieceRight(prev));
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          setGameState(prev => rotatePieceAction(prev));
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          setGameState(prev => movePieceUp(prev));
          break;
        case ' ':
          e.preventDefault();
          setGameState(prev => hardLaunchUp(prev));
          break;
        case 'Shift':
        case 'c':
        case 'C':
          e.preventDefault();
          setGameState(prev => holdPiece(prev));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState.gameOver]);

  const handlePayAndContinue = useCallback(async () => {
    if (!address || !lastSnapshot) return;

    try {
      // Send CONTINUE_PRICE_MYU $MYU to the payout address
      const txHash = await sendTransactionAsync({
        to: MYU_TOKEN_ADDRESS as `0x${string}`,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [PAYOUT_SPLIT_ADDRESS as `0x${string}`, continuePrice],
        }),
        chainId: base.id,
      });

      // Record payment in SpacetimeDB (amount is whole $MYU tokens, in the legacy amount_cents field)
      if (connection && runId) {
        const amountMyu = BigInt(Math.round(Number(CONTINUE_PRICE_MYU)));
        connection.reducers.recordContinuePayment(address.toLowerCase(), runId, amountMyu, txHash);
      }
      refetchMyuBalance();

      // Restore from the snapshot, clearing the rows nearest the spawn area so the
      // revived run isn't an instant re-game-over, then spawn a fresh piece paused.
      const clearedBoard = lastSnapshot.board.map((row, y) =>
        y < 8 ? row.map(() => null) : [...row]
      );
      const restoredState = spawnNewPiece({
        ...gameState,
        ...restoreFromSnapshot(lastSnapshot),
        board: clearedBoard,
        currentPiece: null,
        isPaused: true,
      });
      setGameState(restoredState);
      setShowContinueModal(false);

      // Give grace period
      setTimeout(() => {
        setGameState(prev => ({ ...prev, isPaused: false }));
      }, 3000);
    } catch (error) {
      console.error('Payment failed:', error);
      alert('Payment failed. Please try again.');
    }
  }, [address, lastSnapshot, sendTransactionAsync, connection, runId, gameState, continuePrice, refetchMyuBalance]);

  const handleQuit = useCallback(() => {
    if (connection && runId) {
      const boardState = JSON.stringify(gameState.board);
      connection.reducers.updateSingleRun(
        runId,
        BigInt(gameState.score),
        gameState.lines,
        gameState.level,
        boardState,
        false, // active = false (game ended)
        false  // won = false (player quit)
      );
    }
    router.push('/');
  }, [connection, runId, gameState, router]);

  // Render board
  const renderBoard = () => {
    const board = gameState.board.map(row => [...row]);

    // Draw current piece
    if (gameState.currentPiece) {
      const piece = gameState.currentPiece;
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (piece.shape[y][x]) {
            const boardY = piece.position.y + y;
            const boardX = piece.position.x + x;
            if (boardY >= 0 && boardY < 20 && boardX >= 0 && boardX < 10) {
              board[boardY][boardX] = piece.color;
            }
          }
        }
      }
    }

    return board.slice().reverse().map((row, y) => (
      <div key={y} className="flex" style={{ height: '24px' }}>
        {row.map((cell, x) => (
          <div
            key={x}
            className="relative"
            style={{
              width: '24px',
              height: '24px',
              backgroundColor: cell || '#000',
              boxShadow: cell ? `0 0 8px ${cell}, inset 0 0 8px ${cell}` : 'none',
            }}
          >
            {/* Thin grid line */}
            <div className="absolute inset-0 border border-cyan-900/20" />
          </div>
        ))}
      </div>
    ));
  };

  if (!address) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white pt-16">
        <Card className="p-8 bg-gray-900 border-purple-500">
          <p>Wallet required. Please connect.</p>
          <Button onClick={() => router.push('/')} className="mt-4">
            Back to Menu
          </Button>
        </Card>
      </div>
    );
  }

  const handleNextTrack = useCallback(() => {
    console.log('Next track requested');
    // TODO: Implement track switching logic when music player is added
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-blue-950 px-4 py-8 pt-16">
      {/* In-Game Music Controls */}
      <InGameMusicControls onNextTrack={handleNextTrack} />
      
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Game Board */}
          <div className="flex-1">
            <Card className="bg-black/80 border-purple-500/50 p-4">
              <div className="mb-4 flex justify-between items-center">
                <Button variant="outline" onClick={() => router.push('/')}>
                  ← Menu
                </Button>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-purple-400">SHOOTRIS</h2>
                  <p className="text-xs text-gray-400">Pieces Rise from Bottom</p>
                </div>
                <div className="w-20" />
              </div>

              <div className="flex justify-center">
                <div className="inline-block border-4 border-cyan-500 rounded" style={{ boxShadow: '0 0 20px rgba(0, 240, 255, 0.5), inset 0 0 20px rgba(0, 240, 255, 0.2)' }}>
                  {renderBoard()}
                </div>
              </div>

              {/* Controls hint */}
              <div className="mt-4 p-3 bg-gray-900/50 rounded border border-gray-700 hidden md:block">
                <p className="text-xs text-gray-400 text-center">
                  <span className="font-bold text-purple-400">Controls:</span> ← → or A/D: Move | ↑ or W: Rotate | ↓ or S: Speed Up | Space: Hard Launch | Shift/C: Hold
                </p>
              </div>
            </Card>
          </div>

          {/* Stats Panel */}
          <div className="md:w-64 space-y-4">
            <Card className="bg-black/80 border-blue-500/50 p-4">
              <h3 className="text-lg font-bold text-blue-400 mb-3">Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Score:</span>
                  <span className="text-white font-bold">{gameState.score}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Lines:</span>
                  <span className="text-white font-bold">{gameState.lines}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Level:</span>
                  <span className="text-white font-bold">{gameState.level}</span>
                </div>
              </div>
            </Card>

            {/* Hold Piece */}
            <Card className="bg-black/80 border-yellow-500/50 p-4">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">Hold (Shift/C)</h3>
              <div className="flex justify-center items-center" style={{ minHeight: '96px' }}>
                {gameState.heldPiece ? (
                  <div className="inline-block" style={{ opacity: gameState.canHold ? 1 : 0.4 }}>
                    {gameState.heldPiece.shape.map((row, y) => (
                      <div key={y} className="flex" style={{ height: '24px' }}>
                        {row.map((cell, x) => (
                          <div
                            key={x}
                            className="relative"
                            style={{
                              width: '24px',
                              height: '24px',
                              backgroundColor: cell ? gameState.heldPiece!.color : '#000',
                              boxShadow: cell ? `0 0 8px ${gameState.heldPiece!.color}` : 'none',
                            }}
                          >
                            <div className="absolute inset-0 border border-cyan-900/20" />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-600 text-xs text-center">No piece held</div>
                )}
              </div>
            </Card>

            {/* Next Piece */}
            <Card className="bg-black/80 border-green-500/50 p-4">
              <h3 className="text-lg font-bold text-green-400 mb-3">Next Piece</h3>
              <div className="flex justify-center">
                {gameState.nextPiece && (
                  <div className="inline-block">
                    {gameState.nextPiece.shape.map((row, y) => (
                      <div key={y} className="flex" style={{ height: '24px' }}>
                        {row.map((cell, x) => (
                          <div
                            key={x}
                            className="relative"
                            style={{
                              width: '24px',
                              height: '24px',
                              backgroundColor: cell ? gameState.nextPiece!.color : '#000',
                              boxShadow: cell ? `0 0 8px ${gameState.nextPiece!.color}` : 'none',
                            }}
                          >
                            <div className="absolute inset-0 border border-cyan-900/20" />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Continue Modal */}
      <Dialog open={showContinueModal} onOpenChange={setShowContinueModal}>
        <DialogContent className="bg-gray-900 border-purple-500">
          <DialogHeader>
            <DialogTitle className="text-2xl text-purple-400">Game Over!</DialogTitle>
            <DialogDescription className="text-gray-300">
              You scored {gameState.score} points and cleared {gameState.lines} lines.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-center text-white">
              Continue from just before you failed for <span className="text-green-400 font-bold">{CONTINUE_PRICE_MYU} $MYU</span> on Base?
            </p>
            {MYU_CONFIGURED && myuBalance !== undefined && (
              <p className="text-center text-sm text-gray-300">
                Your balance: <span className={hasEnoughMyu ? 'text-cyan-400 font-bold' : 'text-red-400 font-bold'}>
                  {Number(myuBalance) / 10 ** MYU_DECIMALS} $MYU
                </span>
              </p>
            )}
            {MYU_CONFIGURED && !hasEnoughMyu && (
              <p className="text-center text-sm text-yellow-400">
                Not enough $MYU — swap ETH or other tokens for $MYU without leaving the game.
              </p>
            )}
            <p className="text-xs text-gray-400 text-center">
              All purchases are final. Completing payment implies acceptance of the Terms of Service.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleQuit} className="w-full sm:w-auto">
              Quit
            </Button>
            <Button variant="outline" onClick={startNewRun} className="w-full sm:w-auto border-purple-500 text-purple-400">
              New Game
            </Button>
            {hasEnoughMyu ? (
              <Button onClick={handlePayAndContinue} className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                Pay {CONTINUE_PRICE_MYU} $MYU & Continue
              </Button>
            ) : (
              <Button onClick={() => setShowGetMyuDialog(true)} className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-700">
                Get $MYU
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buy MYU via in-app swap */}
      <GetMyuDialog
        open={showGetMyuDialog}
        onOpenChange={setShowGetMyuDialog}
        onSwapSuccess={() => {
          refetchMyuBalance();
          setShowGetMyuDialog(false);
        }}
      />
    </div>
  );
}
