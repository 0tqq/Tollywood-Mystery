import { useMemo } from "react";
import { MODES, STAR_HEROES, getEligibleMovies, poolProblem } from "../lib/modes.js";

// Mode picker. Choosing a card starts a NEW game in that mode (even if it is the current one).
// movies: the full database, used to count each mode's eligible movies and to disable modes that cannot be played.
export default function ModeSelect({ movies, currentModeId, onSelect, onCancel }) {
  const modes = useMemo(
    () =>
      MODES.map((mode) => {
        const pool = getEligibleMovies(movies, mode.id);
        return { ...mode, count: pool.length, problem: poolProblem(pool, mode.id) };
      }),
    [movies]
  );

  return (
    <section className="mode-select" aria-labelledby="mode-select-title">
      <h2 id="mode-select-title">Choose a game mode</h2>
      <p className="muted mode-select-sub">
        {currentModeId ? "Choosing a mode starts a new game." : "Pick how the mystery movie is chosen."}
      </p>

      <div className="mode-grid">
        {modes.map((mode) => {
          const isCurrent = mode.id === currentModeId;
          return (
            <button
              key={mode.id}
              type="button"
              className={`mode-card ${isCurrent ? "is-current" : ""}`}
              data-mode={mode.id}
              aria-current={isCurrent ? "true" : undefined}
              disabled={Boolean(mode.problem)}
              onClick={() => onSelect(mode.id)}
            >
              <span className="mode-badge" aria-hidden="true">
                {mode.badge}
              </span>
              <span className="mode-name">{mode.name}</span>
              <span className="mode-desc">{mode.description}</span>
              {mode.id === "star" && (
                <span className="chips">
                  {STAR_HEROES.map((s) => (
                    <span className="chip" key={s.name}>
                      {s.name}
                    </span>
                  ))}
                </span>
              )}
              <span className="mode-meta">
                {mode.problem ? (
                  <span className="mode-error">{mode.problem}</span>
                ) : (
                  <span>{mode.count.toLocaleString()} movies eligible</span>
                )}
                {isCurrent && <span className="current-tag">Current mode</span>}
              </span>
            </button>
          );
        })}
      </div>

      {onCancel && (
        <button type="button" className="link back-link" onClick={onCancel}>
          Back to current game
        </button>
      )}
    </section>
  );
}
