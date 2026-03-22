import { useMemo } from "react";
import { C } from "../constants.js";
import JournalSearch from "./JournalSearch.jsx";
import ProgressPanel from "./ProgressPanel.jsx";
import WordCloud from "./WordCloud.jsx";
import { computeTopicDistribution } from "../analytics.js";

/**
 * @param {{
 *   peers: object[],
 *   setPeers: function,
 *   peerDivergence: object | null,
 *   driftResult: object | null,
 *   worksPerYear: object,
 *   yearRange: { from: number, to: number },
 *   onRunPeerComparison: function,
 *   peerPhase: string,
 *   peerLog: string[],
 * }} props
 */
export default function PeerCompareTab({
  peers, setPeers,
  peerDivergence,
  driftResult,
  worksPerYear,
  yearRange,
  onRunPeerComparison,
  peerPhase,
  peerLog,
}) {
  const hasDone = !!driftResult;

  const targetDist = useMemo(() => {
    if (!hasDone) return null;
    const allWorks = Object.values(worksPerYear).flat();
    return computeTopicDistribution(allWorks);
  }, [hasDone, worksPerYear]);

  if (!hasDone) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>
        Run the main analysis first, then add peer journals to compare.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
        Add peer journals to compare their topic profiles against this journal's full-period distribution.
        The comparison is computed against the peer cluster centroid (average distribution).
      </div>

      {/* Peer search */}
      <Section title="Peer journals">
        <JournalSearch
          onSelect={src => {
            if (!peers.find(p => p.id === src.id)) {
              setPeers(prev => [...prev, src]);
            }
          }}
          placeholder="Add a peer journal…"
        />

        {peers.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {peers.map(peer => (
              <div
                key={peer.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: C.surface2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 7,
                  padding: "8px 12px",
                }}
              >
                <div>
                  <span style={{ fontSize: 13, color: C.textPrimary }}>{peer.display_name}</span>
                  {(peer.host_organization?.display_name ?? peer.host_organization_name) && (
                    <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 10 }}>
                      {peer.host_organization?.display_name ?? peer.host_organization_name}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setPeers(prev => prev.filter(p => p.id !== peer.id))}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: C.textMuted,
                    cursor: "pointer",
                    fontSize: 13,
                    padding: "2px 8px",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {peers.length > 0 && peerPhase !== "running" && (
          <button
            onClick={() => onRunPeerComparison(peers, targetDist, yearRange)}
            style={{
              marginTop: 12,
              background: C.blue,
              color: C.bg,
              border: "none",
              borderRadius: 7,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: "pointer",
            }}
          >
            ▶  Compare
          </button>
        )}
      </Section>

      {/* Progress */}
      {peerPhase === "running" && (
        <ProgressPanel
          progress={{ year: null, page: 0, pages: 0, totalYears: peers.length, doneYears: 0 }}
          log={peerLog}
          label="Fetching peer data"
          color={C.amber}
        />
      )}

      {/* Results */}
      {peerDivergence && (
        <Section title="Peer comparison result">
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "18px 20px",
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 12 }}>
              <span style={{ fontSize: 16, color: C.textPrimary, fontWeight: 600 }}>
                {peerDivergence.label}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: C.textMuted,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                JSD {(peerDivergence.jsd * 100).toFixed(1)} / 100
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted }}>
              Divergence from peer cluster centroid across {peers.length} peer journal{peers.length !== 1 ? "s" : ""},
              {" "}period {yearRange.from}–{yearRange.to}.
              0 = identical profile to peer average; 100 = no topical overlap.
            </div>
          </div>

          {/* Target vs centroid word clouds */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <WordCloud
                items={Object.values(targetDist).map(e => ({
                  id: e.id,
                  name: e.name,
                  count: e.count,
                }))}
                title="This journal — topic profile"
                maxItems={50}
              />
            </div>
            <div>
              <WordCloud
                items={Object.values(peerDivergence.centroid).map(e => ({
                  id: e.id,
                  name: e.name,
                  count: Math.round(e.pct * 1000),
                }))}
                title="Peer cluster centroid"
                maxItems={50}
                colorFn={() => C.amberLight}
              />
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 10,
          color: C.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
