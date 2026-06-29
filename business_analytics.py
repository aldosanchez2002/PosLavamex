"""
PosLavamex Business Analytics
==============================
Strategic insights engine for the car wash business.
Reads Firestore via REST API (no service account needed — uses the web API key
from index.html).

Usage:
    pip install requests tabulate colorama
    python business_analytics.py
    python business_analytics.py --months 3
    python business_analytics.py --export
"""

import os
import sys
import re
import json
import argparse
import textwrap
import requests
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from dateutil import parser as dateparser

try:
    from colorama import init as colorama_init, Fore, Style
    colorama_init(autoreset=True)
    C = {
        "head":  Fore.CYAN + Style.BRIGHT,
        "sub":   Fore.YELLOW + Style.BRIGHT,
        "good":  Fore.GREEN,
        "warn":  Fore.RED,
        "bold":  Style.BRIGHT,
        "reset": Style.RESET_ALL,
    }
except ImportError:
    C = {k: "" for k in ("head", "sub", "good", "warn", "bold", "reset")}

try:
    from tabulate import tabulate as _tabulate
    HAS_TAB = True
except ImportError:
    HAS_TAB = False

# ── Firebase REST config (from index.html) ────────────────────────────────────

PROJECT_ID = "poslavamex"
API_KEY    = "AIzaSyByIvJpBZv32Zd22fxlYWL9etzBa66Q2rE"
BASE_URL   = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

# ── Firestore REST helpers ────────────────────────────────────────────────────

def _unwrap(value: dict):
    """Convert a Firestore field value dict to a Python native type."""
    if "stringValue"    in value: return value["stringValue"]
    if "integerValue"   in value: return int(value["integerValue"])
    if "doubleValue"    in value: return float(value["doubleValue"])
    if "booleanValue"   in value: return value["booleanValue"]
    if "nullValue"      in value: return None
    if "timestampValue" in value:
        raw = value["timestampValue"]
        try:
            return dateparser.parse(raw).replace(tzinfo=timezone.utc)
        except Exception:
            return None
    if "mapValue" in value:
        fields = value["mapValue"].get("fields", {})
        return {k: _unwrap(v) for k, v in fields.items()}
    if "arrayValue" in value:
        vals = value["arrayValue"].get("values", [])
        return [_unwrap(v) for v in vals]
    return None

def _doc_to_dict(doc: dict) -> dict:
    fields = doc.get("fields", {})
    result = {k: _unwrap(v) for k, v in fields.items()}
    result["id"] = doc["name"].split("/")[-1]
    return result

def fetch_collection(name: str, page_size: int = 300) -> list[dict]:
    docs   = []
    token  = None
    url    = f"{BASE_URL}/{name}"
    params = {"key": API_KEY, "pageSize": page_size}
    while True:
        if token:
            params["pageToken"] = token
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data  = resp.json()
        batch = data.get("documents", [])
        docs.extend(_doc_to_dict(d) for d in batch)
        token = data.get("nextPageToken")
        if not token:
            break
    return docs

# ── Output helpers ────────────────────────────────────────────────────────────

LINES: list[str] = []

def section(title):
    bar = "═" * 70
    LINES.append(f"\n{C['head']}{bar}{C['reset']}")
    LINES.append(f"{C['head']}  {title}{C['reset']}")
    LINES.append(f"{C['head']}{bar}{C['reset']}")

def sub(title):
    LINES.append(f"\n{C['sub']}▶ {title}{C['reset']}")

def line(text=""):
    LINES.append(str(text))

def insight(text, good=True):
    icon   = "✔" if good else "✘"
    colour = C["good"] if good else C["warn"]
    LINES.append(f"  {colour}{icon}{C['reset']} {text}")

def recommend(text):
    LINES.append(f"  {C['bold']}→{C['reset']} {text}")

def tbl(rows, headers):
    if HAS_TAB:
        return _tabulate(rows, headers=headers, tablefmt="simple", floatfmt=".2f")
    col_w = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0))
              for i, h in enumerate(headers)]
    sep  = "  ".join("-" * w for w in col_w)
    head = "  ".join(str(h).ljust(col_w[i]) for i, h in enumerate(headers))
    body = "\n".join("  ".join(str(r[i]).ljust(col_w[i]) for i in range(len(headers)))
                     for r in rows)
    return f"{head}\n{sep}\n{body}"

