import { parseHintable, parseLayout, parsePuzzle } from "./format";
import type { Layout, Manifest, Puzzle } from "./types";

// Relative to the deployed base, not the domain root: on GitHub Pages the site
// lives at /<repo>/, so a hard-coded "/data" would 404. BASE_URL always ends in
// a slash, and is "/" during local development.
const DATA_ROOT = `${import.meta.env.BASE_URL}data`;

/**
 * The vocabulary and the layout are the same for every puzzle, so they are
 * fetched once and cached hard; only the puzzle table changes day to day.
 *
 * Every cached URL carries the manifest's dataVersion. Without it a rebuild
 * that changes the vocabulary size leaves a browser holding a stale layout.bin
 * while the manifest - which is never cached - says the new size, and the
 * parser refuses the mismatch. Only the manifest needs to be fresh; it names
 * the version of everything else.
 */

function versioned(path: string, version: string): string {
  return `${DATA_ROOT}/${path}?v=${encodeURIComponent(version)}`;
}

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

export async function fetchVocabulary(version: string): Promise<string[]> {
  const response = await fetch(versioned("vocab.json", version), {
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(`vocabulary returned ${response.status}`);
  }
  return (await response.json()) as string[];
}

export async function fetchLayout(
  wordCount: number,
  version: string,
): Promise<Layout> {
  return parseLayout(
    await fetchBuffer(versioned("layout.bin", version)),
    wordCount,
  );
}

export async function fetchHintable(
  wordCount: number,
  version: string,
): Promise<Uint8Array | null> {
  try {
    return parseHintable(
      await fetchBuffer(versioned("hintable.bin", version)),
      wordCount,
    );
  } catch {
    // Hints fall back to picking purely by rank, which is how the game worked
    // before the pool existed. Worse hints beat no game.
    return null;
  }
}

export async function fetchPuzzle(
  puzzleNumber: number,
  manifest: Manifest,
): Promise<Puzzle> {
  const buffer = await fetchBuffer(
    versioned(
      `puzzles/p${puzzleNumber}.bin`,
      // Same fallback as useGame: an older build without a dataVersion still
      // busts its cache whenever the vocabulary size changes.
      manifest.dataVersion ?? String(manifest.wordCount),
    ),
  );
  return parsePuzzle(buffer, puzzleNumber, manifest);
}

/**
 * British spelling -> the American entry that carries the score.
 *
 * Built from the vocabulary and validated against the embedding; see
 * build_aliases in tools/build_data.py.
 */
export async function fetchAliases(
  version: string,
): Promise<Record<string, string>> {
  const response = await fetch(versioned("aliases.json", version), {
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
