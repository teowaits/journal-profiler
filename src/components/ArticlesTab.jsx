import { useMemo, useState } from "react";
import { C, DRIFT_LABELS, REF_ALIGN_LABELS, BASELINE_YEARS } from "../constants.js";

const SORT_OPTIONS = [
  { key: "score",    label: "Divergence" },
  { key: "year",     label: "Year" },
  { key: "title",    label: "Title" },
];

/**
 * @param {{
 *   divergentArticles: object[],
 *   driftResult: object | null,
 *   refAlignmentPerYear: object,
 *   hasRefAlignment: boolean,
 *   articlesPhase: string,
 *   onRunArticles: function,
 * }} props
 */
export default function ArticlesTab({ journal, divergentArticles, driftResult, hasRefAlignment, articlesPhase, onRunArticles }) {
  const [sortKey, setSortKey]       = useState("score");
  const [sortDir, setSortDir]       = useState("desc");
  const [yearFilter, setYearFilter] = useState("all");
  const [labelFilter, setLabelFilter] = useState("all");

  const years = useMemo(
    () => driftResult ? driftResult.measurements.map(m => m.year).sort() : [],
    [driftResult]
  );

  const filtered = useMemo(() => {
    let arr = divergentArticles;
    if (yearFilter !== "all") arr = arr.filter(a => String(a.publication_year) === yearFilter);
    if (labelFilter !== "all") arr = arr.filter(a => a._divergence?.label === labelFilter);
    return [...arr].sort((a, b) => {
      let va, vb;
      if (sortKey === "score") { va = a._divergence?.score ?? 0; vb = b._divergence?.score ?? 0; }
      else if (sortKey === "year") { va = a.publication_year ?? 0; vb = b.publication_year ?? 0; }
      else { va = (a.title ?? "").toLowerCase(); vb = (b.title ?? "").toLowerCase(); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [divergentArticles, sortKey, sortDir, yearFilter, labelFilter]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (!divergentArticles.length) {
    if (articlesPhase === "running") {
      return (
        <div style={{ color: C.textMuted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>
          Loading article detail…
        </div>
      );
    }

    if (articlesPhase === "idle") {
      return (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 20, color: C.textMuted, marginBottom: 12 }}>◎</div>
          <div style={{ fontSize: 13, color: C.textPrimary, marginBottom: 6 }}>
            Article detail not loaded
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
            Topic drift, country concentration, and self-citation signals are available in the other tabs.
            Load article detail to see per-article topic alignment and identify which articles
            contribute most to any observed scope shifts.
          </div>
          <button
            onClick={onRunArticles}
            style={{
              background: C.blue,
              color: C.bg,
              border: "none",
              borderRadius: 6,
              padding: "9px 20px",
              fontSize: 12,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >
            Load article detail
          </button>
        </div>
      );
    }

    return (
      <div style={{ color: C.textMuted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>
        Run the analysis to view articles.
      </div>
    );
  }

  return (
    <div>
      {/* Export */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <ExportBtn onClick={() => exportArticlesCSV(divergentArticles, hasRefAlignment, journal?.display_name)} />
      </div>

      {/* Note about baseline years */}
      {driftResult && (
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, fontStyle: "italic" }}>
          Topic alignment shows what share of baseline articles share each article's primary topic.
          Higher share = topic well-represented in the {BASELINE_YEARS}-year baseline
          ({driftResult.baselineYears[0]}–{driftResult.baselineYears[driftResult.baselineYears.length - 1]}).
          Articles from the baseline period are not shown.
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <FilterSelect
          label="Year"
          value={yearFilter}
          onChange={setYearFilter}
          options={[{ value: "all", label: "All years" }, ...years.map(y => ({ value: y, label: y }))]}
        />
        <FilterSelect
          label="Alignment"
          value={labelFilter}
          onChange={setLabelFilter}
          options={[
            { value: "all", label: "All" },
            { value: DRIFT_LABELS.notable,  label: DRIFT_LABELS.notable },
            { value: DRIFT_LABELS.moderate, label: DRIFT_LABELS.moderate },
            { value: DRIFT_LABELS.typical,  label: DRIFT_LABELS.typical },
          ]}
        />
        <div style={{ marginLeft: "auto", fontSize: 12, color: C.textMuted, alignSelf: "center" }}>
          {filtered.length} article{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: hasRefAlignment
            ? "1fr 160px 52px 130px 130px 32px"
            : "1fr 160px 52px 130px 32px",
          gap: 8,
          padding: "6px 14px",
          fontSize: 10,
          color: C.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <SortHeader label="Title" sortKey="title" current={sortKey} dir={sortDir} onSort={toggleSort} />
        <div>Topic / Field</div>
        <SortHeader label="Year" sortKey="year" current={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Topic alignment" sortKey="score" current={sortKey} dir={sortDir} onSort={toggleSort} />
        {hasRefAlignment && <div>Ref. alignment</div>}
        <div />
      </div>

      {filtered.map((article, i) => (
        <ArticleRow
          key={article.id}
          article={article}
          index={i}
          hasRefAlignment={hasRefAlignment}
        />
      ))}
    </div>
  );
}

function ArticleRow({ article, index, hasRefAlignment }) {
  const [expanded, setExpanded] = useState(false);
  const div = article._divergence;
  const refAlign = article._refAlignment;

  const authors = (article.authorships ?? []).slice(0, 3);
  const moreAuthors = (article.authorships ?? []).length - 3;

  return (
    <div
      style={{
        background: index % 2 === 0 ? C.surface : C.surface2,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      {/* Main row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "grid",
          gridTemplateColumns: hasRefAlignment
            ? "1fr 160px 52px 130px 130px 32px"
            : "1fr 160px 52px 130px 32px",
          gap: 8,
          padding: "10px 14px",
          cursor: "pointer",
          alignItems: "start",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = C.border)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        {/* Title */}
        <div>
          <div style={{ fontSize: 13, color: C.textPrimary, fontWeight: 500, lineHeight: 1.4 }}>
            {article.title ?? "(no title)"}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
            {authors.map((a, i) => (
              <span key={a.author?.id ?? i}>
                {i > 0 && ", "}
                {a.author?.display_name ?? "Unknown"}
                {a.institutions?.[0]?.display_name ? ` (${a.institutions[0].display_name})` : ""}
              </span>
            ))}
            {moreAuthors > 0 && <span style={{ color: C.textMuted }}> +{moreAuthors} more</span>}
          </div>
        </div>

        {/* Topic / Field */}
        <div>
          <div style={{ fontSize: 12, color: C.textPrimary }}>
            {article.primary_topic?.display_name ?? "—"}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            {article.primary_topic?.field?.display_name ?? ""}
          </div>
        </div>

        {/* Year */}
        <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
          {article.publication_year ?? "—"}
        </div>

        {/* Topic alignment */}
        <div>
          <AlignmentBadge label={div?.label} baselineShare={div?.baselineShare} />
          {div && (
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
              {div.fieldMatch ? "Field in baseline" : "Field outside baseline"}
            </div>
          )}
        </div>

        {/* Ref alignment (optional) */}
        {hasRefAlignment && (
          <div>
            {refAlign
              ? <RefAlignBadge label={refAlign.label} share={refAlign.share} />
              : <span style={{ fontSize: 11, color: C.textMuted }}>—</span>}
          </div>
        )}

        {/* Expand toggle */}
        <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", paddingTop: 2 }}>
          {expanded ? "▲" : "▼"}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            padding: "14px 14px 14px 14px",
            background: C.bgDark,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            {/* All authors */}
            <div style={{ minWidth: 260 }}>
              <SectionLabel>Authors &amp; institutions</SectionLabel>
              {(article.authorships ?? []).map((a, i) => (
                <div key={a.author?.id ?? i} style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>
                  <span style={{ color: C.textPrimary }}>{a.author?.display_name ?? "Unknown"}</span>
                  {a.institutions?.length > 0 && (
                    <span style={{ color: C.textMuted }}>
                      {" · "}{a.institutions.map(inst => inst.display_name).join(", ")}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Topic hierarchy */}
            <div>
              <SectionLabel>Topic hierarchy</SectionLabel>
              <HierarchyRow label="Domain"   value={article.primary_topic?.domain?.display_name} />
              <HierarchyRow label="Field"    value={article.primary_topic?.field?.display_name} />
              <HierarchyRow label="Subfield" value={article.primary_topic?.subfield?.display_name} />
              <HierarchyRow label="Topic"    value={article.primary_topic?.display_name} />
            </div>

            {/* Divergence details */}
            {div && (
              <div>
                <SectionLabel>Alignment detail</SectionLabel>
                <HierarchyRow
                  label={<>Baseline topic share <InfoTip text="The percentage of articles in the baseline period that share this article's primary topic. A higher share means the topic is well-established in the journal's historical profile. Topics absent from the baseline score 0%." /></>}
                  value={(div.baselineShare * 100).toFixed(2) + "%"}
                />
                <HierarchyRow
                  label={<>Year percentile <InfoTip text="This article's rank among all articles published in the same year, ordered by how uncommon their topic is relative to the baseline. 99th = topic is rarer than 99% of that year's articles. A high percentile does not indicate a problem on its own — rare topics are expected in any journal." /></>}
                  value={Math.round(div.topicRank * 100) + "th"}
                />
                <HierarchyRow
                  label={<>Field in baseline <InfoTip text="Whether this article's broad research field (one level above subfield) appears among the top 5 fields by article count in the baseline period. An article outside those fields may suggest a shift at the field level, though fields are broad and some overlap across disciplines is normal." /></>}
                  value={div.fieldMatch ? "Yes" : "No"}
                />
              </div>
            )}

            {/* Reference alignment (if run) */}
            {refAlign && (
              <div>
                <SectionLabel>Reference field alignment</SectionLabel>
                <HierarchyRow label="Aligned refs"  value={`${refAlign.aligned} / ${refAlign.total}`} />
                <HierarchyRow label="Share"         value={`${(refAlign.share * 100).toFixed(1)}%`} />
              </div>
            )}

            {/* Links */}
            <div>
              <SectionLabel>Links</SectionLabel>
              {article.doi && (
                <a
                  href={`https://doi.org/${article.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "block", fontSize: 12, color: C.blue, marginBottom: 4 }}
                >
                  DOI →
                </a>
              )}
              {article.id && (
                <a
                  href={article.id}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "block", fontSize: 12, color: C.blue }}
                >
                  OpenAlex →
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportArticlesCSV(articles, hasRefAlignment, journalName) {
  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "Title", "DOI", "Year",
    "Authors", "Institutions",
    "Topic", "Subfield", "Field", "Domain",
    "Baseline topic share (%)", "Year percentile", "Field in baseline",
  ];
  if (hasRefAlignment) headers.push("Ref alignment label", "Ref alignment share (%)");

  const lines = [q(`Journal: ${journalName ?? ""}`), headers.map(q).join(",")];

  for (const a of articles) {
    const authors = (a.authorships ?? [])
      .map(au => au.author?.display_name ?? "").filter(Boolean).join("; ");
    const insts = [...new Set(
      (a.authorships ?? [])
        .flatMap(au => (au.institutions ?? []).map(i => i.display_name))
        .filter(Boolean)
    )].join("; ");
    const div = a._divergence;
    const ref = a._refAlignment;

    const row = [
      a.title ?? "",
      a.doi ?? "",
      a.publication_year ?? "",
      authors,
      insts,
      a.primary_topic?.display_name ?? "",
      a.primary_topic?.subfield?.display_name ?? "",
      a.primary_topic?.field?.display_name ?? "",
      a.primary_topic?.domain?.display_name ?? "",
      div != null ? (div.baselineShare * 100).toFixed(2) : "",
      div != null ? Math.round(div.topicRank * 100)      : "",
      div != null ? (div.fieldMatch ? "Yes" : "No")      : "",
    ];
    if (hasRefAlignment) {
      row.push(ref?.label ?? "");
      row.push(ref != null ? (ref.share * 100).toFixed(1) : "");
    }
    lines.push(row.map(q).join(","));
  }

  const slug = journalSlug(journalName);
  downloadCSV(lines.join("\n"), `${slug}_articles.csv`);
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

function InfoTip({ text }) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", verticalAlign: "middle" }}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
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
            left: "50%",
            transform: "translateX(-50%)",
            background: C.surface2,
            border: `1px solid ${C.border2}`,
            borderRadius: 8,
            padding: "10px 13px",
            fontSize: 11,
            color: C.textMuted,
            lineHeight: 1.55,
            width: 270,
            zIndex: 200,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

// ─── Small shared sub-components ──────────────────────────────────────────────

function AlignmentBadge({ label, baselineShare }) {
  const color =
    label === DRIFT_LABELS.notable  ? C.amber :
    label === DRIFT_LABELS.moderate ? C.amberLight :
    C.green;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color }}>
        {label ?? "—"}
      </span>
      {baselineShare != null && (
        <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
          {(baselineShare * 100).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

function RefAlignBadge({ label, share }) {
  const color =
    label === REF_ALIGN_LABELS.low      ? C.amber :
    label === REF_ALIGN_LABELS.moderate ? C.amberLight :
    C.green;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color }}>
        {label ?? "—"}
      </span>
      {share != null && (
        <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
          {(share * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function HierarchyRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 3 }}>
      <span style={{ color: C.textMuted, minWidth: 120 }}>{label}</span>
      <span style={{ color: C.textPrimary }}>{value ?? "—"}</span>
    </div>
  );
}

function SortHeader({ label, sortKey: key, current, dir, onSort }) {
  const active = current === key;
  return (
    <div
      onClick={() => onSort(key)}
      style={{
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        color: active ? C.textPrimary : C.textMuted,
        userSelect: "none",
      }}
    >
      {label}
      {active && <span style={{ fontSize: 9 }}>{dir === "asc" ? "▲" : "▼"}</span>}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: C.surface2,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        color: C.textPrimary,
        fontSize: 12,
        padding: "5px 10px",
        fontFamily: "'IBM Plex Mono', monospace",
        cursor: "pointer",
      }}
      aria-label={label}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
