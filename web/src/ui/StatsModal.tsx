import type { StatsSummary } from "../game/stats";
import Modal from "./Modal";

type Props = {
  stats: StatsSummary;
  onClose: () => void;
};

/**
 * Overall record, across every puzzle.
 *
 * Deliberately says nothing about the puzzle in hand - no word, no guess count,
 * no time. That belongs to the win dialog; this is the running total, and it is
 * reachable whether or not today has been solved.
 */
export default function StatsModal({ stats, onClose }: Props) {
  return (
    <Modal titleId="stats-title" onClose={onClose} className="modal-stats-only">
      <h2 id="stats-title" className="modal-title modal-title-plain">
        Statistics
      </h2>

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

      <p className="modal-note">
        {stats.played === 0
          ? "Play a puzzle and your record starts here."
          : "A streak continues as long as you do not miss a day. Solving a past puzzle can repair one."}
      </p>

      <div className="modal-actions">
        <button type="button" className="button-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
