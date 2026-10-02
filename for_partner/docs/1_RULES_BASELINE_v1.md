# SME Baseline v1 - the exact rules

This is the full rule set, written so you do not need any of our conversations to understand it.
The code in `code/engine.py` is the reference implementation; if this document and the code ever disagree, the code is right.

All candles are **closed candles only** (the candle still forming is never used). "Body" = the part between open and close.
Colour: **bull** = close above open, **bear** = close below open. A candle with close = open is ignored.

## 1. Runs and "valid candles" (the heart of it)

The market is always in a **run**: a **bull run** or a **bear run**. Each run has one **reference candle** = the last *valid* candle of that run.

- **Start:** the first coloured candle starts a run (bull candle -> bull run) and is its reference.
- **A candle is VALID in a bull run** if it is a bull candle whose **whole body is above the reference candle's HIGH**.
  It becomes the new reference. (Bear run: mirror - a bear candle whose whole body is below the reference LOW.)
- **Exception, the candle right after a flip (or run start):** it is valid if it simply **closes** beyond the flip candle's extreme
  (bull run: close above the flip candle's high; bear run: close below its low). This is for that one candle only.
- **The run FLIPS (breaks)** when, in a bull run, a bear candle **closes below the reference candle's LOW**. (Bear run: a bull candle closes above the reference HIGH.)
  The flip candle becomes the reference of the new, opposite run.
- Wicks never count. Only closes (and, for validity, whole bodies).

## 2. Blocks (the zones we trade)

When a run flips, the candle that was the **reference of the run that just broke** becomes a *pending block*:
- a **bear run** broke (price turned up) -> pending **BULL block**; zone = that candle's **low to high**
- a **bull run** broke (price turned down) -> pending **BEAR block**

A pending block is **confirmed** when a candle **closes beyond the last valid extreme of the previous run of the same direction**:
- BULL block: a **bull** candle closes **above the last valid HIGH of the previous bull run** that was broken before it
- BEAR block: a **bear** candle closes **below the last valid LOW of the previous bear run**

If the *next* flip happens before the confirmation, the pending block is thrown away. A block can be confirmed on the same
candle that flips the run. When a new block is confirmed, older still-live blocks **of the same kind** are cleared.

## 3. The entry (primary blocks only)

From the candle **after** a block is confirmed, a pending **limit order** waits for price to come back to it:
- **BULL block -> BUY limit at the block's HIGH**, stop-loss at the block's **LOW**
- **BEAR block -> SELL limit at the block's LOW**, stop-loss at the block's **HIGH**

(That is: you enter at the near edge when price returns, and the stop sits on the far edge.)
- **One use only:** once an order has filled (and the trade has ended), that block is deleted.
- If a candle **closes beyond the far edge** before the order fills, the block has failed and the order is cancelled.
- A newer block of the same kind cancels the older block's unfilled order.
- **Only one position at a time.** While a trade is open no new fills are taken.
- (In our research a failed block could be traded from the other side - "beta" entries. **They are OFF in Baseline v1.**)

## 4. The exit
- The stop-loss at the far edge of the block, **or**
- the **first flip of the run against the trade** that happens on a candle *after* the one the trade filled on. When that candle closes, the trade is closed at market (in the backtest: at the next candle's open).

## 5. The bias: only trade in the direction of the previous session

The day is cut into sessions (all times **UTC**; the broker clock must be converted - see `docs/2_SETUP.md`):

| Session | UTC | Broker time while the broker is UTC+3 |
|---|---|---|
| Asia | 22:00 - 06:00 | 01:00 - 09:00 |
| London | 06:00 - 13:00 | 09:00 - 16:00 |
| New York | 13:00 - 21:00 | 16:00 - 24:00 |
| (gold's daily break - no session, no trading) | 21:00 - 22:00 | 00:00 - 01:00 |

The **bias of a session = what the session before it did**: last close minus first open of that previous session.
- previous session went **up** -> this session is **BULL**: take **buys only**
- previous session went **down** -> **BEAR**: take **sells only**
- It is fixed for the whole session. London is judged by Asia, New York by London, Asia by the previous New York.

The session times are fixed in UTC. When the UK/US clocks change, the real-world sessions move by an hour; v1 does not adjust for that (a known simplification).

## 6. Risk and sizing (demo)
- Risk per trade = **0.5% of the account balance**, worked out from the distance between entry and stop. If even the smallest lot would risk more than 1.5x that target, the order is skipped.
- No order is placed if the spread is wider than the limit in `config.py`.
- Never more than the capped number of pending orders, and the runner only touches orders/positions that carry its own magic number.

## 7. Known differences between the backtest and live trading
These are the things the demo test is meant to reveal:
- The backtest assumes a limit order fills the moment price touches it. Live, you may get partial queueing, slippage, or no fill on a thin touch.
- If a candle fills a trade and also hits its stop, the backtest counts the loss. Live it depends on the real order of ticks.
- The backtest exits at the next candle's open after the closing signal. The runner acts within a few seconds of the candle closing.
- Spread: the backtest used the broker's real spread on the M3 data (about 14 points) and 0.20 on the H1 data.
