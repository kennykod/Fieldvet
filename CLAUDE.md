# CLAUDE.md

FieldVet demo prototype. Read `docs/MASTERPROMPT.md` first; it defines the scope, rules and way of working.

- Build: `npm run build` → `dist/fieldvet.html` (Claude artifact body) and `dist/fieldvet.local.html` (full page, open locally).
- Tests: `npm test` (domain tests via tsx + Playwright e2e scripts in `tests/*.e2e.mjs`). `npm run typecheck`.
- First time on a machine: `npm install`, then `npx playwright install chromium` (add `webkit firefox` for cross-browser runs).
- Other browsers: set `BROWSER=webkit` or `BROWSER=firefox` before running an e2e script (default chromium). Known findings: `docs/REVIEW.md`.
- Pitch script: `docs/DEMO-MANUS.md`. Keep its button labels in sync with the UI.
- Domain logic lives in `src/shared/` and must stay free of React and browser APIs.
- All UI copy is Swedish. Code, comments and commits in English.
- No backend, database, login or network calls at runtime. Fictional data only.
