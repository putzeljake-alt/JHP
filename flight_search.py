#!/usr/bin/env python3
"""
TLV -> NYC business-class flight search & self-connect analyzer.

Goal: one-way business class, Tel Aviv (TLV) -> New York City (JFK / EWR / LGA),
departing Sun 2026-07-19, total price under $3,000 USD. Includes date-flex
comparison (07-18 / 07-20) and a self-connect strategy pairing an ECONOMY
positioning leg into Europe with a lie-flat transatlantic BUSINESS leg.

Data source: `fast-flights` (unofficial Google Flights scraper, no API key).

Usage:
    python flight_search.py search     # run every query, cache raw JSON
    python flight_search.py analyze    # build the report from the cache
    python flight_search.py all        # search then analyze

Design notes / honesty guarantees:
  * Every raw response is cached to raw_responses.json so `analyze` never needs
    to re-query. Re-run `search` to refresh prices.
  * Nothing is fabricated. If a query returns no data (FlightsNotFound), a
    network/policy error, or an unparseable price, it is recorded as such and
    the option is reported as "no data" rather than estimated.
  * Prices are only trusted when Google returns a concrete "$N" total; the
    fuzzy "low/typical/high" labels fast-flights sometimes emits are dropped.
"""
from __future__ import annotations

import dataclasses
import json
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent
CACHE_FILE = HERE / "raw_responses.json"

# ---------------------------------------------------------------------------
# Search plan
# ---------------------------------------------------------------------------
DATE_TARGET = "2026-07-19"
DATES_FLEX = ["2026-07-18", "2026-07-19", "2026-07-20"]

NYC_AIRPORTS = {"JFK", "EWR", "LGA"}

# 1 + 2. Direct-ticket searches: TLV -> {JFK,EWR} for the flex dates, business.
DIRECT_ROUTES = [("TLV", "JFK"), ("TLV", "EWR")]

# 3. Self-connect transatlantic BUSINESS legs (all 2026-07-19), with the
#    lie-flat product we're actually hunting for on each.
TRANSATLANTIC_LEGS = [
    ("MAD", "JFK", "JetBlue Mint"),
    ("ORY", "EWR", "La Compagnie (all-business 757)"),
    ("CDG", "JFK", "Air France / La Compagnie"),
    ("LIS", "EWR", "TAP"),
    ("LIS", "JFK", "TAP"),
    ("AMS", "JFK", "JetBlue Mint / Delta-KLM"),
    ("DUB", "JFK", "Aer Lingus"),
]

# Positioning legs TLV -> European hub, ECONOMY, for the overnight-before and
# early-morning-of options.
POSITIONING_HUBS = ["MAD", "ORY", "CDG", "LIS", "AMS", "DUB"]
POSITIONING_DATES = ["2026-07-18", "2026-07-19"]

# Connection-time rules for self-connect pairings.
MIN_CONNECT_HOURS = 5.0
RISKY_CONNECT_HOURS = 8.0

PRICE_CAP_USD = 3000.0

# Aircraft that are narrowbody short-haul: "business" on these intra-Europe is a
# blocked middle seat, NOT a lie-flat seat. Matched as substrings of plane_type.
NARROWBODY_HINTS = [
    "A319", "A320", "A321", "A318",
    "737", "738", "739", "73",
    "Embraer", "E19", "E17", "E29", "E75", "ERJ",
    "CRJ", "Bombardier", "Dash", "ATR",
]
# Widebody markers that override the narrowbody guess (real lie-flat metal).
WIDEBODY_HINTS = ["757", "767", "777", "787", "A330", "A340", "A350", "A380", "747", "Dreamliner"]

EUROPE_AIRPORTS = set(POSITIONING_HUBS) | {"MAD", "ORY", "CDG", "LIS", "AMS", "DUB", "LHR", "FRA", "MUC"}


# ---------------------------------------------------------------------------
# Search (querying + caching)
# ---------------------------------------------------------------------------
def _serialize(result: Any) -> dict:
    """Turn a fast-flights ResultList into a plain JSON-able dict."""
    flights = []
    for f in result:
        flights.append(dataclasses.asdict(f))
    return {"status": "ok", "n": len(flights), "flights": flights}


