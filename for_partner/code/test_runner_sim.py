"""
Simulated-broker checks for live_runner.py: python code/test_runner_sim.py
Replaces the MetaTrader5 module with a tiny fake, so the order-handling paths (placing, risk cap, guard, halt, kill) run
without MT5. This is NOT a substitute for the demo forward test: it proves our logic, not the broker's behaviour.
"""
import os
import shutil
import sys
import tempfile
import time
import types
from types import SimpleNamespace as NS

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# ---------------------------------------------------------------- fake MetaTrader5
FAKE = types.ModuleType("MetaTrader5")
for i, n in enumerate(["TRADE_ACTION_PENDING", "TRADE_ACTION_REMOVE", "TRADE_ACTION_DEAL", "ORDER_TYPE_SELL_LIMIT", "ORDER_TYPE_BUY_LIMIT",
                       "ORDER_TYPE_BUY", "ORDER_TYPE_SELL", "ORDER_TIME_GTC", "ORDER_FILLING_FOK", "ORDER_FILLING_IOC",
                       "ORDER_FILLING_RETURN", "TRADE_RETCODE_DONE", "POSITION_TYPE_SELL", "POSITION_TYPE_BUY", "TIMEFRAME_M3",
                       "ACCOUNT_TRADE_MODE_DEMO"]):
    setattr(FAKE, n, i + 1)
W = NS(orders=[], positions=[], next=100, equity=10000.0, balance=10000.0, ticks_age=5, connected=True, allowed=True)


def now_broker():
    return time.time() + 3 * 3600   # broker clock = UTC+3, matching config.SERVER_UTC_OFFSET_HOURS


FAKE.initialize = lambda: True
FAKE.symbol_select = lambda *a: True
FAKE.account_info = lambda: NS(login=1, trade_mode=FAKE.ACCOUNT_TRADE_MODE_DEMO, balance=W.balance, equity=W.equity)
FAKE.symbol_info = lambda s: NS(digits=2, point=0.01, trade_stops_level=10, trade_tick_size=0.01, trade_tick_value=1.0,
                                volume_step=0.01, volume_min=0.01, volume_max=100.0, filling_mode=3)
FAKE.symbol_info_tick = lambda s: NS(bid=4000.00, ask=4000.14, time=int(now_broker() - W.ticks_age))
FAKE.terminal_info = lambda: NS(trade_allowed=W.allowed, connected=W.connected)
FAKE.orders_get = lambda symbol=None: list(W.orders)
FAKE.positions_get = lambda symbol=None: list(W.positions)
FAKE.shutdown = lambda: None
FAKE.last_error = lambda: (0, "")


def order_send(req):
    if req["action"] == FAKE.TRADE_ACTION_PENDING:
        W.next += 1
        W.orders.append(NS(ticket=W.next, type=req["type"], price_open=req["price"], sl=req["sl"], volume_initial=req["volume"],
                           magic=req["magic"], time_setup=int(now_broker())))
        return NS(retcode=FAKE.TRADE_RETCODE_DONE, order=W.next, comment="")
    if req["action"] == FAKE.TRADE_ACTION_REMOVE:
        W.orders[:] = [o for o in W.orders if o.ticket != req["order"]]
        return NS(retcode=FAKE.TRADE_RETCODE_DONE, comment="")
    if req["action"] == FAKE.TRADE_ACTION_DEAL:
        W.positions[:] = [p for p in W.positions if p.ticket != req["position"]]
        return NS(retcode=FAKE.TRADE_RETCODE_DONE, comment="")


FAKE.order_send = order_send
sys.modules["MetaTrader5"] = FAKE

import config as C  # noqa: E402
import live_runner as L  # noqa: E402
from risk_gate import RiskGate  # noqa: E402

TMP = tempfile.mkdtemp()
L.LOGS = TMP
L.TRADE = True
SI = FAKE.symbol_info("x")


def fresh():
    W.orders.clear()
    W.positions.clear()
    W.equity = W.balance = 10000.0
    W.ticks_age, W.connected, W.allowed = 5, True, True
    for f in ("HALT", "risk_state.json", "KILL"):
        try:
            os.remove(os.path.join(TMP, f))
        except OSError:
            pass
    L.GATE = RiskGate(C, os.path.join(TMP, "risk_state.json"), os.path.join(TMP, "HALT"), os.path.join(TMP, "KILL"), log=L.say)
    L.GATE.update(W.equity, time.time())


