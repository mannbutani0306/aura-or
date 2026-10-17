# Progress

## Checklist

- [x] C1 — Audit the current design system and validate the baseline with `npm run lint` and `npm run build`.
- [x] C2 — Close the obvious design-system gaps: remove legacy style tokens and replace visible leaked labels such as "Demo mode" with product-safe wording.
- [ ] C3 — Shell refactor: AppHeader, LiveTicker, MobileBar, plus the sticky paper header / ticker polish.
- [ ] C4 — Lobby view: hero card, triage tags, just-dispatched row, fleet strip, empty/loading/offline states.
- [ ] C5 — Final route polish, hidden design-kit route, keyboard and command-palette cleanup, and all user-facing copy checks.
- [ ] C6 — Final verification, commit message, and GitHub push.

## Notes

- Verified the existing project already contains most of the Dispatch Slip primitives and design-system scaffolding.
- The priority gap cleanup focused on the actual leaked user-facing copy and legacy token cleanup rather than rewriting the already-established app shell.
- The hidden /#/kit route remains available for design-system inspection, but it is not surfaced in the main navigation list.
