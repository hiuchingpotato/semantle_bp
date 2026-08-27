import { bandForRank } from "../game/bands";
import { MAX_RADIUS, radiusForRank } from "../game/geometry";
import type { Guess } from "../game/types";
import { Drifters } from "./drifters";
import { ShootingStars } from "./stars";
import {
  ANSWER_GLOW_COLOUR,
  ANSWER_GLOW_PASSES,
  ANSWER_GLOW_SPREAD,
  MARKER_FOCUS_HEIGHT,
  MARKER_HEIGHT,
  MarkerSet,
  floatOffset,
} from "./markers";

/**
 * The board renderer.
 *
 * Two layers, drawn very differently:
 *
 * 1. Dust - all 60,000 words. Written straight into an ImageData buffer with
 *    additive alpha, one pixel per word, so overlapping words brighten rather
 *    than overdraw. Sixty thousand fill() calls a frame would not hold 60fps;
 *    sixty thousand array writes do. Density becomes visible structure, which
 *    is the point: you can see the shape of the language around the answer.
 *
 * 2. Everything the player put there - rings, guesses, labels - with the normal
 *    2D context on top, where quality matters and the counts are small.
 */

export type Camera = {
  /** Board coordinates at the centre of the viewport. */
  x: number;
  y: number;
  /** Pixels per board unit. */
  scale: number;
};

export type Viewport = {
  width: number;
  height: number;
  dpr: number;
};

/**
 * Camera scale that the zoom readout calls 1.0x. Shared so the drifter fade and
 * the number on screen cannot disagree about what a zoom level means.
 */
export const ZOOM_REFERENCE = 400;

/** Rings mark the ranks a player is trying to cross. */
const GUIDE_RANKS = [10, 100, 1000, 10_000] as const;

const DUST_COLOUR = { r: 122, g: 162, b: 214 };

export type RenderInput = {
  camera: Camera;
  viewport: Viewport;
  xs: Float32Array;
  ys: Float32Array;
  wordCount: number;
  guesses: readonly Guess[];
  focus: Guess | null;
  solved: boolean;
  secretWord: string;
  /** Clock for the hover, in milliseconds. */
  timeMs: number;
  /** False when the player has asked for reduced motion; markers sit still. */
  animate: boolean;
};

export function boardToScreen(
  x: number,
  y: number,
  camera: Camera,
  viewport: Viewport,
): { px: number; py: number } {
  return {
    px: (x - camera.x) * camera.scale + viewport.width / 2,
    // Board y points up, screen y points down.
    py: viewport.height / 2 - (y - camera.y) * camera.scale,
  };
}

export function screenToBoard(
  px: number,
  py: number,
  camera: Camera,
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (px - viewport.width / 2) / camera.scale + camera.x,
    y: (viewport.height / 2 - py) / camera.scale + camera.y,
  };
}

