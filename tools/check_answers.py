#!/usr/bin/env python3
"""Validate tools/answers.txt against the built vocabulary.

Every answer has to be guessable, and it needs a frequency rank low enough that
its vector is well trained - a rare word has a noisy neighbourhood, which makes
for a frustrating puzzle. Run after editing the answer list.
"""

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
VOCAB = REPO / "web" / "public" / "data" / "vocab.json"
ANSWERS = REPO / "tools" / "answers.txt"

# Beyond this frequency rank the vectors get noisy and the puzzle stops being
# fair. Warn rather than fail - it's a judgement call, not a hard error.
RANK_WARN = 30000


def read_answers(path: Path) -> list[str]:
    words = []
    for line in path.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            words.append(line)
    return words


def main() -> int:
    if not VOCAB.exists():
        raise SystemExit("build the vocabulary first: tools/build_data.py")

    vocab = json.load(VOCAB.open())
    rank = {word: index for index, word in enumerate(vocab)}
    answers = read_answers(ANSWERS)

    missing = [w for w in answers if w not in rank]
    duplicates = sorted({w for w in answers if answers.count(w) > 1})
    rare = [(w, rank[w]) for w in answers if w in rank and rank[w] > RANK_WARN]

    print(f"answers: {len(answers)}")
    if duplicates:
        print(f"DUPLICATE: {', '.join(duplicates)}")
    if missing:
        print(f"NOT IN VOCAB ({len(missing)}): {', '.join(missing)}")
    if rare:
        print(f"rare (rank > {RANK_WARN}):")
        for word, r in sorted(rare, key=lambda item: -item[1]):
            print(f"  {word} #{r}")

    usable = [w for w in answers if w in rank]
    if usable:
        ranks = sorted(rank[w] for w in usable)
        print(
            f"usable: {len(usable)} | rank median {ranks[len(ranks) // 2]} "
            f"| min {ranks[0]} max {ranks[-1]}"
        )

    return 1 if (missing or duplicates) else 0


if __name__ == "__main__":
    sys.exit(main())
