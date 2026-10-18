# Progress

## Checklist

- [x] STEP 1 — Excel Solver workbook export from current operational state, with Model, Expected, and Data sheets and a round-trip objective test.
- [x] STEP 2 — Present mode and current-result CSV, PNG, and printable report exports.
- [x] STEP 3 — Rewrite README; add VIVA, report map, and deployment documentation.
- [x] STEP 4 — Harden API security and configure Render deployment and first-load experience.
- [ ] STEP 5 — Complete guide coverage and honesty/UX/code audit, then release.

## Current Request Notes

- Step 1 committed as `07483be`. Added `GET /api/export/solver.xlsx?mode=weighted|plain`, backed by the shared operational-state loader and the engine's Dijkstra/cost model.
- Workbook contains editable binary decision cells, live row/column constraints and SUMPRODUCT objective, queue and ALS-policy costs, AURA expected results, raw current data, and Dijkstra path records. The ExcelJS round-trip test recomputes the Expected assignment objective.
- Export is available from the Dispatch Model drawer and command palette. `npm run lint`, all 10 tests, and `npm run build` passed; build retains the existing large-bundle warning.
- Step 2 committed as `19d0ec6`. Present mode (`P`, Left/Right arrows) now traverses live Fleet, Call form, Solve, comparison, Dijkstra trace, Model export, evaluation, and result takeaway. It can be exited at any step.
- Added current solve CSV, evaluation CSV, `html-to-image` PNG capture, and a print-isolated A4 landscape Run report with live matrix, assignments, metrics, config, timestamps, and provenance. Evaluation remains available even if EMS SAMPLE rows fail to load.
- Browser validation completed all eight steps against live UI state; the 500-scenario panel finished. PNG capture produced a download without cross-origin font errors after using `skipFonts`. At 390 CSS px, no horizontal overflow was observed.
- Step 3 documentation and cleanup are staged for commit. README now describes the actual TypeScript/Express/Supabase app and model; `docs/VIVA.md` contains 25 code-grounded answers; `docs/REPORT_MAP.md` maps 17 report numbers and 15 slide numbers to source/screenshots. Original guide/PPT files were not found, so their titles remain unverified placeholders.
- `npx depcheck` flagged `motion` and `autoprefixer`; both were removed. Tailwind remains required by `src/index.css` and `@tailwindcss/vite`; depcheck reports only that CSS/plugin dependency as an unused false positive. Regeneration scripts and `python/requirements.txt` were added, and `npm run parity:export` generated `tests/fixtures/parity.json`.
- Step 3 validation: lint passed, all 10 tests passed, and production build passed with the existing `highs` externalization/large-chunk warning. Python/PuLP remains unexecuted locally because no Python runtime is installed.
- Step 4 implementation is complete: Helmet CSP/security headers, exact `APP_URL` CORS, 1 MB body limits, focused evaluate/pulse limits, generic production 500 messages, structured parse/size errors, and graceful shutdown are in place. Render and Railway directions plus a reduced-motion-aware boot/connecting state were added.
- Step 4 validation: lint passed, all 12 tests passed (including origin/header and 413 regressions), and build passed. A public deployment was not created because no Render/Railway account authorization or deploy environment values were supplied.

- [x] STEP 1 — Split the Express application, routes, shared Supabase/fallback state, config reader, and simulation clock; validate POST bodies and centralize structured errors.
- [x] STEP 2 — Unify AppConfig defaults/loading and correct area types.
- [x] STEP 3 — Apply ALS/SLA/cap costs consistently through HiGHS, Hungarian, and both baselines; add UI assignment markers/reasons.
- [x] STEP 4 — Add the model and settings drawers with persisted, validated configuration.
- [x] STEP 5 — Build scenario presets, Guide 5×5 fixture, Lab UI, and verification/push.

## Notes

