import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isHintable, parseHintable } from "./format";
import { chooseHintWord } from "./hints";
import type { Manifest, Puzzle } from "./types";

const DATA = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "data",
);

const manifest = JSON.parse(
  readFileSync(join(DATA, "manifest.json"), "utf8"),
) as Manifest;
const vocabulary = JSON.parse(
  readFileSync(join(DATA, "vocab.json"), "utf8"),
) as string[];

function readBuffer(...parts: string[]): ArrayBuffer {
  const file = readFileSync(join(DATA, ...parts));
  return file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
}

const pool = parseHintable(readBuffer("hintable.bin"), manifest.wordCount);
const index = new Map(vocabulary.map((word, i) => [word, i]));
const hintable = (word: string) => {
  const i = index.get(word);
  return i === undefined ? false : isHintable(pool, i);
};

describe("the hint pool", () => {
  it("refuses proper nouns", () => {
    // chippewa was offered as a hint for "kettle", which is what prompted all
    // of this: a Native American people, surfaced because US place names
    // cluster around glacial kettle lakes.
    const propernouns = [
      "chippewa", "custer", "monongahela", "kraft", "mesozoic",
    ];
    const offered = propernouns.filter(hintable);
    expect(offered, `still hintable: ${offered.join(", ")}`).toEqual([]);
  });

  it("keeps ordinary British vocabulary", () => {
    const everyday = [
      "kettle", "teapot", "cauldron", "boiling", "whistling", "pond",
      "biscuit", "crumpet", "umbrella", "badger", "otter", "copper",
    ];
    const refused = everyday.filter((word) => !hintable(word));
    expect(refused, `not hintable: ${refused.join(", ")}`).toEqual([]);
  });

  it("is a strict subset of the guessable vocabulary", () => {
    // Everything hintable must be guessable, or a hint could reveal a word the
    // player is then told does not exist.
    let count = 0;
    for (let i = 0; i < manifest.wordCount; i++) if (isHintable(pool, i)) count++;
    expect(count).toBe(manifest.hintableCount);
    expect(count).toBeLessThan(manifest.wordCount);
    expect(count).toBeGreaterThan(20_000);
  });

  it("rejects a pool sized for a different vocabulary", () => {
    expect(() => parseHintable(new ArrayBuffer(8), manifest.wordCount)).toThrow(
      /hint pool should be/,
    );
  });
});

describe("chooseHintWord", () => {
  const puzzle = {
    wordCount: 6,
    indexByRank: new Uint32Array([0, 1, 2, 3, 4, 5]),
  } as unknown as Puzzle;
  // Only vocab indices 1 and 5 are acceptable.
  const tiny = new Uint8Array([0b00100010]);

  it("takes the target rank when it is acceptable", () => {
    expect(chooseHintWord(puzzle, 1, tiny)).toBe(1);
  });

  it("walks outward to the nearest acceptable word", () => {
    expect(chooseHintWord(puzzle, 2, tiny)).toBe(1);
    expect(chooseHintWord(puzzle, 4, tiny)).toBe(5);
  });

  it("prefers the closer side of the target", () => {
    // Rank 2 is one step from an acceptable rank 1 and three from rank 5.
    expect(chooseHintWord(puzzle, 2, tiny)).toBe(1);
  });

  it("never reveals the answer at rank zero", () => {
    const all = new Uint8Array([0b11111111]);
    expect(chooseHintWord(puzzle, 0, all)).not.toBe(0);
  });

  it("falls back to plain rank when there is no pool", () => {
    expect(chooseHintWord(puzzle, 3, null)).toBe(3);
  });

  it("falls back rather than refusing when nothing is acceptable", () => {
    expect(chooseHintWord(puzzle, 3, new Uint8Array([0]))).toBe(3);
  });
});
