import { C } from "../constants.js";

function ProgressBar({ value, max, color = C.blue }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: C.border2, borderRadius: 99, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 99,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

function Spinner({ size = 14, color = C.blue }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `2px solid ${C.border2}`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

/**
 * @param {{
 *   progress: { year: number|null, page: number, pages: number, totalYears: number, doneYears: number },
 *   log: string[],
 *   label?: string,
 *   color?: string,
 * }} props
 */
export default function ProgressPanel({ progress, log, label = "Fetching articles", color = C.blue }) {
  const { year, page, pages, totalYears, doneYears } = progress;

  const yearPct = totalYears > 0 ? doneYears / totalYears : 0;
  const pagePct = pages > 0 ? page / pages : 0;
  const lastLog = log[log.length - 1] ?? "Working…";

  return (
    <div
      style={{
        background: C.surface2,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "18px 20px",
        marginTop: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 14,
        }}
      >
        {label}
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
        {/* Overall years progress */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: C.textMuted,
              marginBottom: 5,
            }}
          >
            <span>Years</span>
            <span>{Math.round(yearPct * 100)}%</span>
          </div>
          <ProgressBar value={doneYears} max={totalYears || 1} color={color} />
        </div>

        {/* Current year page progress */}
        {year != null && (
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: C.textMuted,
                marginBottom: 5,
              }}
            >
              <span>{year}</span>
              <span>
                {page}/{pages} pages
              </span>
            </div>
            <ProgressBar value={page} max={pages || 1} color={color} />
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: C.textMuted,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        <Spinner size={12} color={color} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lastLog}
        </span>
      </div>
    </div>
  );
}
