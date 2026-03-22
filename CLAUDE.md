# CLAUDE.md — Journal Publishing Profile Analyser

> Full design documentation is in `CLAUDE.docx` in this directory.  
> This file is the quick-reference for Claude Code sessions.

---

## What this project is

A React + Vite single-page app that analyses the **publishing profile of an academic journal over time** using the [OpenAlex API](https://openalex.org). It surfaces bibliometric signals for review by subject matter experts. It does not render verdicts or make accusations.

**Dual use:** internal consulting engagement (one specific journal) → public GitHub release after engagement concludes.

**Parent project to inherit patterns from:** [teowaits/journal-overlap](https://github.com/teowaits/journal-overlap)

---

## Core constraint — language policy

The tool must never imply wrongdoing. Every string in the UI follows this register:

| ✅ Use | ❌ Never use |
|--------|-------------|
| Topic distribution shift | Scope deviation / violation |
| Notable / Atypical | Suspicious / Anomalous |
| Outside typical range | Abnormal / Flagged |
| Warrants closer review | Red flag / Indicates misconduct |
| Publishing profile analysis | Integrity audit / Ethics check |
| Reference field alignment | Citation manipulation indicator |

---

## Signals to compute (in priority order)

1. **Temporal topic drift** — JSD of topic distribution year-over-year (5yr baseline → 3yr ago → last year)
2. **Reference field alignment** — compare topic distribution of published articles vs. their references' topics
3. **Author institutional profile** — Herfindahl index on institution/country concentration per year
4. **Intra-citation density** — share of references citing the same journal, tracked over time
5. **Peer journal comparison** — divergence from peer cluster centroid (user-supplied peer list)

Signals 2 and 5 are optional/user-initiated (extra API calls). Signals 1, 3, 4 run automatically.

---

## OpenAlex API essentials

```
Base: https://api.openalex.org
No auth required for basic use.

Key endpoints:
  /sources?search={name}                          → resolve journal name to Source ID
  /works?filter=primary_location.source.id:{id}
        ,publication_year:{year},type:article     → fetch articles
  /works?filter=openalex_id:{id1}|{id2}|...       → batch-fetch referenced works (max 100)
  /works?filter=...&group_by=primary_topic.id     → fast topic counts (no pagination needed)
  /sources?filter=asjc_codes:{code}               → find peer journals

Always use: per_page=200, select= (only needed fields), 60ms delay between pages
Hard limit: 10,000 results per query (50 pages × 200)
NEVER filter by name — always resolve to ID first (two-step lookup)
Deprecated: concepts (use topics), host_venue (use primary_location)
```

### Work fields used
```
id, title, doi, publication_year
authorships[].author.id
authorships[].institutions[].display_name / .id
primary_location.source.id / .display_name
primary_topic.id / .display_name
primary_topic.subfield / .field / .domain   ← { id, display_name }
referenced_works[]                           ← list of Work IDs
```

### Topic hierarchy
```
Domain (4)  →  Field (~25)  →  Subfield (~250)  →  Topic (~4,500)
```
Use `primary_topic` only — single best signal, keeps logic tractable.

---

## App structure

### Four tabs
| Tab | Purpose |
|-----|---------|
| Overview | Journal identity, time range selector, run button, composite profile summary |
| Topic Profile | Year-over-year topic distribution + drift metric + word clouds (subfield/topic only) |
| Articles | Sortable table of articles by divergence — **primary expert working surface** |
| Peer Comparison | Journal vs. peer cluster (optional, user-supplied peers) |

**No verdict screen.** Architecture enforces signals-not-verdicts structurally.

### Article view columns (required)
Title (DOI link) · Authors + institution · Year · Assigned topic / field / domain · Topic alignment indicator · Reference alignment (if run) · OpenAlex link

### Composite profile dimensions (per journal-year)
- Topic alignment to 3-year profile: `Within typical range / Moderate shift / Notable shift`
- Reference field alignment: `High / Moderate / Low`
- Author institutional profile: `Within typical range / Outside typical range`
- Intra-citation density: `Within typical range / Elevated / Notably elevated`

---

## Repo structure

```
src/
  App.jsx               ← main app, tab routing
  api.js                ← all OpenAlex fetch logic (no UI, no analytics)
  analytics.js          ← pure computation functions (no fetch, no UI)
  components/
    JournalSearch.jsx
    OverviewTab.jsx
    TopicProfileTab.jsx
    ArticleTab.jsx
    PeerCompareTab.jsx
    WordCloud.jsx        ← reusable, parameterised
    BarChart.jsx         ← reusable horizontal stacked bar
index.html
vite.config.js
package.json
README.md
LICENSE               ← MIT
CLAUDE.md             ← this file
CLAUDE.docx           ← full design documentation
```

### Key functions to implement in `analytics.js`
```js
computeTopicDistribution(works)           → Map<topicId, { name, field, domain, count, pct }>
computeJSDivergence(distA, distB)         → float  [0–1]
computeHHI(works)                         → float  [0–1]
computeIntraCitationDensity(works, srcId) → { density, selfCites, total }
computeArticleDivergence(article, baseline) → { score, topicRank, fieldMatch }
computeDriftOverTime(worksPerYear)        → Array<{ year, jsd, topicProfile }>
```

---

## Design language — inherit from journal-overlap

```js
// Colour tokens (dark theme)
bg: "#0d111c"      surface: "#131826" / "#161b2a"
border: "#1e2436"  border2: "#2d3449"
textPrimary: "#e2e8f0"   textMuted: "#718096"
blue: "#63b3ed"    blueLight: "#90cdf4"
amber: "#f6ad55"   amberLight: "#fbd38d"
green: "#9ae6b4"
fonts: IBM Plex Mono (UI) + IBM Plex Sans (labels)
```

### Carry over from journal-overlap
- Journal search-and-click input (400ms debounce)
- Paste modal for bulk entry
- AbortController + cancel button
- Progress bars with live log line
- Expandable article rows
- Word cloud: flexbox wrap, size interpolated from min/max, hover `scale(1.1)`, shuffled
- Footer: `Created by teowaits · Data from OpenAlex API (CC0) · MIT License`

### Do NOT carry over
- Set A / Set B two-journal-set pattern → replaced by single journal over time
- Intersection/overlap computation → replaced by temporal drift
- Author enrichment via `/authors` → not needed here

---

## State shape (sketch)

```js
{
  journal: { id, display_name, issn, works_count },
  yearRange: { from, to },
  phase: 'idle' | 'running' | 'done' | 'error',
  worksPerYear: Map<year, Work[]>,
  topicProfilePerYear: Map<year, Map<topicId, { name, field, domain, count }>>,
  referenceAlignmentPerYear: Map<year, { aligned, total }>,  // optional
  authorProfilePerYear: Map<year, { hhi, countries, institutions }>,
  intraCitationDensityPerYear: Map<year, { density, total }>,
  divergentArticles: Article[],   // sorted desc by divergence
  peers: Source[],                // optional, user-supplied
}
```

---

## References

- [OpenAlex API docs](https://docs.openalex.org)
- [OpenAlex LLM quick reference](https://developers.openalex.org/guides/llm-quick-reference)
- [OpenAlex topics overview](https://help.openalex.org/hc/en-us/articles/24736129405719-Topics)
- [Parent project — journal-overlap](https://github.com/teowaits/journal-overlap)
- Priem et al. 2022 — [OpenAlex paper](https://arxiv.org/abs/2205.01833)

---

*Author: teowaits · March 2026 · MIT License*
