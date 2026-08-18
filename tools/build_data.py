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

import spelling
from wordfilters import BLOCKED_EXACT, BLOCKED_SUBSTRINGS

REPO = Path(__file__).resolve().parent.parent
GLOVE = REPO / ".tooling" / "glove.6B.300d.txt"
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


def load_vectors(path: Path, limit: int, scan_limit: int):
    """Read the most frequent `limit` usable tokens from a GloVe text file.

    GloVe files are ordered most-frequent-first, so we can stop early. Vector
    parsing is the expensive part, so tokens are filtered before they're parsed.
    """
    words: list[str] = []
    rows: list[np.ndarray] = []
    skipped_blocked = 0

    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle):
            if len(words) >= limit or line_no >= scan_limit:
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
            rows.append(np.array(line[space + 1 :].split(), dtype=np.float32))
            words.append(token)
            if len(words) % 10000 == 0:
                log(f"  ... {len(words)} words (scanned {line_no + 1} lines)")

    log(f"  filtered out {skipped_blocked} blocked tokens")
    matrix = np.vstack(rows)
    return words, matrix


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
    parser.add_argument("--words", type=int, default=60000, help="vocabulary size")
    parser.add_argument(
        "--puzzles", type=int, default=0, help="puzzles to build (0 = every answer)"
    )
    parser.add_argument("--epoch", default="2026-08-18", help="date of puzzle #0")
    parser.add_argument("--scan-limit", type=int, default=250000)
    parser.add_argument("--seed", type=int, default=20260815)
    args = parser.parse_args()

    if not GLOVE.exists():
        raise SystemExit(f"missing {GLOVE} - see tools/README.md")

    log(f"reading {GLOVE.name}")
    words, vectors = load_vectors(GLOVE, args.words, args.scan_limit)
    log(f"vocabulary: {len(words)} words x {vectors.shape[1]} dims")

    log("normalising")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    unit = (vectors / norms).astype(np.float32)

    log("computing shared layout (PCA)")
    layout = compute_layout(unit, args.seed)

    log("building spelling aliases")
    aliases = build_aliases(words, unit)

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

    vocab_hash = hashlib.sha256(
        (OUT / "vocab.json").read_bytes()
    ).hexdigest()[:16]

    manifest = {
        "formatVersion": FORMAT_VERSION,
        "recordSize": RECORD_SIZE,
        "headerSize": HEADER_SIZE,
        "wordCount": len(words),
        "aliasCount": len(aliases),
        # float16 pairs in layout.bin: angle, then radial multiplier.
        "layoutStride": 2,
        "puzzleCount": len(secrets),
        "epoch": args.epoch,
        "vocabHash": vocab_hash,
        "source": {
            "vectors": "GloVe 6B 300d (Stanford NLP)",
            "licence": "Public Domain Dedication and Licence (PDDL) v1.0",
            "url": "https://nlp.stanford.edu/projects/glove/",
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
