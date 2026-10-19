/**
 * The board derivations, which are easy to get backwards: Shootris is
 * inverted, so "covered" means covered from below.
 *
 *   node --experimental-strip-types --test src/lib/audio/boardStats.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { boardFillPercent, countCoveredHoles, type Board } from './boardStats.ts';

/**
 * Build a board from rows written bottom-first, matching the engine's indexing
 * (row 0 is where pieces spawn). '.' is empty, anything else is a block.
 */
function board(...rows: string[]): Board {
  return rows.map((row) => [...row].map((cell) => (cell === '.' ? null : cell)));
}

test('an empty board is 0% full with no holes', () => {
  const empty = board('....', '....', '....');
  assert.equal(boardFillPercent(empty), 0);
  assert.equal(countCoveredHoles(empty), 0);
});

test('a full board is 100% full with no holes', () => {
  const full = board('XXXX', 'XXXX');
  assert.equal(boardFillPercent(full), 100);
  assert.equal(countCoveredHoles(full), 0);
});

test('fill percent counts cells, not rows', () => {
  assert.equal(boardFillPercent(board('XX..', '....')), 25);
  assert.equal(boardFillPercent(board('XXXX', '....')), 50);
});

test('a null or empty board reads as zero rather than throwing', () => {
  assert.equal(boardFillPercent(null), 0);
  assert.equal(countCoveredHoles(null), 0);
  assert.equal(boardFillPercent([]), 0);
  assert.equal(countCoveredHoles([]), 0);
});

test('open space below the stack is not a hole', () => {
  // Pieces come from row 0, so the empties in row 0 are still reachable.
  const reachable = board('....', 'XXXX', 'XXXX');
  assert.equal(countCoveredHoles(reachable), 0);
});

test('an empty cell above a column s surface is a hole', () => {
  // Column 0 is filled at row 1, so its gap at row 2 is sealed in.
  const sealed = board('....', 'X...', '....');
  assert.equal(countCoveredHoles(sealed), 1);
});

test('every empty cell above the surface counts, not just the first', () => {
  const sealed = board('....', 'X...', '....', '....');
  assert.equal(countCoveredHoles(sealed), 2);
});

test('holes are counted per column', () => {
  //        col0: surface row 1, holes at rows 2,3 -> 2
  //        col1: surface row 2, hole at row 3     -> 1
  //        col2: never filled                     -> 0
  //        col3: filled at row 3, nothing above   -> 0
  const mixed = board('....', 'X...', '.X..', '...X');
  assert.equal(countCoveredHoles(mixed), 3);
});

test('a column filled only at the top row has no holes above it', () => {
  const capped = board('....', '....', 'X...');
  assert.equal(countCoveredHoles(capped), 0);
});

test('a lock that clears a line reduces the hole count', () => {
  const before = board('....', 'XXX.', '..X.');
  const after = board('....', '....', '..X.');
  assert.ok(countCoveredHoles(after) < countCoveredHoles(before));
});

test('a 10x20 board matches the engine s dimensions', () => {
  // Four rows of stack. Inverted, so it sits at the high rows — the far end
  // from where pieces spawn — with the rest of the board still open.
  const rows = Array.from({ length: 20 }, (_, y) => (y >= 16 ? 'XXXXXXXXXX' : '..........'));
  const stacked = board(...rows);
  assert.equal(boardFillPercent(stacked), 20);
  assert.equal(countCoveredHoles(stacked), 0);
});

test('a hole under a 10x20 stack is sealed in', () => {
  const rows = Array.from({ length: 20 }, (_, y) => (y >= 16 ? 'XXXXXXXXXX' : '..........'));
  // One block pushed three rows out ahead of the stack in column 4 seals the
  // three cells behind it.
  rows[13] = '....X.....';
  const stacked = board(...rows);
  assert.equal(countCoveredHoles(stacked), 2);
});
