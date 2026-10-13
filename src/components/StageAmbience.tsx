'use client';

import { useEffect, useState } from 'react';

interface StageAmbienceProps {
  stage: number;
  isEarthen: boolean;
}

/**
 * Per-stage background art, themed.
 * Looks for assets at:
 *   public/stages/{neon|earthen}/stage-{n}.jpg
 * Missing files fail silently — drop in art as it's produced and it appears
 * without code changes. Stages beyond the available assets simply show
 * nothing; the highest existing one is not reused.
 *
 * Music used to live here too, as one looping file per stage. It is now the
 * adaptive soundtrack: see lib/audio/useShootrisAudio.
 */
export function StageAmbience({ stage, isEarthen }: StageAmbienceProps) {
  const theme = isEarthen ? 'earthen' : 'neon';
  const [bgOk, setBgOk] = useState(false);
  const bgUrl = `/stages/${theme}/stage-${stage}.jpg`;

  // Reset background probe when stage or theme changes
  useEffect(() => {
    setBgOk(false);
  }, [bgUrl]);

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={bgUrl}
      alt=""
      aria-hidden="true"
      onLoad={() => setBgOk(true)}
      onError={() => setBgOk(false)}
      className="pointer-events-none fixed inset-0 h-full w-full object-cover transition-opacity duration-1000"
      style={{ opacity: bgOk ? (isEarthen ? 0.3 : 0.22) : 0, zIndex: 0 }}
    />
  );
}