def _run_one(from_airport: str, to_airport: str, date: str, seat: str) -> dict:
    """Run a single get_flights query, returning a cache record (never raises)."""
    from fast_flights import FlightQuery, Passengers, create_filter, get_flights
    from fast_flights.exceptions import FlightsNotFound

    filt = create_filter(
        flights=[FlightQuery(date=date, from_airport=from_airport, to_airport=to_airport)],
        seat=seat,
        trip="one-way",
        passengers=Passengers(adults=1),
        currency="USD",
        max_stops=None,
    )
    try:
        res = get_flights(filt)
        rec = _serialize(res)
    except FlightsNotFound:
        rec = {"status": "no_flights", "n": 0, "flights": []}
    except Exception as exc:  # network / policy / parse failure -> record, don't estimate
        rec = {"status": "error", "error": f"{type(exc).__name__}: {exc}", "n": 0, "flights": []}
    rec.update(from_airport=from_airport, to_airport=to_airport, date=date, seat=seat)
    return rec


def build_query_plan() -> list[dict]:
    plan = []
    for frm, to in DIRECT_ROUTES:
        for date in DATES_FLEX:
            plan.append(dict(kind="direct", frm=frm, to=to, date=date, seat="business"))
    for frm, to, _target in TRANSATLANTIC_LEGS:
        plan.append(dict(kind="transatlantic", frm=frm, to=to, date=DATE_TARGET, seat="business"))
    for hub in POSITIONING_HUBS:
        for date in POSITIONING_DATES:
            plan.append(dict(kind="positioning", frm="TLV", to=hub, date=date, seat="economy"))
    return plan


def cache_key(q: dict) -> str:
    return f"{q['kind']}|{q['frm']}-{q['to']}|{q['date']}|{q['seat']}"


def cmd_search() -> None:
    plan = build_query_plan()
    cache: dict[str, Any] = {"_meta": {"generated": datetime.utcnow().isoformat() + "Z",
                                       "note": "raw fast-flights responses; prices as returned by Google Flights"}}
    if CACHE_FILE.exists():
        try:
            cache = json.loads(CACHE_FILE.read_text())
        except Exception:
            pass
    print(f"Running {len(plan)} queries via fast-flights (Google Flights)...\n")
    for i, q in enumerate(plan, 1):
        key = cache_key(q)
        print(f"[{i:>2}/{len(plan)}] {key} ... ", end="", flush=True)
        rec = _run_one(q["frm"], q["to"], q["date"], q["seat"])
        rec["kind"] = q["kind"]
        cache[key] = rec
        status = rec["status"]
        print(f"{status} ({rec['n']} results)" + (f" :: {rec.get('error','')}" if status == "error" else ""))
        CACHE_FILE.write_text(json.dumps(cache, indent=2, ensure_ascii=False))
        time.sleep(1.0)  # be polite to Google
    print(f"\nCached -> {CACHE_FILE}")


# ---------------------------------------------------------------------------
# Analysis helpers
# ---------------------------------------------------------------------------
def parse_price(price: Any) -> Optional[float]:
    """Return a USD float only for a concrete '$N' price; None for labels/blanks."""
    if price is None:
        return None
    if isinstance(price, (int, float)):
        return float(price)
    s = str(price)
    m = re.search(r"\$?\s*([\d,]+(?:\.\d+)?)", s)
    if not m:
        return None
    if s.strip().lower() in {"low", "typical", "high", ""}:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


_TIME_RE = re.compile(r"(\d{1,2}):(\d{2})\s*([AP]M)?", re.I)
_DAYOFFSET_RE = re.compile(r"\+(\d+)")


def parse_clock(dt: Any) -> Optional[str]:
    """Extract 'HH:MM' 24h from a fast-flights SimpleDatetime dict or string."""
    if dt is None:
        return None
    text = dt.get("time") if isinstance(dt, dict) else str(dt)
    if not text:
        return None
    m = _TIME_RE.search(text)
    if not m:
        return None
    h, mn, ampm = int(m.group(1)), int(m.group(2)), (m.group(3) or "").upper()
    if ampm == "PM" and h != 12:
        h += 12
    if ampm == "AM" and h == 12:
        h = 0
    return f"{h:02d}:{mn:02d}"


