import { useMemo, useState } from "react";
import { C, BASELINE_YEARS } from "../constants.js";
import WordCloud from "./WordCloud.jsx";
import BarChart from "./BarChart.jsx";

/**
 * @param {{
 *   journal: object | null,
 *   driftResult: object | null,
 *   topicProfilePerYear: object,
 * }} props
 */
export default function TopicProfileTab({ journal, driftResult, topicProfilePerYear }) {
  if (!driftResult) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>
        Run the analysis to view the topic profile.
      </div>
    );
  }

  const { baselineYears, baseline, measurements } = driftResult;
  const allYears = [
    ...baselineYears,
    ...measurements.map(m => m.year),
  ].sort();

  return (
    <div>
      {/* JSD drift chart */}
      <Section title="Topic distribution shift over time">
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
          Jensen-Shannon Divergence relative to {BASELINE_YEARS}-year baseline
          ({baselineYears[0]}–{baselineYears[baselineYears.length - 1]}).
          Range 0–100: 0 = identical to baseline, 100 = no topical overlap.
        </div>
        <DriftChart measurements={measurements} />
      </Section>

      {/* Distribution bar chart — field level */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Field distribution by year
          </div>
          <ExportBtn onClick={() => exportFieldCSV(topicProfilePerYear, allYears, journal?.display_name)} />
        </div>
        <BarChart
          years={allYears}
          getDistribution={year => {
            const profile = topicProfilePerYear[year] ?? {};
            const fields = {};
            for (const entry of Object.values(profile)) {
              const fid = entry.field?.id;
              if (!fid) continue;
              if (!fields[fid]) {
                fields[fid] = { id: fid, name: entry.field.display_name, pct: 0, count: 0 };
              }
              fields[fid].pct += entry.pct;
              fields[fid].count += entry.count;
            }
            return fields;
          }}
          topN={8}
        />
      </div>

      {/* Word cloud comparison */}
      <WordCloudComparison
        baseline={baseline}
        baselineYears={baselineYears}
        measurements={measurements}
        topicProfilePerYear={topicProfilePerYear}
        allYears={allYears}
        journalName={journal?.display_name}
      />
    </div>
  );
}

// ─── Word cloud comparison (baseline vs selected year) ────────────────────────

function WordCloudComparison({ baseline, baselineYears, measurements, topicProfilePerYear, allYears, journalName }) {
  const measurementYears = measurements.map(m => m.year);
  const [selectedYear, setSelectedYear] = useState(measurementYears[measurementYears.length - 1]);

  const baseClouds = useMemo(() => buildCloudsFor(baseline), [baseline]);

  const yearProfile = topicProfilePerYear[selectedYear] ?? {};
  const yearClouds = useMemo(() => buildCloudsFor(yearProfile), [yearProfile]);

  const selectedMeasurement = measurements.find(m => m.year === selectedYear);
  const jsdColor =
    selectedMeasurement?.jsd >= 0.50 ? C.amber :
    selectedMeasurement?.jsd >= 0.25 ? C.amberLight :
    C.green;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Header row: section label + export button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Topic &amp; subfield word clouds
        </div>
        <button
          onClick={() => exportCSV(topicProfilePerYear, allYears, journalName)}
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
          onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = C.border2; }}
        >
          Export CSV
        </button>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Left — Baseline */}
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.textMuted,
              marginBottom: 12,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            Baseline · {baselineYears[0]}–{baselineYears[baselineYears.length - 1]}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <WordCloud items={baseClouds.subfields} title="Subfield distribution" maxItems={60} />
            <WordCloud items={baseClouds.topics}    title="Topic distribution"    maxItems={80} />
          </div>
        </div>

        {/* Right — Selected year */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              style={{
                background: C.surface,
                border: `1px solid ${C.border2}`,
                borderRadius: 6,
                color: C.textPrimary,
                fontSize: 12,
                fontFamily: "'IBM Plex Mono', monospace",
                padding: "3px 8px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {measurementYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {selectedMeasurement && (
              <span style={{ fontSize: 11, color: jsdColor, fontFamily: "'IBM Plex Mono', monospace" }}>
                JSD {(selectedMeasurement.jsd * 100).toFixed(1)} · {selectedMeasurement.label}
              </span>
            )}
          </div>

          {yearClouds.topics.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMuted, padding: "12px 0" }}>
              No articles recorded for this year.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <WordCloud items={yearClouds.subfields} title={`${selectedYear} — Subfields`} maxItems={60} />
              <WordCloud items={yearClouds.topics}    title={`${selectedYear} — Topics`}    maxItems={80} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Drift sparkline ──────────────────────────────────────────────────────────

