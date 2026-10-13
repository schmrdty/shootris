/**
 * Validation test 10: every state, the priority order, and Recovery's
 * fifteen-second timeout.
 *
 *   node --experimental-strip-types --test src/lib/audio/stateMachine.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO_STATES,
  DEFAULT_GAME_VARIABLES,
  DEFAULT_THRESHOLDS,
  INTENSE_SCORE_RATE,
  MIX_MATRIX,
  RECOVERY_DURATION_MS,
  SECONDS_PER_TIER,
  STEM_NAMES,
  arcadeTierForStage,
  arcadeTierForTime,
  audibleInCalm,
  evaluateAudioState,
  gainsForState,
  initialAudioState,
  isAlwaysActive,
  stemGain,
  stemId,
  type AudioState,
  type AudioStateSnapshot,
  type GameVariables,
} from './stateMachine.ts';

const TIERS = [95, 105, 115, 125, 135, 145] as const;

function vars(overrides: Partial<GameVariables> = {}): GameVariables {
  return { ...DEFAULT_GAME_VARIABLES, ...overrides };
}

/** Run a sequence of ticks and return the states they produced. */
function walk(
  steps: Array<{ at: number; vars: Partial<GameVariables> }>,
  from: AudioStateSnapshot = initialAudioState(0)
): { states: AudioState[]; snapshot: AudioStateSnapshot } {
  let snapshot = from;
  const states: AudioState[] = [];
  for (const step of steps) {
    snapshot = evaluateAudioState(snapshot, vars(step.vars), step.at);
    states.push(snapshot.state);
  }
  return { states, snapshot };
}

// --- startup ---------------------------------------------------------------

test('starts in Calm with no previous state', () => {
  const snapshot = initialAudioState(1234);
  assert.equal(snapshot.state, 'calm');
  assert.equal(snapshot.previousState, null);
  assert.equal(snapshot.enteredAt, 1234);
  assert.equal(snapshot.dangerPending, false);
  assert.equal(snapshot.recoveryEndsAt, null);
});

// --- every state is reachable ---------------------------------------------

test('Calm: an empty board and no combo', () => {
  const { snapshot } = walk([{ at: 0, vars: { board_fill_percent: 12, combo_count: 0 } }]);
  assert.equal(snapshot.state, 'calm');
});

test('Flow: combo 3 and the board under half', () => {
  const { snapshot } = walk([{ at: 0, vars: { board_fill_percent: 40, combo_count: 3 } }]);
  assert.equal(snapshot.state, 'flow');
});

test('Focus: combo 10 with at most one mistake', () => {
  const { snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 65, combo_count: 10, mistakes_last_60s: 1 } },
  ]);
  assert.equal(snapshot.state, 'focus');
});

test('Intense: more than thirty pieces a minute', () => {
  const { snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 45, pieces_per_minute: 31 } },
  ]);
  assert.equal(snapshot.state, 'intense');
});

test('Danger: the board above eighty percent', () => {
  const { snapshot } = walk([{ at: 0, vars: { board_fill_percent: 81 } }]);
  assert.equal(snapshot.state, 'danger');
  assert.equal(snapshot.dangerPending, true);
});

test('Danger: the danger_mode flag on its own, whatever the fill', () => {
  const { snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 5, combo_count: 0, danger_mode: true } },
  ]);
  assert.equal(snapshot.state, 'danger');
});

test('Recovery: Danger then a drained board', () => {
  const { states, snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 92 } },
    { at: 500, vars: { board_fill_percent: 40 } },
  ]);
  assert.deepEqual(states, ['danger', 'recovery']);
  assert.equal(snapshot.previousState, 'danger');
  assert.equal(snapshot.recoveryEndsAt, 500 + RECOVERY_DURATION_MS);
  assert.equal(snapshot.dangerPending, false);
});

// --- thresholds are exclusive where the spec says so ----------------------

test('a board at exactly eighty percent is not Danger', () => {
  const { snapshot } = walk([{ at: 0, vars: { board_fill_percent: 80, combo_count: 0 } }]);
  assert.notEqual(snapshot.state, 'danger');
});

test('exactly thirty pieces a minute is not Intense', () => {
  const { snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 45, pieces_per_minute: 30, combo_count: 0 } },
  ]);
  assert.notEqual(snapshot.state, 'intense');
});

test('Focus needs two mistakes or fewer to stay out of the way', () => {
  const { snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 65, combo_count: 10, mistakes_last_60s: 2 } },
  ]);
  assert.notEqual(snapshot.state, 'focus');
});

test('Flow needs the board strictly under fifty percent', () => {
  const { snapshot } = walk([{ at: 0, vars: { board_fill_percent: 50, combo_count: 4 } }]);
  assert.notEqual(snapshot.state, 'flow');
});

