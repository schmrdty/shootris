'use client';

import { useEffect, useRef, useState } from 'react';

interface StageAmbienceProps {
  stage: number;
  isEarthen: boolean;
  /** Pause music (e.g. when the player has muted). */
  muted?: boolean;
}

/**
 * Per-stage background art and looping music, themed.
 * Looks for assets at:
 *   public/stages/{neon|earthen}/stage-{n}.jpg
 *   public/music/{neon|earthen}/stage-{n}.mp3
 * Missing files fail silently — drop in art/tracks as they're produced
 * (see design/stage-prompts.md) and they appear without code changes.
 * Stages beyond the available assets reuse the highest existing one is NOT
 * attempted; each stage simply shows nothing until its file exists.
 */
export function StageAmbience({ stage, isEarthen, muted = false }: StageAmbienceProps) {
  const theme = isEarthen ? 'earthen' : 'neon';
  const [bgOk, setBgOk] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgUrl = `/stages/${theme}/stage-${stage}.jpg`;
  const musicUrl = `/music/${theme}/stage-${stage}.mp3`;

  // Reset background probe when stage or theme changes
  useEffect(() => {
    setBgOk(false);
  }, [bgUrl]);

  // Music: try to (re)start on stage/theme change; browsers may block
  // autoplay until first interaction, so retry once on the next click/key.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.35;
    if (muted) {
      el.pause();
      return;
    }
    const tryPlay = () => el.play().catch(() => undefined);
    tryPlay();
    const onInteract = () => {
      tryPlay();
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
    window.addEventListener('pointerdown', onInteract);
    window.addEventListener('keydown', onInteract);
    return () => {
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
      el.pause();
    };
  }, [musicUrl, muted]);

  return (
    <>
      {/* Probe + display the stage backdrop; hidden entirely if missing */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bgUrl}
        alt=""
        aria-hidden="true"
        onLoad={() => setBgOk(true)}
        onError={() => setBgOk(false)}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover transition-opacity duration-1000"
        style={{ opacity: bgOk ? (isEarthen ? 0.3 : 0.22) : 0, zIndex: 0 }}
      />
      <audio ref={audioRef} src={musicUrl} loop preload="none" onError={() => undefined} />
    </>
  );
}