def flush():
    out = "\n".join(LINES)
    print(out)
    return out

# ── Numeric helpers ───────────────────────────────────────────────────────────

def f(v):
    try: return float(v or 0)
    except: return 0.0

def pct(n, d):
    return (n / d * 100) if d else 0.0

def mxn(v):
    return f"${v:,.2f} MXN"

# ── Load & filter ─────────────────────────────────────────────────────────────

def load_data(since=None):
    print("  Fetching tickets …", end="", flush=True)
    raw = fetch_collection("tickets")
    print(f" {len(raw)} raw docs")

    print("  Fetching employees …", end="", flush=True)
    employees = fetch_collection("employees")
    print(f" {len(employees)}")

    print("  Fetching expenses …", end="", flush=True)
    expenses = fetch_collection("expenses")
    print(f" {len(expenses)}")

    # Parse timestamps, keep only PAID
    tickets = []
    for t in raw:
        if t.get("status") != "PAID":
            continue
        ts = t.get("timestamp") or t.get("paidAt")
        if not isinstance(ts, datetime):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        t["_dt"] = ts
        if since and ts < since:
            continue
        tickets.append(t)

    print(f"  → {len(tickets)} PAID tickets in analysis window\n")
    return tickets, employees, expenses

# ── Analysis sections ─────────────────────────────────────────────────────────

def analyse_revenue(tickets):
    section("1  REVENUE OVERVIEW")

    total_rev  = sum(f(t.get("price"))      for t in tickets)
    total_comm = sum(f(t.get("commission")) for t in tickets)
    n          = len(tickets)
    avg_ticket = total_rev / n if n else 0

    dates      = sorted(t["_dt"] for t in tickets)
    span_days  = max((dates[-1] - dates[0]).days, 1) if len(dates) >= 2 else 1
    span_mo    = max(span_days / 30.44, 1)

    tpd = n / span_days
    rpd = total_rev / span_days

    line(f"  Period          : {dates[0].strftime('%Y-%m-%d')}  →  {dates[-1].strftime('%Y-%m-%d')}  ({span_days} days)")
    line(f"  Total tickets   : {n:,}")
    line(f"  Total revenue   : {mxn(total_rev)}")
    line(f"  Total commission: {mxn(total_comm)}")
    line(f"  Gross margin    : {pct(total_rev-total_comm, total_rev):.1f}%  (after washer commissions)")
    line(f"  Avg ticket value: {mxn(avg_ticket)}")
    line(f"  Tickets / day   : {tpd:.1f}")
    line(f"  Revenue / day   : {mxn(rpd)}")
    line(f"  Avg monthly rev : {mxn(total_rev/span_mo)}")

    # Monthly trend
    by_mo  = defaultdict(float)
    cnt_mo = defaultdict(int)
    for t in tickets:
        k = t["_dt"].strftime("%Y-%m")
        by_mo[k]  += f(t.get("price"))
        cnt_mo[k] += 1

    if len(by_mo) >= 2:
        sub("Monthly Revenue Trend")
        months = sorted(by_mo)
        rows = [[m, cnt_mo[m], mxn(by_mo[m]),
                 mxn(by_mo[m]/cnt_mo[m])] for m in months]
        line(tbl(rows, ["Month", "Tickets", "Revenue", "Avg Ticket"]))

        vals   = [by_mo[m] for m in months]
        growth = pct(vals[-1] - vals[-2], vals[-2])
        insight(f"Latest month-over-month revenue growth: {growth:+.1f}%", good=growth >= 0)
        if growth < 0:
            recommend("Revenue dipped last month — run a weekend flash promo or loyalty push.")

    return {"total_rev": total_rev, "total_comm": total_comm,
            "n": n, "avg_ticket": avg_ticket,
            "span_days": span_days, "tpd": tpd, "rpd": rpd}


