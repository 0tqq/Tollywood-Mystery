// TMDB helper for client-side queries (such as movie taglines / hints).
const TMDB_API_KEY =
  import.meta.env.VITE_TMDB_API_KEY || "f8f5486ab69dc4ecf1a3775310cf14da";

const taglineCache = new Map();

/**
 * Fetches the movie tagline from TMDB.
 * Returns the tagline string, null if no tagline exists, or throws on network failure.
 */
export async function fetchMovieTagline(movie) {
  if (movie.tagline !== undefined && movie.tagline !== null) {
    return movie.tagline;
  }

  const id = movie.tmdbId ?? movie.id;
  if (!id) return null;

  if (taglineCache.has(id)) {
    return taglineCache.get(id);
  }

  try {
    const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`TMDB HTTP error ${res.status}`);
    }
    const data = await res.json();
    const tagline = data.tagline?.trim() || "";
    taglineCache.set(id, tagline);
    movie.tagline = tagline; // cache onto the movie object in memory
    return tagline;
  } catch (err) {
    console.warn(`Failed to fetch tagline for ${movie.title}:`, err);
    throw err;
  }
}

