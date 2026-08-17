import { useEffect, useState } from "react";

import { nextRollover } from "../game/schedule";
import type { Guess } from "../game/types";
import { buildShareText, sparkline } from "./share";

type Props = {
  puzzleNumber: number;
  guesses: readonly Guess[];
  wordCount: number;
  secretWord: string;
  isArchive: boolean;
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

export default function SolvedPanel({
  puzzleNumber,
  guesses,
  wordCount,
  secretWord,
  isArchive,
}: Props) {
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(nextRollover(new Date()));
  const hints = guesses.filter((guess) => guess.revealed).length;

  const copy = async () => {
    const text = buildShareText(puzzleNumber, guesses, wordCount);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard is permission-gated and blocked outright in some contexts.
      // Falling back to a prompt beats a button that silently does nothing.
      window.prompt("Copy your result", text);
    }
  };

  return (
    <section className="panel panel-solved" aria-labelledby="solved-heading">
      <h2 id="solved-heading">Solved</h2>
      <p className="solved-word">{secretWord}</p>
      <p className="solved-summary">
        {guesses.length} {guesses.length === 1 ? "word" : "words"}
        {hints > 0 && ` · ${hints} ${hints === 1 ? "hint" : "hints"}`}
      </p>
      <p className="solved-spark" aria-hidden="true">
        {sparkline(guesses, wordCount)}
      </p>

      <div className="solved-actions">
        <button type="button" className="button-primary" onClick={copy}>
          {copied ? "Copied" : "Copy result"}
        </button>
        {!isArchive && (
          <span className="countdown">
            Next word in <time>{countdown}</time>
          </span>
        )}
      </div>
    </section>
  );
}
