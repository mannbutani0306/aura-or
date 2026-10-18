# Report And Slide Evidence Map

The guide/PPT source files were not included in this workspace, so their original section and slide titles cannot be verified here. The rows below preserve the requested numbering and map each number to the AURA screen, implementation file, and existing screenshot that can supply evidence. Replace the numeric placeholders with the guide's exact headings when that source is available; no headings are inferred as fact.

## Report Sections

| Guide section | AURA evidence screen | Implementation source | Screenshot |
| --- | --- | --- | --- |
| 01 | Command overview | `src/features/command/CommandView.tsx`, `src/App.tsx` | `docs/screenshots/command-paper-1440x900.png` |
| 02 | Command live fleet and calls | `src/features/command/CommandView.tsx` | `docs/screenshots/command-paper-390x844.png` |
| 03 | Fleet and emergency records | `src/features/fleet/FleetView.tsx` | `docs/screenshots/fleet-paper-1440x900.png` |
| 04 | Fleet status/capability | `src/features/fleet/EmergencyTableView.tsx` | `docs/screenshots/fleet-paper-390x844.png` |
| 05 | Dispatch objective modes | `src/features/dispatch/DispatchView.tsx`, `engine/assignment.ts` | `docs/screenshots/dispatch-paper-1440x900.png` |
| 06 | Allocation constraints and queue | `engine/assignment.ts`, `src/features/dispatch/DispatchView.tsx` | `docs/screenshots/dispatch-paper-1024x768.png` |
| 07 | Baseline comparison | `engine/assignment.ts`, `src/features/dispatch/DispatchView.tsx` | `docs/screenshots/dispatch-paper-1440x900.png` |
| 08 | Assignment and response-time result | `src/features/dispatch/DispatchView.tsx` | `docs/screenshots/dispatch-paper-390x844.png` |
| 09 | Road network | `src/features/routes/RoutesView.tsx`, `src/features/routes/RouteMap.tsx` | `docs/screenshots/routes-paper-1440x900.png` |
| 10 | Dijkstra trace | `engine/graph.ts`, `src/features/routes/RoutesView.tsx` | `docs/screenshots/routes-paper-390x844.png` |
| 11 | EMS sample analysis | `src/features/insights/InsightsView.tsx`, `src/features/insights/SampleCharts.tsx` | `docs/screenshots/insights-paper-1440x900.png` |
| 12 | Seeded evaluation | `engine/evaluate.ts`, `server/routes/evaluate.ts`, `src/features/insights/InsightsView.tsx` | `docs/screenshots/insights-paper-390x844.png` |
| 13 | Excel Solver export | `server/routes/export.ts`, `src/features/dispatch/ModelDrawer.tsx`, `tests/excel-export.test.ts` | `docs/screenshots/dispatch-paper-1440x900.png` |
| 14 | Data and provenance | `src/data/`, `src/design-system/ProvenancePopover.tsx`, README provenance table | `docs/screenshots/insights-paper-1440x900.png` |
| 15 | Validation | `tests/`, `.github/workflows/ci.yml`, `docs/QA.md` | `docs/screenshots/dispatch-paper-1440x900.png` |
| 16 | Present mode | `src/features/present/PresentMode.tsx`, `src/App.tsx` | `docs/screenshots/command-paper-390x844.png` |
| 17 | Limitations and next steps | README assumptions/limits, `DEPLOY.md` | `docs/screenshots/command-night-1440x900.png` |

## PPT Slides

| Guide slide | AURA evidence screen | Implementation source | Screenshot |
| --- | --- | --- | --- |
| 01 | Command | `src/features/command/CommandView.tsx` | `docs/screenshots/command-paper-1440x900.png` |
| 02 | Fleet | `src/features/fleet/FleetView.tsx` | `docs/screenshots/fleet-paper-1440x900.png` |
| 03 | Emergency registry | `src/features/fleet/EmergencyTableView.tsx` | `docs/screenshots/fleet-paper-390x844.png` |
| 04 | Weighted/plain objective | `src/features/dispatch/DispatchView.tsx` | `docs/screenshots/dispatch-paper-1440x900.png` |
| 05 | Cost matrix | `engine/graph.ts`, `engine/assignment.ts` | `docs/screenshots/dispatch-paper-1024x768.png` |
| 06 | Assignment result | `src/features/dispatch/DispatchView.tsx` | `docs/screenshots/dispatch-paper-390x844.png` |
| 07 | FCFS/greedy comparison | `engine/assignment.ts` | `docs/screenshots/dispatch-paper-1440x900.png` |
| 08 | ALS/SLA policy | `engine/assignment.ts`, `src/features/dispatch/DispatchView.tsx` | `docs/screenshots/dispatch-night-1440x900.png` |
| 09 | Road graph | `src/features/routes/RouteMap.tsx` | `docs/screenshots/routes-paper-1440x900.png` |
| 10 | Dijkstra trace | `engine/graph.ts`, `src/features/routes/RoutesView.tsx` | `docs/screenshots/routes-paper-390x844.png` |
| 11 | EMS sample analytics | `src/features/insights/SampleCharts.tsx` | `docs/screenshots/insights-paper-1440x900.png` |
| 12 | Monte Carlo evaluation | `engine/evaluate.ts`, `server/routes/evaluate.ts` | `docs/screenshots/insights-paper-390x844.png` |
| 13 | Excel Solver | `server/routes/export.ts`, `tests/excel-export.test.ts` | `docs/screenshots/dispatch-paper-1440x900.png` |
| 14 | Architecture and test evidence | README architecture, `.github/workflows/ci.yml`, `tests/` | `docs/screenshots/command-night-1440x900.png` |
| 15 | Limitations/security | README assumptions/limits, `DEPLOY.md` | `docs/screenshots/command-paper-1440x900.png` |