'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TETROMINOES, rotatePiece } from '@/lib/tetris/tetrominoes';
import type { Tetromino } from '@/lib/tetris/types';
import { useGameTheme } from '@/lib/theme';
import { PIECE_KEYS, SKIN_SETS, SET_LABELS, tileUrl, type PieceKey, type SkinSet } from '@/lib/skins';
import { Sprout, Zap, CircleCheck, TriangleAlert } from 'lucide-react';

// The three sizes cells are actually drawn at in game.
const SIZES = [
  { label: 'Board (24px)', px: 24 },
  { label: 'Micro / queue (13px)', px: 13 },
  { label: 'Opponent board (10px)', px: 10 },
];

/** Reports whether a tile file exists and whether it meets the spec. */
function TileStatus({ set, piece }: { set: SkinSet; piece: PieceKey }) {
  const [state, setState] = useState<{ w: number; h: number } | null>(null);
  const [missing, setMissing] = useState(false);

  const square = state ? state.w === state.h : false;
  const bigEnough = state ? state.w >= 128 : false;

  return (
    <div className="text-[11px] leading-tight">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tileUrl(set, piece)}
        alt=""
        aria-hidden="true"
        className="hidden"
        onLoad={(e) => setState({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        onError={() => setMissing(true)}
      />
      {missing ? (
        <span className="text-gray-500">no tile yet — flat colour</span>
      ) : state ? (
        <span className={square && bigEnough ? 'text-green-400' : 'text-yellow-400'}>
          {square && bigEnough ? (
            <CircleCheck className="inline h-3 w-3 mr-1" aria-hidden="true" />
          ) : (
            <TriangleAlert className="inline h-3 w-3 mr-1" aria-hidden="true" />
          )}
          {state.w}×{state.h}
          {!square && ' — not square'}
          {square && !bigEnough && ' — under 128px'}
        </span>
      ) : (
        <span className="text-gray-600">checking…</span>
      )}
    </div>
  );
}

/** Draw a tetromino shape using the real in-game cell renderer. */
function ShapeGrid({ piece, size }: { piece: Tetromino; size: number }) {
  const { cellStyle } = useGameTheme();
  return (
    <div className="inline-block">
      {piece.shape.map((row, y) => (
        <div key={y} className="flex">
          {row.map((cell, x) => (
            <div key={x} style={cellStyle(cell ? piece.color : null, size)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function rotations(base: Tetromino): Tetromino[] {
  const out = [base];
  let cur = base;
  for (let i = 0; i < 3; i++) {
    cur = rotatePiece(cur);
    out.push(cur);
  }
  return out;
}

export default function SkinsPreviewPage() {
  const { isEarthen, setTheme, appliedSkins, applySkins, clearSkins } = useGameTheme();
  const [size, setSize] = useState(24);

  const previewSet = (set: SkinSet) => {
    const next: Record<string, SkinSet> = {};
    for (const p of PIECE_KEYS) next[p] = set;
    applySkins(next);
  };

  return (
    <div className="min-h-screen px-4 py-8 pt-16" style={{ background: 'linear-gradient(135deg, #0a0e27 0%, #1a0a2e 50%, #0f0a1e 100%)' }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/"><Button variant="outline">← Menu</Button></Link>
          <h1 className="text-2xl font-bold text-cyan-400">Skin fitting preview</h1>
        </div>

        <Card className="bg-black/80 border-cyan-500/50 p-4 space-y-3">
          <p className="text-sm text-gray-300">
            Every piece below is drawn by the <strong>real game renderer</strong>, in all four
            rotations. One square tile per piece covers every rotation — the tile never rotates,
            only which cells are filled changes. You need <strong>7 tiles per set, not 28</strong>.
          </p>
          <p className="text-xs text-gray-400">
            Drop tiles at <code className="text-cyan-400">public/skins/&#123;set&#125;/&#123;i,o,t,s,z,j,l&#125;.png</code> and refresh.
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setTheme(isEarthen ? 'neon' : 'earthen')}>
              {isEarthen ? <Sprout className="h-4 w-4 mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
              {isEarthen ? 'Earthen' : 'Neon'}
            </Button>
            {SIZES.map((s) => (
              <Button key={s.px} size="sm" variant={size === s.px ? 'default' : 'outline'} onClick={() => setSize(s.px)}>
                {s.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-xs text-gray-400 self-center">Apply a set to all pieces:</span>
            {SKIN_SETS.map((s) => (
              <Button key={s} size="sm" variant="outline" onClick={() => previewSet(s)}>
                {SET_LABELS[s]}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={clearSkins}>Flat colour</Button>
          </div>
        </Card>

        {SKIN_SETS.map((set) => (
          <Card key={set} className="bg-black/80 border-purple-500/50 p-4">
            <h2 className="text-lg font-bold text-purple-400 mb-3">{SET_LABELS[set]}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PIECE_KEYS.map((key) => {
                const base: Tetromino = {
                  shape: TETROMINOES[key].shape,
                  color: TETROMINOES[key].color,
                  position: { x: 0, y: 0 },
                };
                const active = appliedSkins[key] === set;
                return (
                  <div
                    key={key}
                    className={`rounded border p-2 ${active ? 'border-cyan-500' : 'border-gray-700'}`}
                  >
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-bold text-white">{key}</span>
                      <TileStatus set={set} piece={key} />
                    </div>
                    <div className="flex flex-wrap gap-3 items-end">
                      {rotations(base).map((r, i) => (
                        <div key={i} className="text-center">
                          <ShapeGrid piece={r} size={size} />
                          <div className="text-[10px] text-gray-500 mt-1">{i * 90}°</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
