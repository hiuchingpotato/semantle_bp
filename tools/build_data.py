#!/usr/bin/env python3
"""Build the game data from GloVe vectors.

Input:  glove.6B.300d.txt  (Stanford GloVe, pre-trained vectors, PDDL v1.0)
Output: web/public/data/
          manifest.json   game config + integrity info
          vocab.json      guessable words, ordered by corpus frequency
          layout.bin      float16 angle per word (shared by every puzzle)
          puzzles/p<N>.bin  one similarity table per puzzle

Design note - why this differs from the reference implementations:

Semantle-likes usually ship x/y *per word per puzzle*. They don't need to. The
angle of a word is a property of the embedding, not of today's answer, so it
lives in one shared layout.bin. The radius is a pure function of rank, so the
client derives it. That leaves 6 bytes per word per puzzle instead of 14, and
means the expensive layout step runs once rather than once per puzzle.

Run:  .tooling/venv/bin/python tools/build_data.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
import time
from pathlib import Path

import numpy as np

import inflections
import spelling
from wordfilters import BLOCKED_EXACT, BLOCKED_SUBSTRINGS

REPO = Path(__file__).resolve().parent.parent
GLOVE = REPO / ".tooling" / "glove.6B.300d.txt"
DICTIONARY = REPO / ".tooling" / "words_alpha.txt"
EVERYDAY = REPO / ".tooling" / "everyday_en.txt"
BRITISH = REPO / "tools" / "wordlists" / "british_en.txt"
ANSWERS = REPO / "tools" / "answers.txt"
OUT = REPO / "web" / "public" / "data"

# Apple's Accelerate BLAS emits spurious divide/overflow warnings from matmul on
# arm64. The results are correct - web/src/game/data.integration.test.ts reads
# every built file back and would catch a NaN - but the noise buries real output.
np.seterr(divide="ignore", over="ignore", invalid="ignore")

# Binary format. Bump FORMAT_VERSION on any layout change; the client refuses
# to parse a version it doesn't recognise rather than silently misreading.
MAGIC = b"BPP1"
FORMAT_VERSION = 1
RECORD_SIZE = 6  # uint32 vocab index + float16 similarity
HEADER_SIZE = 16

TOKEN_RE = re.compile(r"^[a-z]{3,}$")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def is_blocked(word: str) -> bool:
    if word in BLOCKED_EXACT:
        return True
    return any(frag in word for frag in BLOCKED_SUBSTRINGS)


def load_dictionary(path: Path) -> set[str]:
    """Real English words, used to decide what counts as guessable.

    Frequency alone is a poor test. GloVe is ordered most-frequent-first, and by
    60,000 tokens in it is four-fifths surnames, place names, acronyms and
    foreign words - while ordinary English like "quiche" (63,848th) and "cremate"
    (83,572nd) is still below the line. Cutting anywhere shallow enough to
    exclude the junk also excludes words people actually type.

    So the cut is: frequent *or* in the dictionary. The dictionary rescues real
    words from the tail; the frequency floor keeps modern usage the dictionary
    has not caught up with.
    """
    if not path.exists():
        raise SystemExit(f"missing {path} - see the setup steps in README.md")

    words = set()
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            word = line.strip().lower()
            if len(word) >= 3 and word.isalpha():
                words.add(word)

    log(f"  dictionary: {len(words)} words")
    return words


# A closed compound is admitted when both halves are at least this long. Three
# lets surnames in wholesale - grant+ham, ash+ford, gay+lord - because English
# place names are built the same way as ordinary compounds.
COMPOUND_MIN_PART = 4

# And when it is something people say. Frequency alone cannot do this job -
# "denzel" outranks "fairytale" in film subtitles - but paired with the length
# rule it holds.
COMPOUND_MAX_SPEECH_RANK = 35_000


def make_compound_test(british_common: set[str], speech: dict[str, int]):
    """Recognise closed compounds the dictionaries file as two words.

    "fairytale" has a vector and people type it, but no dictionary lists it:
    they carry "fairy tale" and "fairy-tale". Same for storybook, sleepover and
    voicemail. Being told the game does not know them is the complaint the wider
    vocabulary was supposed to end.

    Splitting alone is far too loose - 34,000 tokens split into two real words,
    and most are surnames and places. Both halves being four letters or more,
    plus the whole being something people say, cuts that to about ninety, mostly
    genuine with a few harmless proper nouns like "stargate".

    This admits words for *guessing* only. They have not passed the hint pool's
    tests, and letting them near hints would risk the problem that pool exists
    to prevent.
    """

    def is_compound(word: str) -> bool:
        if speech.get(word, 1 << 30) >= COMPOUND_MAX_SPEECH_RANK:
            return False
        for cut in range(COMPOUND_MIN_PART, len(word) - COMPOUND_MIN_PART + 1):
            if word[:cut] in british_common and word[cut:] in british_common:
                return True
        return False

    return is_compound


def load_vectors(
    path: Path,
    dictionary: set[str],
    is_compound,
    frequency_floor: int,
    scan_limit: int,
):
    """Read usable tokens and their vectors from a GloVe text file.

    A token is kept when it is among the first `frequency_floor` usable tokens,
    or when the dictionary recognises it. Vector parsing is the expensive part,
    so tokens are filtered before they are parsed.
    """
    words: list[str] = []
    rows: list[np.ndarray] = []
    skipped_blocked = 0
    from_dictionary = 0
    from_compounds = 0

    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle):
            if line_no >= scan_limit:
                break
            space = line.find(" ")
            if space <= 0:
                continue
            token = line[:space]
            if not TOKEN_RE.match(token):
                continue
            if is_blocked(token):
                skipped_blocked += 1
                continue

            frequent = len(words) < frequency_floor
            if not frequent:
                if token in dictionary:
                    from_dictionary += 1
                elif is_compound(token):
                    from_compounds += 1
                else:
                    continue

            rows.append(np.array(line[space + 1 :].split(), dtype=np.float32))
            words.append(token)
            if len(words) % 20000 == 0:
                log(f"  ... {len(words)} words (scanned {line_no + 1} lines)")

    log(f"  filtered out {skipped_blocked} blocked tokens")
    log(f"  {from_dictionary} words kept on the dictionary rather than frequency")
    log(f"  {from_compounds} closed compounds the dictionary does not list")
    matrix = np.vstack(rows)
    return words, matrix


# Spoken-frequency rank a word must beat to be offered as a hint. Generous, so
# that ordinary vocabulary survives; it is only here to catch words the British
# list keeps but nobody says, like "mesozoic".
HINT_SPEECH_RANK = 80_000

# Rank in the spoken list below which a word is common enough to hint even if
# the British list has not got it - which happens for inflections.
HINT_COMMON_RANK = 15_000


def read_british() -> tuple[set[str], set[str]]:
    """Common words and proper nouns, told apart by capitalisation."""
    common: set[str] = set()
    proper: set[str] = set()
    for line in BRITISH.read_text(encoding="utf-8", errors="ignore").splitlines():
        entry = line.strip()
        if entry.startswith("#") or not entry.isalpha() or len(entry) < 3:
            continue
        (proper if entry[0].isupper() else common).add(entry.lower())
    # A word that appears both ways - "china" the country and the crockery - is
    # an ordinary word, so only capital-only entries count as proper nouns.
    return common, proper - common


def read_speech() -> dict[str, int]:
    """Word -> rank in everyday speech. Lower is more common."""
    speech: dict[str, int] = {}
    with EVERYDAY.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            parts = line.split()
            if len(parts) == 2 and parts[0].isalpha():
                speech.setdefault(parts[0].lower(), len(speech))
    return speech


def load_hintable(
    words: list[str],
    common: set[str],
    proper: set[str],
    speech: dict[str, int],
) -> np.ndarray:
    """Which words the game may offer as a hint.

    Guessing and hinting want different lists. Guessing should accept anything
    real, so the vocabulary is deliberately wide. A hint is the game speaking,
    and it has to be a word the player plausibly knows: offering "chippewa" is
    worse than offering nothing.

    Neither frequency nor a dictionary settles this alone. Wikipedia frequency,
    which is what orders the vocabulary, ranks American place names above
    ordinary household words, and the large word lists carry proper nouns as
    plain lowercase entries. Two signals together do work:

    - A British word list that *preserves capitalisation*. An entry that only
      ever appears capitalised is a proper noun, which is how Chippewa, Custer
      and Monongahela are told apart from kettle. It is British on purpose:
      courgette and aubergine are in it, and Americanisms have been removed.
    - Spoken-word frequency, which knows that "mesozoic" is not something people
      say even though it is an ordinary lowercase word.

    Erring strict is deliberate. A good word missing from the hint pool costs
    nothing - it stays guessable, and the hint falls to a neighbouring rank -
    while one bad hint is visible and irritating.
    """
    flags = np.zeros(len(words), dtype=bool)
    for index, word in enumerate(words):
        if word in proper:
            continue
        rank = speech.get(word, 1 << 30)
        recognised = word in common or rank < HINT_COMMON_RANK
        if recognised and rank < HINT_SPEECH_RANK:
            flags[index] = True

    log(f"  {len(proper)} proper nouns excluded from hints")
    log(f"  {int(flags.sum())} of {len(words)} words may be offered as a hint")
    return flags


def pack_bits(flags: np.ndarray) -> bytes:
    """One bit per word, so the whole hint pool is a few kilobytes."""
    return np.packbits(flags, bitorder="little").tobytes()


# How far to even out the angular distribution. 0 keeps the raw bearings, which
# clump so hard they leave empty wedges; 1 spreads words perfectly evenly, which
# looks like television static and hides the clustering that makes the plot
# worth having. Partway keeps the clumps and fills the circle.
ANGLE_EVENING = 0.45

# Radial scatter, as a fraction of a word's rank-derived radius. Without it every
# word sits exactly on a rank spiral and the field reads as a machine-made
# lattice rather than a scatter of words.
RADIAL_JITTER = 0.06


def compute_layout(unit: np.ndarray, seed: int) -> np.ndarray:
    """Per-word angle and radial jitter, shared by every puzzle.

    Returns an (n, 2) float16 array: [angle, radial multiplier].

    The angle comes from the bearing in the top-2 principal component plane, so
    words used in similar contexts point the same way. That is the property the
    plot is trading on: a player who has guessed along one arm without reaching
    the centre can see they need a different idea, not another synonym.

    PCA is the cheap choice and it measurably works - the hundred closest words
    to an answer land within a concentrated arc rather than scattered - but
    t-SNE or UMAP would cluster more tightly. Swapping this function is the only
    change needed; the output contract is just two numbers per vocab index.
    """
    centred = unit - unit.mean(axis=0, keepdims=True)
    # 300x300 covariance - small enough for a dense eigendecomposition.
    cov = (centred.T @ centred).astype(np.float64)
    eigvals, eigvecs = np.linalg.eigh(cov)
    top2 = eigvecs[:, np.argsort(eigvals)[::-1][:2]]
    projected = centred @ top2.astype(np.float32)

    count = len(unit)
    bearings = np.arctan2(projected[:, 1], projected[:, 0]).astype(np.float64)
    order = np.argsort(bearings, kind="stable")

    # Both sequences are ascending, so blending them cannot reorder anything -
    # no word overtakes its neighbour and there is nothing to unwrap.
    ascending = bearings[order]
    even = np.linspace(-np.pi, np.pi, count, endpoint=False)
    blended = (1 - ANGLE_EVENING) * ascending + ANGLE_EVENING * even

    angles = np.empty(count, dtype=np.float64)
    angles[order] = blended

    rng = np.random.default_rng(seed)
    # Sub-slot wiggle, so adjacent words don't read as a regular comb up close.
    slot = (2 * np.pi) / count
    angles += rng.uniform(-slot * 0.5, slot * 0.5, size=count)

    jitter = 1.0 + rng.uniform(-RADIAL_JITTER, RADIAL_JITTER, size=count)

    return np.stack([angles, jitter], axis=1).astype(np.float16)


def choose_secrets(words: list[str], count: int, seed: int) -> list[int]:
    """Read the curated answer list and put it in a stable shuffled order.

    Answers are hand-picked in tools/answers.txt, not derived. Every heuristic
    I tried on this corpus produced answers like "spokesman" and "ministry" -
    GloVe 6B is Wikipedia plus newswire, and it shows. Semantle and Pimantle
    both hand-pick for the same reason.

    The shuffle is seeded, so the schedule is reproducible: rebuilding the data
    must not silently change which word belongs to which day.
    """
    rank = {word: index for index, word in enumerate(words)}
    answers, missing = [], []
    for line in ANSWERS.read_text().splitlines():
        word = line.split("#", 1)[0].strip()
        if not word:
            continue
        if word in rank:
            answers.append(word)
        else:
            missing.append(word)

    if missing:
        raise SystemExit(
            f"{len(missing)} answers are not in the vocabulary: "
            f"{', '.join(missing[:10])} - run tools/check_answers.py"
        )

    seen: set[str] = set()
    unique = [w for w in answers if not (w in seen or seen.add(w))]
    log(f"  {len(unique)} curated answers")

    if count and count > len(unique):
        raise SystemExit(f"only {len(unique)} answers for {count} puzzles")

    rng = np.random.default_rng(seed)
    order = rng.permutation(len(unique))
    chosen = [unique[i] for i in order][: count or len(unique)]
    return [rank[word] for word in chosen]


# Two spellings of one word sit close together in the embedding. The cut is
# where the candidates separate cleanly: everything at 0.42 and above is a real
# pair (offence/offense, sabre/saber), and everything at 0.35 and below is either
# a rule misfiring (timbre/timber, poured/pored) or a pair whose senses have
# genuinely diverged in the corpus - storey/story, draught/draft - where aliasing
# would score the player against the wrong meaning.
ALIAS_MIN_SIMILARITY = 0.40


def build_aliases(words: list[str], unit: np.ndarray) -> dict[str, str]:
    """Map British spellings onto their American entry.

    Both spellings are guessable either way; this makes them *score the same*.
    Without it a player typing "flavour" is quietly penalised, because the two
    forms are separate vectors and the corpus is American - "flavor" ranks
    7,664th by frequency and "flavour" 29,943rd, so the same idea lands in
    different bands against the same answer.

    Rules generate candidates; the embedding decides. A candidate is kept only if
    both forms exist and their vectors agree, which catches rule misfires without
    anyone having to predict them.
    """
    rank = {word: index for index, word in enumerate(words)}
    aliases: dict[str, str] = {}
    rejected: list[tuple[str, str, float]] = []

    for word in words:
        for candidate in spelling.candidates(word):
            target = rank.get(candidate)
            if target is None or candidate == word:
                continue
            similarity = float(unit[rank[word]] @ unit[target])
            if similarity < ALIAS_MIN_SIMILARITY:
                rejected.append((word, candidate, similarity))
                continue
            aliases[word] = candidate
            break

    # An alias must never point at another alias, or a lookup would need chasing.
    for british, american in list(aliases.items()):
        if american in aliases:
            del aliases[british]

    log(f"  {len(aliases)} spelling aliases, {len(rejected)} rejected by the embedding")
    for word, candidate, similarity in sorted(rejected, key=lambda r: -r[2])[:5]:
        log(f"    rejected {word} -> {candidate} ({similarity:.2f})")

    return dict(sorted(aliases.items()))


# Singular and plural of one word sit close together but nowhere near as close
# as two spellings of it: dragon/dragons is 0.52, penguin/penguins 0.37. The cut
# is set below the weakest real pair and far above the misfires, which all score
# negative - "when"/"whens" is -0.27.
INFLECTION_MIN_SIMILARITY = 0.30


def build_inflections(words: list[str], unit: np.ndarray) -> dict[str, str]:
    """Pair each singular with its plural.

    Unlike the spelling aliases, this is not a redirect to a canonical form.
    Both forms are real words with their own vectors and their own ranks, and
    which is closer depends on the answer, so the pairing is shipped and the
    client picks the better one per puzzle.

    Rules propose, the embedding decides - the same arrangement that keeps the
    spelling rules honest.
    """
    rank = {word: index for index, word in enumerate(words)}
    pairs: dict[str, str] = {}
    rejected = 0

    for word in words:
        if word in pairs:
            continue
        for candidate in inflections.plural_candidates(word):
            target = rank.get(candidate)
            if target is None or candidate == word or candidate in pairs:
                continue
            similarity = float(unit[rank[word]] @ unit[target])
            if similarity < INFLECTION_MIN_SIMILARITY:
                rejected += 1
                continue
            pairs[word] = candidate
            break

    log(f"  {len(pairs)} singular/plural pairs ({rejected} rejected by the embedding)")
    return dict(sorted(pairs.items()))


def write_puzzle(path: Path, secret_index: int, order: np.ndarray, sims: np.ndarray) -> None:
    header = struct.pack(
        "<4sHHII", MAGIC, FORMAT_VERSION, RECORD_SIZE, len(order), secret_index
    )
    payload = np.empty(len(order), dtype=[("index", "<u4"), ("sim", "<f2")])
    payload["index"] = order.astype(np.uint32)
    payload["sim"] = sims[order].astype(np.float16)
    path.write_bytes(header + payload.tobytes())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--frequency-floor",
        type=int,
        default=30000,
        help="keep this many most-frequent tokens regardless of the dictionary",
    )
    parser.add_argument(
        "--puzzles", type=int, default=0, help="puzzles to build (0 = every answer)"
    )
    parser.add_argument("--epoch", default="2026-08-18", help="date of puzzle #0")
    parser.add_argument(
        "--scan-limit",
        type=int,
        default=400_000,
        help="GloVe lines to read; the file holds 400,000",
    )
    parser.add_argument("--seed", type=int, default=20260815)
    args = parser.parse_args()

    if not GLOVE.exists():
        raise SystemExit(f"missing {GLOVE} - see tools/README.md")

    log("reading the word lists")
    dictionary = load_dictionary(DICTIONARY)
    british_common, british_proper = read_british()
    speech = read_speech()

    log(f"reading {GLOVE.name}")
    words, vectors = load_vectors(
        GLOVE,
        dictionary,
        make_compound_test(british_common, speech),
        args.frequency_floor,
        args.scan_limit,
    )
    log(f"vocabulary: {len(words)} words x {vectors.shape[1]} dims")

    log("normalising")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    unit = (vectors / norms).astype(np.float32)

    log("computing shared layout (PCA)")
    layout = compute_layout(unit, args.seed)

    log("choosing which words may be hints")
    hintable = load_hintable(words, british_common, british_proper, speech)

    log("building spelling aliases")
    aliases = build_aliases(words, unit)

    log("pairing singulars with plurals")
    inflection_pairs = build_inflections(words, unit)

    log("choosing answers")
    secrets = choose_secrets(words, args.puzzles, args.seed)

    puzzles_dir = OUT / "puzzles"
    puzzles_dir.mkdir(parents=True, exist_ok=True)
    for stale in puzzles_dir.glob("p*.bin"):
        stale.unlink()

    log(f"building {len(secrets)} puzzles")
    answers = {}
    for number, secret_index in enumerate(secrets):
        sims = unit @ unit[secret_index]
        # Descending similarity; the secret itself lands at rank 0. Stable sort
        # keeps ties in frequency order, so the tables are reproducible.
        order = np.argsort(-sims, kind="stable")
        write_puzzle(puzzles_dir / f"p{number}.bin", int(secret_index), order, sims)
        answers[number] = words[secret_index]
        if (number + 1) % 20 == 0:
            log(f"  ... {number + 1}/{len(secrets)}")

    (OUT / "vocab.json").write_text(json.dumps(words, separators=(",", ":")))
    (OUT / "layout.bin").write_bytes(layout.tobytes())
    (OUT / "aliases.json").write_text(json.dumps(aliases, separators=(",", ":")))
    (OUT / "hintable.bin").write_bytes(pack_bits(hintable))
    (OUT / "forms.json").write_text(
        json.dumps(inflection_pairs, separators=(",", ":"))
    )

    vocab_hash = hashlib.sha256(
        (OUT / "vocab.json").read_bytes()
    ).hexdigest()[:16]

    # Cache key for every data file the client fetches.
    #
    # The data files are immutable for a given build and are fetched from cache
    # without revalidating, so a rebuild has to change their URLs or a browser
    # will pair a fresh manifest with stale binaries. Covers the vocabulary, the
    # answers and the format version - everything that changes what those files
    # contain or how big they are.
    data_version = hashlib.sha256(
        (OUT / "vocab.json").read_bytes()
        + ANSWERS.read_bytes()
        + str(FORMAT_VERSION).encode()
    ).hexdigest()[:12]

    manifest = {
        "formatVersion": FORMAT_VERSION,
        "recordSize": RECORD_SIZE,
        "headerSize": HEADER_SIZE,
        "wordCount": len(words),
        "aliasCount": len(aliases),
        "hintableCount": int(hintable.sum()),
        "inflectionCount": len(inflection_pairs),
        # float16 pairs in layout.bin: angle, then radial multiplier.
        "layoutStride": 2,
        "puzzleCount": len(secrets),
        "epoch": args.epoch,
        "vocabHash": vocab_hash,
        "dataVersion": data_version,
        "source": {
            "vectors": "GloVe 6B 300d (Stanford NLP)",
            "licence": "Public Domain Dedication and Licence (PDDL) v1.0",
            "url": "https://nlp.stanford.edu/projects/glove/",
            "wordList": "dwyl/english-words (Unlicense)",
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # Answers are written outside public/ so they never ship with the site.
    debug = REPO / "tools" / "answers.debug.json"
    debug.write_text(json.dumps(answers, indent=2))

    total = sum(f.stat().st_size for f in puzzles_dir.glob("*.bin"))
    log(f"done: {len(secrets)} puzzles, {total / 1e6:.1f} MB")
    log(f"answers (not shipped) -> {debug.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
