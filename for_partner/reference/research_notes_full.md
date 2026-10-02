# SME rules (living spec)

Times in UTC+1. Close-based only; wicks never matter; closed bars only.

## R1 - Valid candle (v0.5, Allan 2026-09-30)
- Reference = last VALID candle of the current run.
- Bear run: valid bear = red candle with WHOLE BODY below the reference LOW; it becomes the new reference.
- Invalidation (flip): a bull candle CLOSES above the reference HIGH. Bull run = mirror. Doji ignored.
- Flat start: first coloured candle starts a run.
- Confirmed by: case #1 (XAUUSDr 30 Sep 16:00).

## R2 - Structure blocks (DRAFT - Allan 2026-10-01, awaiting more examples)
Structure is king: zones exist only because structure was taken.
- **Primary block**: (1) a run is invalidated (R1 flip); (2) the counter-leg created by the flip has an extreme
  (bear leg after a bull run = lowest low); the candle holding it is the block; (3) CONFIRMED when a close
  breaks beyond the last valid candle of the invalidated run (bull: close > its HIGH).
- **Secondary block**: a counter candle INSIDE a run (no invalidation), confirmed by a close beyond it. Weaker.
- **Retest**: price re-enters a confirmed block (not a straight walk). A close beyond the block's far extreme
  = block fails (BOS); the origin candle of the failed move becomes a pending zone in the opposite direction.
- Example #1 (XAUUSDr M3, Wed 30 Sep UTC+1): bull run last valid 21:36 (H4159.80) -> invalidated 21:45 ->
  counter-leg extreme = 21:48 (L4156.33) -> confirmed 23:03 (close 4160.21 > 4159.80) -> retest 23:09 ->
  fails 23:15 (close 4155.80 < 4156.33) -> 23:03 = pending bearish zone.
- Differs from v0.6: anchor is the counter-leg EXTREME candle (21:48), not the broken run's reference candle (21:45).
- Open: tie-break when extremes are equal (default first candle); zone extent (default full range).

## Open items
- M3 rules vs H1 context (which TF do rules run on?)
- Gold daily break (22:00 UTC+1 bar absent) - run continuity across the gap.

## E1 - Entry/exit at a failed beta block (DRAFT - Allan 2026-10-01)
- After a BOS through a beta (primary) block, wait for price to return to it from the broken side.
- Entry at the block's NEAR edge (sell: block low; buy: block high). SL at the FAR edge (sell: block high).
- Example #1: XAUUSDr 30 Sep 21:48 block, entry 4156.33, SL 4157.99, filled 01 Oct 00:48, best 17.04 pts (~10R), stopped 02:06 without an exit rule.
- **Exit (Allan 2026-10-01): the FIRST R1 invalidation of the run after entry.** Sell: first bull close above the bear run's reference high. Fill at the NEXT bar's open (bar-close confirmed). No waiting for a second invalidation.
- Example #1 exit: 01:24 (close 4147.62 > 4147.11), exit 4147.41, ~+8.6 pts (~5.2R) net of 14-pt spread. SL (far edge) stays as the hard stop.
- Open: limit-on-touch vs stop-on-close; spread allowance (~14 pts on XAU); entry taken while engine was still in the opposite run (bull until 01:00).

## Replay findings 2026-10-01 (scanner/sme_m3.py, snapshot XAUUSDr_M3_2026-09-28_to_now sha 5b066ecb331a)
- Engine reproduces cases 3,4,6,7 exactly (block 21:48 @23:03, BOS 23:15, fill 00:48, exit 01:24 -> 4147.41, +8.78 pts = +5.29R net of 14pt spread).
- R2 anchor hypothesis (fits BOTH Allan anchors 21:48 and 23:03): block = extreme candle of the leg's OWN COLOUR (bear candle for a bear leg, bull candle for a bull leg). "Any-candle extreme" wrongly picks 23:06. Flag: --same-colour. Awaiting Allan's confirmation.
- Open decisions: (a) one entry per block vs re-arm after a winner (02:06 re-entry on the 21:48 block stopped same bar); (b) require engine in the counter-run at touch (variant B) or fill on any touch (variant A: takes 07:48 sell inside the bear run, +12R).
- Warm-up days build R1 state only; blocks are not created before the report start (stale blocks fired phantom orders).

