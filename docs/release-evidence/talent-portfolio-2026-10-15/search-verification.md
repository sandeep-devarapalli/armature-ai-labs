# Portfolio keyword search

Search now indexes supplied project title, summary, individual contribution and skills once during directory indexing. Every match names its project number, field and self-reported status. Evidence-link text is not searched. Employer-only technical terms remain excluded from capability queries; exact company-name lookup remains supported. This is deterministic keyword matching, not independent skill verification.

## Bounded performance check

Contract: preserve existing result identity/order when no portfolio is supplied; keep 8,025-record local keyword searches below 100 ms p95 and index creation below one second. These are local engineering budgets, not production latency promises. Existing tokenizer/indexing reused; no new parsing occurs per keystroke for project fields.

Environment: macOS Darwin arm64 27.2.0, Node 22.22.2, esbuild minified production-equivalent module, one caller. Input identity in JSON reports. 10 warm-up rounds, then 30 rounds of six queries: embedded drone, firmware, SLAM navigation, perception, unmatchedterm, empty. Index sampled five times after one warm-up. Original input contains 8,025 profiles; the second case overlays two explicitly synthetic projects on every tenth record without writing the dataset.

| Workload | Before median / p95 search | After median / p95 search | Before / after median index |
|---|---|---|---|
| Original 8,025 | 5.33 / 11.52 ms | 5.11 / 11.69 ms | 106.13 / 108.58 ms |
| Synthetic 10% portfolio overlay | 5.54 / 11.71 ms | 6.93 / 12.01 ms | 119.30 / 119.15 ms |

Original result-identity hash is unchanged. Overlay results increase intentionally because the new fields now match. Additional work is confined to indexing and checking supplied fields; no evidence of a need for a search-engine optimization. Decision: promote functionality against these local budgets; hold mobile/browser performance claims until measured there. These Node measurements exclude DOM rendering, network and mobile-device performance. GC and machine contention can affect the distribution; do not interpret small differences as speedups.

Reproduce with a retained before-source snapshot and current source under the same conditions:

```sh
node scripts/benchmark-talent-search.mjs /path/to/directory-data.json /path/to/before-directorySearch.ts /tmp/search-before.json
node scripts/benchmark-talent-search.mjs /path/to/directory-data.json src/features/talent/directorySearch.ts /tmp/search-after.json
```

The benchmark reads data locally, reports only aggregate counts/hashes/timings, and never writes or publishes profiles. Raw results: `search-before.json`, `search-after.json`.
