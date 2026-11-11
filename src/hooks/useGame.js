import { useState, useCallback, useRef, useMemo } from "react";
import allMovies from "../data/movies.js";
import { compareGuess } from "../lib/compare.js";
import { readStorage, writeStorage } from "../lib/storage.js";
import { DEFAULT_MODE_ID, getMode, getEligibleMovies, poolProblem, pickMystery } from "../lib/modes.js";

// Classic keeps the original storage key so existing streaks carry over; other modes get their own.
export const STREAK_KEY = "tm-streak";
export const streakKeyFor = (modeId) => (modeId === DEFAULT_MODE_ID ? STREAK_KEY : `${STREAK_KEY}-${modeId}`);

// Every playable movie, valid and unique by id (used for searching and guessing in all modes).
// The mystery is drawn only from the mode's pool; guesses can be any movie.
const movies = getEligibleMovies(allMovies, DEFAULT_MODE_ID);

function loadStreak(key) {
  const n = parseInt(readStorage(key, "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// status: "playing" | "won" | "gave_up"
// A new game (or a mode change) mounts this hook fresh, so all round state starts clean.
export function useGame(modeId = DEFAULT_MODE_ID) {
  const mode = getMode(modeId);
  const pool = useMemo(() => getEligibleMovies(allMovies, modeId), [modeId]);
  const poolError = useMemo(() => poolProblem(pool, modeId), [pool, modeId]);
  const streakKey = streakKeyFor(modeId);

  const [mystery, setMystery] = useState(() => (poolError ? null : pickMystery(pool, modeId, null)));
  const [guesses, setGuesses] = useState([]);
  const [status, setStatus] = useState("playing");
  const [streak, setStreak] = useState(() => loadStreak(streakKey));

  // Synchronous source of truth for the current round. Handlers read this instead of React state,
  // so a fast double Enter / double click can never submit twice or add the streak twice.
  const round = useRef({ status: "playing", guessed: new Set(), mystery });
  round.current.mystery = mystery;
  const streakRef = useRef(streak);

  const updateStreak = (value) => {
    streakRef.current = value;
    setStreak(value);
    writeStorage(streakKey, value);
  };

  const submitGuess = useCallback((movie) => {
    const r = round.current;
    if (!movie || movie.id == null || !r.mystery) return false; // empty submission
    if (r.status !== "playing") return false;
    if (r.guessed.has(movie.id)) return false; // duplicate guess
    r.guessed.add(movie.id);
    const result = compareGuess(movie, r.mystery);
    setGuesses((prev) => [result, ...prev]); // newest first
    if (result.isCorrect) {
      r.status = "won"; // set before anything else: blocks a second increment
      setStatus("won");
      updateStreak(streakRef.current + 1);
    }
    return true;
  }, []);

  const giveUp = useCallback(() => {
    const r = round.current;
    if (r.status !== "playing") return;
    r.status = "gave_up";
    setStatus("gave_up");
    updateStreak(0);
  }, []);

  const nextMovie = useCallback(() => {
    const r = round.current;
    if (r.status === "playing") return; // only after the round is over
    const next = pickMystery(pool, modeId, r.mystery?.id); // same mode, same pool
    r.mystery = next;
    r.guessed = new Set();
    r.status = "playing";
    setMystery(next);
    setGuesses([]);
    setStatus("playing");
  }, [pool, modeId]);

  return { mode, movies, poolSize: pool.length, poolError, mystery, guesses, status, streak, submitGuess, giveUp, nextMovie };
}
