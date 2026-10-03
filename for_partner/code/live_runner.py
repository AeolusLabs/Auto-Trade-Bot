"""
SME BASELINE v1 - DEMO auto-trader.   READ START_HERE.md FIRST.

  *** DEMO ACCOUNTS ONLY. ***  The runner checks the account type and REFUSES to send any order on a real account.
  Default mode is DRY RUN: it reads the market and prints / logs what it WOULD do. Nothing is sent.

    python code/live_runner.py            # dry run (safe, sends nothing)
    python code/live_runner.py --once     # one cycle, then stop
    python code/live_runner.py --trade    # places pending limit orders - DEMO account only

What it does every time a new M3 candle CLOSES:
  1. replays the last WARMUP_BARS closed candles through the same engine used in the backtest (engine.py)
  2. works out the session bias for the NEXT candle (previous session's net move; sells only if bearish, buys only if bullish)
  3. places / cancels PENDING LIMIT orders so they match the engine's armed blocks (entry at the block's near edge,
     stop-loss at the far edge, lot size from RISK_PCT)
  4. if a position is open: closes it at market when the run flips against it (the exit rule); otherwise the stop-loss does the job
Every decision is written to logs/decisions.csv; every order to logs/orders.csv.
"""
import argparse
import csv
import json
import math
import os
import sys
import time
from datetime import datetime, timezone

import MetaTrader5 as mt5

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import config as C  # noqa: E402
from engine import run  # noqa: E402
from bias import session_bias, label  # noqa: E402
from risk_gate import RiskGate  # noqa: E402

LOGS = os.path.join(ROOT, "logs")
os.makedirs(LOGS, exist_ok=True)
TRADE = False   # set by --trade
GATE = None     # RiskGate, created in main()


def fmt(ep):
    return datetime.fromtimestamp(ep, timezone.utc).strftime("%Y-%m-%d %H:%M")


def say(event, detail=""):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"{now}  {event:14} {detail}", flush=True)
    path = os.path.join(LOGS, "decisions.csv")
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["time_utc", "event", "detail"])
        w.writerow([now, event, detail])


def require_demo():
    """Hard safety: no order of any kind leaves this program unless the account is a DEMO account."""
    ai = mt5.account_info()
    if ai is None:
        raise SystemExit("REFUSED: cannot read the account.")
    if ai.trade_mode != mt5.ACCOUNT_TRADE_MODE_DEMO:
        raise SystemExit("REFUSED: this account is NOT a demo account. This program only trades on DEMO accounts.")
    return ai


def get_bars(n):
    r = mt5.copy_rates_from_pos(C.SYMBOL, mt5.TIMEFRAME_M3, 0, n + 1)
    if r is None or len(r) < 200:
        return None
    r = r[:-1]   # the last element is the still-forming candle - never used
    return [dict(ep=int(x["time"]), t=fmt(int(x["time"])), o=float(x["open"]), h=float(x["high"]), l=float(x["low"]),
                 c=float(x["close"]), sp=int(x["spread"])) for x in r]


def compute(bars):
    """Engine state after the last closed candle + the bias that applies to the NEXT candle."""
    nxt = bars[-1]["ep"] + 180
    for _ in range(40):   # the daily-break hour has no session: look ahead to the next candle that will really trade,
        if label((int(fmt(nxt)[11:13]) - C.SERVER_UTC_OFFSET_HOURS) % 24) is not None:   # so orders are NOT cancelled
            break                                                                        # every night at the break
        nxt += 180
    last = bars[-1]["c"]
    dummy = dict(ep=nxt, t=fmt(nxt), o=last, h=last, l=last, c=last, sp=0)
    bias_all, _ = session_bias(bars + [dummy], C.SERVER_UTC_OFFSET_HOURS)
    state = {}
    run(bars, require_counter=False, bias=bias_all[:-1], beta=False, state_out=state)
    return state, bias_all[-1]


def money_at_stop(entry, sl, volume, si):
    """Money lost if the stop is hit."""
    return abs(entry - sl) / si.trade_tick_size * si.trade_tick_value * volume


def open_risk(si):
    """Money at stop of everything we hold: open positions + pending orders (stop-less positions count as unbounded)."""
    total = 0.0
    for p in mine_positions():
        total += money_at_stop(p.price_open, p.sl, p.volume, si) if p.sl else float("inf")
    for o in mine_orders():
        total += money_at_stop(o.price_open, o.sl, o.volume_initial, si) if o.sl else float("inf")
    return total


