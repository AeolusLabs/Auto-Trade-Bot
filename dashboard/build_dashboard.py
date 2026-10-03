"""
Builds dashboard/auto-trade-bot.html: the Auto Trade Bot dashboard preview.

    python dashboard/build_dashboard.py

Reads the real H1 backtest trade list (for_partner/expected/expected_trades_gold_h1_3y.csv), computes the track-record
numbers (growth at 0.5% risk per trade compounded, monthly returns, statistics, weekday/hour splits) and injects them
into dashboard_template.html. Live account, forward test and control panels in the page are labelled example data.
Pure Python, no network.
"""
import csv
import json
import os
import statistics as st
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "for_partner", "expected", "expected_trades_gold_h1_3y.csv")
RISK = 0.005   # fraction of the account risked per trade (matches code/config.py RISK_PCT = 0.5)


def parse(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M")


def build():
    rows = list(csv.DictReader(open(SRC, newline="")))
    T = [dict(fill=parse(r["fill"]), exit=parse(r["exit_exec"]), side=r["side"], R=float(r["R"]),
              stop=r["reason"].startswith("STOP")) for r in rows]
    eq = pk = 1.0
    mdd = cum = pkr = mddr = 0.0
    series = []
    for t in T:
        eq *= 1 + RISK * t["R"]
        pk = max(pk, eq)
        mdd = max(mdd, (pk - eq) / pk)
        cum += t["R"]
        pkr = max(pkr, cum)
        mddr = max(mddr, pkr - cum)
        series.append([t["exit"].strftime("%Y-%m-%d"), round((eq - 1) * 100, 2), round(cum, 2), round(-(pk - eq) / pk * 100, 2)])
    R = [t["R"] for t in T]
    W = [r for r in R if r > 0]
    L = [r for r in R if r <= 0]

    def streak(cond):
        best = cur = 0
        for r in R:
            cur = cur + 1 if cond(r) else 0
            best = max(best, cur)
        return best

    hold = [(t["exit"] - t["fill"]).total_seconds() / 3600 for t in T]
    longs = [t for t in T if t["side"] == "buy"]
    shorts = [t for t in T if t["side"] == "sell"]
    wk = [[0.0, 0] for _ in range(7)]
    hr = [[0.0, 0] for _ in range(24)]
    for t in T:
        wk[t["fill"].weekday()][0] += t["R"]
        wk[t["fill"].weekday()][1] += 1
        hr[t["fill"].hour][0] += t["R"]
        hr[t["fill"].hour][1] += 1
    mon = {}
    for t in T:
        k = (t["exit"].year, t["exit"].month)
        m = mon.setdefault(k, [1.0, 0, 0.0])
        m[0] *= 1 + RISK * t["R"]
        m[1] += 1
        m[2] += t["R"]
    grid = {}
    for y in sorted({k[0] for k in mon}):
        row, prod, n = [None] * 12, 1.0, 0
        for mth in range(1, 13):
            if (y, mth) in mon:
                v = mon[(y, mth)]
                row[mth - 1] = [round((v[0] - 1) * 100, 2), v[1], round(v[2], 2)]
                prod *= v[0]
                n += v[1]
        grid[y] = dict(m=row, ytd=round((prod - 1) * 100, 2), n=n)
    pct = lambda ts: round(sum(1 for t in ts if t["R"] > 0) / len(ts) * 100, 1)
    S = dict(n=len(T), wins=len(W), winp=round(len(W) / len(T) * 100, 1), avgW=round(st.mean(W), 2), avgL=round(st.mean(L), 2),
             pf=round(sum(W) / -sum(L), 2), exp=round(st.mean(R), 3), sd=round(st.pstdev(R), 2), totR=round(sum(R), 1),
             gain=round((eq - 1) * 100, 1), mdd=round(mdd * 100, 1), mddR=round(mddr, 1), best=round(max(R), 2), worst=round(min(R), 2),
             sW=streak(lambda r: r > 0), sL=streak(lambda r: r <= 0), holdAvg=round(st.mean(hold), 1), holdMed=round(st.median(hold), 1),
             longN=len(longs), longWin=pct(longs), longR=round(sum(t["R"] for t in longs), 1),
             shortN=len(shorts), shortWin=pct(shorts), shortR=round(sum(t["R"] for t in shorts), 1),
             stopPct=round(sum(1 for t in T if t["stop"]) / len(T) * 100, 1), first=T[0]["fill"].strftime("%Y-%m-%d"),
             last=T[-1]["exit"].strftime("%Y-%m-%d"), perWeek=round(len(T) / ((T[-1]["exit"] - T[0]["fill"]).days / 7), 1))
    trades = [[t["fill"].strftime("%Y-%m-%d %H:%M"), t["exit"].strftime("%Y-%m-%d %H:%M"), 0 if t["side"] == "buy" else 1,
               round(t["R"], 2), 0 if t["stop"] else 1] for t in T]
    return dict(S=S, series=series, grid=grid, wk=[[round(a, 1), b] for a, b in wk], hr=[[round(a, 1), b] for a, b in hr], trades=trades)


if __name__ == "__main__":
    data = json.dumps(build(), separators=(",", ":"))
    tpl = open(os.path.join(HERE, "dashboard_template.html"), encoding="utf-8").read()
    out = os.path.join(HERE, "auto-trade-bot.html")
    open(out, "w", encoding="utf-8").write(tpl.replace("__DATA__", data))
    print("wrote", out)
