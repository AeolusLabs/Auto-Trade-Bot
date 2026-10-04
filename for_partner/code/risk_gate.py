"""
RiskGate - account-level safety for the SME runner. Pure Python: no MetaTrader5 import, so it is unit-testable.

The runner already sizes every order and refuses non-demo accounts. This adds what that does not cover:
  * daily loss cap and max drawdown from the high-water equity  -> HALT (file logs/HALT) until a human deletes it
  * KILL file in the project root                                -> no new orders, pending orders cancelled
  * cap on total open risk (positions + pending orders)          -> bounds the damage if several limits fill in one spike
  * MT5 not connected / algo trading off / stale quotes          -> no new orders
  * retire line: equity at RETIRE_AT_PCT of the starting equity  -> RETIRED file, needs a person to delete it
  * daily trade cap, daily cost budget (spread), order cooldown  -> no new orders until 00:00 UTC (cooldown: until it expires)
  * every veto carries a plain reason, shown as "wanted X, code said no: <reason>"
Pattern after imikerussell/beebots src/risk.ts (MIT): caps only escalate within a day, reset at 00:00 UTC, and alert once when they trip.
Fail-closed: if the gate cannot decide, the answer is "no".

State lives in logs/risk_state.json so a restart on the same day keeps the day-start equity and the high-water mark.
Re-enabling after a trip: delete logs/HALT. The gate then re-baselines (high-water and day-start = current equity).
"""
import json
import os
from datetime import datetime, timezone


