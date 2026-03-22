/**
 * api.js — all OpenAlex fetch logic
 * No UI, no analytics computation. Pure data retrieval.
 */

import {
  OPENALEX_BASE,
  OPENALEX_MAILTO,
  PER_PAGE,
  PAGE_DELAY_MS,
  MAX_PAGES,
  BATCH_SIZE,
} from "./constants.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Append mailto param once (for OpenAlex polite pool — higher rate limits)
function withMailto(url) {
  if (!OPENALEX_MAILTO) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}mailto=${encodeURIComponent(OPENALEX_MAILTO)}`;
}

// ─── Generic fetch ─────────────────────────────────────────────────────────────

async function apiFetch(url, signal) {
  const res = await fetch(withMailto(url), { signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAlex API ${res.status}: ${txt.slice(0, 120)}`);
  }
  return res.json();
}

// ─── Journal / source search ───────────────────────────────────────────────────

/**
 * Search for journals by name. Returns up to 8 results.
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<object[]>}
 */
export async function searchSources(query, signal) {
  const url =
    `${OPENALEX_BASE}/sources?search=${encodeURIComponent(query)}&per_page=8` +
    `&select=id,display_name,issn_l,works_count,host_organization`;
  const data = await apiFetch(url, signal);
  return data.results ?? [];
}

/**
 * Fetch a single source by its OpenAlex ID.
 * @param {string} sourceId
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export async function fetchSource(sourceId, signal) {
  const sid = stripBase(sourceId);
  const url =
    `${OPENALEX_BASE}/sources/${sid}` +
    `?select=id,display_name,issn_l,works_count,type,host_organization,apc_usd,country_code`;
  return apiFetch(url, signal);
}

// ─── Article fetch ─────────────────────────────────────────────────────────────

/**
 * Fetch all articles for a journal within a year range.
 * Articles are returned grouped by year.
 *
 * @param {string} sourceId — OpenAlex source ID
 * @param {number} fromYear
 * @param {number} toYear
 * @param {{ onProgress: function, onLog: function }} callbacks
 * @param {AbortSignal} [signal]
 * @returns {Promise<{
 *   worksPerYear: { [year: string]: object[] },
 *   allWorkIds: Set<string>,
 *   truncatedYears: string[],
 * }>}
 */
export async function fetchArticlesForJournal(sourceId, fromYear, toYear, { onProgress, onLog }, signal) {
  const sid = stripBase(sourceId);
  const worksPerYear = {};
  const allWorkIds = new Set();
  const truncatedYears = [];

  for (let year = fromYear; year <= toYear; year++) {
    if (signal?.aborted) throw new Error("Cancelled");

    const filter =
      `primary_location.source.id:${sid}` +
      `,publication_year:${year}` +
      `,type:article`;

    // Step 1: get count
    const meta = await apiFetch(
      `${OPENALEX_BASE}/works?filter=${filter}&per_page=1&select=id`,
      signal
    );
    const total = meta.meta?.count ?? 0;
    onLog?.(`${year}: ${total} articles found`);

    if (total === 0) {
      worksPerYear[String(year)] = [];
      continue;
    }

    const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGES);
    const truncated = total > MAX_PAGES * PER_PAGE;
    if (truncated) truncatedYears.push(String(year));

    const yearWorks = [];

    for (let page = 1; page <= pages; page++) {
      if (signal?.aborted) throw new Error("Cancelled");

      const data = await apiFetch(
        `${OPENALEX_BASE}/works?filter=${filter}` +
        `&per_page=${PER_PAGE}&page=${page}` +
        `&select=id,title,doi,publication_year,authorships,` +
        `primary_location,primary_topic,referenced_works`,
        signal
      );

      const works = data.results ?? [];
      if (works.length === 0) break;

      for (const w of works) {
        if (w.id) allWorkIds.add(w.id);
        yearWorks.push(w);
      }

      onProgress?.({ year, page, pages, total });
      onLog?.(`${year}: page ${page}/${pages}`);

      if (page < pages) await sleep(PAGE_DELAY_MS);
    }

    worksPerYear[String(year)] = yearWorks;
  }

  return { worksPerYear, allWorkIds, truncatedYears };
}

// ─── Batch reference fetch (Signal 2 — optional) ──────────────────────────────

/**
 * Fetch full topic data for a list of work IDs, in batches of BATCH_SIZE.
 * Used for reference field alignment analysis.
 *
 * @param {string[]} workIds
 * @param {{ onProgress: function, onLog: function }} callbacks
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ [workId: string]: object }>}  work objects keyed by ID
 */
