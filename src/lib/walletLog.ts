'use client';

// A small in-memory trail of wallet events, so a wallet that vanishes
// mid-game can be diagnosed from the device it happened on (open any page
// with ?debug=1). Nothing is sent anywhere; it lives in the tab.

export interface WalletLogEntry {
  at: number;
  event: string;
  detail?: string;
}

const MAX_ENTRIES = 40;
const entries: WalletLogEntry[] = [];
const listeners = new Set<() => void>();

export function logWallet(event: string, detail?: string): void {
  entries.push({ at: Date.now(), event, detail });
  if (entries.length > MAX_ENTRIES) entries.shift();
  listeners.forEach((l) => l());
  if (typeof console !== 'undefined') console.log(`[wallet] ${event}`, detail ?? '');
}

export function subscribeWalletLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWalletLog(): WalletLogEntry[] {
  return entries;
}