def analyse_services(tickets):
    section("2  SERVICE MIX & PROFITABILITY")

    by_svc  = defaultdict(lambda: {"n":0,"rev":0.0,"comm":0.0})
    by_size = defaultdict(lambda: {"n":0,"rev":0.0})
    n_tot   = len(tickets)
    r_tot   = sum(f(t.get("price")) for t in tickets)

    for t in tickets:
        svc  = (t.get("service") or {}).get("label","Unknown")
        size = (t.get("size")    or {}).get("label","Unknown")
        rev  = f(t.get("price"));  comm = f(t.get("commission"))
        by_svc[svc]["n"]    += 1;  by_svc[svc]["rev"]  += rev;  by_svc[svc]["comm"] += comm
        by_size[size]["n"]  += 1;  by_size[size]["rev"] += rev

    sub("By Service Type")
    rows = []
    for svc, d in sorted(by_svc.items(), key=lambda x:-x[1]["rev"]):
        margin = pct(d["rev"]-d["comm"], d["rev"])
        rows.append([svc, d["n"], f"{pct(d['n'],n_tot):.1f}%",
                     mxn(d["rev"]), f"{pct(d['rev'],r_tot):.1f}%",
                     mxn(d["rev"]/d["n"] if d["n"] else 0), f"{margin:.1f}%"])
    line(tbl(rows, ["Service","Tickets","% Count","Revenue","% Rev","Avg $","Margin%"]))

    top = max(by_svc, key=lambda s: by_svc[s]["rev"])
    insight(f"'{top}' drives the most revenue.")

    prem = [s for s in by_svc if any(p in s.upper() for p in ("PREMIUM","PRESIDENTIAL","COMPLETO","COMPLETE"))]
    prem_n = sum(by_svc[s]["n"] for s in prem)
    if pct(prem_n, n_tot) < 15:
        recommend(f"Only {pct(prem_n,n_tot):.1f}% of tickets are premium/presidential. "
                  "A 5% upsell shift to premium = significant revenue lift.")

    sub("By Vehicle Size")
    rows2 = []
    for sz, d in sorted(by_size.items(), key=lambda x:-x[1]["rev"]):
        rows2.append([sz, d["n"], f"{pct(d['n'],n_tot):.1f}%",
                      mxn(d["rev"]), mxn(d["rev"]/d["n"] if d["n"] else 0)])
    line(tbl(rows2, ["Size","Tickets","%","Revenue","Avg $"]))

    return by_svc, by_size


def analyse_extras(tickets):
    section("3  EXTRAS UPSELL ANALYSIS")

    n = len(tickets)
    with_extras = 0
    e_counts = defaultdict(int)
    e_rev    = defaultdict(float)
    tot_extra = 0.0

    for t in tickets:
        extras = t.get("extras") or []
        if extras:
            with_extras += 1
            for e in extras:
                lbl = e.get("label","Unknown")
                e_counts[lbl] += 1
                e_rev[lbl]    += f(e.get("price"))
                tot_extra     += f(e.get("price"))

    rate = pct(with_extras, n)
    line(f"  Tickets with extras : {with_extras:,} / {n:,}  ({rate:.1f}%)")
    line(f"  Total extras revenue: {mxn(tot_extra)}")
    line(f"  Extra rev / ticket  : {mxn(tot_extra/n if n else 0)}")

    if e_counts:
        sub("Top Extras Sold")
        rows = sorted([(lbl, e_counts[lbl], mxn(e_rev[lbl]),
                        mxn(e_rev[lbl]/e_counts[lbl]))
                       for lbl in e_counts], key=lambda r:-e_counts[r[0]])
        line(tbl(rows, ["Extra","Sold","Total Rev","Avg Price"]))

    if rate < 30:
        insight(f"Upsell rate is only {rate:.1f}% — most customers leave money on the table.", good=False)
        recommend("Laminated extras menu at the intake window + a verbal offer = 2-3× attach rate.")
        recommend("Bundle Aspirado into COMPLETE/PREMIUM at +$30 to raise perceived value.")
    else:
        insight(f"Solid upsell rate: {rate:.1f}% of tickets include at least one extra.")

    return rate, tot_extra