export async function fetchWorksById(workIds, { onProgress, onLog }, signal) {
  const result = {};
  const chunks = chunkArray(workIds, BATCH_SIZE);

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error("Cancelled");

    const ids = chunks[i].map(id => stripBase(id)).join("|");
    const data = await apiFetch(
      `${OPENALEX_BASE}/works?filter=openalex_id:${ids}` +
      `&per_page=${BATCH_SIZE}` +
      `&select=id,primary_topic,primary_location`,
      signal
    );

    for (const w of (data.results ?? [])) {
      if (w.id) result[w.id] = w;
    }

    onProgress?.({ batch: i + 1, total: chunks.length });
    onLog?.(`Reference fetch: batch ${i + 1}/${chunks.length}`);

    if (i < chunks.length - 1) await sleep(PAGE_DELAY_MS);
  }

  return result;
}

// ─── Self-citation check (total, including outside window) ────────────────────

/**
 * Given a list of referenced work IDs, return the subset whose primary_location
 * is the specified source journal. Used to compute total self-citation rate
 * including references outside the analysis window.
 *
 * Batches in groups of BATCH_SIZE. Each batch is at most BATCH_SIZE results
 * so per_page=BATCH_SIZE guarantees one page per request.
 *
 * @param {string[]} refIds — unique referenced work IDs to check
 * @param {string} sourceId — OpenAlex source ID of the journal
 * @param {{ onLog: function }} callbacks
 * @param {AbortSignal} [signal]
 * @returns {Promise<Set<string>>} set of work IDs (from refIds) that belong to the source
 */
export async function fetchSelfCiteIds(refIds, sourceId, { onLog }, signal) {
  const sid = stripBase(sourceId);
  const chunks = chunkArray(refIds, BATCH_SIZE);
  const selfCiteSet = new Set();

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error("Cancelled");

    const ids = chunks[i].map(id => stripBase(id)).join("|");
    const data = await apiFetch(
      `${OPENALEX_BASE}/works?filter=openalex_id:${ids},primary_location.source.id:${sid}` +
      `&per_page=${BATCH_SIZE}&select=id`,
      signal
    );

    for (const w of (data.results ?? [])) {
      if (w.id) selfCiteSet.add(w.id);
    }

    onLog?.(`Self-cite check: batch ${i + 1}/${chunks.length}`);
    if (i < chunks.length - 1) await sleep(PAGE_DELAY_MS);
  }

  return selfCiteSet;
}

// ─── Peer journal search (Signal 5 — optional) ────────────────────────────────

/**
 * Fetch articles for a list of peer journal IDs, for a given year range.
 * Returns worksPerJournal keyed by source ID.
 *
 * @param {string[]} sourceIds
 * @param {number} fromYear
 * @param {number} toYear
 * @param {{ onProgress: function, onLog: function }} callbacks
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ [sourceId: string]: object[] }>}
 */
export async function fetchPeerArticles(sourceIds, fromYear, toYear, { onProgress, onLog }, signal) {
  const worksPerJournal = {};

  for (const sourceId of sourceIds) {
    if (signal?.aborted) throw new Error("Cancelled");
    const sid = stripBase(sourceId);

    const filter =
      `primary_location.source.id:${sid}` +
      `,publication_year:${fromYear}-${toYear}` +
      `,type:article`;

    const meta = await apiFetch(
      `${OPENALEX_BASE}/works?filter=${filter}&per_page=1&select=id`,
      signal
    );
    const total = meta.meta?.count ?? 0;
    onLog?.(`Peer ${sid}: ${total} articles`);

    const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGES);
    const allWorks = [];

    for (let page = 1; page <= pages; page++) {
      if (signal?.aborted) throw new Error("Cancelled");

      const data = await apiFetch(
        `${OPENALEX_BASE}/works?filter=${filter}` +
        `&per_page=${PER_PAGE}&page=${page}` +
        `&select=id,primary_topic`,
        signal
      );

      allWorks.push(...(data.results ?? []));
      onProgress?.({ sourceId, page, pages });

      if (page < pages) await sleep(PAGE_DELAY_MS);
    }

    worksPerJournal[sourceId] = allWorks;
  }

  return worksPerJournal;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function stripBase(id) {
  return id?.replace("https://openalex.org/", "") ?? id;
}

function chunkArray(arr, n) {
  return Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );
}
