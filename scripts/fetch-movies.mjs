// Tollywood Mystery: incremental movie database builder (TMDB + OMDb).
// Run from the project root. Keys come from the shell or from a .env file:
//   TMDB_API_KEY=...   (v3 "API Key", not the Read Access Token)
//   OMDB_API_KEY=...   (IMDb ratings)
//
//   npm run fetch-data            add new movies until the targets below are met
//   npm run fetch-data:backfill   add V2 fields (original/Telugu title, companies...) to old records
//   npm run fetch-data:ratings    only fill in missing IMDb ratings via OMDb
//
// Safe to re-run any time: existing records are never overwritten or duplicated (matched by TMDB ID),
// progress is saved every few movies, and the old file is backed up to src/data/backups/ first.
// Extra options:  --max-new=N  stop after N new movies      --help
//
// The browser never sees the keys: this script runs in Node and the game only reads movies.json.

import { readFile, writeFile, rename, copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import dns from "node:dns";

// Some networks have a broken IPv6 route, which makes Node time out connecting. Prefer IPv4.
dns.setDefaultResultOrder("ipv4first");

// ---------------------------------------------------------------- config
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};

if (has("help")) {
  console.log(
    "Usage: node scripts/fetch-movies.mjs [--backfill | --omdb-only] [--max-new=N]\n" +
      "Keys: TMDB_API_KEY and OMDB_API_KEY in the environment or in .env"
  );
  process.exit(0);
}

async function loadDotEnv() {
  let text;
  try {
    text = await readFile(".env", "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
await loadDotEnv();

// Strip whitespace, stray \r (Windows line endings) and quotes.
const clean = (v) => (v || "").trim().replace(/^["']|["']$/g, "").trim();
const TMDB_KEY = clean(process.env.TMDB_API_KEY);
const OMDB_KEY = clean(process.env.OMDB_API_KEY);

const DATA_FILE = process.env.DATA_FILE || "src/data/movies.json";
const TMDB_BASE = process.env.TMDB_BASE || "https://api.themoviedb.org/3";
const OMDB_BASE = process.env.OMDB_BASE || "https://www.omdbapi.com/";
const TMDB_DELAY_MS = Number(process.env.TMDB_DELAY_MS ?? 30); // gentle pacing between TMDB calls
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS ?? 600);
const MAX_TRIES = 5;
const CHECKPOINT_EVERY = 20; // write movies.json after this many changes
const MAX_NEW = Number(opt("max-new", Infinity));

const TODAY = new Date().toISOString().slice(0, 10);

// Target distribution. Each movie is claimed by exactly one bucket (the first that finds it),
// so the buckets add up to the final total.
const ERA_STRATEGIES = [
  { sort_by: "vote_count.desc" },
  { sort_by: "vote_average.desc", "vote_count.gte": "10" },
  { sort_by: "popularity.desc" },
];
const REGIONAL = { "vote_count.gte": "3", "vote_count.lte": "100" };
const BUCKETS = [
  { name: "blockbuster", label: "Popular blockbusters", target: 200, strategies: [{ sort_by: "vote_count.desc" }] },
  { name: "classic", label: "Classics (before 2000)", target: 100, era: [null, 1999], strategies: ERA_STRATEGIES },
  { name: "2000-2010", label: "2000-2010", target: 150, era: [2000, 2010], strategies: ERA_STRATEGIES },
  { name: "2011-2020", label: "2011-2020", target: 250, era: [2011, 2020], strategies: ERA_STRATEGIES },
  { name: "2021-2026", label: "2021-2026", target: 200, era: [2021, null], strategies: ERA_STRATEGIES },
  {
    name: "regional",
    label: "Lesser-known / regional",
    target: 100,
    strategies: [
      { sort_by: "popularity.desc", ...REGIONAL },
      { sort_by: "vote_count.desc", ...REGIONAL },
      { sort_by: "primary_release_date.desc", ...REGIONAL },
    ],
  },
];

function eraOfYear(y) {
  if (y == null) return null;
  if (y <= 1999) return "classic";
  if (y <= 2010) return "2000-2010";
  if (y <= 2020) return "2011-2020";
  return "2021-2026";
}
const bucketOf = (rec) => rec.bucket || eraOfYear(rec.year); // old records count toward their era

// ---------------------------------------------------------------- http
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) => RETRY_BASE_MS * 2 ** attempt + Math.random() * RETRY_BASE_MS;

function httpError(msg, flags = {}) {
  return Object.assign(new Error(msg), flags);
}

// JSON GET with retries on 429 / 5xx / network errors. Never puts the URL (which holds a key)
// into an error message. raw=true returns the body even on 4xx (OMDb reports errors in JSON).
async function httpJson(url, { raw = false, tries = MAX_TRIES } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = httpError(`HTTP ${res.status}`);
        const ra = Number(res.headers.get("retry-after"));
        await sleep(ra > 0 ? Math.min(ra * 1000, 30000) : backoff(attempt));
        continue;
      }
      if (raw) return await res.json().catch(() => ({ Response: "False", Error: `HTTP ${res.status}` }));
      if (res.status === 401) throw httpError("TMDB rejected the API key (HTTP 401)", { fatal: true });
      if (res.status === 404) throw httpError("HTTP 404", { noRetry: true, notFound: true });
      if (!res.ok) throw httpError(`HTTP ${res.status}`, { noRetry: true });
      return await res.json();
    } catch (e) {
      if (e.fatal || e.noRetry) throw e;
      lastErr = httpError(e.cause?.code || e.name === "TimeoutError" ? `network error (${e.cause?.code || "timeout"})` : e.message);
      await sleep(backoff(attempt));
    }
  }
  throw lastErr;
}

