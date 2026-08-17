import { describe, expect, it } from "vitest";

import { HINT_COOLDOWN, HINT_UNLOCK_AT, hintAvailability } from "./hints";
import type { Guess } from "./types";

function board(ranks: number[], revealedTurns: number[] = []): Guess[] {
  return ranks.map((rank, i) => ({
    vocabIndex: i,
    word: `w${i}`,
    similarity: 0,
    rank,
    turn: i + 1,
    revealed: revealedTurns.includes(i + 1),
  }));
}

describe("hintAvailability", () => {
  it("is locked until enough guesses have been made", () => {
    const result = hintAvailability(board(Array(HINT_UNLOCK_AT - 1).fill(5000)));
    expect(result.available).toBe(false);
    if (!result.available) expect(result.guessesUntilNext).toBe(1);
  });

  it("halves the best rank once unlocked", () => {
    const ranks = Array(HINT_UNLOCK_AT).fill(50_000);
    ranks[3] = 4000;
    const result = hintAvailability(board(ranks));
    expect(result).toEqual({ available: true, targetRank: 2000 });
  });

  it("rounds down and never targets rank zero", () => {
    const ranks = Array(HINT_UNLOCK_AT).fill(50_000);
    ranks[0] = 3;
    const result = hintAvailability(board(ranks));
    if (!result.available) throw new Error("expected a hint");
    expect(result.targetRank).toBe(1);
  });

  it("imposes a cooldown after each hint", () => {
    const ranks = Array(HINT_UNLOCK_AT).fill(9000);
    // One hint already taken: the next is HINT_COOLDOWN guesses away.
    const afterFirst = hintAvailability(board(ranks, [2]));
    expect(afterFirst.available).toBe(false);
    if (!afterFirst.available) {
      expect(afterFirst.guessesUntilNext).toBe(HINT_COOLDOWN);
    }

    const later = Array(HINT_UNLOCK_AT + HINT_COOLDOWN).fill(9000);
    expect(hintAvailability(board(later, [2])).available).toBe(true);
  });

  it("stops when the player is one word away", () => {
    const ranks = Array(HINT_UNLOCK_AT).fill(500);
    ranks[1] = 1;
    const result = hintAvailability(board(ranks));
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toMatch(/one word away/);
  });

  it("stops once the puzzle is solved", () => {
    const ranks = Array(HINT_UNLOCK_AT).fill(500);
    ranks[4] = 0;
    expect(hintAvailability(board(ranks)).available).toBe(false);
  });

  it("has nothing to offer an empty board", () => {
    expect(hintAvailability([]).available).toBe(false);
  });
});
