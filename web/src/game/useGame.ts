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
import { loadProgress, loadSolved, markSolved, saveProgress } from "./storage";
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

  const wordIndex = useMemo(() => buildWordIndex(vocabulary), [vocabulary]);
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

        const saved = await loadProgress(resolved.active);
        const wasSolved = await loadSolved(resolved.active);
        if (cancelled) return;

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
        setSolved(wasSolved !== null || restored.some((g) => g.rank === 0));
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

      if (rank === 0) {
        setSolved(true);
        void markSolved(puzzle.number, new Date());
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
  };
}
