'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import { Button } from '@/components/ui/button';
import { useIsInFarcaster } from '@/hooks/useIsInFarcaster';
import { castShareUrl, DEFAULT_CAST_TEXT, SITE_URL } from '@/lib/share';
import { Share2 } from 'lucide-react';

export function ShareOnFarcaster({ text = DEFAULT_CAST_TEXT }: { text?: string }) {
  const isInFarcaster = useIsInFarcaster();

  const handleShare = async () => {
    if (isInFarcaster) {
      // Native composer inside Farcaster / the Base App
      try {
        await sdk.actions.composeCast({ text, embeds: [SITE_URL] });
        return;
      } catch {
        // Older clients without composeCast fall through to the web composer
      }
    }
    window.open(castShareUrl(text), '_blank', 'noopener');
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