async function tmdb(p, params = {}, opts = {}) {
  if (TMDB_DELAY_MS) await sleep(TMDB_DELAY_MS);
  const url = new URL(TMDB_BASE + p);
  url.searchParams.set("api_key", TMDB_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return httpJson(url, opts);
}

function omdbRaw(params) {
  const url = new URL(OMDB_BASE);
  url.searchParams.set("apikey", OMDB_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return httpJson(url, { raw: true });
}

const omdb = { usable: false, exhausted: false, problem: null };

async function checkOmdbKey() {
  if (!OMDB_KEY) return "no OMDB_API_KEY set";
  try {
    const d = await omdbRaw({ i: "tt0111161" });
    return d.Response === "True" ? null : d.Error || "unknown error";
  } catch (e) {
    return e.message;
  }
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// Fill imdbRating from OMDb. Only marks ratingChecked when OMDb actually answered about this movie.
async function applyRating(rec) {
  if (!omdb.usable || omdb.exhausted || !rec.imdbId || rec.ratingChecked) return;
  let d;
  try {
    d = await omdbRaw({ i: rec.imdbId });
  } catch {
    return; // network trouble: leave unchecked, a later --omdb-only run retries
  }
  if (d.Response === "True") {
    if (rec.imdbRating == null) rec.imdbRating = num(d.imdbRating);
    rec.ratingChecked = true;
  } else if (/limit/i.test(d.Error || "")) {
    omdb.exhausted = true;
  } else if (/invalid api key/i.test(d.Error || "")) {
    omdb.usable = false;
  } else if (/not found/i.test(d.Error || "")) {
    rec.ratingChecked = true;
  }
}

// ---------------------------------------------------------------- records
function buildRecord(d) {
  const imdbId = d.external_ids?.imdb_id || d.imdb_id || null;
  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : null;
  const teluguTitle = d.translations?.translations?.find((t) => t.iso_639_1 === "te")?.data?.title || null;
  const known = new Set([d.title, d.original_title, teluguTitle].filter(Boolean).map((s) => s.toLowerCase()));
  const altTitles = [];
  for (const t of d.alternative_titles?.titles ?? []) {
    const key = (t.title || "").toLowerCase();
    if (key && !known.has(key)) {
      known.add(key);
      altTitles.push(t.title);
    }
    if (altTitles.length >= 8) break;
  }
  return {
    id: String(d.id),
    tmdbId: d.id,
    title: d.title,
    originalTitle: d.original_title || null,
    teluguTitle,
    altTitles,
    releaseDate: d.release_date || null,
    year,
    imdbRating: null,
    cast: (d.credits?.cast ?? []).slice(0, 6).map((c) => c.name),
    director: d.credits?.crew?.find((c) => c.job === "Director")?.name ?? null,
    genres: (d.genres ?? []).map((g) => g.name),
    posterUrl: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null,
    imdbId,
    productionCompanies: (d.production_companies ?? []).slice(0, 5).map((c) => c.name),
    voteCount: d.vote_count ?? null,
  };
}

const fetchDetails = async (id) =>
  buildRecord(await tmdb(`/movie/${id}`, { append_to_response: "credits,external_ids,translations,alternative_titles" }));

const titleKey = (title, year) => `${String(title || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}|${year ?? ""}`;
const tmdbIdOf = (rec) => rec.tmdbId ?? (/^\d+$/.test(String(rec.id)) ? Number(rec.id) : null);

// ---------------------------------------------------------------- storage (atomic + backup)
let backedUp = false;
async function save(movies) {
  if (!backedUp && existsSync(DATA_FILE)) {
    const dir = path.join(path.dirname(DATA_FILE), "backups");
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(dir, `movies.${stamp}.json`);
    await copyFile(DATA_FILE, dest);
    backedUp = true;
    console.log(`Backed up existing database to ${dest}`);
  }
  const tmp = `${DATA_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(movies, null, 2)); // write fully, then swap in
  await rename(tmp, DATA_FILE);
}

async function loadExisting() {
  if (!existsSync(DATA_FILE)) return [];
  let data;
  try {
    data = JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch {
    data = null;
  }
  if (!Array.isArray(data)) {
    console.error(`${DATA_FILE} is not a valid movie list. Refusing to overwrite it; restore a copy from src/data/backups/.`);
    process.exit(1);
  }
  return data;
}

// ---------------------------------------------------------------- run state
const ctx = { movies: [], added: 0, dirty: 0, stop: false, failed: new Set(), shortfall: {}, aborted: null };

process.on("SIGINT", () => {
  if (ctx.stop) process.exit(130);
  ctx.stop = true;
  console.log("\nStopping after the current movie and saving progress (Ctrl+C again to force quit)...");
});

async function checkpoint(force = false) {
  if (ctx.dirty > 0 && (force || ctx.dirty >= CHECKPOINT_EVERY)) {
    await save(ctx.movies);
    ctx.dirty = 0;
  }
}

// ---------------------------------------------------------------- discovery
function discoverParams(bucket, strategy, page) {
  const p = {
    with_original_language: "te",
    include_adult: "false",
    include_video: "false",
    "with_runtime.gte": "60", // skip shorts
    "primary_release_date.lte": TODAY,
    page: String(page),
    ...strategy,
  };
  if (bucket.era) {
    const [from, to] = bucket.era;
    if (from) p["primary_release_date.gte"] = `${from}-01-01`;
    if (to) p["primary_release_date.lte"] = `${to}-12-31` < TODAY ? `${to}-12-31` : TODAY;
  }
  return p;
}

// Round-robin over the bucket's strategies so one sort order cannot dominate.
async function* candidates(bucket) {
  const states = bucket.strategies.map((s) => ({ s, page: 1, done: false }));
  while (states.some((x) => !x.done)) {
    for (const st of states) {
      if (st.done) continue;
      const data = await tmdb("/discover/movie", discoverParams(bucket, st.s, st.page));
      const results = data.results ?? [];
      for (const r of results) yield r;
      st.page++;
      if (!results.length || st.page > Math.min(data.total_pages || 0, 500)) st.done = true;
    }
  }
}

async function runBucket(bucket, known, knownTitles) {
  const have = ctx.movies.filter((m) => bucketOf(m) === bucket.name).length;
  let need = bucket.target - have;
  if (need <= 0) {
    console.log(`[${bucket.name}] already has ${have}/${bucket.target}, skipping`);
    return;
  }
  console.log(`[${bucket.name}] ${bucket.label}: have ${have}, need ${need} more`);
  let got = 0;
  try {
    for await (const r of candidates(bucket)) {
      if (ctx.stop || ctx.added >= MAX_NEW || need <= 0) break;
      if (!r.poster_path || !r.release_date) continue; // need a poster and a date to be playable
      if (known.has(r.id) || ctx.failed.has(r.id)) continue;
      if (knownTitles.has(titleKey(r.title, Number(r.release_date.slice(0, 4))))) continue;
      let rec;
      try {
        rec = await fetchDetails(r.id);
      } catch (e) {
        if (e.fatal) throw e;
        ctx.failed.add(r.id);
        console.log(`  ! skipped TMDB ${r.id} (${r.title}): ${e.message}`);
        continue;
      }
      if (rec.year == null) continue;
      rec.bucket = bucket.name;
      await applyRating(rec);
      ctx.movies.push(rec);
      known.add(rec.tmdbId);
      ctx.added++;
      ctx.dirty++;
      need--;
      got++;
      console.log(`  [${bucket.name}] ${got}/${got + need} + ${rec.title} (${rec.year})`);
      await checkpoint();
    }
  } catch (e) {
    if (e.fatal) throw e;
    ctx.aborted = `${e.message} while discovering "${bucket.name}" movies`;
    console.log(`  ! discovery stopped: ${ctx.aborted}`);
    return;
  }
  if (need > 0 && !ctx.stop && ctx.added < MAX_NEW) {
    ctx.shortfall[bucket.name] = need; // TMDB ran out of matching movies
    console.log(`  TMDB has no more matching movies for "${bucket.name}" (short by ${need}).`);
  }
}

// ---------------------------------------------------------------- modes
async function runMain() {
  const known = new Set(ctx.movies.map(tmdbIdOf).filter((x) => x != null));
  const knownTitles = new Set(ctx.movies.filter((m) => tmdbIdOf(m) == null).map((m) => titleKey(m.title, m.year)));
  for (const bucket of BUCKETS) {
    if (ctx.stop || ctx.added >= MAX_NEW || ctx.aborted) break;
    await runBucket(bucket, known, knownTitles);
  }
}

// Add the V2 fields to older records without touching any value they already have.
async function runBackfill() {
  const targets = ctx.movies.filter((m) => tmdbIdOf(m) != null && m.productionCompanies === undefined);
  const skipped = ctx.movies.filter((m) => tmdbIdOf(m) == null).length;
  console.log(`Backfilling ${targets.length} records (${skipped} sample records without a TMDB ID are left alone)`);
  const addOnly = ["originalTitle", "teluguTitle", "altTitles", "releaseDate", "productionCompanies", "voteCount"];
  const fillIfEmpty = ["year", "director", "posterUrl", "imdbId"];
  let done = 0;
  for (const rec of targets) {
    if (ctx.stop) break;
    let fresh;
    try {
      fresh = await fetchDetails(tmdbIdOf(rec));
    } catch (e) {
      if (e.fatal) throw e;
      console.log(`  ! skipped ${rec.title}: ${e.message}`);
      continue;
    }
    for (const k of addOnly) if (rec[k] === undefined) rec[k] = fresh[k];
    for (const k of fillIfEmpty) if (rec[k] == null && fresh[k] != null) rec[k] = fresh[k];
    for (const k of ["cast", "genres"]) if (!rec[k]?.length && fresh[k]?.length) rec[k] = fresh[k];
    ctx.dirty++;
    done++;
    if (done % 10 === 0) console.log(`  backfilled ${done}/${targets.length}`);
    await checkpoint();
  }
  console.log(`Backfilled ${done} records.`);
}

// Fill missing IMDb ratings for movies already in the file.
async function runOmdbOnly() {
  const todo = ctx.movies.filter((m) => m.imdbRating == null && !m.ratingChecked);
  console.log(`${todo.length} movies without a checked rating`);
  let filled = 0;
  for (const rec of todo) {
    if (ctx.stop || omdb.exhausted || !omdb.usable) break;
    const before = rec.imdbRating;
    if (rec.imdbId) {
      await applyRating(rec);
    } else {
      // No IMDb ID: try title + year, but only trust a match listed as Telugu.
      let d = null;
      try {
        d = await omdbRaw({ t: rec.title, y: String(rec.year), type: "movie" });
      } catch {}
      if (d?.Response === "True" && /telugu/i.test(d.Language || "")) {
        rec.imdbId = d.imdbID || null;
        rec.imdbRating = num(d.imdbRating);
        if (!rec.posterUrl && d.Poster && d.Poster !== "N/A") rec.posterUrl = d.Poster;
        rec.ratingChecked = true;
      } else if (/limit/i.test(d?.Error || "")) {
        omdb.exhausted = true;
      }
    }
    if (rec.imdbRating !== before) {
      filled++;
      console.log(`  rating ${rec.imdbRating} for ${rec.title} (${rec.year})`);
    }
    ctx.dirty++;
    await checkpoint();
  }
  console.log(`Filled ${filled} ratings.`);
  if (omdb.exhausted) console.log("OMDb daily limit reached (free keys allow 1,000 requests/day). Run this again tomorrow.");
}

// ---------------------------------------------------------------- report
function report(existingCount) {
  const m = ctx.movies;
  const period = { "before 2000": 0, "2000-2010": 0, "2011-2020": 0, "2021-2026": 0, unknown: 0 };
  for (const r of m) {
    const e = eraOfYear(r.year);
    period[e === "classic" ? "before 2000" : e || "unknown"]++;
  }
  const buckets = {};
  for (const r of m) buckets[bucketOf(r) ?? "unknown"] = (buckets[bucketOf(r) ?? "unknown"] || 0) + 1;
  console.log("\n==== Report ====");
  console.log(`Existing movies : ${existingCount}`);
  console.log(`Newly added     : ${ctx.added}`);
  console.log(`Final total     : ${m.length}`);
  console.log("By release period:", JSON.stringify(period));
  console.log("By bucket (target):", BUCKETS.map((b) => `${b.name} ${buckets[b.name] || 0}/${b.target}`).join(", "));
  console.log(
    `Missing: ratings ${m.filter((r) => r.imdbRating == null).length}, posters ${m.filter((r) => !r.posterUrl).length}, ` +
      `directors ${m.filter((r) => !r.director).length}, cast ${m.filter((r) => !r.cast?.length).length}`
  );
  if (ctx.failed.size) console.log(`Skipped after retries (will be tried again next run): ${ctx.failed.size}`);
  if (Object.keys(ctx.shortfall).length) console.log("TMDB had too few matching movies for:", JSON.stringify(ctx.shortfall));
  if (omdb.exhausted) console.log("OMDb daily limit hit: some ratings are missing. Run `npm run fetch-data:ratings` tomorrow.");
  if (ctx.aborted) console.log(`Run ended early: ${ctx.aborted}. Progress was saved; run again to continue.`);
}

// ---------------------------------------------------------------- main
const mode = has("omdb-only") ? "omdb" : has("backfill") ? "backfill" : "main";

if (mode !== "omdb" && !TMDB_KEY) {
  console.error("TMDB_API_KEY is missing (set it in .env or the shell).");
  process.exit(1);
}
if (mode === "omdb" && !OMDB_KEY) {
  console.error("OMDB_API_KEY is missing (set it in .env or the shell).");
  process.exit(1);
}

ctx.movies = await loadExisting();
const existingCount = ctx.movies.length;
console.log(`Loaded ${existingCount} existing movies from ${DATA_FILE}`);

if (mode !== "omdb") {
  console.log("Checking connection to TMDB...");
  try {
    await tmdb("/configuration", {}, { tries: 2 }); // fail fast instead of retrying for minutes
  } catch (e) {
    console.error(`Cannot use TMDB: ${e.message}. Your data file was not changed.`);
    if (e.fatal) console.error("Use the v3 'API Key' from TMDB settings, not the Read Access Token.");
    else console.error("TMDB may be blocked on your network: try a phone hotspot or another DNS (1.1.1.1).");
    process.exit(1);
  }
}

omdb.problem = await checkOmdbKey();
omdb.usable = !omdb.problem;
if (omdb.problem) {
  console.log(`WARNING: OMDb not usable (${omdb.problem}); new movies will have no IMDb rating until you fix it and run fetch-data:ratings.`);
  if (/invalid api key/i.test(omdb.problem)) console.log("  Click the activation link OMDb emailed you, and check the key.");
  if (mode === "omdb") process.exit(1);
}

let exitCode = 0;
try {
  if (mode === "main") await runMain();
  else if (mode === "backfill") await runBackfill();
  else await runOmdbOnly();
} catch (e) {
  exitCode = 1;
  console.error(`\nStopped: ${e.message}`);
} finally {
  await checkpoint(true); // keep everything gathered so far
}
report(existingCount);
if (ctx.aborted) exitCode = 1;
process.exit(exitCode);
