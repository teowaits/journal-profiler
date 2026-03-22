/**
 * analytics.js — pure computation functions
 * No fetch calls, no UI, no side effects.
 * All inputs are plain JS objects/arrays; all outputs are plain JS objects.
 */

import {
  BASELINE_YEARS,
  JSD_THRESHOLDS,
  HHI_THRESHOLDS,
  INSTITUTION_SURGE_THRESHOLDS,
  INTRA_CITE_THRESHOLDS,
  REF_ALIGNMENT_THRESHOLDS,
  ARTICLE_COUNT_VAR_THRESHOLD,
  ARTICLE_ALIGN_THRESHOLDS,
  DRIFT_LABELS,
  CONCENTRATION_LABELS,
  INTRA_CITE_LABELS,
  REF_ALIGN_LABELS,
} from "./constants.js";

// ─── Topic distribution ───────────────────────────────────────────────────────

/**
 * Build a topic distribution from an array of works.
 * @param {object[]} works
 * @returns {Object.<string, { id, name, subfield, field, domain, count, pct }>}
 */
export function computeTopicDistribution(works) {
  const counts = {};
  let total = 0;

  for (const work of works) {
    const t = work.primary_topic;
    if (!t?.id) continue;
    if (!counts[t.id]) {
      counts[t.id] = {
        id: t.id,
        name: t.display_name,
        subfield: t.subfield ?? null,
        field: t.field ?? null,
        domain: t.domain ?? null,
        count: 0,
        pct: 0,
      };
    }
    counts[t.id].count++;
    total++;
  }

  if (total > 0) {
    for (const entry of Object.values(counts)) {
      entry.pct = entry.count / total;
    }
  }

  return counts;
}

/**
 * Aggregate multiple per-year topic distributions into one.
 * @param {object[]} distributions — array of objects from computeTopicDistribution
 * @returns {Object.<string, { id, name, subfield, field, domain, count, pct }>}
 */
export function aggregateDistributions(distributions) {
  const merged = {};
  let total = 0;

  for (const dist of distributions) {
    for (const [id, entry] of Object.entries(dist)) {
      if (!merged[id]) {
        merged[id] = { ...entry, count: 0, pct: 0 };
      }
      merged[id].count += entry.count;
      total += entry.count;
    }
  }

  if (total > 0) {
    for (const entry of Object.values(merged)) {
      entry.pct = entry.count / total;
    }
  }

  return merged;
}

// ─── Jensen-Shannon Divergence ────────────────────────────────────────────────

/**
 * Compute JSD between two topic distributions.
 * JSD is symmetric and bounded [0, 1] (using log base 2).
 * 0 = identical distributions, 1 = no shared topics at all.
 *
 * @param {object} distA — from computeTopicDistribution
 * @param {object} distB — from computeTopicDistribution
 * @returns {number} JSD in [0, 1]
 */
export function computeJSDivergence(distA, distB) {
  const allTopics = new Set([...Object.keys(distA), ...Object.keys(distB)]);
  if (allTopics.size === 0) return 0;

  let jsd = 0;
  for (const id of allTopics) {
    const p = distA[id]?.pct ?? 0;
    const q = distB[id]?.pct ?? 0;
    const m = (p + q) / 2;
    if (m === 0) continue;
    if (p > 0) jsd += p * Math.log2(p / m);
    if (q > 0) jsd += q * Math.log2(q / m);
  }

  // JSD = 0.5 * (KL(P||M) + KL(Q||M)), divide by 2 and clamp
  return Math.min(1, Math.max(0, jsd / 2));
}

// ─── Drift over time ──────────────────────────────────────────────────────────

/**
 * Compute year-over-year drift relative to a 5-year baseline aggregate.
 * The baseline is the first BASELINE_YEARS years of the provided data.
 *
 * @param {{ [year: string]: object[] }} worksPerYear — plain object, keys are year strings
 * @returns {{
 *   baselineYears: string[],
 *   baseline: object,
 *   measurements: Array<{ year, jsd, topicProfile, label }>
 * }}
 */
