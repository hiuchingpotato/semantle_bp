import { describe, expect, it } from "vitest";

import {
  nextRollover,
  puzzleNumberFor,
  readRequestedPuzzle,
  resolveSchedule,
} from "./schedule";

const EPOCH = "2026-06-01";

/** Local-time date, matching how the app reads the clock. */
const at = (iso: string) => {
  const [date, time = "12:00:00"] = iso.split("T");
  const [y, m, d] = date!.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  return new Date(y!, m! - 1, d!, hh!, mm!, ss!);
};

describe("puzzleNumberFor", () => {
  it("starts at zero on the epoch", () => {
    expect(puzzleNumberFor(EPOCH, at("2026-06-01T00:00:01"))).toBe(0);
    expect(puzzleNumberFor(EPOCH, at("2026-06-01T23:59:59"))).toBe(0);
  });

  it("advances at local midnight", () => {
    expect(puzzleNumberFor(EPOCH, at("2026-06-02T00:00:00"))).toBe(1);
  });

  it("counts across month boundaries", () => {
    expect(puzzleNumberFor(EPOCH, at("2026-08-15T09:00:00"))).toBe(75);
  });

  it("is negative before the epoch", () => {
    expect(puzzleNumberFor(EPOCH, at("2026-05-30T12:00:00"))).toBe(-2);
  });

  it("does not skip or repeat a day across a DST change", () => {
    // UK clocks go back on 2026-10-25. Millisecond arithmetic would make one of
    // these days 25 hours long and shift the boundary.
    const before = puzzleNumberFor(EPOCH, at("2026-10-24T12:00:00"));
    const during = puzzleNumberFor(EPOCH, at("2026-10-25T12:00:00"));
    const after = puzzleNumberFor(EPOCH, at("2026-10-26T12:00:00"));
    expect(during - before).toBe(1);
    expect(after - during).toBe(1);
  });
});

describe("resolveSchedule", () => {
  const now = at("2026-08-15T10:00:00"); // puzzle 75

  it("plays today when nothing is requested", () => {
    const schedule = resolveSchedule(EPOCH, 216, now, null);
    expect(schedule).toEqual({
      today: 75,
      active: 75,
      isArchive: false,
      exhausted: false,
    });
  });

  it("opens a past puzzle when asked", () => {
    const schedule = resolveSchedule(EPOCH, 216, now, 12);
    expect(schedule.active).toBe(12);
    expect(schedule.isArchive).toBe(true);
  });

  it("refuses today and the future via the archive parameter", () => {
    for (const requested of [75, 76, 9999]) {
      const schedule = resolveSchedule(EPOCH, 216, now, requested);
      expect(schedule.active).toBe(75);
      expect(schedule.isArchive).toBe(false);
    }
  });

  it("ignores nonsense parameters", () => {
    for (const requested of [-1, -100]) {
      expect(resolveSchedule(EPOCH, 216, now, requested).active).toBe(75);
    }
  });

  it("holds on the last puzzle once the schedule runs out", () => {
    const schedule = resolveSchedule(EPOCH, 20, now, null);
    expect(schedule.active).toBe(19);
    expect(schedule.exhausted).toBe(true);
  });

  it("clamps to puzzle zero before the epoch", () => {
    const schedule = resolveSchedule(EPOCH, 216, at("2026-01-01T10:00:00"), null);
    expect(schedule.active).toBe(0);
    expect(schedule.exhausted).toBe(false);
  });
});

describe("readRequestedPuzzle", () => {
  it("reads an integer puzzle parameter", () => {
    expect(readRequestedPuzzle("?puzzle=41")).toBe(41);
  });

  it("returns null when absent or not an integer", () => {
    expect(readRequestedPuzzle("")).toBeNull();
    expect(readRequestedPuzzle("?puzzle=abc")).toBeNull();
    expect(readRequestedPuzzle("?puzzle=1.5")).toBeNull();
  });
});

describe("nextRollover", () => {
  it("is the coming local midnight", () => {
    const next = nextRollover(at("2026-08-15T23:30:00"));
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
  });
});
