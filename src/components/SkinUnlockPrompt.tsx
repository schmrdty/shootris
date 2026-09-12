'use client';

import { useEffect, useState } from 'react';
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
import { useCollection } from '@/lib/collection';
import { useGameTheme } from '@/lib/theme';
import { PIECE_KEYS, SET_LABELS, loadSeenSets, saveSeenSets, type SkinSet } from '@/lib/skins';

/**
 * Fires once per newly COMPLETED set. Holding some of a set's cards unlocks
 * nothing; holding all seven unlocks that set as a whole.
 */
export function SkinUnlockPrompt() {
  const { setProgress } = useCollection();
  const { applySkins } = useGameTheme();
  const [pending, setPending] = useState<SkinSet[]>([]);

  useEffect(() => {
    const seen = new Set(loadSeenSets());
    setPending(setProgress.filter((p) => p.complete && !seen.has(p.set)).map((p) => p.set));
  }, [setProgress]);

  if (pending.length === 0) return null;

  const acknowledge = () => {
    saveSeenSets(Array.from(new Set([...loadSeenSets(), ...pending])));
    setPending([]);
  };

  const useSet = (set: SkinSet) => {
    applySkins(Object.fromEntries(PIECE_KEYS.map((p) => [p, set])));
    acknowledge();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && acknowledge()}>
      <DialogContent className="bg-gray-900 border-yellow-500">
        <DialogHeader>
          <DialogTitle className="text-2xl text-yellow-400 flex items-center gap-2">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
            {pending.length === 1 ? 'Set complete!' : 'Sets complete!'}
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            You hold all 7 cards of{' '}
            {pending.map((s) => SET_LABELS[s]).join(' and ')}. Use{' '}
            {pending.length === 1 ? 'it' : 'one'} for your pieces?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={acknowledge} className="w-full sm:w-auto">
            Not now
          </Button>
          {pending.map((set) => (
            <Button
              key={set}
              onClick={() => useSet(set)}
              className="w-full sm:w-auto bg-yellow-600 hover:bg-yellow-700"
            >
              Use {SET_LABELS[set]}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