def parse_datetime(dt: Any, base_date: str) -> Optional[datetime]:
    """Best-effort absolute datetime, honoring a '+1' next-day marker if present."""
    clock = parse_clock(dt)
    if clock is None:
        return None
    day_offset = 0
    text = dt.get("time", "") if isinstance(dt, dict) else str(dt)
    dm = _DAYOFFSET_RE.search(text or "")
    if dm:
        day_offset = int(dm.group(1))
    try:
        base = datetime.strptime(base_date, "%Y-%m-%d")
    except ValueError:
        return None
    h, mn = map(int, clock.split(":"))
    return base.replace(hour=h, minute=mn) + timedelta(days=day_offset)


def parse_duration_minutes(text: Any) -> Optional[int]:
    if not text:
        return None
    s = str(text)
    hrs = re.search(r"(\d+)\s*hr", s)
    mins = re.search(r"(\d+)\s*min", s)
    if not hrs and not mins:
        m = re.match(r"\s*(\d+):(\d+)", s)
        if m:
            return int(m.group(1)) * 60 + int(m.group(2))
        return None
    return (int(hrs.group(1)) * 60 if hrs else 0) + (int(mins.group(1)) if mins else 0)


def fmt_minutes(mins: Optional[int]) -> str:
    if mins is None:
        return "?"
    return f"{mins // 60}h{mins % 60:02d}m"


def is_narrowbody(plane_type: Any) -> Optional[bool]:
    if not plane_type:
        return None
    s = str(plane_type)
    if any(w.lower() in s.lower() for w in WIDEBODY_HINTS):
        return False
    if any(w.lower() in s.lower() for w in NARROWBODY_HINTS):
        return True
    return None


def is_fake_business_leg(single: dict) -> bool:
    """True for a short-haul narrowbody leg sold as 'business' that is really a
    recliner with a blocked middle seat, NOT lie-flat — i.e. the intra-Europe /
    TLV->hub feeder hops. The transatlantic ocean crossing (which in this plan
    always terminates at a NYC airport) is deliberately NOT flagged, so a genuine
    lie-flat narrowbody like the A321LR Mint / La Compagnie / TAP / Aer Lingus is
    correctly left alone."""
    to = (single.get("to_airport") or {}).get("code")
    if to in NYC_AIRPORTS:
        return False  # this is the transatlantic crossing -> real lie-flat metal
    if is_narrowbody(single.get("plane_type")) is not True:
        return False
    dur = parse_duration_minutes(single.get("duration"))
    return dur is None or dur < 300  # < 5h = short-haul feeder, blocked middle seat


def leg_summary(single: dict) -> dict:
    return {
        "from": (single.get("from_airport") or {}).get("code"),
        "to": (single.get("to_airport") or {}).get("code"),
        "plane": single.get("plane_type"),
        "dep": parse_clock(single.get("departure")),
        "arr": parse_clock(single.get("arrival")),
        "duration": single.get("duration"),
    }


def flatten_flights(rec: dict) -> list[dict]:
    """Normalize each Flights option in a cache record into an analysis row."""
    rows = []
    for f in rec.get("flights", []):
        legs = f.get("flights", []) or []
        airlines = f.get("airlines") or []
        airline_names = ", ".join(
            a.get("name", "") if isinstance(a, dict) else str(a) for a in airlines
        ) or "?"
        first, last = (legs[0] if legs else None), (legs[-1] if legs else None)
        stops = max(len(legs) - 1, 0)
        fake_biz = any(is_fake_business_leg(l) for l in legs)
        rows.append({
            "price": parse_price(f.get("price")),
            "price_raw": f.get("price"),
            "airlines": airline_names,
            "n_legs": len(legs),
            "stops": stops,
            "dep_time": parse_clock(first.get("departure")) if first else None,
            "dep_dt": parse_datetime(first.get("departure"), rec["date"]) if first else None,
            "arr_time": parse_clock(last.get("arrival")) if last else None,
            "arr_dt": parse_datetime(last.get("arrival"), rec["date"]) if last else None,
            "arr_airport": (last.get("to_airport") or {}).get("code") if last else rec.get("to"),
            "duration": legs and f.get("duration"),
            "legs": [leg_summary(l) for l in legs],
            "fake_business": fake_biz,
        })
    return rows


