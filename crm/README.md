# Personal CRM — Portfolio Framework

One markdown dossier per person Jake has spoken to. Human-readable, git-versioned,
and compiled into JSON the NetworkingCRM web app (`src/NetworkingCRM.jsx`) can import.

**Read `PLAN.md` for the full build plan and current phase.**

## Layout

- `people/<slug>.md` — the portfolios (source of truth)
- `templates/portfolio.md` — blank portfolio
- `schema/portfolio.schema.json` — frontmatter contract
- `data/roster.seed.json` — census of everyone found in the discovery scan
- `data/people.json`, `data/app-import.json` — **generated**; don't hand-edit

## Commands

```bash
# Scaffold a portfolio (dates pre-filled if the email is in the roster)
npm run crm:new -- zeke@202ventures.vc Zeke Medows

# Validate all portfolios and regenerate data/people.json + data/app-import.json
npm run crm:build
```

To see portfolios in the web app: run `crm:build`, open the app, header → Import
from JSON → pick `crm/data/app-import.json`. **Import replaces** the contacts
stored in that browser, so export a backup first if you've made in-app edits.

## Conventions

- One person, one file; all their email aliases go in the `emails` array.
- Timeline rows always cite a source (`gmail` / `calendar` / `manual` / ...).
- Machine-drafted portfolios are `status: draft`; flip to `verified` after review.
- Slug = kebab-case full name (`derek-feinman.md`); it never changes once created.
