/**
 * useAnalysis.js — run/cancel/progress state machine
 * Orchestrates API calls and analytics computation.
 * Returns state and actions to App.jsx.
 *
 * Two-phase model:
 *   Phase 1 (run)        — group_by + ID/refs fetch + cited_by self-cite → all tabs except Articles
 *   Phase 2 (runArticles) — full article fetch → Articles tab
 */

import { useCallback, useRef, useState } from "react";
import {
  fetchGroupByYear,
  fetchArticleIdsAndRefs,
  fetchTopicMetadata,
  fetchArticlesForJournal,
  fetchWorksById,
  fetchPeerArticles,
  fetchSelfCiteIds,
} from "../api.js";
import {
  buildTopicProfileFromGroups,
  computeDriftOverTime,
  computeCountryHHI,
  buildInstitutionDist,
  computeInstitutionSurgesFromDist,
  computeIntraCitationDensity,
  computeArticleCountVariationFromCounts,
  computeYearDivergences,
  topFiveFields,
  computeArticleRefAlignment,
  aggregateRefAlignment,
  computePeerDivergence,
  computeTopicDistribution,
} from "../analytics.js";

import { BASELINE_YEARS, INTRA_CITE_THRESHOLDS, INTRA_CITE_LABELS } from "../constants.js";

const initialState = {
  phase: "idle",           // idle | running | done | error
  articlesPhase: "idle",   // idle | running | done — Phase 2
  errorMsg: "",
  log: [],
  progress: { year: null, page: 0, pages: 0, totalYears: 0, doneYears: 0 },

  // Phase 1 results
  topicProfilePerYear: {},
  driftResult: null,
  authorProfilePerYear: {},
  institutionSurgesPerYear: {},
  intraCitationPerYear: {},
  totalSelfCitePerYear: {},
  articleCountVariation: null,
  countsPerYear: {},        // { [year]: number } — total article count per year
  worksLitePerYear: {},     // { [year]: { id, referenced_works, authorships }[] } — Phase 1 works

  // Phase 2 results (optional)
  worksPerYear: {},
  divergentArticles: [],

  // Optional: reference alignment (requires Phase 2)
  refAlignmentPerYear: {},

  // Optional: peer comparison
  peerDivergence: null,

  // Meta
  truncatedYears: [],
};

