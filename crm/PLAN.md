# Personal CRM — Portfolio Build Plan

**Goal:** a portfolio (dossier) for every single person Jake has spoken to between
**2026-06-01 and 2026-08-18** (the last 2.5 months), kept current going forward.

**Owner:** Jake Putzel (putzel.jake@gmail.com)
**Status:** Phases 0–2 complete (2026-08-18): census done (110 people, 17
exclusions) and all 110 portfolios drafted in `crm/people/`. **Phase 3 next —
Jake's verification pass** (see Open questions at the bottom too).

---

## What already exists

| Piece | Where | Notes |
|-------|-------|-------|
| NetworkingCRM web app | `src/NetworkingCRM.jsx` | Pipeline board, weekly agenda, review inbox, JSON import/export; contacts live in browser localStorage |
| Portfolio framework | `crm/` | Built in Phase 0 — schema, template, scripts, seed roster |
| Seed roster | `crm/data/roster.seed.json` | **83 unique people** from the initial discovery scan |
| Pilot portfolio | `crm/people/derek-feinman.md` | Demonstrates the format with metadata-verified facts |

### Discovery scan results (2026-08-18)

- **Gmail:** ~201 sent-mail threads since Jun 1 (page 1 of ~5 harvested so far).
  "Sent" is the filter that proves *you actually spoke to them*, not just received mail.
- **Calendar:** 243 events in the window; **54 meetings with attendees**; ~55 unique
  non-self attendee emails (fully harvested).
- Known noise to exclude: `mailer-daemon`, meeting-room resources
  (`amitimeetingroom@amiti.vc`), bots (`boardy@boardy.ai`), bounced addresses
  (`chaim@cardinals.com` variants, `talsayag@netvision.net.il`).

---

## Architecture

```
crm/
├── PLAN.md                     ← this file
├── README.md                   ← how to use the framework day-to-day
├── schema/portfolio.schema.json← the contract every portfolio satisfies
├── templates/portfolio.md      ← blank portfolio
├── people/<slug>.md            ← ONE FILE PER PERSON (the product)
├── data/
│   ├── roster.seed.json        ← discovery census (who still needs a portfolio)
│   ├── people.json             ← generated index of all portfolios
│   └── app-import.json         ← generated; import into the web app UI
└── scripts/
    ├── new-person.mjs          ← scaffold a portfolio (npm run crm:new -- <email>)
    └── build-index.mjs         ← validate + compile     (npm run crm:build)
```

**Design rules**

1. **Markdown is the source of truth.** Portfolios are human-readable files you can
   edit anywhere; JSON is always generated, never hand-edited.
2. **One person, one portfolio.** Aliases merge into a single file's `emails` array
   (e.g. Steve Putzel = `putzel.steve@gmail.com` + `steve.putzel@focuspartners.com`
   + `sputzel@kovitz.com`). The build fails if two portfolios claim the same email.
3. **Facts carry provenance.** Timeline rows cite their source (gmail / calendar /
   manual). Machine-drafted files stay `status: draft` until Jake reviews them to
   `verified`.
4. **The web app is a view, not the store.** `crm:build` emits `app-import.json`
   in the app's contact shape; importing it in the UI replaces browser-stored
   contacts with the portfolio-derived set.

---

## Phase 1 — Complete the census (≈1 session)

Finish the head-count so nobody is missed.

1. Paginate **all** `in:sent after:2026/06/01` Gmail threads (~201; 4 more pages).
2. Extract every correspondent (to/cc/bcc plus inbound senders Jake replied to).
3. Merge with calendar attendees already harvested; union into one roster.
4. **Identity resolution:** cluster addresses into people using display names,
   shared threads, and domains (the bwater.com trio are three people; the
   craftflow.com four are four; the two Steve Putzel addresses are one).
5. Classify each: `professional / personal / family / service`, and mark
   exclusions (`bot`, `bounced address`, `meeting room`, `mailing list`).
6. Ask Jake only what can't be inferred (WhatsApp/LinkedIn/phone-only people —
   see Open questions).

**Output:** `crm/data/roster.json` (supersedes the seed) — every person named,
categorized, with first/last-seen dates and evidence.
**Done when:** every sent thread and attendee in the window maps to exactly one
roster entry or a recorded exclusion.

## Phase 2 — Write the portfolios (≈2–3 sessions, batched)

For each roster entry, read the actual thread contents and calendar events, then
draft `crm/people/<slug>.md`:

- **Summary** — who they are, why they matter, where things stand.
- **Interaction timeline** — every touchpoint in the window, dated and sourced.
- **What they care about** — topics from the threads.
- **Asks & commitments** — open loops in both directions (the highest-value section).
- Frontmatter: company/role inferred from signatures and domains; stage mapped to
  the app pipeline; `interaction_count` computed.

Batch order (highest value first):
1. People with **meetings** in the window (~40 after exclusions) — the real conversations.
2. Email-only professional threads (~30).
3. Personal / family / service (~15) — lighter portfolios are fine here.

**Done when:** roster shows `portfolio_drafted` for 100% of non-excluded people
and `npm run crm:build` passes.

## Phase 3 — Verify & enrich (Jake in the loop, ≈1 hour of his time)

1. Jake skims each draft — corrects names/companies, fills `how_met`/`intro_by`
   where the threads didn't say, flips `status` to `verified`.
2. Enrich the top ~20 relationships: role/LinkedIn, warmth, an explicit
   `next_step` and `follow_up_date` for anyone worth pursuing.
3. Rebuild and import `app-import.json` into the web app so the pipeline board
   reflects the full network.

**Done when:** zero `draft` portfolios; every `professional` portfolio in an
active stage has a follow-up date.

## Phase 4 — Keep it alive (recurring)

- **Weekly sync (automatable):** scan Gmail/Calendar for the past 7 days; append
  new touchpoints to timelines, bump `last_contact`, surface brand-new people as
  roster additions; commit as `crm: weekly sync YYYY-MM-DD`. This can run as a
  scheduled Claude session once the shape is proven manually.
- **Hygiene rules:** professional contact untouched 30 days → flag; 60 days →
  stage `dormant`. Open "Asks & commitments" older than 14 days → surface in the
  weekly summary.
- **App round-trip:** stage/date edits made in the web app get exported
  (JSON export) and folded back into frontmatter during the weekly sync.

## Phase 5 — Optional upgrades (only if wanted)

- A **Portfolios view** in the React app that renders `people.json` (read-only
  dossier browser next to the pipeline board).
- Per-company rollups (`crm/companies/`) grouping portfolios (Ramp ×4, Craftflow ×4,
  Bridgewater ×3, Oracle ×3, Aaru ×3...).
- Relationship graph: who introduced whom, from `intro_by`.

---

## Risks & guardrails

- **Privacy:** portfolios will contain personal correspondence details in a git
  repo. Keep the GitHub repo **private**; nothing from `crm/people/` gets pasted
  into public artifacts.
- **Coverage gaps:** WhatsApp, LinkedIn DMs, texts, and unlogged calls are
  invisible to Gmail/Calendar. They enter via Jake's answers (Phase 1.6) or
  manual `crm:new` — the census is "everyone visible + everyone Jake names".
- **Misattribution:** identity resolution stays conservative — when clustering is
  uncertain, keep two entries and flag for Jake rather than silently merging.

## Open questions for Jake

1. Any regular contacts who live **only** on WhatsApp/LinkedIn/phone that should
   get portfolios? (List names; files can be created without email evidence.)
2. Should family (Steve, Natalie, Pace, Max...) get full portfolios or minimal ones?
3. Comfortable with a weekly automated sync session, or prefer to trigger it manually?
