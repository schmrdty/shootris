'use client';

import { useEffect, useRef } from 'react';
import { useReconnect } from 'wagmi';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Restores the last wallet session on page load — but only on the open web.
 *
 * wagmi's built-in reconnect tries every configured connector. Inside a
 * Farcaster / Base App mini app, extension and popup wallets (MetaMask SDK,
 * Coinbase Wallet) can wait forever for a provider that will never appear,
 * leaving wagmi stuck in "reconnecting". There, OnchainKit's MiniKit
 * auto-connects the embedded wallet instead, so this does nothing.
 */
export function WalletReconnect() {
  const { reconnect } = useReconnect();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    sdk
      .isInMiniApp()
      .catch(() => false)
      .then((inMiniApp) => {
        if (!inMiniApp) reconnect();
      });
  }, [reconnect]);

  return null;
}
