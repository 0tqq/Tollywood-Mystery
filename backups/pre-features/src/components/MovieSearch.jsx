import { useState, useMemo, useRef, useEffect } from "react";
import { searchMovies, normalize } from "../lib/search.js";
import Poster from "./Poster.jsx";

// index: prebuilt search index. guessedIds: Set of ids already guessed this round.
export default function MovieSearch({ index, guessedIds, disabled, onSubmit }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // highlighted suggestion
  const [selected, setSelected] = useState(null); // movie picked with the mouse
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const suggestions = useMemo(
    () => searchMovies(index, query, { exclude: guessedIds, limit: 8 }),
    [index, query, guessedIds]
  );

  // Keep the highlighted row visible while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  // Return focus to the box when a new round starts (not on first load, which would pop the mobile keyboard).
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (wasDisabled.current && !disabled) inputRef.current?.focus();
    wasDisabled.current = disabled;
  }, [disabled]);

  const hasList = open && suggestions.length > 0;

  // What a submit would send: the mouse selection, else the highlighted row.
  // With the list closed, only an exact title match counts, so nothing is guessed by accident.
  function currentChoice() {
    if (selected) return selected;
    if (hasList) return suggestions[active] ?? null;
    const q = normalize(query);
    return q ? suggestions.find((m) => normalize(m.title) === q) ?? null : null;
  }

  function submit() {
    const movie = currentChoice();
    if (!movie || disabled) return; // empty input: nothing to submit
    if (onSubmit(movie)) {
      setQuery("");
      setSelected(null);
      setOpen(false);
      setActive(0);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    // Enter that confirms an IME composition (typing Telugu) must not submit.
    if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
      setSelected(null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.repeat) return; // holding Enter must not fire repeatedly
      submit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleChange(e) {
    setQuery(e.target.value);
    setSelected(null);
    setActive(0);
    setOpen(true);
  }

  function pick(movie) {
    setSelected(movie);
    setQuery(movie.title);
    setOpen(false);
    inputRef.current?.focus();
  }

  const canSubmit = !disabled && currentChoice() !== null;

  return (
    <div className="search">
      <div className="search-row">
        <div className="search-box">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search for a Telugu movie"
            aria-expanded={hasList}
            aria-controls="movie-suggestions"
            aria-activedescendant={hasList ? `suggestion-${active}` : undefined}
            aria-autocomplete="list"
            value={query}
            placeholder="Search by title or Telugu name..."
            disabled={disabled}
            onChange={handleChange}
            onFocus={() => query && setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck="false"
          />
          {hasList && (
            <ul id="movie-suggestions" className="suggestions" role="listbox" ref={listRef}>
              {suggestions.map((m, i) => (
                <li
                  key={m.id}
                  id={`suggestion-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "active" : ""}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus in the input
                    pick(m);
                  }}
                >
                  <Poster movie={m} size="thumb" />
                  <span className="suggestion-text">
                    <span className="suggestion-title">
                      {m.title} <span className="muted">({m.year ?? "?"})</span>
                    </span>
                    {m.originalTitle && normalize(m.originalTitle) !== normalize(m.title) && (
                      <span className="muted suggestion-alt">{m.originalTitle}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={submit} disabled={!canSubmit}>
          Submit Guess
        </button>
      </div>
    </div>
  );
}

