# Progress

## Checklist

- [x] STEP 1 — Add typed EMS/config repositories, sample-based Insights charts/filters/findings, SQL copy controls, and read `app_config.sla_min` in Command and Dispatch.
- [x] STEP 2 — Add the Pulse server lifecycle/API and header control; label generated calls and explain provenance.
- [ ] STEP 3 — Complete reduced-motion-aware motion, responsive behavior, accessibility, and performance requirements.
- [ ] STEP 4 — Add Playwright screenshots and QA checklist, review screenshots/copy, run verification, and push.

## Notes

- Verified the existing project already contains most of the Dispatch Slip primitives and design-system scaffolding.
- The priority gap cleanup focused on the actual leaked user-facing copy and legacy token cleanup rather than rewriting the already-established app shell.
- Command-step pass kept behavior intact while replacing the heavy panel styling with smaller paper slips, tactile framing, and live KPI cards.
- Step 1 lint passes. The configured Supabase API reports `ems_cases` and the three `v_ems_*` views missing from its schema cache, so Insights shows an explicit unavailable state rather than fabricated sample metrics.
- Step 2 lint and HTTP smoke pass. Pulse defaults off; the POST start response surfaces the missing `v_ems_by_hour` object and leaves the generator stopped.
- The hidden /#/kit route remains available for design-system inspection, but it is not surfaced in the main navigation list.
