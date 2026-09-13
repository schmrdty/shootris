'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InGameMusicControlsProps {
  musicOn: boolean;
  onToggle: (on: boolean) => void;
}

export function InGameMusicControls({ musicOn, onToggle }: InGameMusicControlsProps) {
  return (
    <div className="fixed left-4 top-20 z-10 flex flex-col gap-2">
      <Button
        onClick={() => onToggle(!musicOn)}
        size="icon"
        variant="outline"
        className="w-12 h-12 bg-black/80 border-2 border-cyan-500/50 hover:border-cyan-400 hover:bg-black/90 transition-all shadow-[0_0_10px_rgba(0,240,255,0.3)]"
        title={musicOn ? 'Mute music' : 'Unmute music'}
        aria-label={musicOn ? 'Mute music' : 'Unmute music'}
      >
        {musicOn ? <Volume2 className="w-6 h-6 text-cyan-400" /> : <VolumeX className="w-6 h-6 text-gray-500" />}
      </Button>
    </div>
  );
}
