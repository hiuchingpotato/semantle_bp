import { describe, expect, it } from "vitest";

import {
  PIP_COUNT,
  bandForRank,
  describeGuess,
  formatRank,
  formatSimilarity,
} from "./bands";

describe("bandForRank", () => {
  it("names the extremes", () => {
    expect(bandForRank(0).id).toBe("solved");
    expect(bandForRank(1).id).toBe("blazing");
    expect(bandForRank(59_999).id).toBe("distant");
  });

  it("switches band exactly on the boundary", () => {
    expect(bandForRank(9).id).toBe("blazing");
    expect(bandForRank(10).id).toBe("scorching");
    expect(bandForRank(999).id).toBe("warm");
    expect(bandForRank(1000).id).toBe("mild");
  });

  it("never gets worse as rank improves", () => {
    let previous = 0;
    for (let rank = 100_000; rank >= 0; rank -= 137) {
      const pips = bandForRank(rank).pips;
      expect(pips).toBeGreaterThanOrEqual(previous);
      previous = pips;
    }
  });

  it("keeps pip counts inside the meter", () => {
    for (const rank of [0, 1, 10, 100, 1000, 10_000, 50_000]) {
      const band = bandForRank(rank);
      expect(band.pips).toBeGreaterThanOrEqual(0);
      expect(band.pips).toBeLessThanOrEqual(PIP_COUNT);
    }
  });
});

describe("formatRank", () => {
  it("shows a number only inside the top thousand", () => {
    expect(formatRank(1)).toBe("#1");
    expect(formatRank(999)).toBe("#999");
    expect(formatRank(1000)).toBeNull();
  });

  it("shows the answer as first place", () => {
    expect(formatRank(0)).toBe("1");
  });

  it("does not confuse the answer with the closest word", () => {
    // Internal rank 1 is the closest word that is not the answer, and it
    // already displays "#1". The answer drops the hash so the two rows cannot
    // be read as the same position.
    expect(formatRank(0)).not.toBe(formatRank(1));
  });
});

describe("formatSimilarity", () => {
  it("reads as a percentage to two places", () => {
    expect(formatSimilarity(0.7739)).toBe("77.39");
    expect(formatSimilarity(-0.2224)).toBe("-22.24");
  });
});

describe("describeGuess", () => {
  it("announces the win", () => {
    expect(describeGuess("rabbit", 0, 1)).toMatch(/Solved/);
  });

  it("gives a rank when there is one worth giving", () => {
    expect(describeGuess("hare", 4, 0.61)).toMatch(/rank 4/);
    expect(describeGuess("kettle", 40_000, 0.01)).toMatch(/outside the closest/);
  });
});
