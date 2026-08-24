/** A word as the game knows it: its identity, how close it is, where it sits. */
export type WordEntry = {
  /** Index into the vocabulary. Stable across puzzles. */
  vocabIndex: number;
  word: string;
  /** Cosine similarity to the secret, -1..1. */
  similarity: number;
  /** 0 is the secret itself; higher is further away. */
  rank: number;
};

/** A word the player has put on the board, guessed or revealed. */
export type Guess = WordEntry & {
  /** 1-based order of entry, for the chronological view. */
  turn: number;
  /** True when the game revealed it rather than the player finding it. */
  revealed: boolean;
};

/** Per-word placement shared by every puzzle, indexed by vocab index. */
export type Layout = {
  /** Bearing in radians. Words with related meanings point the same way. */
  angles: Float32Array;
  /** Multiplier on the rank-derived radius, to break up the rank spiral. */
  jitter: Float32Array;
};

export type Manifest = {
  formatVersion: number;
  recordSize: number;
  headerSize: number;
  wordCount: number;
  puzzleCount: number;
  /** ISO date (YYYY-MM-DD) of puzzle #0. */
  epoch: string;
  vocabHash: string;
  /**
   * Cache key for every other data file. Absent in builds made before it
   * existed, which the loader treats as an unversioned URL.
   */
  dataVersion?: string;
  source: { vectors: string; licence: string; url: string };
};

/** Everything needed to play one puzzle, resolved and indexed. */
export type Puzzle = {
  number: number;
  secretIndex: number;
  wordCount: number;
  /** Vocab index at each rank. */
  indexByRank: Uint32Array;
  /** Similarity at each rank, descending. */
  similarityByRank: Float32Array;
  /** Rank of each vocab index, or -1 if absent. Built once for O(1) lookup. */
  rankByVocabIndex: Int32Array;
};

/** What the player has saved for a puzzle. Words only - ranks are re-derived. */
export type SavedProgress = {
  word: string;
  turn: number;
  revealed: boolean;
};
