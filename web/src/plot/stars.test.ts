import { describe, expect, it } from "vitest";

import {
  MAX_CONCURRENT,
  MAX_GAP,
  MAX_LIFE,
  MIN_GAP,
  MIN_LIFE,
  ShootingStars,
  spawnStar,
  starAlpha,
} from "./stars";

/** Deterministic stand-in for Math.random, cycling through fixed values. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe("starAlpha", () => {
  it("is invisible before it starts and after it ends", () => {
    expect(starAlpha(0)).toBe(0);
    expect(starAlpha(1)).toBe(0);
    expect(starAlpha(-0.2)).toBe(0);
    expect(starAlpha(1.4)).toBe(0);
  });

  it("reaches full brightness early, then trails off", () => {
    expect(starAlpha(0.15)).toBeCloseTo(1, 5);
    // Symmetrical would look mechanical; the fade is the longer half.
    expect(starAlpha(0.08)).toBeGreaterThan(starAlpha(0.92));
  });

  it("never leaves the 0-1 range", () => {
    for (let p = -0.5; p <= 1.5; p += 0.01) {
      const alpha = starAlpha(p);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  it("only ever dims once past the peak", () => {
    let previous = Infinity;
    for (let p = 0.15; p < 1; p += 0.02) {
      const alpha = starAlpha(p);
      expect(alpha).toBeLessThanOrEqual(previous + 1e-9);
      previous = alpha;
    }
  });
});

describe("spawnStar", () => {
  it("lasts less than two seconds", () => {
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      const star = spawnStar(sequence([value]), 1000, 800, 0);
      expect(star.life).toBeGreaterThanOrEqual(MIN_LIFE);
      expect(star.life).toBeLessThan(2000);
      expect(MAX_LIFE).toBeLessThan(2000);
    }
  });

  it("always travels downwards", () => {
    for (const value of [0.01, 0.3, 0.6, 0.99]) {
      expect(spawnStar(sequence([value]), 1000, 800, 0).vy).toBeGreaterThan(0);
    }
  });

  it("goes both ways", () => {
    // First draw decides the direction: below 0.5 is leftward.
    const left = spawnStar(sequence([0.2, 0.5]), 1000, 800, 0);
    const right = spawnStar(sequence([0.8, 0.5]), 1000, 800, 0);
    expect(left.vx).toBeLessThan(0);
    expect(right.vx).toBeGreaterThan(0);
  });

  it("starts in the upper part of the screen", () => {
    for (const value of [0, 0.5, 0.999]) {
      const star = spawnStar(sequence([value]), 1000, 800, 0);
      // Allowed slightly off the top so a star can enter rather than appear.
      expect(star.y).toBeGreaterThanOrEqual(-0.05 * 800);
      expect(star.y).toBeLessThanOrEqual(0.66 * 800);
    }
  });
});

describe("ShootingStars", () => {
  it("does not open with a star", () => {
    const stars = new ShootingStars(sequence([0]));
    stars.update(0, 1000, 800);
    expect(stars.count).toBe(0);
  });

  it("spawns once the gap has passed", () => {
    const stars = new ShootingStars(sequence([0]));
    stars.update(0, 1000, 800);
    stars.update(MAX_GAP + 1, 1000, 800);
    expect(stars.count).toBe(1);
  });

  it("never shows more than a couple at once", () => {
    const stars = new ShootingStars(sequence([0]));
    let now = 0;
    for (let i = 0; i < 60; i++) {
      now += 100;
      stars.update(now, 1000, 800);
      expect(stars.count).toBeLessThanOrEqual(MAX_CONCURRENT);
    }
  });

  it("retires a star once its life is over", () => {
    // random() === 0 gives the shortest life and the shortest gap, so the check
    // has to land after MIN_LIFE but before MIN_GAP, or a replacement has
    // already spawned and the count never returns to zero.
    expect(MIN_LIFE).toBeLessThan(MIN_GAP);

    const stars = new ShootingStars(sequence([0]));
    stars.update(0, 1000, 800);
    const spawnedAt = MAX_GAP + 1;
    stars.update(spawnedAt, 1000, 800);
    expect(stars.count).toBe(1);

    stars.update(spawnedAt + MIN_LIFE + 1, 1000, 800);
    expect(stars.count).toBe(0);
  });
});
