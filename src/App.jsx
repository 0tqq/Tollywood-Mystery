import { useMemo, useState } from "react";
import { useGame } from "./hooks/useGame.js";
import { useTheme } from "./hooks/useTheme.js";
import { buildIndex } from "./lib/search.js";
import { STAR_HEROES } from "./lib/modes.js";
import allMovies from "./data/movies.js";
import MovieSearch from "./components/MovieSearch.jsx";
import GuessHistory from "./components/GuessHistory.jsx";
import Poster from "./components/Poster.jsx";
import ModeSelect from "./components/ModeSelect.jsx";

// One game in one mode. It is mounted with a fresh `key` for every new game / mode change,
// so guesses, mystery movie and round state always start clean.
function Game({ modeId, onChangeMode }) {
  const { mode, movies, poolError, mystery, guesses, status, streak, submitGuess, giveUp, nextMovie } = useGame(modeId);
  const index = useMemo(() => buildIndex(movies), [movies]);
  const guessedIds = useMemo(() => new Set(guesses.map((g) => g.movie.id)), [guesses]);
  const finished = status !== "playing";

  return (
    <>
      <div className="mode-bar" data-mode={mode.id}>
        <span className="mode-badge" aria-hidden="true">
          {mode.badge}
        </span>
        <div className="mode-bar-text">
          <strong data-testid="mode-name">{mode.name}</strong>
          <span className="muted">
            {mode.id === "star"
              ? `Mystery stars at least one of: ${STAR_HEROES.map((s) => s.name).join(", ")}`
              : mode.description}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onChangeMode}>
          Change mode
        </button>
      </div>

      {poolError || !mystery ? (
        <p className="empty error" role="alert">
          {poolError || "No movies found. Add movies to src/data/movies.json (see the README)."}
        </p>
      ) : (
        <>
          <MovieSearch index={index} guessedIds={guessedIds} disabled={finished} onSubmit={submitGuess} />

          <div className="status" aria-live="polite">
            <span className="stat">
              Guesses <strong data-testid="guess-count">{guesses.length}</strong>
            </span>
            <span className="stat">
              Streak <strong data-testid="streak">{streak}</strong>
            </span>
            {!finished && (
              <button type="button" className="link" onClick={giveUp}>
                Give Up / Reveal Answer
              </button>
            )}
          </div>

          {finished && (
            <section className={`result ${status}`} data-testid="result">
              <Poster movie={mystery} size="large" />
              <div>
                <p className="result-msg">
                  {status === "won"
                    ? `Correct! You got it in ${guesses.length} guess${guesses.length === 1 ? "" : "es"}.`
                    : "The answer was:"}
                </p>
                <h2>
                  {mystery.title} {mystery.year != null && <span className="muted">({mystery.year})</span>}
                </h2>
                <button type="button" onClick={nextMovie}>
                  Next Movie
                </button>
              </div>
            </section>
          )}

          <GuessHistory guesses={guesses} />
        </>
      )}
    </>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [modeId, setModeId] = useState(null); // null until the player picks a mode
  const [gameId, setGameId] = useState(0); // changes on every new game, remounting <Game>
  const [selecting, setSelecting] = useState(true);

  function startGame(id) {
    setModeId(id);
    setGameId((n) => n + 1); // fresh game, even when re-picking the current mode
    setSelecting(false);
  }

  return (
    <div className="app">
      <header className="site-header">
        <div>
          <h1>Tollywood Mystery</h1>
          <p className="muted">Guess the Telugu movie!</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </header>

      {selecting && (
        <ModeSelect
          movies={allMovies}
          currentModeId={modeId}
          onSelect={startGame}
          onCancel={modeId ? () => setSelecting(false) : null}
        />
      )}

      {/* Stays mounted (just hidden) while the mode picker is open, so "Back to current game" loses nothing. */}
      {modeId && (
        <div hidden={selecting}>
          <Game key={gameId} modeId={modeId} onChangeMode={() => setSelecting(true)} />
        </div>
      )}
    </div>
  );
}
