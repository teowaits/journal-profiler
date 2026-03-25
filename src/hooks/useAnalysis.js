/**
 * useAnalysis.js — run/cancel/progress state machine
 * Orchestrates API calls and analytics computation.
 * Returns state and actions to App.jsx.
 */

import { useCallback, useRef, useState } from "react";
import { fetchArticlesForJournal, fetchWorksById, fetchPeerArticles, fetchSelfCiteIds } from "../api.js";
import {
  computeTopicDistribution,
  computeDriftOverTime,
  computeCountryHHI,
  buildInstitutionDist,
  computeInstitutionSurges,
  computeIntraCitationDensity,
  computeArticleCountVariation,
  computeYearDivergences,
  topFiveFields,
  computeArticleRefAlignment,
  aggregateRefAlignment,
  computePeerDivergence,
} from "../analytics.js";

import { BASELINE_YEARS, INTRA_CITE_THRESHOLDS, INTRA_CITE_LABELS } from "../constants.js";

const initialState = {
  phase: "idle",           // idle | running | done | error
  errorMsg: "",
  log: [],
  progress: { year: null, page: 0, pages: 0, totalYears: 0, doneYears: 0 },

  // Core results
  worksPerYear: {},
  topicProfilePerYear: {},
  driftResult: null,       // { baselineYears, baseline, measurements }
  authorProfilePerYear: {},     // country HHI per year
  institutionSurgesPerYear: {}, // flagged institution surges per measurement year
  intraCitationPerYear: {},
  articleCountVariation: null,  // { perYear, allCounts }
  divergentArticles: [],

  // Optional: reference alignment
  refAlignmentPerYear: {},

  // Optional: total self-citation (includes refs outside analysis window)
  totalSelfCitePerYear: {},

  // Optional: peer comparison
  peerDivergence: null,

  // Meta
  truncatedYears: [],
};

