'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import * as moduleBindings from '@/spacetime_module_bindings';

type DbConnection = moduleBindings.DbConnection;
type Player = moduleBindings.Player;

export interface SpacetimeDBState {
  connected: boolean;
  wallet: string | null;
  statusMessage: string;
  player: Player | null;
  connection: DbConnection | null;
}

const BINDING_STORAGE_KEY = 'shootris_wallet_binding';

function bindingMemo(wallet: string, identityHex: string): string {
  return `${wallet.toLowerCase()}:${identityHex}`;
}

export function useSpacetimeDB(wallet: string | null) {
  const [connected, setConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [player, setPlayer] = useState<Player | null>(null);
  const [identityHex, setIdentityHex] = useState<string | null>(null);
  const [bound, setBound] = useState(false);
  const connectionRef = useRef<DbConnection | null>(null);
  const bindInFlightRef = useRef(false);
  const { signMessageAsync } = useSignMessage();

  const registerPlayer = useCallback((walletAddr: string) => {
    if (!connectionRef.current || !connected) return;
    connectionRef.current.reducers.registerPlayer(walletAddr.toLowerCase());
  }, [connected]);

  useEffect(() => {
    if (connectionRef.current) {
      return;
    }

    const dbHost = 'wss://maincloud.spacetimedb.com';
    const dbName = process.env.NEXT_PUBLIC_SPACETIME_MODULE_NAME || 'shootris-game';

    const onConnect = (connection: DbConnection, identity?: { toHexString?: () => string }) => {
      console.log('SpacetimeDB Connected');
      connectionRef.current = connection;
      setConnected(true);
      setStatusMessage('Connected to SpacetimeDB');
      try {
        const hex = identity?.toHexString?.();
        if (hex) setIdentityHex(hex.replace(/^0x/, '').toLowerCase());
      } catch {
        // identity unavailable — binding flow will be skipped
      }

      // Subscribe to all relevant tables
      connection.subscriptionBuilder()
        .onApplied(() => {
          console.log('Subscriptions applied');
        })
        .onError((_errorCtx: moduleBindings.ErrorContext, error: Error) => {
          // warn, not error: expected until the SpacetimeDB module is published
          console.warn('SpacetimeDB subscription unavailable:', error.message);
          setStatusMessage('Game server unavailable — stats and PvP are offline');
        })
        .subscribe([
          'SELECT * FROM players',
          'SELECT * FROM game_runs',
          'SELECT * FROM sp_leaderboard',
          'SELECT * FROM pvp_leaderboard',
          'SELECT * FROM pvp_matches',
          'SELECT * FROM payment_records',
          'SELECT * FROM match_queue'
        ]);

      // Register table callbacks
      connection.db.players.onInsert((_ctx, newPlayer) => {
        if (wallet && newPlayer.wallet.toLowerCase() === wallet.toLowerCase()) {
          setPlayer(newPlayer);
        }
      });

      connection.db.players.onUpdate((_ctx, _oldPlayer, newPlayer) => {
        if (wallet && newPlayer.wallet.toLowerCase() === wallet.toLowerCase()) {
          setPlayer(newPlayer);
        }
      });
    };

    const onDisconnect = (_ctx: moduleBindings.ErrorContext, reason?: Error | null) => {
      const reasonStr = reason ? reason.message : 'Connection closed';
      console.log('Disconnected:', reasonStr);
      setStatusMessage(`Disconnected: ${reasonStr}`);
      connectionRef.current = null;
      setConnected(false);
    };

    moduleBindings.DbConnection.builder()
      .withUri(dbHost)
      .withModuleName(dbName)
      .onConnect(onConnect)
      .onDisconnect(onDisconnect)
      .build();
  }, [wallet]);

  // Register player when wallet connects
  useEffect(() => {
    if (connected && wallet && !player) {
      registerPlayer(wallet);
    }
  }, [connected, wallet, player, registerPlayer]);

  // Bind wallet <-> SpacetimeDB identity (one-time signature per device).
  // The signature is verified server-side (/api/bind) and attested into the
  // module, which rejects score writes from unbound identities.
  useEffect(() => {
    if (!connected || !wallet || !identityHex) return;
    const w = wallet.toLowerCase();
    const memo = bindingMemo(w, identityHex);

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(BINDING_STORAGE_KEY);
    } catch {
      // storage unavailable — fall through and re-bind
    }
    if (stored === memo) {
      setBound(true);
      return;
    }
    if (bindInFlightRef.current) return;
    bindInFlightRef.current = true;

    (async () => {
      try {
        const message = `Shootris wallet verification\nWallet: ${w}\nIdentity: ${identityHex}`;
        const signature = await signMessageAsync({ message });
        const res = await fetch('/api/bind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: w, identityHex, signature }),
        });
        if (res.ok) {
          try {
            localStorage.setItem(BINDING_STORAGE_KEY, memo);
          } catch {
            // memo only avoids a repeat popup; binding itself succeeded
          }
          setBound(true);
          setStatusMessage('Wallet verified');
        } else {
          console.warn('Wallet binding failed:', await res.text());
          setStatusMessage('Wallet verification failed — scores will not be saved');
        }
      } catch (error) {
        console.warn('Wallet binding skipped:', error);
        setStatusMessage('Wallet verification declined — scores will not be saved');
      } finally {
        bindInFlightRef.current = false;
      }
    })();
  }, [connected, wallet, identityHex, signMessageAsync]);

  return {
    connected,
    wallet,
    statusMessage,
    player,
    bound,
    connection: connectionRef.current,
    registerPlayer,
  };
}
