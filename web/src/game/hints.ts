import type { Guess } from "./types";

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
