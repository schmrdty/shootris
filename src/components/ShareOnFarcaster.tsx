'use client';

import { Button } from '@/components/ui/button';
import { DEFAULT_CAST_TEXT, shareCast } from '@/lib/share';
import { Share2 } from 'lucide-react';

export function ShareOnFarcaster({ text = DEFAULT_CAST_TEXT }: { text?: string }) {

  const handleShare = () => {
    void shareCast(text);
  };

  return (
    <Button
      onClick={handleShare}
      className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold px-3 py-2 text-sm sm:px-6 sm:py-3 sm:text-base rounded-lg shadow-lg hover:shadow-xl transition-all"
    >
      <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
      Share on Farcaster
    </Button>
  );
}
