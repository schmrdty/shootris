'use client';

import { useState, useEffect } from 'react';
import { Volume2, VolumeX, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccount } from 'wagmi';
import { useSpacetimeDB } from '@/lib/spacetime/hooks';

interface InGameMusicControlsProps {
  onNextTrack?: () => void;
}

export function InGameMusicControls({ onNextTrack }: InGameMusicControlsProps) {
  const { address } = useAccount();
  const { connection, player } = useSpacetimeDB(address || null);
  const [musicEnabled, setMusicEnabled] = useState(true);

  useEffect(() => {
    if (player) {
      setMusicEnabled(player.musicEnabled ?? true);
    }
  }, [player]);

  const handleToggleMusic = () => {
    if (!connection || !address) return;
    const newState = !musicEnabled;
    setMusicEnabled(newState);
    connection.reducers.setPlayerMusic(address.toLowerCase(), newState);
  };

  const handleNextTrack = () => {
    if (onNextTrack) {
      onNextTrack();
    }
  };

  return (
    <div className="fixed left-4 top-20 z-10 flex flex-col gap-2">
      {/* Music Toggle Button */}
      <Button
        onClick={handleToggleMusic}
        size="icon"
        variant="outline"
        className="w-12 h-12 bg-black/80 border-2 border-cyan-500/50 hover:border-cyan-400 hover:bg-black/90 transition-all shadow-[0_0_10px_rgba(0,240,255,0.3)]"
        title={musicEnabled ? 'Mute music' : 'Unmute music'}
      >
        {musicEnabled ? (
          <Volume2 className="w-6 h-6 text-cyan-400" />
        ) : (
          <VolumeX className="w-6 h-6 text-gray-500" />
        )}
      </Button>

      {/* Next Track Button */}
      {musicEnabled && (
        <Button
          onClick={handleNextTrack}
          size="icon"
          variant="outline"
          className="w-12 h-12 bg-black/80 border-2 border-purple-500/50 hover:border-purple-400 hover:bg-black/90 transition-all shadow-[0_0_10px_rgba(168,85,247,0.3)]"
          title="Next track"
        >
          <SkipForward className="w-6 h-6 text-purple-400" />
        </Button>
      )}
    </div>
  );
}
