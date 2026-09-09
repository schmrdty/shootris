'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type GameTheme = 'neon' | 'earthen';

const THEME_STORAGE_KEY = 'shootris_theme';

// The engine stores the NEON hex codes in board state (they double as piece
// identifiers, including in PvP board sync). Themes remap them at render
// time only, so switching themes never touches game state or the network.
export const EARTHEN_COLORS: Record<string, string> = {
  '#00f0f0': '#7c9a5a', // I — moss
  '#f0f000': '#d8b578', // O — sandstone
  '#a000f0': '#9a5f8f', // T — foxglove
  '#00f000': '#557a46', // S — fern
  '#f00000': '#a8492f', // Z — clay
  '#0000f0': '#5e6f7b', // J — river slate
  '#f0a000': '#c68a3f', // L — ochre
  '#6b7280': '#857a68', // PvP obstacle — weathered stone
};

interface GameThemeContextValue {
  theme: GameTheme;
  isEarthen: boolean;
  setTheme: (theme: GameTheme) => void;
  /** Map an engine color to its themed render color. */
  mapColor: (color: string) => string;
  /** Board cell styling for the active theme. */
  cellStyle: (color: string | null, size: number) => React.CSSProperties;
  emptyCellColor: string;
}

const GameThemeContext = createContext<GameThemeContextValue | null>(null);

export function GameThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<GameTheme>('neon');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'earthen' || stored === 'neon') setThemeState(stored);
    } catch {
      // storage unavailable — default stands
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: GameTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // preference just won't persist
    }
  }, []);

  const isEarthen = theme === 'earthen';

  const mapColor = useCallback(
    (color: string) => (isEarthen ? EARTHEN_COLORS[color] ?? color : color),
    [isEarthen]
  );

  const emptyCellColor = isEarthen ? '#efe7d4' : '#000';

  const cellStyle = useCallback(
    (color: string | null, size: number): React.CSSProperties => {
      const themed = color ? (isEarthen ? EARTHEN_COLORS[color] ?? color : color) : null;
      return {
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: themed || (isEarthen ? '#efe7d4' : '#000'),
        boxShadow: themed
          ? isEarthen
            ? `inset 0 ${size / 12}px ${size / 6}px rgba(255,250,235,0.45), inset 0 -${size / 12}px ${size / 6}px rgba(60,44,26,0.45)`
            : `0 0 ${size / 3}px ${themed}, inset 0 0 ${size / 3}px ${themed}`
          : 'none',
      };
    },
    [isEarthen]
  );

  return (
    <GameThemeContext.Provider value={{ theme, isEarthen, setTheme, mapColor, cellStyle, emptyCellColor }}>
      {children}
    </GameThemeContext.Provider>
  );
}

export function useGameTheme(): GameThemeContextValue {
  const ctx = useContext(GameThemeContext);
  if (!ctx) throw new Error('useGameTheme must be used within GameThemeProvider');
  return ctx;
}