// --- priority order --------------------------------------------------------

test('Danger outranks every other condition at once', () => {
  const { snapshot } = walk([
    {
      at: 0,
      vars: {
        board_fill_percent: 95,
        combo_count: 20,
        pieces_per_minute: 60,
        mistakes_last_60s: 0,
      },
    },
  ]);
  assert.equal(snapshot.state, 'danger');
});

test('Recovery outranks Intense, Focus, Flow and Calm', () => {
  const { snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 90 } },
    {
      at: 100,
      vars: {
        board_fill_percent: 20,
        combo_count: 15,
        pieces_per_minute: 90,
        mistakes_last_60s: 0,
      },
    },
  ]);
  assert.equal(snapshot.state, 'recovery');
});

test('Danger interrupts a running Recovery', () => {
  const { states, snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 90 } },
    { at: 100, vars: { board_fill_percent: 20 } },
    { at: 2_000, vars: { board_fill_percent: 85 } },
  ]);
  assert.deepEqual(states, ['danger', 'recovery', 'danger']);
  assert.equal(snapshot.recoveryEndsAt, null);
  assert.equal(snapshot.dangerPending, true);
});

test('Intense outranks Focus and Flow', () => {
  const { snapshot } = walk([
    {
      at: 0,
      vars: {
        board_fill_percent: 20,
        combo_count: 12,
        mistakes_last_60s: 0,
        pieces_per_minute: 45,
      },
    },
  ]);
  assert.equal(snapshot.state, 'intense');
});

test('Focus outranks Flow', () => {
  const { snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 20, combo_count: 12, mistakes_last_60s: 0 } },
  ]);
  assert.equal(snapshot.state, 'focus');
});

test('Flow outranks Calm', () => {
  const { snapshot } = walk([{ at: 0, vars: { board_fill_percent: 10, combo_count: 5 } }]);
  assert.equal(snapshot.state, 'flow');
});

test('the full priority ladder, each rung knocking out the one below', () => {
  const base = {
    board_fill_percent: 20,
    combo_count: 12,
    mistakes_last_60s: 0,
    pieces_per_minute: 45,
  };
  assert.equal(walk([{ at: 0, vars: { ...base, danger_mode: true } }]).snapshot.state, 'danger');
  assert.equal(walk([{ at: 0, vars: base }]).snapshot.state, 'intense');
  assert.equal(
    walk([{ at: 0, vars: { ...base, pieces_per_minute: 0 } }]).snapshot.state,
    'focus'
  );
  assert.equal(
    walk([{ at: 0, vars: { ...base, pieces_per_minute: 0, combo_count: 4 } }]).snapshot.state,
    'flow'
  );
  assert.equal(
    walk([{ at: 0, vars: { ...base, pieces_per_minute: 0, combo_count: 0 } }]).snapshot.state,
    'calm'
  );
});

// --- the hold-current fallback --------------------------------------------

test('no condition matching holds the current state', () => {
  // Board at 65%, combo 1: too full for Calm, no combo for Flow, no speed.
  const { states } = walk([
    { at: 0, vars: { board_fill_percent: 20, combo_count: 6 } },
    { at: 1_000, vars: { board_fill_percent: 65, combo_count: 1 } },
  ]);
  assert.deepEqual(states, ['flow', 'flow']);
});

test('the held state is Calm before anything has matched', () => {
  const { snapshot } = walk([{ at: 0, vars: { board_fill_percent: 65, combo_count: 1 } }]);
  assert.equal(snapshot.state, 'calm');
});

// --- Recovery's timeout ----------------------------------------------------

test('Recovery holds for fifteen seconds, then normal evaluation resumes', () => {
  let snapshot = initialAudioState(0);
  snapshot = evaluateAudioState(snapshot, vars({ board_fill_percent: 90 }), 0);
  assert.equal(snapshot.state, 'danger');

  const calmish = vars({ board_fill_percent: 20, combo_count: 0 });
  snapshot = evaluateAudioState(snapshot, calmish, 1_000);
  assert.equal(snapshot.state, 'recovery');

  snapshot = evaluateAudioState(snapshot, calmish, 1_000 + RECOVERY_DURATION_MS - 1);
  assert.equal(snapshot.state, 'recovery', 'still in Recovery one millisecond early');

  snapshot = evaluateAudioState(snapshot, calmish, 1_000 + RECOVERY_DURATION_MS);
  assert.equal(snapshot.state, 'calm', 'Recovery releases exactly on time');
  assert.equal(snapshot.recoveryEndsAt, null);
});

