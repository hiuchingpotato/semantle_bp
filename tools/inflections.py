"""Singular and plural forms of the same word.

Guessing "dragon" when the answer is "dragons" should not be a miss. They are
the same word, but they are separate vectors and the gap is large: across real
puzzles, dragon and dragons sit 2,800 ranks apart, wolf and wolves 30,000, baby
and babies 51,000. A player has no way to know which form the answer happens to
use, so making them guess it is a coin toss dressed up as a clue.

These rules generate candidates only. build_data.py checks each pair against the
embedding and throws away any whose halves are not near-synonyms, which is what
catches the misfires - "serf" plus the -f/-ves rule gives "serves", and "when"
plus -s gives "whens".
"""

from __future__ import annotations

# Plurals no suffix rule will find.
IRREGULAR: dict[str, str] = {
    "analysis": "analyses",
    "appendix": "appendices",
    "axis": "axes",
    "bacterium": "bacteria",
    "cactus": "cacti",
    "child": "children",
    "crisis": "crises",
    "criterion": "criteria",
    "curriculum": "curricula",
    "datum": "data",
    "diagnosis": "diagnoses",
    "die": "dice",
    "foot": "feet",
    "fungus": "fungi",
    "goose": "geese",
    "index": "indices",
    "louse": "lice",
    "man": "men",
    "matrix": "matrices",
    "medium": "media",
    "memorandum": "memoranda",
    "mouse": "mice",
    "nucleus": "nuclei",
    "ox": "oxen",
    "person": "people",
    "phenomenon": "phenomena",
    "radius": "radii",
    "stimulus": "stimuli",
    "syllabus": "syllabi",
    "thesis": "theses",
    "tooth": "teeth",
    "vertex": "vertices",
    "woman": "women",
}

# Words that already end in -s and are not plurals of anything. The similarity
# check would catch most of these, but they are common enough to be worth
# naming.
NEVER_SINGULAR = {
    "always", "perhaps", "unless", "across", "towards", "besides", "amidst",
    "gas", "bus", "lens", "bias", "canvas", "chaos", "focus", "virus",
    "campus", "census", "circus", "surplus", "status", "genius", "bonus",
    "atlas", "citrus", "octopus", "walrus", "iris", "oasis", "tennis",
    "chess", "glass", "grass", "class", "press", "dress", "cross", "boss",
}


def plural_candidates(word: str) -> list[str]:
    """Plural forms this singular might take. Order matters: best guess first."""
    if word in NEVER_SINGULAR:
        return []

    out: list[str] = []
    if word in IRREGULAR:
        out.append(IRREGULAR[word])

    if word.endswith(("s", "x", "z", "ch", "sh")):
        out.append(word + "es")
    elif word.endswith("y") and len(word) > 2 and word[-2] not in "aeiou":
        out.append(word[:-1] + "ies")
    elif word.endswith("fe"):
        out.append(word[:-2] + "ves")
    elif word.endswith("f") and len(word) > 3:
        out.append(word[:-1] + "ves")

    out.append(word + "s")
    return out
