/**
 * Character markers for played words.
 *
 * A word's marker is chosen by rank, on a heat gradient: hot sauce closest to
 * the answer, slushie furthest away. The bands here are coarser than the ten in
 * bands.ts on purpose - six characters have to be told apart at around 28px, so
 * grouping Hot with Burning costs nothing and gives each character a wide enough
 * range to actually show up in a game.
 */

export type MarkerBand = {
  /** Highest rank this marker covers. */
  maxRank: number;
  file: string;
  /** For the alt text and the legend. */
  name: string;
  /** Multiplier on the marker height. 1 is the standard size. */
  scale: number;
};

/**
 * How much larger the answer is drawn than an ordinary marker. Declared before
 * MARKER_BANDS because the table reads it - a const is not hoisted.
 */
export const ANSWER_SCALE = 1.6;

export const MARKER_BANDS: readonly MarkerBand[] = [
  // The answer itself. Same character as the hottest band, drawn large - it is
  // the end of the game and should dominate the board.
  { maxRank: 0, file: "4_hot_sauce.png", name: "answer", scale: ANSWER_SCALE },
  { maxRank: 9, file: "4_hot_sauce.png", name: "hot sauce", scale: 1 },
  { maxRank: 49, file: "3_sausage.png", name: "hot dog", scale: 1 },
  { maxRank: 299, file: "6_drumstick.png", name: "drumstick", scale: 1 },
  { maxRank: 2999, file: "2_gherkin.png", name: "gherkin", scale: 1 },
  { maxRank: 9999, file: "1_ice_cream.png", name: "ice cream", scale: 1 },
  { maxRank: 24_999, file: "5_slushie.png", name: "slushie", scale: 1 },
  // Same character, drawn smaller. The furthest guesses read as further away
  // rather than needing a seventh character, and it stops the outer field -
  // where most early guesses land - from filling with full-size artwork.
  {
    maxRank: Infinity,
    file: "5_slushie.png",
    name: "distant slushie",
    scale: 0.6,
  },
];

export function markerBandForRank(rank: number): MarkerBand {
  for (const band of MARKER_BANDS) {
    if (rank <= band.maxRank) return band;
  }
  return MARKER_BANDS[MARKER_BANDS.length - 1]!;
}

/**
 * Height in CSS pixels.
 *
 * The dot these replaced was 8px across, with a 24px ring around the focused
 * one. These are the only two numbers that control marker size; the artwork is
 * generated at 160px tall, so anything up to about 80px costs no quality and no
 * regeneration.
 */
export const MARKER_HEIGHT = 41;
export const MARKER_FOCUS_HEIGHT = 49;

/** Gold halo drawn behind the answer. Matches --tone-solved in styles.css. */
export const ANSWER_GLOW_COLOUR = "#ffd684";

/**
 * How far the halo reaches past the artwork, in pixels.
 *
 * Canvas shadows fade out across their blur radius, so the radius is set from
 * this rather than used directly - a blur of 5 would be barely visible 5px out.
 */
export const ANSWER_GLOW_SPREAD = 5;

/**
 * Redraws of the halo. One pass gives a wash too faint to read against the
 * board; each pass deepens the same shadow without widening it.
 */
export const ANSWER_GLOW_PASSES = 3;

/** Height of the bob, in pixels. Small - it should read as hovering, not bouncing. */
export const FLOAT_AMPLITUDE = 2.5;

/** Seconds for one full bob. */
export const FLOAT_PERIOD = 2.4;

type LoadState = "idle" | "loading" | "ready" | "failed";

/**
 * Loads the marker images once and hands out whatever is ready.
 *
 * The renderer must never wait on a network fetch, so unloaded markers fall
 * back to a plain dot and quietly upgrade themselves when the image arrives.
 */
export class MarkerSet {
  private images = new Map<string, HTMLImageElement>();
  private states = new Map<string, LoadState>();
  private onReady: (() => void) | null = null;

  private readonly baseUrl: string;

  // A plain field, not a parameter property: those are not erasable syntax, so
  // Node cannot run this module directly and the preview scripts could not
  // import anything from it without a bundler.
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /** Called when an image finishes loading, so the board can repaint. */
  setReadyCallback(callback: () => void): void {
    this.onReady = callback;
  }

  load(): void {
    for (const band of MARKER_BANDS) {
      if (this.states.get(band.file)) continue;
      this.states.set(band.file, "loading");

      const image = new Image();
      image.decoding = "async";
      image.addEventListener("load", () => {
        this.states.set(band.file, "ready");
        this.onReady?.();
      });
      image.addEventListener("error", () => {
        // A missing file must not take the board down - the renderer falls back
        // to the dot it used before.
        this.states.set(band.file, "failed");
        console.warn(`marker image missing: ${band.file}`);
      });
      image.src = `${this.baseUrl}markers/${band.file}`;
      this.images.set(band.file, image);
    }
  }

  /** The image for this rank, or null if it is not usable yet. */
  forRank(rank: number): HTMLImageElement | null {
    const band = markerBandForRank(rank);
    if (this.states.get(band.file) !== "ready") return null;
    const image = this.images.get(band.file);
    return image?.complete && image.naturalWidth > 0 ? image : null;
  }

  /** Height multiplier for this rank. */
  scaleForRank(rank: number): number {
    return markerBandForRank(rank).scale;
  }

  /**
   * Distinct files that have loaded, for the background drifters to choose
   * from. Deduplicated: the hot sauce and the slushie each hold two bands, and
   * a raw list would make them twice as likely to drift past as the others.
   */
  get readyFiles(): string[] {
    const files = new Set<string>();
    for (const band of MARKER_BANDS) {
      if (this.states.get(band.file) === "ready") files.add(band.file);
    }
    return [...files];
  }

  /** A loaded image by file name, or null if it is not usable. */
  byFile(file: string): HTMLImageElement | null {
    if (this.states.get(file) !== "ready") return null;
    const image = this.images.get(file);
    return image?.complete && image.naturalWidth > 0 ? image : null;
  }

  get anyReady(): boolean {
    for (const state of this.states.values()) {
      if (state === "ready") return true;
    }
    return false;
  }
}

/**
 * Vertical offset for the hover, in pixels.
 *
 * Each marker gets a phase from its vocabulary index so the board does not
 * pulse in unison, which reads as a glitch rather than as floating.
 */
export function floatOffset(timeMs: number, seed: number): number {
  const phase = ((seed % 1000) / 1000) * Math.PI * 2;
  const turns = (timeMs / 1000 / FLOAT_PERIOD) * Math.PI * 2;
  return Math.sin(turns + phase) * FLOAT_AMPLITUDE;
}
