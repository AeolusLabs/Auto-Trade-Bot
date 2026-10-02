"""
Re-run SME BASELINE v1 on the data in this folder and check you get the same numbers we did.

    python code/backtest.py

Expected: XAU M3 Sep 2026 -> 180 trades, +52.4R, PF 1.54 | Gold H1 3 years -> 437 trades, +117.1R, PF 1.51
Writes the trade lists to backtest_output/ (compare with expected/).
"""
import csv
import hashlib
import os
import statistics
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
from engine import run  # noqa: E402
from bias import session_bias  # noqa: E402


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()[:12]


def load_m3(path):
    with open(path, newline="") as f:
        return [dict(t=r["broker"], o=float(r["o"]), h=float(r["h"]), l=float(r["l"]), c=float(r["c"]), sp=int(r["spread"]))
                for r in csv.DictReader(f)]


def load_h1(path, spread_pts=20):
    with open(path, newline="") as f:
        return [dict(t=datetime.fromtimestamp(int(r["timestamp"]) / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M"),
                     o=float(r["open"]), h=float(r["high"]), l=float(r["low"]), c=float(r["close"]), sp=spread_pts)
                for r in csv.DictReader(f)]


def metrics(trades):
    rs = [t["r"] for t in trades]
    if not rs:
        return dict(n=0, avg=0.0, tot=0.0, pf=0.0)
    gl = -sum(x for x in rs if x <= 0)
    return dict(n=len(rs), avg=statistics.mean(rs), tot=sum(rs), pf=(sum(x for x in rs if x > 0) / gl if gl else 9.0))


def go(name, path, bars, offset, expected_sha, expected, split):
    bias, _ = session_bias(bars, offset)
    log, trades, blocks, op = run(bars, require_counter=False, bias=bias, beta=False)
    m = metrics(trades)
    os.makedirs(os.path.join(ROOT, "backtest_output"), exist_ok=True)
    out = os.path.join(ROOT, "backtest_output", f"trades_{name}.csv")
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["fill", "side", "kind", "entry", "stop", "exit_exec", "exit_px", "reason", "R"])
        for t in trades:
            w.writerow([bars[t["fill"]]["t"], t["side"], t["kind"], t["entry"], t["sl"], bars[t["exit"]]["t"], t["px"], t["reason"], round(t["r"], 3)])
    got = sha(path)
    print(f"\n{name}\n  data sha {got}  {'OK (matches)' if got == expected_sha else 'DIFFERENT DATA FILE - numbers will differ'}")
    print(f"  trades {m['n']}   avg {m['avg']:+.3f}R   total {m['tot']:+.1f}R   PF {m['pf']:.2f}")
    ok = m["n"] == expected[0] and abs(m["tot"] - expected[1]) < 0.15
    print(f"  expected {expected[0]} trades / {expected[1]:+.1f}R  ->  {'REPRODUCED' if ok else 'DOES NOT MATCH - something is different on this machine'}")
    for label, sel in split:
        s = metrics([t for t in trades if sel(bars[t["fill"]]["t"])])
        print(f"    {label:14} n={s['n']:4}  total {s['tot']:+7.1f}R  avg {s['avg']:+.3f}R  PF {s['pf']:.2f}")
    return ok


if __name__ == "__main__":
    print("SME BASELINE v1 - backtest reproduction")
    a = go("xau_m3_sep2026", os.path.join(ROOT, "data", "XAUUSDr_M3_2026-09-01_to_now.csv"),
           load_m3(os.path.join(ROOT, "data", "XAUUSDr_M3_2026-09-01_to_now.csv")), 3, "4fbc35b85270", (180, 52.4),
           [("1-15 Sep", lambda t: t < "2026-09-16"), ("16 Sep - 1 Oct", lambda t: t >= "2026-09-16")])
    b = go("gold_h1_3y", os.path.join(ROOT, "data", "xauusd_h1_dukascopy_3y.csv"),
           load_h1(os.path.join(ROOT, "data", "xauusd_h1_dukascopy_3y.csv")), 0, "810f76854508", (437, 117.1),
           [(str(y), (lambda yy: (lambda t: t.startswith(str(yy))))(y)) for y in (2023, 2024, 2025, 2026)])
    print("\nRESULT:", "all reproduced - the setup on this machine is correct" if a and b else "NOT reproduced - tell us what you see")
