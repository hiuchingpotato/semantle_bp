import { describe, expect, it } from "vitest";

import type { Guess } from "../game/types";
import { bestRankTrajectory, buildShareText, sparkline } from "./share";

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
  it("reports guesses and hints without naming the word", () => {
    const text = buildShareText(75, board([9000, 400, 0], [2]), 60_000);
    expect(text).toContain("Closer #75");
    expect(text).toContain("solved in 3");
    expect(text).toContain("1 hint used");
    expect(text).not.toContain("w0");
  });

  it("omits the hint line when none were taken", () => {
    expect(buildShareText(1, board([500, 0]), 60_000)).not.toContain("hint");
  });
});
