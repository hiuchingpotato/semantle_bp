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
 * The streak is the unbroken run of solved puzzles ending either today or
 * yesterday. Yesterday counts so that a streak is not reported as broken during
 * the hours before you have got round to today's puzzle - the same rule Wordle
 * uses, and the one players expect.
 *
 * Solving an archive puzzle can therefore extend a streak by filling a gap. That
 * is deliberate: the alternative is telling someone who has solved every puzzle
 * that their streak is 1.
 */
export function summarise(
  stats: StatsRecord,
  todayNumber: number,
): StatsSummary {
  const runs = solvedRuns(stats.solves.map((solve) => solve.puzzle));

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
    ? record.solves.filter(
        (entry): entry is SolveRecord =>
          !!entry &&
          typeof entry === "object" &&
          Number.isInteger((entry as SolveRecord).puzzle) &&
          Number.isFinite((entry as SolveRecord).guesses),
      )
    : [];

  return { version: 1, started, solves };
}
