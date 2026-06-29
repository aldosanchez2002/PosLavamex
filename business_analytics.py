"""
PosLavamex Business Analytics
==============================
Strategic insights engine for the car wash business.
Reads Firestore and outputs a full consultant-grade analysis:
  - Revenue trends & growth trajectory
  - Service mix profitability
  - Peak-hour & day-of-week patterns
  - Customer return-rate proxy
  - Employee efficiency & commission rankings
  - Extras upsell rate
  - Payment method breakdown
  - Actionable growth recommendations

Setup:
    pip install firebase-admin python-dotenv tabulate colorama
    Place serviceAccountKey.json in the same directory (or set FIREBASE_CRED_PATH).

Usage:
    python business_analytics.py
    python business_analytics.py --months 3   # analyse last N months only
    python business_analytics.py --export     # also save report to analytics_report.txt
"""

import os
import sys
import json
import argparse
import textwrap
from collections import defaultdict
from datetime import datetime, timezone, timedelta

# ── Optional coloured output ──────────────────────────────────────────────────
try:
    from colorama import init as colorama_init, Fore, Style
    colorama_init(autoreset=True)
    C = {
        "head":    Fore.CYAN + Style.BRIGHT,
        "sub":     Fore.YELLOW + Style.BRIGHT,
        "good":    Fore.GREEN,
        "warn":    Fore.RED,
        "bold":    Style.BRIGHT,
        "reset":   Style.RESET_ALL,
    }
except ImportError:
    C = {k: "" for k in ("head", "sub", "good", "warn", "bold", "reset")}

try:
    from tabulate import tabulate
    HAS_TABULATE = True
except ImportError:
    HAS_TABULATE = False

from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

load_dotenv()

# ── Firebase init ─────────────────────────────────────────────────────────────

FIREBASE_CRED = os.getenv("FIREBASE_CRED_PATH", "serviceAccountKey.json")

def init_firestore():
    if not os.path.exists(FIREBASE_CRED):
        sys.exit(
            f"[ERROR] serviceAccountKey.json not found at '{FIREBASE_CRED}'.\n"
            "Set FIREBASE_CRED_PATH in your .env or place the file here."
        )
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CRED)
        firebase_admin.initialize_app(cred)
    return firestore.client()

# ── Data fetching ─────────────────────────────────────────────────────────────

def fetch_collection(db, name):
    docs = db.collection(name).stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]

def load_all_data(db, since: datetime | None = None):
    print("  Fetching tickets …", end="", flush=True)
    tickets_raw = fetch_collection(db, "tickets")
    print(f" {len(tickets_raw)} found")

    print("  Fetching employees …", end="", flush=True)
    employees = fetch_collection(db, "employees")
    print(f" {len(employees)} found")

    print("  Fetching expenses …", end="", flush=True)
    expenses = fetch_collection(db, "expenses")
    print(f" {len(expenses)} found")

    print("  Fetching business_expenses …", end="", flush=True)
    biz_expenses = fetch_collection(db, "business_expenses")
    print(f" {len(biz_expenses)} found")

    # Filter tickets to analysis window
    tickets = []
    for t in tickets_raw:
        ts = t.get("timestamp") or t.get("paidAt")
        if ts is None:
            continue
        if hasattr(ts, "tzinfo") and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        t["_dt"] = ts
        if since and ts < since:
            continue
        tickets.append(t)

    paid = [t for t in tickets if t.get("status") == "PAID"]
    return paid, employees, expenses, biz_expenses

# ── Helpers ───────────────────────────────────────────────────────────────────

def safe_float(v, default=0.0):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return default

def fmt_mxn(v):
    return f"${v:,.2f} MXN"

def pct(num, denom):
    return (num / denom * 100) if denom else 0

def week_key(dt):
    iso = dt.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"

