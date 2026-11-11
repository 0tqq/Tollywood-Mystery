import Poster from "./Poster.jsx";

// One clue line: label, the guessed movie's own value (if any) and the comparison result.
function Clue({ label, value, clue, extra }) {
  return (
    <div className={`clue ${clue.status}`}>
      <span className="clue-label">{label}</span>
      <span className="clue-main">
        {value != null && <span className="clue-value">{value}</span>}
        <span className="clue-text">{clue.text}</span>
        {extra}
      </span>
    </div>
  );
}

function GuessCard({ guess: g }) {
  const m = g.movie;
  const rating = m.imdbRating != null ? m.imdbRating.toFixed(1) : null;
  const castCount = g.cast.matches.length;

  return (
    <article className={`guess-card ${g.isCorrect ? "is-correct" : ""}`}>
      <div className="guess-poster">
        <Poster movie={m} size="card" />
      </div>
      <div className="guess-body">
        <header className="guess-head">
          <h3>{m.title}</h3>
          <p className="muted">
            {m.year ?? "Year unknown"}
            {" · "}
            {rating ? `★ ${rating}` : "No IMDb rating"}
          </p>
        </header>
        <div className="clues">
          <Clue label="Year" value={m.year ?? "N/A"} clue={g.year} />
          <Clue label="IMDb rating" value={rating ?? "N/A"} clue={g.rating} />
          <Clue
            label="Cast"
            clue={g.cast}
            extra={
              castCount > 0 && (
                <span className="count">
                  {castCount} matching actor{castCount > 1 ? "s" : ""}
                </span>
              )
            }
          />
          <Clue label="Director" clue={g.director} />
          <Clue label="Genres" clue={g.genres} />
        </div>
      </div>
    </article>
  );
}

export default function GuessHistory({ guesses }) {
  if (guesses.length === 0) return null;
  return (
    <section className="guesses" aria-label="Your guesses">
      {guesses.map((g) => (
        <GuessCard key={g.movie.id} guess={g} />
      ))}
    </section>
  );
}
