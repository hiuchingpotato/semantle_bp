import { isHintable } from "./format";
import type { Guess, Puzzle } from "./types";

/**
 * Hints halve the distance.
 *
 * If your best guess is the 4,000th closest word, the hint is the 2,000th. It
 * is a real step towards the answer, it is self-limiting (roughly log2(60000),
 * about 16 hints, to walk in from nothing), and it never just tells you.
 *
 * Hints are recorded on the board like any other word but marked as revealed,
 * so a shared result can be honest about how much help was taken.
 */

/** Guesses needed before the first hint. */
export const HINT_UNLOCK_AT = 8;

/** Guesses between hints after that. */
export const HINT_COOLDOWN = 5;

export type HintAvailability =
  | { available: true; targetRank: number }
  | { available: false; reason: string; guessesUntilNext: number };

function bestRank(guesses: readonly Guess[]): number | null {
  let best: number | null = null;
  for (const guess of guesses) {
    if (best === null || guess.rank < best) best = guess.rank;
  }
  return best;
}

export function hintAvailability(guesses: readonly Guess[]): HintAvailability {
  const played = guesses.length;
  if (played < HINT_UNLOCK_AT) {
    return {
      available: false,
      reason: `Hints unlock after ${HINT_UNLOCK_AT} guesses`,
      guessesUntilNext: HINT_UNLOCK_AT - played,
    };
  }

  const used = guesses.filter((guess) => guess.revealed).length;
  // Each hint spent pushes the next one HINT_COOLDOWN guesses away.
  const nextAllowedAt = HINT_UNLOCK_AT + used * HINT_COOLDOWN;
  if (played < nextAllowedAt) {
    return {
      available: false,
      reason: `Next hint in ${nextAllowedAt - played} guesses`,
      guessesUntilNext: nextAllowedAt - played,
    };
  }

  const best = bestRank(guesses);
  if (best === null || best === 0) {
    return { available: false, reason: "Nothing left to hint", guessesUntilNext: 0 };
  }
  if (best === 1) {
    return {
      available: false,
      reason: "You are one word away - no hint can help more than that",
      guessesUntilNext: 0,
    };
  }

  return { available: true, targetRank: Math.max(1, Math.floor(best / 2)) };
}


/**
 * The word to reveal for a hint: the one nearest the target rank that the game
 * is willing to say out loud.
 *
 * Taking whatever sits at the target rank is what produced "chippewa" for
 * kettle - the vocabulary is wide by design, and American place names cluster
 * around ordinary nouns. The pool of acceptable hints is built at build time;
 * see load_hintable in tools/build_data.py.
 *
 * The search walks outward from the target so the hint stays as close to
 * halfway as the pool allows, and prefers the closer side on a tie.
 */
export function chooseHintWord(
  puzzle: Puzzle,
  targetRank: number,
  pool: Uint8Array | null,
): number | null {
  const clamped = Math.max(1, Math.min(targetRank, puzzle.wordCount - 1));
  const at = (rank: number) => puzzle.indexByRank[rank] ?? null;

  // No pool: the old behaviour, which is better than refusing to hint.
  if (!pool) return at(clamped);

  for (let offset = 0; offset < puzzle.wordCount; offset++) {
    const closer = clamped - offset;
    if (closer >= 1) {
      const index = at(closer);
      if (index !== null && isHintable(pool, index)) return index;
    }
    const further = clamped + offset;
    if (offset > 0 && further < puzzle.wordCount) {
      const index = at(further);
      if (index !== null && isHintable(pool, index)) return index;
    }
    if (closer < 1 && further >= puzzle.wordCount) break;
  }

  // Nothing acceptable anywhere - fall back rather than swallow the hint.
  return at(clamped);
}