export function computeDriftOverTime(worksPerYear) {
  const years = Object.keys(worksPerYear).sort();

  const baselineYears = years.slice(0, BASELINE_YEARS);
  const measureYears  = years.slice(BASELINE_YEARS);

  const baselineDists = baselineYears.map(y => computeTopicDistribution(worksPerYear[y]));
  const baseline = aggregateDistributions(baselineDists);

  const measurements = measureYears.map(year => {
    const topicProfile = computeTopicDistribution(worksPerYear[year]);
    const jsd = computeJSDivergence(baseline, topicProfile);
    return { year, jsd, topicProfile, label: driftLabel(jsd) };
  });

  return { baselineYears, baseline, measurements };
}

function driftLabel(jsd) {
  if (jsd >= JSD_THRESHOLDS.NOTABLE)  return DRIFT_LABELS.notable;
  if (jsd >= JSD_THRESHOLDS.MODERATE) return DRIFT_LABELS.moderate;
  return DRIFT_LABELS.typical;
}

// ─── Country HHI ──────────────────────────────────────────────────────────────

/**
 * Compute HHI on country concentration for a set of works.
 * Uses country_code from author institutions. With ~200 possible countries,
 * the standard 0.25 threshold is meaningful (vs thousands of institutions).
 *
 * @param {object[]} works
 * @returns {{ hhi: number, label: string, countries: Array<{ code, name, count, share }> }}
 */
export function computeCountryHHI(works) {
  const counts = {};
  let total = 0;

  for (const work of works) {
    for (const authorship of (work.authorships ?? [])) {
      for (const inst of (authorship.institutions ?? [])) {
        const code = inst.country_code;
        if (!code) continue;
        counts[code] = (counts[code] ?? 0) + 1;
        total++;
      }
    }
  }

  if (total === 0) return { hhi: 0, label: CONCENTRATION_LABELS.typical, countries: [] };

  let regionNames;
  try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch { /* noop */ }

  let hhi = 0;
  const countries = [];
  for (const [code, count] of Object.entries(counts)) {
    const share = count / total;
    hhi += share * share;
    let name = code;
    try { name = regionNames?.of(code) ?? code; } catch { /* noop */ }
    countries.push({ code, name, count, share });
  }
  countries.sort((a, b) => b.count - a.count);

  const label = hhi >= HHI_THRESHOLDS.MODERATE
    ? CONCENTRATION_LABELS.outside
    : CONCENTRATION_LABELS.typical;

  return { hhi, label, countries };
}

// ─── Institution surge detection ──────────────────────────────────────────────

/**
 * Build a per-institution share map from an array of works.
 * @param {object[]} works
 * @returns {Object.<string, { name, count, share }>}
 */
export function buildInstitutionDist(works) {
  const counts = {};
  let total = 0;

  for (const work of works) {
    for (const authorship of (work.authorships ?? [])) {
      for (const inst of (authorship.institutions ?? [])) {
        const name = inst.display_name;
        if (!name) continue;
        counts[name] = (counts[name] ?? 0) + 1;
        total++;
      }
    }
  }

  const dist = {};
  for (const [name, count] of Object.entries(counts)) {
    dist[name] = { name, count, share: total > 0 ? count / total : 0 };
  }
  return dist;
}

/**
 * Flag institutions whose authorship share in yearWorks has jumped
 * notably compared to the baseline distribution.
 *
 * @param {object[]} yearWorks — works for a single measurement year
 * @param {Object.<string, { share }>} baselineDist — from buildInstitutionDist on baseline works
 * @returns {Array<{
 *   name: string,
 *   yearShare: number,
 *   yearCount: number,
 *   baselineShare: number,
 *   delta: number,
 *   isNew: boolean,   // not present in baseline at all
 * }>} sorted by delta descending
 */
