/**
 * A character drifting across the background.
 *
 * Rare, slow and half-transparent: once every five minutes or so, one of the
 * six markers crosses the screen in a straight line, turning as it goes.
 *
 * Screen space, like the shooting stars, and drawn behind the word field at
 * half opacity - it is scenery passing beyond the words, not among them.
 */

import { MARKER_OPACITY } from "./markers";

export type Drifter = {
  bornAt: number;
  /** Milliseconds from entering to leaving. */
  duration: number;
  file: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** 1 or -1: which way it turns. */
  spin: number;
  /** Height in pixels. */
  size: number;
};

/**
 * Gap between appearances.
 *
 * A game lasts about five minutes and can be over in two, so the original
 * five-to-eleven-minute gap meant most players never saw a character at all.
 * These are set against the crossing time rather than picked in isolation: a
 * crossing averages twenty seconds, so a mean gap of twenty keeps roughly one
 * or two on screen, occasionally three, and about half a dozen over a short
 * game. Busy, not a parade.
 */
export const MIN_GAP = 10_000;
export const MAX_GAP = 30_000;

/**
 * Wait before the first one. Short, so a two-minute game still sees several,
 * but not instant - arriving to a screen already full reads as decoration
 * rather than as something that happens.
 */
export const FIRST_GAP_MIN = 4_000;
export const FIRST_GAP_MAX = 12_000;

/** Pixels per millisecond. A gentle drift, not a flypast. */
export const MIN_SPEED = 0.06;
export const MAX_SPEED = 0.12;

/**
 * Height in pixels.
 *
 * An absolute figure rather than a fraction of the marker size, because it was
 * chosen by eye against the screen. It happens to sit just under MARKER_HEIGHT,
 * so a drifting character reads at about the size of an ordinary played word
 * rather than the larger answer.
 */
export const SIZE = 40;

/**
 * How solid a drifting character is, relative to a played marker.
 *
 * Derived rather than typed in, so the two cannot drift apart if marker opacity
 * is ever changed. Only a shade softer than a played marker - just enough to
 * sit behind the game. Half, and then nine tenths, both read as washed out.
 *
 * Note the drifters are drawn under the word field, which costs a further 3%
 * or so where the dust is dense, so on screen they land near 0.92.
 */
export const OPACITY = MARKER_OPACITY * 0.95;

/**
 * Turns across the journey, for the slushie. One full rotation looked sluggish
 * at this size, and 1.2 was still slow, so 1.44 - each step twenty per cent up
 * on the last, for the same crossing time. Raising this speeds every character
 * up together and keeps the ratios between them.
 *
 * Every other character is a multiple of this; see SPIN_MULTIPLIER.
 */
export const SPIN_TURNS = 1.44;

/**
 * How fast each character turns, relative to the slushie.
 *
 * Set by eye rather than derived, each one relative to the last:
 *
 *   slushie    baseline
 *   ice cream  20% quicker than the baseline          1.2
 *   gherkin    10% quicker than the ice cream         1.2  x 1.1  = 1.32
 *   hot dog    30% quicker than the gherkin           1.32 x 1.3  = 1.716
 *   drumstick  same as the hot dog                              = 1.716
 *   hot sauce  10% quicker than the fastest of those  1.716 x 1.1 = 1.8876
 *
 * Written out rather than chained in code: the chain is the specification, and
 * a reader should be able to check the arithmetic without running it.
 */
export const SPIN_MULTIPLIER: Readonly<Record<string, number>> = {
  "5_slushie.png": 1,
  "1_ice_cream.png": 1.2,
  "2_gherkin.png": 1.32,
  "3_sausage.png": 1.716,
  "6_drumstick.png": 1.716,
  "4_hot_sauce.png": 1.8876,
};

/** Turns for one character. Unknown artwork falls back to the baseline. */
export function spinTurnsFor(file: string): number {
  return SPIN_TURNS * (SPIN_MULTIPLIER[file] ?? 1);
}

/**
 * The character whose dimensions every drifter is drawn at.
 *
 * All six are currently 160px tall with no padding, so they already match. This
 * pins that: the drawn box comes from one reference rather than from whichever
 * image happens to be passing, so replacing artwork later cannot quietly change
 * how large a drifter appears.
 */
export const SIZE_REFERENCE = "5_slushie.png";

/*
 * There is deliberately no zoom-based fade here.
 *
 * There used to be one, fading these out between 1.2x and 1.6x on the theory
 * that a spinning sprite is in the way when the player is working closely. The
 * thresholds were chosen without checking what zoom the game actually reaches:
 * the default view is already 0.9-1.2x depending on the window, one bad guess
 * puts it past 1.6x, and a good guess puts it at 40x or more. The effect was
 * not "hidden when zoomed right in" but "hidden almost always".
 *
 * These are screen-space decoration and do not belong to the board, so they now
 * ignore its zoom entirely.
 */

/** Extra clearance beyond the edge, so a sprite never touches it. */
export const EDGE_MARGIN = 8;

/**
 * Most that may be on screen together. Three is the point where the background
 * still reads as background; four starts competing with the board.
 */
export const MAX_CONCURRENT = 3;

/**
 * How often each character turns up, relative to the others.
 *
 * These are the requested shares - 30, 20, 15, 10, 10, 5 - which sum to 90
 * rather than 100, so they are used as weights and normalised. That keeps the
 * ratios exactly as specified: the slushie is six times as likely as the hot
 * sauce either way.
 */
export const APPEARANCE_WEIGHT: Readonly<Record<string, number>> = {
  "5_slushie.png": 30,
  "1_ice_cream.png": 20,
  "2_gherkin.png": 15,
  "3_sausage.png": 10,
  "6_drumstick.png": 10,
  "4_hot_sauce.png": 5,
};