test('Recovery holds its full fifteen seconds even while Intense would match', () => {
  let snapshot = initialAudioState(0);
  snapshot = evaluateAudioState(snapshot, vars({ board_fill_percent: 90 }), 0);
  const fast = vars({ board_fill_percent: 20, pieces_per_minute: 80 });
  snapshot = evaluateAudioState(snapshot, fast, 0);
  assert.equal(snapshot.state, 'recovery');
  snapshot = evaluateAudioState(snapshot, fast, RECOVERY_DURATION_MS - 1);
  assert.equal(snapshot.state, 'recovery');
  snapshot = evaluateAudioState(snapshot, fast, RECOVERY_DURATION_MS);
  assert.equal(snapshot.state, 'intense');
});

test('Recovery is not handed out twice for one Danger', () => {
  let snapshot = initialAudioState(0);
  snapshot = evaluateAudioState(snapshot, vars({ board_fill_percent: 90 }), 0);
  const drained = vars({ board_fill_percent: 20, combo_count: 0 });
  snapshot = evaluateAudioState(snapshot, drained, 0);
  assert.equal(snapshot.state, 'recovery');
  snapshot = evaluateAudioState(snapshot, drained, RECOVERY_DURATION_MS);
  assert.equal(snapshot.state, 'calm');
  snapshot = evaluateAudioState(snapshot, drained, RECOVERY_DURATION_MS + 5_000);
  assert.equal(snapshot.state, 'calm', 'no second Recovery without a second Danger');
});

test('a board draining gradually through the 60-80% band still gets Recovery', () => {
  // Between 60% and 80% with no combo nothing matches, so the fallback holds
  // Danger — which is also the right music for a board that is still nearly
  // full. Relief lands the moment it crosses 60%.
  const { states } = walk([
    { at: 0, vars: { board_fill_percent: 88 } },
    { at: 500, vars: { board_fill_percent: 74, combo_count: 0 } },
    { at: 1_000, vars: { board_fill_percent: 66, combo_count: 0 } },
    { at: 1_500, vars: { board_fill_percent: 58, combo_count: 0 } },
  ]);
  assert.deepEqual(states, ['danger', 'danger', 'danger', 'recovery']);
});

test('a board that drains past 60% while Flow matches still gets Recovery', () => {
  const { states } = walk([
    { at: 0, vars: { board_fill_percent: 88 } },
    { at: 500, vars: { board_fill_percent: 45, combo_count: 6 } },
  ]);
  assert.deepEqual(states, ['danger', 'recovery']);
});

test('a fresh Danger earns a fresh fifteen seconds of Recovery', () => {
  let snapshot = initialAudioState(0);
  const drained = vars({ board_fill_percent: 20, combo_count: 0 });
  snapshot = evaluateAudioState(snapshot, vars({ board_fill_percent: 90 }), 0);
  snapshot = evaluateAudioState(snapshot, drained, 0);
  snapshot = evaluateAudioState(snapshot, drained, RECOVERY_DURATION_MS);
  assert.equal(snapshot.state, 'calm');
  snapshot = evaluateAudioState(snapshot, vars({ board_fill_percent: 95 }), 20_000);
  assert.equal(snapshot.state, 'danger');
  snapshot = evaluateAudioState(snapshot, drained, 21_000);
  assert.equal(snapshot.state, 'recovery');
  assert.equal(snapshot.recoveryEndsAt, 21_000 + RECOVERY_DURATION_MS);
});

// --- bookkeeping -----------------------------------------------------------

test('enteredAt moves only when the state changes', () => {
  let snapshot = initialAudioState(0);
  const flowish = vars({ board_fill_percent: 10, combo_count: 5 });
  snapshot = evaluateAudioState(snapshot, flowish, 100);
  assert.equal(snapshot.state, 'flow');
  assert.equal(snapshot.enteredAt, 100);
  snapshot = evaluateAudioState(snapshot, flowish, 900);
  assert.equal(snapshot.enteredAt, 100);
});

test('previousState is the state the last evaluation produced', () => {
  let snapshot = initialAudioState(0);
  snapshot = evaluateAudioState(snapshot, vars({ board_fill_percent: 10 }), 10);
  assert.equal(snapshot.previousState, 'calm');
  snapshot = evaluateAudioState(snapshot, vars({ board_fill_percent: 99 }), 20);
  assert.equal(snapshot.previousState, 'calm');
  snapshot = evaluateAudioState(snapshot, vars({ board_fill_percent: 99 }), 30);
  assert.equal(snapshot.previousState, 'danger');
});

test('pause_state does not change the state', () => {
  let snapshot = initialAudioState(0);
  const paused = vars({ board_fill_percent: 10, combo_count: 5, pause_state: true });
  snapshot = evaluateAudioState(snapshot, paused, 0);
  assert.equal(snapshot.state, 'flow');
});