export function computeInstitutionSurges(yearWorks, baselineDist) {
  const yearDist = buildInstitutionDist(yearWorks);
  const surges = [];

  for (const [name, yearEntry] of Object.entries(yearDist)) {
    if (yearEntry.share < INSTITUTION_SURGE_THRESHOLDS.MIN_SHARE) continue;
    const baselineShare = baselineDist[name]?.share ?? 0;
    const delta = yearEntry.share - baselineShare;
    if (delta >= INSTITUTION_SURGE_THRESHOLDS.DELTA) {
      surges.push({
        name,
        yearShare: yearEntry.share,
        yearCount: yearEntry.count,
        baselineShare,
        delta,
        isNew: !baselineDist[name],
      });
    }
  }

  return surges.sort((a, b) => b.delta - a.delta);
}

// ─── Intra-citation density ───────────────────────────────────────────────────

/**
 * Compute the share of references that point to other works in the same journal,
 * based on set-intersection with the fetched work IDs (within analysis window).
 *
 * Note: this approach captures within-window self-citation; it may slightly
 * underestimate true intra-citation density for references to pre-window articles.
 *
 * @param {object[]} works — all works for a given year
 * @param {Set<string>} allFetchedIds — set of all work IDs fetched in this analysis
 * @returns {{ density: number, selfCites: number, total: number, label: string }}
 */
export function computeIntraCitationDensity(works, allFetchedIds) {
  let selfCites = 0;
  let total = 0;

  for (const work of works) {
    for (const refId of (work.referenced_works ?? [])) {
      total++;
      if (allFetchedIds.has(refId)) selfCites++;
    }
  }

  const density = total > 0 ? selfCites / total : 0;

  let label;
  if (density >= INTRA_CITE_THRESHOLDS.NOTABLY_ELEVATED) label = INTRA_CITE_LABELS.notably;
  else if (density >= INTRA_CITE_THRESHOLDS.ELEVATED)    label = INTRA_CITE_LABELS.elevated;
  else                                                    label = INTRA_CITE_LABELS.typical;

  return { density, selfCites, total, label };
}

// ─── Article count YoY variation ──────────────────────────────────────────────

/**
 * Compute year-over-year article count variation relative to the baseline mean growth rate.
 * Measurement years deviating > ARTICLE_COUNT_VAR_THRESHOLD pp from baseline mean are flagged.
 *
 * @param {{ [year: string]: object[] }} worksPerYear
 * @param {string[]} baselineYears — sorted
 * @param {string[]} measureYears — sorted
 * @returns {{
 *   baselineAvgGrowth: number,
 *   perYear: { [year: string]: { count: number, yoyRate: number | null, label: string } }
 * }}
 */
export function computeArticleCountVariation(worksPerYear, baselineYears, measureYears) {
  const allYears = [...baselineYears, ...measureYears].sort();
  const counts = {};
  for (const y of allYears) counts[y] = (worksPerYear[y] ?? []).length;

  // YoY rates within baseline window (year[i-1] → year[i])
  const baselineRates = [];
  for (let i = 1; i < baselineYears.length; i++) {
    const prev = counts[baselineYears[i - 1]];
    const curr = counts[baselineYears[i]];
    if (prev > 0) baselineRates.push((curr - prev) / prev);
  }
  const baselineAvgGrowth = baselineRates.length > 0
    ? baselineRates.reduce((a, b) => a + b, 0) / baselineRates.length
    : 0;

  const perYear = {};
  for (const y of measureYears) {
    const idx = allYears.indexOf(y);
    const prevYear = idx > 0 ? allYears[idx - 1] : null;
    const count = counts[y];
    if (!prevYear || counts[prevYear] === 0) {
      perYear[y] = { count, yoyRate: null, label: CONCENTRATION_LABELS.typical };
      continue;
    }
    const yoyRate = (count - counts[prevYear]) / counts[prevYear];
    const deviation = Math.abs(yoyRate - baselineAvgGrowth);
    const label = deviation > ARTICLE_COUNT_VAR_THRESHOLD
      ? CONCENTRATION_LABELS.outside
      : CONCENTRATION_LABELS.typical;
    perYear[y] = { count, yoyRate, label };
  }

  return { baselineAvgGrowth, perYear, allCounts: counts };
}