function DriftChart({ measurements }) {
  if (!measurements.length) return null;

  const maxJSD = Math.max(...measurements.map(m => m.jsd), 0.01);
  const barMax = Math.max(maxJSD * 1.2, 0.15);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {measurements.map(m => {
          const pct = m.jsd / barMax;
          const color =
            m.jsd >= 0.50 ? C.amber :
            m.jsd >= 0.25 ? C.amberLight :
            C.green;

          return (
            <div key={m.year} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  textAlign: "right",
                  fontSize: 11,
                  color: C.textMuted,
                  fontFamily: "'IBM Plex Mono', monospace",
                  flexShrink: 0,
                }}
              >
                {m.year}
              </div>
              <div style={{ flex: 1, height: 18, background: C.border2, borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct * 100}%`,
                    background: color,
                    borderRadius: 4,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <div
                style={{
                  width: 80,
                  fontSize: 11,
                  color,
                  fontFamily: "'IBM Plex Mono', monospace",
                  flexShrink: 0,
                }}
              >
                {(m.jsd * 100).toFixed(1)} · {m.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract subfield and topic word-cloud items from a topic profile object. */
function buildCloudsFor(profile) {
  const subfieldMap = {};
  const topicList = [];

  for (const entry of Object.values(profile)) {
    const sfid = entry.subfield?.id;
    if (sfid) {
      if (!subfieldMap[sfid]) {
        subfieldMap[sfid] = { id: sfid, name: entry.subfield.display_name, count: 0 };
      }
      subfieldMap[sfid].count += entry.count;
    }
    topicList.push({ id: entry.id, name: entry.name, count: entry.count });
  }

  return { subfields: Object.values(subfieldMap), topics: topicList };
}

/** Build and download a CSV: one row per topic + one per subfield, one count column per year. */
function exportCSV(topicProfilePerYear, allYears, journalName) {
  const topicRows = {};
  const subfieldRows = {};

  for (const year of allYears) {
    const profile = topicProfilePerYear[year] ?? {};
    for (const [topicId, entry] of Object.entries(profile)) {
      if (!topicRows[topicId]) {
        topicRows[topicId] = {
          name: entry.name,
          subfield: entry.subfield?.display_name ?? "",
          field: entry.field?.display_name ?? "",
          domain: entry.domain?.display_name ?? "",
          counts: {},
        };
      }
      topicRows[topicId].counts[year] = entry.count;

      const sfid = entry.subfield?.id;
      if (sfid) {
        if (!subfieldRows[sfid]) {
          subfieldRows[sfid] = {
            name: entry.subfield.display_name,
            field: entry.field?.display_name ?? "",
            domain: entry.domain?.display_name ?? "",
            counts: {},
          };
        }
        subfieldRows[sfid].counts[year] =
          (subfieldRows[sfid].counts[year] ?? 0) + entry.count;
      }
    }
  }

  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [
    q(`Journal: ${journalName ?? ""}`),
    ["Level", "Name", "Subfield", "Field", "Domain", ...allYears].map(q).join(","),
  ];

  for (const row of Object.values(subfieldRows)) {
    lines.push(["Subfield", row.name, "", row.field, row.domain, ...allYears.map(y => row.counts[y] ?? 0)].map(q).join(","));
  }
  for (const row of Object.values(topicRows)) {
    lines.push(["Topic", row.name, row.subfield, row.field, row.domain, ...allYears.map(y => row.counts[y] ?? 0)].map(q).join(","));
  }

  downloadCSV(lines.join("\n"), `${journalSlug(journalName)}_topic_distribution.csv`);
}

// ─── Field distribution CSV export ───────────────────────────────────────────

function exportFieldCSV(topicProfilePerYear, allYears, journalName) {
  const fieldRows = {};

  for (const year of allYears) {
    const profile = topicProfilePerYear[year] ?? {};
    for (const entry of Object.values(profile)) {
      const fid = entry.field?.id;
      if (!fid) continue;
      if (!fieldRows[fid]) {
        fieldRows[fid] = {
          name: entry.field.display_name,
          domain: entry.domain?.display_name ?? "",
          counts: {},
        };
      }
      fieldRows[fid].counts[year] = (fieldRows[fid].counts[year] ?? 0) + entry.count;
    }
  }

  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [
    q(`Journal: ${journalName ?? ""}`),
    ["Field", "Domain", ...allYears].map(q).join(","),
  ];
  for (const row of Object.values(fieldRows)) {
    lines.push([row.name, row.domain, ...allYears.map(y => row.counts[y] ?? 0)].map(q).join(","));
  }
  downloadCSV(lines.join("\n"), `${journalSlug(journalName)}_field_distribution.csv`);
}

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

// ─── Layout helper ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontSize: 10,
          color: C.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
