import { describe, expect, it } from "vitest";

import { PuzzleFormatError, parseLayout, parsePuzzle, readFloat16 } from "./format";
import type { Manifest } from "./types";

const manifest: Manifest = {
  formatVersion: 1,
  recordSize: 6,
  headerSize: 16,
  wordCount: 4,
  puzzleCount: 1,
  epoch: "2026-06-01",
  vocabHash: "test",
  source: { vectors: "test", licence: "test", url: "test" },
};

/** Mirror of the writer in tools/build_data.py, for building fixtures. */
function writeFloat16(view: DataView, offset: number, value: number): void {
  const float = new Float32Array(1);
  const bits = new Uint32Array(float.buffer);
  float[0] = value;
  const raw = bits[0]!;

  const sign = (raw >>> 16) & 0x8000;
  let exponent = ((raw >>> 23) & 0xff) - 127 + 15;
  let fraction = (raw >>> 13) & 0x3ff;

  if (exponent <= 0) {
    exponent = 0;
    fraction = 0;
  } else if (exponent >= 0x1f) {
    exponent = 0x1f;
    fraction = 0;
  }
  view.setUint16(offset, sign | (exponent << 10) | fraction, true);
}

function buildPuzzle(
  records: Array<[index: number, similarity: number]>,
  overrides: Partial<{
    magic: string;
    version: number;
    recordSize: number;
    wordCount: number;
    secretIndex: number;
    trailingBytes: number;
  }> = {},
): ArrayBuffer {
  const {
    magic = "BPP1",
    version = 1,
    recordSize = 6,
    wordCount = records.length,
    secretIndex = records[0]?.[0] ?? 0,
    trailingBytes = 0,
  } = overrides;

  const buffer = new ArrayBuffer(16 + records.length * 6 + trailingBytes);
  const view = new DataView(buffer);
  for (let i = 0; i < 4; i++) view.setUint8(i, magic.charCodeAt(i));
  view.setUint16(4, version, true);
  view.setUint16(6, recordSize, true);
  view.setUint32(8, wordCount, true);
  view.setUint32(12, secretIndex, true);

  records.forEach(([index, similarity], position) => {
    const offset = 16 + position * 6;
    view.setUint32(offset, index, true);
    writeFloat16(view, offset + 4, similarity);
  });

  return buffer;
}

describe("readFloat16", () => {
  it("round-trips values the pipeline actually writes", () => {
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    for (const value of [1, 0.5, 0.25, -0.25, 0.7739, -0.2224]) {
      writeFloat16(view, 0, value);
      // float16 carries ~3 significant decimal digits.
      expect(readFloat16(view, 0)).toBeCloseTo(value, 3);
    }
  });

  it("reads zero and negative zero as zero", () => {
    const view = new DataView(new ArrayBuffer(2));
    view.setUint16(0, 0x0000, true);
    expect(readFloat16(view, 0)).toBe(0);
    view.setUint16(0, 0x8000, true);
    expect(readFloat16(view, 0)).toBe(-0);
  });
});

describe("parsePuzzle", () => {
  const records: Array<[number, number]> = [
    [2, 1],
    [0, 0.5],
    [3, 0.25],
    [1, -0.125],
  ];

  it("treats record position as rank and indexes both ways", () => {
    const puzzle = parsePuzzle(buildPuzzle(records), 7, manifest);

    expect(puzzle.number).toBe(7);
    expect(puzzle.secretIndex).toBe(2);
    expect([...puzzle.indexByRank]).toEqual([2, 0, 3, 1]);
    expect(puzzle.rankByVocabIndex[2]).toBe(0);
    expect(puzzle.rankByVocabIndex[1]).toBe(3);
    expect(puzzle.similarityByRank[1]).toBeCloseTo(0.5, 3);
  });

  it("rejects a file that is not a puzzle", () => {
    expect(() => parsePuzzle(buildPuzzle(records, { magic: "XXXX" }), 0, manifest))
      .toThrow(PuzzleFormatError);
  });

  it("refuses a newer format rather than misreading it", () => {
    expect(() => parsePuzzle(buildPuzzle(records, { version: 2 }), 0, manifest))
      .toThrow(/newer than this client/);
  });

  it("rejects a record size it does not understand", () => {
    expect(() => parsePuzzle(buildPuzzle(records, { recordSize: 14 }), 0, manifest))
      .toThrow(/record size/);
  });

  it("rejects a truncated or padded file", () => {
    expect(() => parsePuzzle(buildPuzzle(records, { trailingBytes: 6 }), 0, manifest))
      .toThrow(/expected 40 bytes/);
  });

  it("rejects a puzzle that disagrees with the manifest", () => {
    const shortManifest = { ...manifest, wordCount: 9 };
    expect(() => parsePuzzle(buildPuzzle(records), 0, shortManifest))
      .toThrow(/manifest says 9/);
  });

  it("rejects an out-of-range vocab index", () => {
    const bad: Array<[number, number]> = [
      [2, 1],
      [99, 0.5],
      [3, 0.25],
      [1, 0],
    ];
    expect(() => parsePuzzle(buildPuzzle(bad), 0, manifest)).toThrow(/out of range/);
  });

  it("rejects a header-only file", () => {
    expect(() => parsePuzzle(new ArrayBuffer(4), 0, manifest)).toThrow(/truncated/);
  });
});

describe("parseLayout", () => {
  it("reads an angle and a radial multiplier per word", () => {
    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    const pairs: Array<[number, number]> = [
      [-3.14, 0.94],
      [0, 1],
      [3.14, 1.06],
    ];
    pairs.forEach(([angle, jitter], i) => {
      writeFloat16(view, i * 4, angle);
      writeFloat16(view, i * 4 + 2, jitter);
    });

    const layout = parseLayout(buffer, 3);
    expect(layout.angles).toHaveLength(3);
    expect(layout.jitter).toHaveLength(3);
    expect(layout.angles[0]).toBeCloseTo(-3.14, 2);
    expect(layout.angles[2]).toBeCloseTo(3.14, 2);
    expect(layout.jitter[0]).toBeCloseTo(0.94, 2);
    expect(layout.jitter[2]).toBeCloseTo(1.06, 2);
  });

  it("rejects a layout of the wrong length", () => {
    expect(() => parseLayout(new ArrayBuffer(12), 4)).toThrow(/should be 16 bytes/);
  });
});