export function useAnalysis() {
  const [state, setState] = useState(initialState);
  const abortRef = useRef(null);
  // Separate abort for optional passes
  const optAbortRef = useRef(null);

  const patch = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const addLog = useCallback((msg) => {
    setState(prev => ({ ...prev, log: [...prev.log.slice(-50), msg] }));
  }, []);

  // ─── Main analysis run ──────────────────────────────────────────────────────

  const run = useCallback(async (journal, yearRange) => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setState({
      ...initialState,
      phase: "running",
      progress: { year: null, page: 0, pages: 0, totalYears: yearRange.to - yearRange.from + 1, doneYears: 0 },
    });

    try {
      const { worksPerYear, allWorkIds, truncatedYears } = await fetchArticlesForJournal(
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

      // Signal 1: temporal topic drift
      const driftResult = computeDriftOverTime(worksPerYear);

      // Topic profiles (all years, needed for article divergence + topic tab)
      const topicProfilePerYear = {};
      for (const [year, works] of Object.entries(worksPerYear)) {
        topicProfilePerYear[year] = computeTopicDistribution(works);
      }

      // Signals 3 + 4: per year
      const authorProfilePerYear = {};
      const institutionSurgesPerYear = {};
      const intraCitationPerYear = {};
      const years = Object.keys(worksPerYear).sort();

      // Build baseline institution distribution once (for surge detection)
      const baselineWorks = driftResult.baselineYears.flatMap(y => worksPerYear[y] ?? []);
      const baselineInstDist = buildInstitutionDist(baselineWorks);

      for (const year of years) {
        const works = worksPerYear[year];
        authorProfilePerYear[year] = computeCountryHHI(works);
        intraCitationPerYear[year] = computeIntraCitationDensity(works, allWorkIds);
      }

      // Article divergence — uses baseline from driftResult
      const baseline = driftResult.baseline;
      const measureYears = driftResult.measurements.map(m => m.year);

      // Article count YoY variation
      const articleCountVariation = computeArticleCountVariation(
        worksPerYear,
        driftResult.baselineYears,
        measureYears
      );

      // Surge detection only for measurement years
      for (const year of measureYears) {
        institutionSurgesPerYear[year] = computeInstitutionSurges(
          worksPerYear[year] ?? [],
          baselineInstDist
        );
      }
      const divergentArticles = [];

      // Compute baseline top-fields once (shared across all years)
      const baselineTopFields = topFiveFields(baseline);

      for (const year of measureYears) {
        const works = worksPerYear[year] ?? [];
        // O(n log n) per year: scores computed once, sorted once
        const divs = computeYearDivergences(works, baseline, baselineTopFields);
        for (let i = 0; i < works.length; i++) {
          divergentArticles.push({ ...works[i], _divergence: divs[i] });
        }
      }
      divergentArticles.sort((a, b) => b._divergence.score - a._divergence.score);

      setState(prev => ({
        ...prev,
        phase: "done",
        worksPerYear,
        topicProfilePerYear,
        driftResult,
        authorProfilePerYear,
        institutionSurgesPerYear,
        intraCitationPerYear,
        articleCountVariation,
        divergentArticles,
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

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    optAbortRef.current?.abort();
  }, []);

  // ─── Optional: reference alignment (Signal 2) + total self-citation ────────
  // Both triggered together. Ref alignment runs for all years; self-cite for
  // measurement years only (but counts all references regardless of pub year).

  const runRefAlignment = useCallback(async (worksPerYear, measureYears, journalId) => {
    optAbortRef.current = new AbortController();
    const signal = optAbortRef.current.signal;
    addLog("Running reference field alignment…");

    try {
      const refAlignmentPerYear = {};

      // Only measurement years — baseline alignment is never displayed anywhere
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
      addLog("Reference field alignment complete. Computing total self-citation rate…");

      // ── Total self-citation: measurement years only, all reference years ──
      const totalSelfCitePerYear = {};

      for (const year of measureYears) {
        if (signal.aborted) throw new Error("Cancelled");
        const works = worksPerYear[year] ?? [];

        const uniqueRefIds = [...new Set(works.flatMap(w => w.referenced_works ?? []))];
        const totalRefs = works.reduce((n, w) => n + (w.referenced_works?.length ?? 0), 0);

        if (uniqueRefIds.length === 0) {
          totalSelfCitePerYear[year] = { selfCites: 0, total: totalRefs, density: 0, label: INTRA_CITE_LABELS.typical };
          continue;
        }

        const selfCiteIds = await fetchSelfCiteIds(uniqueRefIds, journalId, { onLog: addLog }, signal);

        let selfCites = 0;
        for (const work of works) {
          for (const refId of (work.referenced_works ?? [])) {
            if (selfCiteIds.has(refId)) selfCites++;
          }
        }

        const density = totalRefs > 0 ? selfCites / totalRefs : 0;
        let label;
        if (density >= INTRA_CITE_THRESHOLDS.NOTABLY_ELEVATED)  label = INTRA_CITE_LABELS.notably;
        else if (density >= INTRA_CITE_THRESHOLDS.ELEVATED)      label = INTRA_CITE_LABELS.elevated;
        else                                                      label = INTRA_CITE_LABELS.typical;

        totalSelfCitePerYear[year] = { selfCites, total: totalRefs, density, label };
        addLog(`${year}: ${selfCites} self-cites / ${totalRefs} total refs`);
      }

      patch({ totalSelfCitePerYear });
      addLog("Complete.");

    } catch (err) {
      if (err.message !== "Cancelled") {
        addLog(`Error: ${err.message}`);
      }
    }
  }, [addLog, patch]);

  // ─── Restore from sessionStorage ───────────────────────────────────────

  const restore = useCallback((analysis) => {
    setState({
      ...initialState,
      phase: "done",
      worksPerYear:             analysis.worksPerYear             ?? {},
      topicProfilePerYear:      analysis.topicProfilePerYear      ?? {},
      driftResult:              analysis.driftResult              ?? null,
      authorProfilePerYear:     analysis.authorProfilePerYear     ?? {},
      institutionSurgesPerYear: analysis.institutionSurgesPerYear ?? {},
      intraCitationPerYear:     analysis.intraCitationPerYear     ?? {},
      articleCountVariation:    analysis.articleCountVariation    ?? null,
      divergentArticles:        analysis.divergentArticles        ?? [],
      truncatedYears:           analysis.truncatedYears           ?? [],
      refAlignmentPerYear:      analysis.refAlignmentPerYear      ?? {},
      totalSelfCitePerYear:     analysis.totalSelfCitePerYear     ?? {},
    });
  }, []);

  // ─── Optional: peer comparison (Signal 5) ──────────────────────────────────

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

      const peerDists = Object.values(worksPerJournal).map(works => computeTopicDistribution(works));
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
    runRefAlignment,
    runPeerComparison,
  };
}
