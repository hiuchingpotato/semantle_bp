import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { describeGuess } from "./bands";
import { projectAll } from "./geometry";
import { hintAvailability } from "./hints";
import {
  buildWordIndex,
  fetchLayout,
  fetchManifest,
  fetchPuzzle,
  fetchVocabulary,
  normaliseGuess,
} from "./loader";
import { readRequestedPuzzle, resolveSchedule } from "./schedule";
import {
  EMPTY_STATS,
  findSolve,
  recordSolve,
  recordStart,
  summarise,
  type StatsRecord,
  type StatsSummary,
} from "./stats";
import {
  loadProgress,
  loadSolved,
  loadStartedAt,
  loadStats,
  markSolved,
  markStarted,
  saveProgress,
  saveStats,
} from "./storage";
import type { Guess, Manifest, Puzzle, SavedProgress } from "./types";

export type GameStatus = "loading" | "ready" | "error";

export type GameState = {
  status: GameStatus;
  error: string | null;
  manifest: Manifest | null;
  puzzle: Puzzle | null;
  vocabulary: string[];
  positions: { xs: Float32Array; ys: Float32Array } | null;
  guesses: Guess[];
  /** Most recently played word, whether new, repeated or revealed. */
  focus: Guess | null;
  solved: boolean;
  isArchive: boolean;
  todayNumber: number;
  exhausted: boolean;
  /** Transient feedback for the input box. */
  notice: string | null;
  /** Text for the screen-reader live region. */
  announcement: string;
  submitGuess: (raw: string) => void;
  takeHint: () => void;
  hint: ReturnType<typeof hintAvailability>;
  /** Games played and streaks, across every puzzle. */
  stats: StatsSummary;
  /** Seconds from first guess to solve, once solved. */
  elapsedSeconds: number | null;
  /** True while the congratulations modal should be on screen. */
  showWin: boolean;
  dismissWin: () => void;
  reopenWin: () => void;
};

