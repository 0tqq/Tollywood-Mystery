import { useState, useMemo, useEffect, useRef } from "react";
import Poster from "./Poster.jsx";
import { normalize } from "../lib/search.js";

const PAGE_SIZE = 50;

export default function MovieListModal({
  isOpen,
  onClose,
  movies = [],
  guessedIds = new Set(),
  onSelectMovie,
}) {
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedEra, setSelectedEra] = useState("all");
  const [sortBy, setSortBy] = useState("year_desc");
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const searchInputRef = useRef(null);

  // Close on Escape & handle body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    // Auto-focus search input
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Reset pagination limit when filters change
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [filterQuery, selectedEra, sortBy]);

  // Filter and sort movies
  const filteredMovies = useMemo(() => {
    if (!movies || movies.length === 0) return [];

    let list = movies;

    // Filter by Era
    if (selectedEra !== "all") {
      list = list.filter((m) => {
        const y = m.year;
        if (y == null) return selectedEra === "unknown";
        if (selectedEra === "classic") return y < 2000;
        if (selectedEra === "2000s") return y >= 2000 && y <= 2010;
        if (selectedEra === "2010s") return y >= 2011 && y <= 2020;
        if (selectedEra === "2020s") return y >= 2021;
        return true;
      });
    }

    // Filter by text search query
    const q = normalize(filterQuery);
    if (q) {
      list = list.filter((m) => {
        if (normalize(m.title).includes(q)) return true;
        if (m.originalTitle && normalize(m.originalTitle).includes(q)) return true;
        if (m.teluguTitle && normalize(m.teluguTitle).includes(q)) return true;
        if (m.director && normalize(m.director).includes(q)) return true;
        if (m.cast && m.cast.some((c) => normalize(c).includes(q))) return true;
        if (m.genres && m.genres.some((g) => normalize(g).includes(q))) return true;
        if (m.year && String(m.year).includes(q)) return true;
        return false;
      });
    }

    // Sort
    const sorted = [...list];
    if (sortBy === "year_desc") {
      sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    } else if (sortBy === "year_asc") {
      sorted.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    } else if (sortBy === "title_asc") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "rating_desc") {
      sorted.sort((a, b) => (b.imdbRating ?? 0) - (a.imdbRating ?? 0));
    }

    return sorted;
  }, [movies, filterQuery, selectedEra, sortBy]);

  if (!isOpen) return null;

  const visibleMovies = filteredMovies.slice(0, displayLimit);
  const hasMore = displayLimit < filteredMovies.length;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title-group">
            <h2 id="modal-title">Movie Database</h2>
            <span className="modal-badge">{movies.length} movies loaded</span>
          </div>
          <button
            type="button"
            className="icon-btn modal-close-btn"
            onClick={onClose}
            aria-label="Close movie list modal"
          >
            ✕
          </button>
        </header>

        <div className="modal-controls">
          <div className="modal-search-box">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Filter by title, Telugu name, director, or actor..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label="Filter movies in database"
            />
            {filterQuery && (
              <button
                type="button"
                className="clear-filter-btn"
                onClick={() => setFilterQuery("")}
                aria-label="Clear filter"
              >
                ✕
              </button>
            )}
          </div>

          <div className="modal-filters-row">
            <label className="filter-select-wrapper">
              <span className="muted">Era:</span>
              <select
                value={selectedEra}
                onChange={(e) => setSelectedEra(e.target.value)}
              >
                <option value="all">All Eras</option>
                <option value="classic">Classics (&lt; 2000)</option>
                <option value="2000s">2000 - 2010</option>
                <option value="2010s">2011 - 2020</option>
                <option value="2020s">2021 - Present</option>
              </select>
            </label>

            <label className="filter-select-wrapper">
              <span className="muted">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="year_desc">Year (Newest)</option>
                <option value="year_asc">Year (Oldest)</option>
                <option value="title_asc">Title (A - Z)</option>
                <option value="rating_desc">IMDb Rating (Highest)</option>
              </select>
            </label>

            <span className="modal-result-count">
              Showing {visibleMovies.length} of {filteredMovies.length}
            </span>
          </div>
        </div>

        <div className="modal-list">
          {visibleMovies.length === 0 ? (
            <p className="empty">No matching movies found in the database.</p>
          ) : (
            <ul className="db-movie-items">
              {visibleMovies.map((m) => {
                const isGuessed = guessedIds.has(m.id);
                return (
                  <li key={m.id} className={`db-movie-row ${isGuessed ? "guessed" : ""}`}>
                    <div className="db-movie-thumb">
                      <Poster movie={m} size="thumb" />
                    </div>
                    <div className="db-movie-info">
                      <div className="db-movie-title-line">
                        <strong className="db-title">{m.title}</strong>
                        <span className="muted">({m.year ?? "N/A"})</span>
                        {m.imdbRating != null && (
                          <span className="db-rating">★ {m.imdbRating.toFixed(1)}</span>
                        )}
                        {isGuessed && <span className="db-guessed-tag">Guessed</span>}
                      </div>

                      {m.originalTitle && normalize(m.originalTitle) !== normalize(m.title) && (
                        <div className="muted db-alt-title">{m.originalTitle}</div>
                      )}

                      <div className="db-meta-line muted">
                        {m.director && <span>Dir: {m.director}</span>}
                        {m.genres && m.genres.length > 0 && (
                          <span> · {m.genres.slice(0, 3).join(", ")}</span>
                        )}
                      </div>

                      {m.cast && m.cast.length > 0 && (
                        <div className="db-cast-line muted">
                          Cast: {m.cast.slice(0, 4).join(", ")}
                        </div>
                      )}
                    </div>

                    <div className="db-movie-action">
                      {onSelectMovie && (
                        <button
                          type="button"
                          className="select-guess-btn"
                          disabled={isGuessed}
                          onClick={() => {
                            onSelectMovie(m);
                            onClose();
                          }}
                        >
                          {isGuessed ? "Guessed" : "Pick Movie"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {hasMore && (
            <div className="load-more-container">
              <button
                type="button"
                className="icon-btn load-more-btn"
                onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
              >
                Load More ({filteredMovies.length - displayLimit} remaining)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

