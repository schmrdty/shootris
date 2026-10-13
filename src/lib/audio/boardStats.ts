/**
 * Board measurements the soundtrack derives its pressure from.
 *
 * Kept out of the hook so they can be tested without React. Shootris is
 * inverted: pieces spawn at row 0 and rise, so the stack grows from the high
 * rows downward and open space is at the low rows.
 */

export type Board = (string | null)[][];

/** Share of the board that is filled, 0-100. */
export function boardFillPercent(board: Board | null): number {
  if (!board || board.length === 0) return 0;
  let filled = 0;
  let total = 0;
  for (const row of board) {
    for (const cell of row) {
      total += 1;
      if (cell) filled += 1;
    }
  }
  return total === 0 ? 0 : (filled / total) * 100;
}

/**
 * Empty cells that a new piece can no longer reach.
 *
 * Pieces arrive from row 0 and travel upward, so a column's *lowest* filled
 * cell is its surface and every empty cell above that surface is sealed in.
 * This is the standard measure of a misplaced piece, and a lock that raises it
 * is what the soundtrack counts as a mistake.
 */
export function countCoveredHoles(board: Board | null): number {
  if (!board || board.length === 0) return 0;
  const height = board.length;
  const width = board[0]?.length ?? 0;
  let holes = 0;
  for (let x = 0; x < width; x += 1) {
    let surface = -1;
    for (let y = 0; y < height; y += 1) {
      if (board[y][x]) {
        surface = y;
        break;
      }
    }
    if (surface < 0) continue; // empty column: nothing is covered
    for (let y = surface + 1; y < height; y += 1) {
      if (!board[y][x]) holes += 1;
    }
  }
  return holes;
}
