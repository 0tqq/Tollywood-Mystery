# Tollywood Mystery (V2)

Wordle-style game: guess the mystery Telugu movie from clues (year, IMDb rating, cast, director, genres).
React + Vite, frontend only. The game reads `src/data/movies.json` and never calls an API while you play.

## Run the game

```bash
npm install
npm run dev
```

## Build the 1,000-movie database

Put your keys in `.env` (never committed, never sent to the browser; only the Node script reads them):

```
TMDB_API_KEY=your_tmdb_v3_key
OMDB_API_KEY=your_omdb_key
```

Then, in this order:

```bash
npm run fetch-data:backfill   # once: adds original/Telugu titles etc. to records fetched before V2
npm run fetch-data            # adds new movies until the targets are met (~10-15 min); safe to re-run
npm run fetch-data:ratings    # only if OMDb's daily limit (1,000/day) cut ratings short; run next day
```

How it behaves:
- Reads the existing `movies.json`, keeps every record, matches by TMDB ID, only fetches movies it does not have.
- Saves every 20 movies (atomically), so Ctrl+C or a crash loses nothing; just run it again to resume.
- Backs up the previous file to `src/data/backups/` before the first change of each run.
- Retries on rate limits (429), server errors and network drops. If TMDB or OMDb fails, the data file is left as it was.
- Prints existing / newly added / final counts, the release-period split and missing values at the end.
- Ratings and any other value TMDB/OMDb does not have stay `null` and show as unavailable in the game. Nothing is invented.

Target mix (each movie belongs to exactly one bucket): 200 blockbusters, 100 classics (before 2000),
150 from 2000-2010, 250 from 2011-2020, 200 from 2021-2026, 100 lesser-known/regional.
If TMDB runs out of matching movies for a bucket, the report says by how many it fell short.
Only movies with a poster and a release date are added.

## Game modes

Pick a mode on the start screen (use **Change mode** any time; choosing a mode starts a new game).

| Mode | The mystery movie... |
|------|----------------------|
| Classic | can be any movie in the database (unchanged behaviour) |
| Star Heroes | features at least one of Prabhas, Mahesh Babu, Jr. NTR, Pawan Kalyan, Allu Arjun, Ram Charan |
| 21st Century | was released in 2001 or later |

- Pools are built from `movies.json` when the game loads; there are no separate movie lists. Rules live in `src/lib/modes.js`.
- Star Heroes matches the **cast names** stored in `movies.json` (TMDB credits, the top 6 billed). Names are matched exactly
  (so "N. T. Rama Rao" is not "N. T. Rama Rao Jr."); spellings are in `STAR_HEROES` if you ever need to add one.
- 21st Century uses the release date when it is valid, otherwise the stored year. Movies with no usable year are never picked.
- Searching and guessing work across the whole database in every mode; only the *mystery* is restricted.
- If a mode has fewer than 5 eligible movies it is disabled and the card says why. It never falls back to Classic.
- Each mode keeps its own winning streak (Classic keeps the original one).

## Game rules

- Type to search (partial titles, English or original titles, alternate spellings, Telugu script).
  Arrow keys move through suggestions, Enter submits the highlighted one. Duplicates and empty guesses are ignored.
- Streak: +1 for a win, back to 0 if you give up. Saved in the browser (`localStorage`).
- Theme (dark/light) is saved in the browser too.

## Structure

```
src/data/movies.js            loads movies.json
src/lib/compare.js            guess comparison logic
src/lib/search.js             title search (partial, alternate spellings, Telugu)
src/lib/modes.js              game modes: eligibility rules, pools, random pick
src/hooks/useGame.js          round state, random pick, counter, streak
src/hooks/useTheme.js         dark/light theme + persistence
src/components/               ModeSelect, MovieSearch, GuessHistory (guess cards), Poster
scripts/fetch-movies.mjs      incremental TMDB/OMDb database builder
```
