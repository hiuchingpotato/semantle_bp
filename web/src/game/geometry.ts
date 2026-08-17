import type { Layout } from "./types";

/**
 * Where a word sits on the board.
 *
 * The secret is the origin. Radius comes from rank, angle from the shared
 * layout, plus a twist that grows with radius so that a "topic" - words sharing
 * an angle - sweeps out as an arm rather than a straight spoke.
 *
 * Radius is a function of rank rather than similarity on purpose. Similarity is
 * bunched: most of a 60k vocabulary sits between 0 and 0.2, so plotting it
 * directly leaves a dense ring and an empty middle. Rank spreads evenly, and it
 * is still monotone in similarity, so "closer to the centre" stays true.
 */

/** Radius of the outermost word. Board units, not pixels. */
export const MAX_RADIUS = 1;

/**
 * Below 1 this pushes the near ranks outward, so the top few hundred words -
 * the part of the board a player actually works in - get real estate instead of
 * collapsing onto the centre.
 */
const RADIAL_EXPONENT = 0.55;

/** Turns of twist between the centre and the rim. */
const SPIRAL_TURNS = 0.4;

export function radiusForRank(rank: number, wordCount: number): number {
  if (rank <= 0) return 0;
  return MAX_RADIUS * Math.pow(rank / wordCount, RADIAL_EXPONENT);
}

export function angleForRadius(baseAngle: number, radius: number): number {
  return baseAngle + SPIRAL_TURNS * 2 * Math.PI * radius;
}

/**
 * Project every word to board coordinates, once per puzzle.
 *
 * Returns interleaved-free parallel arrays because the renderer walks them in a
 * tight loop; an array of objects allocates 60k times for no benefit.
 */
export function projectAll(
  indexByRank: Uint32Array,
  layout: Layout,
  wordCount: number,
): { xs: Float32Array; ys: Float32Array } {
  const xs = new Float32Array(wordCount);
  const ys = new Float32Array(wordCount);

  for (let rank = 0; rank < wordCount; rank++) {
    const vocabIndex = indexByRank[rank]!;
    // Jitter is cosmetic: it breaks up the rank spiral so the field reads as a
    // scatter of words rather than a lattice. It is small enough not to change
    // which side of a guide ring a word appears on.
    const radius =
      radiusForRank(rank, wordCount) * (layout.jitter[vocabIndex] ?? 1);
    const angle = angleForRadius(layout.angles[vocabIndex]!, radius);
    // Indexed by vocab index, so the renderer can look up a word directly.
    xs[vocabIndex] = Math.cos(angle) * radius;
    ys[vocabIndex] = Math.sin(angle) * radius;
  }

  return { xs, ys };
}