// ─── Reference field alignment (optional Signal 2) ────────────────────────────

/**
 * For a single work, compare its primary field against the fields of its references.
 * Requires referenced works' topic data to already be fetched.
 *
 * @param {object} work — the article (must have primary_topic.field)
 * @param {object[]} referencedWorks — fetched referenced works with primary_topic
 * @returns {{ aligned: number, total: number, share: number, label: string }}
 */
export function computeArticleRefAlignment(work, referencedWorks) {
  const articleFieldId = work.primary_topic?.field?.id;
  if (!articleFieldId) return { aligned: 0, total: 0, share: 0, label: REF_ALIGN_LABELS.low };

  let aligned = 0;
  let total = 0;
  for (const ref of referencedWorks) {
    if (!ref.primary_topic?.field?.id) continue;
    total++;
    if (ref.primary_topic.field.id === articleFieldId) aligned++;
  }

  const share = total > 0 ? aligned / total : 0;
  const label = share >= REF_ALIGNMENT_THRESHOLDS.HIGH
    ? REF_ALIGN_LABELS.high
    : share >= REF_ALIGNMENT_THRESHOLDS.MODERATE
      ? REF_ALIGN_LABELS.moderate
      : REF_ALIGN_LABELS.low;

  return { aligned, total, share, label };
}

/**
 * Aggregate reference alignment across all works in a year.
 * @param {Array<{ aligned, total }>} perArticle
 * @returns {{ aligned: number, total: number, share: number, label: string }}
 */
export function aggregateRefAlignment(perArticle) {
  let aligned = 0, total = 0;
  for (const a of perArticle) { aligned += a.aligned; total += a.total; }
  const share = total > 0 ? aligned / total : 0;
  const label = share >= REF_ALIGNMENT_THRESHOLDS.HIGH
    ? REF_ALIGN_LABELS.high
    : share >= REF_ALIGNMENT_THRESHOLDS.MODERATE
      ? REF_ALIGN_LABELS.moderate
      : REF_ALIGN_LABELS.low;
  return { aligned, total, share, label };
}

// ─── Per-article divergence ───────────────────────────────────────────────────

/**
 * Compute how divergent a single article is relative to the journal's baseline.
 *
 * Score = 1 − baseline_share_of_article_topic.
 * High score (→ 1) = topic is rare or absent in baseline = divergent.
 * Low score (→ 0) = topic is dominant in baseline = well-aligned.
 *
 * baselineShare and topicRank must be pre-computed (see computeYearDivergences).
 *
 * @param {object} article — work object with primary_topic
 * @param {number} score — 1 − baselineShare, used for sorting (high = divergent)
 * @param {number} baselineShare — pct of baseline articles with this topic [0–1]
 * @param {number} topicRank — percentile rank within year by score [0–1]
 * @param {Set<string>} topFields — pre-computed top-5 field IDs from baseline
 * @returns {{ score, baselineShare, topicRank, fieldMatch, label }}
 */
export function computeArticleDivergence(article, score, baselineShare, topicRank, topFields) {
  const articleFieldId = article.primary_topic?.field?.id;
  const fieldMatch = !!articleFieldId && topFields.has(articleFieldId);
  const label =
    baselineShare >= ARTICLE_ALIGN_THRESHOLDS.TYPICAL  ? DRIFT_LABELS.typical :
    baselineShare >= ARTICLE_ALIGN_THRESHOLDS.LOW       ? DRIFT_LABELS.moderate :
    DRIFT_LABELS.notable;
  return { score, baselineShare, topicRank, fieldMatch, label };
}