def lots_for(entry, sl, si, balance):
    risk_money = balance * C.RISK_PCT / 100.0
    ticks = abs(entry - sl) / si.trade_tick_size
    loss_per_lot = ticks * si.trade_tick_value
    if loss_per_lot <= 0:
        return None, risk_money
    lots = risk_money / loss_per_lot
    step = si.volume_step
    lots = math.floor(lots / step + 1e-9) * step
    lots = max(si.volume_min, min(lots, si.volume_max, C.MAX_LOTS))
    return round(lots, 2), risk_money


def filling(si):
    fm = si.filling_mode
    if fm & 1:
        return mt5.ORDER_FILLING_FOK
    if fm & 2:
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN


def mine_orders():
    return [o for o in (mt5.orders_get(symbol=C.SYMBOL) or []) if o.magic == C.MAGIC]


def mine_positions():
    return [p for p in (mt5.positions_get(symbol=C.SYMBOL) or []) if p.magic == C.MAGIC]


def key(side, price, sl, digits):
    return (side, round(price, digits), round(sl, digits))


def place(w, si, tick, ai):
    side, entry, sl = w["side"], round(w["entry"], si.digits), round(w["sl"], si.digits)
    stops = si.trade_stops_level * si.point
    if (tick.ask - tick.bid) / si.point > C.MAX_SPREAD_POINTS:
        return say("skip", f"{side} {entry}: spread too wide ({(tick.ask - tick.bid) / si.point:.0f} pts)")
    if side == "sell" and entry <= tick.bid + stops:
        return say("missed", f"sell limit {entry}: price already at/through the level (bid {tick.bid})")
    if side == "buy" and entry >= tick.ask - stops:
        return say("missed", f"buy limit {entry}: price already at/through the level (ask {tick.ask})")
    if abs(entry - sl) < stops:
        return say("skip", f"{side} {entry}: stop distance {abs(entry - sl):.2f} is inside the broker minimum {stops:.2f}")
    lots, risk_money = lots_for(entry, sl, si, min(ai.balance, ai.equity))   # equity too: sizing never grows on floating profit
    if not lots:
        return say("skip", f"{side} {entry}: cannot size the order")
    actual = abs(entry - sl) / si.trade_tick_size * si.trade_tick_value * lots   # money lost if the stop is hit
    if actual > 1.5 * risk_money:
        return say("skip", f"{side} {entry}: even the smallest lot ({lots}) would risk {actual:.2f} against a target of {risk_money:.2f} "
                           f"- account too small for this stop (use a bigger demo balance or raise RISK_PCT)")
    risk_money = actual   # R in the forward report is measured against the REAL risk at the stop
    ti = mt5.terminal_info()
    tick_age = time.time() - (tick.time - C.SERVER_UTC_OFFSET_HOURS * 3600)
    allowed, why = GATE.allow_entry(min(ai.balance, ai.equity), open_risk(si), actual, tick_age,
                                    bool(ti and ti.trade_allowed), bool(ti and ti.connected))
    if not allowed:
        return say("GATE BLOCKED", f"{side} {entry}: {why}")
    comment = f"S1{side[0]}{w['anchor'][5:16].replace('-', '').replace(' ', '').replace(':', '')}"[:30]
    if not TRADE:
        return say("WOULD PLACE", f"{side} limit {entry} sl {sl} lots {lots} risk {risk_money:.2f} ({w['kind']}, block {w['anchor']})")
    require_demo()
    req = {"action": mt5.TRADE_ACTION_PENDING, "symbol": C.SYMBOL, "volume": lots,
           "type": mt5.ORDER_TYPE_SELL_LIMIT if side == "sell" else mt5.ORDER_TYPE_BUY_LIMIT,
           "price": entry, "sl": sl, "tp": 0.0, "deviation": C.DEVIATION, "magic": C.MAGIC, "comment": comment,
           "type_time": mt5.ORDER_TIME_GTC, "type_filling": mt5.ORDER_FILLING_RETURN}
    res = mt5.order_send(req)
    if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
        return say("order FAILED", f"{side} {entry}: {None if res is None else (res.retcode, res.comment)}")
    path = os.path.join(LOGS, "orders.csv")
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        wr = csv.writer(f)
        if new:
            wr.writerow(["ticket", "placed_utc", "side", "entry", "sl", "lots", "risk_money", "block", "kind"])
        wr.writerow([res.order, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), side, entry, sl, lots, round(risk_money, 2), w["anchor"], w["kind"]])
    say("PLACED", f"{side} limit {entry} sl {sl} lots {lots} risk {risk_money:.2f} ticket {res.order}")