## Clock convention (changed 2026-10-01)
- From now Allan speaks BROKER time (true UTC+3 this season). Engine/report default clock = broker. Earlier cases #1-#7 carry both utc1 and broker fields.
- Translation of the 30 Sep sequence: 21:36 utc1 = 23:36 broker | 21:45 = 23:45 | 21:48 = 23:48 | 23:03 = 01:03 | 23:09 = 01:09 | 23:15 = 01:15 | 00:21 = 02:21 | 00:48 = 02:48 | 01:24 = 03:24.
- Feed note: Allan's earlier 21:48 'valid' read came from another chart. On the broker (HF Markets) feed 21:48 fails R1 (body top 4157.97 > ref low 4157.67), so the broker-feed anchor of that bull block is 21:45 (23:45 broker). Cases #3,#4,#6,#7 were logged on the other chart's levels - re-log on the broker feed.
- R2 anchor (corrected): block = last valid candle (reference) of the run that got broken, NOT an extreme. Bear block anchor 01:03 broker confirmed by Allan.

## R2 naming (DRAFT - Allan 2026-10-01, broker time)
- BETA block = block created at a CHANGE OF DIRECTION (bull<->bear). Example: XAUUSDr M3 23:48 (30 Sep) - bull run last valid 23:36 broken by 23:45; validity moved to 23:48; 23:54 broke it upward; 01:03 broke 23:36; 01:09 broke 01:03; 01:15 broke 23:48 low.
- PRIMARY block = block created in a CONTINUATION. Example: 03:18 (01 Oct) last valid bear low 4141.13; 03:24 bull candle broke the bear run (zone 4143.93-4148.70); 03:33 closed 4140.89 below 4141.13 -> 03:24 = primary (continuation) block.
- Secondary block = inside candle in a run (unchanged).
- Entry E1 on the beta block: 02:48 -> exit signal 03:24. Primary-block entry/exit not yet specified.
- Open: primary zone extent + entry edge; first-touch vs counter-run-only.

