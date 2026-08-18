/**
 * Play history across puzzles.
 *
 * One record holds everything, and the headline figures are derived from it
 * rather than counted up as you go. Incrementing a stored counter drifts: a
 * double-solve, a failed write or a replayed archive puzzle and the number is
 * wrong forever with no way to notice. Deriving from the list of solves is
 * self-correcting.
 */

export type SolveRecord = {
  puzzle: number;
  /** Words played, hints included. */
  guesses: number;
  hints: number;
  /** Wall-clock seconds from first guess to solve. */
  seconds: number;
  solvedAt: string;
  /**
   * Solved on the puzzle's own day, before it rolled over at midnight.
   *
   * Only these build a streak. A puzzle picked up later still keeps its record -
   * guesses, time, the lot - but catching up cannot manufacture a streak you
   * did not play day by day.
   */
  onTime: boolean;
};

export type StatsRecord = {
  version: 1;
  /** Puzzle numbers the player has entered at least one guess for. */
  started: number[];
  solves: SolveRecord[];
};

export type StatsSummary = {
  played: number;
  currentStreak: number;
  maxStreak: number;
};

export const EMPTY_STATS: StatsRecord = { version: 1, started: [], solves: [] };

/** Consecutive runs of solved puzzle numbers, ascending. */
function solvedRuns(puzzles: number[]): number[][] {
  const sorted = [...new Set(puzzles)].sort((a, b) => a - b);
  const runs: number[][] = [];

  for (const puzzle of sorted) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last !== undefined && puzzle === last + 1) {
      run.push(puzzle);
    } else {
      runs.push([puzzle]);
    }
  }

  return runs;
}

/**
 * Headline figures.
 *
 * The streak counts only puzzles solved on their own day. Going back and
 * finishing an old one keeps its record and counts as played, but it cannot
 * build or repair a streak - a streak is a record of turning up daily, and
 * catching up at the weekend is not that.
 *
 * A run ending yesterday still counts as current, so nobody is told their
 * streak is broken during the hours before they have got round to today.
 */
export function summarise(
  stats: StatsRecord,
  todayNumber: number,
): StatsSummary {
  const onTime = stats.solves.filter((solve) => solve.onTime);
  const runs = solvedRuns(onTime.map((solve) => solve.puzzle));

  const maxStreak = runs.reduce((longest, run) => Math.max(longest, run.length), 0);

  const currentRun = runs.find((run) => {
    const end = run[run.length - 1];
    return end === todayNumber || end === todayNumber - 1;
  });

  return {
    played: new Set(stats.started).size,
    currentStreak: currentRun?.length ?? 0,
    maxStreak,
  };
}

/** Mark a puzzle as attempted. Idempotent. */
export function recordStart(stats: StatsRecord, puzzle: number): StatsRecord {
  if (stats.started.includes(puzzle)) return stats;
  return { ...stats, started: [...stats.started, puzzle] };
}

/**
 * Record a solve. Idempotent by puzzle number, and keeps the better attempt if
 * the same puzzle is somehow solved twice - re-solving should never make your
 * recorded result worse.
 */
export function recordSolve(
  stats: StatsRecord,
  solve: SolveRecord,
): StatsRecord {
  const existing = stats.solves.find((entry) => entry.puzzle === solve.puzzle);
  if (existing) {
    if (existing.guesses <= solve.guesses) return stats;
    return {
      ...stats,
      solves: stats.solves.map((entry) =>
        entry.puzzle === solve.puzzle ? solve : entry,
      ),
    };
  }

  return {
    ...stats,
    started: stats.started.includes(solve.puzzle)
      ? stats.started
      : [...stats.started, solve.puzzle],
    solves: [...stats.solves, solve],
  };
}

/** What the calendar needs to know about a single day. */
export type PuzzleState =
  /** Not released yet. */
  | "locked"
  /** Released, never opened. */
  | "unplayed"
  /** Guessed at but not finished. Still replayable. */
  | "started"
  /** Finished on the day, so it counts towards the streak. */
  | "solved"
  /** Finished later. Kept as a record, but not part of any streak. */
  | "replayed";

export function puzzleState(
  stats: StatsRecord,
  puzzle: number,
  todayNumber: number,
): PuzzleState {
  if (puzzle > todayNumber || puzzle < 0) return "locked";
  const solve = findSolve(stats, puzzle);
  if (solve) return solve.onTime ? "solved" : "replayed";
  return stats.started.includes(puzzle) ? "started" : "unplayed";
}

export function findSolve(
  stats: StatsRecord,
  puzzle: number,
): SolveRecord | undefined {
  return stats.solves.find((entry) => entry.puzzle === puzzle);
}

/** mm:ss, widening to h:mm:ss past an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${pad(minutes)}:${pad(secs)}`;
}

/** Discard anything that is not the shape we wrote, rather than trusting it. */
export function reviveStats(value: unknown): StatsRecord {
  if (!value || typeof value !== "object") return EMPTY_STATS;
  const record = value as Partial<StatsRecord>;
  if (record.version !== 1) return EMPTY_STATS;

  const started = Array.isArray(record.started)
    ? record.started.filter((n): n is number => Number.isInteger(n))
    : [];

  const solves = Array.isArray(record.solves)
    ? record.solves
        .filter(
          (entry): entry is SolveRecord =>
            !!entry &&
            typeof entry === "object" &&
            Number.isInteger((entry as SolveRecord).puzzle) &&
            Number.isFinite((entry as SolveRecord).guesses),
        )
        // A record written before on-time tracking cannot be verified after the
        // fact, so it does not get the benefit of the doubt.
        .map((entry) => ({ ...entry, onTime: entry.onTime === true }))
    : [];

  return { version: 1, started, solves };
}
