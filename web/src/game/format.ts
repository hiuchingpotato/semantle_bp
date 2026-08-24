import type { Layout, Manifest, Puzzle } from "./types";

/**
 * Reader for the puzzle binaries produced by tools/build_data.py.
 *
 * Layout (little-endian):
 *   0   4  magic "BPP1"
 *   4   2  uint16 format version
 *   6   2  uint16 record size
 *   8   4  uint32 word count
 *   12  4  uint32 vocab index of the secret
 *   16  .. records, sorted by descending similarity:
 *             uint32 vocab index
 *             float16 cosine similarity
 *
 * A record's position *is* its rank, so there is nothing to sort at runtime.
 * Angles live in a separate shared layout.bin because a word's angle depends on
 * the embedding, not on today's answer, and radius is derived from rank - see
 * geometry.ts. That keeps a puzzle at 6 bytes per word instead of 14.
 */

export const MAGIC = "BPP1";
export const SUPPORTED_FORMAT_VERSION = 1;

const HEADER_SIZE = 16;
const RECORD_SIZE = 6;

/** float16 values per word in layout.bin: angle, radial multiplier. */
const LAYOUT_STRIDE = 2;

export class PuzzleFormatError extends Error {}

/**
 * Decode float16. DataView has no getFloat16 in older Safari, so this converts
 * by hand rather than depending on a polyfill for six bytes of work.
 */
export function readFloat16(view: DataView, offset: number): number {
  const bits = view.getUint16(offset, true);
  const sign = bits >> 15 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;

  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

export function parsePuzzle(
  buffer: ArrayBuffer,
  puzzleNumber: number,
  manifest: Manifest,
): Puzzle {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new PuzzleFormatError("puzzle file is truncated");
  }

  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== MAGIC) {
    throw new PuzzleFormatError(`not a puzzle file (magic "${magic}")`);
  }

  const version = view.getUint16(4, true);
  if (version !== SUPPORTED_FORMAT_VERSION) {
    // Refuse rather than misread: a changed layout would silently produce
    // plausible-looking but wrong ranks.
    throw new PuzzleFormatError(
      `puzzle format v${version} is newer than this client (v${SUPPORTED_FORMAT_VERSION})`,
    );
  }

  const recordSize = view.getUint16(6, true);
  if (recordSize !== RECORD_SIZE) {
    throw new PuzzleFormatError(`unexpected record size ${recordSize}`);
  }

  const wordCount = view.getUint32(8, true);
  const secretIndex = view.getUint32(12, true);

  const expected = HEADER_SIZE + wordCount * RECORD_SIZE;
  if (buffer.byteLength !== expected) {
    throw new PuzzleFormatError(
      `expected ${expected} bytes for ${wordCount} words, got ${buffer.byteLength}`,
    );
  }
  if (wordCount !== manifest.wordCount) {
    throw new PuzzleFormatError(
      `puzzle has ${wordCount} words, manifest says ${manifest.wordCount}`,
    );
  }

  const indexByRank = new Uint32Array(wordCount);
  const similarityByRank = new Float32Array(wordCount);
  const rankByVocabIndex = new Int32Array(wordCount).fill(-1);

  for (let rank = 0; rank < wordCount; rank++) {
    const offset = HEADER_SIZE + rank * RECORD_SIZE;
    const vocabIndex = view.getUint32(offset, true);
    if (vocabIndex >= wordCount) {
      throw new PuzzleFormatError(
        `vocab index ${vocabIndex} out of range at rank ${rank}`,
      );
    }
    indexByRank[rank] = vocabIndex;
    similarityByRank[rank] = readFloat16(view, offset + 4);
    rankByVocabIndex[vocabIndex] = rank;
  }

  return {
    number: puzzleNumber,
    secretIndex,
    wordCount,
    indexByRank,
    similarityByRank,
    rankByVocabIndex,
  };
}

/**
 * Which words may be offered as a hint: one bit per vocab index, packed
 * little-endian. A few kilobytes for the whole vocabulary.
 */
export function parseHintable(
  buffer: ArrayBuffer,
  wordCount: number,
): Uint8Array {
  const expected = Math.ceil(wordCount / 8);
  if (buffer.byteLength !== expected) {
    throw new PuzzleFormatError(
      `hint pool should be ${expected} bytes, got ${buffer.byteLength}`,
    );
  }
  return new Uint8Array(buffer);
}

/** True when the word at this vocab index may be offered as a hint. */
export function isHintable(pool: Uint8Array, vocabIndex: number): boolean {
  const byte = pool[vocabIndex >> 3];
  return byte !== undefined && (byte & (1 << (vocabIndex & 7))) !== 0;
}

/**
 * Shared per-word layout: float16 pairs of [angle, radial multiplier], one pair
 * per vocab index. Same for every puzzle, so it is fetched once.
 */
export function parseLayout(buffer: ArrayBuffer, wordCount: number): Layout {
  const expected = wordCount * LAYOUT_STRIDE * 2;
  if (buffer.byteLength !== expected) {
    throw new PuzzleFormatError(
      `layout should be ${expected} bytes, got ${buffer.byteLength}`,
    );
  }

  const view = new DataView(buffer);
  const angles = new Float32Array(wordCount);
  const jitter = new Float32Array(wordCount);
  for (let i = 0; i < wordCount; i++) {
    angles[i] = readFloat16(view, i * 4);
    jitter[i] = readFloat16(view, i * 4 + 2);
  }
  return { angles, jitter };
}
