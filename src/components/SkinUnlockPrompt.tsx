'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useCollectionSkins } from '@/hooks/useCollectionSkins';
import { useGameTheme } from '@/lib/theme';
import { SET_LABELS } from '@/lib/skins';

/**
 * "You pulled these on vibe.market — want to use them in game?"
 * Shown once per newly-detected card, on sign-in. Declining is remembered.
 */
export function SkinUnlockPrompt() {
  const { newCards, acknowledgeAll, skinsFromCards } = useCollectionSkins();
  const { applySkins } = useGameTheme();
  const [dismissed, setDismissed] = useState(false);

  const open = !dismissed && newCards.length > 0;
  if (!open) return null;

  const handleYes = () => {
    applySkins(skinsFromCards(newCards));
    acknowledgeAll();
    setDismissed(true);
  };

  const handleNo = () => {
    acknowledgeAll();
    setDismissed(true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleNo()}>
      <DialogContent className="bg-gray-900 border-yellow-500 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-yellow-400 flex items-center gap-2">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
            New cards detected
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            You&apos;re holding {newCards.length} Shootris card{newCards.length === 1 ? '' : 's'}.
            Use this art for your pieces in game?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
          {newCards.map((card) => (
            <div key={card.tokenId} className="rounded border border-gray-700 p-2 text-center">
              {card.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.image} alt="" aria-hidden="true" className="w-full h-auto rounded mb-1" />
              )}
              <p className="text-xs font-bold text-white truncate">{card.name || `#${card.tokenId}`}</p>
              <p className="text-[11px] text-gray-400">
                {card.piece}-piece · {SET_LABELS[card.set]}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleNo} className="w-full sm:w-auto">
            Not now
          </Button>
          <Button onClick={handleYes} className="w-full sm:w-auto bg-yellow-600 hover:bg-yellow-700">
            Use my card art
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
