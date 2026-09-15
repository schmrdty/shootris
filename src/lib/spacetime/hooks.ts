'use client';

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
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

const DB_HOST = 'wss://maincloud.spacetimedb.com';
const DB_NAME = process.env.NEXT_PUBLIC_SPACETIME_MODULE_NAME || 'shootris-game';
const BINDING_STORAGE_KEY = 'shootris_wallet_binding';
// SpacetimeDB issues an identity token on first connect. Reusing it keeps the
// same identity across page loads, so the wallet binding (and its one-time
// signature) survives reloads, navigation and reconnects.
const TOKEN_STORAGE_KEY = 'shootris_spacetimedb_token';
const MAX_RETRY_DELAY_MS = 30_000;

function bindingMemo(wallet: string, identityHex: string): string {
  return `${wallet.toLowerCase()}:${identityHex}`;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable — this session still works, it just won't persist
  }
}

// ── Shared connection ────────────────────────────────────────────────────
// One socket per tab, shared by every page and component. It reconnects
// with backoff after drops and immediately when the app returns to the
// foreground (mobile webviews suspend sockets in the background).

interface ConnectionSnapshot {
  connection: DbConnection | null;
  connected: boolean;
  identityHex: string | null;
  statusMessage: string;
}

let snapshot: ConnectionSnapshot = {
  connection: null,
  connected: false,
  identityHex: null,
  statusMessage: 'Initializing...',
};
const serverSnapshot = snapshot;
const listeners = new Set<() => void>();
let started = false;
let connecting = false;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let tokenFailures = 0;

function update(patch: Partial<ConnectionSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

function scheduleReconnect() {
  if (retryTimer) return;
  const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** retryCount);
  retryCount++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

function reconnectNow() {
  if (snapshot.connected || connecting) return;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  connect();
}

function connect() {
  if (connecting || snapshot.connected) return;
  connecting = true;
  const savedToken = readStorage(TOKEN_STORAGE_KEY) ?? undefined;

  moduleBindings.DbConnection.builder()
    .withUri(DB_HOST)
    .withModuleName(DB_NAME)
    .withToken(savedToken)
    .onConnect((connection, identity, token) => {
      connecting = false;
      retryCount = 0;
      tokenFailures = 0;
      if (token) writeStorage(TOKEN_STORAGE_KEY, token);

      connection
        .subscriptionBuilder()
        .onError((ctx: moduleBindings.ErrorContext) => {
          // warn, not error: expected until the SpacetimeDB module is published
          console.warn('SpacetimeDB subscription unavailable:', ctx.event);
          update({ statusMessage: 'Game server unavailable — stats and PvP are offline' });
        })
        .subscribe([
          'SELECT * FROM players',
          'SELECT * FROM game_runs',
          'SELECT * FROM sp_leaderboard',
          'SELECT * FROM pvp_leaderboard',
          'SELECT * FROM pvp_matches',
          'SELECT * FROM payment_records',
          'SELECT * FROM match_queue',
        ]);

      let identityHex: string | null = null;
      try {
        identityHex = identity.toHexString().replace(/^0x/, '').toLowerCase();
      } catch {
        // identity unavailable — binding flow will be skipped
      }
      update({ connection, connected: true, identityHex, statusMessage: 'Connected to SpacetimeDB' });
    })
    .onConnectError((_ctx, error) => {
      connecting = false;
      console.warn('SpacetimeDB connection failed:', error?.message ?? error);
      // A token the server keeps refusing is useless — start a fresh identity
      if (savedToken && ++tokenFailures >= 3) {
        writeStorage(TOKEN_STORAGE_KEY, null);
        tokenFailures = 0;
      }
      update({ connected: false, connection: null, statusMessage: 'Reconnecting to game server…' });
      scheduleReconnect();
    })
    .onDisconnect((_ctx, error) => {
      connecting = false;
      console.log('SpacetimeDB disconnected:', error?.message ?? 'connection closed');
      update({ connected: false, connection: null, statusMessage: 'Reconnecting to game server…' });
      scheduleReconnect();
    })
    .build();
}

function startConnection() {
  if (started || typeof window === 'undefined') return;
  started = true;
  connect();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconnectNow();
  });
  window.addEventListener('online', reconnectNow);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startConnection();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => serverSnapshot;