/**
 * Pick a character by weight.
 *
 * Files with no weight fall back to 1 rather than never appearing, so new
 * artwork shows up even if someone forgets to add it to the table.
 */
export function pickWeighted(files: readonly string[], roll: number): string {
  const weights = files.map((file) => APPEARANCE_WEIGHT[file] ?? 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return files[0]!;

  let cursor = Math.min(Math.max(roll, 0), 0.999999) * total;
  for (let i = 0; i < files.length; i++) {
    cursor -= weights[i]!;
    if (cursor < 0) return files[i]!;
  }
  return files[files.length - 1]!;
}

/**
 * The eight straight-line directions: horizontal, vertical and the four
 * diagonals. No curves - the brief asked for straight lines, and a drifting
 * curve would look like something is steering it.
 */
export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export type Random = () => number;

const between = (random: Random, low: number, high: number) =>
  low + random() * (high - low);

export function spawnDrifter(
  random: Random,
  files: readonly string[],
  width: number,
  height: number,
  now: number,
): Drifter {
  const file = pickWeighted(files, random());
  const direction = DIRECTIONS[
    Math.min(DIRECTIONS.length - 1, Math.floor(random() * DIRECTIONS.length))
  ]!;
  const size = SIZE;

  const length = Math.hypot(direction[0], direction[1]) || 1;
  const dx = direction[0] / length;
  const dy = direction[1] / length;

  // The path is offset *perpendicular* to travel rather than through a free
  // random point, so it always crosses the middle rather than clipping a corner.
  const spread = between(random, -0.35, 0.35) * Math.min(width, height);
  const offsetX = -dy * spread;
  const offsetY = dx * spread;
  const throughX = width / 2 + offsetX;
  const throughY = height / 2 + offsetY;

  // How far to travel from that point to be fully clear of the screen.
  //
  // Half the diagonal is not enough: a diagonal path leaves through a corner,
  // where neither axis has cleared yet, and the character blinks out in view.
  // Solved exactly instead - the sprite is off-screen as soon as *either* axis
  // is past its edge, so take whichever needs less.
  // Plus a margin: solving for exactly the edge leaves the sprite touching it,
  // and rounding can then show a sliver at the moment it should be gone.
  const clearX =
    Math.abs(dx) > 1e-9
      ? (width / 2 + size + EDGE_MARGIN + Math.abs(offsetX)) / Math.abs(dx)
      : Infinity;
  const clearY =
    Math.abs(dy) > 1e-9
      ? (height / 2 + size + EDGE_MARGIN + Math.abs(offsetY)) / Math.abs(dy)
      : Infinity;
  const reach = Math.min(clearX, clearY);

  const speed = between(random, MIN_SPEED, MAX_SPEED);

  return {
    bornAt: now,
    duration: (reach * 2) / speed,
    file,
    fromX: throughX - dx * reach,
    fromY: throughY - dy * reach,
    toX: throughX + dx * reach,
    toY: throughY + dy * reach,
    spin: random() < 0.5 ? -1 : 1,
    size,
  };
}

/** Where a drifter is, and how far round it has turned, at a moment. */
export function drifterAt(drifter: Drifter, now: number) {
  const progress = (now - drifter.bornAt) / drifter.duration;
  return {
    progress,
    x: drifter.fromX + (drifter.toX - drifter.fromX) * progress,
    y: drifter.fromY + (drifter.toY - drifter.fromY) * progress,
    rotation:
      progress * Math.PI * 2 * spinTurnsFor(drifter.file) * drifter.spin,
  };
}

export class Drifters {
  private active: Drifter[] = [];
  private nextSpawn = 0;
  private readonly random: Random;

  constructor(random: Random = Math.random) {
    this.random = random;
  }

  /** Everything on screen. Exposed for tests; the renderer only draws. */
  get current(): readonly Drifter[] {
    return this.active;
  }

  update(
    now: number,
    width: number,
    height: number,
    files: readonly string[],
  ): void {
    this.active = this.active.filter(
      (drifter) => now - drifter.bornAt < drifter.duration,
    );

    if (this.nextSpawn === 0) {
      // A short wait before the first, so the screen is not already full on
      // arrival. Subsequent gaps are longer.
      this.nextSpawn = now + between(this.random, FIRST_GAP_MIN, FIRST_GAP_MAX);
      return;
    }

    if (now < this.nextSpawn || files.length === 0) return;

    if (this.active.length < MAX_CONCURRENT) {
      this.active.push(spawnDrifter(this.random, files, width, height, now));
    }
    // The timer resets either way. Skipping the reset when the screen is full
    // would make one spawn the instant a slot frees, which arrives as a
    // suspicious replacement rather than a new arrival.
    this.nextSpawn = now + between(this.random, MIN_GAP, MAX_GAP);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    now: number,
    resolve: (file: string) => HTMLImageElement | null,
  ): void {
    if (this.active.length === 0) return;

    // Sized from the reference character, not from each one, so every drifter
    // occupies the same box whatever artwork is in play.
    const reference = resolve(SIZE_REFERENCE);

    for (const drifter of this.active) {
      const image = resolve(drifter.file);
      if (!image) continue;

      const { x, y, rotation, progress } = drifterAt(drifter, now);
      if (progress < 0 || progress > 1) continue;

      const shape = reference ?? image;
      const height = drifter.size;
      const width = (shape.naturalWidth / shape.naturalHeight) * height;

      ctx.save();
      ctx.globalAlpha = OPACITY;
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
  }
}
