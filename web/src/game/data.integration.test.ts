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
  it("names a data version, so a rebuild cannot serve stale binaries", () => {
    // Without this the data files are fetched from cache and never
    // revalidated, so a rebuild that changes the vocabulary size pairs a fresh
    // manifest with an old layout.bin and the parser refuses to start.
    expect(typeof manifest.dataVersion).toBe("string");
    expect(manifest.dataVersion!.length).toBeGreaterThanOrEqual(8);
  });

  it("has a layout sized to the vocabulary the manifest declares", () => {
    // The exact mismatch that broke the live site: 60,000-word layout against a
    // 105,187-word manifest.
    const bytes = readFileSync(join(DATA, "layout.bin")).byteLength;
    expect(bytes).toBe(manifest.wordCount * 4);
  });

  it("has a manifest that matches the vocabulary", () => {
    expect(manifest.formatVersion).toBe(1);
    expect(vocabulary).toHaveLength(manifest.wordCount);
    expect(manifest.puzzleCount).toBeGreaterThan(0);
  });

  it("ships a layout entry for every word", () => {
    const layout = parseLayout(readBuffer("layout.bin"), manifest.wordCount);
    expect(layout.angles).toHaveLength(manifest.wordCount);
    expect(layout.jitter).toHaveLength(manifest.wordCount);

    // Counted in plain code and asserted once. An expect() per word is 200,000
    // calls across the vocabulary, which is slow enough to threaten the
    // per-test timeout on a CI runner.
    let badAngles = 0;
    for (const angle of layout.angles) {
      if (!Number.isFinite(angle) || Math.abs(angle) > Math.PI + 0.01) badAngles++;
    }
    expect(badAngles, "angles outside -pi..pi").toBe(0);

    let badJitter = 0;
    for (const jitter of layout.jitter) {
      // Cosmetic scatter only - a multiplier this size cannot move a word
      // across a guide ring and mislead the player about its band.
      if (jitter <= 0.9 || jitter >= 1.1) badJitter++;
    }
    expect(badJitter, "jitter outside 0.9..1.1").toBe(0);
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
    const broken = entries.filter(
      ([british, american]) =>
        !known.has(british) ||
        !known.has(american) ||
        british === american ||
        // A chain would mean a lookup has to be followed more than once.
        aliases[american] !== undefined,
    );
    expect(broken.slice(0, 5), "aliases that do not resolve").toEqual([]);
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

  it("knows the everyday words a player will actually type", () => {
    // The vocabulary was once the 60,000 most frequent GloVe tokens, which left
    // out quiche (63,848th) and cremate (83,572nd) while keeping thousands of
    // surnames. Being told "I don't know that word" about ordinary English is
    // the worst thing this game can do, so it is guarded rather than assumed.
    const known = new Set(vocabulary);
    const everyday = [
      "quiche", "cremate", "omelette", "paella", "scone", "crumpet",
      "marzipan", "gherkin", "kipper", "trifle", "aubergine", "sieve",
      "doily", "gazebo", "laptop", "internet", "email", "bicycle",
      "umbrella", "cinnamon", "walnut", "otter", "badger", "heron",
    ];
    const missing = everyday.filter((word) => !known.has(word));
    expect(missing, `not guessable: ${missing.join(", ")}`).toEqual([]);
  });

  it("knows closed compounds the dictionaries file as two words", () => {
    // Reported by a player: "fairytale" was rejected. It has a vector and
    // people type it, but dictionaries carry "fairy tale" and "fairy-tale",
    // so the dictionary pass alone never reached it.
    const known = new Set(vocabulary);
    const compounds = [
      "fairytale", "fairytales", "storybook", "sleepover", "takeaway",
      "voicemail", "grandkids", "playlist", "breadcrumbs", "ringtone",
    ];
    const missing = compounds.filter((word) => !known.has(word));
    expect(missing, `not guessable: ${missing.join(", ")}`).toEqual([]);
  });

  it("has a vocabulary large enough to cover ordinary English", () => {
    // Frequency alone cannot reach far enough; the dictionary pass is what
    // takes this past 100k. A sharp drop means that pass silently stopped.
    expect(manifest.wordCount).toBeGreaterThan(100_000);
  });

  it("pairs singulars with plurals", () => {
    const pairs = JSON.parse(
      readFileSync(join(DATA, "forms.json"), "utf8"),
    ) as Record<string, string>;
    expect(Object.keys(pairs).length).toBeGreaterThan(5_000);

    const known = new Set(vocabulary);
    const broken = Object.entries(pairs).filter(
      ([singular, plural]) =>
        !known.has(singular) || !known.has(plural) || singular === plural,
    );
    expect(broken.slice(0, 5), "pairs that do not resolve").toEqual([]);

    // The pairs a player will actually run into.
    for (const [a, b] of [
      ["dragon", "dragons"],
      ["wolf", "wolves"],
      ["baby", "babies"],
      ["mouse", "mice"],
      ["child", "children"],
      ["box", "boxes"],
    ]) {
      expect(pairs[a!], `${a} should pair with ${b}`).toBe(b);
    }

    // Rule misfires the embedding is there to catch: -s on a word that has no
    // plural.
    for (const wrong of ["when", "and", "here", "always"]) {
      expect(pairs[wrong], `${wrong} should not pair`).toBeUndefined();
    }

    // The -f/-ves rule proposes "serves" for "serf". That is rejected on
    // similarity, and the rules then fall through to the right answer rather
    // than giving up on the word.
    expect(pairs["serf"]).toBe("serfs");
  });

  it("keeps the vocabulary to plain lowercase words", () => {
    const malformed = vocabulary.filter((word) => !/^[a-z]{3,}$/.test(word));
    expect(malformed.slice(0, 5), "not plain lowercase words").toEqual([]);
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

    let unranked = 0;
    for (let i = 0; i < manifest.wordCount; i++) {
      if ((puzzle.rankByVocabIndex[i] ?? -1) < 0) unranked++;
    }
    expect(unranked, "words with no rank").toBe(0);
  });

  it("orders similarity from best to worst without gaps", () => {
    // float16 quantisation can make two adjacent ranks equal; it must never
    // make a later rank better. Scanned in plain code, asserted once.
    let firstBreak = -1;
    let nans = 0;
    for (let rank = 1; rank < manifest.wordCount; rank++) {
      const here = puzzle.similarityByRank[rank]!;
      if (Number.isNaN(here)) nans++;
      if (firstBreak < 0 && here > puzzle.similarityByRank[rank - 1]!) {
        firstBreak = rank;
      }
    }
    expect(nans, "NaN similarities").toBe(0);
    expect(firstBreak, "similarity increases at this rank").toBe(-1);
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
