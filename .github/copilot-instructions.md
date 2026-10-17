# AURA — project instructions for GitHub Copilot

AURA is an ambulance dispatch console for Madurai: it assigns available ambulances to pending emergencies with mathematical optimisation, routes them with Dijkstra, and tracks each dispatch to completion. It is judged by faculty and interviewers, so it must look like a shipped product and every number must be honest.

## Architecture
React 19 + Vite + TypeScript + Tailwind v4 (src/) → Express (server.ts, /api) → Supabase Postgres.
Pure engine in /engine (no I/O, no UI imports): graph.ts (Dijkstra, Yen), assignment.ts (HiGHS MILP via `highs`, Hungarian cross-check, FCFS and priority-greedy baselines), types.ts.
Data layer: src/data (DataSource interface, supabaseDataSource, realtime). Design system: src/design-system + src/index.css ("Dispatch Slip").
Commands: `npm run dev` (tsx server.ts, port 3000), `npm run lint` (tsc --noEmit), `npm run build`, `npm test` (Vitest, added later).

## Database contract (already created in Supabase — never change without a numbered SQL file)
Tables: zones, road_edges, app_config(sla_min, als_policy, als_penalty_min, unserved_min, max_response_min, service_min), ambulances, emergencies, dispatches, optimization_runs, event_log, eval_runs, eval_scenarios, ems_cases (real sample, n=50).
emergencies.weight and requires_als are GENERATED columns: never insert them. Priority weights: Critical 5, High 3, Medium 2, Low 1.
Views: v_fleet_summary, v_dispatch_board, v_ems_by_hour, v_ems_by_type, v_ems_sla_by_triage.
RPCs: dispatch_batch(p_items jsonb, p_run uuid), advance_dispatch(p_id uuid, p_status text), load_scenario(p jsonb), reset_demo().
Lifecycle is enforced by DB triggers (Available→Busy on dispatch; completion frees the unit and relocates it to the scene zone; illegal transitions raise). Surface DB error messages verbatim in toasts.
Zone area_type values are 'Urban' | 'Rural' | 'Tribal'.

## Model (single source of truth)
Travel matrix is ONLY built from the road graph: t(i,j) = shortestPath(zone_i→zone_j) + (localMin_i + localMin_j)/2, same zone = localMin; unreachable = Infinity (infeasible). Never use a hand-typed matrix except as a labelled test fixture.
Objective: min Σ w_j·cost_ij·x_ij + Σ w_j·Q·u_j; s.t. Σ_i x_ij + u_j = 1; Σ_j x_ij ≤ 1; binary. HiGHS and the Hungarian cross-check must agree (1e-6) on every solve.

## Honesty rules (non-negotiable)
Never hard-code or fabricate result numbers. No silent fallbacks: failures show explicit error/offline states. Every simulated value is labelled SIM; sample-data panels show SAMPLE and n. No `any`, no swallowed errors, no TODO left behind.

## UI rules ("Dispatch Slip")
Warm paper, 2px ink outlines, hard offset shadows (no blur), round radii (28/20/14/pill), sticker blobs with emoji, rubber stamps, hang tags, surgical tape, ECG-grid paper, chevron rules. Fonts: Fraunces (display, one italic accent word per headline), Hanken Grotesk (UI), Geist Mono (all numbers/IDs/times, tabular-nums). Two themes: Paper and Night ward; both first-class. Triage colours carry meaning: Critical #E5322D, High #F08A00, Medium #E8C21A, Low #3FA66B (also letter glyphs C/H/M/L). Unit colours: available #0F8B8D, busy #6B7785.
Copy: only the wordmark "aura" is brand text. No taglines, no "operations research", "mini project", "subject", "academic", "telemetry", "RPC", "SQL", "demo", "kit" in user-visible text. Section titles are short; buttons are verbs; icons have tooltips. No lorem. Every screen has designed loading, empty and error states. Respect prefers-reduced-motion; AA contrast; keyboard operable; responsive to 390px.
Anti-AI-look: no purple/blue gradients, gradient text, glassmorphism, uniform rounded-2xl card grids, Inter/Roboto, stat cards with up-arrows.

## Working rules for Copilot
1. Read before writing: open only the files you need; prefer small, typed, focused modules over editing 1000-line files wholesale (split them).
2. Work in the numbered steps of the prompt. After each step: run `npm run lint` (and tests when they exist), fix errors, commit with a conventional message (`feat(ui): …`), then update PROGRESS.md (what is done, what is next, any decision).
3. If context runs short: finish the current step, update PROGRESS.md, and stop. Do not leave half-edited files.
4. Never print, log or commit secrets. `.env` stays git-ignored; only `.env.example` lists names.
5. Do not change the database contract or engine maths unless the prompt says so.