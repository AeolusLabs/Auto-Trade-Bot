"""
Session bias for SME BASELINE v1: each session is traded with the direction of the PREVIOUS session (net move =
last close vs first open of that session). The bias is fixed for the whole session.

Sessions are defined in UTC (Asia 22-06, London 06-13, New York 13-21) and converted from the broker's server clock
with `offset_hours` (server time minus UTC; e.g. +3 in the broker's summer season). The hour 21-22 UTC (the gold
daily break) belongs to no session. Bars in that hour get bias 0 = no trade.
"""

TABLE_UTC = [("Asia", 22, 6), ("London", 6, 13), ("NewYork", 13, 21)]


def label(hour_utc):
    for name, a, b in TABLE_UTC:
        if (a <= hour_utc < b) if a < b else (hour_utc >= a or hour_utc < b):
            return name
    return None


def session_bias(bars, offset_hours):
    """bars: list of dicts with 't' = 'YYYY-MM-DD HH:MM' (server time), 'o', 'c'.
    Returns (bias list aligned to bars: +1 / -1 / 0, label list)."""
    labels = [label((int(b["t"][11:13]) - offset_hours) % 24) for b in bars]
    segs, cur = [], None
    for i, lab in enumerate(labels):
        if lab is None:
            continue
        if cur is None or cur["lab"] != lab:
            cur = dict(lab=lab, idx=[])
            segs.append(cur)
        cur["idx"].append(i)
    bias = [0] * len(bars)
    for k in range(1, len(segs)):
        pb = [bars[i] for i in segs[k - 1]["idx"]]
        v = 1 if pb[-1]["c"] > pb[0]["o"] else -1 if pb[-1]["c"] < pb[0]["o"] else 0
        for i in segs[k]["idx"]:
            bias[i] = v
    return bias, labels
