/**
 * The adaptive soundtrack's state machine, as pure functions.
 *
 * One state is active at a time. Conditions are evaluated in priority order
 * and the first match wins; if nothing matches, the current state is held
 * (Calm on startup). Nothing here touches the Web Audio API or the DOM, so it
 * runs identically on the server, in a test, and in the game loop.
 */

export type AudioState = 'danger' | 'recovery' | 'intense' | 'focus' | 'flow' | 'calm';

export type StemName =
  | 'BASS'
  | 'DRUMS'
  | 'ROOM'
  | 'MOTION'
  | 'CHORDS'
  | 'THEME'
  | 'DANGER'
  | 'RECOVERY';

/** STEM_01..STEM_08 order — the order the engine loads and mixes them in. */
export const STEM_NAMES: readonly StemName[] = [
  'BASS',
  'DRUMS',
  'ROOM',
  'MOTION',
  'CHORDS',
  'THEME',
  'DANGER',
  'RECOVERY',
];

/** States in evaluation (priority) order, highest priority first. */
export const AUDIO_STATES: readonly AudioState[] = [
  'danger',
  'recovery',
  'intense',
  'focus',
  'flow',
  'calm',
];

export function stemId(name: StemName): string {
  return `STEM_${String(STEM_NAMES.indexOf(name) + 1).padStart(2, '0')}`;
}

/** What the game tells the soundtrack. Everything is derived in the hook. */
export interface GameVariables {
  board_fill_percent: number;
  combo_count: number;
  pieces_per_minute: number;
  score_rate: number;
  mistakes_last_60s: number;
  time_alive_seconds: number;
  danger_mode: boolean;
  pause_state: boolean;
}

export const DEFAULT_GAME_VARIABLES: GameVariables = {
  board_fill_percent: 0,
  combo_count: 0,
  pieces_per_minute: 0,
  score_rate: 0,
  mistakes_last_60s: 0,
  time_alive_seconds: 0,
  danger_mode: false,
  pause_state: false,
};

/**
 * Points per minute that counts as Intense.
 *
 * Zero means disabled: Shootris does not yet have a tuned figure, and a
 * literal `score_rate > 0` would put every run that is scoring at all into
 * Intense. Pass a positive `intenseScoreRate` in the thresholds once the game
 * has a number it believes in, and the condition starts applying.
 */
export const INTENSE_SCORE_RATE = 0;

export const RECOVERY_DURATION_MS = 15_000;

export interface AudioStateThresholds {
  /** Danger above this board fill. */
  dangerFillPercent: number;
  /** Recovery once the board drains below this. */
  recoveryFillPercent: number;
  /** Flow needs the board under this. */
  flowFillPercent: number;
  /** Calm needs the board under this. */
  calmFillPercent: number;
  /** Intense above this piece rate. */
  intensePiecesPerMinute: number;
  /** Intense above this score rate; zero or less disables the condition. */
  intenseScoreRate: number;
  /** Focus needs at least this combo. */
  focusCombo: number;
  /** Focus allows at most this many mistakes in the last 60 seconds. */
  focusMaxMistakes: number;
  /** Flow needs at least this combo. */
  flowCombo: number;
  /** How long Recovery lasts, in milliseconds. */
  recoveryDurationMs: number;
}

export const DEFAULT_THRESHOLDS: AudioStateThresholds = {
  dangerFillPercent: 80,
  recoveryFillPercent: 60,
  flowFillPercent: 50,
  calmFillPercent: 30,
  intensePiecesPerMinute: 30,
  intenseScoreRate: INTENSE_SCORE_RATE,
  focusCombo: 10,
  focusMaxMistakes: 1,
  flowCombo: 3,
  recoveryDurationMs: RECOVERY_DURATION_MS,
};

export interface AudioStateSnapshot {
  state: AudioState;
  /** The state the previous evaluation produced; null before the first one. */
  previousState: AudioState | null;
  /** Timestamp the current state was entered, in the caller's clock. */
  enteredAt: number;
  /**
   * True once the run has been in Danger and has not yet been given its
   * relief. The spec's rule is `previous_state == Danger`, which only fires
   * when the board happens to cross from above 80% to below 60% between two
   * evaluations; latching it means a board that drains gradually through the
   * 60-80% band still gets its Recovery, and the single-tick case behaves
   * exactly as the spec describes.
   */
  dangerPending: boolean;
  /** When the current Recovery stops holding; null when not in Recovery. */
  recoveryEndsAt: number | null;
}

export function initialAudioState(now: number): AudioStateSnapshot {
  return {
    state: 'calm',
    previousState: null,
    enteredAt: now,
    dangerPending: false,
    recoveryEndsAt: null,
  };
}

function isDanger(v: GameVariables, t: AudioStateThresholds): boolean {
  return v.board_fill_percent > t.dangerFillPercent || v.danger_mode;
}

function isIntense(v: GameVariables, t: AudioStateThresholds): boolean {
  if (v.pieces_per_minute > t.intensePiecesPerMinute) return true;
  return t.intenseScoreRate > 0 && v.score_rate > t.intenseScoreRate;
}

function isFocus(v: GameVariables, t: AudioStateThresholds): boolean {
  return v.combo_count >= t.focusCombo && v.mistakes_last_60s <= t.focusMaxMistakes;
}

function isFlow(v: GameVariables, t: AudioStateThresholds): boolean {
  return v.combo_count >= t.flowCombo && v.board_fill_percent < t.flowFillPercent;
}

