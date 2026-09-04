'use client';

import { Button } from '@/components/ui/button';
import { useIsInFarcaster } from '@/hooks/useIsInFarcaster';
import { Share2 } from 'lucide-react';

export function ShareOnFarcaster() {
  const isInFarcaster = useIsInFarcaster();

  const handleShare = () => {
    const text = encodeURIComponent('Playing Shootris - Inverted Tetris! Join me on this epic challenge where pieces rise from the bottom!');
    const url = encodeURIComponent(window.location.origin);
    
    if (isInFarcaster) {
      // Use Farcaster Composer within the app
      window.open(`https://warpcast.com/~/compose?text=${text}&embeds[]=${url}`, '_blank');
    } else {
      // Open Warpcast web composer
      window.open(`https://warpcast.com/~/compose?text=${text}&embeds[]=${url}`, '_blank');
    }
  };

  return (
    <Button
      onClick={handleShare}
      className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all"
    >
      <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
      Share on Farcaster
    </Button>
  );
}
