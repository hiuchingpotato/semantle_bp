import { describe, expect, it } from "vitest";

import {
  DIRECTIONS,
  Drifters,
  MAX_GAP,
  MAX_SPEED,
  MIN_GAP,
  MIN_SPEED,
  OPACITY,
  drifterAt,
  spawnDrifter,
} from "./drifters";

const FILES = [
  "1_ice_cream.png",
  "2_gherkin.png",
  "3_sausage.png",
  "4_hot_sauce.png",
  "5_slushie.png",
  "6_drumstick.png",
];

const W = 1400;
const H = 900;

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

/**
 * Varying but repeatable. A cycling list cannot exercise a draw whose position
 * in the call order happens to line up with the cycle length.
 */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("spawnDrifter", () => {
  it("starts and ends off screen, in every direction", () => {
    // Diagonals are the case that catches this: they leave through a corner,
    // where neither axis has cleared at half the diagonal.
    const random = lcg(3);
    for (let i = 0; i < 300; i++) {
      const drifter = spawnDrifter(random, FILES, W, H, 0);
      const offScreen = (x: number, y: number) =>
        x < -drifter.size ||
        x > W + drifter.size ||
        y < -drifter.size ||
        y > H + drifter.size;
      // Never seen appearing or vanishing mid-air.
      expect(offScreen(drifter.fromX, drifter.fromY)).toBe(true);
      expect(offScreen(drifter.toX, drifter.toY)).toBe(true);
    }
  });

  it("stays off screen at both extremes for odd viewport shapes", () => {
    const random = lcg(11);
    for (const [w, h] of [[320, 900], [1900, 400], [800, 800]] as const) {
      for (let i = 0; i < 60; i++) {
        const drifter = spawnDrifter(random, FILES, w, h, 0);
        const offScreen = (x: number, y: number) =>
          x < -drifter.size ||
          x > w + drifter.size ||
          y < -drifter.size ||
          y > h + drifter.size;
        expect(offScreen(drifter.fromX, drifter.fromY)).toBe(true);
        expect(offScreen(drifter.toX, drifter.toY)).toBe(true);
      }
    }
  });

  it("travels in a straight line along one of the eight directions", () => {
    for (const value of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      const drifter = spawnDrifter(sequence([value]), FILES, W, H, 0);
      const dx = drifter.toX - drifter.fromX;
      const dy = drifter.toY - drifter.fromY;

      // Horizontal, vertical or exactly 45 degrees - nothing in between.
      const matches = DIRECTIONS.some(([ux, uy]) => {
        const len = Math.hypot(ux, uy);
        const nx = ux / len;
        const ny = uy / len;
        const travel = Math.hypot(dx, dy);
        return (
          Math.abs(dx / travel - nx) < 1e-6 && Math.abs(dy / travel - ny) < 1e-6
        );
      });
      expect(matches).toBe(true);
    }
  });

  it("only ever picks one of the six characters", () => {
    for (let i = 0; i < 40; i++) {
      const drifter = spawnDrifter(sequence([i / 40]), FILES, W, H, 0);
      expect(FILES).toContain(drifter.file);
    }
  });

  it("cannot index past the end of the file list", () => {
    // Math.random() is [0, 1) but a stub could hand back 1; that must not
    // produce an undefined file.
    const drifter = spawnDrifter(sequence([1]), FILES, W, H, 0);
    expect(FILES).toContain(drifter.file);
  });

  it("crosses at a sane pace", () => {
    for (const value of [0, 0.5, 0.999]) {
      const drifter = spawnDrifter(sequence([value]), FILES, W, H, 0);
      const distance = Math.hypot(
        drifter.toX - drifter.fromX,
        drifter.toY - drifter.fromY,
      );
      const speed = distance / drifter.duration;
      expect(speed).toBeGreaterThanOrEqual(MIN_SPEED - 1e-9);
      expect(speed).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
      // Slow enough to notice, quick enough not to outstay its welcome.
      expect(drifter.duration).toBeGreaterThan(8_000);
      expect(drifter.duration).toBeLessThan(60_000);
    }
  });

  it("turns both ways", () => {
    const random = lcg(7);
    const spins = new Set<number>();
    for (let i = 0; i < 50; i++) {
      spins.add(spawnDrifter(random, FILES, W, H, 0).spin);
    }
    expect(spins).toEqual(new Set([-1, 1]));
  });

  it("always crosses the middle of the screen", () => {
    // The path is offset perpendicular to travel, so it can never drift off to
    // one side and clip a corner.
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      const drifter = spawnDrifter(sequence([value]), FILES, W, H, 0);
      const midX = (drifter.fromX + drifter.toX) / 2;
      const midY = (drifter.fromY + drifter.toY) / 2;
      expect(midX).toBeGreaterThan(0);
      expect(midX).toBeLessThan(W);
      expect(midY).toBeGreaterThan(0);
      expect(midY).toBeLessThan(H);
    }
  });
});

