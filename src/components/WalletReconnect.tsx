'use client';

import { useEffect, useRef } from 'react';
import { useAccount, useConnect, useReconnect } from 'wagmi';
import { sdk } from '@farcaster/miniapp-sdk';

// Backoff between attempts to bring an embedded wallet back
const RETRY_DELAYS_MS = [400, 1200, 3000, 6000];

/**
 * Keeps the wallet connected.
 *
 * On the open web this only restores the previous session once at startup:
 * a disconnect there is the player's own choice, so it is left alone.
 *
 * Inside a Farcaster / Base App mini app the wallet is ambient rather than
 * chosen, and the host can drop the provider (backgrounding the app, the
 * webview reclaiming memory). Without this the game silently stops saving
 * scores until the player reloads — which also loses the run — so reconnect
 * on our own, and again whenever the app returns to the foreground.
 *
 * wagmi's own reconnect stays off (see providers.tsx): it walks every
 * configured connector, and extension/popup wallets can hang forever inside
 * a mini app.
 */
export function WalletReconnect() {
  const { reconnect } = useReconnect();
  const { connect, connectors } = useConnect();
  const { status } = useAccount();
  const inMiniApp = useRef<boolean | null>(null);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Decide once which world we are in, and restore a web session
  useEffect(() => {
    let cancelled = false;
    sdk
      .isInMiniApp()
      .catch(() => false)
      .then((mini) => {
        if (cancelled) return;
        inMiniApp.current = mini;
        if (!mini) reconnect();
      });
    return () => {
      cancelled = true;
    };
  }, [reconnect]);

  // Mini app: retry the embedded connector while disconnected
  useEffect(() => {
    if (status === 'connected') {
      attempt.current = 0;
      return;
    }
    if (status !== 'disconnected') return;

    const tryConnect = () => {
      if (!inMiniApp.current) return;
      const farcaster = connectors.find((c) => c.id === 'farcaster' || c.type === 'farcasterFrame' || c.type === 'farcasterMiniApp');
      if (!farcaster) return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt.current, RETRY_DELAYS_MS.length - 1)];
      attempt.current++;
      timer.current = setTimeout(() => connect({ connector: farcaster }), delay);
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
