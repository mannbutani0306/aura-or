# Progress

## Checklist

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
