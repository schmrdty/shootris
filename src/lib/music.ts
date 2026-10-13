'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

// Music on/off. Saved on the device so it works without a wallet, and
// shared live between every component on the page (mute button, stage
// music, settings). A connected player's saved preference seeds devices
// that have never chosen.
const MUSIC_KEY = 'shootris_music_on';
const listeners = new Set<() => void>();

function read(): boolean | null {
  try {
    const v = localStorage.getItem(MUSIC_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

function write(on: boolean): void {
  try {
    localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
  } catch {
    // storage unavailable — state still updates for this page
  }
  memory = on;
  listeners.forEach((l) => l());
}

let memory: boolean | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): boolean {
  return memory ?? read() ?? true;
}

export function useMusicPreference(serverValue?: boolean, persist?: (on: boolean) => void) {
  const musicOn = useSyncExternalStore(subscribe, snapshot, () => true);

  // First visit on this device: adopt the player's saved preference
  useEffect(() => {
    if (serverValue !== undefined && read() === null && memory === null) write(serverValue);
  }, [serverValue]);

  const setMusicOn = useCallback(
    (on: boolean) => {
      write(on);
      persist?.(on);
    },
    [persist]
  );

  return [musicOn, setMusicOn] as const;
}

// --- which soundtrack pack plays -------------------------------------------
// Arcade is the default; Zen (Midnight Tea House) is the alternative. Stored
// next to the on/off preference so a device remembers both.

export type MusicPack = 'arcade' | 'zen';

export const MUSIC_PACKS: readonly MusicPack[] = ['arcade', 'zen'];

export const MUSIC_PACK_LABELS: Record<MusicPack, string> = {
  arcade: 'Arcade',
  zen: 'Midnight Tea House',
};

export const MUSIC_PACK_BLURBS: Record<MusicPack, string> = {
  arcade: 'Electronic, hypnotic, speeds up as the stages climb.',
  zen: 'Lo-fi tea house at 84 BPM. Calm, for concentration.',
};

const PACK_KEY = 'shootris_music_pack';
const packListeners = new Set<() => void>();
let packMemory: MusicPack | null = null;

function isPack(value: unknown): value is MusicPack {
  return value === 'arcade' || value === 'zen';
}

function readPack(): MusicPack | null {
  try {
    const stored = localStorage.getItem(PACK_KEY);
    return isPack(stored) ? stored : null;
  } catch {
    return null;
  }
}

function subscribePack(listener: () => void) {
  packListeners.add(listener);
  return () => packListeners.delete(listener);
}

function packSnapshot(): MusicPack {
  return packMemory ?? readPack() ?? 'arcade';
}

export function useMusicPack() {
  const pack = useSyncExternalStore(subscribePack, packSnapshot, () => 'arcade' as MusicPack);

  const setPack = useCallback((next: MusicPack) => {
    packMemory = next;
    try {
      localStorage.setItem(PACK_KEY, next);
    } catch {
      // preference just won't persist
    }
    packListeners.forEach((listener) => listener());
  }, []);

  return [pack, setPack] as const;
}
