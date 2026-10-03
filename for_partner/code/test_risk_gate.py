"""Unit checks for risk_gate.py (no MT5 needed):  python code/test_risk_gate.py"""
import os
import sys
import tempfile
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from risk_gate import RiskGate  # noqa: E402

CFG = SimpleNamespace(DAILY_LOSS_PCT=5.0, MAX_DD_PCT=12.5, MAX_OPEN_RISK_PCT=1.5, STALE_TICK_SECONDS=300)
DAY1, DAY2 = 1_790_000_000, 1_790_000_000 + 86400


def gate():
    d = tempfile.mkdtemp()
    logs = []
    g = RiskGate(CFG, os.path.join(d, "s.json"), os.path.join(d, "HALT"), os.path.join(d, "KILL"), log=lambda *a: logs.append(a))
    return g, d, logs


def ok(g, **kw):
    a = dict(equity=10000, open_risk=0, new_risk=50, tick_age_s=5, trade_allowed=True, connected=True)
    a.update(kw)
    return g.allow_entry(**a)


def test_happy_path():
    g, _, _ = gate()
    g.update(10000, DAY1)
    assert ok(g)[0]


def test_daily_loss_trips_and_blocks():
    g, d, _ = gate()
    g.update(10000, DAY1)
    g.update(9600, DAY1)
    assert g.halted() is None
    g.update(9490, DAY1)   # -5.1%
    assert g.halted() and "daily loss" in g.halted()
    assert not ok(g, equity=9490)[0]


def test_new_day_resets_daily_but_not_drawdown():
    g, _, _ = gate()
    g.update(10000, DAY1)
    g.update(9700, DAY1)
    g.update(9700, DAY2)   # new day: day start = 9700
    g.update(9300, DAY2)   # -4.1% today, -7% from high-water
    assert g.halted() is None
    g.update(8700, DAY2)   # 9700 -> 8700 = -10.3% today: daily cap trips
    assert g.halted()


def test_drawdown_trips_across_days():
    g, _, _ = gate()
    t = DAY1
    eq = 10000
    g.update(eq, t)
    for _ in range(6):    # lose ~2.4%/day: never trips the daily cap, drawdown eventually does
        t += 86400
        g.update(eq, t)
        eq *= 0.976
        g.update(eq, t)
        if g.halted():
            break
    assert g.halted() and "drawdown" in g.halted()


def test_human_reenable_rebaselines():
    g, d, _ = gate()
    g.update(10000, DAY1)
    g.update(9000, DAY1)
    assert g.halted()
    os.remove(os.path.join(d, "HALT"))
    g.update(9000, DAY1)
    assert g.halted() is None
    assert ok(g, equity=9000)[0]
    g.update(8900, DAY1)   # small loss after re-baseline must not re-trip
    assert g.halted() is None


def test_state_survives_restart():
    g, d, _ = gate()
    g.update(10000, DAY1)
    g.update(9800, DAY1)
    g2 = RiskGate(CFG, os.path.join(d, "s.json"), os.path.join(d, "HALT"), os.path.join(d, "KILL"))
    g2.update(9800, DAY1)
    g2.update(9400, DAY1)   # -6% vs day start 10000 -> must trip even after restart
    assert g2.halted()


def test_kill_file():
    g, d, _ = gate()
    g.update(10000, DAY1)
    open(os.path.join(d, "KILL"), "w").close()
    assert not ok(g)[0]


def test_open_risk_cap():
    g, _, _ = gate()
    g.update(10000, DAY1)
    assert ok(g, open_risk=100, new_risk=50)[0]       # 150 == 1.5% cap
    assert not ok(g, open_risk=101, new_risk=50)[0]


def test_connectivity_and_stale_quote_fail_closed():
    g, _, _ = gate()
    g.update(10000, DAY1)
    assert not ok(g, connected=False)[0]
    assert not ok(g, trade_allowed=False)[0]
    assert not ok(g, tick_age_s=301)[0]
    assert not ok(g, tick_age_s=None)[0]
    assert not ok(g, equity=0)[0]


if __name__ == "__main__":
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            n += 1
            print("ok ", name)
    print(f"{n} passed")
