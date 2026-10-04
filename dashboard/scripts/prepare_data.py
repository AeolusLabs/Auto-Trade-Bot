"""
Prepare the data the dashboard embeds, from files that already live in this repo. Pure Python, no network.

    python dashboard/scripts/prepare_data.py

Reads
    for_partner/data/xauusd_h1_dukascopy_3y.csv           gold H1 candles (Dukascopy), the research engine's price data
    for_partner/expected/expected_trades_gold_h1_3y.csv   the SME Baseline v1 trade list the backtest produces

Writes (to dashboard/src/data/)
    bars.json        compact candles for the research engine (time deltas in hours, prices to 2 decimals)
    data.json        track-record numbers for the SME Baseline: growth, monthly returns, statistics, weekday and hour splits, trade history
    sme_rows.json    the SME trade list as [open hour, close hour, side (0 buy, 1 sell), R, stop distance]
    seed_agents.json the four starter agents (Ridge is real; Scout, Dusk and Ember are examples)

Then run `node dashboard/scripts/build_seed.js` to produce seed.json, and `python dashboard/build.py` to build the page.
"""
import csv
import datetime
import json
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "dashboard", "src", "data")
H1_CSV = os.path.join(ROOT, "for_partner", "data", "xauusd_h1_dukascopy_3y.csv")
TRADES_CSV = os.path.join(ROOT, "for_partner", "expected", "expected_trades_gold_h1_3y.csv")
RISK = 0.005   # fraction of the account risked per trade (matches for_partner/code/config.py RISK_PCT = 0.5)


def hours(s):
    d = datetime.datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=datetime.timezone.utc)
    return int(d.timestamp() // 3600)


def write(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    print("wrote %-18s %7.1f KB" % (name, os.path.getsize(path) / 1024))


def bars():
    rows = list(csv.DictReader(open(H1_CSV, newline="")))
    t = [int(r["timestamp"]) // 3600000 for r in rows]
    assert all(t[i] < t[i + 1] for i in range(len(t) - 1)), "candles must be in time order"
    r2 = lambda k: [round(float(r[k]), 2) for r in rows]
    write("bars.json", {"t0": t[0], "dt": [0] + [t[i] - t[i - 1] for i in range(1, len(t))], "o": r2("open"), "h": r2("high"), "l": r2("low"), "c": r2("close")})


def sme_rows():
    rows = list(csv.DictReader(open(TRADES_CSV, newline="")))
    write("sme_rows.json", [[hours(r["fill"]), hours(r["exit_exec"]), 0 if r["side"] == "buy" else 1, round(float(r["R"]), 4),
                             round(abs(float(r["entry"]) - float(r["stop"])), 4)] for r in rows])


def track_record():
    parse = lambda s: datetime.datetime.strptime(s, "%Y-%m-%d %H:%M")
    T = [dict(fill=parse(r["fill"]), exit=parse(r["exit_exec"]), side=r["side"], R=float(r["R"]), stop=r["reason"].startswith("STOP"))
         for r in csv.DictReader(open(TRADES_CSV, newline=""))]
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
    write("data.json", dict(S=S, series=series, grid=grid, wk=[[round(a, 1), b] for a, b in wk], hr=[[round(a, 1), b] for a, b in hr], trades=trades))


def agents():
    t0 = int(datetime.datetime(2026, 10, 3, 12, tzinfo=datetime.timezone.utc).timestamp() * 1000)

    def agent(i, id, name, tag, style, inst, hyp, real=False, sid=None):
        return {"id": id, "name": name, "tagline": tag, "style": style, "instruments": inst, "art": id, "hue": None, "status": "active", "real": real,
                "example": not real, "order": t0 + i, "createdAt": t0, "strategyId": sid, "strategy": {"magic": 26100201 + i, "hypothesis": hyp}}
    write("seed_agents.json", {"agents": [
        agent(0, "ridge", "Ridge", "the patient tracker", "Order blocks", ["XAUUSD"], "", True, "sme1"),
        agent(1, "scout", "Scout", "the fast lookout", "Scalper", ["XAUUSD", "EURUSD"], "Example agent slot: fast momentum entries with a tight spread filter."),
        agent(2, "dusk", "Dusk", "the night stalker", "Fade", ["EURUSD", "GBPUSD"], "Example agent slot: fades stretched moves in the quiet Asian session."),
        agent(3, "ember", "Ember", "the long-haul runner", "Trend", ["XAUUSD", "GBPUSD"], "Example agent slot: rides multi-hour trends with wide stops and small size.")],
        "pack": {"rules": None}})


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    bars()
    sme_rows()
    track_record()
    agents()
