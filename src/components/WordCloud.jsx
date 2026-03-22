import { useMemo } from "react";
import { C } from "../constants.js";

/**
 * @param {{
 *   items: Array<{ id: string, name: string, count: number }>,
 *   title: string,
 *   maxItems?: number,
 *   colorFn?: (item: object, norm: number) => string,
 * }} props
 */
export default function WordCloud({ items, title, maxItems = 80, colorFn }) {
  const words = useMemo(() => {
    if (!items?.length) return [];

    const sorted = [...items]
      .sort((a, b) => b.count - a.count)
      .slice(0, maxItems);

    if (sorted.length === 0) return [];

    const maxCount = sorted[0].count;
    const minCount = sorted[sorted.length - 1].count;
    const range = maxCount - minCount || 1;

    const result = sorted.map(item => {
      const norm = (item.count - minCount) / range;
      const size = Math.round(11 + norm * 24); // 11px – 35px
      const weight = size > 26 ? 700 : size > 18 ? 500 : 400;
      const color = colorFn ? colorFn(item, norm) : interpolateColor(norm);
      return { ...item, size, weight, color };
    });

    // Shuffle for visual spread
    return result.sort(() => Math.random() - 0.5);
  }, [items, maxItems, colorFn]);

  if (!words.length) return null;

  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "16px 20px",
      }}
    >
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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "5px 10px",
          alignItems: "center",
          lineHeight: 1.6,
        }}
      >
        {words.map(w => (
          <span
            key={w.id}
            title={`${w.name} · ${w.count} articles`}
            style={{
              fontSize: w.size,
              color: w.color,
              fontWeight: w.weight,
              fontFamily: "'IBM Plex Sans', sans-serif",
              opacity: 0.85,
              display: "inline-block",
              transition: "opacity 0.15s, transform 0.15s",
              cursor: "default",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = "0.85";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {w.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function interpolateColor(norm) {
  // Cool blue for common topics, amber for rarer ones
  if (norm > 0.66) return C.blueLight;
  if (norm > 0.33) return C.green;
  return C.amberLight;
}
