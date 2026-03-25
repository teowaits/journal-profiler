import { useState, useEffect } from "react";
import { C } from "./constants.js";
import { saveSession, loadSession } from "./persistence.js";
import { useAnalysis } from "./hooks/useAnalysis.js";
import OverviewTab      from "./components/OverviewTab.jsx";
import TopicProfileTab  from "./components/TopicProfileTab.jsx";
import ArticlesTab      from "./components/ArticlesTab.jsx";
import AuthorIntraTab   from "./components/AuthorIntraTab.jsx";
import PeerCompareTab   from "./components/PeerCompareTab.jsx";

const TABS = [
  { id: "overview",  label: "Overview" },
  { id: "topics",    label: "Topic Profile" },
  { id: "articles",  label: "Articles" },
  { id: "authors",   label: "Authors & Citations" },
  { id: "peers",     label: "Peer Comparison" },
];

const DEFAULT_YEAR_RANGE = {
  from: new Date().getFullYear() - 9,  // 10-year window by default
  to:   new Date().getFullYear() - 1,
};

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [journal, setJournal]     = useState(null);
  const [yearRange, setYearRange] = useState(DEFAULT_YEAR_RANGE);
  const [peers, setPeers]             = useState([]);
  const [peerPhase, setPeerPhase]     = useState("idle");
  const [peerLog, setPeerLog]         = useState([]);
  const [refAlignPhase, setRefAlignPhase] = useState("idle");
  const [sessionSaved, setSessionSaved]   = useState(true); // false = quota exceeded

  const { state, run, cancel, restore, runRefAlignment, runPeerComparison } = useAnalysis();

  const {
    phase, log, progress,
    worksPerYear, topicProfilePerYear,
    driftResult, authorProfilePerYear, institutionSurgesPerYear, intraCitationPerYear,
    articleCountVariation, totalSelfCitePerYear,
    divergentArticles, refAlignmentPerYear,
    peerDivergence, truncatedYears,
  } = state;

  // ── Restore from sessionStorage on mount ──────────────────────────────────
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    if (saved.journal)   setJournal(saved.journal);
    if (saved.yearRange) setYearRange(saved.yearRange);
    if (saved.analysis)  restore(saved.analysis);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist after main analysis and after ref alignment ───────────────────
  useEffect(() => {
    if (state.phase !== "done" || !journal) return;
    const ok = saveSession({
      journal,
      yearRange,
      analysis: {
        worksPerYear:             state.worksPerYear,
        topicProfilePerYear:      state.topicProfilePerYear,
        driftResult:              state.driftResult,
        authorProfilePerYear:     state.authorProfilePerYear,
        institutionSurgesPerYear: state.institutionSurgesPerYear,
        intraCitationPerYear:     state.intraCitationPerYear,
        articleCountVariation:    state.articleCountVariation,
        divergentArticles:        state.divergentArticles,
        truncatedYears:           state.truncatedYears,
        refAlignmentPerYear:      state.refAlignmentPerYear,
        totalSelfCitePerYear:     state.totalSelfCitePerYear,
      },
    });
    setSessionSaved(ok);
  }, [state.phase, state.refAlignmentPerYear, state.totalSelfCitePerYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalArticles = Object.values(worksPerYear).reduce((n, arr) => n + arr.length, 0);
  const hasRefAlignment = Object.keys(refAlignmentPerYear).length > 0;

  const handleRun = () => run(journal, yearRange);
  const handleCancel = () => cancel();
  const handleRunRefAlignment = () => {
    const measureYears = driftResult.measurements.map(m => m.year);
    setRefAlignPhase("running");
    runRefAlignment(worksPerYear, measureYears, journal.id).finally(() => setRefAlignPhase("idle"));
  };

  const handleRunPeerComparison = (peerList, targetDist, yr) => {
    setPeerPhase("running");
    setPeerLog([]);
    runPeerComparison(peerList, targetDist, yr).finally(() => setPeerPhase("idle"));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.textPrimary,
        fontFamily: "'IBM Plex Mono', monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { opacity: 1; }
        select option { background: ${C.surface2}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 3px; }
        a { color: ${C.blue}; }
      `}</style>

      {/* Session-not-saved warning */}
      {phase === "done" && !sessionSaved && (
        <div style={{
          background: C.surface2,
          borderBottom: `1px solid ${C.amber}`,
          padding: "7px 32px",
          fontSize: 11,
          color: C.amber,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}>
          <span>⚠</span>
          <span>
            Results not saved — dataset too large for browser storage.
            If this tab is reloaded or the computer sleeps, the analysis will need to be re-run.
          </span>
        </div>
      )}

      {/* Header */}
      <header
        style={{
          borderBottom: `1px solid ${C.border}`,
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          height: 52,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.01em" }}>
            Journal Profile Analyser
          </span>
          {journal && (
            <span style={{ fontSize: 12, color: C.textMuted }}>
              · {journal.display_name}
            </span>
          )}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {phase === "running" && (
            <>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: C.blue,
                  animation: "pulse 1.2s ease infinite",
                }}
              />
              <span style={{ fontSize: 11, color: C.textMuted }}>Analysing…</span>
            </>
          )}
          {phase === "done" && (
            <>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
              <span style={{ fontSize: 11, color: C.textMuted }}>
                {totalArticles.toLocaleString()} articles · {yearRange.from}–{yearRange.to}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav
        style={{
          borderBottom: `1px solid ${C.border}`,
          padding: "0 32px",
          display: "flex",
          flexShrink: 0,
        }}
      >
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const enabled =
            tab.id === "overview" ||
            (tab.id === "articles" && divergentArticles.length > 0) ||
            (tab.id === "topics"   && !!driftResult) ||
            (tab.id === "authors"  && !!driftResult) ||
            (tab.id === "peers"    && !!driftResult);

          return (
            <button
              key={tab.id}
              onClick={() => enabled && setActiveTab(tab.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: active ? `2px solid ${C.blue}` : "2px solid transparent",
                color: active ? C.blue : enabled ? C.textMuted : C.border2,
                fontSize: 12,
                fontFamily: "'IBM Plex Mono', monospace",
                padding: "12px 16px",
                cursor: enabled ? "pointer" : "default",
                transition: "color 0.15s, border-color 0.15s",
                letterSpacing: "0.02em",
              }}
            >
              {tab.label}
              {tab.id === "articles" && divergentArticles.length > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    color: C.textMuted,
                    background: C.border2,
                    borderRadius: 10,
                    padding: "1px 6px",
                  }}
                >
                  {divergentArticles.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          padding: "28px 32px",
          maxWidth: 1100,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {activeTab === "overview" && (
          <OverviewTab
            journal={journal}
            setJournal={setJournal}
            yearRange={yearRange}
            setYearRange={setYearRange}
            phase={phase}
            progress={progress}
            log={log}
            onRun={handleRun}
            onCancel={handleCancel}
            driftResult={driftResult}
            authorProfilePerYear={authorProfilePerYear}
            intraCitationPerYear={intraCitationPerYear}
            articleCountVariation={articleCountVariation}
            refAlignmentPerYear={refAlignmentPerYear}
            truncatedYears={truncatedYears}
            totalArticles={totalArticles}
            onRunRefAlignment={handleRunRefAlignment}
            refAlignPhase={refAlignPhase}
          />
        )}

        {activeTab === "topics" && (
          <TopicProfileTab
            journal={journal}
            driftResult={driftResult}
            topicProfilePerYear={topicProfilePerYear}
          />
        )}

        {activeTab === "articles" && (
          <ArticlesTab
            journal={journal}
            divergentArticles={divergentArticles}
            driftResult={driftResult}
            refAlignmentPerYear={refAlignmentPerYear}
            hasRefAlignment={hasRefAlignment}
          />
        )}

        {activeTab === "authors" && (
          <AuthorIntraTab
            journal={journal}
            driftResult={driftResult}
            worksPerYear={worksPerYear}
            authorProfilePerYear={authorProfilePerYear}
            institutionSurgesPerYear={institutionSurgesPerYear}
            intraCitationPerYear={intraCitationPerYear}
            totalSelfCitePerYear={totalSelfCitePerYear}
          />
        )}

        {activeTab === "peers" && (
          <PeerCompareTab
            journal={journal}
            peers={peers}
            setPeers={setPeers}
            peerDivergence={peerDivergence}
            driftResult={driftResult}
            worksPerYear={worksPerYear}
            yearRange={yearRange}
            onRunPeerComparison={handleRunPeerComparison}
            peerPhase={peerPhase}
            peerLog={peerLog}
          />
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: `1px solid ${C.border}`,
          padding: "12px 32px",
          fontSize: 11,
          color: C.textMuted,
          display: "flex",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <a href="https://github.com/teowaits/journal-profiler" target="_blank" rel="noreferrer" style={{ color: C.textMuted }}>Created by teowaits</a>
        <span>·</span>
        <a href="https://openalex.org" target="_blank" rel="noreferrer" style={{ color: C.textMuted }}>
          Data from OpenAlex API (CC0)
        </a>
        <span>·</span>
        <span>MIT License</span>
      </footer>
    </div>
  );
}
