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

/**
 * Singular -> plural. The client reads it both ways.
 *
 * Shipped as pairs rather than a redirect to one canonical form, because unlike
 * a spelling variant both forms are real words with their own ranks, and which
 * one is closer depends on the answer.
 */
export async function fetchInflections(
  version: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const response = await fetch(versioned("forms.json", version), {
      cache: "force-cache",
    });
    if (!response.ok) return map;
    const pairs = (await response.json()) as Record<string, string>;
    for (const [singular, plural] of Object.entries(pairs)) {
      map.set(singular, plural);
      map.set(plural, singular);
    }
  } catch {
    // Playable without it; guesses just are not forgiven their plurals.
  }
  return map;
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

/**
 * Swap a guess for its singular or plural if that form scores better.
 *
 * A player has no way to know whether today's answer is "dragon" or "dragons",
 * and the two are not near each other: across real puzzles they sit thousands
 * of ranks apart, and baby/babies over fifty thousand. Making someone guess
 * which form was chosen is a coin toss, not a clue.
 *
 * So both count, and the closer one is what gets played - which also means that
 * typing the singular when the answer is the plural simply wins.
 *
 * The word actually shown is the form that scored, not the one typed. Here the
 * two are genuinely different words, so displaying "dragon" against the rank of
 * "dragons" would be a lie about which word that rank belongs to.
 */
export function preferBetterForm(
  vocabIndex: number,
  vocabulary: string[],
  wordIndex: Map<string, number>,
  inflections: Map<string, string>,
  rankByVocabIndex: Int32Array,
): number {
  const word = vocabulary[vocabIndex];
  if (word === undefined) return vocabIndex;

  const other = inflections.get(word);
  if (other === undefined) return vocabIndex;

  const otherIndex = wordIndex.get(other);
  if (otherIndex === undefined) return vocabIndex;

  const here = rankByVocabIndex[vocabIndex] ?? -1;
  const there = rankByVocabIndex[otherIndex] ?? -1;
  if (here < 0) return otherIndex;
  if (there < 0) return vocabIndex;

  // Lower rank is closer to the answer.
  return there < here ? otherIndex : vocabIndex;
}
