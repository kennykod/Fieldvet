# CLAUDE.md

FieldVet demo prototype. Read `docs/MASTERPROMPT.md` first; it defines the scope, rules and way of working.

- Build: `npm run build` → `dist/fieldvet.html` (Claude artifact body) and `dist/fieldvet.local.html` (full page, open locally).
- Tests: `npm test` (domain tests via tsx + Playwright e2e scripts in `tests/*.e2e.mjs`). `npm run typecheck`.
- Domain logic lives in `src/shared/` and must stay free of React and browser APIs.
- All UI copy is Swedish. Code, comments and commits in English.
- No backend, database, login or network calls at runtime. Fictional data only.
