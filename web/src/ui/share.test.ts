import { describe, expect, it } from "vitest";

import type { Guess } from "../game/types";
import { bestRankTrajectory, buildShareText, gameUrl, sparkline } from "./share";

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

describe("bestRankTrajectory", () => {
  it("only ever improves", () => {
    expect(bestRankTrajectory(board([9000, 4000, 7000, 200, 800]))).toEqual([
      9000, 4000, 4000, 200, 200,
    ]);
  });

  it("follows turn order, not list order", () => {
    const shuffled = board([500, 9000]).reverse();
    expect(bestRankTrajectory(shuffled)).toEqual([500, 500]);
  });

  it("handles an empty board", () => {
    expect(bestRankTrajectory([])).toEqual([]);
  });
});

describe("sparkline", () => {
  it("keeps a long game the same width as a short one", () => {
    const long = sparkline(board(Array.from({ length: 200 }, () => 5000)), 60_000);
    const short = sparkline(board([5000, 4000, 3000]), 60_000);
    expect([...long].length).toBe(12);
    expect([...short].length).toBe(3);
  });

  it("ends full when the puzzle is solved", () => {
    const line = sparkline(board([50_000, 900, 0]), 60_000);
    expect(line.endsWith("█")).toBe(true);
  });

  it("rises as the player closes in", () => {
    const line = [...sparkline(board([50_000, 10_000, 100, 0]), 60_000)];
    const levels = "▁▂▃▄▅▆▇█";
    const positions = line.map((glyph) => levels.indexOf(glyph));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!).toBeGreaterThanOrEqual(positions[i - 1]!);
    }
  });
});

describe("buildShareText", () => {
  const summary = { puzzleNumber: 78, guesses: 42, hints: 2, seconds: 451 };

  it("uses the agreed format", () => {
    const [heading, detail] = buildShareText(summary).split("\n");
    expect(heading).toBe("Closer - Daily Demo 78");
    expect(detail).toBe("42 guesses, time: 07:31, hints: 2");
  });

  it("ends with a link so a friend can play", () => {
    const lines = buildShareText(summary).split("\n");
    expect(lines).toHaveLength(3);
    // These tests run without a DOM, so gameUrl() is empty here; the line still
    // exists, which is what the format guarantees.
    expect(lines[2]).toBe(gameUrl());
  });

  it("gives nothing away about the word", () => {
    const text = buildShareText(summary).toLowerCase();
    for (const leak of ["rabbit", "closest", "rank", "similarity"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("drops the time when it was never recorded", () => {
    const text = buildShareText({ ...summary, seconds: null });
    expect(text).toContain("42 guesses, hints: 2");
    expect(text).not.toContain("time:");
  });

  it("reports zero hints rather than omitting the line", () => {
    // Silence would be ambiguous: it should be clear the puzzle was solved
    // unaided, not leave the reader to infer it.
    expect(buildShareText({ ...summary, hints: 0 })).toContain("hints: 0");
  });

  it("says guess, singular, for a one-guess game", () => {
    expect(buildShareText({ ...summary, guesses: 1 })).toContain("1 guess,");
  });
});

