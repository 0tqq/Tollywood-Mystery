// Guess comparison logic. Pure functions, no React.
// Any attribute that is null/empty in the data is reported as "unavailable"
// instead of being guessed at.

export function compareYear(guess, mystery) {
  if (guess.year == null || mystery.year == null) {
    return { status: "unknown", text: "Comparison unavailable" };
  }
  if (guess.year === mystery.year) return { status: "correct", text: "Correct ✓" };
  if (guess.year < mystery.year) return { status: "wrong", text: "Mystery movie is newer ↑" };
  return { status: "wrong", text: "Mystery movie is older ↓" };
}

export function compareRating(guess, mystery) {
  if (guess.imdbRating == null || mystery.imdbRating == null) {
    return { status: "unknown", text: "Comparison unavailable" };
  }
  if (guess.imdbRating === mystery.imdbRating) return { status: "correct", text: "Correct ✓" };
  if (guess.imdbRating < mystery.imdbRating) {
    return { status: "wrong", text: "Mystery movie has a higher rating ↑" };
  }
  return { status: "wrong", text: "Mystery movie has a lower rating ↓" };
}

export function compareCast(guess, mystery) {
  const guessCast = guess.cast || [];
  const mysteryCast = mystery.cast || [];
  if (guessCast.length === 0 || mysteryCast.length === 0) {
    return { status: "unknown", text: "Comparison unavailable", matches: [] };
  }
  const matches = guessCast.filter((name) => mysteryCast.includes(name));
  if (matches.length === 0) return { status: "wrong", text: "No matching cast", matches };
  return { status: "correct", text: matches.join(", "), matches };
}

export function compareDirector(guess, mystery) {
  if (!guess.director || !mystery.director) {
    return { status: "unknown", text: "Comparison unavailable" };
  }
  if (guess.director === mystery.director) {
    return { status: "correct", text: `${guess.director} ✓` };
  }
  return { status: "wrong", text: "Different director" };
}

export function compareGenres(guess, mystery) {
  const guessGenres = guess.genres || [];
  const mysteryGenres = mystery.genres || [];
  if (guessGenres.length === 0 || mysteryGenres.length === 0) {
    return { status: "unknown", text: "Comparison unavailable", matches: [] };
  }
  const matches = guessGenres.filter((g) => mysteryGenres.includes(g));
  if (matches.length === 0) return { status: "wrong", text: "No matching genres", matches };
  return { status: "correct", text: matches.join(", "), matches };
}

export function compareGuess(guess, mystery) {
  return {
    movie: guess,
    isCorrect: guess.id === mystery.id,
    year: compareYear(guess, mystery),
    rating: compareRating(guess, mystery),
    cast: compareCast(guess, mystery),
    director: compareDirector(guess, mystery),
    genres: compareGenres(guess, mystery),
  };
}
