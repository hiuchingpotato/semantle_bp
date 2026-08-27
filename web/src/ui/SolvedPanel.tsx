import { useEffect, useState } from "react";

import { nextRollover } from "../game/schedule";
import { formatDuration } from "../game/stats";
import type { Guess } from "../game/types";
import { buildShareText, sparkline } from "./share";
import { useCopyResult } from "./useCopyResult";

type Props = {
  puzzleNumber: number;
  guesses: readonly Guess[];
  wordCount: number;
  secretWord: string;
  isArchive: boolean;
  elapsedSeconds: number | null;
  gaveUp: boolean;
};

function useCountdown(target: Date): string {
  const [remaining, setRemaining] = useState(() => target.getTime() - Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(target.getTime() - Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  const clamped = Math.max(0, remaining);
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/**
 * The persistent record in the rail, once the win dialog has been dismissed.
 *
 * Share copies straight from here rather than reopening the dialog: the player
 * has already seen it, and making them reopen a modal to reach a button is a
 * step for nothing.
 */
export default function SolvedPanel({
  puzzleNumber,
  guesses,
  wordCount,
  secretWord,
  isArchive,
  elapsedSeconds,
  gaveUp,
}: Props) {
  const countdown = useCountdown(nextRollover(new Date()));
  const hints = guesses.filter((guess) => guess.revealed).length;
  const { copied, copy } = useCopyResult(
    buildShareText({
      puzzleNumber,
      guesses: guesses.length,
      hints,
      seconds: elapsedSeconds,
      gaveUp,
    }),
  );

  return (
    <section
      className={`panel panel-solved${gaveUp ? " is-gaveup" : ""}`}
      aria-labelledby="solved-heading"
    >
      <h2 id="solved-heading">
        {gaveUp ? "Gave up" : "Solved"} &mdash; puzzle {puzzleNumber}
      </h2>
      <p className="solved-word">{secretWord}</p>
      <p className="solved-summary">
        {gaveUp && "answer revealed after "}
        {guesses.length} {guesses.length === 1 ? "word" : "words"}
        {elapsedSeconds !== null && ` · ${formatDuration(elapsedSeconds)}`}
        {hints > 0 && ` · ${hints} ${hints === 1 ? "hint" : "hints"}`}
      </p>
      <p className="solved-spark" aria-hidden="true">
        {sparkline(guesses, wordCount)}
      </p>

      {/* Statistics lives above the calendar now, reachable whether or not
          today has been finished, so it is not repeated here. */}
      <div className="solved-actions">
        <button type="button" className="button-primary" onClick={copy}>
          {copied ? "Copied!" : "Share result"}
        </button>
      </div>

      <p className="solved-share-note" role="status">
        {copied ? "Copied — paste it to your friends." : ""}
      </p>

      {!isArchive && (
        <p className="countdown">
          Next word in <time>{countdown}</time>
        </p>
      )}
    </section>
  );
}