## Engine rebuilt 2026-10-01 (scanner/sme_m3.py) - matches cases #8-#11 exactly
- R1 hybrid validity: the candle right after a flip is tested against the flip candle's BODY; later ones against the reference low/high. (Reproduces Allan's Mon28-Tue29 GBP run AND the 23:36-01:15 XAU sequence. Awaiting Allan's explicit OK; 3-year check pending.)
- R2 (v0.6, confirmed by Allan's four blocks): on a flip the broken run's reference candle becomes a pending block; confirmed by a close beyond the prior same-direction run's last valid extreme; dropped if the next flip comes first.
- Lifecycle (Allan 2026-10-01, option a): only the NEWEST live block of each kind stays live; a newer confirmed block clears older ones (02:48 cleared by 03:24 at 03:33).
- Open: does a newer same-kind block also cancel an older FAILED block's pending order? (Would remove the 04:06 re-entry on the 23:48 block, -1.08R.)

## Block use (Allan 2026-10-01): ONE USE, THEN DELETED
- Once a block's order has been filled (block used), the block is deleted - no re-arm. Engine default rearm=False.
- Effect on 30 Sep/01 Oct XAU M3: removes the 04:06 re-entry loss (-1.08R). First-touch (variant A) now fills at 01:21 (+0.90R) and uses the 23:48 block up, so Allan's 02:48 trade (+5.29R) only survives if fills require the engine to be in the COUNTER-run (variant B). Awaiting Allan's yes/no on the counter-run condition.

## E1 entry condition (Allan 2026-10-01 - CONFIRMED)
- A block is entered ONLY after a counter-move brings price back into it (engine in the counter-run at the touch), and a block is DELETED after one use. Engine defaults: require_counter=True, rearm=False.
- Reproduces Allan's trade exactly: 23:48 beta block, fill 02:48, exit 03:24 (exec 03:27 @4147.41), +8.78 pts = +5.29R; no 01:21 first-touch, no 04:06 re-entry.

## R1 REVISED 2026-10-01 (supersedes the 'post-flip BODY test' note) - Allan's narration 04:18-07:15
- A candle is valid if its WHOLE BODY is beyond the reference low/high (bear: body top < ref low; bull: body bottom > ref high).
- EXCEPTION, ONE-SHOT: the candle right after a flip (or run start) is valid if it CLOSES beyond the flip candle's extreme (bear: close < flip low; bull: close > flip high).
- Evidence: reproduces Mon28-Tue29 GBP bear run (flip Mon 12:00 broker, ends Tue 14:00, last valid bear Tue 08:00), XAU 23:36-01:15, and 04:18 valid bull -> 04:24 flip bear -> 04:27 valid bear -> 04:30 flip bull -> 04:57 flip bear -> 06:15 flip bear -> 07:15 flip bear. Last valid bull before the 04:24 break = 04:18 (04:21 is NOT valid).
- 3-year multi-pair check still PENDING.
## E1/E2 clarifications (Allan 2026-10-01)
- FILL: price touches the block's near edge and the engine is in the COUNTER-run after that candle closes (03:42 counts: it flips the engine bull at close). 01:21 does not (engine still bear).
- EXIT: first R1 invalidation of the trade-direction run that forms AFTER the fill (a flip on the fill candle itself does not count), else the stop at the far edge. Block deleted after one use.
- A block can CONFIRM on the same candle that flips the run (04:57).
- Primary (continuation) blocks are entered while INTACT (03:24 example, case #12); beta blocks are entered after they FAIL (23:48, 04:30). How to tell them apart in code: OPEN.

## Block lifecycle: PRIMARY -> BETA (Allan 2026-10-01 - CONFIRMED, engine reproduces his 01 Oct 01:09-07:18 story)
1. Every confirmed block is PRIMARY. Order at the near edge (bull block: buy at its high; bear block: sell at its low), stop at the far edge. Fill = touch + engine in the counter-run after that candle closes. Armed from the candle AFTER confirmation.
2. Primary trade closed by the R1 invalidation exit -> block USED -> DELETED.
3. Primary trade STOPPED at the zone's far edge (or block fails by close before any fill) -> block becomes BETA: flip-side order at the near edge from the other side (failed bull block: sell at its low, SL its high; failed bear block: buy at its high, SL its low). Same fill rule. Beta used -> DELETED.
4. A newer confirmed block of the same kind clears older LIVE blocks (and cancels their unfilled primary orders).
- 30 Sep/01 Oct XAU M3 (broker time): 01:09 primary buy -1.10R -> 02:48 beta sell +5.29R -> 03:42 primary sell -1.03R (03:24 beta never filled) -> 05:51 primary sell -1.03R -> 06:36 beta buy +2.38R = +4.51R (5 trades).
- Open: 3-year check of the R1 one-shot-close rule; replay of the rest of 01 Oct (from 07:18); position sizing / SL buffers.

## 3-year check - gold H1 (Dukascopy, Sep 2023-Sep 2026, 18,034 bars) - run 2026-10-01, scanner/sme_gold_3y.py
- FULL rule as coded (one-shot-close R1, counter-run fill, one use, primary->beta, spread 0.20): 629 trades, 24% win, avgR -0.22, total -136R, PF 0.70, maxDD 142R. All four years negative.
- Gross -121R (not a spread problem). R1-exit trades win 69% (+1.26R); 65% of trades end at the stop (21% on the fill candle).
- Variants: old validity (body below low) -81R | primary only -60R | fill on first touch +39R (PF 1.08) | beta trades 20% win.
- Caveat: rules were drawn on ~1.5 days of XAU M3; H1 zones are ~11pt wide. Needs a 3-year M3 gold test before any conclusion. NOT ready for live use.

## M3 gold check - XAUUSDr, 1 Sep -> 1 Oct 2026 (10,395 bars, real spread ~14pt), run 2026-10-01 (snapshot XAUUSDr_M3_2026-09-01_to_now.csv sha 4fbc35b85270)
- FULL rule (counter-run fill): 420 trades, 24% win, avgR -0.14, total -57.7R, PF 0.81. Last week (from 24 Sep): 107 trades, -0.8R, PF 0.99 (partly in-sample: rules were fitted on 28 Sep-01 Oct). Sep 1-23 (cleaner out-of-sample): about -57R.
- Fill on FIRST TOUCH: 478 trades, 35% win, +0.10R avg, +50.0R, PF 1.19, maxDD 27R; last week +15.3R. Positive on H1 3y too (+39R, PF 1.08). The counter-run filter is what costs money in the data.
- Old validity rule worse on M3 (-97R, PF 0.67) - the one-shot-close R1 tweak HELPS on M3 (it hurt on H1).
- Beta trades: 155, 21% win, -36.8R; primary trades: 265, 26% win, -20.9R. Primary-only -10.5R.
- One month, one instrument: not conclusive. Next: deeper M3 history (MT5), split by block type.

## Extra-rule candidates tested 2026-10-01 (XAU M3, 1 Sep-1 Oct, engine params: min_zone, bias, be_at, expiry, sl_buf, day_cap, max_spread - all OFF by default)
- MIN ZONE 3.0 pts: first-touch +14.7R (PF 1.19->1.46, maxDD 27->12) and positive in BOTH halves (Sep1-15 +39R, Sep16-Oct1 +25R); counter-run +23.6R (still negative). Reason: spread ~14pt is 5-10% of a 1.5-3pt zone.
- H1 BIAS (trade only with the last closed H1 run): counter-run +48R, first-touch +12.6R; helps Sep1-15 a lot, Sep16-Oct1 still negative. Matches Allan's "bias" workflow.
- BREAKEVEN @ +2R: +5R / +9R, small and consistent.
- Mixed / not adopted: order expiry, stop buffer, daily loss cap (helps one fill mode, hurts the other); spread filter useless (spread is 14pt 94% of the time).
- REGIME CAUTION: base first-touch +52R (Sep1-15) then -2R (Sep16-Oct1); counter-run +6R then -64R. One month, 15 variants tried = data-mining risk. Need deeper M3 history before adopting.

## Extra rules on 3-year gold H1 (spread 0.20) - run 2026-10-01
- HIGHER-TF BIAS (analogue: H4 run for H1 bars; H1 run for M3 bars) is the only candidate that helps in ALL four tests: H1 3y counter-run -135.7 -> -84.1R, first-touch +39.1 -> +58.9R (PF 1.18); M3 month +48R / +12.6R.
- MIN ZONE: counter-run improves monotonically with threshold (3/5/8/12pt: -107/-86/-68/-52R) but avgR stays ~ -0.16 (mostly fewer trades, no edge). First-touch: 3pt +45.1R (PF 1.10), but 5/8/12pt hurt (+7.9/-15.7/-12.0R). Fixed-point thresholds are not scale-free: median zone 3.8pt (2023) -> 22.3pt (2026). Use spread-multiple or ATR-relative instead.
- BREAKEVEN @ +2R: helps counter-run (+8R) but hurts first-touch (-15.9R) on H1 - inconsistent, dropped.
- First-touch base by year: 2023 +23.7 | 2024 -21.3 | 2025 +39.4 | 2026 -2.7 (unstable). Counter-run negative every year.
- Counter-run is the weaker fill rule on every sample so far (H1 3y -136R vs +39R; M3 month -58R vs +50R).

## DECISION 2026-10-01 (Allan): SESSION BIAS = THE PREVIOUS SESSION
- Each session is traded with the direction of the session BEFORE it: London <- Asia, New York <- London, Asia <- New York. Sells need a bear read, buys a bull read; no read = no trade. Fixed for the whole session.
- Sessions, broker time (no gaps): Asia 01:00-09:00 | London 09:00-16:00 (Allan's window, = 07:00-14:00 UTC+1) | New York 16:00-00:00. Gold's daily break is ~00:00-01:00 broker. Times shift with the broker's seasonal clock change.
- Working read of a session: NET MOVE (last close vs first open) - simplest and best in tests (M3 month PF 1.32, H1 3y PF 1.43, +0.19/+0.25R avg). Alternative read: RUN STATE of the session's own H1 candles (PF 1.29 / 1.36). Engine: --bias netmove|runstate (broker clock).
- Evidence: Asia and New York bias consistent on M3 month and 3y H1; LONDON mixed (M3 month: against-bias better; 3y: with-bias clearly better).
- PLANNED, not built yet: Allan's fuller read - compute the LAST VALID POINT of every session and judge whether the next session breaks or holds it (full-flow structure). Per-session prior-session key is used first because it is simpler.
- Example 29 Sep: Asia <- NY(28th) = BEAR (4154.14 -> 4114.71); London <- Asia = BULL (4118.09 -> 4138.93); New York <- London = BULL. (Allan's 17:00 28th reading would say BEAR for London - the two methods disagree that day.)

## Live H1 bias (Allan's read: previous session's last valid candle, flips when it breaks) - tested 2026-10-01
- Engine's H1 run state reproduces Allan's Fri 25 Sep Asia read exactly (bull -> last valid bull 04:00 -> break 06:00 -> last valid bear 07:00 -> 08:00 inside -> 09:00 breaks above 07:00 high -> bull from 10:00). It FIXES Fri 25 London (+5.47R vs -2.13R for the fixed previous-session net move).
- Over 25 Sep-1 Oct it still trails the fixed read (+11.5R vs +18.4R); sessions with 2+ H1 flips: n=40, avgR -0.31 (0 flips +0.24, 1 flip +0.27).
- MAX 1 FLIP PER SESSION (freeze after the first flip): changes almost nothing - M3 month +36.7R vs +37.4R unlimited (fixed net move +44.0R), 25 Sep-1 Oct +12.5R vs +11.5R, 3y H1 +35.9R vs +37.2R (fixed net move +123.2R). The losing sessions (1 Oct London/NY, 30 NY) had a single flip, so the cap does not touch them. NOT adopted.
- Working bias stays: previous-session NET MOVE (fixed per session). Troubled sessions being worked day by day from 25 Sep: 25 NY, 25 London (fixed by live bias), 30 London, 1 Oct Asia, 29 Asia.

## BASELINE v1 - best reproducible configuration (2026-10-01) - scanner/sme_baseline.py, comparison in scanner/sme_grid.py
- Config: R1 one-shot close | v0.6 blocks | FIRST-TOUCH limit fill at the near edge, stop at far edge, one use then deleted | exit = first R1 invalidation (next open) or stop | BIAS = previous-session NET MOVE, fixed per session (Asia 01-09, London 09-16, NY 16-24 broker) | PRIMARY entries only (beta OFF).
- Results (first-touch, net of spread): XAU M3 1 Sep-1 Oct: 180 trades, +0.29R avg, +52.4R, PF 1.54 (1-15 Sep +48.7R, 16 Sep-1 Oct +3.6R). Gold H1 3y: 437 trades, +0.27R avg, +117.1R, PF 1.51, ALL 4 years positive (+23.3/+29.8/+45.8/+18.1R). Data shas: M3 4fbc35b85270, H1 810f76854508. Trade lists: reports/baseline_v1_*.csv.
- Original rule (counter-run fill, no bias, beta on): M3 -57.7R, H1 -135.7R, 0/4 years positive.
- 64-config grid: 32 profitable on both datasets, 20 also consistent (both M3 halves + >=3/4 years); every top config uses FIRST-TOUCH.
- Component verdicts: first-touch >> counter-run | prev-session net move bias: +23R avg effect on H1, ~neutral on M3 | beta entries: more total R but lower PF (M3 +78.4R PF 1.53 / H1 +112.4R PF 1.32 with beta on) - option, not baseline | min zone: mixed | A (V-base break): lowers totals - not adopted | B (swing-structure filter): M3 PF 2.03 but H1 falls to +27.3R and 2023 goes negative - optional switch (--with-structure), not adopted.
- Caveats: only ONE month of M3; M3 edge faded in the second half of Sep (+3.6R); 64 configs chosen on the same data (selection bias - expect lower live results); limit fills at touch are optimistic (queue/slippage), same-candle stops are pessimistic; 3y sessions fixed in UTC (DST drifts 1h). Next: deeper M3 history + walk-forward test, then paper/forward test on the live feed.
