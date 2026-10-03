"""
Validation harness for SME Baseline v1 (promotion-gate stage 1-2 checks). Pure Python, no MT5, no network.

    python code/validate.py            # full run (~1-2 min)
    python code/validate.py --quick    # fewer resamples

Does NOT change the strategy. It stresses the baseline's own trades and rules:
  1. cost stress      extra cost per trade (price units) on top of the modelled spread
  2. bootstrap        resample the trade list -> P(total<=0), drawdown and losing-streak distribution
  3. bias placebo     shuffle / invert the session bias -> does the bias add anything beyond the blocks?
  4. stability        neighbouring parameter values (stop buffer, expiry, min zone) -> any cliffs?
  5. significance     t-stat of mean R vs the t expected from the best of N tried variants
  6. period split     result per quarter (H1) / per week (M3)
"""
import math
import os
import random
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
from backtest import load_h1, load_m3  # noqa: E402
from bias import session_bias  # noqa: E402
from engine import run  # noqa: E402

QUICK = "--quick" in sys.argv
N_BOOT = 1000 if QUICK else 5000
N_PERM = 40 if QUICK else 200
N_TRIED = 64   # variants Allan compared on the same data (reference/grid_64_configs_results.txt)
SEED = 20261003


def pf(rs):
    gl = -sum(x for x in rs if x <= 0)
    return sum(x for x in rs if x > 0) / gl if gl else float("inf")


def summ(rs):
    if not rs:
        return "n=0"
    return f"n={len(rs):4d} total {sum(rs):+7.1f}R avg {statistics.mean(rs):+.3f}R PF {pf(rs):.2f}"


def trades_r(bars, bias, **kw):
    _, tr, _, _ = run(bars, require_counter=False, bias=bias, beta=False, **kw)
    return tr


def maxdd(rs):
    peak = eq = dd = 0.0
    for r in rs:
        eq += r
        peak = max(peak, eq)
        dd = max(dd, peak - eq)
    return dd


def longest_loss_streak(rs):
    best = cur = 0
    for r in rs:
        cur = cur + 1 if r < 0 else 0
        best = max(best, cur)
    return best


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p / 100 * len(xs)))]


def segments(bars, offset):
    bias, labels = session_bias(bars, offset)
    segs, cur = [], None
    for i, lab in enumerate(labels):
        if lab is None:
            continue
        if cur is None or cur["lab"] != lab:
            cur = dict(lab=lab, idx=[])
            segs.append(cur)
        cur["idx"].append(i)
    return bias, segs


def shuffled_bias(bias, segs, rng):
    vals = [bias[s["idx"][0]] for s in segs[1:]]
    rng.shuffle(vals)
    out = [0] * len(bias)
    for s, v in zip(segs[1:], vals):
        for i in s["idx"]:
            out[i] = v
    return out


