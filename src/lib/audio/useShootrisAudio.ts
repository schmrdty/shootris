'use client';

/**
 * Feeds the game into the adaptive soundtrack.
 *
 * Shootris tracks four of the eight variables the state machine wants, so the
 * rest are derived here: board fill and covered holes from the board itself,
 * piece rate and mistakes from rolling sixty-second windows, time alive from a
 * clock that stops when the board is held. No gameplay code is changed beyond
 * the two counters the engine now exposes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ShootrisAudioEngine,
  loadPackMeta,
  isAudioSupported,
  type PackMeta,
} from './engine';
import {
  DEFAULT_GAME_VARIABLES,
  DEFAULT_THRESHOLDS,
  arcadeTierForStage,
  evaluateAudioState,
  initialAudioState,
  type AudioState,
  type AudioStateThresholds,
  type GameVariables,
} from './stateMachine';
import { boardFillPercent, countCoveredHoles } from './boardStats';
import type { MusicPack } from '../music';

export { boardFillPercent, countCoveredHoles } from './boardStats';

/** How often the state machine is re-evaluated. */
const TICK_MS = 250;
const WINDOW_SECONDS = 60;
/**
 * Shortest window the rates are measured over. Without a floor, the first
 * locked piece of a run would read as a rate of several hundred a minute.
 */
const MIN_WINDOW_SECONDS = 10;

export interface UseShootrisAudioOptions {
  /** False while the player has music muted — nothing is fetched or played. */
  enabled: boolean;
  /** Which pack to play. */
  pack: MusicPack;
  /** The live board. Null before a run starts. */
  board: (string | null)[][] | null;
  /** Monotonic count of locked pieces, from GameState. */
  piecesPlaced: number;
  /** Consecutive clearing locks, from GameState. */
  combo: number;
  score: number;
  /** 1-based stage; chooses the Arcade BPM tier. */
  stage: number;
  /** True while the board is held, the run is over, or no mode is chosen. */
  paused: boolean;
  /** True before a run has begun: no music until the player is playing. */
  idle?: boolean;
  /** An extra danger signal, e.g. a Journey level timer about to expire. */
  dangerMode?: boolean;
  /** Changes to start a fresh run's rolling windows. */
  runKey?: string | number;
  thresholds?: Partial<AudioStateThresholds>;
  masterVolume?: number;
}

/** What the hook keeps in React state — it changes rarely, unlike the variables. */
interface EngineStatus {
  ready: boolean;
  state: AudioState;
  pack: MusicPack | null;
  bpm: number | null;
  error: string | null;
}

export interface ShootrisAudioStatus {
  /** True once a gesture has unlocked audio and a pack is playing. */
  ready: boolean;
  /** Whether this browser can play adaptive audio at all. */
  supported: boolean;
  state: AudioState;
  pack: MusicPack | null;
  bpm: number | null;
  /**
   * The derived variables, live. This object is mutated in place every tick
   * rather than put in React state, so a debug overlay can read it without
   * re-rendering the game four times a second.
   */
  variables: Readonly<GameVariables>;
  error: string | null;
}

function trim(times: number[], now: number): void {
  const cutoff = now - WINDOW_SECONDS * 1000;
  while (times.length > 0 && times[0] < cutoff) times.shift();
}

