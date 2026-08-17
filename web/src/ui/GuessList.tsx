import { useState } from "react";

import type { Guess } from "../game/types";
import GuessRow from "./GuessRow";

type Props = {
  guesses: readonly Guess[];
  focus: Guess | null;
};

type SortMode = "closest" | "recent";

export default function GuessList({ guesses, focus }: Props) {
  const [sort, setSort] = useState<SortMode>("closest");

  const ordered = [...guesses].sort((a, b) =>
    sort === "closest" ? a.rank - b.rank : b.turn - a.turn,
  );

  if (guesses.length === 0) {
    return (
      <p className="empty-state">
        Type any word to begin. You will be told how close it is in meaning to
        the secret word &mdash; not how it is spelled.
      </p>
    );
  }

  return (
    <div className="guess-list">
      <div className="guess-list-head">
        <h2 className="visually-hidden">Your words</h2>
        <div
          className="segmented"
          role="group"
          aria-label="Sort words"
        >
          <button
            type="button"
            className={sort === "closest" ? "is-active" : ""}
            aria-pressed={sort === "closest"}
            onClick={() => setSort("closest")}
          >
            Closest
          </button>
          <button
            type="button"
            className={sort === "recent" ? "is-active" : ""}
            aria-pressed={sort === "recent"}
            onClick={() => setSort("recent")}
          >
            Recent
          </button>
        </div>
        <span className="guess-count">
          {guesses.length} {guesses.length === 1 ? "word" : "words"}
        </span>
      </div>

      <ol className="guess-rows">
        {ordered.map((guess) => (
          <GuessRow
            key={guess.word}
            guess={guess}
            isFocus={focus?.vocabIndex === guess.vocabIndex}
          />
        ))}
      </ol>
    </div>
  );
}
