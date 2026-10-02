"""
SME M3 replay engine. Pure: bars in -> events/trades out (no clock, no MT5, no orders).
Spec: docs/1_RULES_BASELINE_v1.md
  R1  valid-candle runs. Flips are close-based. A candle is valid if its WHOLE BODY is beyond the reference
      low/high - except the candle right after a flip, which only needs to CLOSE beyond the flip candle's extreme
      (one-shot; reproduces Allan's Mon28-Tue29 GBP run and the XAU 30 Sep/01 Oct sequences)
  R2  v0.6 blocks: when a run breaks, its reference candle becomes a pending block, confirmed by a close beyond the
      prior same-direction run's last valid extreme (may confirm on the flip candle itself); the newest block of a
      kind clears older live ones
  E1  entry/exit at a failed block (DRAFT). Fill on touch only if the engine is in the COUNTER-run after the touch
      candle closes; a block is deleted after one use.

    python scanner/sme_m3.py data/snapshots/XAUUSDr_M3_2026-09-28_to_now.csv --from "2026-09-30 23:30" --to "2026-10-01 07:30"
Times are in the chosen clock (default: broker time).
"""
import argparse
import csv


def load(path, clock="broker"):
    with open(path, newline="") as f:
        return [dict(t=r[clock], o=float(r["o"]), h=float(r["h"]), l=float(r["l"]),
                     c=float(r["c"]), sp=int(r["spread"])) for r in csv.DictReader(f)]