class DustLayer {
  private image: ImageData | null = null;
  private pixels: Uint32Array | null = null;
  private width = 0;
  private height = 0;
  /** Rasterised dust, kept so the animation loop can blit rather than recompute. */
  private cache: HTMLCanvasElement | null = null;
  private cacheKey = "";

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height && this.image) return;
    this.width = width;
    this.height = height;
    this.image = new ImageData(width, height);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.cache = document.createElement("canvas");
    this.cache.width = width;
    this.cache.height = height;
    // Force a recompute: the old raster is the wrong size.
    this.cacheKey = "";
  }

  /**
   * Paint the dust, recomputing only when the view has actually moved.
   *
   * The markers hover continuously, so this runs 60 times a second. Walking
   * 60,000 words and clearing a megapixel buffer that often would burn a laptop
   * battery for no visible gain - the field only changes when the camera does.
   */
  paint(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const { camera } = input;
    const key = `${camera.x}|${camera.y}|${camera.scale}|${this.width}x${this.height}`;
    if (key !== this.cacheKey) {
      this.rasterise(input);
      this.cacheKey = key;
    }
    if (this.cache) ctx.drawImage(this.cache, 0, 0);
  }

  private rasterise(input: RenderInput): void {
    const { width, height } = this;
    if (!this.image || !this.pixels || width === 0 || height === 0) return;

    const pixels = this.pixels;
    pixels.fill(0);

    const { camera, xs, ys, wordCount } = input;
    const halfW = width / 2;
    const halfH = height / 2;

    // Zoomed in there are fewer words per pixel, so each one has to carry more
    // brightness or the field thins out into invisibility. Zoomed out there are
    // many per pixel and a low step lets density do the work.
    const step = Math.min(210, Math.max(55, 55 * (camera.scale / 400) ** 0.75));
    // Little-endian ABGR: alpha is set per pixel, colour is constant.
    const rgb =
      (DUST_COLOUR.b << 16) | (DUST_COLOUR.g << 8) | DUST_COLOUR.r;
    const chunky = camera.scale > 900;

    for (let i = 0; i < wordCount; i++) {
      const px = ((xs[i]! - camera.x) * camera.scale + halfW) | 0;
      if (px < 0 || px >= width) continue;
      const py = (halfH - (ys[i]! - camera.y) * camera.scale) | 0;
      if (py < 0 || py >= height) continue;

      if (chunky) {
        // A single pixel is invisible at high zoom; a 2x2 block reads as a mote.
        for (let dy = 0; dy < 2; dy++) {
          const yy = py + dy;
          if (yy >= height) break;
          for (let dx = 0; dx < 2; dx++) {
            const xx = px + dx;
            if (xx >= width) break;
            this.accumulate(pixels, yy * width + xx, step, rgb);
          }
        }
      } else {
        this.accumulate(pixels, py * width + px, step, rgb);
      }
    }

    this.cache?.getContext("2d")?.putImageData(this.image, 0, 0);
  }

  private accumulate(
    pixels: Uint32Array,
    offset: number,
    step: number,
    rgb: number,
  ): void {
    const alpha = (pixels[offset]! >>> 24) & 0xff;
    const next = alpha + step > 255 ? 255 : alpha + step;
    pixels[offset] = (next << 24) | rgb;
  }
}

export class OrbitRenderer {
  private dust = new DustLayer();
  private stars = new ShootingStars();
  private drifters = new Drifters();
  readonly markers: MarkerSet;

  constructor(baseUrl: string) {
    this.markers = new MarkerSet(baseUrl);
    this.markers.load();
  }

  render(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const { viewport } = input;

    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);

    // Drawn first, so the word field composites over it: a drifting character
    // passes *behind* the words rather than across them. The dust layer is
    // transparent wherever there is no word, so this still shows through.
    if (input.animate) {
      this.drifters.update(
        input.timeMs,
        viewport.width,
        viewport.height,
        this.markers.readyFiles,
      );
      this.drifters.draw(ctx, input.timeMs, (file) =>
        this.markers.byFile(file),
      );
    }

