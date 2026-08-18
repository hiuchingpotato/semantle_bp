import { formatDuration } from "../game/stats";
import type { StatsSummary } from "../game/stats";
import type { Guess } from "../game/types";
import Modal from "./Modal";
import { buildShareText } from "./share";
import { useCopyResult } from "./useCopyResult";

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
 * Sharing is copy-to-clipboard. The system share sheet looks tidier but only
 * exists on some devices and only over HTTPS, so the same button behaved
 * differently for different players. Copying works everywhere and leaves the
 * player in control of where it goes - including Instagram, which cannot
 * receive text from a link at all.
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
  const hints = guesses.filter((guess) => guess.revealed).length;
  const { copied, copy } = useCopyResult(
    buildShareText({
      puzzleNumber,
      guesses: guesses.length,
      hints,
      seconds: elapsedSeconds,
    }),
  );

  return (
    <Modal titleId="win-title" onClose={onClose}>
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
        <button type="button" className="button-primary" onClick={copy}>
          {copied ? "Copied!" : "Share with friends"}
        </button>
        <button type="button" className="button-ghost" onClick={onClose}>
          Dismiss
        </button>
      </div>

      <p className="modal-share-note" role="status">
        {copied
          ? "Copied — paste it into WhatsApp, Instagram or anywhere else."
          : "Copies your result and a link to the game."}
      </p>
    </Modal>
  );
}