def analyse_time_patterns(tickets):
    section("4  PEAK HOURS & DAY-OF-WEEK PATTERNS")

    hr_t = defaultdict(int);  hr_r = defaultdict(float)
    dow_t= defaultdict(int);  dow_r= defaultdict(float)
    DOW  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]

    for t in tickets:
        dt = t["_dt"]; rev = f(t.get("price"))
        hr_t[dt.hour]    += 1;  hr_r[dt.hour]    += rev
        dow_t[dt.weekday()] += 1;  dow_r[dt.weekday()] += rev

    sub("Revenue by Hour of Day")
    peak_val = max(hr_t.values(), default=1)
    rows = []
    for hr in range(6, 22):
        n = hr_t[hr]; r = hr_r[hr]
        bar = "█" * int(n / peak_val * 25)
        rows.append([f"{hr:02d}:00", n, mxn(r), mxn(r/n if n else 0), bar])
    line(tbl(rows, ["Hour","Tickets","Revenue","Avg $","Volume"]))

    peak_hr   = max(hr_t, key=hr_t.get, default=None)
    dead_hrs  = [h for h in range(7,18) if hr_t[h] < peak_val*0.25]
    if peak_hr is not None:
        insight(f"Peak hour: {peak_hr:02d}:00 — ensure full staffing then.")
    if dead_hrs:
        recommend(f"Dead hours ({', '.join(f'{h:02d}:00' for h in dead_hrs[:5])}): "
                  "run hourly flash deals via WhatsApp to fill idle slots.")

    sub("Revenue by Day of Week")
    peak_dow = max(dow_t.values(), default=1)
    rows2 = []
    for d in range(7):
        n = dow_t[d]; r = dow_r[d]
        bar = "█" * int(n / peak_dow * 20)
        rows2.append([DOW[d], n, mxn(r), mxn(r/n if n else 0), bar])
    line(tbl(rows2, ["Day","Tickets","Revenue","Avg $","Volume"]))

    best  = max(dow_t, key=dow_t.get, default=None)
    worst = min(dow_t, key=dow_t.get, default=None)
    if best  is not None: insight(f"{DOW[best]} is the busiest day.")
    if worst is not None: recommend(f"{DOW[worst]} is the slowest — try a midweek loyalty stamp day or discount.")

    return hr_t, dow_t


def analyse_customers(tickets):
    section("5  CUSTOMER RETURN RATE (PROXY)")
    line("  No customer IDs in Firestore — using vehicle description as a proxy.")

    desc_c = defaultdict(int)
    for t in tickets:
        d = (t.get("vehicleDesc") or "").strip().lower()
        if d and d not in ("","n/a","na","-"):
            desc_c[d] += 1

    total     = len(desc_c)
    returning = sum(1 for c in desc_c.values() if c > 1)
    rate      = pct(returning, total) if total else 0
    top10     = sorted(desc_c.items(), key=lambda x:-x[1])[:10]

    line(f"  Unique vehicle descriptions : {total:,}")
    line(f"  Seen more than once         : {returning:,}  ({rate:.1f}%)")

    if top10:
        sub("Top Repeat Vehicles (likely loyal customers)")
        line(tbl([(d.title(), c) for d,c in top10], ["Vehicle","Visits"]))

    if rate < 20:
        insight(f"Return-rate proxy is low ({rate:.1f}%) — most vehicles appear only once.", good=False)
        recommend("Launch a loyalty stamp card: every 5th wash free. Print cost <$500 MXN.")
        recommend("Collect WhatsApp numbers at checkout to build a broadcast list for promos.")
    elif rate < 40:
        insight(f"Moderate repeat rate ({rate:.1f}%). Room to grow loyalty.", good=True)
        recommend("A WhatsApp group with a monthly promo keeps regulars from drifting to competitors.")
    else:
        insight(f"Strong repeat rate proxy ({rate:.1f}%) — your regulars love you.", good=True)
        recommend("Referral discount: 'bring a friend, get $30 off your next wash'.")

    return rate