- Final validation passed: `npm run lint`, `npm test`, and `npm run build` all succeeded after the evaluation engine, parity fixtures, and deployment scaffolding were completed.
- Monte Carlo evaluation now runs deterministically with a seeded triage mix and streams progress through `POST /api/evaluate` with SSE completion payloads.
- Insights evaluation panel reads the live summary payload and exports CSVs without stale type mismatches.
- The parity fixture workflow is in place and the test suite now checks the engine contract against the real Dijkstra/travel-time model.
- CI and container readiness were added via `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`, and `.dockerignore` for repeatable build checks.
- Seeded scenarios now use deterministic timestamps. Two complete 500-scenario runs with seed 1337 returned identical summaries, each averaging about 12.4 seconds, with zero integrity violations.
- Coverage is enforced at the measured baseline (75% statements, 50% branches, 85% functions, 78% lines); latest results were 76.47%, 53.62%, 86.2%, and 78.63% respectively.
- Python/PuLP could not be executed in this Windows environment because Python is unavailable. The seeded fixture exporter and PuLP reference are present, but independent PuLP parity remains unverified here; TS tests verify the HiGHS/Hungarian cross-check instead.

- Verified the existing project already contains most of the Dispatch Slip primitives and design-system scaffolding.
- The priority gap cleanup focused on the actual leaked user-facing copy and legacy token cleanup rather than rewriting the already-established app shell.
- Command-step pass kept behavior intact while replacing the heavy panel styling with smaller paper slips, tactile framing, and live KPI cards.
- Step 1 lint passes. The configured Supabase API reports `ems_cases` and the three `v_ems_*` views missing from its schema cache, so Insights shows an explicit unavailable state rather than fabricated sample metrics.
- Step 2 lint and HTTP smoke pass. Pulse defaults off; the POST start response surfaces the missing `v_ems_by_hour` object and leaves the generator stopped.
- Step 3 lint passes. Shared motion, keyboard/focus semantics, opt-in stamp audio, lazy loading, and font/layout safeguards are implemented.
- Step 4: 48 route/theme/viewport screenshots and 4 safe browser interaction tests pass. The QA checklist is in `docs/QA.md`; database-mutating checks are reserved for a disposable project.
- Production Lighthouse last measured 96 accessibility and 44 performance (target 85). The app was code-split, Leaflet and fonts were adjusted, and Express compression/cache headers added, but the performance threshold remains unmet.
- The configured Supabase project does not expose `ems_cases` or the `v_ems_*` views in its PostgREST schema cache. Insights and Pulse display explicit errors and do not fabricate data; sample-driven behavior cannot be verified until the objects are exposed.
- The hidden /#/kit route remains available for design-system inspection, but it is not surfaced in the main navigation list.
- Server refactor Step 1: all 16 original endpoint paths are registered in route modules; successful GET response keys were smoke-tested, invalid POST returned the structured validation envelope, lint passed, and the 52-case UI suite passed.
- Step 2: live app_config maps to SLA 14.5, ALS penalty policy, penalty 6, unserved 60, no response cap, and service 8. A fresh-server non-persisting solve passed its HiGHS/Hungarian cross-check.
- Step 3: routes were decoupled from ALS/SLA decision logic; `buildCostMatrix()` now owns penalty policy, response caps, queue penalties, queue reasons, and `slaBreach`/`alsMismatch` flags. HiGHS, Hungarian, FCFS, and priority-greedy all consume the same cost model, and matching panels surface assignment breaches and ALS mismatch markers.

## Current Request — 2026-10-18

- Fixed the development CSP so Vite/React can boot and HMR can connect, removed the CSP-blocked inline font handler, and kept production script policy strict.
- Insights now falls back explicitly to the provided workbook's normalized, anonymized 50-row sample when Supabase EMS sample rows are unavailable. Workbook vs. database source is labelled; database query controls are hidden for workbook data.
- Leaflet maps now invalidate size after layout changes and dispose cleanly when their views unmount. Realtime initialization no longer rebuilds an already-subscribed channel.
- `/api/state` no longer treats failed core queries as empty data; optional event-log errors are exposed without preventing command-state loading.
- Command KPI counts remain placeholders until the first operational-state response has been validated, rather than flashing zero values while loading.
- Validation: `npm run lint`, `npm test` (15 tests), and `npm run build` passed. Production browser smoke verified strict script CSP, the Command map, workbook-backed Insights, and navigation back to Command without failed requests or runtime errors; push remains.
