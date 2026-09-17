'use client';

import { Button } from '@/components/ui/button';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';

interface RunSaveStatusProps {
  address?: string;
  /** Wallet verified with the game server, so writes are accepted. */
  bound: boolean;
  /** A verification signature is in flight. */
  binding: boolean;
  retryBinding: () => void;
  /** Null until the server has created the run. */
  runId: bigint | null;
  compact?: boolean;
}

/**
 * Says plainly whether the current run will be recorded, and offers the way
 * back when it won't. A module-level component on purpose: declared inside
 * the game page it was a new component type on every tick, so React tore
 * the panel down and rebuilt it several times a second — visible as
 * flickering in the side panel during play.
 */
export function RunSaveStatus({ address, bound, binding, retryBinding, runId, compact = false }: RunSaveStatusProps) {
  const wrap = compact
    ? 'mt-1 flex items-center justify-center gap-2 text-[10px]'
    : 'mt-3 border-t border-gray-700 pt-2 text-xs flex flex-col gap-2';

  if (!address) {
    return (
      <div className={wrap}>
        <span className="text-yellow-400">Guest: scores are not saved</span>
        <ConnectWalletButton
          className={`rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 font-bold text-white ${
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-2'
          }`}
        />
      </div>
    );
  }

  if (bound) {
    return (
      <div className={wrap}>
        <span className={runId === null ? 'text-gray-400' : 'text-green-400'}>
          {runId === null ? 'Starting run…' : 'Saving your score'}
        </span>
      </div>
    );
  }

  if (binding) {
    return (
      <div className={wrap}>
        <span className="text-cyan-300">Verifying wallet: sign the message to save scores</span>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <span className="text-red-400">Wallet unverified: this run will not be saved</span>
      <Button size="sm" variant="outline" onClick={retryBinding} className="border-cyan-500 text-cyan-300">
        Verify wallet
      </Button>
    </div>
  );
}
