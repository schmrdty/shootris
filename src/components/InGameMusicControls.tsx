'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MUSIC_PACK_LABELS, type MusicPack } from '@/lib/music';

interface InGameMusicControlsProps {
  musicOn: boolean;
  onToggle: (on: boolean) => void;
  /** Which adaptive soundtrack is playing. */
  pack: MusicPack;
  onPackChange: (pack: MusicPack) => void;
}

const SHORT_LABEL: Record<MusicPack, string> = {
  arcade: 'ARC',
  zen: 'ZEN',
};

export function InGameMusicControls({
  musicOn,
  onToggle,
  pack,
  onPackChange,
}: InGameMusicControlsProps) {
  const other: MusicPack = pack === 'arcade' ? 'zen' : 'arcade';

  return (
    <div className="fixed left-4 top-20 z-10 flex flex-col gap-2">
      <Button
        onClick={() => onToggle(!musicOn)}
        size="icon"
        variant="outline"
        className="w-12 h-12 bg-black/80 border-2 border-cyan-500/50 hover:border-cyan-400 hover:bg-black/90 transition-all shadow-[0_0_10px_rgba(0,240,255,0.3)]"
        title={musicOn ? 'Mute music' : 'Unmute music'}
        aria-label="Mute music"
        // A mute toggle: stays pushed in for as long as the music is muted
        aria-pressed={!musicOn}
      >
        {musicOn ? <Volume2 className="w-6 h-6 text-cyan-400" /> : <VolumeX className="w-6 h-6 text-gray-500" />}
      </Button>
      {/* The soundtrack crossfades at the next loop boundary, so switching
          mid-run never cuts the music off. */}
      <Button
        onClick={() => onPackChange(other)}
        size="icon"
        variant="outline"
        disabled={!musicOn}
        className="w-12 h-12 bg-black/80 border-2 border-purple-500/50 hover:border-purple-400 hover:bg-black/90 transition-all text-xs font-black tracking-tight text-purple-300 disabled:opacity-40"
        title={`Soundtrack: ${MUSIC_PACK_LABELS[pack]} — switch to ${MUSIC_PACK_LABELS[other]}`}
        aria-label={`Soundtrack: ${MUSIC_PACK_LABELS[pack]}. Switch to ${MUSIC_PACK_LABELS[other]}`}
      >
        {SHORT_LABEL[pack]}
      </Button>
    </div>
  );
}
