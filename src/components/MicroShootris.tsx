'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { createInitialGameState, spawnNewPiece, movePieceUp, movePieceLeft, movePieceRight, rotatePieceAction, hardLaunchUp } from '@/lib/tetris/game-engine';
import type { GameState } from '@/lib/tetris/types';

interface MicroShootrisProps {
  onClose: () => void;
  matchFound: boolean;
}

export default function MicroShootris({ onClose, matchFound }: MicroShootrisProps) {
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const gameLoopRef = useRef<number | null>(null);

  useEffect(() => {
    const newState = spawnNewPiece(createInitialGameState());
    setGameState(newState);
  }, []);

  // Auto-restart the warm-up game when it tops out
  useEffect(() => {
    if (!gameState.gameOver) return;
    const t = setTimeout(() => {
      setGameState(spawnNewPiece(createInitialGameState()));
    }, 1500);
    return () => clearTimeout(t);
  }, [gameState.gameOver]);

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
  }, [gameState.gameOver, gameState.isPaused, gameState.moveSpeed, gameState]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (gameState.gameOver) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          setGameState(prev => movePieceLeft(prev));
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          setGameState(prev => movePieceRight(prev));
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
        case ' ':
          e.preventDefault();
          setGameState(prev => hardLaunchUp(prev));
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          setGameState(prev => rotatePieceAction(prev));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState.gameOver]);

  const renderMicroBoard = () => {
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

    // Full 20-row board so the piece is visible for its whole flight
    return board.slice().reverse().map((row, y) => (
      <div key={y} className="flex" style={{ height: '13px' }}>
        {row.map((cell, x) => (
          <div
            key={x}
            className="relative"
            style={{
              width: '13px',
              height: '13px',
              backgroundColor: cell || '#000',
              boxShadow: cell ? `0 0 4px ${cell}` : 'none',
            }}
          >
            <div className="absolute inset-0 border border-cyan-900/20" />
          </div>
        ))}
      </div>
    ));
  };

  if (matchFound) {
    return (
      <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
        <div className="bg-gradient-to-br from-green-900/90 to-cyan-900/90 p-8 rounded-lg border-2 border-green-500 shadow-2xl">
          <h2 className="text-3xl font-bold text-green-400 mb-4 neon-cyan">Match Found!</h2>
          <p className="text-white text-lg">You win the warm-up! Prepare for battle...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 via-black to-purple-900 p-6 rounded-lg border-2 border-purple-500 shadow-2xl max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-purple-400">Micro-Shootris</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <p className="text-sm text-gray-400 mb-4">Play while waiting for an opponent...</p>

        <div className="flex justify-center mb-4">
          <div className="inline-block border-2 border-cyan-500 rounded" style={{ boxShadow: '0 0 10px rgba(0, 240, 255, 0.3)' }}>
            {renderMicroBoard()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-800/50 p-3 rounded">
            <p className="text-gray-400 text-xs">Score</p>
            <p className="text-cyan-400 font-bold text-lg">{gameState.score}</p>
          </div>
          <div className="bg-gray-800/50 p-3 rounded">
            <p className="text-gray-400 text-xs">Lines</p>
            <p className="text-purple-400 font-bold text-lg">{gameState.lines}</p>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          <p>← →: Move | ↓: Rotate | ↑ / Space: Shoot</p>
          <p className="text-yellow-400 mt-2">Searching for opponent...</p>
        </div>
      </div>
    </div>
  );
}
