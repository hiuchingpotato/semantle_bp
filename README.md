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

# 3. English word list, for deciding what counts as guessable (4MB)
curl -sL -o .tooling/words_alpha.txt \
  "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"

# 4. Spoken-word frequency, for deciding what is common enough to hint (20MB)
curl -sL -o .tooling/everyday_en.txt \
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt"
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

### Marker artwork

Source art lives in `assets/images` at roughly 950x1725. The board draws it at
28-34px, so `tools/build_markers.sh` resamples it to 160px tall into
`web/public/markers` — 852KB down to 124KB, and a cleaner result than asking the
browser to scale 1725px to 34px in one step. Re-run it after changing the art.

Which character appears for which rank is the table at the top of
`web/src/plot/markers.ts`; the display size is two constants below it.

### Repository layout

```
assets/images/         source marker artwork, full resolution
tools/
  build_markers.sh     resample markers -> web/public/markers
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

**What counts as a guessable word is frequency *or* dictionary.** Frequency
alone is a bad test: by 60,000 tokens into GloVe it is four-fifths surnames,
place names and acronyms, while ordinary English like `quiche` (63,848th) and
`cremate` (83,572nd) is still below the line. Cutting shallow enough to exclude
the junk also excludes words people type. So the vocabulary is the most frequent
30,000 tokens plus every deeper token a dictionary recognises — 105,187 words.

**Guessing and hinting use different lists.** Guessing accepts anything real.
A hint is the game speaking, so it has to be a word the player plausibly knows —
offering `chippewa` for *kettle* is worse than offering nothing. Neither
frequency nor a dictionary sorts this out alone: Wikipedia frequency, which
orders the vocabulary, ranks American place names above household words, and the
big word lists carry proper nouns as plain lowercase entries. Two signals
together do work — a British word list that **preserves capitalisation**, so an
entry that only ever appears capitalised is a proper noun, and spoken-word
frequency, which knows nobody says `mesozoic`. 41,508 of the 105,187 words are
hintable. Erring strict is deliberate: a word missing from the hint pool is
still guessable, while one bad hint is visible and irritating.

**The word list is British on purpose.** SCOWL `en_GB`, with Americanisms
removed — `courgette` and `aubergine` are in it. It is committed at
`tools/wordlists/british_en.txt` rather than fetched, so builds do not depend on
a live generator, and **its capitalisation is load-bearing**: lowercasing that
file would silently destroy proper-noun detection.

**Closed compounds get their own pass.** `fairytale` has a vector and people
type it, but no dictionary lists it — they carry "fairy tale" and "fairy-tale".
Splitting on its own is far too loose: 34,000 tokens split into two real words,
and most are surnames and places, because English place names are built the same
way as compounds (`grantham` = grant + ham). Requiring both halves to be four
letters or more, *and* the whole to be something people actually say, cuts that
to about a hundred — `storybook`, `sleepover`, `voicemail`, `breadcrumbs`. These
are guessable only, never hintable: they have not passed the hint pool's tests.

**A word with no vector cannot be scored at all.** GloVe 6B is 2014 Wikipedia
and US newswire, so a few real words are simply absent — `courgette` and
`serviette` have no vector, and nothing in the pipeline can invent one. Being
rejected is at least honest; scoring them would mean guessing. Swapping to a
larger embedding is the only real fix, and it is a data change, not a code one.

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

**A streak means turning up, not catching up.** Only a puzzle solved on its own
day builds a streak. Past days stay open and keep a full record when finished,
but they cannot repair a gap - `onTime` is stamped on the solve from the clock at
the moment of solving, not inferred later. Puzzle #0 is 18 August 2026 and a new
one unlocks at local midnight whether or not anyone opened the game.

**British and American spellings score identically.** The corpus is American -
`flavor` ranks 7,664th by frequency and `flavour` 29,943rd - so without this a UK
player typing `flavour` lands in a worse band for the same idea. `build_aliases`
generates candidates from suffix rules and then validates every one against the
embedding, which is what makes the rules safe to keep loose: `timbre -> timber`
and `poured -> pored` are rejected by the data rather than by anyone remembering
to exclude them. Pairs whose senses have genuinely drifted apart -
`storey/story`, `draught/draft` - are also left alone. The typed spelling is
always what gets displayed back.

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

## Deploying

Pushing to `main` triggers `.github/workflows/deploy.yml`, which regenerates the
game data from GloVe, runs the tests, builds the site and publishes it to GitHub
Pages.

The data is not committed — 75MB of binaries would sit in git history forever and
every rebuild would add another copy. CI downloads the vectors once and caches
them, so only the first run pays the 862MB download.

**One-time setup:** in the repo, go to *Settings → Pages → Build and deployment*
and set **Source** to **GitHub Actions**. Without this the workflow builds and
then fails at the deploy step.

The base path is set by `PAGES_BASE` in the workflow and must match the repo
name. Rename the repo and you must change it, or every asset 404s.

### What deploying implies

Publishing the site publishes the answers. Each puzzle file contains its own
answer in the header, and future puzzles are downloadable as soon as they are
built. This is true of every game in this genre — it is why the honour system is
the actual mechanic. Moving scoring behind an API is the only real fix.
