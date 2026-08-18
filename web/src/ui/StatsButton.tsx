import type { StatsSummary } from "../game/stats";

type Props = {
  stats: StatsSummary;
  onOpen: () => void;
};

/** Short summary for the closed row, so the button is not silent. */
function peek(stats: StatsSummary): string {
  if (stats.played === 0) return "no games yet";
  if (stats.currentStreak > 0) {
    return `${stats.currentStreak} day streak`;
  }
  return `${stats.played} played`;
}

/**
 * Opens the statistics dialog.
 *
 * Sits above the calendar rather than only appearing once a puzzle is solved:
 * a player who has not finished today still has a record, and looking it up
 * should not require winning first.
 */
export default function StatsButton({ stats, onOpen }: Props) {
  return (
    <section className="panel panel-stats-button">
      <button type="button" className="panel-toggle" onClick={onOpen}>
        <span>Statistics</span>
        <span className="panel-peek">{peek(stats)}</span>
      </button>
    </section>
  );
}
