import { useState } from "react";

import { useGame } from "./game/useGame";
import OrbitField from "./plot/OrbitField";
import AboutModal from "./ui/AboutModal";
import Calendar from "./ui/Calendar";
import ConfirmModal from "./ui/ConfirmModal";
import GuessForm from "./ui/GuessForm";
import GuessList from "./ui/GuessList";
import SolvedPanel from "./ui/SolvedPanel";
import StatsButton from "./ui/StatsButton";
import StatsModal from "./ui/StatsModal";
import WinModal from "./ui/WinModal";
import { usePageZoomGuard } from "./ui/usePageZoomGuard";

export default function App() {
  const game = useGame();
  usePageZoomGuard();
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  if (game.status === "loading") {
    return (
      <div className="boot" role="status">
        <span className="boot-pulse" aria-hidden="true" />
        Loading today&rsquo;s word map&hellip;
      </div>
    );
  }

  if (game.status === "error" || !game.puzzle || !game.positions) {
    return (
      <div className="boot boot-error" role="alert">
        <h1>Something went wrong</h1>
        <p>{game.error ?? "The puzzle data could not be loaded."}</p>
        <p className="fineprint">
          If you are running this locally, check that{" "}
          <code>web/public/data</code> has been built &mdash; see{" "}
          <code>tools/build_data.py</code>.
        </p>
      </div>
    );
  }

  const secretWord = game.vocabulary[game.puzzle.secretIndex] ?? "";

  return (
    <div className="app">
      <OrbitField
        xs={game.positions.xs}
        ys={game.positions.ys}
        wordCount={game.puzzle.wordCount}
        guesses={game.guesses}
        focus={game.focus}
        solved={game.solved}
        secretWord={secretWord}
      />

      <header className="app-header">
        <h1 className="wordmark">
          Closer
          <span className="puzzle-number">#{game.puzzle.number}</span>
        </h1>
        {game.isArchive && (
          <p className="archive-flag">
            Past puzzle &middot; <a href="./">back to today</a>
          </p>
        )}
        {game.exhausted && !game.isArchive && (
          <p className="archive-flag">
            You have reached the last built puzzle &mdash; run the data pipeline
            for more.
          </p>
        )}
        <button
          type="button"
          className="help-button"
          onClick={game.openAbout}
          aria-label="How this works"
          title="How this works"
        >
          ?
        </button>
      </header>

      <main className="rail" aria-label="Your words">
        <div className="rail-scroll">
          {game.solved && (
            <SolvedPanel
              puzzleNumber={game.puzzle.number}
              guesses={game.guesses}
              wordCount={game.puzzle.wordCount}
              secretWord={secretWord}
              isArchive={game.isArchive}
              elapsedSeconds={game.elapsedSeconds}
              gaveUp={game.gaveUp}
            />
          )}

          {/* Above the list, so the closest match sits directly beneath the
              input rather than at the far end of a long column. */}
          {!game.solved && (
            <GuessForm
              disabled={false}
              notice={game.notice}
              hint={game.hint}
              onSubmit={game.submitGuess}
              onHint={game.takeHint}
              onGiveUp={() => setConfirmGiveUp(true)}
            />
          )}

          <GuessList guesses={game.guesses} focus={game.focus} />

          <StatsButton stats={game.stats} onOpen={game.openStats} />

          {game.manifest && (
            <Calendar
              epoch={game.manifest.epoch}
              todayNumber={game.todayNumber}
              activeNumber={game.puzzle.number}
              stats={game.statsRecord}
            />
          )}
        </div>
      </main>

      {game.solved && game.showWin && (
        <WinModal
          puzzleNumber={game.puzzle.number}
          secretWord={secretWord}
          guesses={game.guesses}
          elapsedSeconds={game.elapsedSeconds}
          stats={game.stats}
          isArchive={game.isArchive}
          onClose={game.dismissWin}
        />
      )}

      {confirmGiveUp && (
        <ConfirmModal
          title="Give up?"
          body="Are you sure you want to give up? You will lose your streak."
          confirmLabel="Yes, reveal it"
          cancelLabel="No, keep playing"
          onConfirm={() => {
            setConfirmGiveUp(false);
            game.confirmGiveUp();
          }}
          onCancel={() => setConfirmGiveUp(false)}
        />
      )}

      {game.showStats && (
        <StatsModal stats={game.stats} onClose={game.dismissStats} />
      )}

      {game.showAbout && (
        <AboutModal manifest={game.manifest} onClose={game.dismissAbout} />
      )}

      {/* Single live region for guess results, so a screen reader hears the
          outcome without having to go looking for the new row. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {game.announcement}
      </p>
    </div>
  );
}
