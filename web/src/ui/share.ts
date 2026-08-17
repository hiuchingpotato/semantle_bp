import type { Guess } from "../game/types";

/**
 * Shareable summary of a finished puzzle.
 *
 * Deliberately not an emoji grid. That layout is the thing the New York Times
 * has gone after Wordle clones for - it claims the grid and tile colours as
 * protected trade dress - and it is trivially avoidable. A closeness trajectory
 * says more about how the game went anyway, and it gives nothing away.
 */

const LEVELS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const COLUMNS = 12;

/** Best rank after each turn - the line the player actually walked. */
export function bestRankTrajectory(guesses: readonly Guess[]): number[] {
  const byTurn = [...guesses].sort((a, b) => a.turn - b.turn);
  const trajectory: number[] = [];
  let best = Infinity;
  for (const guess of byTurn) {
    best = Math.min(best, guess.rank);
    trajectory.push(best);
  }
  return trajectory;
}

function levelFor(rank: number, wordCount: number): string {
  if (rank <= 0) return LEVELS[LEVELS.length - 1]!;
  // Log scale: the interesting movement is all in the last few thousand ranks.
  const fraction = Math.log(rank) / Math.log(wordCount);
  const level = Math.round((1 - fraction) * (LEVELS.length - 1));
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, level))]!;
}

export function sparkline(guesses: readonly Guess[], wordCount: number): string {
  const trajectory = bestRankTrajectory(guesses);
  if (trajectory.length === 0) return "";

  // Even sampling keeps a 200-guess game the same width as a 12-guess one.
  const columns = Math.min(COLUMNS, trajectory.length);
  const out: string[] = [];
  for (let i = 0; i < columns; i++) {
    const index = Math.floor((i * (trajectory.length - 1)) / Math.max(1, columns - 1));
    out.push(levelFor(trajectory[index]!, wordCount));
  }
  return out.join("");
}

export function buildShareText(
  puzzleNumber: number,
  guesses: readonly Guess[],
  wordCount: number,
): string {
  const hints = guesses.filter((guess) => guess.revealed).length;
  const lines = [
    `Closer #${puzzleNumber} · solved in ${guesses.length}`,
    sparkline(guesses, wordCount),
  ];
  if (hints > 0) {
    lines.push(`${hints} ${hints === 1 ? "hint" : "hints"} used`);
  }
  return lines.filter(Boolean).join("\n");
}