# ---------------------------------------------------------------------------
# Analysis / report
# ---------------------------------------------------------------------------
def load_cache() -> dict:
    if not CACHE_FILE.exists():
        sys.exit(f"No cache at {CACHE_FILE}. Run `python flight_search.py search` first.")
    return json.loads(CACHE_FILE.read_text())


def collect_direct(cache: dict) -> list[dict]:
    out = []
    for frm, to in DIRECT_ROUTES:
        for date in DATES_FLEX:
            rec = cache.get(f"direct|{frm}-{to}|{date}|business")
            if not rec:
                continue
            for row in flatten_flights(rec):
                row.update(kind="direct", route=f"{frm}->{to}", date=date,
                           status=rec["status"], error=rec.get("error"))
                out.append(row)
    return out


def build_self_connects(cache: dict) -> tuple[list[dict], list[str]]:
    """Pair ECONOMY positioning legs with BUSINESS transatlantic legs."""
    pairings, notes = [], []
    # index cheapest positioning option per (hub, date)
    for frm, to, target in TRANSATLANTIC_LEGS:
        tatl_rec = cache.get(f"transatlantic|{frm}-{to}|{DATE_TARGET}|business")
        if not tatl_rec or tatl_rec.get("status") != "ok" or not tatl_rec.get("flights"):
            notes.append(f"Transatlantic {frm}->{to} ({target}): no data ({tatl_rec.get('status') if tatl_rec else 'not queried'}).")
            continue
        tatl_rows = [r for r in flatten_flights(tatl_rec) if r["price"] is not None]
        if not tatl_rows:
            notes.append(f"Transatlantic {frm}->{to}: results returned but no concrete price.")
            continue
        tatl = min(tatl_rows, key=lambda r: r["price"])
        for pdate in POSITIONING_DATES:
            pos_rec = cache.get(f"positioning|TLV-{frm}|{pdate}|economy")
            if not pos_rec or pos_rec.get("status") != "ok" or not pos_rec.get("flights"):
                continue
            pos_rows = [r for r in flatten_flights(pos_rec) if r["price"] is not None]
            if not pos_rows:
                continue
            pos = min(pos_rows, key=lambda r: r["price"])
            # connection time
            connect_h = None
            if pos["arr_dt"] and tatl["dep_dt"]:
                connect_h = (tatl["dep_dt"] - pos["arr_dt"]).total_seconds() / 3600.0
            if connect_h is not None and connect_h < MIN_CONNECT_HOURS:
                continue  # infeasible
            risk = ""
            if connect_h is None:
                risk = "connection time unknown"
            elif connect_h < RISKY_CONNECT_HOURS:
                risk = f"RISKY {connect_h:.1f}h connect"
            total = pos["price"] + tatl["price"]
            pairings.append({
                "kind": "self-connect",
                "hub": frm,
                "route": f"TLV->{frm} (econ, {pdate})  +  {frm}->{to} (biz, {DATE_TARGET})",
                "target": target,
                "pos": pos, "tatl": tatl,
                "price": total,
                "connect_h": connect_h,
                "risk": risk,
                "arr_airport": to,
                "dep_time": pos["dep_time"],
                "arr_time": tatl["arr_time"],
                "fake_business": tatl["fake_business"] or pos["fake_business"],
            })
    return pairings, notes


def md_table(headers: list[str], rows: list[list[str]]) -> str:
    line = "| " + " | ".join(headers) + " |"
    sep = "| " + " | ".join("---" for _ in headers) + " |"
    body = "\n".join("| " + " | ".join(r) + " |" for r in rows)
    return "\n".join([line, sep, body]) if rows else line + "\n" + sep + "\n| _(none)_ |"