    // The dust layer works in device pixels, so it is written with the
    // transform reset and the context restored afterwards.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.dust.resize(
      Math.round(viewport.width * viewport.dpr),
      Math.round(viewport.height * viewport.dpr),
    );
    this.dust.paint(ctx, {
      ...input,
      camera: { ...input.camera, scale: input.camera.scale * viewport.dpr },
      viewport: {
        width: viewport.width * viewport.dpr,
        height: viewport.height * viewport.dpr,
        dpr: 1,
      },
    });

    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

    // Shooting stars sit above the word field but below anything played.
    if (input.animate) {
      this.stars.update(input.timeMs, viewport.width, viewport.height);
      this.stars.draw(ctx, input.timeMs);
    }

    this.drawGuides(ctx, input);
    const answerTop = this.drawGuesses(ctx, input);
    this.drawCentre(ctx, input, answerTop);
  }

  private drawGuides(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const { camera, viewport, wordCount } = input;
    const centre = boardToScreen(0, 0, camera, viewport);

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.font =
      "500 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";

    for (const rank of GUIDE_RANKS) {
      const radius = radiusForRank(rank, wordCount) * camera.scale;
      // Skip rings that are a dot or far off screen - they add nothing.
      const diagonal = Math.hypot(viewport.width, viewport.height);
      if (radius < 26 || radius > diagonal) continue;

      ctx.strokeStyle = "rgba(150, 180, 225, 0.20)";
      ctx.beginPath();
      ctx.arc(centre.px, centre.py, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(160, 190, 230, 0.45)";
      ctx.fillText(
        `top ${rank.toLocaleString()}`,
        centre.px,
        centre.py - radius - 6,
      );
    }

    ctx.restore();
  }

  /**
   * Draws every played word. Returns the top edge of the answer's marker, so
   * the caller can place the gold label above the artwork instead of across it.
   */
  private drawGuesses(
    ctx: CanvasRenderingContext2D,
    input: RenderInput,
  ): number | null {
    const { camera, viewport, xs, ys, guesses, focus } = input;
    let answerTop: number | null = null;

    // Label budget: the focus, then the best guesses, and only where they do
    // not collide. A hundred overlapping labels is worse than none.
    const labelled = [...guesses].sort((a, b) => a.rank - b.rank).slice(0, 12);
    const labelSet = new Set(labelled.map((guess) => guess.vocabIndex));
    if (focus) labelSet.add(focus.vocabIndex);
    const claimed: Array<{ x: number; y: number }> = [];

    ctx.save();
    ctx.font =
      "600 12px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    for (const guess of guesses) {
      const { px, py } = boardToScreen(
        xs[guess.vocabIndex]!,
        ys[guess.vocabIndex]!,
        camera,
        viewport,
      );
      if (px < -40 || px > viewport.width + 40) continue;
      if (py < -40 || py > viewport.height + 40) continue;

      const band = bandForRank(guess.rank);
      const isFocus = focus?.vocabIndex === guess.vocabIndex;
      const marker = this.markers.forRank(guess.rank);

      // The bob is per-marker, phased off the vocabulary index so the board does
      // not pulse in unison - that reads as a glitch rather than as floating.
      const bob = input.animate ? floatOffset(input.timeMs, guess.vocabIndex) : 0;
      const markerTop = this.drawMarker(ctx, {
        px,
        py: py + bob,
        marker,
        band,
        isFocus,
        scale: this.markers.scaleForRank(guess.rank),
        isAnswer: guess.rank === 0,
      });

      if (guess.rank === 0) {
        // The answer gets exactly one label, drawn by drawCentre in gold. This
        // would be a second, smaller copy of the same word on top of it.
        answerTop = markerTop;
        continue;
      }

      if (!labelSet.has(guess.vocabIndex)) continue;
      const collides = claimed.some(
        (taken) => Math.abs(taken.x - px) < 54 && Math.abs(taken.y - py) < 22,
      );
      if (collides && !isFocus) continue;
      claimed.push({ x: px, y: py });

      // The label sits above the artwork, not above the anchor point, or it
      // lands on top of the character.
      const label = guess.word;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(8, 12, 26, 0.85)";
      ctx.strokeText(label, px, markerTop - 4);
      ctx.fillStyle = isFocus ? "#f4f8ff" : "rgba(226, 235, 250, 0.82)";
      ctx.fillText(label, px, markerTop - 4);
    }

    ctx.restore();
    return answerTop;
  }

  /**
   * One marker. Returns the y of its top edge, so the caller can put a label
   * above the artwork rather than above the anchor point.
   *
   * The character sits *above* the point it marks, like a pin, with a soft
   * shadow on the board beneath it. Centring the artwork on the point would bury
   * the exact position under the widest part of the drawing.
   */
  private drawMarker(
    ctx: CanvasRenderingContext2D,
    options: {
      px: number;
      py: number;
      marker: HTMLImageElement | null;
      band: { tone: string };
      isFocus: boolean;
      scale: number;
      isAnswer: boolean;
    },
  ): number {
    const { px, py, marker, band, isFocus, scale, isAnswer } = options;

    if (!marker) {
      // Image not loaded, or missing. Fall back to the dot rather than showing
      // a gap where a word should be.
      const radius = (isFocus ? 6 : 4) * scale;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = toneColour(band.tone, 1);
      ctx.fill();
      return py - radius;
    }

    const height = (isFocus ? MARKER_FOCUS_HEIGHT : MARKER_HEIGHT) * scale;
    const width = (marker.naturalWidth / marker.naturalHeight) * height;
    const top = py - height;

    // Contact shadow, so the character reads as hovering over the board rather
    // than pasted onto it.
    ctx.save();
    ctx.globalAlpha = isFocus ? 0.42 : 0.3;
    ctx.fillStyle = "#05070f";
    ctx.beginPath();
    ctx.ellipse(px, py, width * 0.3, height * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (isAnswer) {
      // Gold halo around the silhouette. A canvas shadow blurs the image's own
      // alpha, so this hugs the character rather than boxing it.
      //
      // The blur radius is the reach itself, not double it: the repeat passes
      // lift the faint tail of the blur above visibility, so a radius of 2x
      // measured about 10px of halo rather than the 5 intended.
      ctx.save();
      ctx.shadowColor = ANSWER_GLOW_COLOUR;
      ctx.shadowBlur = ANSWER_GLOW_SPREAD;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      for (let pass = 0; pass < ANSWER_GLOW_PASSES; pass++) {
        ctx.drawImage(marker, px - width / 2, top, width, height);
      }
      ctx.restore();
    }

    ctx.save();
    if (isFocus && !isAnswer) {
      // The answer has its own halo; two glows on one marker muddies both.
      ctx.shadowColor = toneColour(band.tone, 0.85);
      ctx.shadowBlur = 12;
    }
    // Always solid. A played word is a fact about the board, and half-drawn
    // artwork reads as a rendering fault rather than as a distinction. Partial
    // opacity belongs to the drifting background character and nothing else.
    ctx.drawImage(marker, px - width / 2, top, width, height);
    ctx.restore();

    return top;
  }

  private drawCentre(
    ctx: CanvasRenderingContext2D,
    input: RenderInput,
    answerTop: number | null,
  ): void {
    const { camera, viewport, solved, secretWord } = input;
    const { px, py } = boardToScreen(0, 0, camera, viewport);

    ctx.save();
    ctx.strokeStyle = solved
      ? "rgba(255, 214, 132, 0.95)"
      : "rgba(190, 210, 240, 0.45)";
    ctx.lineWidth = 1.5;

    const arm = 9;
    ctx.beginPath();
    ctx.moveTo(px - arm, py);
    ctx.lineTo(px + arm, py);
    ctx.moveTo(px, py - arm);
    ctx.lineTo(px, py + arm);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    if (solved) {
      // The only label on the answer: drawGuesses skips rank 0 so this does not
      // end up as a second, smaller copy of the same word underneath.
      //
      // Sits above the artwork when the marker has drawn, and falls back to the
      // anchor point when it has not loaded yet.
      const labelY = answerTop !== null ? answerTop - 8 : py - 20;

      ctx.font =
        "700 24px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(8, 12, 26, 0.9)";
      ctx.strokeText(secretWord, px, labelY);
      ctx.fillStyle = "#ffd684";
      ctx.fillText(secretWord, px, labelY);
    }

    ctx.restore();
  }
}