export function useGame(now: Date = new Date()): GameState {
  const [status, setStatus] = useState<GameStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [positions, setPositions] = useState<{
    xs: Float32Array;
    ys: Float32Array;
  } | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [focus, setFocus] = useState<Guess | null>(null);
  const [solved, setSolved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [schedule, setSchedule] = useState({
    today: 0,
    active: 0,
    isArchive: false,
    exhausted: false,
  });
  const [stats, setStats] = useState<StatsRecord>(EMPTY_STATS);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [showWin, setShowWin] = useState(false);

  const wordIndex = useMemo(() => buildWordIndex(vocabulary), [vocabulary]);
  const statsRef = useRef<StatsRecord>(EMPTY_STATS);
  statsRef.current = stats;
  // When the first guess of this puzzle happened. Set on load if the player is
  // resuming, otherwise on their first guess.
  const startedAtRef = useRef<Date | null>(null);
  // Guess submission reads the current board; a ref keeps the callback stable
  // so the input box doesn't re-subscribe on every keystroke.
  const guessesRef = useRef<Guess[]>([]);
  guessesRef.current = guesses;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loadedManifest = await fetchManifest();
        if (cancelled) return;

        const resolved = resolveSchedule(
          loadedManifest.epoch,
          loadedManifest.puzzleCount,
          now,
          readRequestedPuzzle(window.location.search),
        );

        const [loadedVocabulary, layout, loadedPuzzle] = await Promise.all([
          fetchVocabulary(),
          fetchLayout(loadedManifest.wordCount),
          fetchPuzzle(resolved.active, loadedManifest),
        ]);
        if (cancelled) return;

        const projected = projectAll(
          loadedPuzzle.indexByRank,
          layout,
          loadedManifest.wordCount,
        );

        const [saved, wasSolved, startedAt, loadedStats] = await Promise.all([
          loadProgress(resolved.active),
          loadSolved(resolved.active),
          loadStartedAt(resolved.active),
          loadStats(),
        ]);
        if (cancelled) return;
        startedAtRef.current = startedAt;

        const lookup = buildWordIndex(loadedVocabulary);
        const restored: Guess[] = [];
        for (const entry of saved) {
          const vocabIndex = lookup.get(entry.word);
          if (vocabIndex === undefined) continue;
          const rank = loadedPuzzle.rankByVocabIndex[vocabIndex];
          if (rank === undefined || rank < 0) continue;
          restored.push({
            vocabIndex,
            word: entry.word,
            rank,
            similarity: loadedPuzzle.similarityByRank[rank] ?? 0,
            turn: entry.turn,
            revealed: entry.revealed,
          });
        }
        restored.sort((a, b) => a.turn - b.turn);

        setManifest(loadedManifest);
        setSchedule(resolved);
        setVocabulary(loadedVocabulary);
        setPuzzle(loadedPuzzle);
        setPositions(projected);
        setGuesses(restored);
        // Frame the board on the best word already played, so resuming a game
        // picks up where it left off rather than zoomed all the way out.
        const best = [...restored].sort((a, b) => a.rank - b.rank)[0];
        if (best) setFocus(best);

        const alreadySolved =
          wasSolved !== null || restored.some((g) => g.rank === 0);
        setStats(loadedStats);
        setSolved(alreadySolved);
        // A puzzle solved in an earlier session keeps its recorded time rather
        // than recomputing from a stale clock. The modal stays closed - it is a
        // reward for the moment of solving, not something to greet you on every
        // reload; SolvedPanel has a button to bring it back.
        if (alreadySolved) {
          setElapsedSeconds(findSolve(loadedStats, resolved.active)?.seconds ?? null);
        }
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately runs once: the puzzle of the day is fixed for the session,
    // and `now` is only injected so tests can pin the date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((puzzleNumber: number, next: Guess[]) => {
    const payload: SavedProgress[] = next.map((guess) => ({
      word: guess.word,
      turn: guess.turn,
      revealed: guess.revealed,
    }));
    void saveProgress(puzzleNumber, payload);
  }, []);

  const play = useCallback(
    (word: string, vocabIndex: number, revealed: boolean) => {
      if (!puzzle) return;

      const rank = puzzle.rankByVocabIndex[vocabIndex];
      if (rank === undefined || rank < 0) {
        setNotice(`"${word}" isn't in this puzzle`);
        return;
      }

      const existing = guessesRef.current.find((guess) => guess.word === word);
      if (existing) {
        // Re-guessing is not an error; centre the board on it and say so.
        setFocus(existing);
        setNotice(`Already played "${word}"`);
        setAnnouncement(describeGuess(word, existing.rank, existing.similarity));
        return;
      }

      const played: Guess = {
        vocabIndex,
        word,
        rank,
        similarity: puzzle.similarityByRank[rank] ?? 0,
        turn: guessesRef.current.length + 1,
        revealed,
      };

      const next = [...guessesRef.current, played];
      guessesRef.current = next;
      setGuesses(next);
      setFocus(played);
      setNotice(null);
      setAnnouncement(describeGuess(word, rank, played.similarity));
      persist(puzzle.number, next);

      const at = new Date();
      if (!startedAtRef.current) {
        startedAtRef.current = at;
        void markStarted(puzzle.number, at);
        const started = recordStart(statsRef.current, puzzle.number);
        statsRef.current = started;
        setStats(started);
        void saveStats(started);
      }

      if (rank === 0) {
        const seconds = Math.round(
          (at.getTime() - (startedAtRef.current ?? at).getTime()) / 1000,
        );
        setSolved(true);
        setElapsedSeconds(seconds);
        setShowWin(true);
        void markSolved(puzzle.number, at);

        const recorded = recordSolve(statsRef.current, {
          puzzle: puzzle.number,
          guesses: next.length,
          hints: next.filter((guess) => guess.revealed).length,
          seconds,
          solvedAt: at.toISOString(),
        });
        statsRef.current = recorded;
        setStats(recorded);
        void saveStats(recorded);
      }
    },
    [persist, puzzle],
  );

  const submitGuess = useCallback(
    (raw: string) => {
      const word = normaliseGuess(raw);
      if (!word) return;

      const vocabIndex = wordIndex.get(word);
      if (vocabIndex === undefined) {
        setNotice(`"${word}" isn't a word I know`);
        setAnnouncement(`${word} is not in the word list.`);
        return;
      }
      play(word, vocabIndex, false);
    },
    [play, wordIndex],
  );

  const hint = useMemo(() => hintAvailability(guesses), [guesses]);

  // Stable identities. WinModal keys its focus-trap effect on onClose, so a new
  // function every render would tear the effect down and re-run it constantly -
  // and its cleanup restores focus, which would yank focus out of the dialog on
  // every keystroke.
  const dismissWin = useCallback(() => setShowWin(false), []);
  const reopenWin = useCallback(() => setShowWin(true), []);

  const takeHint = useCallback(() => {
    if (!puzzle || !hint.available) return;
    const vocabIndex = puzzle.indexByRank[hint.targetRank];
    if (vocabIndex === undefined) return;
    const word = vocabulary[vocabIndex];
    if (word === undefined) return;
    play(word, vocabIndex, true);
  }, [hint, play, puzzle, vocabulary]);

  return {
    status,
    error,
    manifest,
    puzzle,
    vocabulary,
    positions,
    guesses,
    focus,
    solved,
    isArchive: schedule.isArchive,
    todayNumber: schedule.today,
    exhausted: schedule.exhausted,
    notice,
    announcement,
    submitGuess,
    takeHint,
    hint,
    stats: summarise(stats, schedule.today),
    elapsedSeconds,
    showWin,
    dismissWin,
    reopenWin,
  };
}