export function useAnalysis() {
  const [state, setState] = useState(initialState);
  const abortRef    = useRef(null);
  const optAbortRef = useRef(null);

  // Store journal + yearRange so runArticles can be called without re-passing args
  const journalRef   = useRef(null);
  const yearRangeRef = useRef(null);

  const patch = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const addLog = useCallback((msg) => {
    setState(prev => ({ ...prev, log: [...prev.log.slice(-50), msg] }));
  }, []);

  // ─── Phase 1: aggregate signals (group_by + ID/refs + total self-cite) ───────

  const run = useCallback(async (journal, yearRange) => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    journalRef.current   = journal;
    yearRangeRef.current = yearRange;

    setState({
      ...initialState,
      phase: "running",
      progress: {
        year: null, page: 0, pages: 0,
        totalYears: yearRange.to - yearRange.from + 1,
        doneYears: 0,
      },
    });

    try {
      const years = [];
      for (let y = yearRange.from; y <= yearRange.to; y++) years.push(String(y));

      // ── Step 1: topic group_by — one call per year ───────────────────────────
      addLog("Fetching topic profiles…");
      const topicGroupsPerYear = {};

      for (let i = 0; i < years.length; i++) {
        const year = years[i];
        if (signal.aborted) throw new Error("Cancelled");

        topicGroupsPerYear[year] = await fetchGroupByYear(journal.id, year, "primary_topic.id", signal);
        addLog(`${year}: topic profile fetched`);
        if (i < years.length - 1) await new Promise(r => setTimeout(r, 60));
      }

      // ── Step 2: lightweight article fetch (id + refs + authorships) ──────────
      addLog("Fetching article IDs, references and authorships…");
      const { worksLitePerYear, allWorkIds, countsPerYear, truncatedYears } =
        await fetchArticleIdsAndRefs(
          journal.id,
          yearRange.from,
          yearRange.to,
          {
            onProgress: ({ year, page, pages }) => {
              setState(prev => ({
                ...prev,
                progress: {
                  ...prev.progress,
                  year,
                  page,
                  pages,
                  doneYears: page === pages
                    ? prev.progress.doneYears + 1
                    : prev.progress.doneYears,
                },
              }));
            },
            onLog: addLog,
          },
          signal
        );

      if (signal.aborted) throw new Error("Cancelled");
      addLog("Computing signals…");

      // ── Step 3: topic metadata enrichment ────────────────────────────────────
      const uniqueTopicIds = new Set();
      for (const groups of Object.values(topicGroupsPerYear)) {
        for (const { key } of groups) { if (key) uniqueTopicIds.add(key); }
      }
      addLog(`Enriching ${uniqueTopicIds.size} topic IDs…`);
      const topicMeta = await fetchTopicMetadata(uniqueTopicIds, signal);

      // ── Step 4: build topic profiles ──────────────────────────────────────────
      const topicProfilePerYear = {};
      for (const year of years) {
        topicProfilePerYear[year] = buildTopicProfileFromGroups(
          topicGroupsPerYear[year], topicMeta
        );
      }

      // ── Step 5: topic drift ───────────────────────────────────────────────────
      const driftResult = computeDriftOverTime(topicProfilePerYear);
      const { baselineYears, measurements } = driftResult;
      const measureYears = measurements.map(m => m.year);

      // ── Step 6: country HHI per year (from Phase 1 authorships) ─────────────
      const authorProfilePerYear = {};
      for (const year of years) {
        authorProfilePerYear[year] = computeCountryHHI(worksLitePerYear[year] ?? []);
      }

      // ── Step 7: institution dist + baseline + surge detection ─────────────────
      const institutionDistPerYear = {};
      for (const year of years) {
        institutionDistPerYear[year] = buildInstitutionDist(worksLitePerYear[year] ?? []);
      }

      // Aggregate baseline institution dist across all baseline years
      const baselineInstDist = {};
      let baselineInstTotal = 0;
      for (const year of baselineYears) {
        for (const [name, entry] of Object.entries(institutionDistPerYear[year] ?? {})) {
          if (baselineInstDist[name]) {
            baselineInstDist[name].count += entry.count;
          } else {
            baselineInstDist[name] = { name, count: entry.count, share: 0 };
          }
          baselineInstTotal += entry.count;
        }
      }
      if (baselineInstTotal > 0) {
        for (const entry of Object.values(baselineInstDist)) {
          entry.share = entry.count / baselineInstTotal;
        }
      }

      const institutionSurgesPerYear = {};
      for (const year of measureYears) {
        institutionSurgesPerYear[year] = computeInstitutionSurgesFromDist(
          institutionDistPerYear[year] ?? {},
          baselineInstDist
        );
      }

      // ── Step 8: within-window self-citation ───────────────────────────────────
      const intraCitationPerYear = {};
      for (const year of years) {
        intraCitationPerYear[year] = computeIntraCitationDensity(
          worksLitePerYear[year] ?? [],
          allWorkIds
        );
      }

      // ── Step 9: total self-citation (measurement years, all reference years) ──
      // Deduplicate reference IDs across ALL measurement years before hitting the API.
      // A foundational paper cited every year is only checked once.
      addLog("Computing total self-citation rate…");
      const totalSelfCitePerYear = {};

      const globalUniqueRefIds = new Set();
      for (const year of measureYears) {
        for (const work of (worksLitePerYear[year] ?? [])) {
          for (const refId of (work.referenced_works ?? [])) globalUniqueRefIds.add(refId);
        }
      }

      if (globalUniqueRefIds.size > 0) {
        addLog(`Checking ${globalUniqueRefIds.size.toLocaleString()} unique references for self-citation…`);
        const globalSelfCiteIds = await fetchSelfCiteIds(
          [...globalUniqueRefIds], journal.id, { onLog: addLog }, signal
        );

        for (const year of measureYears) {
          const works     = worksLitePerYear[year] ?? [];
          const totalRefs = works.reduce((n, w) => n + (w.referenced_works?.length ?? 0), 0);
          let selfCites = 0;
          for (const work of works) {
            for (const refId of (work.referenced_works ?? [])) {
              if (globalSelfCiteIds.has(refId)) selfCites++;
            }
          }
          const density = totalRefs > 0 ? selfCites / totalRefs : 0;
          let label;
          if (density >= INTRA_CITE_THRESHOLDS.NOTABLY_ELEVATED) label = INTRA_CITE_LABELS.notably;
          else if (density >= INTRA_CITE_THRESHOLDS.ELEVATED)     label = INTRA_CITE_LABELS.elevated;
          else                                                     label = INTRA_CITE_LABELS.typical;
          totalSelfCitePerYear[year] = { selfCites, total: totalRefs, density, label };
          addLog(`${year}: ${selfCites} self-cites / ${totalRefs} total refs`);
        }
      } else {
        for (const year of measureYears) {
          totalSelfCitePerYear[year] = { selfCites: 0, total: 0, density: 0, label: INTRA_CITE_LABELS.typical };
        }
      }

      // ── Step 10: article count variation ──────────────────────────────────────
      const articleCountVariation = computeArticleCountVariationFromCounts(
        countsPerYear, baselineYears, measureYears
      );

      setState(prev => ({
        ...prev,
        phase: "done",
        topicProfilePerYear,
        driftResult,
        authorProfilePerYear,
        institutionSurgesPerYear,
        intraCitationPerYear,
        totalSelfCitePerYear,
        articleCountVariation,
        countsPerYear,
        worksLitePerYear,
        truncatedYears,
        progress: { ...prev.progress, doneYears: years.length },
      }));
      addLog("Analysis complete.");

    } catch (err) {
      if (err.message === "Cancelled") {
        patch({ phase: "idle" });
        addLog("Cancelled.");
      } else {
        patch({ phase: "error", errorMsg: err.message });
        addLog(`Error: ${err.message}`);
      }
    }
  }, [addLog, patch]);

  // ─── Phase 2: full article fetch → Articles tab ──────────────────────────────

  const runArticles = useCallback(async () => {
    const journal   = journalRef.current;
    const yearRange = yearRangeRef.current;
    if (!journal || !yearRange) return;

    optAbortRef.current = new AbortController();
    const signal = optAbortRef.current.signal;

    patch({ articlesPhase: "running" });
    addLog("Loading article detail…");

    try {
      const { worksPerYear } = await fetchArticlesForJournal(
        journal.id,
        yearRange.from,
        yearRange.to,
        { onLog: addLog },
        signal
      );

      if (signal.aborted) throw new Error("Cancelled");
      addLog("Computing article divergence scores…");

      setState(prev => {
        const { driftResult } = prev;
        if (!driftResult) return { ...prev, articlesPhase: "done", worksPerYear };

        const baseline        = driftResult.baseline;
        const measureYears    = driftResult.measurements.map(m => m.year);
        const baselineTopFields = topFiveFields(baseline);

        const divergentArticles = [];
        for (const year of measureYears) {
          const works = worksPerYear[year] ?? [];
          const divs  = computeYearDivergences(works, baseline, baselineTopFields);
          for (let i = 0; i < works.length; i++) {
            divergentArticles.push({ ...works[i], _divergence: divs[i] });
          }
        }
        divergentArticles.sort((a, b) => b._divergence.score - a._divergence.score);

        return { ...prev, articlesPhase: "done", worksPerYear, divergentArticles };
      });

      addLog("Article detail loaded.");

    } catch (err) {
      if (err.message === "Cancelled") {
        patch({ articlesPhase: "idle" });
        addLog("Cancelled.");
      } else {
        patch({ articlesPhase: "error", errorMsg: err.message });
        addLog(`Error loading article detail: ${err.message}`);
      }
    }
  }, [addLog, patch]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    optAbortRef.current?.abort();
  }, []);

  // ─── Optional: reference alignment (Signal 2) — requires Phase 2 ────────────

  const runRefAlignment = useCallback(async (worksPerYear, measureYears, journalId) => {
    optAbortRef.current = new AbortController();
    const signal = optAbortRef.current.signal;
    addLog("Running reference field alignment…");

    try {
      const refAlignmentPerYear = {};

      for (const year of [...measureYears].sort()) {
        if (signal.aborted) throw new Error("Cancelled");
        const works = worksPerYear[year] ?? [];

        const allRefIds = [...new Set(works.flatMap(w => w.referenced_works ?? []))];
        if (allRefIds.length === 0) {
          refAlignmentPerYear[year] = { aligned: 0, total: 0, share: 0, label: "Low" };
          continue;
        }

        const refMap = await fetchWorksById(allRefIds, { onLog: addLog }, signal);

        const perArticle = works.map(article => {
          const refs = (article.referenced_works ?? []).map(id => refMap[id]).filter(Boolean);
          return computeArticleRefAlignment(article, refs);
        });

        refAlignmentPerYear[year] = aggregateRefAlignment(perArticle);

        setState(prev => {
          const updated = prev.divergentArticles.map(a => {
            if (String(a.publication_year) !== String(year)) return a;
            const refs = (a.referenced_works ?? []).map(id => refMap[id]).filter(Boolean);
            return { ...a, _refAlignment: computeArticleRefAlignment(a, refs) };
          });
          return { ...prev, divergentArticles: updated };
        });
      }

      patch({ refAlignmentPerYear });
      addLog("Reference field alignment complete.");

    } catch (err) {
      if (err.message !== "Cancelled") {
        addLog(`Error: ${err.message}`);
      }
    }
  }, [addLog, patch]);

  // ─── Restore from sessionStorage ─────────────────────────────────────────────

  const restore = useCallback((analysis) => {
    const hasArticles = Object.keys(analysis.worksPerYear ?? {}).length > 0;
    setState({
      ...initialState,
      phase:                    "done",
      articlesPhase:            hasArticles ? "done" : "idle",
      topicProfilePerYear:      analysis.topicProfilePerYear      ?? {},
      driftResult:              analysis.driftResult              ?? null,
      authorProfilePerYear:     analysis.authorProfilePerYear     ?? {},
      institutionSurgesPerYear: analysis.institutionSurgesPerYear ?? {},
      intraCitationPerYear:     analysis.intraCitationPerYear     ?? {},
      totalSelfCitePerYear:     analysis.totalSelfCitePerYear     ?? {},
      articleCountVariation:    analysis.articleCountVariation    ?? null,
      countsPerYear:            analysis.countsPerYear            ?? {},
      worksLitePerYear:         analysis.worksLitePerYear         ?? {},
      worksPerYear:             analysis.worksPerYear             ?? {},
      divergentArticles:        analysis.divergentArticles        ?? [],
      truncatedYears:           analysis.truncatedYears           ?? [],
      refAlignmentPerYear:      analysis.refAlignmentPerYear      ?? {},
    });
    // Re-populate refs so runArticles knows where to re-fetch if needed
    if (analysis.journal)   journalRef.current   = analysis.journal;
    if (analysis.yearRange) yearRangeRef.current = analysis.yearRange;
  }, []);

  // ─── Optional: peer comparison (Signal 5) ────────────────────────────────────

  const runPeerComparison = useCallback(async (peers, targetDist, yearRange) => {
    optAbortRef.current = new AbortController();
    const signal = optAbortRef.current.signal;
    addLog("Fetching peer journal data…");

    try {
      const worksPerJournal = await fetchPeerArticles(
        peers.map(p => p.id),
        yearRange.from,
        yearRange.to,
        { onLog: addLog },
        signal
      );

      const peerDists   = Object.values(worksPerJournal).map(works => computeTopicDistribution(works));
      const peerDivergence = computePeerDivergence(targetDist, peerDists);
      patch({ peerDivergence });
      addLog("Peer comparison complete.");

    } catch (err) {
      if (err.message !== "Cancelled") {
        addLog(`Peer comparison error: ${err.message}`);
      }
    }
  }, [addLog, patch]);

  return {
    state,
    run,
    cancel,
    restore,
    runArticles,
    runRefAlignment,
    runPeerComparison,
  };
}