def table(rows, headers, fmt="simple"):
    if HAS_TABULATE:
        return tabulate(rows, headers=headers, tablefmt=fmt, floatfmt=".2f")
    # Plain fallback
    col_w = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0))
              for i, h in enumerate(headers)]
    line = "  ".join(str(h).ljust(col_w[i]) for i, h in enumerate(headers))
    sep  = "  ".join("-" * w for w in col_w)
    body = "\n".join(
        "  ".join(str(r[i]).ljust(col_w[i]) for i in range(len(headers)))
        for r in rows
    )
    return f"{line}\n{sep}\n{body}"

# ── Section printers ──────────────────────────────────────────────────────────

LINES = []

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
    icon = "✔" if good else "✘"
    colour = C["good"] if good else C["warn"]
    LINES.append(f"  {colour}{icon}{C['reset']} {text}")

def recommend(text):
    LINES.append(f"  {C['bold']}→{C['reset']} {text}")

def flush_lines():
    output = "\n".join(LINES)
    print(output)
    return output

# ── Analysis modules ──────────────────────────────────────────────────────────

def analyse_revenue(tickets):
    section("1  REVENUE OVERVIEW")

    total_rev   = sum(safe_float(t.get("price")) for t in tickets)
    total_comm  = sum(safe_float(t.get("commission")) for t in tickets)
    n           = len(tickets)
    avg_ticket  = total_rev / n if n else 0

    # Date range
    dates = sorted(t["_dt"] for t in tickets)
    span_days = max((dates[-1] - dates[0]).days, 1) if len(dates) >= 2 else 1
    span_months = max(span_days / 30.44, 1)

    rev_per_day   = total_rev   / span_days
    tickets_per_day = n / span_days
    rev_per_month = total_rev / span_months

    line(f"  Period analysed : {dates[0].strftime('%Y-%m-%d')}  →  {dates[-1].strftime('%Y-%m-%d')}  ({span_days} days)")
    line(f"  Total tickets   : {n:,}")
    line(f"  Total revenue   : {fmt_mxn(total_rev)}")
    line(f"  Total commission: {fmt_mxn(total_comm)}")
    line(f"  Avg ticket value: {fmt_mxn(avg_ticket)}")
    line(f"  Revenue / day   : {fmt_mxn(rev_per_day)}")
    line(f"  Tickets / day   : {tickets_per_day:.1f}")
    line(f"  Avg monthly rev : {fmt_mxn(rev_per_month)}")

    # Month-over-month trend
    by_month = defaultdict(float)
    cnt_month = defaultdict(int)
    for t in tickets:
        key = t["_dt"].strftime("%Y-%m")
        by_month[key] += safe_float(t.get("price"))
        cnt_month[key] += 1

    if len(by_month) >= 2:
        sub("Monthly Revenue Trend")
        months = sorted(by_month)
        rows = []
        for m in months:
            rows.append([m, cnt_month[m], fmt_mxn(by_month[m]),
                         fmt_mxn(by_month[m] / cnt_month[m])])
        line(table(rows, ["Month", "Tickets", "Revenue", "Avg Ticket"]))

        # growth rate
        vals = [by_month[m] for m in months]
        if len(vals) >= 2:
            growth = pct(vals[-1] - vals[-2], vals[-2])
            is_up = growth >= 0
            insight(f"Most-recent month-over-month revenue growth: {growth:+.1f}%", good=is_up)
            if not is_up:
                recommend("Revenue declined last month — run a weekend promo or loyalty offer.")

    return {
        "total_rev": total_rev, "total_comm": total_comm,
        "n": n, "avg_ticket": avg_ticket,
        "span_days": span_days, "rev_per_day": rev_per_day,
        "tickets_per_day": tickets_per_day,
    }


