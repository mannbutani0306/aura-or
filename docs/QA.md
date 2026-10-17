# QA

## Automated

Run `npm run lint`, `npm run build`, and `npm run screenshots`. The screenshot run uses Playwright-managed Chromium, opens every route in Paper and Night at 1440×900, 1024×768, 768×1024, and 390×844, saves PNGs under `docs/screenshots/`, and checks horizontal document overflow, unnamed icon-only buttons, uncaught page errors, keyboard palette navigation, theme persistence, provenance access, default-off Pulse, and two-tab read-only connection state.

## Regression Click-Through

- [ ] Open two tabs and confirm emergency, ambulance, dispatch, and road changes appear in both.
- [ ] Add an ambulance and a call; confirm the call form and fleet drawer close cleanly.
- [ ] Solve in Weighted and Plain modes; compare baselines and make a manual reassignment.
- [ ] Dispatch a batch, then advance a unit through OnScene and Completed.
- [ ] Cancel an active dispatch and verify the unit and call return to their prior state.
- [ ] Close and reopen a road corridor; confirm the route matrix updates.
- [ ] Reset the scenario and confirm the reset receipt appears.
- [ ] Blank the Supabase URL and verify the explicit offline screen and retry action.
- [x] Change theme, reload, and confirm the selected theme persists.
- [x] Open the command palette, run a navigation action, and verify keyboard shortcuts.
- [x] Open the provenance popover with `?` and with its header control.
- [ ] Enable Pulse only against a disposable database; confirm generated calls carry the SIM stamp and stop cleanly.

Database-mutating checks are intentionally listed for a disposable test database. The configured Supabase project is live and these actions would create or alter operational rows.