def cmd_analyze() -> None:
    cache = load_cache()
    direct = collect_direct(cache)
    self_conn, sc_notes = build_self_connects(cache)

    priced = [r for r in direct if r["price"] is not None] + \
             [r for r in self_conn if r["price"] is not None]
    under = sorted([r for r in priced if r["price"] <= PRICE_CAP_USD], key=lambda r: r["price"])
    over_direct = sorted([r for r in direct if r["price"] is not None and r["price"] > PRICE_CAP_USD],
                         key=lambda r: r["price"])[:3]

    lines = ["# TLV -> NYC business-class search — 2026-07-19 (one-way, <$3,000)\n"]
    gen = cache.get("_meta", {}).get("generated", "?")
    lines.append(f"_Data cached {gen} from fast-flights / Google Flights. "
                 f"Prices exactly as returned; no estimates._\n")

    # main table
    rows = []
    for r in under:
        if r["kind"] == "direct":
            routing = r["route"] + (" nonstop" if r["stops"] == 0 else f" ({r['stops']} stop)")
            arr = f"{r['arr_time'] or '?'} {r['arr_airport'] or ''}"
            dur = str(r.get("duration") or "?")
            src = "Google Flights (direct ticket)"
            opt = "direct ticket"
            air = r["airlines"]
        else:
            routing = r["route"]
            arr = f"{r['arr_time'] or '?'} {r['arr_airport']}"
            dur = (f"{r['connect_h']:.1f}h connect" if r["connect_h"] is not None else "connect ?")
            src = "Google Flights (2 separate tickets)"
            opt = "self-connect"
            air = f"{r['pos']['airlines']} + {r['tatl']['airlines']}"
        jfk = "JFK ✅" if r.get("arr_airport") == "JFK" else ("EWR" if r.get("arr_airport") == "EWR" else r.get("arr_airport") or "?")
        flag = " ⚠️intra-EU-narrowbody-biz (blocked middle seat, not lie-flat)" if r.get("fake_business") else ""
        rows.append([opt, routing, air, r.get("dep_time") or "?", arr, dur,
                     f"${r['price']:,.0f}", jfk, src + flag])
    lines.append("## Under-budget options (sorted by total price)\n")
    lines.append(md_table(
        ["Option", "Routing", "Airlines & flights", "Dep TLV", "Arrive NYC", "Duration",
         "Total USD", "JFK/EWR", "Booking source"], rows))

    # over-budget reference
    orows = []
    for r in over_direct:
        routing = r["route"] + (" nonstop" if r["stops"] == 0 else f" ({r['stops']} stop)")
        orows.append([routing, r["airlines"], r.get("dep_time") or "?",
                      f"{r['arr_time'] or '?'} {r['arr_airport'] or ''}",
                      f"${r['price']:,.0f}", r["date"]])
    lines.append("\n## 3 cheapest OVER-budget direct tickets (reference)\n")
    lines.append(md_table(["Routing", "Airlines", "Dep TLV", "Arrive NYC", "Total USD", "Date"], orows))

    # data coverage / no-data honesty section
    lines.append("\n## Query coverage (what actually returned data)\n")
    cov = []
    for key, rec in cache.items():
        if key == "_meta":
            continue
        cov.append([key, rec.get("status", "?"), str(rec.get("n", 0)),
                    (rec.get("error", "") or "")[:60]])
    lines.append(md_table(["Query", "Status", "#results", "Error (if any)"], cov))
    if sc_notes:
        lines.append("\n**Self-connect data gaps:**\n")
        lines.extend(f"- {n}" for n in sc_notes)

    # recommendations
    lines.append("\n## Recommendations\n")
    if under:
        top = under[:2]
        for i, r in enumerate(top, 1):
            arr = r.get("arr_airport")
            why = "arrives JFK (LIRR from Jamaica to the Hamptons)" if arr == "JFK" else f"arrives {arr}"
            lines.append(f"{i}. **{r.get('route','?')}** — ${r['price']:,.0f}; {why}.")
    else:
        lines.append("_No under-budget option returned live data in this run — see coverage table above. "
                     "Nothing is estimated._")

    report = "\n".join(lines) + "\n"
    (HERE / "report.md").write_text(report)
    print(report)
    print(f"\nWrote -> {HERE / 'report.md'}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "search":
        cmd_search()
    elif cmd == "analyze":
        cmd_analyze()
    elif cmd == "all":
        cmd_search()
        cmd_analyze()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
