import { del, get, set } from "idb-keyval";

import { EMPTY_STATS, reviveStats, type StatsRecord } from "./stats";
import type { SavedProgress } from "./types";

/**
 * Progress lives in IndexedDB, not localStorage: a long game is a few hundred
 * entries and localStorage is a synchronous 5MB bucket shared with everything
 * else on the origin.
 *
 * Only the word, its turn and whether it was revealed are stored. Rank and
 * similarity are re-derived from the puzzle file on load, so a rebuilt data set
 * never leaves stale numbers behind.
 *
 * Nothing here leaves the device. No account, no sync, no analytics - which is
 * also the cheapest possible answer to UK GDPR and PECR for a first release.
 */

/**
 * Bumped when the puzzle schedule changes.
 *
 * Progress is keyed by puzzle number, so moving the epoch would silently attach
 * an old game to a different word. A new namespace abandons that data rather
 * than showing someone a board that no longer matches what they played.
 */
const NAMESPACE = "closer/v2";

const progressKey = (puzzle: number) => `${NAMESPACE}/progress/${puzzle}`;
const solvedKey = (puzzle: number) => `${NAMESPACE}/solved/${puzzle}`;
const startedKey = (puzzle: number) => `${NAMESPACE}/started/${puzzle}`;
const statsKey = `${NAMESPACE}/stats`;

export async function loadProgress(puzzle: number): Promise<SavedProgress[]> {
  try {
    const stored = await get<SavedProgress[]>(progressKey(puzzle));
    if (!Array.isArray(stored)) return [];
    // Defend against a half-written or hand-edited record.
    return stored.filter(
      (entry): entry is SavedProgress =>
        !!entry &&
        typeof entry.word === "string" &&
        typeof entry.turn === "number" &&
        typeof entry.revealed === "boolean",
    );
  } catch {
    // Private browsing and locked-down profiles can refuse IndexedDB. Losing
    // progress is bad; refusing to start the game is worse.
    return [];
  }
}

export async function saveProgress(
  puzzle: number,
  progress: SavedProgress[],
): Promise<void> {
  try {
    await set(progressKey(puzzle), progress);
  } catch {
    /* see loadProgress */
  }
}

export async function loadSolved(puzzle: number): Promise<string | null> {
  try {
    return (await get<string>(solvedKey(puzzle))) ?? null;
  } catch {
    return null;
  }
}

export async function markSolved(puzzle: number, when: Date): Promise<void> {
  try {
    await set(solvedKey(puzzle), when.toISOString());
  } catch {
    /* see loadProgress */
  }
}

export async function clearPuzzle(puzzle: number): Promise<void> {
  try {
    await Promise.all([
      del(progressKey(puzzle)),
      del(solvedKey(puzzle)),
      del(startedKey(puzzle)),
    ]);
  } catch {
    /* see loadProgress */
  }
}

/**
 * When the player made their first guess on a puzzle.
 *
 * Stored rather than held in memory so that the timer survives a reload - a
 * long game is often played across several sittings, and restarting the clock
 * every time the tab is reopened would make the reported time meaningless.
 *
 * It is wall-clock time, not time spent playing: leave the tab open overnight
 * and the number reflects that. Measuring attention rather than elapsed time
 * would mean tracking focus and idle state, which is a lot of machinery for a
 * line in a share message.
 */
export async function loadStartedAt(puzzle: number): Promise<Date | null> {
  try {
    const stored = await get<string>(startedKey(puzzle));
    if (typeof stored !== "string") return null;
    const parsed = new Date(stored);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/** First write wins, so the clock is not reset by a later guess. */
export async function markStarted(puzzle: number, when: Date): Promise<Date> {
  try {
    const existing = await loadStartedAt(puzzle);
    if (existing) return existing;
    await set(startedKey(puzzle), when.toISOString());
  } catch {
    /* see loadProgress */
  }
  return when;
}

export async function loadStats(): Promise<StatsRecord> {
  try {
    return reviveStats(await get(statsKey));
  } catch {
    return EMPTY_STATS;
  }
}

export async function saveStats(stats: StatsRecord): Promise<void> {
  try {
    await set(statsKey, stats);
  } catch {
    /* see loadProgress */
  }
}
