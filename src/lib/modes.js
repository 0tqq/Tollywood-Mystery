// Game modes and the rules for which movies may be the mystery in each one.
// Pools are generated from the movie database at runtime; there are no hardcoded movie lists.
// Pure functions, no React.

import { normalize } from "./search.js";

// ---------------------------------------------------------------- Star Heroes
// Matched on the cast names stored in movies.json (they come from TMDB credits).
// Matching is EXACT after normalizing case, spaces and punctuation, never a substring:
// "N. T. Rama Rao" (the classic-era legend) must not count as "N. T. Rama Rao Jr.".
export const STAR_HEROES = [
  { name: "Prabhas", aliases: ["Prabhas"] },
  { name: "Mahesh Babu", aliases: ["Mahesh Babu"] },
  { name: "Jr. NTR", aliases: ["N. T. Rama Rao Jr.", "NTR Jr.", "Jr. NTR", "Jr NTR"] },
  { name: "Pawan Kalyan", aliases: ["Pawan Kalyan"] },
  { name: "Allu Arjun", aliases: ["Allu Arjun"] },
  { name: "Ram Charan", aliases: ["Ram Charan", "Ram Charan Teja"] },
];

const nameKey = (name) => normalize(name).replace(/ /g, "");
const STAR_BY_KEY = new Map();
for (const star of STAR_HEROES) {
  for (const alias of star.aliases) STAR_BY_KEY.set(nameKey(alias), star.name);
}

// Which of the six stars are in this movie's cast (empty when none or when cast data is missing).
export function starsInMovie(movie) {
  const cast = Array.isArray(movie?.cast) ? movie.cast : [];
  const found = new Set();
  for (const person of cast) {
    if (typeof person !== "string") continue; // ignore malformed cast entries
    const star = STAR_BY_KEY.get(nameKey(person));
    if (star) found.add(star);
  }
  return [...found];
}

export const isStarHeroMovie = (movie) => starsInMovie(movie).length > 0;

// ---------------------------------------------------------------- 21st century
const MIN_YEAR = 1880; // sanity bounds for a plausible release year
const MAX_YEAR = 2100;
const plausible = (y) => Number.isInteger(y) && y >= MIN_YEAR && y <= MAX_YEAR;

// The release year from the database, or null if it is missing or invalid.
// The full release date wins when it is valid; otherwise the stored year is used.
export function releaseYear(movie) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(movie?.releaseDate ?? ""));
  if (m) {
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (plausible(year) && month >= 1 && month <= 12 && day >= 1 && day <= 31) return year;
  }
  const raw = movie?.year;
  const y = typeof raw === "string" && /^\d{4}$/.test(raw.trim()) ? Number(raw) : raw;
  return plausible(y) ? y : null;
}

// 21st century = 2001 onwards. Movies with an unknown year are never eligible.
export const FIRST_21ST_CENTURY_YEAR = 2001;
export function is21stCenturyMovie(movie) {
  const y = releaseYear(movie);
  return y !== null && y >= FIRST_21ST_CENTURY_YEAR;
}

// ---------------------------------------------------------------- modes
export const DEFAULT_MODE_ID = "classic";

// minPool: fewest eligible movies for which a mode is playable (a repeat-free round needs a few).
export const MODES = [
  {
    id: "classic",
    name: "Classic Mode",
    badge: "ALL",
    tagline: "Any Telugu movie",
    description: "The mystery can be any movie in the database.",
    minPool: 1,
    filter: () => true,
  },
  {
    id: "star",
    name: "Star Heroes Mode",
    badge: "★",
    tagline: "Superstar movies",
    description: "The mystery stars at least one of these six actors.",
    minPool: 5,
    filter: isStarHeroMovie,
  },
  {
    id: "21st",
    name: "21st Century Mode",
    badge: "2001+",
    tagline: "Released 2001 or later",
    description: "The mystery was released in 2001 or later.",
    minPool: 5,
    filter: is21stCenturyMovie,
  },
];

export function getMode(id) {
  const mode = MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`Unknown game mode: ${id}`);
  return mode;
}

// Records the game can use at all (same rule the game has always applied).
export const isValidMovie = (m) => Boolean(m) && m.id != null && Boolean(m.title);

// The pool of movies that may be the mystery in a mode: valid, unique by id, passing the mode's rule.
export function getEligibleMovies(movies, modeId) {
  const mode = getMode(modeId);
  const seen = new Set();
  const pool = [];
  for (const movie of Array.isArray(movies) ? movies : []) {
    if (!isValidMovie(movie) || seen.has(movie.id)) continue;
    seen.add(movie.id);
    if (mode.filter(movie)) pool.push(movie);
  }
  return pool;
}

// null when the pool is big enough, otherwise a message for the player. Never falls back to another mode.
export function poolProblem(pool, modeId) {
  const mode = getMode(modeId);
  if (pool.length >= mode.minPool) return null;
  return (
    `Not enough movies for ${mode.name}: found ${pool.length}, need at least ${mode.minPool}. ` +
    `Add more movies to the database (npm run fetch-data) or pick another mode.`
  );
}

// Random pick from a pool, avoiding the previous mystery when there is a choice.
// Re-checks the mode's rule on the winner so an ineligible movie can never be returned.
export function pickMystery(pool, modeId, excludeId = null) {
  const mode = getMode(modeId);
  if (pool.length === 0) return null;
  const choices = pool.length > 1 ? pool.filter((m) => m.id !== excludeId) : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  if (!isValidMovie(pick) || !mode.filter(pick)) {
    throw new Error(`Ineligible movie selected for ${mode.name}`);
  }
  return pick;
}