/**
 * Compute alignment scores and percentile ranks for all articles in a year.
 * Runs in O(n log n) — scores computed once, sorted once.
 *
 * @param {object[]} works — all articles for one year
 * @param {object} baseline — aggregated topic distribution
 * @param {Set<string>} topFields — pre-computed top-5 field IDs from baseline
 * @returns {Array<{ score, baselineShare, topicRank, fieldMatch, label }>}
 */
export function computeYearDivergences(works, baseline, topFields) {
  // score = 1 − baseline share; high → rare in baseline → divergent
  const scores = works.map(article => {
    const topicId = article.primary_topic?.id;
    const share = topicId ? (baseline[topicId]?.pct ?? 0) : 0;
    return 1 - share;
  });

  // Sort ascending to derive percentile ranks (lower score = more aligned = lower rank)
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;

  return works.map((article, i) => {
    const score = scores[i];
    const baselineShare = 1 - score;
    const topicRank = n > 1 ? upperBound(sorted, score) / n : 0.5;
    return computeArticleDivergence(article, score, baselineShare, topicRank, topFields);
  });
}

export { topFiveFields };

// Returns index of first element > val (i.e. count of elements <= val)
function upperBound(sortedArr, val) {
  let lo = 0, hi = sortedArr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedArr[mid] <= val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function topFiveFields(dist) {
  const fieldTotals = {};
  for (const entry of Object.values(dist)) {
    const fid = entry.field?.id;
    if (!fid) continue;
    fieldTotals[fid] = (fieldTotals[fid] ?? 0) + entry.pct;
  }
  return new Set(
    Object.entries(fieldTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id)
  );
}

// ─── Peer comparison (Signal 5) ───────────────────────────────────────────────

/**
 * Compute JSD between the target journal's distribution and a peer cluster centroid.
 * The centroid is the average distribution across all peer journals.
 *
 * @param {object} targetDist — from computeTopicDistribution
 * @param {object[]} peerDists — array of distributions, one per peer journal
 * @returns {{ jsd: number, centroid: object, label: string }}
 */
export function computePeerDivergence(targetDist, peerDists) {
  if (peerDists.length === 0) return { jsd: 0, centroid: {}, label: DRIFT_LABELS.typical };
  const centroid = aggregateDistributions(peerDists);
  // Normalize centroid so shares sum to 1 (aggregateDistributions already does this)
  const jsd = computeJSDivergence(targetDist, centroid);
  return { jsd, centroid, label: driftLabel(jsd) };
}

// ─── Composite profile summary ────────────────────────────────────────────────

/**
 * Produce the composite profile row for a single journal-year.
 *
 * @param {{
 *   jsd: number,
 *   hhi: number,
 *   intraCiteDensity: number,
 *   refAlignShare: number | null,  // null if Signal 2 not run
 * }} metrics
 * @returns {{
 *   topicAlignment: string,
 *   refAlignment: string | null,
 *   institutionalProfile: string,
 *   intraCitation: string,
 * }}
 */
export function compositeProfileLabels(metrics) {
  return {
    topicAlignment:       driftLabel(metrics.jsd),
    refAlignment:         metrics.refAlignShare != null
                            ? (metrics.refAlignShare >= REF_ALIGNMENT_THRESHOLDS.HIGH
                                ? REF_ALIGN_LABELS.high
                                : metrics.refAlignShare >= REF_ALIGNMENT_THRESHOLDS.MODERATE
                                  ? REF_ALIGN_LABELS.moderate
                                  : REF_ALIGN_LABELS.low)
                            : null,
    institutionalProfile: metrics.hhi >= HHI_THRESHOLDS.MODERATE
                            ? CONCENTRATION_LABELS.outside
                            : CONCENTRATION_LABELS.typical,
    intraCitation:        metrics.intraCiteDensity >= INTRA_CITE_THRESHOLDS.NOTABLY_ELEVATED
                            ? INTRA_CITE_LABELS.notably
                            : metrics.intraCiteDensity >= INTRA_CITE_THRESHOLDS.ELEVATED
                              ? INTRA_CITE_LABELS.elevated
                              : INTRA_CITE_LABELS.typical,
  };
}