class RiskGate:
    def __init__(self, cfg, state_path, halt_path, kill_path, log=print, alert=None, retired_path=None):
        self.cfg = cfg
        self.state_path = state_path
        self.halt_path = halt_path
        self.kill_path = kill_path
        self.retired_path = retired_path or os.path.join(os.path.dirname(halt_path), "RETIRED")
        self.log = log
        self.alert = alert
        self.s = self._load()
        for k, v in dict(start_equity=None, retired=False, trades_today=0, cost_today=0.0, last_entry_ts=None, seen=[], capped=[]).items():
            self.s.setdefault(k, v)

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

    def retired(self):
        """Reason string if retired, else None."""
        if os.path.exists(self.retired_path):
            try:
                with open(self.retired_path) as f:
                    return f.read().strip() or "retired"
            except OSError:
                return "retired"
        return None

    def _notify(self, title, msg):
        if self.alert:
            try:
                self.alert(title, msg)
            except Exception:
                pass

    def _trip(self, reason):
        self.s["tripped"] = True
        with open(self.halt_path, "w") as f:
            f.write(reason)
        self._save()
        self.log("RISK HALT", f"{reason}. No new orders until you delete {os.path.basename(self.halt_path)}.")
        self._notify("RISK HALT", reason)

    def update(self, equity, now_ts):
        """Call every poll with current equity. Rolls the UTC day, tracks the high-water mark, trips halts."""
        day = datetime.fromtimestamp(now_ts, timezone.utc).strftime("%Y-%m-%d")
        if self.s["tripped"] and not os.path.exists(self.halt_path):   # a human re-enabled trading
            self.s.update(tripped=False, hwm=equity, day=day, day_start_equity=equity)
            self._save()
            self.log("RISK RESET", f"HALT file removed: baselines reset to equity {equity:.2f}")
        if self.s["retired"] and not os.path.exists(self.retired_path):   # a human reset after retirement
            self.s.update(retired=False, start_equity=equity, hwm=equity, day_start_equity=equity, day=day)
            self._save()
            self.log("RISK RESET", f"RETIRED file removed: starting equity re-baselined to {equity:.2f}")
        changed = False
        if self.s["start_equity"] is None:
            self.s["start_equity"] = equity
            changed = True
        if self.s["day"] != day or self.s["day_start_equity"] is None:
            self.s["day"], self.s["day_start_equity"] = day, equity
            self.s.update(trades_today=0, cost_today=0.0, capped=[])   # daily caps reset at 00:00 UTC
            changed = True
        if self.s["hwm"] is None or equity > self.s["hwm"]:
            self.s["hwm"] = equity
            changed = True
        if changed:
            self._save()
        se = self.s["start_equity"]
        if se and not self.s["retired"] and equity <= se * self.cfg.RETIRE_AT_PCT / 100:
            reason = f"retired: equity {equity:.2f} is at or below {self.cfg.RETIRE_AT_PCT}% of the starting equity {se:.2f}"
            self.s["retired"] = True
            with open(self.retired_path, "w") as f:
                f.write(reason)
            self._save()
            self.log("RISK RETIRED", f"{reason}. Stopped for good: delete {os.path.basename(self.retired_path)} only after a review.")
            self._notify("RISK RETIRED", reason)
        if self.halted() or self.retired():
            return
        d0, hwm = self.s["day_start_equity"], self.s["hwm"]
        if d0 and (d0 - equity) / d0 * 100 >= self.cfg.DAILY_LOSS_PCT:
            self._trip(f"daily loss {(d0 - equity) / d0 * 100:.2f}% >= {self.cfg.DAILY_LOSS_PCT}% (day start {d0:.2f}, now {equity:.2f})")
        elif hwm and (hwm - equity) / hwm * 100 >= self.cfg.MAX_DD_PCT:
            self._trip(f"drawdown {(hwm - equity) / hwm * 100:.2f}% >= {self.cfg.MAX_DD_PCT}% (high-water {hwm:.2f}, now {equity:.2f})")

    def note_positions(self, positions, now_ts):
        """positions: list of (ticket, est_cost_money). A ticket not seen before counts as one entry today."""
        new = []
        for t, c in positions:
            if t not in self.s["seen"] and t not in [n[0] for n in new]:
                new.append((t, c))
        if not new:
            return
        for t, c in new:
            self.s["seen"].append(t)
            self.s["trades_today"] += 1
            self.s["cost_today"] += float(c)
            self.s["last_entry_ts"] = now_ts
        self.s["seen"] = self.s["seen"][-200:]
        cap = self.cfg.MAX_TRADES_PER_DAY
        if self.s["trades_today"] >= cap and "trade_cap" not in self.s["capped"]:
            self.s["capped"].append("trade_cap")
            self.log("RISK CAP", f"trade cap reached: {self.s['trades_today']} of {cap} today. No new orders until 00:00 UTC.")
            self._notify("TRADE CAP", f"{self.s['trades_today']} of {cap} entries used today")
        self._save()

    def allow_entry(self, equity, open_risk, new_risk, tick_age_s, trade_allowed, connected, est_cost=0.0, now_ts=None):
        """(ok, reason). open_risk / new_risk are money lost if the stop is hit; est_cost is the spread cost of the new order."""
        if self.killed():
            return False, "KILL file present"
        r = self.retired()
        if r:
            return False, f"retired: {r}"
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
        if self.s["trades_today"] >= self.cfg.MAX_TRADES_PER_DAY:
            return False, f"trade_cap {self.s['trades_today']} of {self.cfg.MAX_TRADES_PER_DAY} used today"
        budget = equity * self.cfg.COST_BUDGET_PCT_DAY / 100.0
        if self.s["cost_today"] + est_cost > budget + 1e-9:
            return False, f"cost_budget {self.s['cost_today'] + est_cost:.2f} would exceed {budget:.2f} ({self.cfg.COST_BUDGET_PCT_DAY}% of equity) today"
        if self.cfg.COOLDOWN_MINUTES and now_ts is not None and self.s["last_entry_ts"] is not None:
            left = self.cfg.COOLDOWN_MINUTES - (now_ts - self.s["last_entry_ts"]) / 60.0
            if left > 0:
                return False, f"cooldown {left:.0f}m left"
        cap = equity * self.cfg.MAX_OPEN_RISK_PCT / 100.0
        if open_risk + new_risk > cap + 1e-9:
            return False, f"open_risk {open_risk + new_risk:.2f} would exceed cap {cap:.2f} ({self.cfg.MAX_OPEN_RISK_PCT}% of equity)"
        return True, "ok"
