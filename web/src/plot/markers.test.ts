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
    expect(markerBandForRank(0).name).toBe("answer");
    expect(markerBandForRank(1).name).toBe("hot sauce");
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
    expect(markerBandForRank(24_999).name).toBe("slushie");
    expect(markerBandForRank(25_000).name).toBe("distant slushie");
    expect(markerBandForRank(59_999).name).toBe("distant slushie");
  });

  it("shrinks the furthest guesses rather than recolouring them", () => {
    // Same artwork either side of 25,000; only the size changes.
    expect(markerBandForRank(24_999).file).toBe(markerBandForRank(25_000).file);
    expect(markerBandForRank(24_999).scale).toBe(1);
    expect(markerBandForRank(25_000).scale).toBeCloseTo(0.6, 6);
  });

  it("draws every ordinary band at full size", () => {
    for (const rank of [1, 10, 50, 300, 3000, 10_000, 24_999]) {
      expect(markerBandForRank(rank).scale).toBe(1);
    }
  });

  it("blows the answer up and keeps its character", () => {
    expect(markerBandForRank(0).scale).toBeCloseTo(1.6, 6);
    // Same artwork as the hottest guesses, so winning does not introduce a
    // character the player has never seen.
    expect(markerBandForRank(0).file).toBe(markerBandForRank(1).file);
  });

  it("covers every rank without a gap", () => {
    for (let rank = 0; rank < 60_000; rank += 97) {
      expect(markerBandForRank(rank)).toBeDefined();
    }
  });

  it("uses all six characters", () => {
    // Eight bands, six images: the hot sauce and the slushie each appear twice,
    // at two sizes.
    const files = MARKER_BANDS.map((band) => band.file);
    expect(new Set(files).size).toBe(6);
    expect(files).toHaveLength(8);
  });

  it("never gets colder as the guess improves", () => {
    // The band index must be monotone in rank, or the feedback lies.
    let previous = MARKER_BANDS.length;
    for (const rank of [59_999, 25_000, 10_000, 3000, 300, 50, 10, 0]) {
      const index = MARKER_BANDS.indexOf(markerBandForRank(rank));
      expect(index).toBeLessThanOrEqual(previous);
      previous = index;
    }
  });

  it("never grows as the guess gets worse", () => {
    // Size is a distance cue, so it must not increase with rank.
    let previous = Infinity;
    for (const rank of [0, 10, 50, 300, 3000, 10_000, 25_000, 59_999]) {
      const scale = markerBandForRank(rank).scale;
      expect(scale).toBeLessThanOrEqual(previous);
      previous = scale;
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
