# Journal Profile Analyser

**Live app → [teowaits.github.io/journal-profiler](https://teowaits.github.io/journal-profiler/)**

A browser-based bibliometric tool for analysing the **publishing profile of an academic journal over time**, powered by the [OpenAlex](https://openalex.org) open scholarly metadata API.

Given a journal and a date range, the app computes a suite of signals across four analytical views, surfacing patterns that warrant closer review by subject matter experts. The tool is designed to inform — not to render verdicts.

---

## Signals computed

| Signal | Description |
|--------|-------------|
| **Temporal topic drift** | Jensen-Shannon Divergence of the journal's topic distribution year-over-year, relative to a 5-year baseline |
| **Author institutional profile** | Country-level HHI (Herfindahl-Hirschman Index) measuring geographic concentration of authorships, plus institution-level surge detection |
| **Intra-citation density** | Share of references citing articles in the same journal, tracked over time |
| **Article count variation** | Year-on-year article count growth relative to the baseline window |
| **Reference field alignment** *(optional)* | Compares the research field of each article against the fields of its cited works |

---

## Analytical views

| Tab | What it shows |
|-----|---------------|
| **Overview** | Journal identity, year range selector, composite signal summary table with expandable article-count chart, optional reference alignment run |
| **Topic Profile** | JSD drift chart, field distribution bar chart, side-by-side baseline vs. selected-year word clouds (subfield + topic), CSV exports |
| **Articles** | All measurement-year articles ranked by topic alignment to baseline, with filters, expandable detail rows, and CSV export |
| **Authors & Citations** | Country HHI trend, country distribution bar chart, institution surge table, intra-citation density chart and table, total self-citation rate |

---

## Running locally

**Requirements:** Node.js 18+ and npm.

```bash
# 1. Clone the repo
git clone https://github.com/teowaits/journal-profiler.git
cd journal-profiler

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

```bash
# Build for production
npm run build

# Preview the production build
npm run preview
```

No API key is required — OpenAlex is free and open. For sustained heavy usage, register a polite-pool email at [openalex.org](https://openalex.org).

---

## Deploying to GitHub Pages

The production build outputs to the `docs/` folder and sets the base path to `/journal-profiler/` — matching this repository name.

```bash
# Rebuild after any code change
npm run build

# Commit the updated docs/ folder and push
git add docs/
git commit -m "Rebuild for Pages"
git push
```

On GitHub: **Settings → Pages → Source → Deploy from a branch → `main` / `/docs`**.

---

## How it works

1. **Journal resolution** — the journal name is resolved to an OpenAlex Source ID via the `/sources` search endpoint (two-step lookup; never filtered by name directly).
2. **Work fetching** — all articles in the selected date range are fetched in paginated batches (`/works?filter=primary_location.source.id:...`), capturing authorship, institutions, primary topic, and referenced works.
3. **Baseline computation** — the first 5 years of the selected range form the baseline aggregate distribution (minimum range: 6 years).
4. **Signal computation** — all metrics are computed client-side from the fetched data:
   - Topic distributions and Jensen-Shannon Divergence (per year vs. baseline)
   - Country-level HHI and institution surge detection
   - Intra-citation density via set-intersection of `referenced_works` IDs
   - Per-article topic alignment (baseline share of the article's primary topic)
5. **Optional signals** — reference field alignment runs on demand (one API call per reference batch).

### Practical limits

| Journal size | Estimated run time |
|--------------|--------------------|
| Small (< 500 articles/year) | 10–30 seconds |
| Medium (500–2,000 articles/year) | 30–90 seconds |
| Large (2,000–10,000 articles/year) | 2–5 minutes |

The OpenAlex API caps results at 10,000 articles per query. Years exceeding this limit are noted in the UI and analysed on a representative sample.

---

## CSV exports

Every analytical view offers CSV export:

| Export | Contents |
|--------|----------|
| Topic distribution | One row per topic and subfield; article counts per year |
| Topic distribution — Gem Finder | Topics and subfields for the selected year, ranked by article count; compatible with the journal-overlap Gem Finder workflow |
| Field distribution | One row per field; article counts per year |
| Articles | All measurement-year articles with topic alignment metrics and optional ref-alignment columns |
| Country distribution | All countries (not just the chart's top 10); author-affiliation counts per year |
| Institution surge articles | All articles from surging institutions, with Year as a column |
| Prolific authors | Authors with ≥ 10 articles in a single measurement year; one row per article |
| Peer comparison | Topic % for this journal and the peer centroid, with JSD scores |

All files are named `{Journal_Name}_{type}.csv` and include the journal name as the first row for easy identification.

---

## Changelog

### Post-release updates (since initial GitHub publish)

#### Analysis architecture — two-phase model
The main analysis run no longer fetches full article records upfront. Phase 1 now uses the OpenAlex `group_by` endpoint to retrieve topic distributions, country concentrations, and article counts in one call per year — significantly faster for large journals. A lightweight pass then fetches only article IDs, referenced works, and authorships (no titles, no full metadata) to compute self-citation signals. This makes the initial run faster and cheaper for all journal sizes.

#### Self-citation computation — breaking change
Intra-citation density and total self-citation rate are now computed from the lightweight ID/refs fetch in Phase 1, rather than from the full article payload. The underlying figures are equivalent, but the pipeline is separate from article detail loading. The `intraCitationPerYear` state is now derived from `worksLitePerYear` (lightweight works) rather than `worksPerYear` (full article detail).

#### Article detail is now optional
The full article fetch — required to populate the Articles tab with per-article topic alignment scores — is now a separate, on-demand step. After Phase 1 completes, the Overview, Topic Profile, and Authors & Citations tabs are fully populated. The Articles tab displays a prompt with a **Load article detail** button; users who only need aggregate signals can skip this step entirely. This is particularly useful for large journals where the full fetch can take several minutes.

#### New export — Gem Finder format
The Topic Profile tab now offers an **Export for Gem Finder** button alongside the existing Export CSV in the word cloud section. It exports topics and subfields for the selected year, ranked by article count, in the four-column format (`type`, `OpenAlex ID`, `display_name`, `notes`) compatible with [journal-overlap](https://github.com/teowaits/journal-overlap)'s Gem Finder workflow.

#### Reload warning shown proactively
The warning about re-running the analysis on tab reload or computer sleep is now displayed permanently at the top of the page — before any journal is selected — so users can take steps (e.g. disable sleep) before starting a long run on a large journal.

---

## Data & acknowledgements

All scholarly metadata is provided by **[OpenAlex](https://openalex.org)** — a fully open, free index of global research output maintained by [OurResearch](https://ourresearch.org). OpenAlex is central to this project: without its open API and comprehensive coverage, the analysis pipeline would not be possible. OpenAlex data is released under the [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) public domain dedication.

> Priem, J., Piwowar, H., & Orr, R. (2022). OpenAlex: A fully-open index of the world's research. *arXiv*. https://doi.org/10.48550/arXiv.2205.01833

The app follows OpenAlex API best practices:
- Two-step journal resolution (search → ID) rather than filtering by name
- `select=` field filtering to minimise response payload
- Polite rate limiting with inter-request delays
- Year-chunked pagination to stay within the 10k result paging wall
- Client-side analytics to avoid redundant API calls

---

## Created by

**[teowaits](https://github.com/teowaits)** — creator and architect.

Built with the assistance of [Claude Sonnet 4.6](https://www.anthropic.com/claude) by Anthropic.

This project is a companion to [journal-overlap](https://github.com/teowaits/journal-overlap), which analyses authorship overlap between sets of journals. The two tools share a design language and API conventions.

---

## License

[MIT](LICENSE)
