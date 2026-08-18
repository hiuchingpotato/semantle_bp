import { parseLayout, parsePuzzle } from "./format";
import type { Layout, Manifest, Puzzle } from "./types";

// Relative to the deployed base, not the domain root: on GitHub Pages the site
// lives at /<repo>/, so a hard-coded "/data" would 404. BASE_URL always ends in
// a slash, and is "/" during local development.
const DATA_ROOT = `${import.meta.env.BASE_URL}data`;

/**
 * The vocabulary and the layout are the same for every puzzle, so they are
 * fetched with a long-lived cache and reused; only the puzzle table changes
 * day to day.
 */

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.arrayBuffer();
}

export async function fetchManifest(): Promise<Manifest> {
  const response = await fetch(`${DATA_ROOT}/manifest.json`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`manifest returned ${response.status}`);
  }
  return (await response.json()) as Manifest;
}

export async function fetchVocabulary(): Promise<string[]> {
  const response = await fetch(`${DATA_ROOT}/vocab.json`, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`vocabulary returned ${response.status}`);
  }
  return (await response.json()) as string[];
}

export async function fetchLayout(wordCount: number): Promise<Layout> {
  return parseLayout(await fetchBuffer(`${DATA_ROOT}/layout.bin`), wordCount);
}

export async function fetchPuzzle(
  puzzleNumber: number,
  manifest: Manifest,
): Promise<Puzzle> {
  const buffer = await fetchBuffer(`${DATA_ROOT}/puzzles/p${puzzleNumber}.bin`);
  return parsePuzzle(buffer, puzzleNumber, manifest);
}

/**
 * British spelling -> the American entry that carries the score.
 *
 * Built from the vocabulary and validated against the embedding; see
 * build_aliases in tools/build_data.py.
 */
export async function fetchAliases(): Promise<Record<string, string>> {
  const response = await fetch(`${DATA_ROOT}/aliases.json`, {
    cache: "force-cache",
  });
  if (!response.ok) {
    // Aliases are a fairness improvement, not a requirement - an older data
    // build without the file should still be playable.
    return {};
  }
  return (await response.json()) as Record<string, string>;
}

/** Word -> vocab index, for turning what someone typed into a lookup. */
export function buildWordIndex(vocabulary: string[]): Map<string, number> {
  const index = new Map<string, number>();
  vocabulary.forEach((word, position) => index.set(word, position));
  return index;
}

/**
 * What counts as a guess. Trim, lowercase, and strip the punctuation people
 * pick up from autocorrect and copy-paste; the vocabulary is plain lowercase
 * letters, so anything else could never match.
 */
export function normaliseGuess(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z]/g, "");
}

export type ResolvedGuess = {
  /** The entry that carries the score. */
  vocabIndex: number;
  /** What the player typed, after tidying. Shown back to them. */
  typed: string;
  /** True when a British spelling was scored as its American entry. */
  aliased: boolean;
};

/**
 * Turn what someone typed into the vocabulary entry that scores it.
 *
 * "colour" and "color" resolve to the same entry, so both get the same rank
 * rather than the British speller being quietly penalised by a corpus that
 * prefers American forms. The typed spelling is carried through and displayed -
 * correcting someone's spelling back at them is exactly the annoyance this is
 * meant to remove.
 */
export function resolveGuess(
  raw: string,
  wordIndex: Map<string, number>,
  aliases: Record<string, string>,
): ResolvedGuess | null {
  const typed = normaliseGuess(raw);
  if (!typed) return null;

  const canonical = aliases[typed];
  if (canonical !== undefined) {
    const index = wordIndex.get(canonical);
    if (index !== undefined) return { vocabIndex: index, typed, aliased: true };
  }

  const index = wordIndex.get(typed);
  if (index === undefined) return null;
  return { vocabIndex: index, typed, aliased: false };
}