// --- INTENSE_SCORE_RATE ----------------------------------------------------

test('the score-rate condition is disabled at its default of zero', () => {
  assert.equal(INTENSE_SCORE_RATE, 0);
  assert.equal(DEFAULT_THRESHOLDS.intenseScoreRate, 0);
  const { snapshot } = walk([
    { at: 0, vars: { board_fill_percent: 10, combo_count: 0, score_rate: 5_000 } },
  ]);
  assert.equal(snapshot.state, 'calm');
});

test('a positive score rate threshold turns the condition on', () => {
  const thresholds = { ...DEFAULT_THRESHOLDS, intenseScoreRate: 4_000 };
  const below = evaluateAudioState(
    initialAudioState(0),
    vars({ board_fill_percent: 10, score_rate: 3_000 }),
    0,
    thresholds
  );
  assert.equal(below.state, 'calm');
  const above = evaluateAudioState(
    initialAudioState(0),
    vars({ board_fill_percent: 10, score_rate: 4_001 }),
    0,
    thresholds
  );
  assert.equal(above.state, 'intense');
});

// --- the mixing matrix -----------------------------------------------------

test('the mixing matrix is the spec table, exactly', () => {
  const expected: Record<AudioState, number[]> = {
    calm: [1.0, 0.8, 1.0, 0.2, 0.7, 0.0, 0.0, 0.0],
    flow: [1.0, 1.0, 1.0, 0.5, 0.8, 0.2, 0.0, 0.0],
    focus: [1.0, 1.0, 1.0, 0.7, 1.0, 0.5, 0.0, 0.0],
    intense: [1.0, 1.0, 1.0, 0.9, 1.0, 0.6, 0.3, 0.0],
    danger: [1.0, 0.6, 1.0, 0.0, 0.3, 0.0, 1.0, 0.0],
    recovery: [1.0, 0.8, 1.0, 0.3, 0.8, 0.1, 0.0, 1.0],
  };
  for (const state of AUDIO_STATES) {
    assert.deepEqual(
      STEM_NAMES.map((stem) => MIX_MATRIX[state][stem]),
      expected[state],
      `${state} row`
    );
    assert.equal(gainsForState(state), MIX_MATRIX[state]);
  }
});

test('every state has a gain for all eight stems, in 0..1', () => {
  for (const state of AUDIO_STATES) {
    const row = MIX_MATRIX[state];
    assert.equal(Object.keys(row).length, 8);
    for (const stem of STEM_NAMES) {
      const gain = stemGain(state, stem);
      assert.ok(gain >= 0 && gain <= 1, `${state}/${stem} = ${gain}`);
    }
  }
});

test('the always-active and calm-audible sets are what the engine expects', () => {
  assert.deepEqual(STEM_NAMES.filter(isAlwaysActive), ['BASS', 'DRUMS', 'ROOM', 'CHORDS']);
  assert.deepEqual(STEM_NAMES.filter(audibleInCalm), [
    'BASS',
    'DRUMS',
    'ROOM',
    'MOTION',
    'CHORDS',
  ]);
});

test('stem ids are STEM_01..STEM_08 in order', () => {
  assert.deepEqual(
    STEM_NAMES.map(stemId),
    ['STEM_01', 'STEM_02', 'STEM_03', 'STEM_04', 'STEM_05', 'STEM_06', 'STEM_07', 'STEM_08']
  );
});

// --- tier selection --------------------------------------------------------

test('the Arcade tier follows the stage, clamped to the tiers that exist', () => {
  assert.equal(arcadeTierForStage(1, TIERS), 95);
  assert.equal(arcadeTierForStage(3, TIERS), 115);
  assert.equal(arcadeTierForStage(6, TIERS), 145);
  assert.equal(arcadeTierForStage(12, TIERS), 145);
  assert.equal(arcadeTierForStage(0, TIERS), 95);
  assert.equal(arcadeTierForStage(-4, TIERS), 95);
});

test('without stages the tier steps once every ninety seconds, then caps', () => {
  assert.equal(SECONDS_PER_TIER, 90);
  assert.equal(arcadeTierForTime(0, TIERS), 95);
  assert.equal(arcadeTierForTime(89, TIERS), 95);
  assert.equal(arcadeTierForTime(90, TIERS), 105);
  assert.equal(arcadeTierForTime(450, TIERS), 145);
  assert.equal(arcadeTierForTime(100_000, TIERS), 145);
});

test('tier helpers refuse an empty tier list rather than returning NaN', () => {
  assert.throws(() => arcadeTierForStage(1, []), /no BPM tiers/);
  assert.throws(() => arcadeTierForTime(1, []), /no BPM tiers/);
});