def cancel(o, why=""):
    side = "sell" if o.type == mt5.ORDER_TYPE_SELL_LIMIT else "buy"
    if not TRADE:
        return say("WOULD CANCEL", f"{side} limit {o.price_open} (ticket {o.ticket}) {why}")
    require_demo()
    res = mt5.order_send({"action": mt5.TRADE_ACTION_REMOVE, "order": o.ticket})
    say("CANCELLED" if res is not None and res.retcode == mt5.TRADE_RETCODE_DONE else "cancel FAILED", f"{side} limit {o.price_open} ticket {o.ticket} {why}")


def close_position(p, si, why):
    sell = p.type == mt5.POSITION_TYPE_SELL
    if not TRADE:
        return say("WOULD CLOSE", f"{'sell' if sell else 'buy'} position {p.ticket}: {why}")
    require_demo()
    tick = mt5.symbol_info_tick(C.SYMBOL)
    req = {"action": mt5.TRADE_ACTION_DEAL, "symbol": C.SYMBOL, "volume": p.volume, "position": p.ticket,
           "type": mt5.ORDER_TYPE_BUY if sell else mt5.ORDER_TYPE_SELL, "price": tick.ask if sell else tick.bid,
           "deviation": C.DEVIATION, "magic": C.MAGIC, "comment": "SME exit", "type_time": mt5.ORDER_TIME_GTC,
           "type_filling": filling(si)}
    res = mt5.order_send(req)
    say("CLOSED" if res is not None and res.retcode == mt5.TRADE_RETCODE_DONE else "close FAILED",
        f"position {p.ticket}: {why}" + ("" if res is None else f" retcode {res.retcode}"))


def manage_position(bars, state, si):
    """Exit rule: close at market once the run has flipped AGAINST the trade on a candle after the one it filled on."""
    pos = mine_positions()
    if not pos:
        return False
    for p in pos:   # every position, not just the first: several limits can fill in one spike
        fill_idx = max((i for i, b in enumerate(bars) if b["ep"] <= p.time), default=None)
        sell = p.type == mt5.POSITION_TYPE_SELL
        against = 1 if sell else -1
        if fill_idx is not None and any(i > fill_idx and d == against for i, d in state["flips"]):
            close_position(p, si, "run flipped against the trade")
        else:
            say("holding", f"{'sell' if sell else 'buy'} position {p.ticket} @ {p.price_open} sl {p.sl}")
    return True


def guard():
    """Runs every POLL_SECONDS (not only on a new candle): the fast safety loop.
    - update the RiskGate with current equity (may trip a halt)
    - if halted/killed OR a position is open: cancel every pending order of ours at once (baseline rule: one position at a time,
      so resting limits must not survive a fill - waiting for the next candle close left a window for a second fill)
    - more than MAX_POSITIONS positions: close the newest extras (reduce-only)
    - cancel pending orders older than MAX_PENDING_AGE_HOURS"""
    ai = mt5.account_info()
    if ai is None:
        return
    GATE.update(ai.equity, time.time())
    si = mt5.symbol_info(C.SYMBOL)
    pos = mine_positions()
    stop_new = GATE.killed() or GATE.halted() is not None
    for o in mine_orders():
        old = time.time() - (o.time_setup - C.SERVER_UTC_OFFSET_HOURS * 3600) > C.MAX_PENDING_AGE_HOURS * 3600
        if stop_new or pos or old:
            cancel(o, "kill/halt" if stop_new else "position open" if pos else "older than MAX_PENDING_AGE_HOURS")
    for p in sorted(pos, key=lambda x: x.time)[C.MAX_POSITIONS:]:
        close_position(p, si, f"more than {C.MAX_POSITIONS} position(s) open (reduce-only)")


