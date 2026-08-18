import { useMemo, useState } from "react";

import { dateForPuzzle, puzzleForDate } from "../game/schedule";
import { puzzleState, type PuzzleState, type StatsRecord } from "../game/stats";

type Props = {
  epoch: string;
  todayNumber: number;
  activeNumber: number;
  stats: StatsRecord;
};

// Monday first: this is a British product.
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const STATE_LABEL: Record<PuzzleState, string> = {
  solved: "solved on the day",
  replayed: "solved later",
  started: "in progress",
  unplayed: "not played",
  locked: "not available yet",
};

/** Monday-based weekday index, 0-6. */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/**
 * Month view of the puzzle schedule.
 *
 * Replaces a grid of puzzle numbers. A number means nothing to a player -
 * "puzzle 12" is not a memory, but "last Tuesday" is - and a calendar also makes
 * the shape of a streak visible: the gaps are the point.
 */
export default function Calendar({
  epoch,
  todayNumber,
  activeNumber,
  stats,
}: Props) {
  const today = useMemo(() => dateForPuzzle(epoch, todayNumber), [epoch, todayNumber]);
  const [month, setMonth] = useState(() => startOfMonth(today));

  const firstDate = useMemo(() => dateForPuzzle(epoch, 0), [epoch]);
  const canGoBack = startOfMonth(firstDate) < month;
  const canGoForward = month < startOfMonth(today);

  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate();

    // Blank leaders so the 1st lands under the right weekday.
    const out: Array<{ date: Date; puzzle: number } | null> = Array.from(
      { length: weekdayIndex(first) },
      () => null,
    );
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      out.push({ date, puzzle: puzzleForDate(epoch, date) });
    }
    return out;
  }, [epoch, month]);

  return (
    <section className="panel panel-calendar" aria-labelledby="calendar-heading">
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-nav"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          disabled={!canGoBack}
          aria-label="Previous month"
        >
          &lsaquo;
        </button>
        <h2 id="calendar-heading">{MONTH_FORMAT.format(month)}</h2>
        <button
          type="button"
          className="calendar-nav"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          disabled={!canGoForward}
          aria-label="Next month"
        >
          &rsaquo;
        </button>
      </div>

      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((day, index) => (
          <div key={index} className="calendar-weekday" aria-hidden="true">
            {day}
          </div>
        ))}

        {cells.map((cell, index) => {
          if (!cell) return <div key={`pad-${index}`} className="calendar-pad" />;

          const { date, puzzle } = cell;
          const state = puzzleState(stats, puzzle, todayNumber);
          const isToday = puzzle === todayNumber;
          const isActive = puzzle === activeNumber;
          const label = `${DAY_FORMAT.format(date)} — ${STATE_LABEL[state]}`;

          if (state === "locked") {
            return (
              <div
                key={puzzle}
                className="calendar-day is-locked"
                aria-label={label}
                title={label}
              >
                {date.getDate()}
              </div>
            );
          }

          return (
            <a
              key={puzzle}
              href={isToday ? "./" : `?puzzle=${puzzle}`}
              className={`calendar-day is-${state}${isToday ? " is-today" : ""}${
                isActive ? " is-active" : ""
              }`}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              title={label}
            >
              {date.getDate()}
            </a>
          );
        })}
      </div>

      <ul className="calendar-key">
        <li>
          <span className="key-swatch is-solved" aria-hidden="true" />
          Solved
        </li>
        <li>
          <span className="key-swatch is-replayed" aria-hidden="true" />
          Caught up
        </li>
        <li>
          <span className="key-swatch is-started" aria-hidden="true" />
          Started
        </li>
      </ul>

      <p className="calendar-note">
        A new word unlocks at midnight. Past days stay open to play, but only a
        word solved on its own day counts towards your streak.
      </p>
    </section>
  );
}