// Shared across hook instances so several mounted components never prompt
// for the same signature, or register the same player, twice.
const bindInFlight = new Set<string>();
const registeredOn = new WeakMap<DbConnection, Set<string>>();

// ── Hook ─────────────────────────────────────────────────────────────────

export function useSpacetimeDB(wallet: string | null) {
  const { connection, connected, identityHex, statusMessage: sharedStatus } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const [player, setPlayer] = useState<Player | null>(null);
  const [bindStatus, setBindStatus] = useState<string | null>(null);
  const [bound, setBound] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindAttempt, setBindAttempt] = useState(0);

  /** Re-run wallet verification after a declined or failed signature. */
  const retryBinding = useCallback(() => {
    setBindStatus(null);
    setBindAttempt((n) => n + 1);
  }, []);
  const { signMessageAsync } = useSignMessage();

  const registerPlayer = useCallback(
    (walletAddr: string) => {
      if (!connection || !connected) return;
      connection.reducers.registerPlayer(walletAddr.toLowerCase());
    },
    [connection, connected]
  );

  // Track the connected wallet's player row on the current connection
  useEffect(() => {
    if (!connection || !wallet) {
      setPlayer(null);
      return;
    }
    const w = wallet.toLowerCase();
    let found: Player | null = null;
    for (const row of connection.db.players.iter()) {
      if (row.wallet.toLowerCase() === w) {
        found = row;
        break;
      }
    }
    setPlayer(found);

    const onInsert = (_ctx: moduleBindings.EventContext, row: Player) => {
      if (row.wallet.toLowerCase() === w) setPlayer(row);
    };
    const onUpdate = (_ctx: moduleBindings.EventContext, _old: Player, row: Player) => {
      if (row.wallet.toLowerCase() === w) setPlayer(row);
    };
    connection.db.players.onInsert(onInsert);
    connection.db.players.onUpdate(onUpdate);
    return () => {
      connection.db.players.removeOnInsert(onInsert);
      connection.db.players.removeOnUpdate(onUpdate);
    };
  }, [connection, wallet]);

  // Register the player once per wallet per connection
  useEffect(() => {
    if (!connection || !connected || !wallet || player) return;
    const w = wallet.toLowerCase();
    let seen = registeredOn.get(connection);
    if (!seen) {
      seen = new Set();
      registeredOn.set(connection, seen);
    }
    if (seen.has(w)) return;
    seen.add(w);
    connection.reducers.registerPlayer(w);
  }, [connection, connected, wallet, player]);

  // Bind wallet <-> SpacetimeDB identity (one-time signature per identity).
  // The signature is verified server-side (/api/bind) and attested into the
  // module, which rejects score writes from unbound identities.
  useEffect(() => {
    if (!connected || !wallet || !identityHex) {
      setBound(false);
      return;
    }
    const w = wallet.toLowerCase();
    const memo = bindingMemo(w, identityHex);
    if (readStorage(BINDING_STORAGE_KEY) === memo) {
      setBound(true);
      return;
    }
    setBound(false);
    if (bindInFlight.has(memo)) return;
    bindInFlight.add(memo);
    setBinding(true);

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
          writeStorage(BINDING_STORAGE_KEY, memo);
          setBound(true);
          setBindStatus('Wallet verified');
        } else {
          console.warn('Wallet binding failed:', await res.text());
          setBindStatus('Wallet verification failed — scores will not be saved');
        }
      } catch (error) {
        console.warn('Wallet binding skipped:', error);
        setBindStatus('Wallet verification declined — scores will not be saved');
      } finally {
        bindInFlight.delete(memo);
        setBinding(false);
      }
    })();
  }, [connected, wallet, identityHex, signMessageAsync, bindAttempt]);

  return {
    connected,
    wallet,
    statusMessage: bindStatus ?? sharedStatus,
    player,
    bound,
    binding,
    retryBinding,
    connection,
    registerPlayer,
  };
}