export function useShootrisAudio(options: UseShootrisAudioOptions): ShootrisAudioStatus {
  const {
    enabled,
    pack,
    board,
    piecesPlaced,
    combo,
    score,
    stage,
    paused,
    idle = false,
    dangerMode = false,
    runKey = 0,
    thresholds,
    masterVolume,
  } = options;

  const engineRef = useRef<ShootrisAudioEngine | null>(null);
  const metaRef = useRef<Map<MusicPack, PackMeta>>(new Map());
  const snapshotRef = useRef(initialAudioState(0));
  const variablesRef = useRef<GameVariables>({ ...DEFAULT_GAME_VARIABLES });

  // Rolling windows and the run clock.
  const lockTimesRef = useRef<number[]>([]);
  const mistakeTimesRef = useRef<number[]>([]);
  const scoreSamplesRef = useRef<Array<{ at: number; score: number }>>([]);
  const lastPiecesRef = useRef(piecesPlaced);
  const lastHolesRef = useRef(0);
  const aliveMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  // Live inputs, read by the tick without making it a dependency.
  const inputsRef = useRef({ board, piecesPlaced, combo, score, paused, idle, dangerMode });
  inputsRef.current = { board, piecesPlaced, combo, score, paused, idle, dangerMode };

  const [status, setStatus] = useState<EngineStatus>({
    ready: false,
    state: 'calm',
    pack: null,
    bpm: null,
    error: null,
  });

  const supported = useMemo(() => isAudioSupported(), []);

  const resolvedThresholds = useMemo(
    () => ({ ...DEFAULT_THRESHOLDS, ...thresholds }),
    [thresholds]
  );

  // One engine per mount. Created lazily so nothing touches Web Audio during
  // server rendering.
  const engine = useCallback((): ShootrisAudioEngine | null => {
    if (!supported) return null;
    if (!engineRef.current) {
      engineRef.current = new ShootrisAudioEngine({
        masterVolume,
        onError: (error, context) => {
          // Audio problems never interrupt a run; they are reported for the
          // console and for whatever UI wants them.
          console.warn(`[shootris-audio] ${context}`, error);
          setStatus((prev: EngineStatus) => ({ ...prev, error: `${context}: ${String(error)}` }));
        },
      });
    }
    return engineRef.current;
  }, [supported, masterVolume]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    []
  );

  // A new run restarts the windows and the clock.
  useEffect(() => {
    lockTimesRef.current = [];
    mistakeTimesRef.current = [];
    scoreSamplesRef.current = [];
    lastPiecesRef.current = 0;
    lastHolesRef.current = 0;
    aliveMsRef.current = 0;
    lastTickRef.current = null;
    snapshotRef.current = initialAudioState(
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    );
  }, [runKey]);

  // Pack metadata is a plain fetch, so it can be warmed before any gesture —
  // but only once the player has music on, so a muted player downloads nothing.
  useEffect(() => {
    if (!enabled || !supported) return;
    if (metaRef.current.has(pack)) return;
    const controller = new AbortController();
    loadPackMeta(pack, controller.signal)
      .then((meta) => {
        metaRef.current.set(pack, meta);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStatus((prev: EngineStatus) => ({ ...prev, error: `meta:${pack}: ${String(error)}` }));
      });
    return () => controller.abort();
  }, [enabled, pack, supported]);

  /** Start (or switch to) the chosen pack. Requires an unlocked context. */
  const startPack = useCallback(async () => {
    const instance = engine();
    if (!instance || !enabled) return;
    let meta = metaRef.current.get(pack);
    if (!meta) {
      meta = await loadPackMeta(pack);
      metaRef.current.set(pack, meta);
    }
    const bpm = arcadeTierForStage(inputsRef.current.idle ? 1 : stage, meta.bpm_tiers);
    await instance.play(meta, bpm, snapshotRef.current.state);
    setStatus((prev: EngineStatus) => ({
      ...prev,
      ready: instance.isPlaying,
      pack,
      bpm: instance.currentTier,
    }));
  }, [enabled, engine, pack, stage]);

  // Browsers refuse an AudioContext until the page has been interacted with,
  // so the first gesture of any kind starts the music. No error is surfaced
  // before that point — there is nothing wrong yet.
  useEffect(() => {
    if (!enabled || !supported || idle) return;
    const instance = engine();
    if (!instance) return;

    let cancelled = false;
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];

    const onGesture = () => {
      void (async () => {
        if (cancelled) return;
        if (!(await instance.unlock())) return;
        remove();
        await startPack();
      })();
    };
    const remove = () => {
      events.forEach((event) => window.removeEventListener(event, onGesture));
    };

    if (instance.isUnlocked) {
      void startPack();
    } else {
      events.forEach((event) => window.addEventListener(event, onGesture, { passive: true }));
    }

    return () => {
      cancelled = true;
      remove();
    };
  }, [enabled, supported, idle, engine, startPack]);

  // Muting keeps the music running at zero so unmuting is instant and in place.
  useEffect(() => {
    const instance = engineRef.current;
    if (!instance) return;
    instance.setMasterVolume(enabled ? (masterVolume ?? 0.55) : 0);
  }, [enabled, masterVolume]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  // Switching packs mid-run crossfades rather than cutting.
  useEffect(() => {
    const instance = engineRef.current;
    if (!instance || !instance.isPlaying || !enabled) return;
    if (instance.currentPack === pack) return;
    void startPack();
  }, [pack, enabled, startPack]);

  // The tick: derive, evaluate, and tell the engine. Only a state or tier
  // change reaches React, so the game is not re-rendered four times a second.
  useEffect(() => {
    if (!enabled || !supported) return;
    const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const tick = () => {
      const now = clock();
      const input = inputsRef.current;
      const previousTick = lastTickRef.current;
      lastTickRef.current = now;

      // Time alive stops while the board is held.
      if (previousTick !== null && !input.paused && !input.idle) {
        aliveMsRef.current += now - previousTick;
      }

      // Each newly locked piece is a timestamp in the rate window, and a
      // mistake if it sealed in a new hole.
      const holes = countCoveredHoles(input.board);
      if (input.piecesPlaced > lastPiecesRef.current) {
        const locked = input.piecesPlaced - lastPiecesRef.current;
        for (let i = 0; i < locked; i += 1) lockTimesRef.current.push(now);
        if (holes > lastHolesRef.current) mistakeTimesRef.current.push(now);
      }
      lastPiecesRef.current = input.piecesPlaced;
      lastHolesRef.current = holes;

      scoreSamplesRef.current.push({ at: now, score: input.score });

      trim(lockTimesRef.current, now);
      trim(mistakeTimesRef.current, now);
      const cutoff = now - WINDOW_SECONDS * 1000;
      while (
        scoreSamplesRef.current.length > 2 &&
        scoreSamplesRef.current[1].at < cutoff
      ) {
        scoreSamplesRef.current.shift();
      }

      const aliveSeconds = aliveMsRef.current / 1000;
      const rateWindow = Math.max(MIN_WINDOW_SECONDS, Math.min(WINDOW_SECONDS, aliveSeconds));
      const oldest = scoreSamplesRef.current[0];
      const scoreSpan = Math.max(MIN_WINDOW_SECONDS, (now - oldest.at) / 1000);

      const variables = variablesRef.current;
      variables.board_fill_percent = boardFillPercent(input.board);
      variables.combo_count = input.combo;
      variables.pieces_per_minute = (lockTimesRef.current.length / rateWindow) * 60;
      variables.score_rate = ((input.score - oldest.score) / scoreSpan) * 60;
      variables.mistakes_last_60s = mistakeTimesRef.current.length;
      variables.time_alive_seconds = aliveSeconds;
      variables.danger_mode = input.dangerMode;
      variables.pause_state = input.paused;

      const next = evaluateAudioState(snapshotRef.current, variables, now, resolvedThresholds);
      snapshotRef.current = next;

      const instance = engineRef.current;
      if (!instance) return;

      if (instance.isPlaying) {
        instance.setState(next.state);
        const meta = metaRef.current.get(pack);
        if (meta) {
          const tier = arcadeTierForStage(stage, meta.bpm_tiers);
          if (instance.currentTier !== null && instance.currentTier !== tier) {
            instance.setTier(tier);
          }
        }
      }

      setStatus((prev: EngineStatus) =>
        prev.state === next.state &&
        prev.bpm === instance.currentTier &&
        prev.ready === instance.isPlaying
          ? prev
          : { ...prev, state: next.state, bpm: instance.currentTier, ready: instance.isPlaying }
      );
    };

    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled, supported, pack, stage, resolvedThresholds]);

  return {
    ready: status.ready,
    supported,
    state: status.state,
    pack: status.pack,
    bpm: status.bpm,
    variables: variablesRef.current,
    error: status.error,
  };
}
