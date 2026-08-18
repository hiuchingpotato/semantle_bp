import { formatDuration } from "../game/stats";
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

/**
 * Where to send someone who wants a go.
 *
 * Derived from the running page rather than hard-coded, so the same build works
 * on GitHub Pages, a preview deploy or localhost without anyone remembering to
 * update a constant. The query string is dropped: a friend should land on
 * today's puzzle, not the archive puzzle you happened to be playing.
 */
export function gameUrl(): string {
  if (typeof window === "undefined") return "";
  const { origin } = window.location;
  const base = import.meta.env.BASE_URL || "/";
  return `${origin}${base}`;
}

export type ShareSummary = {
  puzzleNumber: number;
  guesses: number;
  hints: number;
  seconds: number | null;
};

/**
 * The message a player sends their friends.
 *
 * Says nothing about the word, the guesses or how close anyone got - only how
 * long it took. Anything richer risks leaking the answer to someone who has not
 * played yet, which would defeat the point of sharing it.
 */
export function buildShareText(summary: ShareSummary): string {
  const parts = [
    `${summary.guesses} ${summary.guesses === 1 ? "guess" : "guesses"}`,
  ];
  if (summary.seconds !== null) {
    parts.push(`time: ${formatDuration(summary.seconds)}`);
  }
  parts.push(`hints: ${summary.hints}`);

  return [
    `Closer - Daily Demo ${summary.puzzleNumber}`,
    parts.join(", "),
    gameUrl(),
  ].join("\n");
}

