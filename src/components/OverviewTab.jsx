import { useState } from "react";
import { C, MIN_YEAR_RANGE, BASELINE_YEARS, DRIFT_LABELS, CONCENTRATION_LABELS, INTRA_CITE_LABELS } from "../constants.js";
import { searchSources } from "../api.js";
import JournalSearch from "./JournalSearch.jsx";
import ProgressPanel from "./ProgressPanel.jsx";

const EXAMPLE_JOURNALS = [
  "Advanced Robotics",
  "Science Robotics",
  "npj Robotics",
];

const currentYear = new Date().getFullYear();

/**
 * @param {{
 *   journal: object | null,
 *   setJournal: function,
 *   yearRange: { from: number, to: number },
 *   setYearRange: function,
 *   phase: string,
 *   progress: object,
 *   log: string[],
 *   onRun: function,
 *   onCancel: function,
 *   driftResult: object | null,
 *   authorProfilePerYear: object,
 *   intraCitationPerYear: object,
 *   refAlignmentPerYear: object,
 *   truncatedYears: string[],
 *   totalArticles: number,
 *   onRunRefAlignment: function,
 * }} props
 */
export default function OverviewTab({
  journal, setJournal,
  yearRange, setYearRange,
  phase, progress, log,
  onRun, onCancel,
  driftResult,
  authorProfilePerYear,
  intraCitationPerYear,
  articleCountVariation,
  refAlignmentPerYear,
  truncatedYears,
  totalArticles,
  onRunRefAlignment,
  refAlignPhase,
}) {
  const isRunning         = phase === "running";
  const isDone            = phase === "done";
  const isError           = phase === "error";
  const isRefAlignRunning = refAlignPhase === "running";

  const rangeValid = yearRange.to - yearRange.from + 1 >= MIN_YEAR_RANGE;
  const canRun = !!journal && rangeValid && !isRunning;

  const [exampleLoading, setExampleLoading] = useState(null);

  const handleExampleClick = async (name) => {
    if (exampleLoading) return;
    setExampleLoading(name);
    try {
      const results = await searchSources(name);
      if (results.length > 0) setJournal(results[0]);
    } catch { /* ignore */ }
    setExampleLoading(null);
  };

  const measureYears = driftResult?.measurements.map(m => m.year) ?? [];
  const hasRefAlignment = Object.keys(refAlignmentPerYear).length > 0;

  return (
    <div>
      {/* Journal selector */}
      <Section title="Journal">
        {journal ? (
          <div
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 15, color: C.textPrimary, fontWeight: 600 }}>
                {journal.display_name}
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3, display: "flex", gap: 14 }}>
                <span>{journal.host_organization_name ?? "Publisher unresolved"}</span>
                {journal.issn_l && <span>ISSN {journal.issn_l}</span>}
                {journal.works_count != null && (
                  <span>{journal.works_count.toLocaleString()} total works</span>
                )}
              </div>
            </div>
            {!isRunning && (
              <button
                onClick={() => setJournal(null)}
                style={ghostBtn}
                title="Change journal"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <JournalSearch onSelect={setJournal} disabled={isRunning} />
        )}
      </Section>

      {/* Empty state — instructions + example journals */}
      {!journal && phase === "idle" && (
        <div
          style={{
            marginTop: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            textAlign: "center",
            animation: "fadeIn 0.3s ease",
          }}
        >
          <div style={{ fontSize: 36, opacity: 0.18, lineHeight: 1 }}>◎</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            Analyse a journal's publishing profile over time
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, fontFamily: "'IBM Plex Sans', sans-serif", lineHeight: 1.7, maxWidth: 420 }}>
            Search for a journal above, set a date range, and click Analyse.
            The tool computes topic drift, authorship concentration, self-citation density,
            and article count variation — all from{" "}
            <a href="https://openalex.org" target="_blank" rel="noreferrer" style={{ color: C.textMuted }}>
              OpenAlex
            </a>{" "}
            open data.
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Try an example
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {EXAMPLE_JOURNALS.map(name => (
                <button
                  key={name}
                  onClick={() => handleExampleClick(name)}
                  disabled={!!exampleLoading}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.border2}`,
                    borderRadius: 20,
                    color: exampleLoading === name ? C.textMuted : C.blue,
                    fontSize: 12,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    padding: "6px 14px",
                    cursor: exampleLoading ? "default" : "pointer",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                >
                  {exampleLoading === name ? "Loading…" : name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Year range */}
      {journal && (
        <Section title={`Date range · minimum ${MIN_YEAR_RANGE} years`}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <YearInput
              label="From"
              value={yearRange.from}
              min={1990}
              max={yearRange.to - MIN_YEAR_RANGE + 1}
              onChange={v => setYearRange(r => ({ ...r, from: v }))}
              disabled={isRunning}
            />
            <span style={{ color: C.textMuted }}>—</span>
            <YearInput
              label="To"
              value={yearRange.to}
              min={yearRange.from + MIN_YEAR_RANGE - 1}
              max={currentYear}
              onChange={v => setYearRange(r => ({ ...r, to: v }))}
              disabled={isRunning}
            />
            {driftResult && (
              <div style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>
                Baseline: {driftResult.baselineYears[0]}–{driftResult.baselineYears[driftResult.baselineYears.length - 1]}
                {" · "}Measured: {measureYears[0]}–{measureYears[measureYears.length - 1]}
              </div>
            )}
          </div>
          {!rangeValid && (
            <div style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>
              Select at least {MIN_YEAR_RANGE} years ({BASELINE_YEARS} baseline + 1 measurement year).
            </div>
          )}
        </Section>
      )}

      {/* Run / cancel */}
      {journal && (
        <div style={{ display: "flex", gap: 10, marginTop: 4, marginBottom: 24 }}>
          <button
            onClick={isRunning ? onCancel : onRun}
            disabled={!isRunning && !canRun}
            style={{
              ...primaryBtn,
              background: isRunning ? C.border2 : C.blue,
              color: isRunning ? C.textMuted : C.bg,
            }}
          >
            {isRunning ? "■  Cancel" : "▶  Analyse"}
          </button>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div style={{ fontSize: 13, color: C.red, marginBottom: 16 }}>
          An error occurred. Check your connection and try again.
        </div>
      )}

      {/* Progress */}
      {isRunning && (
        <ProgressPanel progress={progress} log={log} />
      )}

      {/* Truncation warning */}
      {truncatedYears.length > 0 && (
        <div
          style={{
            background: C.surface2,
            border: `1px solid ${C.amber}`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: C.amber,
            marginBottom: 16,
          }}
        >
          Article count exceeded the 10,000-article query limit in: {truncatedYears.join(", ")}.
          Analysis covers a representative sample for those years. Consider narrowing the date range for full coverage.
        </div>
      )}

      {/* Summary cards */}
      {isDone && driftResult && (
        <div>
          <SectionTitle>Publishing profile summary</SectionTitle>

          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
            {totalArticles.toLocaleString()} articles · {yearRange.from}–{yearRange.to}
          </div>

          {/* Composite table */}
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `180px repeat(${measureYears.length}, 1fr)`,
                gap: 1,
                background: C.border,
              }}
            >
              <Cell header>Year</Cell>
              {measureYears.map(y => <Cell key={y} header>{y}</Cell>)}
            </div>

            {/* Topic alignment row */}
            <CompositeRow
              label="Topic alignment"
              years={measureYears}
              getValue={y => {
                const m = driftResult.measurements.find(m => m.year === y);
                return m ? { label: m.label, raw: m.jsd } : null;
              }}
            />

            {/* Ref alignment row */}
            <CompositeRow
              label="Ref. field alignment"
              years={measureYears}
              getValue={y => {
                const r = refAlignmentPerYear[y];
                return r ? { label: r.label, raw: r.share } : null;
              }}
              emptyMsg={hasRefAlignment ? "—" : "Not run"}
            />

            {/* Institutional profile row */}
            <CompositeRow
              label="Author profile"
              years={measureYears}
              getValue={y => {
                const a = authorProfilePerYear[y];
                return a ? { label: a.label, raw: a.hhi } : null;
              }}
            />

            {/* Intra-citation row */}
            <CompositeRow
              label="Self-citation"
              years={measureYears}
              getValue={y => {
                const d = intraCitationPerYear[y];
                return d ? { label: d.label, raw: d.density } : null;
              }}
            />

            {/* Article count YoY variation row — expandable */}
            <ExpandableYoYRow
              years={measureYears}
              articleCountVariation={articleCountVariation}
              driftResult={driftResult}
            />
          </div>

          {/* Optional: run reference alignment */}
          {!hasRefAlignment && (
            <div
              style={{
                background: C.surface2,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "14px 18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: C.textPrimary, fontWeight: 500 }}>
                    Reference field alignment
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
                    Compares the topic fields of each article against its cited works.
                    Requires one API call per reference batch — for large date ranges
                    this can take several minutes. Good time for a coffee.
                  </div>
                </div>
                <button
                  onClick={onRunRefAlignment}
                  disabled={isRefAlignRunning}
                  style={{
                    ...primaryBtn,
                    background: isRefAlignRunning ? C.border2 : C.blue,
                    color: isRefAlignRunning ? C.textMuted : C.bg,
                    cursor: isRefAlignRunning ? "default" : "pointer",
                    flexShrink: 0,
                    marginLeft: 16,
                  }}
                >
                  {isRefAlignRunning ? "Running…" : "Run"}
                </button>
              </div>

              {isRefAlignRunning && (
                <div style={{ marginTop: 12 }}>
                  {/* Indeterminate progress bar */}
                  <div
                    style={{
                      height: 3,
                      background: C.border2,
                      borderRadius: 2,
                      overflow: "hidden",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{
                      height: "100%",
                      width: "40%",
                      background: C.blue,
                      borderRadius: 2,
                      animation: "refAlignSweep 1.6s ease-in-out infinite",
                    }} />
                  </div>
                  {/* Last log line */}
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {log[log.length - 1] ?? "Fetching references…"}
                  </div>
                  <style>{`
                    @keyframes refAlignSweep {
                      0%   { transform: translateX(-100%); }
                      100% { transform: translateX(350%); }
                    }
                  `}</style>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Local sub-components ──────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: C.textMuted,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function YearInput({ label, value, min, max, onChange, disabled }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, color: C.textMuted }}>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={e => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        onBlur={e => {
          const v = parseInt(e.target.value, 10);
          if (isNaN(v) || v < min) onChange(min);
          else if (v > max) onChange(max);
        }}
        style={{
          width: 72,
          background: C.surface2,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          color: C.textPrimary,
          fontSize: 13,
          padding: "6px 10px",
          fontFamily: "'IBM Plex Mono', monospace",
          textAlign: "center",
        }}
      />
    </div>
  );
}

function Cell({ children, header, label }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        fontSize: header ? 10 : 12,
        color: header ? C.textMuted : label ? C.textMuted : C.textPrimary,
        textTransform: header ? "uppercase" : "none",
        letterSpacing: header ? "0.08em" : "normal",
        background: header ? C.surface2 : C.surface,
      }}
    >
      {children}
    </div>
  );
}

function CompositeRow({ label, years, getValue, emptyMsg = "—" }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `180px repeat(${years.length}, 1fr)`,
        gap: 1,
        background: C.border,
        borderTop: `1px solid ${C.border}`,
      }}
    >
      <Cell label>{label}</Cell>
      {years.map(y => {
        const val = getValue(y);
        if (!val) return <Cell key={y}>{emptyMsg}</Cell>;
        const color = labelColor(val.label);
        return (
          <div
            key={y}
            style={{
              padding: "8px 12px",
              background: C.surface,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color }}>{val.label}</span>
            {val.rawLabel != null ? (
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                {val.rawLabel}
              </span>
            ) : val.raw != null ? (
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                {(val.raw * 100).toFixed(0)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ExpandableYoYRow({ years, articleCountVariation, driftResult }) {
  const [expanded, setExpanded] = useState(false);

  const allYears = driftResult
    ? [...driftResult.baselineYears, ...years].sort()
    : years;
  const baselineSet = new Set(driftResult?.baselineYears ?? []);

  return (
    <div>
      {/* Grid row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `180px repeat(${years.length}, 1fr)`,
          gap: 1,
          background: C.border,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div
          onClick={() => setExpanded(e => !e)}
          style={{
            padding: "8px 12px",
            fontSize: 12,
            color: C.textMuted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: C.surface,
            userSelect: "none",
          }}
        >
          <span style={{ fontSize: 9, opacity: 0.7 }}>{expanded ? "▲" : "▼"}</span>
          Article count YoY
          <InfoTip>
            Flags years where article count changed by more than ±20% compared to the previous year.
            This threshold reflects typical year-over-year variation in scientific publishing — the
            Nature Index reported +16% growth across all disciplines in 2024.{" "}
            <a
              href="https://www.nature.com/nature-index/news/why-did-the-nature-index-grow-by-sixteen-percent-in-twenty-twenty-four"
              target="_blank"
              rel="noreferrer"
              style={{ color: C.blue }}
              onClick={e => e.stopPropagation()}
            >
              Nature Index (2024)
            </a>
          </InfoTip>
        </div>
        {years.map(y => {
          const v = articleCountVariation?.perYear?.[y];
          if (!v) return <Cell key={y}>—</Cell>;
          const color = labelColor(v.label);
          const rawLabel = v.yoyRate != null
            ? `${v.yoyRate >= 0 ? "+" : ""}${(v.yoyRate * 100).toFixed(0)}%`
            : null;
          return (
            <div key={y} style={{ padding: "8px 12px", background: C.surface, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color }}>{v.label}</span>
              {rawLabel && (
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {rawLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded article count chart */}
      {expanded && (
        <div
          style={{
            background: C.bgDark,
            borderTop: `1px solid ${C.border}`,
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
            Articles per year · baseline years shown in grey · measurement years coloured by YoY variation
          </div>
          <YoYChart
            allYears={allYears}
            baselineSet={baselineSet}
            articleCountVariation={articleCountVariation}
          />
        </div>
      )}
    </div>
  );
}

function YoYChart({ allYears, baselineSet, articleCountVariation }) {
  const allCounts = articleCountVariation?.allCounts ?? {};
  const perYear   = articleCountVariation?.perYear ?? {};
  const maxCount  = Math.max(...allYears.map(y => allCounts[y] ?? 0), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {allYears.map(y => {
        const count      = allCounts[y] ?? 0;
        const isBaseline = baselineSet.has(y);
        const v          = perYear[y];
        // Baseline years are the reference period — colour green by default.
        // Measurement years are coloured by their variation label.
        const color = v?.label === CONCENTRATION_LABELS.outside ? C.amber : C.green;
        const rawLabel = v?.yoyRate != null
          ? `${v.yoyRate >= 0 ? "+" : ""}${(v.yoyRate * 100).toFixed(0)}% YoY`
          : null;

        return (
          <div key={y} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                textAlign: "right",
                fontSize: 11,
                color: isBaseline ? C.textMuted : C.textPrimary,
                fontFamily: "'IBM Plex Mono', monospace",
                flexShrink: 0,
              }}
            >
              {y}
            </div>
            <div style={{ flex: 1, height: 18, background: C.border, borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${(count / maxCount) * 100}%`,
                  background: color,
                  borderRadius: 4,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <div
              style={{
                width: 210,
                fontSize: 11,
                color,
                fontFamily: "'IBM Plex Mono', monospace",
                flexShrink: 0,
              }}
            >
              {count.toLocaleString()} articles
              {rawLabel && <span style={{ color: C.textMuted }}> · {rawLabel}</span>}
              {isBaseline && <span style={{ color: C.textMuted, fontSize: 10 }}> (baseline)</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoTip({ children }) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", verticalAlign: "middle" }}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={e => { e.stopPropagation(); setVisible(v => !v); }}
        style={{
          cursor: "help",
          fontSize: 10,
          color: C.textMuted,
          border: `1px solid ${C.border2}`,
          borderRadius: "50%",
          width: 14,
          height: 14,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginLeft: 4,
          userSelect: "none",
          fontFamily: "'IBM Plex Mono', monospace",
          lineHeight: 1,
        }}
      >
        i
      </span>
      {visible && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: C.surface2,
            border: `1px solid ${C.border2}`,
            borderRadius: 8,
            padding: "10px 13px",
            fontSize: 11,
            color: C.textMuted,
            lineHeight: 1.55,
            width: 300,
            zIndex: 200,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}

function labelColor(label) {
  if (
    label === DRIFT_LABELS.notable ||
    label === INTRA_CITE_LABELS.notably ||
    label === CONCENTRATION_LABELS.outside
  ) return C.amber;
  if (
    label === DRIFT_LABELS.moderate ||
    label === INTRA_CITE_LABELS.elevated
  ) return C.amberLight;
  return C.green;
}

const primaryBtn = {
  background: C.blue,
  color: C.bg,
  border: "none",
  borderRadius: 7,
  padding: "8px 18px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'IBM Plex Mono', monospace",
  cursor: "pointer",
};

const ghostBtn = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.textMuted,
  fontSize: 13,
  padding: "4px 10px",
  cursor: "pointer",
};
