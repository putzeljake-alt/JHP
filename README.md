# TLV → NYC business-class flight search

Finds one-way **business class** flights from **Tel Aviv (TLV)** to **New York
City (JFK / EWR / LGA)** departing **Sun 2026-07-19**, total price **under
$3,000 USD** — plus date-flex (07-18 / 07-20) and a **self-connect** strategy
that pairs a cheap **economy** positioning leg into a European hub with a
lie-flat **business** transatlantic leg (JetBlue Mint, La Compagnie, TAP,
Aer Lingus, Air France).

Data source: [`fast-flights`](https://pypi.org/project/fast-flights/) — an
unofficial Google Flights scraper (no API key).

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python flight_search.py search    # run all 25 queries, cache raw JSON
python flight_search.py analyze   # build report.md from the cache (no re-query)
python flight_search.py all       # search then analyze
```

- **`raw_responses.json`** — raw Google Flights responses, one record per query.
  Re-run `search` to refresh; `analyze` reads only this file, so re-analysis is
  free and offline.
- **`report.md`** — the generated markdown report (sorted table, over-budget
  reference table, coverage/no-data section, top-2 recommendations).

## What it does

1. **Direct tickets** — TLV→JFK and TLV→EWR, business, one-way, for 07-18/19/20.
2. **Self-connect** — transatlantic business legs (MAD→JFK, ORY→EWR, CDG→JFK,
   LIS→EWR/JFK, AMS→JFK, DUB→JFK on 07-19) paired with TLV→hub economy
   positioning legs (07-18 overnight or 07-19 morning). Pairings need
   ≥ 5 h connection; anything under 8 h is flagged **RISKY**.
3. **Filtering & flags** — drops anything over $3,000 (keeps the 3 cheapest
   over-budget *direct* tickets for reference); prefers **JFK** over EWR
   (LIRR from Jamaica to the Hamptons); flags any short-haul **narrowbody**
   leg sold as "business" (blocked middle seat, **not** lie-flat) while
   correctly leaving genuine lie-flat narrowbodies like the A321LR Mint alone.

## Honesty guarantees

- **No fabricated prices.** A query that returns no data, a network/policy
  error, or a non-concrete price is recorded and reported as such — never
  estimated. Only concrete "$N" totals from Google are used.
- Every raw response is cached so results are reproducible.

## ⚠️ Note on this environment

When generated here, **all 25 live queries failed**: the managed execution
environment's egress policy returns `403` to `CONNECT www.google.com:443`
(and to Amadeus, Kayak, Skyscanner — every flight data host). Routing around
an org policy denial is not permitted, so no live fares could be retrieved and
the committed `report.md` honestly shows **no data**.

To get real results, run this script from a machine/environment with normal
outbound internet access (or add the relevant hosts to the environment's
network policy), then re-run `python flight_search.py all`.
