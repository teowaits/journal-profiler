import { useState } from "react";
import {
  C,
  HHI_THRESHOLDS,
  INTRA_CITE_THRESHOLDS,
  INSTITUTION_SURGE_THRESHOLDS,
} from "../constants.js";
import BarChart from "./BarChart.jsx";

/**
 * @param {{
 *   driftResult: object | null,
 *   worksPerYear: object,
 *   authorProfilePerYear: object,
 *   institutionSurgesPerYear: object,
 *   intraCitationPerYear: object,
 *   totalSelfCitePerYear: object,
 * }} props
 */
export default function AuthorIntraTab({
  journal,
  driftResult,
  worksPerYear,
  authorProfilePerYear,
  institutionSurgesPerYear,
  intraCitationPerYear,
  totalSelfCitePerYear,
}) {
  if (!driftResult) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>
        Run the analysis to view author and citation data.
      </div>
    );
  }

  const { baselineYears, measurements } = driftResult;
  const allYears     = [...baselineYears, ...measurements.map(m => m.year)].sort();
  const measureYears = measurements.map(m => m.year).sort();

  const [selectedYear, setSelectedYear] = useState(measureYears[measureYears.length - 1]);

  return (
    <div>

      {/* ── Section 1: Country-level authorship concentration ──────────────── */}
      <Section title="Geographic authorship concentration (Country HHI)">
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
          Herfindahl-Hirschman Index computed over countries of author institutions.
          0 = perfectly distributed across many countries · 100 = all authors from one country.
        </div>

        <SubSection title="HHI · measurement years">
          <HHIChart years={measureYears} authorProfilePerYear={authorProfilePerYear} />
        </SubSection>

        <SubSection
          title="Country distribution by year"
          action={<ExportBtn onClick={() => exportCountryCSV(authorProfilePerYear, allYears, journal?.display_name)} />}
        >
          <BarChart
            years={allYears}
            getDistribution={year => {
              const countries = authorProfilePerYear[year]?.countries ?? [];
              const result = {};
              for (const c of countries) {
                result[c.code] = { name: c.name, pct: c.share, count: c.count };
              }
              return result;
            }}
            topN={10}
          />
        </SubSection>
      </Section>

      {/* ── Section 2: Institution surge detection ─────────────────────────── */}
      {(() => {
        const hasSurges = measureYears.some(y => (institutionSurgesPerYear[y] ?? []).length > 0);
        return (
          <Section
            title="Institution authorship surge"
            action={hasSurges ? (
              <ExportBtn onClick={() => exportSurgeArticlesCSV(institutionSurgesPerYear, worksPerYear, measureYears, journal?.display_name)} />
            ) : null}
          >
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
              Institutions whose share of author affiliations increased by
              ≥ {(INSTITUTION_SURGE_THRESHOLDS.DELTA * 100).toFixed(0)} percentage points vs the
              baseline aggregate, and represent ≥ {(INSTITUTION_SURGE_THRESHOLDS.MIN_SHARE * 100).toFixed(0)}%
              of the year's author affiliations. Expand a row to view the associated articles.
            </div>

            <YearPicker years={measureYears} selected={selectedYear} onSelect={setSelectedYear} />

            {selectedYear && (
              <div style={{ marginTop: 16 }}>
                <SurgeTable
                  year={selectedYear}
                  surges={institutionSurgesPerYear[selectedYear] ?? []}
                  works={worksPerYear[selectedYear] ?? []}
                />
              </div>
            )}
          </Section>
        );
      })()}

      {/* ── Section 3: Intra-citation density ─────────────────────────────── */}
      <Section title="Intra-citation density">

        <SubSection title="Within analysis window">
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
            Share of references pointing to other articles in the same journal
            within the selected date range. References to same-journal articles
            outside the window are not counted here.
          </div>
          <IntraCiteChart years={measureYears} intraCitationPerYear={intraCitationPerYear} />
          <div style={{ marginTop: 16 }}>
            <IntraCiteTable years={measureYears} intraCitationPerYear={intraCitationPerYear} />
          </div>
        </SubSection>

        <SubSection title="Total self-citation rate (all reference years)">
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
            Share of references from measurement-year articles pointing to the same journal,
            regardless of the referenced article's publication year.
            Computed together with reference field alignment.
          </div>

          {Object.keys(totalSelfCitePerYear).length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>
              Run reference field alignment from the Overview tab to compute this.
            </div>
          ) : (
            <>
              <IntraCiteChart years={measureYears} intraCitationPerYear={totalSelfCitePerYear} />
              <div style={{ marginTop: 16 }}>
                <IntraCiteTable years={measureYears} intraCitationPerYear={totalSelfCitePerYear} />
              </div>
            </>
          )}
        </SubSection>
      </Section>

    </div>
  );
}

