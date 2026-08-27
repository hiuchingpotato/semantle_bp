import { describe, expect, it } from "vitest";

import {
  DIRECTIONS,
  Drifters,
  MAX_GAP,
  MAX_SPEED,
  MIN_GAP,
  MIN_SPEED,
  OPACITY,
  APPEARANCE_WEIGHT,
  FIRST_GAP_MAX,
  MAX_CONCURRENT,
  SIZE,
  SPIN_MULTIPLIER,
  SPIN_TURNS,
  drifterAt,
  pickWeighted,
  spawnDrifter,
  spinTurnsFor,
} from "./drifters";
import { ANSWER_SCALE, MARKER_HEIGHT, MARKER_OPACITY } from "./markers";

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

  it("turns its own character's number of times across the journey", () => {
    const end = drifterAt(drifter, 1000 + drifter.duration);
    const expected = Math.PI * 2 * spinTurnsFor(drifter.file);
    expect(Math.abs(end.rotation)).toBeCloseTo(expected, 6);
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
    expect(drifters.current).toHaveLength(0);
  });

  it("shows the first one early, so a short game still sees it", () => {
    // The game lasts about five minutes and can end in two, so the first
    // arrival has to be seconds away, not minutes.
    const drifters = new Drifters(sequence([0]));
    drifters.update(0, W, H, FILES);
    drifters.update(FIRST_GAP_MAX + 1, W, H, FILES);
    expect(drifters.current.length).toBeGreaterThan(0);
    expect(FIRST_GAP_MAX).toBeLessThan(15_000);
  });

  it("switches to the recurring gap after the first arrival", () => {
    // The two ranges overlap on purpose - first 4-12s, recurring 10-30s - so
    // this checks the behaviour, not that one bound exceeds the other.
    const drifters = new Drifters(sequence([0]));
    drifters.update(0, W, H, FILES);
    drifters.update(FIRST_GAP_MAX + 1, W, H, FILES);
    const afterFirst = drifters.current.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Nothing new until the shortest recurring gap has elapsed.
    drifters.update(FIRST_GAP_MAX + MIN_GAP - 1, W, H, FILES);
    expect(drifters.current.length).toBe(afterFirst);
  });

  it("builds up to several on screen", () => {
    const drifters = new Drifters(lcg(4));
    let now = 0;
    let most = 0;
    for (let i = 0; i < 200; i++) {
      now += 2_000;
      drifters.update(now, W, H, FILES);
      most = Math.max(most, drifters.current.length);
    }
    expect(most).toBeGreaterThan(1);
  });

  it("never exceeds the concurrent cap", () => {
    const drifters = new Drifters(lcg(9));
    let now = 0;
    for (let i = 0; i < 500; i++) {
      now += 1_000;
      drifters.update(now, W, H, FILES);
      expect(drifters.current.length).toBeLessThanOrEqual(MAX_CONCURRENT);
    }
  });

  it("retires each one when it has left the screen", () => {
    const drifters = new Drifters(lcg(2));
    let now = 0;
    for (let i = 0; i < 40; i++) {
      now += 3_000;
      drifters.update(now, W, H, FILES);
      for (const drifter of drifters.current) {
        expect(now - drifter.bornAt).toBeLessThan(drifter.duration);
      }
    }
  });

  it("does nothing when no images have loaded", () => {
    const drifters = new Drifters(sequence([0]));
    drifters.update(0, W, H, []);
    drifters.update(MAX_GAP + 1, W, H, []);
    expect(drifters.current).toHaveLength(0);
  });
});

