'use client';

import { useEffect, useState } from 'react';

// Touch-first devices (phones, tablets, mini-app webviews) get on-screen
// controls. Laptops with touchscreens keep their keyboard layout, since
// they still report a precise pointer.
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

export function useTouchControls(): boolean {
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(TOUCH_QUERY);
    const sync = () => setTouch(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return touch;
}

/** Height reserved at the bottom of the screen for the control deck. */
export const CONTROL_DECK_HEIGHT = 196;

/**
 * Largest board cell (px) that fits the viewport above the control deck.
 * `reservedTop` covers the header and info strip above the board.
 */
export function useBoardCellSize(enabled: boolean, reservedTop = 150, max = 24, min = 14): number {
  const [size, setSize] = useState(max);

  useEffect(() => {
    if (!enabled) {
      setSize(max);
      return;
    }
    const fit = () => {
      const byHeight = Math.floor((window.innerHeight - CONTROL_DECK_HEIGHT - reservedTop) / 20);
      const byWidth = Math.floor((window.innerWidth - 48) / 10);
      setSize(Math.max(min, Math.min(max, byHeight, byWidth)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [enabled, reservedTop, max, min]);

  return size;
}
