import { useEffect, useState } from "react";

import { loadSolved } from "../game/storage";

type Props = {
  todayNumber: number;
  activeNumber: number;
};

const PAGE = 60;

/**
 * Past puzzles. Only ones strictly before today are listed - schedule.ts
 * enforces the same rule, so a hand-typed ?puzzle= cannot reach a future word.
 */
export default function ArchivePanel({ todayNumber, activeNumber }: Props) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [solved, setSolved] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      const numbers = Array.from({ length: todayNumber }, (_, i) => todayNumber - 1 - i)
        .slice(0, limit);
      const results = await Promise.all(
        numbers.map(async (n) => [n, await loadSolved(n)] as const),
      );
      if (cancelled) return;
      setSolved(new Set(results.filter(([, at]) => at !== null).map(([n]) => n)));
    })();

    return () => {
      cancelled = true;
    };
  }, [open, limit, todayNumber]);

  if (todayNumber <= 0) return null;

  const numbers = Array.from({ length: todayNumber }, (_, i) => todayNumber - 1 - i)
    .slice(0, limit);

  return (
    <section className="panel panel-archive">
      <button
        type="button"
        className="button-ghost archive-toggle"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        Past words ({todayNumber})
      </button>

      {open && (
        <>
          <ul className="archive-grid">
            {numbers.map((number) => (
              <li key={number}>
                <a
                  href={`?puzzle=${number}`}
                  className={`archive-chip${
                    solved.has(number) ? " is-solved" : ""
                  }${number === activeNumber ? " is-active" : ""}`}
                  aria-current={number === activeNumber ? "page" : undefined}
                  aria-label={`Puzzle ${number}${
                    solved.has(number) ? ", solved" : ""
                  }`}
                >
                  {number}
                </a>
              </li>
            ))}
          </ul>
          {limit < todayNumber && (
            <button
              type="button"
              className="button-ghost"
              onClick={() => setLimit((value) => value + PAGE)}
            >
              Show older
            </button>
          )}
        </>
      )}
    </section>
  );
}