function isCalm(v: GameVariables, t: AudioStateThresholds): boolean {
  // "combo_count < 3" is the same number as the Flow threshold: Calm is the
  // state for a run that has not started comboing yet.
  return v.board_fill_percent < t.calmFillPercent && v.combo_count < t.flowCombo;
}

/**
 * Advance the state machine one tick.
 *
 * `now` is a monotonic millisecond clock (performance.now() in the browser).
 * Pause does not change the state — the engine ducks the master gain instead,
 * so unpausing resumes the same music in the same place.
 */
export function evaluateAudioState(
  previous: AudioStateSnapshot,
  variables: GameVariables,
  now: number,
  thresholds: AudioStateThresholds = DEFAULT_THRESHOLDS
): AudioStateSnapshot {
  let dangerPending = previous.dangerPending;
  let recoveryEndsAt = previous.recoveryEndsAt;
  let state: AudioState;

  if (isDanger(variables, thresholds)) {
    // 1. Danger. Entering it means relief is owed once the board drains, and
    //    any Recovery already running is cut short.
    state = 'danger';
    dangerPending = true;
    recoveryEndsAt = null;
  } else if (recoveryEndsAt !== null && now < recoveryEndsAt) {
    // 2a. Recovery is holding out its 15 seconds.
    state = 'recovery';
  } else if (dangerPending && variables.board_fill_percent < thresholds.recoveryFillPercent) {
    // 2b. Danger is over and the board has drained: start the relief.
    state = 'recovery';
    dangerPending = false;
    recoveryEndsAt = now + thresholds.recoveryDurationMs;
  } else {
    recoveryEndsAt = null;
    if (isIntense(variables, thresholds)) {
      state = 'intense'; // 3
    } else if (isFocus(variables, thresholds)) {
      state = 'focus'; // 4
    } else if (isFlow(variables, thresholds)) {
      state = 'flow'; // 5
    } else if (isCalm(variables, thresholds)) {
      state = 'calm'; // 6
    } else {
      // Nothing matched — hold what is playing rather than picking a state
      // the run has not earned.
      state = previous.state;
    }
  }

  return {
    state,
    previousState: previous.state,
    enteredAt: state === previous.state ? previous.enteredAt : now,
    dangerPending,
    recoveryEndsAt,
  };
}

/** Target gain per state per stem — the spec's mixing matrix. */
export const MIX_MATRIX: Record<AudioState, Record<StemName, number>> = {
  calm: { BASS: 1.0, DRUMS: 0.8, ROOM: 1.0, MOTION: 0.2, CHORDS: 0.7, THEME: 0.0, DANGER: 0.0, RECOVERY: 0.0 },
  flow: { BASS: 1.0, DRUMS: 1.0, ROOM: 1.0, MOTION: 0.5, CHORDS: 0.8, THEME: 0.2, DANGER: 0.0, RECOVERY: 0.0 },
  focus: { BASS: 1.0, DRUMS: 1.0, ROOM: 1.0, MOTION: 0.7, CHORDS: 1.0, THEME: 0.5, DANGER: 0.0, RECOVERY: 0.0 },
  intense: { BASS: 1.0, DRUMS: 1.0, ROOM: 1.0, MOTION: 0.9, CHORDS: 1.0, THEME: 0.6, DANGER: 0.3, RECOVERY: 0.0 },
  danger: { BASS: 1.0, DRUMS: 0.6, ROOM: 1.0, MOTION: 0.0, CHORDS: 0.3, THEME: 0.0, DANGER: 1.0, RECOVERY: 0.0 },
  recovery: { BASS: 1.0, DRUMS: 0.8, ROOM: 1.0, MOTION: 0.3, CHORDS: 0.8, THEME: 0.1, DANGER: 0.0, RECOVERY: 1.0 },
};

export function gainsForState(state: AudioState): Record<StemName, number> {
  return MIX_MATRIX[state];
}

export function stemGain(state: AudioState, stem: StemName): number {
  return MIX_MATRIX[state][stem];
}

/** A stem that is audible in every state, so the engine never lets it stop. */
export function isAlwaysActive(stem: StemName): boolean {
  return AUDIO_STATES.every((state) => MIX_MATRIX[state][stem] > 0);
}

/** A stem the Calm mix needs — these load first so music starts fast. */
export function audibleInCalm(stem: StemName): boolean {
  return MIX_MATRIX.calm[stem] > 0;
}

/**
 * Which Arcade BPM tier to play.
 *
 * Shootris has stages, so the tier is the stage number clamped to the tiers
 * that exist. `arcadeTierForTime` is the fallback for a mode without stages:
 * one tier every 90 seconds, capped at the fastest tier.
 */
export function arcadeTierForStage(stage: number, tiers: readonly number[]): number {
  if (tiers.length === 0) throw new Error('no BPM tiers available');
  const index = Math.min(Math.max(Math.floor(stage) - 1, 0), tiers.length - 1);
  return tiers[index];
}

export const SECONDS_PER_TIER = 90;

export function arcadeTierForTime(timeAliveSeconds: number, tiers: readonly number[]): number {
  if (tiers.length === 0) throw new Error('no BPM tiers available');
  const index = Math.min(
    Math.max(Math.floor(timeAliveSeconds / SECONDS_PER_TIER), 0),
    tiers.length - 1
  );
  return tiers[index];
}