/**
 * Canvas cannot resolve CSS custom properties, so band colours are mirrored
 * here. Keep in step with the --tone-* values in styles.css.
 */
const TONES: Record<string, [number, number, number]> = {
  solved: [255, 214, 132],
  blazing: [255, 138, 96],
  scorching: [255, 163, 92],
  burning: [255, 190, 96],
  hot: [246, 214, 110],
  warm: [190, 220, 140],
  mild: [136, 208, 178],
  cool: [116, 186, 214],
  cold: [110, 152, 205],
  distant: [116, 130, 168],
};

function toneColour(tone: string, alpha: number): string {
  const rgb = TONES[tone] ?? TONES.distant!;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Camera that frames the whole board in the given viewport. */
export function fitCamera(viewport: Viewport): Camera {
  const shorter = Math.min(viewport.width, viewport.height);
  return { x: 0, y: 0, scale: (shorter * 0.46) / MAX_RADIUS };
}

/**
 * Camera that puts a word comfortably on screen, with the centre still visible
 * so the player can always see which way "warmer" is.
 */
export function frameOn(
  radius: number,
  viewport: Viewport,
  fallback: Camera,
): Camera {
  if (!Number.isFinite(radius) || radius <= 0) return fallback;
  const shorter = Math.min(viewport.width, viewport.height);
  // 2.4x leaves the ring of context around the guess that makes the plot useful.
  const scale = shorter / (radius * 2.4);
  return { x: 0, y: 0, scale: Math.min(Math.max(scale, 30), 60_000) };
}
