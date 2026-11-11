// Movie search: partial titles, English / original / Telugu-script titles, alternate spellings.
// Pure functions, no React.

// Remove Latin accents only. Telugu vowel signs are combining marks too and must be kept.
const LATIN_MARKS = /[̀-ͯ]/g;

export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(LATIN_MARKS, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

// Spelling-tolerant form: no spaces, doubled Latin letters collapsed ("Baahubali" and "Bahubali" match).
export function compact(text) {
  return normalize(text).replace(/ /g, "").replace(/([a-z])\1+/g, "$1");
}

// Every name a movie can be found by.
function namesOf(movie) {
  const raw = [movie.title, movie.originalTitle, movie.teluguTitle, ...(movie.altTitles || [])];
  const seen = new Set();
  const names = [];
  for (const r of raw) {
    const norm = normalize(r);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    names.push({ norm, words: norm.split(" "), compact: compact(r) });
  }
  return names;
}

// Build once per dataset (not per keystroke).
export function buildIndex(movies) {
  return movies.map((movie) => ({ movie, names: namesOf(movie) }));
}

function scoreName(name, q, tokens, qc) {
  if (name.norm === q) return 100;
  if (name.norm.startsWith(q)) return 80;
  if (name.words.some((w) => w.startsWith(q))) return 65;
  if (tokens.every((t) => name.norm.includes(t))) return 55;
  if (qc.length >= 3 && name.compact.includes(qc)) return 40;
  return 0;
}

export function searchMovies(index, query, { exclude = new Set(), limit = 8 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ");
  const qc = compact(query);
  const hits = [];
  for (const { movie, names } of index) {
    if (exclude.has(movie.id)) continue;
    let best = 0;
    for (const name of names) best = Math.max(best, scoreName(name, q, tokens, qc));
    if (best) hits.push({ movie, score: best });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      (b.movie.voteCount ?? 0) - (a.movie.voteCount ?? 0) ||
      (b.movie.year ?? 0) - (a.movie.year ?? 0) ||
      a.movie.title.localeCompare(b.movie.title)
  );
  return hits.slice(0, limit).map((h) => h.movie);
}