def analyse_services(tickets):
    section("2  SERVICE MIX & PROFITABILITY")

    by_service = defaultdict(lambda: {"n": 0, "rev": 0.0, "comm": 0.0})
    by_size    = defaultdict(lambda: {"n": 0, "rev": 0.0})

    for t in tickets:
        svc  = (t.get("service") or {}).get("label", "Unknown")
        size = (t.get("size")    or {}).get("label", "Unknown")
        rev  = safe_float(t.get("price"))
        comm = safe_float(t.get("commission"))
        by_service[svc]["n"]    += 1
        by_service[svc]["rev"]  += rev
        by_service[svc]["comm"] += comm
        by_size[size]["n"]      += 1
        by_size[size]["rev"]    += rev

    n_total   = len(tickets)
    rev_total = sum(safe_float(t.get("price")) for t in tickets)

    sub("By Service Type")
    rows = []
    for svc, d in sorted(by_service.items(), key=lambda x: -x[1]["rev"]):
        margin = pct(d["rev"] - d["comm"], d["rev"])
        rows.append([
            svc, d["n"], f"{pct(d['n'], n_total):.1f}%",
            fmt_mxn(d["rev"]), f"{pct(d['rev'], rev_total):.1f}%",
            fmt_mxn(d["rev"] / d["n"] if d["n"] else 0),
            f"{margin:.1f}%"
        ])
    line(table(rows, ["Service", "Tickets", "% Count", "Revenue", "% Rev", "Avg $", "Margin%"]))

    # Top service
    top_svc = max(by_service, key=lambda s: by_service[s]["rev"])
    insight(f"'{top_svc}' drives the most revenue — protect its quality and speed.")

    # Check if premium tiers are under-utilised
    premium_ids = [s for s in by_service if any(p in s.upper() for p in ("PREMIUM", "PRESIDENTIAL", "COMPLETO", "COMPLETE"))]
    premium_n = sum(by_service[s]["n"] for s in premium_ids)
    if n_total > 0 and pct(premium_n, n_total) < 15:
        recommend(f"Only {pct(premium_n, n_total):.1f}% of tickets are premium/presidential. "
                  "Train staff to upsell — even +5% conversion at double price = big lift.")

    sub("By Vehicle Size")
    rows2 = []
    for sz, d in sorted(by_size.items(), key=lambda x: -x[1]["rev"]):
        rows2.append([sz, d["n"], f"{pct(d['n'], n_total):.1f}%",
                      fmt_mxn(d["rev"]),
                      fmt_mxn(d["rev"] / d["n"] if d["n"] else 0)])
    line(table(rows2, ["Size", "Tickets", "%", "Revenue", "Avg $"]))

    return by_service, by_size


def analyse_extras(tickets):
    section("3  EXTRAS UPSELL ANALYSIS")

    tickets_with_extras = 0
    extra_counts = defaultdict(int)
    extra_rev    = defaultdict(float)
    total_extra_rev = 0.0
    n = len(tickets)

    for t in tickets:
        extras = t.get("extras") or []
        if extras:
            tickets_with_extras += 1
            for e in extras:
                label = e.get("label", "Unknown")
                extra_counts[label] += 1
                extra_rev[label]    += safe_float(e.get("price"))
                total_extra_rev     += safe_float(e.get("price"))

    upsell_rate = pct(tickets_with_extras, n)

    line(f"  Tickets with extras : {tickets_with_extras:,} / {n:,}  ({upsell_rate:.1f}%)")
    line(f"  Total extras revenue: {fmt_mxn(total_extra_rev)}")
    avg_extra_per_ticket = total_extra_rev / n if n else 0
    line(f"  Extra rev / ticket  : {fmt_mxn(avg_extra_per_ticket)}")

    if extra_counts:
        sub("Top Extras")
        rows = sorted(
            [(lbl, extra_counts[lbl], fmt_mxn(extra_rev[lbl]),
              fmt_mxn(extra_rev[lbl] / extra_counts[lbl]))
             for lbl in extra_counts],
            key=lambda r: -extra_counts[r[0]]
        )
        line(table(rows, ["Extra", "Sold", "Total Rev", "Avg Price"]))

    if upsell_rate < 30:
        insight(f"Upsell rate is low ({upsell_rate:.1f}%). "
                "Most customers leave money on the table.", good=False)
        recommend("Add a laminated extras menu at intake. A verbal offer + menu = 2-3× attach rate.")
        recommend("Bundle 1 popular extra (e.g. Aspirado) into mid-tier packages at +$30 to raise perceived value.")
    else:
        insight(f"Good upsell rate: {upsell_rate:.1f}% of tickets include extras.")

    return upsell_rate, total_extra_rev


