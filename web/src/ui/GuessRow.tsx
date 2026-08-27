import { PIP_COUNT, bandForRank, formatRank, formatSimilarity } from "../game/bands";
import type { Guess } from "../game/types";

type Props = {
  guess: Guess;
  isFocus: boolean;
};

/**
 * One word on the board.
 *
 * Rank is carried three ways - the band name, the pip meter and, inside the top
 * thousand, the number. Colour is the fourth, never the only one.
 */
export default function GuessRow({ guess, isFocus }: Props) {
  const band = bandForRank(guess.rank);
  const rankLabel = formatRank(guess.rank);

  return (
    <li
      // The answer is set apart from the words that missed - larger type, not
      // just another colour, so it reads as the result rather than one more row.
      className={`guess-row tone-${band.tone}${isFocus ? " is-focus" : ""}${
        guess.revealed ? " is-revealed" : ""
      }${guess.rank === 0 ? " is-answer" : ""}`}
    >
      <span className="guess-turn" aria-hidden="true">
        {guess.turn}
      </span>
      <span className="guess-word">
        {guess.word}
        {guess.rank === 0 && (
          // Decoration on a row that already says "Solved" and is coloured and
          // sized differently, so it is hidden from screen readers rather than
          // read out as "fire".
          <span className="guess-flame" aria-hidden="true">
            🔥
          </span>
        )}
        {guess.revealed && <span className="guess-tag">hint</span>}
      </span>
      <span className="guess-similarity" title="Semantic similarity">
        {formatSimilarity(guess.similarity)}
      </span>
      <span className="guess-rank">{rankLabel ?? ""}</span>
      <span className="guess-band">
        <span className="guess-pips" aria-hidden="true">
          {Array.from({ length: PIP_COUNT }, (_, index) => (
            <span
              key={index}
              className={index < band.pips ? "pip is-on" : "pip"}
            />
          ))}
        </span>
        <span className="guess-band-label">{band.label}</span>
      </span>
    </li>
  );
}