def analyse_employees(tickets, employees):
    section("6  EMPLOYEE PERFORMANCE & EFFICIENCY")

    stats = defaultdict(lambda: {"tickets":0,"commission":0.0,"rev":0.0})
    for t in tickets:
        ws   = t.get("washers") or []
        rev  = f(t.get("price")); comm = f(t.get("commission"))
        pw   = comm / len(ws) if ws else 0
        for w in ws:
            stats[w]["tickets"]    += 1
            stats[w]["commission"] += pw
            stats[w]["rev"]        += rev

    sub("Washer Commission & Productivity")
    rows = []
    for w, s in sorted(stats.items(), key=lambda x:-x[1]["commission"]):
        avg_c = s["commission"]/s["tickets"] if s["tickets"] else 0
        rows.append([w, s["tickets"], mxn(s["commission"]),
                     mxn(avg_c), mxn(s["rev"])])
    line(tbl(rows, ["Washer","Tickets","Total Comm","Avg Comm/Ticket","Rev Served"]))

    if stats:
        top    = max(stats, key=lambda w: stats[w]["commission"])
        bottom = min(stats, key=lambda w: stats[w]["commission"])
        gap    = pct(stats[top]["commission"] - stats[bottom]["commission"],
                     stats[top]["commission"])
        insight(f"Top earner: '{top}' — model their workflow for team training.")
        if gap > 40:
            recommend(f"Big gap ({gap:.0f}%) between top and bottom earner. "
                      "Pair low-performers with top-performers for 1 week.")

    sups  = [e for e in employees if e.get("isSupervisor")]
    wash  = [e for e in employees if e.get("role")=="WASHER" and e.get("active")]
    if wash and sups:
        ratio = len(wash)/len(sups)
        line(f"\n  Active washers / supervisors: {len(wash)} / {len(sups)} = {ratio:.1f}x")
        if ratio > 8:
            recommend("High washer-to-supervisor ratio — consider promoting a senior washer to lead.")

    return stats


def analyse_payments(tickets):
    section("7  PAYMENT METHOD BREAKDOWN")

    m_cnt = defaultdict(int);  m_rev = defaultdict(float)
    for t in tickets:
        pd  = t.get("paymentDetails") or {}
        m   = pd.get("method","UNKNOWN")
        m_cnt[m] += 1;  m_rev[m] += f(t.get("price"))

    n = len(tickets)
    rows = [[m, m_cnt[m], f"{pct(m_cnt[m],n):.1f}%", mxn(m_rev[m])]
            for m in sorted(m_cnt, key=lambda x:-m_cnt[x])]
    line(tbl(rows, ["Method","Tickets","% Tickets","Revenue"]))

    cort_pct = pct(m_rev.get("CORTESIA",0), sum(m_rev.values()))
    if cort_pct > 5:
        insight(f"Cortesías = {cort_pct:.1f}% of potential revenue — leakage risk.", good=False)
        recommend("Require supervisor PIN + written reason for every cortesía. Review monthly.")

    card_pct = pct(m_cnt.get("CARD",0), n)
    if card_pct < 10:
        recommend(f"Only {card_pct:.1f}% card payments. A card reader increases avg spend ~15%.")


def analyse_snacks(tickets):
    section("8  SNACK REVENUE")

    PRICE = 30
    total = sum(int(t.get("snackCount") or 0) for t in tickets)
    rev   = total * PRICE
    with_ = sum(1 for t in tickets if int(t.get("snackCount") or 0) > 0)
    n     = len(tickets)

    line(f"  Total snacks sold     : {total:,}")
    line(f"  Snack revenue         : {mxn(rev)}")
    line(f"  Tickets with snack    : {with_:,} ({pct(with_,n):.1f}%)")
    line(f"  Avg snack rev/ticket  : {mxn(rev/n if n else 0)}")

    if pct(with_, n) < 15:
        recommend("Snack attach-rate is low. Place snacks visibly at the register; offer verbally at checkout.")
    else:
        insight("Good snack attach rate — consider a second SKU (agua, candy) to lift basket.")

    return rev


def analyse_capacity(tickets, rs):
    section("9  CAPACITY & GROWTH HEADROOM")

    SLOTS       = 5
    HOURS       = 12
    MINS_WASH   = 20
    theoretical = (HOURS * 60 / MINS_WASH) * SLOTS
    actual      = rs["tpd"]
    util        = pct(actual, theoretical)

    line(f"  Washer slots             : {SLOTS}")
    line(f"  Theoretical max / day    : {theoretical:.0f}  ({MINS_WASH}-min washes, {HOURS}h)")
    line(f"  Actual avg / day         : {actual:.1f}")
    line(f"  Capacity utilisation     : {util:.1f}%")

    if util < 40:
        insight(f"Only {util:.1f}% capacity used — massive growth room with zero capex.", good=False)
        recommend("Focus budget on MARKETING to fill existing slots before any hardware spend.")
        recommend("Google Business Profile + photos + 5-star reviews is free and drives walk-ins.")
    elif util < 70:
        insight(f"Moderate utilisation ({util:.1f}%). Targeted marketing can fill the gap.", good=True)
        recommend("Add an intake greeter during peak hours to cut idle time between cars.")
    else:
        insight(f"High utilisation ({util:.1f}%) — nearing capacity.", good=True)
        recommend("Raise PICKUP + SUV_GDE prices 10-15% — demand is proven, margin improves.")
        recommend("Consider extending Saturday hours by 1-2h or adding a 6th slot.")