def analyse_time_patterns(tickets):
    section("4  PEAK HOURS & DAY-OF-WEEK PATTERNS")

    hour_tickets = defaultdict(int)
    hour_rev     = defaultdict(float)
    dow_tickets  = defaultdict(int)
    dow_rev      = defaultdict(float)

    DOW_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    for t in tickets:
        dt  = t["_dt"]
        hr  = dt.hour
        dow = dt.weekday()
        rev = safe_float(t.get("price"))
        hour_tickets[hr]  += 1
        hour_rev[hr]      += rev
        dow_tickets[dow]  += 1
        dow_rev[dow]      += rev

    sub("Revenue by Hour of Day")
    rows = []
    for hr in range(6, 22):
        n   = hour_tickets[hr]
        r   = hour_rev[hr]
        bar = "█" * min(int(n / max(hour_tickets.values(), default=1) * 30), 30)
        rows.append([f"{hr:02d}:00", n, fmt_mxn(r),
                     fmt_mxn(r / n if n else 0), bar])
    line(table(rows, ["Hour", "Tickets", "Revenue", "Avg $", "Volume"]))

    peak_hr = max(hour_tickets, key=hour_tickets.get, default=None)
    dead_hrs = [h for h in range(6, 18) if hour_tickets[h] < (hour_tickets.get(peak_hr, 0) * 0.25)]
    if peak_hr is not None:
        insight(f"Peak hour is {peak_hr:02d}:00 — make sure staffing is at full strength then.")
    if dead_hrs:
        recommend(f"Dead hours ({', '.join(f'{h:02d}:00' for h in dead_hrs[:4])}): "
                  "run hourly discount offers or flash promotions to fill slow slots.")

    sub("Revenue by Day of Week")
    rows2 = []
    for dow in range(7):
        n   = dow_tickets[dow]
        r   = dow_rev[dow]
        bar = "█" * min(int(n / max(dow_tickets.values(), default=1) * 20), 20)
        rows2.append([DOW_NAMES[dow], n, fmt_mxn(r),
                      fmt_mxn(r / n if n else 0), bar])
    line(table(rows2, ["Day", "Tickets", "Revenue", "Avg $", "Volume"]))

    best_dow  = max(dow_tickets, key=dow_tickets.get, default=None)
    worst_dow = min(dow_tickets, key=dow_tickets.get, default=None)
    if best_dow is not None:
        insight(f"{DOW_NAMES[best_dow]} is the busiest day — capitalise with premium promotions.")
    if worst_dow is not None:
        recommend(f"{DOW_NAMES[worst_dow]} is the slowest — consider a midweek discount or loyalty card stamp day.")

    return hour_tickets, dow_tickets


def analyse_customers(tickets):
    """
    No customer IDs exist, but vehicle descriptions give a proxy for
    repeat customers: same colour+type combos seen multiple times.
    """
    section("5  CUSTOMER RETURN RATE (PROXY)")

    line("  Note: Firestore has no customer ID — using vehicle description as a proxy.")
    line("  Two tickets with the same description are likely the same customer.")

    desc_counts = defaultdict(int)
    for t in tickets:
        desc = (t.get("vehicleDesc") or "").strip().lower()
        if desc and desc not in ("", "n/a", "na", "-"):
            desc_counts[desc] += 1

    total_descs   = len(desc_counts)
    returning     = sum(1 for c in desc_counts.values() if c > 1)
    return_rate   = pct(returning, total_descs) if total_descs else 0
    freq_returnees = sorted(desc_counts.items(), key=lambda x: -x[1])[:10]

    line(f"  Unique vehicle descriptions : {total_descs:,}")
    line(f"  Seen more than once         : {returning:,}  ({return_rate:.1f}%)")

    if freq_returnees:
        sub("Top Repeat Vehicles (likely loyal customers)")
        rows = [(d.title(), c) for d, c in freq_returnees]
        line(table(rows, ["Vehicle Description", "Visits"]))

    if return_rate < 20:
        insight("Return-rate proxy is low — most vehicles only appear once.", good=False)
        recommend("Launch a loyalty card: every 5th wash free. Print costs <$500 MXN; payback is 1 day.")
        recommend("Ask cashiers to collect a WhatsApp number at checkout — build a broadcast list for promos.")
    elif return_rate < 40:
        insight(f"Moderate repeat rate ({return_rate:.1f}%). Room to grow loyalty.", good=True)
        recommend("A WhatsApp loyalty group with monthly promo keeps customers from drifting to competitors.")
    else:
        insight(f"Strong repeat rate proxy ({return_rate:.1f}%) — your regulars love you.", good=True)
        recommend("Leverage regulars: referral discount ('bring a friend, get $30 off next wash').")

    return return_rate


