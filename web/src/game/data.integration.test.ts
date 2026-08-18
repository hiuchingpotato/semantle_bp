import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { bandForRank } from "./bands";
import { parseLayout, parsePuzzle } from "./format";
import { projectAll, radiusForRank } from "./geometry";
import { hintAvailability } from "./hints";
import { MARKER_BANDS } from "../plot/markers";
import type { Guess, Manifest } from "./types";

/**
 * Runs the real client code over the real built data.
 *
 * The unit tests use fixtures, which proves the parser is self-consistent but
 * not that it agrees with what tools/build_data.py actually writes. This closes
 * that gap: if the pipeline and the reader ever drift apart, this fails.
 */

const DATA = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "data",
);

function readBuffer(...parts: string[]): ArrayBuffer {
  const file = readFileSync(join(DATA, ...parts));
  return file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
}

const manifest = JSON.parse(
  readFileSync(join(DATA, "manifest.json"), "utf8"),
) as Manifest;
const vocabulary = JSON.parse(
  readFileSync(join(DATA, "vocab.json"), "utf8"),
) as string[];

describe("built data", () => {
  it("has a manifest that matches the vocabulary", () => {
    expect(manifest.formatVersion).toBe(1);
    expect(vocabulary).toHaveLength(manifest.wordCount);
    expect(manifest.puzzleCount).toBeGreaterThan(0);
  });

  it("ships a layout entry for every word", () => {
    const layout = parseLayout(readBuffer("layout.bin"), manifest.wordCount);
    expect(layout.angles).toHaveLength(manifest.wordCount);
    expect(layout.jitter).toHaveLength(manifest.wordCount);

    for (const angle of layout.angles) {
      expect(Number.isFinite(angle)).toBe(true);
      expect(Math.abs(angle)).toBeLessThanOrEqual(Math.PI + 0.01);
    }
    for (const jitter of layout.jitter) {
      // Cosmetic scatter only - a multiplier this size cannot move a word
      // across a guide ring and mislead the player about its band.
      expect(jitter).toBeGreaterThan(0.9);
      expect(jitter).toBeLessThan(1.1);
    }
  });

  it("has no blocked words in the vocabulary", () => {
    // A spot-check that the content filter ran; the full list lives in
    // tools/wordfilters.py and is enforced at build time.
    for (const banned of ["fuck", "nigger", "cunt", "rape", "porn"]) {
      expect(vocabulary).not.toContain(banned);
    }
  });

  it("ships every marker image the renderer asks for", () => {
    // A missing file degrades silently to the old dot at runtime, which is the
    // right behaviour in a browser but would hide a broken build. Fail here.
    for (const band of MARKER_BANDS) {
      const file = join(DATA, "..", "markers", band.file);
      expect(existsSync(file), `missing marker: ${band.file}`).toBe(true);
    }
  });

  it("ships spelling aliases that all resolve", () => {
    const aliases = JSON.parse(
      readFileSync(join(DATA, "aliases.json"), "utf8"),
    ) as Record<string, string>;
    const entries = Object.entries(aliases);
    expect(entries.length).toBeGreaterThan(100);

    const known = new Set(vocabulary);
    for (const [british, american] of entries) {
      expect(known.has(british), `alias source missing: ${british}`).toBe(true);
      expect(known.has(american), `alias target missing: ${american}`).toBe(true);
      // A chain would mean a lookup has to be followed more than once.
      expect(aliases[american], `${american} is itself aliased`).toBeUndefined();
      expect(british).not.toBe(american);
    }
  });

  it("aliases the spellings a British player will actually type", () => {
    const aliases = JSON.parse(
      readFileSync(join(DATA, "aliases.json"), "utf8"),
    ) as Record<string, string>;
    const expected: Record<string, string> = {
      colour: "color",
      flavour: "flavor",
      centre: "center",
      theatre: "theater",
      realise: "realize",
      defence: "defense",
      grey: "gray",
      harbour: "harbor",
      neighbour: "neighbor",
      organisation: "organization",
      travelling: "traveling",
      analyse: "analyze",
      apologise: "apologize",
      aluminium: "aluminum",
    };
    for (const [british, american] of Object.entries(expected)) {
      expect(aliases[british], `${british} should alias`).toBe(american);
    }
  });

  it("keeps the vocabulary to plain lowercase words", () => {
    for (const word of vocabulary) {
      expect(word).toMatch(/^[a-z]{3,}$/);
    }
  });
});