def study(name, bars, offset, base_cost, period_key):
    rng = random.Random(SEED)
    bias, segs = segments(bars, offset)
    tr = trades_r(bars, bias)
    rs = [t["r"] for t in tr]
    risk = [abs(t["sl"] - t["entry"]) for t in tr]
    out = [f"## {name}", "", f"Baseline: {summ(rs)}   max drawdown {maxdd(rs):.1f}R   longest losing streak {longest_loss_streak(rs)}", ""]

    out += ["### 1. Cost stress (extra cost per trade, price units; modelled spread is already included)", "",
            f"Typical stop distance: median {statistics.median(risk):.2f}, so extra 0.20 costs about {0.2 / statistics.median(risk):.2f}R on a median trade.", "",
            "| Extra cost | Result |", "|---|---|"]
    for extra in (0.0, base_cost, 2 * base_cost, 4 * base_cost):
        rr = [t["r"] - extra / rk for t, rk in zip(tr, risk)]
        out.append(f"| +{extra:.2f} | {summ(rr)} |")
    be = None
    for e in [x / 100 for x in range(0, 400, 5)]:
        if sum(t["r"] - e / rk for t, rk in zip(tr, risk)) <= 0:
            be = e
            break
    out += ["", f"Break-even extra cost per trade: about **{be:.2f}** price units" if be is not None else "Break-even extra cost: above 3.95", ""]

    boot = []
    for _ in range(N_BOOT):
        s = [rng.choice(rs) for _ in rs]
        boot.append((sum(s), maxdd(s), longest_loss_streak(s)))
    neg = sum(1 for b in boot if b[0] <= 0) / N_BOOT
    out += [f"### 2. Bootstrap ({N_BOOT} resamples of the {len(rs)} trades)", "",
            f"- P(total R <= 0): **{neg:.1%}**",
            f"- Total R: 5th pct {pct([b[0] for b in boot], 5):+.1f}, median {pct([b[0] for b in boot], 50):+.1f}, 95th pct {pct([b[0] for b in boot], 95):+.1f}",
            f"- Max drawdown (R): median {pct([b[1] for b in boot], 50):.1f}, 95th pct {pct([b[1] for b in boot], 95):.1f}, 99th pct {pct([b[1] for b in boot], 99):.1f}",
            f"- Longest losing streak: median {pct([b[2] for b in boot], 50)}, 95th pct {pct([b[2] for b in boot], 95)}, 99th pct {pct([b[2] for b in boot], 99)}",
            "", "Assumes trades are independent; real trades cluster in time, so treat the tails as optimistic.", ""]

    inv = trades_r(bars, [-b for b in bias])
    none = trades_r(bars, None)
    perm = []
    for _ in range(N_PERM):
        perm.append(sum(t["r"] for t in trades_r(bars, shuffled_bias(bias, segs, rng))))
    p_val = (1 + sum(1 for x in perm if x >= sum(rs))) / (1 + N_PERM)
    out += ["### 3. Bias placebo (does the previous-session bias add anything?)", "",
            "| Variant | Result |", "|---|---|",
            f"| Real bias | {summ(rs)} |",
            f"| No bias | {summ([t['r'] for t in none])} |",
            f"| Inverted bias | {summ([t['r'] for t in inv])} |",
            f"| Shuffled session bias ({N_PERM} runs) | total R median {pct(perm, 50):+.1f}, 95th pct {pct(perm, 95):+.1f} |", "",
            f"Permutation p-value (shuffled bias total >= real): **{p_val:.3f}**", ""]

    out += ["### 4. Parameter stability (neighbouring values of optional rules, all off in v1)", "",
            "| Setting | Result |", "|---|---|"]
    totals = []
    for label, kw in [("v1 (all off)", {}), ("stop buffer 0.05", dict(sl_buf=0.05)), ("stop buffer 0.10", dict(sl_buf=0.10)),
                      ("stop buffer 0.20", dict(sl_buf=0.20)), ("expiry 12 bars", dict(expiry=12)), ("expiry 24 bars", dict(expiry=24)),
                      ("expiry 48 bars", dict(expiry=48)), ("min zone 1.0", dict(min_zone=1.0)), ("min zone 2.0", dict(min_zone=2.0))]:
        r2 = [t["r"] for t in trades_r(bars, bias, **kw)]
        totals.append(sum(r2))
        out.append(f"| {label} | {summ(r2)} |")
    out += ["", f"{sum(1 for x in totals if x > 0)} of {len(totals)} settings positive; range {min(totals):+.1f}R to {max(totals):+.1f}R", ""]

    sd = statistics.pstdev(rs)
    t_stat = statistics.mean(rs) / (sd / math.sqrt(len(rs)))
    exp_max = statistics.NormalDist().inv_cdf(1 - 1 / (N_TRIED * 2)) if N_TRIED > 1 else 0
    out += ["### 5. Significance after trying many variants", "",
            f"- t-stat of mean R: **{t_stat:.2f}** (n={len(rs)})",
            f"- Best t expected from {N_TRIED} independent no-edge variants: about {exp_max:.2f}  (variants overlap, so this is conservative)",
            f"- Verdict: {'clears' if t_stat > exp_max else 'does NOT clear'} the multiple-testing bar", ""]

    groups = {}
    for t, r in zip(tr, rs):
        groups.setdefault(period_key(bars[t["fill"]]["t"]), []).append(r)
    out += ["### 6. Period split", "", "| Period | Result |", "|---|---|"]
    for k in sorted(groups):
        out.append(f"| {k} | {summ(groups[k])} |")
    pos = sum(1 for v in groups.values() if sum(v) > 0)
    out += ["", f"{pos} of {len(groups)} periods positive", ""]
    return out


def quarter(t):
    return f"{t[:4]}-Q{(int(t[5:7]) - 1) // 3 + 1}"


def week(t):
    from datetime import date
    y, m, d = int(t[:4]), int(t[5:7]), int(t[8:10])
    iso = date(y, m, d).isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


if __name__ == "__main__":
    m3 = load_m3(os.path.join(ROOT, "data", "XAUUSDr_M3_2026-09-01_to_now.csv"))
    h1 = load_h1(os.path.join(ROOT, "data", "xauusd_h1_dukascopy_3y.csv"))
    lines = ["# SME Baseline v1 - validation run", "",
             f"Generated by code/validate.py (seed {SEED}, {N_BOOT} bootstrap, {N_PERM} permutations). Results are in R (risk units), net of the modelled spread.", ""]
    lines += study("Gold H1, 3 years (Dukascopy, assumed spread 0.20)", h1, 0, 0.20, quarter)
    lines += study("XAU M3, Sep 2026 (broker feed, spread about 0.14)", m3, 3, 0.14, week)
    text = "\n".join(lines)
    print(text)
    os.makedirs(os.path.join(ROOT, "backtest_output"), exist_ok=True)   # the committed docs/5_VALIDATION_REPORT.md is hand-written; never overwrite it
    with open(os.path.join(ROOT, "backtest_output", "validation_details.md"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
