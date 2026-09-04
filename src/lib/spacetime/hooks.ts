'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

export function useSpacetimeDB(wallet: string | null) {
  const [connected, setConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [player, setPlayer] = useState<Player | null>(null);
  const connectionRef = useRef<DbConnection | null>(null);

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

    const onConnect = (connection: DbConnection) => {
      console.log('SpacetimeDB Connected');
      connectionRef.current = connection;
      setConnected(true);
      setStatusMessage('Connected to SpacetimeDB');

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

  return {
    connected,
    wallet,
    statusMessage,
    player,
    connection: connectionRef.current,
    registerPlayer,
  };
}