describe("a real puzzle", () => {
  const puzzle = parsePuzzle(readBuffer("puzzles", "p0.bin"), 0, manifest);

  it("puts the secret at rank zero with perfect similarity", () => {
    expect(puzzle.indexByRank[0]).toBe(puzzle.secretIndex);
    expect(puzzle.similarityByRank[0]).toBeCloseTo(1, 2);
    expect(vocabulary[puzzle.secretIndex]).toMatch(/^[a-z]+$/);
  });

  it("ranks every word exactly once", () => {
    const seen = new Set(puzzle.indexByRank);
    expect(seen.size).toBe(manifest.wordCount);
    for (let i = 0; i < manifest.wordCount; i++) {
      expect(puzzle.rankByVocabIndex[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("orders similarity from best to worst without gaps", () => {
    for (let rank = 1; rank < manifest.wordCount; rank++) {
      expect(Number.isNaN(puzzle.similarityByRank[rank]!)).toBe(false);
      // float16 quantisation can make two adjacent ranks equal; it must never
      // make a later rank better.
      expect(puzzle.similarityByRank[rank]!).toBeLessThanOrEqual(
        puzzle.similarityByRank[rank - 1]!,
      );
    }
  });

  it("agrees with the answer the pipeline recorded", () => {
    const answers = JSON.parse(
      readFileSync(join(DATA, "..", "..", "..", "tools", "answers.debug.json"), "utf8"),
    ) as Record<string, string>;
    expect(vocabulary[puzzle.secretIndex]).toBe(answers["0"]);
  });

  it("places the closest words nearest the centre", () => {
    const layout = parseLayout(readBuffer("layout.bin"), manifest.wordCount);
    const { xs, ys } = projectAll(puzzle.indexByRank, layout, manifest.wordCount);

    expect(Math.hypot(xs[puzzle.secretIndex]!, ys[puzzle.secretIndex]!)).toBe(0);

    const near = puzzle.indexByRank[1]!;
    const far = puzzle.indexByRank[manifest.wordCount - 1]!;
    expect(Math.hypot(xs[near]!, ys[near]!)).toBeLessThan(
      Math.hypot(xs[far]!, ys[far]!),
    );
    expect(radiusForRank(manifest.wordCount - 1, manifest.wordCount)).toBeLessThanOrEqual(1);
  });

  it("supports a full hint walk-in from a cold start", () => {
    // Eight cold guesses, then hint repeatedly - each one must halve the
    // distance and terminate rather than loop.
    const guesses: Guess[] = [];
    const play = (rank: number, revealed: boolean) => {
      const vocabIndex = puzzle.indexByRank[rank]!;
      guesses.push({
        vocabIndex,
        word: vocabulary[vocabIndex]!,
        similarity: puzzle.similarityByRank[rank]!,
        rank,
        turn: guesses.length + 1,
        revealed,
      });
    };

    for (let i = 0; i < 8; i++) play(50_000 + i, false);

    let hints = 0;
    let guard = 0;
    while (guard++ < 500) {
      const availability = hintAvailability(guesses);
      if (availability.available) {
        play(availability.targetRank, true);
        hints++;
        continue;
      }
      if (availability.guessesUntilNext === 0) break;
      // Burn cold guesses until the cooldown clears.
      for (let i = 0; i < availability.guessesUntilNext; i++) {
        play(40_000 + guesses.length, false);
      }
    }

    const best = Math.min(...guesses.map((guess) => guess.rank));
    expect(best).toBe(1);
    expect(hints).toBeGreaterThan(10);
    expect(hints).toBeLessThan(25);
    expect(bandForRank(best).id).toBe("blazing");
  });
});

describe("every built puzzle", () => {
  it("parses, and its answer is a curated word", () => {
    const answers = JSON.parse(
      readFileSync(join(DATA, "..", "..", "..", "tools", "answers.debug.json"), "utf8"),
    ) as Record<string, string>;

    for (let number = 0; number < manifest.puzzleCount; number++) {
      const puzzle = parsePuzzle(
        readBuffer("puzzles", `p${number}.bin`),
        number,
        manifest,
      );
      expect(vocabulary[puzzle.secretIndex]).toBe(answers[String(number)]);
      expect(puzzle.indexByRank[0]).toBe(puzzle.secretIndex);
    }
  });

  it("never repeats an answer", () => {
    const answers = JSON.parse(
      readFileSync(join(DATA, "..", "..", "..", "tools", "answers.debug.json"), "utf8"),
    ) as Record<string, string>;
    const words = Object.values(answers);
    expect(new Set(words).size).toBe(words.length);
  });
});
