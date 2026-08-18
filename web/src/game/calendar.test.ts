import { describe, expect, it } from "vitest";

import { dateForPuzzle, isSameDay, puzzleForDate } from "./schedule";
import { EMPTY_STATS, puzzleState, recordSolve, recordStart } from "./stats";

const EPOCH = "2026-08-18";

const solve = (puzzle: number, onTime: boolean) => ({
  puzzle,
  guesses: 20,
  hints: 0,
  seconds: 300,
  solvedAt: "2026-08-18T10:00:00.000Z",
  onTime,
});

describe("dateForPuzzle", () => {
  it("puts puzzle zero on the epoch", () => {
    const date = dateForPuzzle(EPOCH, 0);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7); // August
    expect(date.getDate()).toBe(18);
  });

  it("advances a day at a time across month ends", () => {
    expect(dateForPuzzle(EPOCH, 13).getDate()).toBe(31);
    const next = dateForPuzzle(EPOCH, 14);
    expect(next.getMonth()).toBe(8); // September
    expect(next.getDate()).toBe(1);
  });

  it("round-trips with puzzleForDate", () => {
    for (const puzzle of [0, 1, 30, 100, 215]) {
      expect(puzzleForDate(EPOCH, dateForPuzzle(EPOCH, puzzle))).toBe(puzzle);
    }
  });

  it("survives a DST change", () => {
    // UK clocks go back on 2026-10-25, which is puzzle 68.
    const before = dateForPuzzle(EPOCH, 67);
    const during = dateForPuzzle(EPOCH, 68);
    const after = dateForPuzzle(EPOCH, 69);
    expect(during.getDate()).toBe(25);
    expect(puzzleForDate(EPOCH, before)).toBe(67);
    expect(puzzleForDate(EPOCH, during)).toBe(68);
    expect(puzzleForDate(EPOCH, after)).toBe(69);
  });
});

describe("puzzleForDate", () => {
  it("is negative before the first puzzle", () => {
    expect(puzzleForDate(EPOCH, new Date(2026, 7, 17))).toBe(-1);
  });
});

describe("isSameDay", () => {
  it("ignores the time of day", () => {
    expect(isSameDay(new Date(2026, 7, 18, 0, 1), new Date(2026, 7, 18, 23, 59))).toBe(
      true,
    );
  });

  it("separates adjacent days", () => {
    expect(isSameDay(new Date(2026, 7, 18, 23, 59), new Date(2026, 7, 19, 0, 1))).toBe(
      false,
    );
  });
});

describe("puzzleState", () => {
  const today = 10;

  it("locks anything not released yet", () => {
    expect(puzzleState(EMPTY_STATS, 11, today)).toBe("locked");
    expect(puzzleState(EMPTY_STATS, 500, today)).toBe("locked");
  });

  it("leaves released days open", () => {
    expect(puzzleState(EMPTY_STATS, 10, today)).toBe("unplayed");
    expect(puzzleState(EMPTY_STATS, 0, today)).toBe("unplayed");
  });

  it("marks a day guessed at but unfinished", () => {
    const stats = recordStart(EMPTY_STATS, 4);
    expect(puzzleState(stats, 4, today)).toBe("started");
  });

  it("separates solving on the day from catching up later", () => {
    let stats = recordSolve(EMPTY_STATS, solve(3, true));
    stats = recordSolve(stats, solve(4, false));
    expect(puzzleState(stats, 3, today)).toBe("solved");
    expect(puzzleState(stats, 4, today)).toBe("replayed");
  });

  it("treats a negative puzzle as locked rather than crashing", () => {
    expect(puzzleState(EMPTY_STATS, -1, today)).toBe("locked");
  });
});
