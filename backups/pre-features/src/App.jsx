import { useMemo } from "react";
import { useGame } from "./hooks/useGame.js";
import { useTheme } from "./hooks/useTheme.js";
import { buildIndex } from "./lib/search.js";
import MovieSearch from "./components/MovieSearch.jsx";
import GuessHistory from "./components/GuessHistory.jsx";
import Poster from "./components/Poster.jsx";

export default function App() {
  const { movies, mystery, guesses, status, streak, submitGuess, giveUp, nextMovie } = useGame();
  const { theme, toggleTheme } = useTheme();
  const index = useMemo(() => buildIndex(movies), [movies]);
  const guessedIds = useMemo(() => new Set(guesses.map((g) => g.movie.id)), [guesses]);
  const finished = status !== "playing";

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

      {!mystery ? (
        <p className="empty">
          No movies found. Add movies to <code>src/data/movies.json</code> (see the README).
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
    </div>
  );
}

