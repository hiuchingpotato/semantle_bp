import { useEffect, useRef, useState } from "react";

import type { HintAvailability } from "../game/hints";

type Props = {
  disabled: boolean;
  notice: string | null;
  hint: HintAvailability;
  onSubmit: (word: string) => void;
  onHint: () => void;
  onGiveUp: () => void;
};

export default function GuessForm({
  disabled,
  notice,
  hint,
  onSubmit,
  onHint,
  onGiveUp,
}: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus on desktop only: on a phone this yanks the keyboard up over the
  // board before the player has seen it.
  useEffect(() => {
    if (window.matchMedia("(min-width: 900px)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  return (
    <form
      className="guess-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
        setValue("");
      }}
    >
      <div className="guess-input-row">
        <input
          ref={inputRef}
          type="text"
          className="guess-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Guess a word"
          aria-label="Guess a word"
          aria-describedby={notice ? "guess-notice" : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          enterKeyHint="go"
        />
        <button type="submit" className="button-primary" disabled={disabled}>
          Guess
        </button>
      </div>

      <div className="guess-form-foot">
        <button
          type="button"
          className="button-ghost"
          onClick={onHint}
          disabled={disabled || !hint.available}
          title={hint.available ? "Reveal a word half as far away" : hint.reason}
        >
          Hint
        </button>
        <span className="hint-status">
          {hint.available
            ? "Reveals a word half as far from the answer"
            : hint.reason}
        </span>

        {/* Last in the row and styled quietly: it is always available, but it
            should never be the obvious thing to press. */}
        <button
          type="button"
          className="button-ghost button-giveup"
          onClick={onGiveUp}
          disabled={disabled}
        >
          Give up
        </button>
      </div>

      {/* Errors are announced as well as shown - a silent shake helps nobody. */}
      <p
        id="guess-notice"
        className={notice ? "notice is-visible" : "notice"}
        role="status"
      >
        {notice ?? ""}
      </p>
    </form>
  );
}
