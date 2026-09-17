'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { logWallet } from '@/lib/walletLog';

/**
 * Keeps a connected wallet on Base.
 *
 * $MYU lives on Base, so a continue payment fails (or silently prompts for a
 * network switch mid-game) whenever the wallet is sitting on Ethereum or any
 * other chain. Rather than discover that at the moment a player wants to keep
 * their run alive, ask for the switch as soon as the wallet connects.
 *
 * The switch is requested once per wallet + chain combination. Wallets that
 * refuse or cannot switch programmatically get a banner instead, so nobody is
 * ever stuck in a prompt loop. The embedded wallet inside a Farcaster or Base
 * App mini app is already on Base, so this is a no-op there.
 */
export function BaseChainGuard() {
  const { address, chainId, isConnected, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [needsManual, setNeedsManual] = useState(false);
  const [switching, setSwitching] = useState(false);
  // One automatic attempt per wallet + chain, so a refusal is not retried
  // on every render.
  const attempted = useRef<string | null>(null);

  const onWrongChain = isConnected && chainId !== undefined && chainId !== base.id;

  const switchToBase = useCallback(async () => {
    setSwitching(true);
    try {
      await switchChainAsync({ chainId: base.id });
      logWallet('chain switched', 'base');
      setNeedsManual(false);
    } catch (error) {
      logWallet('chain switch refused', error instanceof Error ? error.message : String(error));
      setNeedsManual(true);
    } finally {
      setSwitching(false);
    }
  }, [switchChainAsync]);

  useEffect(() => {
    if (!onWrongChain) {
      attempted.current = null;
      setNeedsManual(false);
      return;
    }
    const key = `${connector?.id ?? 'none'}:${address ?? 'none'}:${chainId}`;
    if (attempted.current === key) return;
    attempted.current = key;
    logWallet('wrong chain', `chainId=${chainId}, asking for Base`);
    void switchToBase();
  }, [onWrongChain, chainId, address, connector?.id, switchToBase]);

  if (!onWrongChain || !needsManual) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 border-b border-yellow-500/60 bg-yellow-950/95 px-4 py-2 text-sm font-bold text-yellow-200 backdrop-blur">
      <span>Your wallet is on the wrong network. Shootris and $MYU run on Base.</span>
      <button
        type="button"
        onClick={switchToBase}
        disabled={switching}
        className="rounded-lg bg-yellow-500 px-3 py-1 font-black text-black transition-colors hover:bg-yellow-400 disabled:opacity-50"
      >
        {switching ? 'Switching…' : 'Switch to Base'}
      </button>
    </div>
  );
}