def scaling_roadmap(rs, upsell_rate, return_rate):
    section("10  STRATEGIC GROWTH ROADMAP  (90-Day Playbook)")

    upside_upsell  = rs["avg_ticket"] * 0.10 * rs["tpd"] * 30
    upside_loyalty = rs["rpd"] * 0.05 * 30
    upside_price   = rs["rpd"] * 0.04 * 30
    total_upside   = upside_upsell + upside_loyalty + upside_price

    line(textwrap.dedent(f"""
  ┌─────────────────────────────────────────────────────────────────────┐
  │  PHASE 1 — Weeks 1-4: Fix Revenue Leaks (Zero Cost)                │
  ├─────────────────────────────────────────────────────────────────────┤
  │  □ Train cashiers on a 5-second extras upsell script.               │
  │  □ Post a laminated extras menu at the intake window.               │
  │  □ Require supervisor PIN + reason for every cortesía.              │
  │  □ Start collecting WhatsApp numbers — one field on each ticket.    │
  ├─────────────────────────────────────────────────────────────────────┤
  │  PHASE 2 — Weeks 5-8: Build Loyalty (Low Cost)                     │
  ├─────────────────────────────────────────────────────────────────────┤
  │  □ Print loyalty stamp cards (5th wash free or 20% off).           │
  │  □ Create a WhatsApp broadcast. Send 1 targeted promo per week.     │
  │  □ "Bring a Friend" referral: $30 off for both parties.            │
  │  □ Ask top 20 regulars for a Google review — offer a free snack.   │
  ├─────────────────────────────────────────────────────────────────────┤
  │  PHASE 3 — Weeks 9-12: Optimise Pricing & Capacity                 │
  ├─────────────────────────────────────────────────────────────────────┤
  │  □ Raise PICKUP + SUV_GDE prices by 10% (A/B test for 2 weeks).   │
  │  □ Create a "Lunes Especial" to fill the slowest day.              │
  │  □ If utilisation >70%: add staff or extend hours on Saturdays.    │
  │  □ Bundle 1 extra into COMPLETE & PREMIUM at +$30 uplift.         │
  └─────────────────────────────────────────────────────────────────────┘

  CONSERVATIVE REVENUE UPSIDE (per month):
    +10% upsell conversion  → +{mxn(upside_upsell)}/mo
    +5%  loyalty visits     → +{mxn(upside_loyalty)}/mo
    +10% price on big cars  → +{mxn(upside_price)}/mo
    ──────────────────────────────────────────
    Realistic 90-day upside → +{mxn(total_upside)}/mo
    """))


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=0)
    ap.add_argument("--export", action="store_true")
    args = ap.parse_args()

    print(f"\n{'═'*70}")
    print("  PosLavamex  —  Business Intelligence Report")
    print(f"  Generated : {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'═'*70}\n")

    since = None
    if args.months:
        since = datetime.now(tz=timezone.utc) - timedelta(days=args.months*30)
        print(f"  Window: last {args.months} months (since {since.strftime('%Y-%m-%d')})\n")

    print("Loading data from Firestore …")
    tickets, employees, expenses = load_data(since)

    if not tickets:
        print("\n[!] No PAID tickets found. Exiting.")
        sys.exit(0)

    print(f"Analysing {len(tickets):,} paid tickets …\n")

    rs          = analyse_revenue(tickets)
    analyse_services(tickets)
    upsell, _   = analyse_extras(tickets)
    analyse_time_patterns(tickets)
    ret_rate    = analyse_customers(tickets)
    analyse_employees(tickets, employees)
    analyse_payments(tickets)
    analyse_snacks(tickets)
    analyse_capacity(tickets, rs)
    scaling_roadmap(rs, upsell, ret_rate)

    output = flush()

    if args.export:
        clean = re.sub(r"\x1b\[[0-9;]*m", "", output)
        with open("analytics_report.txt", "w", encoding="utf-8") as fh:
            fh.write(clean)
        print("\n  Saved → analytics_report.txt")


if __name__ == "__main__":
    main()
