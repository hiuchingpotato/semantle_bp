import { describe, expect, it } from "vitest";

import {
  EMPTY_STATS,
  StatsRecord,
  findSolve,
  formatDuration,
  recordSolve,
  recordStart,
  reviveStats,
  summarise,
} from "./stats";

const solve = (puzzle: number, guesses = 20, hints = 0) => ({
  puzzle,
  guesses,
  hints,
  seconds: 300,
  solvedAt: "2026-08-18T10:00:00.000Z",
});

const withSolves = (puzzles: number[]): StatsRecord =>
  puzzles.reduce((stats, puzzle) => recordSolve(stats, solve(puzzle)), EMPTY_STATS);

describe("summarise", () => {
  it("reports nothing for a fresh player", () => {
    expect(summarise(EMPTY_STATS, 78)).toEqual({
      played: 0,
      currentStreak: 0,
      maxStreak: 0,
    });
  });

  it("counts a run ending today", () => {
    const summary = summarise(withSolves([76, 77, 78]), 78);
    expect(summary.currentStreak).toBe(3);
    expect(summary.maxStreak).toBe(3);
  });

  it("keeps the streak alive before today is played", () => {
    // Solved up to yesterday, today untouched: the streak is not broken yet.
    expect(summarise(withSolves([76, 77]), 78).currentStreak).toBe(2);
  });

  it("breaks the streak once a day is missed", () => {
    // Nothing at 77 or 78, so the run ending at 76 is dead.
    expect(summarise(withSolves([74, 75, 76]), 78).currentStreak).toBe(0);
  });

  it("remembers the best run after the current one breaks", () => {
    const summary = summarise(withSolves([10, 11, 12, 13, 78]), 78);
    expect(summary.currentStreak).toBe(1);
    expect(summary.maxStreak).toBe(4);
  });

  it("lets an archive solve bridge a gap", () => {
    // 77 was missed, then filled in from the archive: the run is whole again.
    const before = summarise(withSolves([76, 78]), 78);
    const after = summarise(withSolves([76, 77, 78]), 78);
    expect(before.currentStreak).toBe(1);
    expect(after.currentStreak).toBe(3);
  });

  it("counts every puzzle started, solved or not", () => {
    let stats = recordStart(EMPTY_STATS, 78);
    stats = recordStart(stats, 77);
    stats = recordSolve(stats, solve(77));
    expect(summarise(stats, 78).played).toBe(2);
  });

  it("ignores duplicates", () => {
    let stats = recordStart(EMPTY_STATS, 78);
    stats = recordStart(stats, 78);
    expect(stats.started).toEqual([78]);
    expect(summarise(stats, 78).played).toBe(1);
  });

  it("handles puzzle zero", () => {
    expect(summarise(withSolves([0]), 0).currentStreak).toBe(1);
  });
});

describe("recordSolve", () => {
  it("adds a solve and implies a start", () => {
    const stats = recordSolve(EMPTY_STATS, solve(5));
    expect(stats.solves).toHaveLength(1);
    expect(stats.started).toContain(5);
  });

  it("does not duplicate a puzzle", () => {
    const stats = recordSolve(recordSolve(EMPTY_STATS, solve(5)), solve(5));
    expect(stats.solves).toHaveLength(1);
  });

  it("keeps the better attempt when re-solved", () => {
    let stats = recordSolve(EMPTY_STATS, solve(5, 90));
    stats = recordSolve(stats, solve(5, 30));
    expect(findSolve(stats, 5)?.guesses).toBe(30);

    stats = recordSolve(stats, solve(5, 200));
    expect(findSolve(stats, 5)?.guesses).toBe(30);
  });
});

describe("formatDuration", () => {
  it("reads as mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(9)).toBe("00:09");
    expect(formatDuration(451)).toBe("07:31");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("widens past an hour", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(7325)).toBe("2:02:05");
  });

  it("survives nonsense", () => {
    expect(formatDuration(-5)).toBe("00:00");
  });
});

describe("reviveStats", () => {
  it("round-trips what we write", () => {
    const stats = recordSolve(recordStart(EMPTY_STATS, 1), solve(2));
    expect(reviveStats(JSON.parse(JSON.stringify(stats)))).toEqual(stats);
  });

  it("falls back to empty on anything unexpected", () => {
    for (const bad of [null, undefined, 42, "x", {}, { version: 99 }]) {
      expect(reviveStats(bad)).toEqual(EMPTY_STATS);
    }
  });

  it("drops corrupt entries but keeps the good ones", () => {
    const revived = reviveStats({
      version: 1,
      started: [1, "two", 3.5, 4],
      solves: [solve(1), null, { puzzle: "x" }, solve(2)],
    });
    expect(revived.started).toEqual([1, 4]);
    expect(revived.solves).toHaveLength(2);
  });
});
