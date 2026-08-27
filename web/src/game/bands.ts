/**
 * Turning a rank into feedback.
 *
 * Rank, not similarity: a raw cosine of 0.31 means nothing to a player, whereas
 * "you are the 40th closest word out of 60,000" does. The bands are ours - the
 * scale, the names and the thresholds - and are tuned so early guesses move you
 * between bands often enough to feel like progress.
 *
 * Every band carries a name and a filled-pip count as well as a colour. Colour
 * is never the only carrier of meaning (WCAG 1.4.1), and the pips read fine in
 * a screen reader.
 */

export type Band = {
  id: string;
  /** Shown on the guess row. */
  label: string;
  /** Filled pips out of PIP_COUNT. */
  pips: number;
  /** CSS custom property suffix, see styles.css. */
  tone: string;
};

export const PIP_COUNT = 6;

const BANDS: ReadonlyArray<{ maxRank: number; band: Band }> = [
  { maxRank: 0, band: { id: "solved", label: "Solved", pips: 6, tone: "solved" } },
  { maxRank: 9, band: { id: "blazing", label: "Blazing", pips: 6, tone: "blazing" } },
  { maxRank: 49, band: { id: "scorching", label: "Scorching", pips: 5, tone: "scorching" } },
  { maxRank: 99, band: { id: "burning", label: "Burning", pips: 5, tone: "burning" } },
  { maxRank: 299, band: { id: "hot", label: "Hot", pips: 4, tone: "hot" } },
  { maxRank: 999, band: { id: "warm", label: "Warm", pips: 3, tone: "warm" } },
  { maxRank: 2999, band: { id: "mild", label: "Mild", pips: 2, tone: "mild" } },
  { maxRank: 9999, band: { id: "cool", label: "Cool", pips: 2, tone: "cool" } },
  { maxRank: 24999, band: { id: "cold", label: "Cold", pips: 1, tone: "cold" } },
  { maxRank: Infinity, band: { id: "distant", label: "Distant", pips: 0, tone: "distant" } },
];

export function bandForRank(rank: number): Band {
  for (const entry of BANDS) {
    if (rank <= entry.maxRank) return entry.band;
  }
  // Unreachable - the table ends at Infinity - but the types don't know that.
  return BANDS[BANDS.length - 1]!.band;
}

/**
 * Ranks are only shown inside the top 1000. Further out the number is both
 * discouraging and useless: 43,001st and 44,000th are the same guess quality.
 */
export const RANK_VISIBLE_WITHIN = 1000;

export function formatRank(rank: number): string | null {
  // The answer shows a plain "1" for first place. No hash, because the word at
  // internal rank 1 - the closest word that is not the answer - already shows
  // "#1", and two rows reading the same would be worse than the inconsistency.
  if (rank === 0) return "1";
  return rank < RANK_VISIBLE_WITHIN ? `#${rank}` : null;
}

export function formatSimilarity(similarity: number): string {
  return (similarity * 100).toFixed(2);
}

/** Sentence for the screen-reader live region after a guess. */
export function describeGuess(
  word: string,
  rank: number,
  similarity: number,
): string {
  if (rank === 0) return `${word} is the secret word. Solved.`;
  const band = bandForRank(rank);
  const position =
    rank < RANK_VISIBLE_WITHIN
      ? `rank ${rank}`
      : `outside the closest ${RANK_VISIBLE_WITHIN}`;
  return `${word}: ${band.label}, ${position}, similarity ${formatSimilarity(similarity)}.`;
}
