// ─── Design tokens ────────────────────────────────────────────────────────────
export const C = {
  bg:           "#0d111c",
  bgDark:       "#0a0e1a",
  surface:      "#131826",
  surface2:     "#161b2a",
  border:       "#1e2436",
  border2:      "#2d3449",
  textPrimary:  "#e2e8f0",
  textSecondary:"#a0aec0",
  textMuted:    "#718096",
  blue:         "#63b3ed",
  blueLight:    "#90cdf4",
  amber:        "#f6ad55",
  amberLight:   "#fbd38d",
  green:        "#9ae6b4",
  greenDark:    "#68d391",
  red:          "#fc8181",
};

// ─── Signal thresholds ────────────────────────────────────────────────────────

// JSD: 0 = identical topic distribution, 1 = no topical overlap
export const JSD_THRESHOLDS = {
  MODERATE: 0.25,  // below → Within typical range
  NOTABLE:  0.50,  // above → Notable shift
};

// Country HHI: 0 = perfectly distributed across countries, 1 = single country
// Fewer categories (~200 countries) makes 0.25 a meaningful threshold.
export const HHI_THRESHOLDS = {
  MODERATE: 0.25,
  NOTABLE:  0.50,
};

// Institution surge: flag institutions whose authorship share jumps vs baseline
export const INSTITUTION_SURGE_THRESHOLDS = {
  MIN_SHARE: 0.02,  // institution must be ≥ 2% of year's author-affiliations to be flagged
  DELTA:     0.03,  // absolute increase of ≥ 3 percentage points vs baseline
};

// Intra-citation density: share of references citing the same journal
export const INTRA_CITE_THRESHOLDS = {
  ELEVATED:        0.10,
  NOTABLY_ELEVATED: 0.20,
};

// Article count YoY variation: raw YoY change > ±20% flags "outside typical range"
// Reflects typical publishing growth variation — Nature Index reported +16% across all disciplines in 2024.
export const ARTICLE_COUNT_VAR_THRESHOLD = 0.20; // ±20%

// Per-article topic alignment: baseline share of the article's primary topic
// High share → topic is well-represented in the baseline → aligned
export const ARTICLE_ALIGN_THRESHOLDS = {
  TYPICAL: 0.02,   // ≥ 2% baseline share → Within typical range
  LOW:     0.005,  // 0.5–2%             → Moderate shift; below → Notable shift
};

// Reference field alignment: share of references whose field matches the article's field
export const REF_ALIGNMENT_THRESHOLDS = {
  HIGH:     0.60,  // above → High
  MODERATE: 0.40,  // 0.40–0.60 → Moderate, below → Low
};

// Minimum years required to run analysis (5 baseline + 1 measurement)
export const MIN_YEAR_RANGE = 6;

// Baseline window length in years
export const BASELINE_YEARS = 5;

// ─── Language-policy label maps ───────────────────────────────────────────────
// All user-facing category strings live here. No verdict language anywhere.

export const DRIFT_LABELS = {
  typical:  "Within typical range",
  moderate: "Moderate shift",
  notable:  "Notable shift",
};

export const CONCENTRATION_LABELS = {
  typical:  "Within typical range",
  outside:  "Outside typical range",
};

export const INTRA_CITE_LABELS = {
  typical:  "Within typical range",
  elevated: "Elevated",
  notably:  "Notably elevated",
};

export const REF_ALIGN_LABELS = {
  high:     "High",
  moderate: "Moderate",
  low:      "Low",
};

// ─── API constants ─────────────────────────────────────────────────────────────
export const OPENALEX_BASE   = "https://api.openalex.org";
// Add your email to use OpenAlex's "polite pool" (higher rate limits).
// See https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication
export const OPENALEX_MAILTO = ""; // set to your email only if you have an OpenAlex paid plan
export const PER_PAGE      = 200;
export const PAGE_DELAY_MS = 100;  // 100ms → ~10 req/s, within OpenAlex anonymous limit
export const SEARCH_DELAY_MS = 380;
export const MAX_PAGES     = 50;   // hard limit: 50 × 200 = 10,000 works
export const BATCH_SIZE    = 100;  // max IDs per /works?filter=openalex_id:... call
export const RETRY_LIMIT   = 3;    // max retries on 429 (exponential backoff: 2s, 4s, 8s)
