import { describe, expect, it } from "vitest";

import { buildWordIndex, normaliseGuess, resolveGuess } from "./loader";

const VOCAB = ["color", "colour", "centre", "center", "rabbit", "flavor"];
const INDEX = buildWordIndex(VOCAB);
const ALIASES = { colour: "color", centre: "center", flavour: "flavor" };

describe("normaliseGuess", () => {
  it("tidies case, spacing and stray punctuation", () => {
    expect(normaliseGuess("  RABBIT ")).toBe("rabbit");
    expect(normaliseGuess("rab-bit!")).toBe("rabbit");
    expect(normaliseGuess("don’t")).toBe("dont");
  });

  it("returns empty for input with nothing usable in it", () => {
    expect(normaliseGuess("   ")).toBe("");
    expect(normaliseGuess("123")).toBe("");
  });
});

describe("resolveGuess", () => {
  it("resolves an ordinary word to itself", () => {
    expect(resolveGuess("rabbit", INDEX, ALIASES)).toEqual({
      vocabIndex: 4,
      typed: "rabbit",
      aliased: false,
    });
  });

  it("scores a British spelling as its American entry", () => {
    const uk = resolveGuess("colour", INDEX, ALIASES);
    const us = resolveGuess("color", INDEX, ALIASES);
    // The point of the whole exercise: identical entry, so identical rank.
    expect(uk?.vocabIndex).toBe(us?.vocabIndex);
    expect(uk?.aliased).toBe(true);
    expect(us?.aliased).toBe(false);
  });

  it("keeps the spelling the player typed", () => {
    // Correcting someone's spelling back at them is the annoyance this removes.
    expect(resolveGuess("colour", INDEX, ALIASES)?.typed).toBe("colour");
    expect(resolveGuess("CENTRE", INDEX, ALIASES)?.typed).toBe("centre");
  });

  it("aliases even when the British form is itself in the vocabulary", () => {
    // "colour" and "centre" both have their own entries; the alias must win, or
    // the two spellings would still score differently.
    expect(resolveGuess("centre", INDEX, ALIASES)?.vocabIndex).toBe(
      INDEX.get("center"),
    );
  });

  it("falls back to the typed word when the alias target is absent", () => {
    const sparse = buildWordIndex(["colour"]);
    expect(resolveGuess("colour", sparse, ALIASES)).toEqual({
      vocabIndex: 0,
      typed: "colour",
      aliased: false,
    });
  });

  it("returns null for an unknown word", () => {
    expect(resolveGuess("zzzzz", INDEX, ALIASES)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(resolveGuess("   ", INDEX, ALIASES)).toBeNull();
    expect(resolveGuess("!!!", INDEX, ALIASES)).toBeNull();
  });

  it("works with no alias table at all", () => {
    // An older data build has no aliases.json; the game must still play.
    expect(resolveGuess("colour", INDEX, {})?.vocabIndex).toBe(
      INDEX.get("colour"),
    );
    expect(resolveGuess("rabbit", INDEX, {})?.vocabIndex).toBe(4);
  });
});
