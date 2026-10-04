"""Unit checks for risk_gate.py (no MT5 needed):  python code/test_risk_gate.py"""
import os
import sys
import tempfile
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from risk_gate import RiskGate  # noqa: E402

CFG = SimpleNamespace(DAILY_LOSS_PCT=5.0, MAX_DD_PCT=12.5, MAX_OPEN_RISK_PCT=1.5, STALE_TICK_SECONDS=300,
                      RETIRE_AT_PCT=80, MAX_TRADES_PER_DAY=3, COST_BUDGET_PCT_DAY=1.0, COOLDOWN_MINUTES=0)
DAY1, DAY2 = 1_790_000_000, 1_790_000_000 + 86400


ALERTS = []


def gate(cfg=CFG):
    d = tempfile.mkdtemp()
    logs = []
    ALERTS.clear()
    g = RiskGate(cfg, os.path.join(d, "s.json"), os.path.join(d, "HALT"), os.path.join(d, "KILL"), log=lambda *a: logs.append(a),
                 alert=lambda t, m: ALERTS.append((t, m)))
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


def test_retire_line_stops_for_good_until_a_person_deletes_the_file():
    g, d, _ = gate()
    g.update(10000, DAY1)
    g.update(8100, DAY1 + 86400 * 3)    # -19%: above the 80% line (also trips the 12.5% drawdown halt)
    assert not g.retired() and g.halted()
    g.update(8000, DAY1 + 86400 * 3)    # 80% of 10000: retired
    assert g.retired() and not ok(g, equity=8000)[0]
    assert any(a[0] == "RISK RETIRED" for a in ALERTS)
    g.update(9000, DAY1 + 86400 * 4)    # equity recovering must NOT lift it
    assert g.retired()
    os.remove(os.path.join(d, "RETIRED"))
    os.remove(os.path.join(d, "HALT"))                  # the drawdown halt tripped on the way down too: both need a person
    g.update(9000, DAY1 + 86400 * 4)
    assert not g.retired() and ok(g, equity=9000)[0]


def test_trade_cap_blocks_and_resets_at_midnight_utc_and_alerts_once():
    g, _, _ = gate()
    g.update(10000, DAY1)
    g.note_positions([(1, 0.1), (2, 0.1)], DAY1)
    assert ok(g)[0]
    g.note_positions([(3, 0.1), (3, 0.1)], DAY1)      # the same ticket twice counts once
    assert g.s["trades_today"] == 3
    allowed, why = ok(g)
    assert not allowed and why.startswith("trade_cap")
    assert [a[0] for a in ALERTS].count("TRADE CAP") == 1
    g.note_positions([(3, 0.1)], DAY1)
    assert [a[0] for a in ALERTS].count("TRADE CAP") == 1
    g.update(10000, DAY2)                                # new UTC day
    assert ok(g)[0] and g.s["trades_today"] == 0


def test_cost_budget_blocks_when_the_days_spread_would_exceed_it():
    g, _, _ = gate()
    g.update(10000, DAY1)                                # budget = 1% of 10000 = 100
    g.note_positions([(1, 60.0)], DAY1)
    assert ok(g, est_cost=39.0)[0]
    allowed, why = ok(g, est_cost=41.0)
    assert not allowed and why.startswith("cost_budget")


def test_cooldown_blocks_until_it_expires():
    cfg = SimpleNamespace(**dict(vars(CFG), COOLDOWN_MINUTES=10))
    g, _, _ = gate(cfg)
    g.update(10000, DAY1)
    g.note_positions([(1, 0.1)], DAY1)
    allowed, why = ok(g, now_ts=DAY1 + 120)
    assert not allowed and why.startswith("cooldown")
    assert ok(g, now_ts=DAY1 + 601)[0]


def test_state_with_the_new_fields_survives_a_restart():
    g, d, _ = gate()
    g.update(10000, DAY1)
    g.note_positions([(1, 5.0)], DAY1)
    g2 = RiskGate(CFG, os.path.join(d, "s.json"), os.path.join(d, "HALT"), os.path.join(d, "KILL"))
    assert g2.s["trades_today"] == 1 and g2.s["start_equity"] == 10000


if __name__ == "__main__":
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            n += 1
            print("ok ", name)
    print(f"{n} passed")
