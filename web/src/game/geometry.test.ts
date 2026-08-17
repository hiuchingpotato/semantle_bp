import { describe, expect, it } from "vitest";

import { MAX_RADIUS, angleForRadius, projectAll, radiusForRank } from "./geometry";

const WORDS = 60_000;

describe("radiusForRank", () => {
  it("puts the answer at the origin", () => {
    expect(radiusForRank(0, WORDS)).toBe(0);
  });

  it("grows with rank, so closer really is closer to the middle", () => {
    let previous = -1;
    for (const rank of [1, 10, 100, 1000, 10_000, 59_999]) {
      const radius = radiusForRank(rank, WORDS);
      expect(radius).toBeGreaterThan(previous);
      previous = radius;
    }
  });

  it("reaches the rim at the last rank", () => {
    expect(radiusForRank(WORDS, WORDS)).toBeCloseTo(MAX_RADIUS, 6);
  });

  it("gives the top ranks room instead of collapsing them", () => {
    // The first 1000 words are what a player works in; they need to be
    // separable rather than piled on the centre.
    expect(radiusForRank(1000, WORDS)).toBeGreaterThan(
      radiusForRank(100, WORDS) * 1.5,
    );
  });
});

describe("angleForRadius", () => {
  it("leaves the centre untwisted", () => {
    expect(angleForRadius(1.2, 0)).toBe(1.2);
  });

  it("twists more the further out you go", () => {
    const near = angleForRadius(0, 0.1);
    const far = angleForRadius(0, 0.9);
    expect(far).toBeGreaterThan(near);
  });
});

const noJitter = (count: number) => new Float32Array(count).fill(1);

describe("projectAll", () => {
  it("indexes positions by vocab index, not by rank", () => {
    const indexByRank = new Uint32Array([3, 1, 0, 2]);
    const angles = new Float32Array([0, Math.PI / 2, Math.PI, -Math.PI / 2]);

    const { xs, ys } = projectAll(
      indexByRank,
      { angles, jitter: noJitter(4) },
      4,
    );

    // Vocab index 3 is at rank 0, so it sits at the origin.
    expect(xs[3]).toBeCloseTo(0, 6);
    expect(ys[3]).toBeCloseTo(0, 6);

    // Everything else is off-centre and inside the rim.
    for (const vocabIndex of [0, 1, 2]) {
      const distance = Math.hypot(xs[vocabIndex]!, ys[vocabIndex]!);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThanOrEqual(MAX_RADIUS + 1e-6);
    }
  });

  it("orders words outwards by rank", () => {
    const count = 500;
    const indexByRank = new Uint32Array(count);
    const angles = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      indexByRank[i] = i;
      angles[i] = (i / count) * Math.PI * 2 - Math.PI;
    }

    const { xs, ys } = projectAll(
      indexByRank,
      { angles, jitter: noJitter(count) },
      count,
    );

    let previous = -1;
    for (let rank = 0; rank < count; rank++) {
      const vocabIndex = indexByRank[rank]!;
      const distance = Math.hypot(xs[vocabIndex]!, ys[vocabIndex]!);
      expect(distance).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = distance;
    }
  });

  it("applies the radial jitter it is given", () => {
    const indexByRank = new Uint32Array([0, 1]);
    const angles = new Float32Array([0, 0]);

    const plain = projectAll(indexByRank, { angles, jitter: noJitter(2) }, 2);
    const nudged = projectAll(
      indexByRank,
      { angles, jitter: new Float32Array([1, 1.5]) },
      2,
    );

    const plainRadius = Math.hypot(plain.xs[1]!, plain.ys[1]!);
    const nudgedRadius = Math.hypot(nudged.xs[1]!, nudged.ys[1]!);
    expect(nudgedRadius).toBeCloseTo(plainRadius * 1.5, 6);
  });
});
