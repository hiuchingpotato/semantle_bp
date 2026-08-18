import { useEffect, useRef, useState } from "react";

import { formatDuration } from "../game/stats";
import type { StatsSummary } from "../game/stats";
import type { Guess } from "../game/types";
import { buildShareText, whatsAppUrl } from "./share";

type Props = {
  puzzleNumber: number;
  secretWord: string;
  guesses: readonly Guess[];
  elapsedSeconds: number | null;
  stats: StatsSummary;
  isArchive: boolean;
  onClose: () => void;
};

/**
 * The congratulations dialog.
 *
 * Implemented as a focus-trapped dialog rather than a floating div: a modal that
 * leaves focus behind it is unusable with a keyboard or a screen reader, and
 * this one appears at the exact moment the player wants to act on it.
 */
export default function WinModal({
  puzzleNumber,
  secretWord,
  guesses,
  elapsedSeconds,
  stats,
  isArchive,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);

  const hints = guesses.filter((guess) => guess.revealed).length;
  const shareText = buildShareText({
    puzzleNumber,
    guesses: guesses.length,
    hints,
    seconds: elapsedSeconds,
  });

  // The system share sheet only exists on mobile and in some desktop browsers,
  // and only over HTTPS. Checked once rather than per render so the buttons do
  // not change under the player's finger.
  const [canUseShareSheet] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  );

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Put focus back where the player left it, not at the top of the page.
      if (restoreFocusTo.current instanceof HTMLElement) {
        restoreFocusTo.current.focus();
      }
    };
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setShareError(null);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access is permission-gated and blocked outright in some
      // contexts. A prompt is ugly but it always works.
      window.prompt("Copy your result", shareText);
    }
  };

  const share = async () => {
    if (!canUseShareSheet) {
      window.open(whatsAppUrl(shareText), "_blank", "noopener,noreferrer");
      return;
    }
    try {
      await navigator.share({ title: "Closer", text: shareText });
      setShareError(null);
    } catch (cause) {
      // Dismissing the sheet rejects with AbortError. That is not a failure and
      // must not be reported as one.
      if (cause instanceof Error && cause.name === "AbortError") return;
      setShareError("Sharing was blocked - use Copy instead.");
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="win-title"
        ref={panelRef}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
          ref={closeRef}
        >
          &times;
        </button>

        <h2 id="win-title" className="modal-title">
          Congratulations!
        </h2>

        <p className="modal-lede">The word is</p>
        <p className="modal-word">{secretWord}</p>

        <dl className="modal-stats">
          <div>
            <dt>Played</dt>
            <dd>{stats.played}</dd>
          </div>
          <div>
            <dt>Current streak</dt>
            <dd>{stats.currentStreak}</dd>
          </div>
          <div>
            <dt>Max streak</dt>
            <dd>{stats.maxStreak}</dd>
          </div>
        </dl>

        <p className="modal-result">
          {guesses.length} {guesses.length === 1 ? "guess" : "guesses"}
          {elapsedSeconds !== null && ` · ${formatDuration(elapsedSeconds)}`}
          {` · ${hints} ${hints === 1 ? "hint" : "hints"}`}
        </p>

        {isArchive && (
          <p className="modal-note">
            Past puzzle &mdash; it counts towards your streak if it fills a gap.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="button-primary" onClick={share}>
            {canUseShareSheet ? "Share with friends" : "Share on WhatsApp"}
          </button>
          <button type="button" className="button-ghost" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="modal-share-note" role="status">
          {shareError ??
            (canUseShareSheet
              ? "Opens your share sheet - WhatsApp, Instagram, Messages."
              : "Instagram has no way to receive text from a link, so copy and paste it there.")}
        </p>
      </div>
    </div>
  );
}
