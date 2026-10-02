"""
Forward-test report: reads the demo account's closed trades made by the runner (its MAGIC number) and compares them
with what the backtest led us to expect.

    python code/forward_report.py

Writes forward_results.csv - send that file (plus the logs/ folder) back to us.
"""
import csv
import os
import statistics
import sys
from datetime import datetime, timedelta, timezone

import MetaTrader5 as mt5

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import config as C  # noqa: E402


def fmt(ep):
    return datetime.fromtimestamp(ep, timezone.utc).strftime("%Y-%m-%d %H:%M")


def main():
    if not mt5.initialize():
        raise SystemExit(f"Cannot connect to MetaTrader 5: {mt5.last_error()}")
    deals = mt5.history_deals_get(datetime(2020, 1, 1), datetime.now() + timedelta(days=2)) or []
    deals = [d for d in deals if d.magic == C.MAGIC and d.symbol == C.SYMBOL]
    risk = {}
    op = os.path.join(ROOT, "logs", "orders.csv")
    if os.path.exists(op):
        for r in csv.DictReader(open(op)):
            risk[int(r["ticket"])] = float(r["risk_money"])
    by = {}
    for d in deals:
        by.setdefault(d.position_id, []).append(d)
    rows = []
    for pid, ds in by.items():
        ins = [d for d in ds if d.entry == mt5.DEAL_ENTRY_IN]
        outs = [d for d in ds if d.entry == mt5.DEAL_ENTRY_OUT]
        if not ins or not outs:
            continue
        net = sum(d.profit + d.commission + d.swap + getattr(d, "fee", 0.0) for d in ds)
        rk = risk.get(pid)
        rows.append(dict(position=pid, side="sell" if ins[0].type == mt5.DEAL_TYPE_SELL else "buy", opened=fmt(ins[0].time),
                         closed=fmt(outs[-1].time), entry=ins[0].price, exit=outs[-1].price, lots=ins[0].volume,
                         net_money=round(net, 2), risk_money=rk, R=(round(net / rk, 3) if rk else None)))
    rows.sort(key=lambda r: r["opened"])
    out = os.path.join(ROOT, "forward_results.csv")
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["position", "side", "opened", "closed", "entry", "exit", "lots", "net_money", "risk_money", "R"])
        w.writeheader()
        for r in rows:
            w.writerow({k: r[k] for k in w.fieldnames})
    print(f"closed trades by the runner: {len(rows)}   -> {out}")
    rs = [r["R"] for r in rows if r["R"] is not None]
    if not rs:
        print("No closed trades with a known risk yet (needs logs/orders.csv from a --trade run). Keep it running.")
        return
    wins = [x for x in rs if x > 0]
    losses = [x for x in rs if x <= 0]
    gl = -sum(losses)
    eq = peak = dd = 0.0
    streak = worst = 0
    for x in rs:
        eq += x
        peak = max(peak, eq)
        dd = max(dd, peak - eq)
        streak = streak + 1 if x <= 0 else 0
        worst = max(worst, streak)
    print(f"\n                    demo (this account)      backtest said (M3 month / H1 3 years)")
    print(f"trades              {len(rs):<24} 180 / 437")
    print(f"win rate            {len(wins) / len(rs) * 100:<23.0f}% 36% / 35%")
    print(f"average win         {statistics.mean(wins) if wins else 0:<+24.2f} +2.3R / +2.3R")
    print(f"average loss        {statistics.mean(losses) if losses else 0:<+24.2f} -0.8R / -0.8R")
    print(f"average per trade   {statistics.mean(rs):<+24.3f} +0.29R / +0.27R")
    print(f"profit factor       {sum(wins) / gl if gl else float('inf'):<24.2f} 1.54 / 1.51")
    print(f"total R             {sum(rs):<+24.1f}")
    print(f"worst dip (R)       {dd:<24.1f} 13 / 12")
    print(f"longest loss streak {worst:<24} 11 / 14")
    print("\nJudge it after at least 100 trades / 4 weeks. Fewer than that is noise.")
    mt5.shutdown()


if __name__ == "__main__":
    main()
