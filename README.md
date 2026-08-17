# Closer

A daily word game. You guess words; the game tells you how close each one is in
*meaning* to a hidden word. Everything runs in the browser.

`Closer` is a working title, not a cleared name — see [Naming](#naming).

## Running it

Two one-off setup steps, because the toolchain and the source vectors are
deliberately local rather than committed:

```bash
# 1. Node (installed into .tooling, no sudo, nothing touched system-wide)
LTS=$(curl -s https://nodejs.org/dist/index.json | python3 -c "import sys,json;print(next(r['version'] for r in json.load(sys.stdin) if r['lts']))")
mkdir -p .tooling && cd .tooling
curl -sLO "https://nodejs.org/dist/$LTS/node-$LTS-darwin-arm64.tar.xz"
tar -xf "node-$LTS-darwin-arm64.tar.xz" && mv "node-$LTS-darwin-arm64" node
cd ..
export PATH="$PWD/.tooling/node/bin:$PATH"

# 2. Python environment and the GloVe vectors (862MB download)
python3 -m venv .tooling/venv && .tooling/venv/bin/pip install numpy
curl -sL -o .tooling/glove.6B.zip \
  "https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip"
unzip -o .tooling/glove.6B.zip glove.6B.300d.txt -d .tooling/
```

Then:

```bash
.tooling/venv/bin/python tools/build_data.py   # ~30s, writes web/public/data
cd web && npm install
npm run dev                                    # http://127.0.0.1:5183
npm test                                       # 71 tests
```

## How it works

Three ideas, and the rest is detail.

**Similarity is precomputed, not calculated live.** Word vectors never reach the
browser. For each answer, the build ranks all 60,000 words by cosine similarity
and writes the result as a flat table. A guess is an array lookup.

**A word's position on the map is split in two.** Its angle depends on what it
means and is the same in every puzzle, so it ships once in `layout.bin`. Its
distance from the centre is a pure function of its rank today, so the client
derives it. That leaves 6 bytes per word per puzzle instead of the 14 you need
if you store x/y per puzzle, and the expensive layout step runs once rather than
once per answer.

**Rank drives the feedback, not the raw score.** A cosine of 0.31 means nothing
to a player. "The 40th closest word out of 60,000" does.

```
web/public/data/
  manifest.json        format version, word count, epoch, provenance
  vocab.json           60,000 guessable words, most frequent first
  layout.bin           float16 pairs: angle, radial jitter        (240 KB)
  puzzles/p<N>.bin     one similarity table per puzzle            (360 KB each)
```

Puzzle file layout, little-endian:

| offset | type | meaning |
|---|---|---|
| 0 | char[4] | magic `BPP1` |
| 4 | uint16 | format version |
| 6 | uint16 | record size (6) |
| 8 | uint32 | word count |
| 12 | uint32 | vocab index of the answer |
| 16+ | uint32, float16 | vocab index, cosine similarity — sorted best first |

A record's position **is** its rank, so there is nothing to sort at runtime.

### Repository layout

```
tools/
  build_data.py        GloVe -> vocab.json, layout.bin, puzzles/*.bin
  answers.txt          curated answer list, one word per line
  check_answers.py     validates answers.txt against the built vocabulary
  wordfilters.py       blocked words and function words
web/
  src/game/            format, geometry, schedule, hints, bands, storage
  src/plot/            canvas renderer and camera
  src/ui/              guess list, form, panels, share text
  scripts/             render-preview.ts — rasterises the board to PNG
```

## Design decisions worth knowing

**Answers are hand-picked.** Every heuristic tried on this corpus produced
answers like `spokesman` and `ministry` — GloVe 6B is Wikipedia plus newswire and
it shows. `tools/answers.txt` is the curated list; `check_answers.py` verifies
each entry is guessable and common enough to be fair. Semantle and Pimantle
hand-pick for the same reason.

**Slurs are removed, not warned about.** The reference implementations keep
offensive words guessable and show a warning. For a consumer brand that is not a
trade worth making, so `tools/wordfilters.py` strips them from the vocabulary
entirely — they cannot be guessed, hinted, or plotted. **The current list is a
starting point.** Before launch, replace it with a maintained dataset and have
someone whose job it is review it.

**No emoji-grid share.** The share text is a closeness trajectory. The 5×6
grid-of-coloured-tiles format is the specific thing the New York Times has
pursued Wordle clones over; avoiding it costs nothing.

**Rank is never carried by colour alone.** Every guess shows a band name, a pip
meter and, inside the top 1,000, the number. The board is keyboard-operable and
guess results go to a live region (WCAG 1.4.1, 2.1.1).

**Nothing leaves the device.** Progress is in IndexedDB. No account, no
analytics, no backend. That is also the cheapest possible answer to UK GDPR and
PECR for a first release — the moment you add analytics you need a consent
banner, and the moment you add multiplayer you are processing IP addresses.

## Verifying it

```bash
cd web && npm test
```

71 tests. The unit tests cover the binary reader, rank bands, hint bisection,
daily rollover (including a DST-boundary case) and the share text.
`data.integration.test.ts` runs the real client code over all 216 built puzzle
files and checks each one parses, ranks every word exactly once, orders
similarity monotonically, and agrees with the answer the pipeline recorded.

To look at the board without a browser:

```bash
node scripts/render-preview.ts 75 5    # puzzle 75 at 5x zoom -> preview/*.png
```

This rasterises the dust layer using the real geometry module. It is a check on
the *layout*, not on the canvas code — compositing, camera and interaction are
only exercised in a browser.

## Licensing and provenance

- **Word vectors:** GloVe 6B 300d, Stanford NLP, published under the Open Data
  Commons Public Domain Dedication and Licence (PDDL) v1.0. Chosen specifically
  because it is the only mainstream option with a clean commercial chain of
  title: fastText's vectors are CC BY-SA (share-alike could reach the derived
  similarity tables), ConceptNet Numberbatch likewise, and Google's word2vec
  vectors were never given a clear licence.
- **No third-party game code.** This is a clean-room implementation written from
  a description of the mechanic. Game rules and systems are not protected by
  copyright; the code, data files and assets of other implementations are. In
  particular, `jsettlem/pimantle` carries **no licence at all** (all rights
  reserved) and Semantle itself is **GPLv3** — copying from either would be a
  problem, in opposite directions.
- **Dependencies:** React, Vite, Vitest and idb-keyval, all MIT or Apache-2.0.

### Naming

`Closer` is a placeholder. Before it goes anywhere public it needs an availability
search on the UK IPO and EUIPO registers. Avoid anything in the `-le` / `-antle`
family: it invites association with Wordle and Semantle, and the NYT has been
willing to send takedowns over exactly that.

## Known gaps

- **Not verified in a browser.** The logic, data and layout are tested; the
  canvas compositing, camera and touch handling are not. Run `npm run dev` and
  look at it.
- **Dark theme only.** The renderer's additive blending assumes a dark
  background; a light theme needs the dust layer re-tuned, not just new CSS.
- **216 answers.** Roughly seven months. Extend `tools/answers.txt` and rebuild.
- **The answer is in the client.** As in every game of this kind, the puzzle file
  contains the answer and anyone can read it. Future puzzles are also
  downloadable once built. Moving scoring behind an API is the only real fix, and
  it is a genuine architectural choice, not a bug.
- **Angles come from a 2-component PCA.** It measurably clusters related words,
  but t-SNE or UMAP would cluster harder. `compute_layout` in `build_data.py` is
  the only thing to change.
