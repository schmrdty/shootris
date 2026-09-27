'use client';

import { useEffect, useState } from 'react';
import { isAddress } from 'viem';

function shortAddress(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

// One lookup per address per tab, shared by every row that shows it. The
// leaderboard renders the same wallets repeatedly, and this page used to
// start a fresh onchain lookup for each one.
const resolved = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function lookup(address: string): Promise<string | null> {
  const done = resolved.get(address);
  if (done !== undefined) return Promise.resolve(done);
  const pending = inFlight.get(address);
  if (pending) return pending;

  const request = fetch(`/api/name/${address}`)
    .then((r) => (r.ok ? r.json() : { name: null }))
    .then((data: { name?: string | null }) => data?.name ?? null)
    .catch(() => null)
    .then((name) => {
      resolved.set(address, name);
      inFlight.delete(address);
      return name;
    });
  inFlight.set(address, request);
  return request;
}

/**
 * Show a player's Basename or ENS name, falling back to a short address.
 * The lookup runs on our server (/api/name), which checks Base first, then
 * Ethereum, and only accepts a name whose forward record resolves back to
 * the same address.
 */
export function PlayerName({ wallet, className }: { wallet: string; className?: string }) {
  const valid = isAddress(wallet);
  const key = valid ? wallet.toLowerCase() : '';
  const [name, setName] = useState<string | null>(() => (key ? resolved.get(key) ?? null : null));

  useEffect(() => {
    if (!key) return;
    let active = true;
    lookup(key).then((found) => {
      if (active) setName(found);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return (
    <span className={className} title={wallet}>
      {name || shortAddress(wallet)}
    </span>
  );
}
