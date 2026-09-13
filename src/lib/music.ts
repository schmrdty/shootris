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