describe("pickWeighted", () => {
  it("honours the requested ratios", () => {
    // The shares given were 30/20/15/10/10/5, which sum to 90 rather than 100,
    // so they are weights: what matters is that the ratios hold.
    const counts: Record<string, number> = {};
    const steps = 100_000;
    for (let i = 0; i < steps; i++) {
      const file = pickWeighted(FILES, i / steps);
      counts[file] = (counts[file] ?? 0) + 1;
    }
    const share = (f: string) => (counts[f] ?? 0) / steps;
    // 30/90, 20/90, 15/90, 10/90, 10/90, 5/90
    expect(share("5_slushie.png")).toBeCloseTo(30 / 90, 2);
    expect(share("1_ice_cream.png")).toBeCloseTo(20 / 90, 2);
    expect(share("2_gherkin.png")).toBeCloseTo(15 / 90, 2);
    expect(share("3_sausage.png")).toBeCloseTo(10 / 90, 2);
    expect(share("6_drumstick.png")).toBeCloseTo(10 / 90, 2);
    expect(share("4_hot_sauce.png")).toBeCloseTo(5 / 90, 2);
  });

  it("keeps the slushie six times as likely as the hot sauce", () => {
    expect(APPEARANCE_WEIGHT["5_slushie.png"]! / APPEARANCE_WEIGHT["4_hot_sauce.png"]!)
      .toBe(6);
  });

  it("always returns one of the files it was given", () => {
    for (let i = 0; i <= 20; i++) {
      expect(FILES).toContain(pickWeighted(FILES, i / 20));
    }
    // Out-of-range rolls must not fall off either end.
    expect(FILES).toContain(pickWeighted(FILES, 1));
    expect(FILES).toContain(pickWeighted(FILES, -0.5));
  });

  it("still shows artwork nobody gave a weight", () => {
    const unknown = ["7_mystery.png"];
    expect(pickWeighted(unknown, 0.5)).toBe("7_mystery.png");
  });
});

describe("appearance", () => {
  it("ignores board zoom entirely", () => {
    // These used to fade out between 1.2x and 1.6x. The default view is
    // already around 1x, one poor guess puts the board past 1.6x and a good
    // one past 40x, so that hid them for almost every game rather than only
    // when zoomed right in. draw() no longer takes a zoom at all - this
    // asserts the signature, so reintroducing one is a deliberate act.
    expect(Drifters.prototype.draw.length).toBe(3);
  });

  it("is a shade less solid than a played marker", () => {
    expect(OPACITY).toBeCloseTo(MARKER_OPACITY * 0.95, 6);
    // Still clearly behind the game rather than part of it.
    expect(OPACITY).toBeLessThan(MARKER_OPACITY);
  });

  it("is a tenth smaller than the answer marker", () => {
    const answerHeight = MARKER_HEIGHT * ANSWER_SCALE;
    expect(SIZE).toBeCloseTo(answerHeight * 0.9, 6);
    expect(SIZE).toBeLessThan(answerHeight);
  });

  it("is one size, not a range", () => {
    const random = lcg(5);
    const sizes = new Set<number>();
    for (let i = 0; i < 20; i++) {
      sizes.add(spawnDrifter(random, FILES, W, H, 0).size);
    }
    expect(sizes).toEqual(new Set([SIZE]));
  });

  it("turns faster than one rotation per crossing", () => {
    expect(SPIN_TURNS).toBeCloseTo(1.44, 6);
  });

  it("gives every character its own spin speed", () => {
    // The chain, as specified: each relative to the one before it.
    expect(spinTurnsFor("5_slushie.png")).toBeCloseTo(SPIN_TURNS, 6);
    expect(spinTurnsFor("1_ice_cream.png")).toBeCloseTo(SPIN_TURNS * 1.2, 6);
    expect(spinTurnsFor("2_gherkin.png")).toBeCloseTo(SPIN_TURNS * 1.2 * 1.1, 6);
    expect(spinTurnsFor("3_sausage.png")).toBeCloseTo(
      SPIN_TURNS * 1.2 * 1.1 * 1.3,
      6,
    );
    // The drumstick matches the hot dog.
    expect(spinTurnsFor("6_drumstick.png")).toBeCloseTo(
      spinTurnsFor("3_sausage.png"),
      6,
    );
    // The hot sauce is 10% beyond the fastest of the rest.
    expect(spinTurnsFor("4_hot_sauce.png")).toBeCloseTo(
      spinTurnsFor("3_sausage.png") * 1.1,
      6,
    );
  });

  it("makes the hot sauce the fastest and the slushie the slowest", () => {
    const speeds = Object.keys(SPIN_MULTIPLIER).map(spinTurnsFor);
    expect(spinTurnsFor("4_hot_sauce.png")).toBe(Math.max(...speeds));
    expect(spinTurnsFor("5_slushie.png")).toBe(Math.min(...speeds));
  });

  it("covers every character, and falls back for unknown artwork", () => {
    for (const file of FILES) {
      expect(SPIN_MULTIPLIER[file], `no spin set for ${file}`).toBeDefined();
    }
    expect(spinTurnsFor("not_a_marker.png")).toBe(SPIN_TURNS);
  });
});