def analyse_employees(tickets, employees):
    section("6  EMPLOYEE PERFORMANCE & EFFICIENCY")

    washer_stats = defaultdict(lambda: {"tickets": 0, "commission": 0.0, "rev": 0.0})

    for t in tickets:
        washers = t.get("washers") or []
        rev     = safe_float(t.get("price"))
        comm    = safe_float(t.get("commission"))
        per_w   = comm / len(washers) if washers else 0
        for w in washers:
            washer_stats[w]["tickets"]    += 1
            washer_stats[w]["commission"] += per_w
            washer_stats[w]["rev"]        += rev

    sub("Washer Commission & Productivity Ranking")
    rows = []
    for w, s in sorted(washer_stats.items(), key=lambda x: -x[1]["commission"]):
        avg_comm = s["commission"] / s["tickets"] if s["tickets"] else 0
        rows.append([w, s["tickets"],
                     fmt_mxn(s["commission"]),
                     fmt_mxn(avg_comm),
                     fmt_mxn(s["rev"])])
    line(table(rows, ["Washer", "Tickets", "Total Comm", "Avg Comm/Ticket", "Revenue Served"]))

    if washer_stats:
        top    = max(washer_stats, key=lambda w: washer_stats[w]["commission"])
        bottom = min(washer_stats, key=lambda w: washer_stats[w]["commission"])
        top_c    = washer_stats[top]["commission"]
        bottom_c = washer_stats[bottom]["commission"]
        gap      = pct(top_c - bottom_c, top_c)

        insight(f"Top earner '{top}' — model their behaviour for team training.")
        if gap > 40:
            recommend(f"Large gap ({gap:.0f}%) between top and bottom earner. "
                      "Pair low-performers with top-performers for 1 week to raise the floor.")

    # Supervisor ratio
    supervisors = [e for e in employees if e.get("isSupervisor")]
    washers_emp  = [e for e in employees if e.get("role") == "WASHER" and e.get("active")]
    if washers_emp and supervisors:
        ratio = len(washers_emp) / len(supervisors)
        line(f"\n  Active washers   : {len(washers_emp)}")
        line(f"  Supervisors      : {len(supervisors)}")
        line(f"  Washer/supervisor: {ratio:.1f}x")
        if ratio > 8:
            recommend("Washer-to-supervisor ratio is high — consider promoting a senior washer to lead.")

    return washer_stats


def analyse_payments(tickets):
    section("7  PAYMENT METHOD BREAKDOWN")

    method_counts = defaultdict(int)
    method_rev    = defaultdict(float)

    for t in tickets:
        pd     = t.get("paymentDetails") or {}
        method = pd.get("method", "UNKNOWN")
        rev    = safe_float(t.get("price"))
        method_counts[method] += 1
        method_rev[method]    += rev

    n   = len(tickets)
    rows = []
    for m, c in sorted(method_counts.items(), key=lambda x: -x[1]):
        rows.append([m, c, f"{pct(c, n):.1f}%", fmt_mxn(method_rev[m])])
    line(table(rows, ["Method", "Tickets", "% Tickets", "Revenue"]))

    cortesia_n   = method_counts.get("CORTESIA", 0)
    cortesia_rev = method_rev.get("CORTESIA", 0)
    if cortesia_rev > 0:
        cortesia_pct = pct(cortesia_rev, sum(method_rev.values()))
        if cortesia_pct > 5:
            insight(f"Cortesías represent {cortesia_pct:.1f}% of potential revenue — track them tightly.", good=False)
            recommend("Require supervisor PIN for every cortesía and log the reason. Review monthly.")

    card_pct = pct(method_counts.get("CARD", 0), n)
    if card_pct < 10:
        recommend(f"Only {card_pct:.1f}% card payments. Add a card reader if you don't have one — "
                  "card customers spend ~15% more on average.")

    return method_counts, method_rev