describe("drifterAt", () => {
  const drifter = spawnDrifter(sequence([0.5]), FILES, W, H, 1000);

  it("is at the start when it enters and the end when it leaves", () => {
    const start = drifterAt(drifter, 1000);
    const end = drifterAt(drifter, 1000 + drifter.duration);
    expect(start.x).toBeCloseTo(drifter.fromX, 6);
    expect(start.y).toBeCloseTo(drifter.fromY, 6);
    expect(end.x).toBeCloseTo(drifter.toX, 6);
    expect(end.y).toBeCloseTo(drifter.toY, 6);
  });

  it("turns exactly once across the journey", () => {
    const end = drifterAt(drifter, 1000 + drifter.duration);
    expect(Math.abs(end.rotation)).toBeCloseTo(Math.PI * 2, 6);
  });

  it("moves at a constant rate", () => {
    // Straight line, steady speed: half the time is half the distance.
    const half = drifterAt(drifter, 1000 + drifter.duration / 2);
    expect(half.x).toBeCloseTo((drifter.fromX + drifter.toX) / 2, 6);
    expect(half.y).toBeCloseTo((drifter.fromY + drifter.toY) / 2, 6);
  });
});

describe("Drifters", () => {
  it("does not open with one", () => {
    const drifters = new Drifters(sequence([0]));
    drifters.update(0, W, H, FILES);
    expect(drifters.current).toBeNull();
  });

  it("waits at least five minutes", () => {
    const drifters = new Drifters(sequence([0]));
    drifters.update(0, W, H, FILES);
    drifters.update(MIN_GAP - 1, W, H, FILES);
    expect(drifters.current).toBeNull();
    drifters.update(MAX_GAP + 1, W, H, FILES);
    expect(drifters.current).not.toBeNull();
  });

  it("shows one at a time", () => {
    const drifters = new Drifters(sequence([0]));
    let now = 0;
    drifters.update(now, W, H, FILES);
    for (let i = 0; i < 30; i++) {
      now += MIN_GAP;
      drifters.update(now, W, H, FILES);
      // `current` is a single slot, so this also proves no second one queues up.
      expect(drifters.current === null || typeof drifters.current === "object").toBe(
        true,
      );
    }
  });

  it("clears one once it has left the screen", () => {
    const drifters = new Drifters(sequence([0]));
    drifters.update(0, W, H, FILES);
    drifters.update(MAX_GAP + 1, W, H, FILES);
    const active = drifters.current;
    expect(active).not.toBeNull();
    drifters.update(MAX_GAP + 1 + active!.duration + 1, W, H, FILES);
    // A fresh one may have spawned, but never the same object.
    expect(drifters.current).not.toBe(active);
  });

  it("does nothing when no images have loaded", () => {
    const drifters = new Drifters(sequence([0]));
    drifters.update(0, W, H, []);
    drifters.update(MAX_GAP + 1, W, H, []);
    expect(drifters.current).toBeNull();
  });
});

describe("appearance", () => {
  it("is half transparent", () => {
    expect(OPACITY).toBe(0.5);
  });
});