// ─── Country HHI trend chart ──────────────────────────────────────────────────

function HHIChart({ years, authorProfilePerYear }) {
  const values = years.map(y => authorProfilePerYear[y]?.hhi ?? 0);
  const barMax = Math.max(...values, 0.01) * 1.2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {years.map(y => {
        const hhi   = authorProfilePerYear[y]?.hhi ?? 0;
        const label = authorProfilePerYear[y]?.label ?? "";
        const color = hhi >= HHI_THRESHOLDS.MODERATE ? C.amber : C.green;

        return (
          <div key={y} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, textAlign: "right", fontSize: 11, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
              {y}
            </div>
            <div style={{ flex: 1, height: 18, background: C.border2, borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${(hhi / barMax) * 100}%`,
                background: color,
                borderRadius: 4,
                transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{ width: 130, fontSize: 11, color, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
              {(hhi * 100).toFixed(1)} · {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Institution surge table ──────────────────────────────────────────────────

function SurgeTable({ year, surges, works }) {
  const [expanded, setExpanded] = useState(null);

  if (surges.length === 0) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: "20px 24px", fontSize: 13, color: C.textMuted, fontStyle: "italic",
      }}>
        No institutions show a notable authorship surge in {year} relative to the baseline.
      </div>
    );
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 110px 100px 90px", gap: 1, background: C.border }}>
        {["Institution", "Baseline share", "Year share", "Increase", "Articles"].map(h => (
          <div key={h} style={{ padding: "7px 12px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", background: C.surface2 }}>
            {h}
          </div>
        ))}
      </div>

      {surges.map(s => {
        const isExpanded = expanded === s.name;
        const articles   = works.filter(w =>
          w.authorships?.some(a =>
            a.institutions?.some(inst => inst.display_name === s.name)
          )
        );

        return (
          <div key={s.name} style={{ borderTop: `1px solid ${C.border}` }}>
            {/* Summary row */}
            <div
              onClick={() => setExpanded(isExpanded ? null : s.name)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 110px 100px 90px",
                gap: 1,
                background: C.border,
                cursor: "pointer",
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.border2}
              onMouseLeave={e => e.currentTarget.style.background = C.border}
            >
              <div style={{ ...cell, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: C.textMuted }}>{isExpanded ? "▲" : "▼"}</span>
                {s.name}
              </div>
              <div style={{ ...cell, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted }}>
                {s.isNew
                  ? <span style={{ color: C.amber }}>New entrant</span>
                  : `${(s.baselineShare * 100).toFixed(1)}%`}
              </div>
              <div style={{ ...cell, fontFamily: "'IBM Plex Mono', monospace", color: C.textPrimary }}>
                {(s.yearShare * 100).toFixed(1)}%
              </div>
              <div style={{ ...cell, fontFamily: "'IBM Plex Mono', monospace", color: C.amber }}>
                +{(s.delta * 100).toFixed(1)} pp
              </div>
              <div style={{ ...cell, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted }}>
                {articles.length}
              </div>
            </div>

            {/* Expanded article list */}
            {isExpanded && (
              <div style={{ background: C.bgDark, borderTop: `1px solid ${C.border}`, padding: "12px 16px" }}>
                {articles.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.textMuted }}>No articles found.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {articles.map(w => {
                      const authors = (w.authorships ?? [])
                        .filter(a => a.institutions?.some(inst => inst.display_name === s.name))
                        .map(a => a.author?.display_name)
                        .filter(Boolean);

                      return (
                        <div
                          key={w.id}
                          style={{
                            background: C.surface2,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            padding: "10px 14px",
                          }}
                        >
                          <div style={{ fontSize: 13, color: C.textPrimary, fontWeight: 500, marginBottom: 4, lineHeight: 1.4 }}>
                            {w.doi
                              ? <a href={`https://doi.org/${w.doi}`} target="_blank" rel="noreferrer" style={{ color: C.blue }}>
                                  {w.title ?? "(no title)"}
                                </a>
                              : (w.title ?? "(no title)")}
                          </div>
                          <div style={{ fontSize: 11, color: C.textMuted, display: "flex", gap: 14, flexWrap: "wrap" }}>
                            {authors.length > 0 && (
                              <span>{authors.join(", ")}</span>
                            )}
                            {w.primary_topic?.display_name && (
                              <span style={{ color: C.textMuted }}>· {w.primary_topic.display_name}</span>
                            )}
                            {w.id && (
                              <a href={w.id} target="_blank" rel="noreferrer" style={{ color: C.textMuted, marginLeft: "auto" }}>
                                OpenAlex →
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Intra-citation trend chart ───────────────────────────────────────────────

function IntraCiteChart({ years, intraCitationPerYear }) {
  const values = years.map(y => intraCitationPerYear[y]?.density ?? 0);
  const barMax = Math.max(...values, 0.01) * 1.2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {years.map(y => {
        const d     = intraCitationPerYear[y]?.density ?? 0;
        const label = intraCitationPerYear[y]?.label ?? "";
        const color =
          d >= INTRA_CITE_THRESHOLDS.NOTABLY_ELEVATED ? C.amber :
          d >= INTRA_CITE_THRESHOLDS.ELEVATED          ? C.amberLight :
          C.green;

        return (
          <div key={y} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, textAlign: "right", fontSize: 11, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
              {y}
            </div>
            <div style={{ flex: 1, height: 18, background: C.border2, borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${(d / barMax) * 100}%`,
                background: color,
                borderRadius: 4,
                transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{ width: 190, fontSize: 11, color, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
              {(d * 100).toFixed(1)}% · {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Intra-citation summary table ─────────────────────────────────────────────

function IntraCiteTable({ years, intraCitationPerYear }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 90px 100px 110px", gap: 1, background: C.border }}>
        {["Year", "Assessment", "Density", "Self-cites", "Total refs"].map(h => (
          <div key={h} style={{ padding: "7px 12px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", background: C.surface2 }}>
            {h}
          </div>
        ))}
      </div>

      {years.map(year => {
        const d     = intraCitationPerYear[year];
        const color =
          d?.density >= INTRA_CITE_THRESHOLDS.NOTABLY_ELEVATED ? C.amber :
          d?.density >= INTRA_CITE_THRESHOLDS.ELEVATED          ? C.amberLight :
          C.green;

        return (
          <div key={year} style={{ display: "grid", gridTemplateColumns: "64px 1fr 90px 100px 110px", gap: 1, background: C.border, borderTop: `1px solid ${C.border}` }}>
            <div style={{ ...cell, color: C.textMuted }}>{year}</div>
            <div style={{ ...cell, color }}>{d?.label ?? "—"}</div>
            <div style={{ ...cell, fontFamily: "'IBM Plex Mono', monospace", color }}>
              {d ? `${(d.density * 100).toFixed(1)}%` : "—"}
            </div>
            <div style={{ ...cell, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted }}>
              {d?.selfCites?.toLocaleString() ?? "—"}
            </div>
            <div style={{ ...cell, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted }}>
              {d?.total?.toLocaleString() ?? "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Year picker ──────────────────────────────────────────────────────────────

function YearPicker({ years, selected, onSelect }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {years.map(y => {
        const active = y === selected;
        return (
          <button
            key={y}
            onClick={() => onSelect(y)}
            style={{
              background: active ? C.blue : C.surface2,
              color: active ? C.bg : C.textMuted,
              border: `1px solid ${active ? C.blue : C.border}`,
              borderRadius: 6,
              fontSize: 11,
              padding: "4px 10px",
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: "pointer",
            }}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({ title, action, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20, paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {title}
        </div>
        {action && action}
      </div>
      {children}
    </div>
  );
}

function SubSection({ title, action, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.textMuted }}>{title}</div>
        {action && action}
      </div>
      {children}
    </div>
  );
}

// ─── CSV export helpers ───────────────────────────────────────────────────────

function journalSlug(name) {
  return (name ?? "journal").replace(/[^a-zA-Z0-9\s]/g, "").trim().replace(/\s+/g, "_") || "journal";
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportCountryCSV(authorProfilePerYear, allYears, journalName) {
  const countryRows = {};

  for (const year of allYears) {
    const countries = authorProfilePerYear[year]?.countries ?? [];
    for (const c of countries) {
      if (!countryRows[c.code]) countryRows[c.code] = { name: c.name, counts: {} };
      countryRows[c.code].counts[year] = c.count;
    }
  }

  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const sorted = Object.entries(countryRows).sort((a, b) => {
    const sumA = allYears.reduce((s, y) => s + (a[1].counts[y] ?? 0), 0);
    const sumB = allYears.reduce((s, y) => s + (b[1].counts[y] ?? 0), 0);
    return sumB - sumA;
  });

  const lines = [
    q(`Journal: ${journalName ?? ""}`),
    ["Country", "Code", ...allYears].map(q).join(","),
  ];
  for (const [code, row] of sorted) {
    lines.push([row.name, code, ...allYears.map(y => row.counts[y] ?? 0)].map(q).join(","));
  }
  downloadCSV(lines.join("\n"), `${journalSlug(journalName)}_country_distribution.csv`);
}

function exportSurgeArticlesCSV(institutionSurgesPerYear, worksPerYear, measureYears, journalName) {
  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const headers = ["Year", "Institution", "Title", "DOI", "Authors", "Author Institutions", "Topic", "Subfield", "Field", "Domain"];
  const lines = [
    q(`Journal: ${journalName ?? ""}`),
    headers.map(q).join(","),
  ];

  for (const year of measureYears) {
    const surges = institutionSurgesPerYear[year] ?? [];
    const works  = worksPerYear[year] ?? [];

    for (const s of surges) {
      const articles = works.filter(w =>
        w.authorships?.some(a => a.institutions?.some(inst => inst.display_name === s.name))
      );
      for (const w of articles) {
        const authors = (w.authorships ?? []).map(au => au.author?.display_name ?? "").filter(Boolean).join("; ");
        const insts   = [...new Set(
          (w.authorships ?? []).flatMap(au => (au.institutions ?? []).map(i => i.display_name)).filter(Boolean)
        )].join("; ");
        lines.push([
          year, s.name,
          w.title ?? "", w.doi ?? "",
          authors, insts,
          w.primary_topic?.display_name ?? "",
          w.primary_topic?.subfield?.display_name ?? "",
          w.primary_topic?.field?.display_name ?? "",
          w.primary_topic?.domain?.display_name ?? "",
        ].map(q).join(","));
      }
    }
  }
  downloadCSV(lines.join("\n"), `${journalSlug(journalName)}_institution_surge_articles.csv`);
}

function ExportBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: `1px solid ${C.border2}`,
        borderRadius: 6,
        color: C.textMuted,
        fontSize: 11,
        fontFamily: "'IBM Plex Mono', monospace",
        padding: "4px 10px",
        cursor: "pointer",
        letterSpacing: "0.05em",
      }}
      onMouseEnter={e => { e.currentTarget.style.color = C.textPrimary; e.currentTarget.style.borderColor = C.blue; }}
      onMouseLeave={e => { e.currentTarget.style.color = C.textMuted;   e.currentTarget.style.borderColor = C.border2; }}
    >
      Export CSV
    </button>
  );
}

const cell = {
  padding: "8px 12px",
  fontSize: 12,
  background: C.surface,
  color: C.textPrimary,
};
