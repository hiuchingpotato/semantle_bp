import { useGame } from "./game/useGame";
import OrbitField from "./plot/OrbitField";
import AboutPanel from "./ui/AboutPanel";
import Calendar from "./ui/Calendar";
import GuessForm from "./ui/GuessForm";
import GuessList from "./ui/GuessList";
import SolvedPanel from "./ui/SolvedPanel";
import StatsButton from "./ui/StatsButton";
import StatsModal from "./ui/StatsModal";
import WinModal from "./ui/WinModal";

export default function App() {
  const game = useGame();

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
            />
          )}

          <GuessList guesses={game.guesses} focus={game.focus} />

          {/* Directly under the words played, so the input travels with the
              list rather than being pinned away from it. */}
          {!game.solved && (
            <GuessForm
              disabled={false}
              notice={game.notice}
              hint={game.hint}
              onSubmit={game.submitGuess}
              onHint={game.takeHint}
            />
          )}

          <StatsButton stats={game.stats} onOpen={game.openStats} />

          {game.manifest && (
            <Calendar
              epoch={game.manifest.epoch}
              todayNumber={game.todayNumber}
              activeNumber={game.puzzle.number}
              stats={game.statsRecord}
            />
          )}
          <AboutPanel manifest={game.manifest} />
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

      {game.showStats && (
        <StatsModal stats={game.stats} onClose={game.dismissStats} />
      )}

      {/* Single live region for guess results, so a screen reader hears the
          outcome without having to go looking for the new row. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {game.announcement}
      </p>
    </div>
  );
}
