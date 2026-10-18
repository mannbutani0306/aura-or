# VIVA Questions

1. **What does AURA do?** It assigns available ambulances to pending calls using current graph travel estimates, shows routes and baselines, and tracks dispatches.
2. **What is the application architecture?** React 19/Vite calls an Express API; the API uses the pure TypeScript engine and Supabase Postgres when configured.
3. **Why keep the engine separate?** `engine/` can be tested without UI or I/O and remains the single source for routing and assignment decisions.
4. **How is travel time calculated?** Dijkstra shortest-path minutes plus the average `localMin` for distinct origin/destination zones; same-zone uses that zone's `localMin`.
5. **What happens when a route is unreachable?** The pair is infeasible and cannot be assigned; the call can be queued at its configured penalty.
6. **What is the objective?** Minimize priority-weighted feasible assignment costs plus priority-weighted queue penalties.
7. **What are the decision variables?** Binary $x_{ij}$ indicates a unit-call assignment; binary $u_j$ indicates a queued call.
8. **What constraints are enforced?** Each pending call is assigned or queued exactly once; each unit serves at most one call per solve.
9. **What is the difference between Weighted and Plain?** Weighted uses triage weights 5/3/2/1; Plain sets every call's weight to 1.
10. **How does ALS policy affect the model?** Hard blocks an incompatible pair, penalty adds configured minutes to its feasible cost, and off ignores the mismatch.
11. **How does a response cap work?** A pair above `max_response_min` is infeasible before optimization.
12. **Why use HiGHS and Hungarian?** HiGHS solves the binary optimization model; Hungarian independently solves an equivalent padded assignment problem to cross-check the objective.
13. **What tolerance is used for that check?** The engine considers objectives equal when their absolute difference is at most $10^{-6}$.
14. **What do FCFS and greedy represent?** They are deterministic comparison baselines: nearest feasible unit in arrival order, and priority/arrival ordered greedy assignment.
15. **What metrics are shown?** Served/queued, weighted total, average and critical average response, worst response, SLA hits/breaches, and unit utilization.
16. **Where does runtime data come from?** Current operational rows and config come from Supabase; without Supabase config the server/client use labelled starter SIM state.
17. **What is SAMPLE data?** The provided CSV/workbook and the configured 50-row `ems_cases` cohort. Insights labels whether it read the workbook or database; neither is presented as live operational data.
18. **What is SIM data?** Seeded Monte Carlo scenarios and the local simulation state; generated figures are labelled SIM.
19. **How is Monte Carlo reproducible?** A seeded Mulberry32 generator controls scenario construction; scenario timestamps are deterministic from seed and index.
20. **Why use server-sent events for evaluation?** The API can stream scenario progress while returning a single summary at completion.
21. **How are calls and units persisted?** The data-source client calls Express/Supabase; generated database columns such as emergency weight are not inserted by the UI.
22. **How is dispatch lifecycle protected?** The database RPCs/triggers enforce transitions; UI actions call those APIs and surface errors.
23. **How does the Solver workbook help?** It exports current input data, Dijkstra paths, feasible costs, binary changing cells, constraints, and AURA's expected solution for comparison.
24. **What are the main limitations?** Static edge minutes, simple local/service-time assumptions, one call per unit per solve, and a demo RLS policy that is too permissive for production.
25. **What is the next security step?** Add Supabase Auth and role-based policies, then restrict operational writes to authorized roles and server-side paths.