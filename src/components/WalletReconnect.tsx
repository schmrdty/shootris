'use client';

import { useEffect, useRef } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { sdk } from '@farcaster/miniapp-sdk';
import { logWallet } from '@/lib/walletLog';

// Backoff between attempts to bring an embedded wallet back
const RETRY_DELAYS_MS = [400, 1200, 3000, 6000];

/**
 * Brings the wallet back when a mini-app host drops it.
 *
 * Restoring a previous session on page load is wagmi's own job
 * (reconnectOnMount, on by default) — doing it here instead left the wallet
 * disconnected whenever that check was slow to resolve.
 *
 * This covers what wagmi does not: inside a Farcaster / Base App mini app
 * the wallet is ambient rather than chosen, and the host can drop the
 * provider while the app runs (backgrounding, the webview reclaiming
 * memory). Without this the game silently stops saving scores until the
 * player reloads, which also loses their run.
 */
export function WalletReconnect() {
  const { connect, connectors } = useConnect();
  const { status } = useAccount();
  const inMiniApp = useRef<boolean | null>(null);
  const attempt = useRef(0);
  const everConnected = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Which world are we in? Only mini apps get the watchdog.
  useEffect(() => {
    let cancelled = false;
    sdk
      .isInMiniApp()
      .catch(() => false)
      .then((mini) => {
        if (cancelled) return;
        inMiniApp.current = mini;
        logWallet('env', `miniApp=${mini}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mini app: retry the embedded connector while disconnected
  useEffect(() => {
    if (status === 'connected') {
      attempt.current = 0;
      everConnected.current = true;
      return;
    }
    if (status !== 'disconnected') return;

    const tryConnect = () => {
      if (!inMiniApp.current) return;
      // MiniKit auto-connects the embedded wallet on first load; only step
      // in once the app has had a wallet and lost it.
      if (!everConnected.current) return;
      const farcaster = connectors.find((c) => c.id === 'farcaster' || c.type === 'farcasterFrame' || c.type === 'farcasterMiniApp');
      if (!farcaster) return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt.current, RETRY_DELAYS_MS.length - 1)];
      attempt.current++;
      logWallet('reconnect scheduled', `attempt=${attempt.current} in ${delay}ms`);
      timer.current = setTimeout(() => {
        logWallet('reconnect attempt', farcaster.id);
        connect(
          { connector: farcaster },
          { onError: (e) => logWallet('reconnect failed', e.message) }
        );
      }, delay);
    };

    tryConnect();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        attempt.current = 0;
        tryConnect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, connect, connectors]);

  return null;
}
