"""
RiskGate - account-level safety for the SME runner. Pure Python: no MetaTrader5 import, so it is unit-testable.

The runner already sizes every order and refuses non-demo accounts. This adds what that does not cover:
  * daily loss cap and max drawdown from the high-water equity  -> HALT (file logs/HALT) until a human deletes it
  * KILL file in the project root                                -> no new orders, pending orders cancelled
  * cap on total open risk (positions + pending orders)          -> bounds the damage if several limits fill in one spike
  * MT5 not connected / algo trading off / stale quotes          -> no new orders
Fail-closed: if the gate cannot decide, the answer is "no".

State lives in logs/risk_state.json so a restart on the same day keeps the day-start equity and the high-water mark.
Re-enabling after a trip: delete logs/HALT. The gate then re-baselines (high-water and day-start = current equity).
"""
import json
import os
from datetime import datetime, timezone


class RiskGate:
    def __init__(self, cfg, state_path, halt_path, kill_path, log=print):
        self.cfg = cfg
        self.state_path = state_path
        self.halt_path = halt_path
        self.kill_path = kill_path
        self.log = log
        self.s = self._load()

    # ---- persistence
    def _load(self):
        try:
            with open(self.state_path) as f:
                return json.load(f)
        except (OSError, ValueError):
            return {"day": None, "day_start_equity": None, "hwm": None, "tripped": False}

    def _save(self):
        tmp = self.state_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.s, f)
        os.replace(tmp, self.state_path)

    # ---- state
    def killed(self):
        return os.path.exists(self.kill_path)

    def halted(self):
        """Reason string if halted, else None."""
        if os.path.exists(self.halt_path):
            try:
                with open(self.halt_path) as f:
                    return f.read().strip() or "halted"
            except OSError:
                return "halted"
        return None

    def _trip(self, reason):
        self.s["tripped"] = True
        with open(self.halt_path, "w") as f:
            f.write(reason)
        self._save()
        self.log("RISK HALT", f"{reason}. No new orders until you delete {os.path.basename(self.halt_path)}.")

    def update(self, equity, now_ts):
        """Call every poll with current equity. Rolls the UTC day, tracks the high-water mark, trips halts."""
        day = datetime.fromtimestamp(now_ts, timezone.utc).strftime("%Y-%m-%d")
        if self.s["tripped"] and not os.path.exists(self.halt_path):   # a human re-enabled trading
            self.s.update(tripped=False, hwm=equity, day=day, day_start_equity=equity)
            self._save()
            self.log("RISK RESET", f"HALT file removed: baselines reset to equity {equity:.2f}")
        changed = False
        if self.s["day"] != day or self.s["day_start_equity"] is None:
            self.s["day"], self.s["day_start_equity"] = day, equity
            changed = True
        if self.s["hwm"] is None or equity > self.s["hwm"]:
            self.s["hwm"] = equity
            changed = True
        if changed:
            self._save()
        if self.halted():
            return
        d0, hwm = self.s["day_start_equity"], self.s["hwm"]
        if d0 and (d0 - equity) / d0 * 100 >= self.cfg.DAILY_LOSS_PCT:
            self._trip(f"daily loss {(d0 - equity) / d0 * 100:.2f}% >= {self.cfg.DAILY_LOSS_PCT}% (day start {d0:.2f}, now {equity:.2f})")
        elif hwm and (hwm - equity) / hwm * 100 >= self.cfg.MAX_DD_PCT:
            self._trip(f"drawdown {(hwm - equity) / hwm * 100:.2f}% >= {self.cfg.MAX_DD_PCT}% (high-water {hwm:.2f}, now {equity:.2f})")

    def allow_entry(self, equity, open_risk, new_risk, tick_age_s, trade_allowed, connected):
        """(ok, reason). open_risk / new_risk are money lost if the stop is hit."""
        if self.killed():
            return False, "KILL file present"
        h = self.halted()
        if h:
            return False, f"halted: {h}"
        if not connected:
            return False, "MT5 terminal not connected"
        if not trade_allowed:
            return False, "algo trading is off in MT5"
        if tick_age_s is None or tick_age_s > self.cfg.STALE_TICK_SECONDS:
            return False, f"stale quote ({tick_age_s}s old)"
        if equity <= 0:
            return False, "no equity"
        cap = equity * self.cfg.MAX_OPEN_RISK_PCT / 100.0
        if open_risk + new_risk > cap + 1e-9:
            return False, f"open risk {open_risk + new_risk:.2f} would exceed cap {cap:.2f} ({self.cfg.MAX_OPEN_RISK_PCT}% of equity)"
        return True, "ok"
