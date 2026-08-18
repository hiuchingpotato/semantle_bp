import { describe, expect, it } from "vitest";

import {
  FLOAT_AMPLITUDE,
  FLOAT_PERIOD,
  MARKER_BANDS,
  MARKER_FOCUS_HEIGHT,
  MARKER_HEIGHT,
  floatOffset,
  markerBandForRank,
} from "./markers";

describe("markerBandForRank", () => {
  it("runs hottest to coldest as rank grows", () => {
    expect(markerBandForRank(0).name).toBe("hot sauce");
    expect(markerBandForRank(9).name).toBe("hot sauce");
    expect(markerBandForRank(10).name).toBe("hot dog");
    expect(markerBandForRank(49).name).toBe("hot dog");
    expect(markerBandForRank(50).name).toBe("drumstick");
    expect(markerBandForRank(299).name).toBe("drumstick");
    expect(markerBandForRank(300).name).toBe("gherkin");
    expect(markerBandForRank(2999).name).toBe("gherkin");
    expect(markerBandForRank(3000).name).toBe("ice cream");
    expect(markerBandForRank(9999).name).toBe("ice cream");
    expect(markerBandForRank(10_000).name).toBe("slushie");
    expect(markerBandForRank(59_999).name).toBe("slushie");
  });

  it("covers every rank without a gap", () => {
    for (let rank = 0; rank < 60_000; rank += 97) {
      expect(markerBandForRank(rank)).toBeDefined();
    }
  });

  it("maps each character to exactly one band", () => {
    const files = MARKER_BANDS.map((band) => band.file);
    expect(new Set(files).size).toBe(files.length);
    expect(files).toHaveLength(6);
  });

  it("never gets colder as the guess improves", () => {
    // The band index must be monotone in rank, or the feedback lies.
    let previous = MARKER_BANDS.length;
    for (const rank of [59_999, 10_000, 3000, 300, 50, 10, 0]) {
      const index = MARKER_BANDS.indexOf(markerBandForRank(rank));
      expect(index).toBeLessThanOrEqual(previous);
      previous = index;
    }
  });
});

describe("floatOffset", () => {
  it("stays within the amplitude", () => {
    for (let t = 0; t < 6000; t += 37) {
      const offset = floatOffset(t, 12_345);
      expect(Math.abs(offset)).toBeLessThanOrEqual(FLOAT_AMPLITUDE + 1e-9);
    }
  });

  it("repeats once per period", () => {
    const at = floatOffset(1000, 7);
    const later = floatOffset(1000 + FLOAT_PERIOD * 1000, 7);
    expect(later).toBeCloseTo(at, 6);
  });

  it("gives different markers different phases", () => {
    // Identical phases would make the whole board pulse in unison, which reads
    // as a rendering glitch rather than as floating.
    const offsets = [1, 2, 3, 4, 5].map((seed) => floatOffset(0, seed * 137));
    expect(new Set(offsets.map((o) => o.toFixed(4))).size).toBeGreaterThan(1);
  });

  it("is stable for the same marker and time", () => {
    expect(floatOffset(500, 42)).toBe(floatOffset(500, 42));
  });
});

describe("marker sizing", () => {
  it("keeps the focused marker larger but not dominant", () => {
    expect(MARKER_FOCUS_HEIGHT).toBeGreaterThan(MARKER_HEIGHT);
    expect(MARKER_FOCUS_HEIGHT / MARKER_HEIGHT).toBeLessThan(1.5);
  });

  it("stays within the resolution of the generated artwork", () => {
    // tools/build_markers.sh emits 160px tall. Drawing larger than half that
    // starts to soften on a 2x screen, which is the point to regenerate.
    expect(MARKER_FOCUS_HEIGHT).toBeLessThanOrEqual(80);
  });
});
