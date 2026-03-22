import { C } from "../constants.js";

const FIELD_COLORS = [
  C.blue, C.green, C.amber, "#b794f4", "#76e4f7",
  "#f687b3", C.blueLight, C.greenDark, C.amberLight, "#e9d8fd",
];

/**
 * Horizontal stacked bar chart for topic/field distribution per year.
 *
 * @param {{
 *   years: string[],
 *   getDistribution: (year: string) => Object.<string, { name, pct, count }>,
 *   topN?: number,    // how many top categories to show individually
 *   title?: string,
 * }} props
 */
export default function BarChart({ years, getDistribution, topN = 8, title }) {
  // Collect all category IDs across all years, rank by total pct
  const globalRank = {};
  for (const year of years) {
    const dist = getDistribution(year);
    for (const [id, entry] of Object.entries(dist)) {
      globalRank[id] = (globalRank[id] ?? 0) + entry.pct;
    }
  }
  const topIds = Object.entries(globalRank)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([id]) => id);

  // Map each topId to a color
  const colorMap = {};
  topIds.forEach((id, i) => { colorMap[id] = FIELD_COLORS[i % FIELD_COLORS.length]; });

  return (
    <div>
      {title && (
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
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {years.map(year => {
          const dist = getDistribution(year);
          const segments = buildSegments(dist, topIds, colorMap);

          return (
            <div key={year} style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                {year}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 18,
                  display: "flex",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                {segments.map((seg, i) => (
                  <div
                    key={i}
                    title={`${seg.name}: ${(seg.pct * 100).toFixed(1)}%`}
                    style={{
                      width: `${seg.pct * 100}%`,
                      background: seg.color,
                      transition: "width 0.3s ease",
                      cursor: "default",
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 14 }}>
        {topIds.map(id => {
          const name = Object.values(globalRank).length > 0
            ? (findName(id, years, getDistribution) ?? id)
            : id;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: colorMap[id],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: C.textMuted }}>{name}</span>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: C.border2, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: C.textMuted }}>Other</span>
        </div>
      </div>
    </div>
  );
}

function buildSegments(dist, topIds, colorMap) {
  const segments = [];
  let otherPct = 1;

  for (const id of topIds) {
    const entry = dist[id];
    if (!entry) continue;
    const pct = entry.pct;
    if (pct <= 0) continue;
    segments.push({ name: entry.name, pct, color: colorMap[id] });
    otherPct -= pct;
  }

  if (otherPct > 0.001) {
    segments.push({ name: "Other", pct: otherPct, color: C.border2 });
  }

  return segments;
}

function findName(id, years, getDistribution) {
  for (const year of years) {
    const entry = getDistribution(year)[id];
    if (entry?.name) return entry.name;
  }
  return null;
}
