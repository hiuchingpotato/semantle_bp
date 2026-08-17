import { del, get, set } from "idb-keyval";

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

const NAMESPACE = "closer";

const progressKey = (puzzle: number) => `${NAMESPACE}/progress/${puzzle}`;
const solvedKey = (puzzle: number) => `${NAMESPACE}/solved/${puzzle}`;

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
    await Promise.all([del(progressKey(puzzle)), del(solvedKey(puzzle))]);
  } catch {
    /* see loadProgress */
  }
}
