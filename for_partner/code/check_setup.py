"""
Run this FIRST. It only READS - it sends nothing.

    python code/check_setup.py

It tells you: is MetaTrader connected, is the account a DEMO, which symbol/offset/lot values to put in config.py.
"""
import os
import sys
import time

import MetaTrader5 as mt5

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402


def main():
    if not mt5.initialize():
        raise SystemExit(f"Cannot connect to MetaTrader 5: {mt5.last_error()}\n-> open the MT5 terminal, log in to your DEMO account, then run this again.")
    ai = mt5.account_info()
    kind = {mt5.ACCOUNT_TRADE_MODE_DEMO: "DEMO", mt5.ACCOUNT_TRADE_MODE_CONTEST: "CONTEST", mt5.ACCOUNT_TRADE_MODE_REAL: "REAL (LIVE MONEY)"}.get(ai.trade_mode, "unknown")
    print(f"Account : {ai.login}  server {ai.server}  type {kind}  balance {ai.balance} {ai.currency}")
    if ai.trade_mode != mt5.ACCOUNT_TRADE_MODE_DEMO:
        print("\n*** This is NOT a demo account. The runner will refuse to place orders on it. ***")
        print("    Open a demo account at your broker, log in to it in MetaTrader, and run this again.\n")
    cands = [s.name for s in (mt5.symbols_get("*XAU*") or [])]
    print(f"Gold symbols on this broker: {cands}")
    si = mt5.symbol_info(C.SYMBOL)
    if si is None:
        raise SystemExit(f"Symbol '{C.SYMBOL}' not found. Put one of the names above into code/config.py (SYMBOL).")
    mt5.symbol_select(C.SYMBOL, True)
    tick = mt5.symbol_info_tick(C.SYMBOL)
    off = round((tick.time - time.time()) / 3600)
    fresh = abs((tick.time - off * 3600) - time.time()) < 900
    print(f"\nSymbol  : {C.SYMBOL}   digits {si.digits}   point {si.point}   contract {si.trade_contract_size}")
    print(f"Lots    : min {si.volume_min}   step {si.volume_step}   max {si.volume_max}")
    print(f"Stops   : minimum stop distance {si.trade_stops_level} points   freeze level {si.trade_freeze_level}")
    print(f"Spread  : {si.spread} points now")
    print(f"Server time offset (server minus UTC): {off:+d} h   {'(tick is fresh, reliable)' if fresh else '(tick looks stale - market closed? re-run when gold is trading)'}")
    print(f"config.py currently says: SERVER_UTC_OFFSET_HOURS = {C.SERVER_UTC_OFFSET_HOURS}   SYMBOL = {C.SYMBOL}")
    if fresh and off != C.SERVER_UTC_OFFSET_HOURS:
        print(f"\n*** MISMATCH: set SERVER_UTC_OFFSET_HOURS = {off} in code/config.py (the sessions depend on it) ***")
    bars = mt5.copy_rates_from_pos(C.SYMBOL, mt5.TIMEFRAME_M3, 0, C.WARMUP_BARS + 1)
    n = 0 if bars is None else len(bars)
    print(f"\nM3 history available: {n} bars (need about {C.WARMUP_BARS}).", "OK" if n >= C.WARMUP_BARS else "-> scroll the M3 chart back in MT5 to load more history, or lower WARMUP_BARS a little.")
    mt5.shutdown()


if __name__ == "__main__":
    main()