def detect_offset():
    """Broker server time minus UTC, read from a fresh tick. None if the tick is stale / implausible (market closed)."""
    tick = mt5.symbol_info_tick(C.SYMBOL)
    if tick is None:
        return None
    off = round((tick.time - time.time()) / 3600)
    if -12 <= off <= 14 and abs((tick.time - off * 3600) - time.time()) < 900:
        return off
    return None


def cycle(bars):
    si = mt5.symbol_info(C.SYMBOL)
    tick = mt5.symbol_info_tick(C.SYMBOL)
    ai = mt5.account_info()
    off = detect_offset()
    if off is not None and off != C.SERVER_UTC_OFFSET_HOURS:
        say("OFFSET MISMATCH", f"broker clock is UTC{off:+d} but config.py says UTC{C.SERVER_UTC_OFFSET_HOURS:+d} (clock change?). "
                               f"Set SERVER_UTC_OFFSET_HOURS = {off} in code/config.py and restart. " + ("No new orders until fixed." if TRADE else ""))
        if TRADE:
            return
    state, nbias = compute(bars)
    say("new candle", f"{bars[-1]['t']} close {bars[-1]['c']} | next-candle bias {'BULL (buys only)' if nbias == 1 else 'BEAR (sells only)' if nbias == -1 else 'NONE (no trading)'}")
    in_pos = manage_position(bars, state, si)
    stop_new = GATE.killed() or GATE.halted() is not None
    want = [] if (in_pos or nbias == 0 or stop_new) else [o for o in state["orders"] if (o["side"] == "sell" and nbias == -1) or (o["side"] == "buy" and nbias == 1)]
    mid = (tick.bid + tick.ask) / 2.0
    want.sort(key=lambda o: abs(o["entry"] - mid))   # nearest to price first: those fill first, so they get the open-risk budget
    if len(want) > C.MAX_PENDING:
        say("note", f"{len(want)} armed blocks, keeping the {C.MAX_PENDING} nearest to price")
        want = want[:C.MAX_PENDING]
    have = {key("sell" if o.type == mt5.ORDER_TYPE_SELL_LIMIT else "buy", o.price_open, o.sl, si.digits): o for o in mine_orders()}
    wantk = {key(w["side"], w["entry"], w["sl"], si.digits): w for w in want}
    for k, o in have.items():
        if k not in wantk:
            cancel(o)
    for k, w in wantk.items():
        if k not in have:
            place(w, si, tick, ai)
    say("status", f"armed blocks {len(state['orders'])} | wanted orders {len(wantk)} | on broker {len(have)} | position open: {in_pos}")


def main():
    global TRADE, GATE
    ap = argparse.ArgumentParser()
    ap.add_argument("--trade", action="store_true", help="really place orders (DEMO account only)")
    ap.add_argument("--once", action="store_true", help="run one cycle and stop")
    a = ap.parse_args()
    TRADE = a.trade
    if not mt5.initialize():
        raise SystemExit(f"Cannot connect to MetaTrader 5: {mt5.last_error()}")
    mt5.symbol_select(C.SYMBOL, True)
    ai = mt5.account_info()
    kind = "DEMO" if ai.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO else "NOT DEMO"
    say("start", f"account {ai.login} ({kind}) {C.SYMBOL} mode {'TRADING (demo)' if TRADE else 'DRY RUN - nothing is sent'} risk {C.RISK_PCT}%")
    if TRADE:
        require_demo()
    GATE = RiskGate(C, os.path.join(LOGS, "risk_state.json"), os.path.join(LOGS, "HALT"), os.path.join(ROOT, "KILL"), log=say)
    last = None
    try:
        while True:
            guard()
            bars = get_bars(C.WARMUP_BARS)
            if bars is None:
                say("waiting", "not enough M3 history yet")
            elif bars[-1]["ep"] != last:
                last = bars[-1]["ep"]
                cycle(bars)
                if a.once:
                    break
            elif a.once:
                break
            time.sleep(C.POLL_SECONDS)
    except KeyboardInterrupt:
        say("stopped", "by user")
    finally:
        if TRADE and C.CANCEL_PENDING_ON_EXIT and not a.once:
            try:
                for o in mine_orders():
                    cancel(o, "runner stopping")
            except Exception as e:   # never mask the original error
                say("exit cleanup FAILED", f"{type(e).__name__}: {e} - delete pending orders with magic {C.MAGIC} by hand")
        mt5.shutdown()


if __name__ == "__main__":
    main()