def run(bars, point=0.01, require_counter=True, rearm=False, start_i=0, hybrid=True, beta=True,
        sl_buf=0.0, min_zone=0.0, expiry=0, bias=None, be_at=0.0, day_cap=0, max_spread=0, struct_a=False, state_out=None):
    """Optional extra rules (all OFF by default): sl_buf = stop pushed beyond the far edge by this fraction of zone height;
    min_zone = skip zones smaller than this many price points; expiry = cancel an unfilled order after N bars;
    bias = per-bar higher-timeframe direction (+1/-1) - only trade with it; be_at = move stop to breakeven after +N R;
    day_cap = stop taking fills for the day after N consecutive losses; max_spread = skip fills when the bar spread (points) is wider."""
    n = len(bars)
    log, blocks, orders, trades = [], [], [], []
    live = []   # blocks still live (kept small so long histories stay fast)
    d, rh, rl, rb, fresh = 0, None, None, None, False
    last_bull_hi = last_bear_lo = None   # last valid HIGH of the last broken bull run / LOW of the last broken bear run
    last_bull_hi_bar = last_bear_lo_bar = None   # bar index of those candles (used by struct_a)
    pend, pos, closed_i = None, None, -1
    consec = {}   # consecutive losses per broker date
    flips_list = []   # (bar index, new direction) of every run flip - lets a live runner apply the exit rule

    def mk(side, entry, sl, i, kind, anchor, blk=None):
        height = abs(entry - sl)
        if min_zone and height < min_zone:
            return None
        if sl_buf:
            sl = sl + sl_buf * height if side == "sell" else sl - sl_buf * height
        od = dict(side=side, entry=entry, sl=sl, armed=i, state="armed", anchor=anchor, kind=kind)
        if blk is not None:
            od["blk"] = blk
        orders.append(od)
        return od

    def L(i, kind, text):
        log.append((i, kind, text))

    def close(i_exit, px, reason, i_sig):
        nonlocal pos, closed_i
        sell = pos["side"] == "sell"
        move = (pos["entry"] - px) if sell else (px - pos["entry"])
        pts = move - bars[i_exit]["sp"] * point
        day = bars[i_sig]["t"][:10]
        consec[day] = consec.get(day, 0) + 1 if pts < 0 else 0
        trades.append(dict(side=pos["side"], entry=pos["entry"], sl=pos["sl"], fill=pos["fill"], exit=i_exit,
                           px=px, pts=pts, r=pts / pos["risk"], reason=reason, anchor=pos["anchor"],
                           kind=pos["kind"], armed=pos["armed"], dprev=pos["dprev"], dpost=pos["dpost"]))
        L(i_sig, "EXIT", f"{pos['side']} exit {reason} @ {px} (exec {bars[i_exit]['t']}) net {pts:+.2f} pts = {pts / pos['risk']:+.2f}R")
        if reason.startswith("STOP"):
            pos["od"]["state"] = "dead"
            if pos["od"].get("kind") == "primary":
                # primary trade stopped at the zone's far edge -> the block FAILED -> it becomes BETA (flip-side entry)
                blk = pos["od"]["blk"]
                blk["state"] = "failed"
                bu = blk["kind"] == "bull"
                if beta:
                    mk("sell" if bu else "buy", blk["lo"] if bu else blk["hi"], blk["hi"] if bu else blk["lo"], i_sig, "beta", bars[blk["idx"]]["t"])
                L(i_sig, "BETA", f"primary {bars[blk['idx']]['t']} stopped at the zone edge -> beta: {'sell' if bu else 'buy'} limit {blk['lo'] if bu else blk['hi']}, SL {blk['hi'] if bu else blk['lo']}")
        pos, closed_i = None, i_sig

    def confirm(i, bull, bear, c):
        """Confirm the pending block if this candle closes beyond its level."""
        nonlocal pend
        conf = (bull and c > pend["lvl"]) if pend["kind"] == "bull" else (bear and c < pend["lvl"])
        if not conf:
            return False
        if i >= start_i:
            a_ = bars[pend["anchor"]]
            for old in live:   # lifecycle: the newest block of a kind clears the older live ones
                if old["kind"] == pend["kind"] and old["state"] == "live":
                    old["state"] = "cleared"
                    for od_ in orders:
                        if od_.get("blk") is old and od_["state"] == "armed":
                            od_["state"] = "cancelled"
                    L(i, "clear", f"{old['kind']} block {bars[old['idx']]['t']} cleared by newer block")
            blk = dict(kind=pend["kind"], idx=pend["anchor"], lo=a_["l"], hi=a_["h"], conf=i, state="live")
            blocks.append(blk)
            live.append(blk)
            bu = blk["kind"] == "bull"   # every confirmed block is PRIMARY: entered while intact, near edge, stop at far edge
            mk("buy" if bu else "sell", blk["hi"] if bu else blk["lo"], blk["lo"] if bu else blk["hi"], i, "primary", a_["t"], blk)
            L(i, "BLOCK", f"{pend['kind']} block confirmed: anchor {a_['t']} zone {a_['l']}-{a_['h']} (close {c} beyond {pend['lvl']})")
        pend = None
        return True

    for i, b in enumerate(bars):
        o, h, l, c = b["o"], b["h"], b["l"], b["c"]
        bull, bear = c > o, c < o
        top, bot = max(o, c), min(o, c)
        pH, pL, pB, pF, flipped = rh, rl, rb, fresh, False
        d0 = d   # engine state BEFORE this candle (analysis only)
        live[:] = [x for x in live if x["state"] == "live"]
        orders[:] = [x for x in orders if x["state"] == "armed"]
        fresh = False   # one-shot: only the candle right after a flip/start gets the close-based test

        # ---- R1
        if d == 0:
            if bull or bear:
                d, rh, rl, rb, fresh = (1 if bull else -1), h, l, i, True
        elif d == -1:
            if bull and c > pH:
                d, flipped, rh, rl, rb, fresh = 1, True, h, l, i, True
            elif bear and ((c < pL) if (hybrid and pF) else (top < pL)):
                rh, rl, rb = h, l, i
        else:
            if bear and c < pL:
                d, flipped, rh, rl, rb, fresh = -1, True, h, l, i, True
            elif bull and ((c > pH) if (hybrid and pF) else (bot > pH)):
                rh, rl, rb = h, l, i

        if flipped:
            flips_list.append((i, d))

        # ---- R2: pending block (old one first; if the next flip came first it is dropped)
        if pend and not confirm(i, bull, bear, c) and flipped:
            L(i, "drop", f"pending {pend['kind']} block dropped (next flip first)")
            pend = None
        if flipped:
            if d == 1:   # a bear run just broke -> its reference candle becomes a pending BULLISH block
                if last_bull_hi is not None:
                    lvl = last_bull_hi
                    if struct_a and last_bull_hi_bar is not None:   # A: the break must clear the whole V base (highest high since that candle)
                        lvl = max(lvl, max(x["h"] for x in bars[last_bull_hi_bar:pB + 1]))
                    pend = dict(kind="bull", anchor=pB, lvl=lvl)
                last_bear_lo, last_bear_lo_bar = pL, pB
            else:        # a bull run just broke -> its reference candle becomes a pending BEARISH block
                if last_bear_lo is not None:
                    lvl = last_bear_lo
                    if struct_a and last_bear_lo_bar is not None:   # A: the break must clear the whole V base (lowest low since that candle)
                        lvl = min(lvl, min(x["l"] for x in bars[last_bear_lo_bar:pB + 1]))
                    pend = dict(kind="bear", anchor=pB, lvl=lvl)
                last_bull_hi, last_bull_hi_bar = pH, pB
            if pend:
                confirm(i, bull, bear, c)   # may confirm on the flip candle itself

        # ---- block failure (close beyond far extreme) -> E1 order armed at the near edge
        for blk in live:
            if blk["state"] != "live" or blk["conf"] == i:
                continue
            if (blk["kind"] == "bull" and c < blk["lo"]) or (blk["kind"] == "bear" and c > blk["hi"]):
                blk["state"] = "failed"   # a failed PRIMARY block becomes a BETA block (entered on the flip side)
                for od_ in orders:
                    if od_.get("blk") is blk and od_["state"] == "armed":
                        od_["state"] = "cancelled"
                bu = blk["kind"] == "bull"
                od = mk("sell" if bu else "buy", blk["lo"] if bu else blk["hi"], blk["hi"] if bu else blk["lo"], i, "beta", bars[blk["idx"]]["t"]) if beta else None
                L(i, "BOS", f"{blk['kind']} block {bars[blk['idx']]['t']} failed (close {c})" + (f" -> {od['side']} limit {od['entry']}, SL {od['sl']}" if od else ""))

        # ---- E1: manage open position (stop first, then first R1 invalidation against the trade)
        if pos and pos["fill"] < i:
            sell = pos["side"] == "sell"
            if (h >= pos["sl"]) if sell else (l <= pos["sl"]):
                close(i, pos["sl"], "BE" if pos.get("be") else "STOP", i)
            elif be_at and not pos.get("be") and ((pos["entry"] - l) if sell else (h - pos["entry"])) >= be_at * pos["risk"]:
                pos["sl"], pos["be"] = pos["entry"], True   # breakeven stop from the next candle on
        if pos and flipped and pos["fill"] < i and ((pos["side"] == "sell" and d == 1) or (pos["side"] == "buy" and d == -1)):
            if i + 1 < n:
                close(i + 1, bars[i + 1]["o"], "R1 invalidation", i)
            else:
                L(i, "EXIT", "invalidation on last bar - exit pending next open")

        # ---- E1: armed orders (fill on touch; counter-run = engine state AFTER the touch candle closes)
        for od in orders:
            if od["state"] != "armed" or od["armed"] >= i:
                continue
            if expiry and i - od["armed"] > expiry:
                od["state"] = "cancelled"
                continue
            sell = od["side"] == "sell"
            touched = (h >= od["entry"]) if sell else (l <= od["entry"])
            if touched and pos is None and closed_i != i:
                ok_ctr = (not require_counter) or (d == 1 if sell else d == -1)
                ok_bias = bias is None or bias[i] == (-1 if sell else 1)
                ok_sp = (not max_spread) or b["sp"] <= max_spread
                ok_day = (not day_cap) or consec.get(b["t"][:10], 0) < day_cap
                if ok_ctr and ok_bias and ok_sp and ok_day:
                    pos = dict(side=od["side"], entry=od["entry"], sl=od["sl"], fill=i,
                               risk=abs(od["sl"] - od["entry"]), anchor=od["anchor"], od=od,
                               kind=od["kind"], armed=od["armed"], dprev=d0, dpost=d)
                    if od.get("kind") == "primary":
                        od["blk"]["state"] = "used"   # used -> deleted (it can never become a beta)
                    L(i, "FILL", f"{od['kind']} {od['side']} filled @ {od['entry']} (block {od['anchor']}, engine {'BULL' if d == 1 else 'BEAR'} at close)")
                    if not rearm:
                        od["state"] = "used"
                    if (h >= od["sl"]) if sell else (l <= od["sl"]):
                        close(i, od["sl"], "STOP (same bar)", i)
                    continue
            if ((c > od["sl"]) if sell else (c < od["sl"])) and not (pos and pos["fill"] == i):
                od["state"] = "cancelled"
                L(i, "cancel", f"{od['side']} order {od['entry']} cancelled (close {c} beyond SL {od['sl']})")

    open_pos = None
    if pos:
        px = bars[-1]["c"]
        mv = (pos["entry"] - px) if pos["side"] == "sell" else (px - pos["entry"])
        open_pos = dict(pos, floating=mv, r=mv / pos["risk"])
    if state_out is not None:   # live runners read the engine's final state from here
        state_out.update(orders=[x for x in orders if x["state"] == "armed"], pos=pos, d=d, flips=flips_list, n=n,
                         live_blocks=[x for x in live if x["state"] == "live"])
    return log, trades, blocks, open_pos


def report(bars, res, start, title, verbose=False, end="9999"):
    log, trades, blocks, open_pos = res
    s0 = next((i for i, b in enumerate(bars) if b["t"] >= start), 0)
    out = [f"### {title}"]
    for i, kind, text in log:
        if i >= s0 and bars[i]["t"] <= end and (verbose or kind != "drop"):
            out.append(f"{bars[i]['t']}  {kind:6} {text}")
    tr = [t for t in trades if t["fill"] >= s0 and bars[t["fill"]]["t"] <= end]
    out.append(f"\ntrades: {len(tr)}  net R: {sum(t['r'] for t in tr):+.2f}")
    return "\n".join(out)