def want(entry, sl, side="sell"):
    return dict(side=side, entry=entry, sl=sl, anchor="2026-10-02 10:00", kind="primary")


def place(entry, sl, side="sell"):
    L.place(want(entry, sl, side), SI, FAKE.symbol_info_tick("x"), FAKE.account_info())


def pos(ticket, t, price=4010.0, sl=4015.0, side=None):
    W.positions.append(NS(ticket=ticket, type=side or FAKE.POSITION_TYPE_SELL, price_open=price, sl=sl, volume=0.1, magic=C.MAGIC, time=t))


def test_order_has_sl_and_correct_risk():
    fresh()
    place(4010.0, 4015.0)
    assert len(W.orders) == 1
    o = W.orders[0]
    assert o.sl == 4015.0 and o.type == FAKE.ORDER_TYPE_SELL_LIMIT
    risk = L.money_at_stop(o.price_open, o.sl, o.volume_initial, SI)
    assert 40 <= risk <= 50.1, risk   # 0.5% of 10000 = 50, lots floored to the step


def test_open_risk_cap_stops_the_fourth_order():
    fresh()
    for k in range(5):
        place(4010.0 + k, 4015.0 + k)   # each risks ~$50; cap is 1.5% = $150
    n = len(W.orders)
    assert n == 3, n


def test_guard_cancels_pendings_once_a_position_exists():
    fresh()
    place(4010.0, 4015.0)
    place(4020.0, 4025.0)
    assert len(W.orders) == 2
    pos(1, time.time())
    L.guard()
    assert len(W.orders) == 0 and len(W.positions) == 1


def test_guard_closes_extra_positions_newest_first():
    fresh()
    pos(1, 1000)
    pos(2, 2000)
    pos(3, 3000)
    L.guard()
    assert [p.ticket for p in W.positions] == [1]


def test_halt_blocks_new_orders_and_clears_pendings():
    fresh()
    place(4010.0, 4015.0)
    W.equity = 9400.0   # -6% on the day
    L.guard()
    assert L.GATE.halted() and len(W.orders) == 0
    place(4010.0, 4015.0)
    assert len(W.orders) == 0


def test_kill_file_blocks_and_clears():
    fresh()
    place(4010.0, 4015.0)
    open(os.path.join(TMP, "KILL"), "w").close()
    L.guard()
    assert len(W.orders) == 0
    place(4010.0, 4015.0)
    assert len(W.orders) == 0


def test_stale_quote_and_algo_off_block_entries():
    fresh()
    W.ticks_age = 1000
    place(4010.0, 4015.0)
    assert len(W.orders) == 0
    W.ticks_age = 5
    W.allowed = False
    place(4010.0, 4015.0)
    assert len(W.orders) == 0


def test_old_pending_orders_are_cancelled():
    fresh()
    place(4010.0, 4015.0)
    W.orders[0].time_setup -= int((C.MAX_PENDING_AGE_HOURS + 1) * 3600)
    L.guard()
    assert len(W.orders) == 0


def last_log():
    with open(os.path.join(TMP, "decisions.csv")) as f:
        return f.read()


def test_trade_cap_refuses_with_a_plain_reason():
    fresh()
    old = C.MAX_TRADES_PER_DAY
    C.MAX_TRADES_PER_DAY = 1
    try:
        L.GATE.note_positions([(9, 0.1)], time.time())
        place(4010.0, 4015.0)
        assert len(W.orders) == 0
        assert "code said no: trade_cap" in last_log()
    finally:
        C.MAX_TRADES_PER_DAY = old


def test_new_positions_are_counted_once_by_the_guard():
    fresh()
    pos(1, time.time())
    L.guard()
    L.guard()
    assert L.GATE.s["trades_today"] == 1


def test_log_lines_are_redacted():
    fresh()
    L.say("probe", "password=hunter2 from 203.0.113.9 price 4172.31")
    text = last_log()
    assert "hunter2" not in text and "203.0.113.9" not in text and "4172.31" in text


if __name__ == "__main__":
    import io
    import contextlib
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            with contextlib.redirect_stdout(io.StringIO()):
                fn()
            n += 1
            print("ok ", name)
    print(f"{n} passed")
    shutil.rmtree(TMP, ignore_errors=True)