def analyse_snacks(tickets):
    section("8  SNACK REVENUE")

    snack_price = 30  # MXN — matches DEFAULTS in index.html
    total_snacks = sum(int(t.get("snackCount") or 0) for t in tickets)
    snack_rev    = total_snacks * snack_price
    tickets_with_snacks = sum(1 for t in tickets if int(t.get("snackCount") or 0) > 0)
    n = len(tickets)

    line(f"  Total snacks sold        : {total_snacks:,}")
    line(f"  Snack revenue            : {fmt_mxn(snack_rev)}")
    line(f"  Tickets with snack       : {tickets_with_snacks:,} ({pct(tickets_with_snacks, n):.1f}%)")
    if n:
        line(f"  Avg snack rev / ticket   : {fmt_mxn(snack_rev / n)}")

    if pct(tickets_with_snacks, n) < 15:
        recommend("Snack attach-rate is low. Place snacks visibly at the register and offer them verbally at checkout.")
    else:
        insight("Good snack attach rate — consider adding a second SKU (agua, candy) to lift basket size.")

    return snack_rev


def analyse_capacity(tickets, rev_stats):
    section("9  CAPACITY & GROWTH HEADROOM")

    SLOTS          = 5        # washer slots from camera system
    WORKING_HRS    = 12       # approx open hours / day
    AVG_WASH_MINS  = 20       # minutes per wash per slot

    theoretical_daily = (WORKING_HRS * 60 / AVG_WASH_MINS) * SLOTS
    actual_daily       = rev_stats["tickets_per_day"]
    utilisation        = pct(actual_daily, theoretical_daily)

    line(f"  Washer slots             : {SLOTS}")
    line(f"  Theoretical max / day    : {theoretical_daily:.0f} tickets  (assuming {AVG_WASH_MINS}-min washes)")
    line(f"  Actual avg / day         : {actual_daily:.1f} tickets")
    line(f"  Capacity utilisation     : {utilisation:.1f}%")

    if utilisation < 40:
        insight(f"Only {utilisation:.1f}% capacity used — huge growth room without adding slots.", good=False)
        recommend("Focus on MARKETING to fill existing capacity before any capex spend.")
        recommend("Google Business Profile with photos + 5-star reviews is free and drives walk-ins.")
        recommend("WhatsApp broadcast to past customers with a weekend flash deal fills the trough quickly.")
    elif utilisation < 70:
        insight(f"Moderate utilisation ({utilisation:.1f}%). Targeted marketing can push to breakeven on each slot.", good=True)
        recommend("Add 1 greeter/intake person during peak hours to reduce slot idle-time between cars.")
    else:
        insight(f"High utilisation ({utilisation:.1f}%) — you're nearly at capacity.", good=True)
        recommend("Consider adding a 6th slot or extending hours by 1–2 hours on weekends.")
        recommend("Raise prices on SUV_GDE and PICKUP 10–15% — demand is proven, margin improves.")


