'use client';

import { useGameTheme } from '@/lib/theme';

interface ShootrisLogoProps {
  /** Extra classes for sizing; defaults scale from phone to TV. */
  className?: string;
  priority?: boolean;
}

/**
 * The hand-drawn Shootris wordmark: tetromino pillars with laser slashes
 * bookending handwritten script. Two inked versions ship — cream strokes for
 * the neon theme, black for earthen — so the script never disappears into
 * the background.
 */
export function ShootrisLogo({ className, priority = false }: ShootrisLogoProps) {
  const { isEarthen } = useGameTheme();
  const base = isEarthen ? '/brand/logo-light' : '/brand/logo-dark';

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${base}.png`}
      srcSet={`${base}.png 1x, ${base}@2x.png 2x`}
      width={471}
      height={280}
      alt="Shootris"
      fetchPriority={priority ? 'high' : 'auto'}
      className={
        className ??
        'w-full max-w-[260px] sm:max-w-[380px] lg:max-w-[460px] h-auto mx-auto select-none'
      }
      style={{
        filter: isEarthen
          ? 'drop-shadow(0 2px 4px rgba(70,55,35,0.28))'
          : 'drop-shadow(0 0 18px rgba(240,200,60,0.30))',
      }}
      draggable={false}
    />
  );
}
