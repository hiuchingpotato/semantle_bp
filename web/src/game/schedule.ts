/**
 * Which puzzle is today's, and which archive puzzles are open.
 *
 * Rollover is local midnight. Day arithmetic runs on calendar dates rather than
 * millisecond differences so that a DST change doesn't shift the boundary by an
 * hour and hand someone tomorrow's puzzle early.
 */

const MS_PER_DAY = 86_400_000;

/** UTC timestamp of a local calendar date, used only for whole-day differences. */
function calendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`epoch must be YYYY-MM-DD, got "${iso}"`);
  }
  return new Date(year, month - 1, day);
}

export function puzzleNumberFor(epochIso: string, now: Date): number {
  const days = (calendarDay(now) - calendarDay(parseIsoDate(epochIso))) / MS_PER_DAY;
  return Math.floor(days);
}

/** Local midnight after `now` - what the countdown ticks towards. */
export function nextRollover(now: Date): Date {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next;
}

export type Schedule = {
  /** Today's puzzle, clamped into the range we actually have data for. */
  today: number;
  /** Which puzzle to show, honouring ?puzzle= if it points at a past one. */
  active: number;
  isArchive: boolean;
  /** True when the calendar has run past the last built puzzle. */
  exhausted: boolean;
};

export function resolveSchedule(
  epochIso: string,
  puzzleCount: number,
  now: Date,
  requested: number | null,
): Schedule {
  const raw = puzzleNumberFor(epochIso, now);
  const exhausted = raw >= puzzleCount;
  // Before the epoch there is nothing to play; after the last puzzle we hold on
  // the final one rather than 404ing, and say so in the UI.
  const today = Math.max(0, Math.min(raw, puzzleCount - 1));

  const wantsArchive =
    requested !== null &&
    Number.isInteger(requested) &&
    requested >= 0 &&
    requested < today;

  return {
    today,
    active: wantsArchive ? requested : today,
    isArchive: wantsArchive,
    exhausted,
  };
}

export function readRequestedPuzzle(search: string): number | null {
  const value = new URLSearchParams(search).get("puzzle");
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