def scaling_roadmap(rev_stats, upsell_rate, return_rate):
    section("10  STRATEGIC GROWTH ROADMAP")

    line(textwrap.dedent(f"""
  Based on your data, here is a prioritised 90-day playbook:

  ┌─────────────────────────────────────────────────────────────────────┐
  │  PHASE 1 — Weeks 1-4: Fix Revenue Leaks (Zero Cost)                │
  ├─────────────────────────────────────────────────────────────────────┤
  │  □ Train every cashier on a 5-second upsell script for extras.      │
  │  □ Post a laminated extras menu at the intake window.               │
  │  □ Require a reason + supervisor PIN for every cortesía.            │
  │  □ Start collecting WhatsApp numbers — one field on the ticket.     │
  ├─────────────────────────────────────────────────────────────────────┤
  │  PHASE 2 — Weeks 5-8: Build Loyalty (Low Cost)                     │
  ├─────────────────────────────────────────────────────────────────────┤
  │  □ Print loyalty stamp cards (5th wash free or 20% off).           │
  │  □ Create a WhatsApp broadcast group. Send 1 promo per week.        │
  │  □ Run a "Bring a Friend" referral: $30 off for both.              │
  │  □ Ask top 20 customers for a Google review (offer a free snack).  │
  ├─────────────────────────────────────────────────────────────────────┤
  │  PHASE 3 — Weeks 9-12: Optimise Pricing & Capacity                 │
  ├─────────────────────────────────────────────────────────────────────┤
  │  □ Raise PICKUP + SUV_GDE prices by 10% (test for 2 weeks).       │
  │  □ Create a "Monday Special" to fill the slowest day.              │
  │  □ If utilisation >70%, add staff or extend hours on Saturdays.    │
  │  □ Bundle 1 extra into COMPLETE and PREMIUM at +$30 uplift.        │
  └─────────────────────────────────────────────────────────────────────┘

  REVENUE UPSIDE ESTIMATE (conservative):
    Current avg ticket      : {fmt_mxn(rev_stats['avg_ticket'])}
    +10% upsell conversion  : +{fmt_mxn(rev_stats['avg_ticket'] * 0.10 * rev_stats['tickets_per_day'] * 30)}/mo
    +5% loyal return visits : +{fmt_mxn(rev_stats['rev_per_day'] * 0.05 * 30)}/mo
    +10% price on big cars  : +{fmt_mxn(rev_stats['rev_per_day'] * 0.04 * 30)}/mo  (est. 40% big vehicles)
    ──────────────────────────────────────────────────────────────────
    Realistic 90-day upside : +{fmt_mxn((rev_stats['avg_ticket']*0.10*rev_stats['tickets_per_day'] + rev_stats['rev_per_day']*0.09)*30)}/mo
    """))


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="PosLavamex Business Analytics")
    parser.add_argument("--months",  type=int, default=0,
                        help="Analyse only the last N months (0 = all time)")
    parser.add_argument("--export",  action="store_true",
                        help="Save the report to analytics_report.txt")
    args = parser.parse_args()

    print(f"\n{'═'*70}")
    print("  PosLavamex  —  Business Intelligence Report")
    print(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'═'*70}\n")

    since = None
    if args.months > 0:
        since = datetime.now(tz=timezone.utc) - timedelta(days=args.months * 30)
        print(f"  Filtering: last {args.months} months (since {since.strftime('%Y-%m-%d')})\n")

    print("Loading data from Firestore …")
    db = init_firestore()
    tickets, employees, expenses, biz_expenses = load_all_data(db, since)

    if not tickets:
        print("\n[!] No PAID tickets found in the selected window. Exiting.")
        sys.exit(0)

    print(f"\nAnalysing {len(tickets):,} paid tickets …\n")

    rev_stats            = analyse_revenue(tickets)
    analyse_services(tickets)
    upsell_rate, _extra  = analyse_extras(tickets)
    analyse_time_patterns(tickets)
    return_rate          = analyse_customers(tickets)
    analyse_employees(tickets, employees)
    analyse_payments(tickets)
    analyse_snacks(tickets)
    analyse_capacity(tickets, rev_stats)
    scaling_roadmap(rev_stats, upsell_rate, return_rate)

    output = flush_lines()

    if args.export:
        # Strip ANSI for the file
        import re
        clean = re.sub(r"\x1b\[[0-9;]*m", "", output)
        with open("analytics_report.txt", "w", encoding="utf-8") as f:
            f.write(clean)
        print(f"\n  Report saved to analytics_report.txt")


if __name__ == "__main__":
    main()
