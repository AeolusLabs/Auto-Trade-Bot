# Auto Trade Bot (Forex Agent Platform, MT5): Control Plane + Dashboard

Scope: platform, dashboard, architecture, **and (v5) the automated Execution Engine and research pipeline (§15)**. Strategy *content* (the actual edge) is jointly owned by the two founders and developed through the §15 pipeline. This document defines the contract between the pieces so they can be built in parallel.

Status: DRAFT v5 · 2026-10-03 · decisions locked: **fully automated forex trading (scalping and longer day trades) on personal capital first, prop-firm adaptable later**; the Monitor/Control layer stays **reduce-only and independent of the Execution Engine**; MQL5 + Python strategies; self-hosted. Broker, pairs, timeframes and strategies are **not yet known** and are treated as configuration, not code (§15.6). Remaining questions in §12.

---

## 1. What MT5 constrains (design drivers)

These are platform facts that shape everything. Verify each against the broker/terminal build before M1.

1. **The MT5 terminal is a Windows desktop app.** The official `MetaTrader5` Python package talks to a *locally installed* terminal over IPC. It is Windows-only. No cloud API from the broker exists for retail accounts (Manager/Web APIs are broker-side).
2. **One terminal process serves one logged-in account.** Multiple accounts = multiple terminal instances (portable-mode installs).
3. **The Python API is pull-based.** `positions_get`, `orders_get`, `history_deals_get`, `account_info`, `symbol_info_tick`, `copy_rates_*`. There is no push stream of trade events. An MQL5 EA does get push (`OnTradeTransaction`, `OnTimer`) and can call `WebRequest`, but only to URLs whitelisted in the terminal's options.
4. **Credentials:** a *trading (master)* password can trade. An *investor* password is read-only. This gives us two honest integration tiers: **Monitor** (investor, cannot hurt you) and **Control** (master, can flatten/kill).
5. **Account margin mode matters.** *Hedging* accounts hold multiple positions per symbol. *Netting* accounts hold one net position per symbol. Position accounting differs.
6. **Order → deal → position.** A position is opened/closed by *deals*; `position_id` links them; `DEAL_ENTRY` is in / out / inout / out_by. P&L, commission and swap live on deals.
7. **Broker server time is not UTC** (often GMT+2/+3 with DST) and symbol names differ per broker (`EURUSD`, `EURUSD.m`, `EURUSDm`). Both silently corrupt analytics if not normalized at ingest.
8. **Spot FX has tick volume only,** not real volume. Don't build volume analytics that imply otherwise.
9. **Pips are not universal.** Use `tick_size`, `tick_value`, `digits`, contract size and account-currency conversion from `symbol_info`. Never hardcode 0.0001.
10. **Strategies will be MQL5 EAs and/or Python scripts.** The platform must not assume which. Control must work for both.

## 2. Product definition

**One-liner:** a control plane that connects MT5 accounts and the strategies running on them, shows what they are doing and whether they are working (net of spread, commission and swap), and alerts a human early when a limit or prop-firm rule is about to be breached. Accounts that opt in to Control can also be paused, have pending orders cancelled, be flattened or be killed. Control is **reduce-only**: the platform can only lower risk, never open or increase a position.

**Users (decided):** you and your partner (operators) plus friends and family (each sees only their own accounts). Internal use, self-hosted, not a public product yet.

**Jobs, in priority order:**
1. Am I safe? Margin level, drawdown vs limit, exposure, bridge/terminal alive, alerts reach me.
2. What is it doing right now? Open positions, pending orders, last decisions.
3. Is it any good? Net P&L, expectancy, drawdown, with honest sample sizes.
4. Why did it do that? Per-trade trace tied to strategy/EA version.
5. What changed? Config, version, limit and command history.

**Non-goals v1:** **opening or increasing positions from the control plane or dashboard** (the Monitor/Control layer is reduce-only by design; entries come only from the Execution Engine in §15, which runs as a separate process with its own risk gate), a strategy-authoring UI (research is code + CLI, §15), copy-trading, billing, public signup, native mobile app, non-MT5 venues, broker-side (Manager API) integration.

## 3. Architecture

```
 WINDOWS HOST (VPS or PC)                          CONTROL PLANE (cloud / self-host)
┌───────────────────────────────────┐   outbound   ┌─────────────────────────────────┐
│ MT5 terminal #1 (acct A) ─┐       │   HTTPS      │ Ingest API ─► Postgres          │
│ MT5 terminal #2 (acct B) ─┤       │ batched      │  idempotent     events (append) │
│  EAs / strategy scripts   │       │ events +     │  validate       trades,rollups  │
│            ▲              │       │ heartbeats   │                 audit_log       │
│     ┌──────┴───────┐      │ ────────────────►   │ Command API ◄── Web app (Next)  │
│     │ BRIDGE       │      │ ◄────────────────   │  signed cmds     SSE live feed  │
│     │ (Python svc) │      │ signed commands     │                  RBAC / orgs    │
│     │ MT5 API poll │      │ (pulled, acked)     └─────────────────────────────────┘
│     │ + local spool│      │
│ Passwords: NEVER leave host│
└───────────────────────────────────┘
```

Decisions and why:

- **Bridge = the product's core runner.** A Python Windows service per host. It owns one terminal instance per account, polls MT5, normalizes (UTC, canonical symbols, pip values), and emits contract events. Because the MT5 API has no push, the bridge uses short-interval polling for positions/account (1–2s) and incremental history sync keyed on last deal ticket/time. (chisle: polling first; add the optional Reporter EA below only if polling latency proves insufficient.)
- **Optional Reporter EA (MQL5).** Thin EA using `OnTradeTransaction` + `OnTimer` + `WebRequest` for event-driven reporting without Python, and as a Monitor-tier option where the user cannot run a bridge. Needs URL whitelisting. Not required for v1.
- **Two tiers per account.** *Monitor* = investor (read-only) password. *Control* = master password, opt-in per account by its owner. Passwords live only on the bridge host (Windows Credential Manager / DPAPI); the control plane never stores one.
- **Outbound-only, commands pulled.** No inbound ports on the bridge host. Commands are signed, nonce'd and acked.
- **Event-sourced telemetry** into **Postgres** (add TimescaleDB later if tick/equity volume needs it). Derived tables and materialized rollups serve the dashboard. No Kafka/ClickHouse until measured.
- **SSE** for live UI. **Next.js + TypeScript + Tailwind + shadcn** web app.
- **Limits are a protected record.** Strategies read, never write. The rules engine (§6.9) computes distance-to-breach and alerts; on Control accounts it can optionally take a de-risking action (opt-in, §6.9).
- **Do not use third-party cloud MT5 bridges (e.g. MetaApi) by default.** They require handing broker credentials to another party. Offer as an explicit opt-in adapter only if the "no VPS" use case becomes a priority.

### 3.1 Control: what it can and cannot do (decided: Monitor + Control)

**Reduce-only invariant (hard rule).** The bridge may only: close an existing position (by `position` ticket, opposite deal), delete a pending order, and set the platform-side pause flag. It must not open a position, add volume, place a pending order, or widen a stop. A CI test greps/lints the bridge for any `order_send` call that is not a close or a remove, and fails the build.

| Action | How | Limit |
|---|---|---|
| Pause new entries | Bridge sets `trading_enabled=false`; cooperating EAs/Python scripts read it via `AutoTradeGuard.mqh` / the Python helper | A strategy that does not include the guard cannot be soft-paused |
| Cancel pending | `TRADE_ACTION_REMOVE` per pending order | Needs master password; per-ticket result |
| Flatten (scope: account / agent-magic / symbol) | Close each position at market, loop until flat or retry budget exhausted | Market closed, requotes, stops/freeze level, per-symbol filling mode (FOK/IOC/return), partial fills; reports partial results honestly |
| Kill | Pause flag + cancel pending + flatten loop; escalate to terminating that account's terminal process | Last resort; a rogue EA cannot re-enter once its terminal is down. Terminal restart requires a human |
| Tighten limits | Stored limit changes; guard-aware EAs enforce | Bridge cannot veto an EA's own orders from outside the terminal. Loosening needs operator role |
| Toggle AutoTrading | **Not** reliably controllable via the Python API; read `terminal_info().trade_allowed` and alert on mismatch | Monitored state, not a switch |

UI rule: show **sent / acked / executed / partially executed / failed / unreachable** as distinct states. Never show a green "paused" or "flat" unless the next account snapshot confirms it.

Tier mechanics: an account starts as Monitor. Upgrading to Control requires the owner to supply the master password (host-local) and tick an explicit consent. Downgrading wipes the stored master password. To verify in M0: investor-login behavior of `account_info` / `terminal_info` / history, and, on a demo account, that closes by position ticket, pending-order removal and filling-mode selection work on both a hedging and a netting account.

## 4. The Agent Contract (interface with your partner)

Freeze first, version it (`schema_version`).

### 4.1 Entities
- **Host:** a Windows machine running the bridge (`host_id`, OS, bridge version, last seen).
- **Account:** MT5 login on a server (`account_id`, broker, server, login, currency, leverage, margin_mode netting|hedging, tier monitor|control, mode demo|real|contest, balance basis).
- **Agent (strategy instance):** an EA or script on an account, identified by **magic number** + name + version (`agent_id`, `account_id`, `magic`, `kind` ea|script|manual, `strategy_version`, `symbols[]`, `timeframes[]`). Trades with magic `0` are **manual** and shown as such.

### 4.2 Event envelope
```json
{ "event_id": "uuid (idempotency key)", "schema_version": 1, "host_id": "…",
  "account_id": "…", "agent_id": "… or null", "seq": 1042,
  "ts_utc": "ISO-8601 UTC (normalized)", "ts_broker": "raw broker time", "type": "…", "payload": {} }
```
`seq` is monotonic per account stream so the server detects gaps. Both timestamps are kept (broker-time-offset bugs are common).

### 4.3 Event types (minimum)
| type | payload (key fields) |
|---|---|
| `heartbeat` | bridge_ok, terminal_connected, trade_allowed, ping_ms, server_time_offset_s, cpu/mem, spool_depth |
| `account` | balance, equity, margin, free_margin, margin_level, profit, credit, leverage |
| `order.placed` / `.modified` / `.cancelled` / `.rejected` | ticket, symbol, type, volume, price, sl, tp, magic, comment, retcode, latency_ms |
| `deal` | deal_ticket, position_id, order_ticket, symbol, entry(in/out/inout/out_by), type, volume, price, commission, swap, fee, profit, magic, reason (client/EA/SL/TP/SO), slippage_points |
| `position.open` / `.update` / `.close` | position_id, symbol, type, volume, open_price, sl, tp, floating_pl, swap, magic |
| `quote` (sampled) | symbol, bid, ask, spread_points, tick_ts |
| `symbol.spec` | canonical, broker_symbol, digits, tick_size, tick_value, contract_size, swap_long/short, session info |
| `risk` | gate, tripped, limit, value (daily loss, max DD, margin level floor) |
| `decision` *(optional, from EA/guard)* | signal summary, reason, filters that blocked entry |
| `strategy.version` | version, config_hash, source ref |
| `error` | component, code, mt5_last_error, message, retryable |

`decision` is optional; most EAs will emit none. The dashboard must still be fully useful from `deal`/`position`/`account` alone, which the bridge produces **without any change to the strategy**.

### 4.4 Commands (control plane → host, signed, idempotent, acked)

`pause_entries`, `resume_entries`, `cancel_pending {scope}`, `flatten {scope: account|agent|symbol}`, `kill`, `set_limits {…}` (tighten-only without operator role), `reload_config`. No command can open or increase exposure; the schema has no such verb. Each command carries `command_id`, `account_id`, `issued_by`, `ts`, `nonce`, Ed25519 signature; the bridge verifies, de-duplicates, and acks with a per-ticket result list. Everything lands in `audit_log`.

### 4.5 Strategy integration: MQL5 and Python (zero-touch, with an optional guard)

Because the bridge reads the account, **both MQL5 EAs and Python strategies are supported with no code change** for monitoring. Attribution is by convention:

1. **Magic number registry.** Each strategy instance uses a unique magic number. The platform's `agents` table maps `(account, magic)` to name + version. Magic `0` = manual.
2. **Comment convention.** Strategies write `name|version` (or short id) into the order comment so version is visible per trade.
3. **`AutoTradeGuard.mqh` (MQL5) and `autotrade_guard.py` (Python)**, optional but needed for soft pause and limit enforcement: before opening an order, call `AutoTradeGuard_Allowed(symbol, volume)`. It reads the bridge's local flag/limits and returns allow/deny. Without it, only flatten/cancel/kill work on that strategy.
4. **Later:** `decision` events (why a trade was taken or skipped) via a Reporter EA or the Python helper. Dashboard must be fully useful without them.

Partner's burden: adopt (1) and (2) now, add (3) when ready to support soft pause. Same contract for both languages.

## 5. Data model (Postgres)

- `orgs`, `users`, `memberships`, `api_tokens` (hashed)
- `hosts`, `accounts`, `agents`, `agent_versions`, `symbols` (canonical ↔ broker mapping, specs history)
- `events` (append-only, partitioned by day, unique `event_id`, index `(account_id, seq)`, `(account_id, ts_utc)`; `payload jsonb`)
- Derived: `orders`, `deals`, `positions`, `trades` (a **trade = position round trip**, built from deals; handles partial closes, scale-in/out, netting vs hedging), `equity_points` (1s–1m, downsampled), `quotes_sampled`
- Rollups (materialized, incremental): per account/agent × {1h, 1d}: pnl gross/net, commission, swap, trades, win rate, drawdown, exposure
- `risk_limits` (protected role), `commands`, `audit_log` (no UPDATE/DELETE grant), `alerts`

Rules: money as `numeric`/integer minor units in **account currency**, store original too; UTC everywhere with raw broker ts retained; every derived row traceable to event ids; netting accounts reconstructed carefully (a single position's deals may reverse direction).

## 6. Metrics catalog (what must be captured and monitored)

Each metric: definition · source · scope (account / agent / symbol / session / version) · min-n rule.

### 6.1 Account health (the "am I safe" row)
- Balance, **equity**, floating P&L, margin used, free margin, **margin level %**, distance to margin call and stop-out (levels from broker), leverage in use vs account leverage, credit
- Intraday/high-water-mark equity; **daily loss vs limit**; **max drawdown vs limit** (balance-based and equity-based, since prop rules differ)
- Open position count, total lots, **net exposure per currency** (long EUR/short USD across all pairs, converted to account currency) and gross exposure
- Margin-level trend and "time to stop-out if adverse move = X pips" scenario

### 6.2 Performance (always net: commission + swap + spread-aware)
- Equity curve, balance curve, P&L gross vs net, **cost drag** (spread + commission + swap as % of gross)
- Trades, win rate, average win/loss, payoff ratio, **expectancy (account currency, pips, and R)**, profit factor
- Max drawdown (depth, duration, recovery), Calmar, Sortino, Sharpe **with CI and n**; **deflated Sharpe** across tried variants; rolling 7/30/90d; **worst walk-forward fold**
- Streaks (max consecutive losses) vs expected for the win rate
- By dimension: symbol, direction, session (Asia/London/NY/overlaps), weekday, hour, holding time, strategy version

### 6.3 Trade quality
- **MAE / MFE** per trade (needs tick/1m path from bridge; sample), efficiency (realized ÷ MFE)
- Holding time distribution; R-multiple distribution (needs SL at entry)
- Swap carried, overnight/weekend holds, Wednesday triple-swap exposure
- Trades without SL (flag), SL/TP hit mix, exit reason mix (EA / SL / TP / manual / stop-out)

### 6.4 Execution quality (forex-specific)
- **Spread at entry and exit** (points), spread percentiles by symbol and hour, spread-widening events (news, rollover)
- **Slippage** (requested vs fill) mean/p95, positive vs negative, by symbol/session
- Requote/reject rate by `retcode`; order→fill latency; **ping to broker server**
- Commission per lot actual vs expected; swap actual vs symbol spec
- Fill-vs-quote: cost of entry vs mid

### 6.5 Exposure and concentration
- Per-currency net exposure and **correlated-pair clustering** (e.g. long EURUSD + long GBPUSD + short USDCHF = one USD bet)
- Concentration by symbol, strategy, direction; lots as % of equity; risk-at-stop (sum of SL distance × lots) as % equity
- **Scheduled-event exposure:** positions open into high-impact news (needs an economic-calendar feed; see §12)

### 6.6 System health (SRE view)
- Bridge heartbeat age; terminal connected; **`trade_allowed` / AutoTrading state**; MT5 `last_error` rate; server ping; **broker server time offset** (alert on change, e.g. DST)
- Event pipeline: ingest lag, `seq` gaps, spool depth, duplicates, replay count
- Host: CPU/mem/disk, terminal restarts, uptime
- Data freshness: age of last quote/account event per account
- Reconciliation: platform-derived equity/positions vs fresh `account_info` snapshot; **mismatch = alert**

### 6.7 Agent ops
- Per EA/magic: trades/day, P&L, drawdown, version, uptime, **inactivity** (expected to trade, hasn't), unexpected activity outside its schedule/symbols
- Version comparison (small multiples) with deflated-Sharpe verdict
- Config drift: running config hash vs approved
- (If LLM-driven agents later: tokens/cost per day. Not in v1 scope.)

### 6.8 Governance
- Immutable audit log: who changed which limit, from/to, when; command history with ack outcome
- Manual interventions on an agent's positions (magic 0 touching magic X trades)
- Credential-tier changes (monitor ↔ control)

### 6.9 Rules engine: individual and prop-firm profiles (in v1)

One engine, two profile types, rules stored as **data** (not code) so new firms are config, not releases.

- **Individual profile:** self-imposed limits: daily loss, max drawdown, max risk per trade, max open lots, max exposure per currency, weekend-holding policy.
- **Prop profile:** firm presets: daily loss (balance- or equity-based, with the firm's reset time and timezone), max loss (static or trailing), profit target, minimum trading days, consistency rule, max lots/leverage, news-trading restriction, weekend ban, inactivity limit, phase (challenge/verification/funded).
- Each rule shows **current value, limit, distance to breach, and projected time-to-breach** at current drawdown speed. Breach-imminent (e.g. 80% / 90%) is the top alert class.
- **Honesty rule:** our numbers are estimates built from account snapshots. Firms compute equity at their own times and with their own spreads. Label every prop rule "estimate, firm's tracker is authoritative" and support a configurable safety buffer.
- **Auto-protect (opt-in, Control accounts only, default OFF):** a rule can be bound to a reduce-only action, e.g. at 95% of daily loss: pause entries; at 98%: flatten. Every automatic action is audited, notifies the owner, and respects a cooldown so it cannot flap. Alert-only is the default because a wrong auto-flatten costs real money too.
- Presets for specific firms are added once you tell us which ones friends use (§12). No firm rules are assumed.

### 6.10 Alerts (v1)
Bridge heartbeat missed · terminal disconnected · AutoTrading off while agents expected · margin level < X · daily loss at 70/90/100% of limit · drawdown limit · stop-out occurred · position without SL · spread > Y× normal at open · slippage spike · reject rate spike · `seq` gap · broker time-offset change · reconciliation mismatch · agent inactive/rogue. Each: severity, owner, dedupe, snooze, runbook link. Delivery: in-app, Telegram/Discord webhook, email.

## 7. Dashboard information architecture

Left rail: **Overview · Accounts · Agents · Trades · Performance · Risk · Execution · System · Audit · Settings**

1. **Overview.** Top strip: global **Kill** (typed confirm; Control accounts only), total equity, today P&L, worst margin level, accounts healthy n/m, alerts. Grid of **account cards** (status icon+label, mode badge DEMO/REAL, equity sparkline, day P&L vs daily-loss limit bar, margin level gauge). Right: live activity feed (fills, closes, rejects). Below: currency-exposure heatmap (net per currency, all accounts).
2. **Account detail.** Header: broker/server, tier, margin mode, bridge/terminal/AutoTrading states, actions (pause entries, cancel pending, flatten, kill) shown on Control-tier accounts; Monitor accounts show the runbook instead. Tabs: *Live* (positions + pendings + feed), *Performance*, *Risk* (margin, exposure, rule distances), *Execution*, *Agents on this account*, *Config*.
3. **Agent detail.** Magic/version, symbols, schedule, health (inactive?), P&L/DD, trades, version history, config drift, per-symbol/session breakdown, MAE/MFE scatter.
4. **Trades.** Table first (virtualized, filter by account/agent/symbol/date/outcome/session), trade detail drawer: entry/exit, costs, MAE/MFE, R, SL/TP, deals timeline, price path mini-chart. Export CSV.
5. **Performance.** Equity + drawdown (stacked panels, shared x, never dual-axis), net vs gross, cost drag, P&L heat-grid (weekday × hour, diverging palette), session bars, distribution charts, version comparison, walk-forward folds, statistical-confidence card with plain-language verdict ("Insufficient data: 23 trades").
6. **Risk.** Margin level, DD vs limits, rule-distance bars (prop module), exposure by currency/pair clusters, risk-at-stop, scenario sliders ("if USD +1%").
7. **Execution.** Spread by symbol/hour (heat grid), slippage distribution, reject funnel by retcode, latency/ping, commission/swap audit.
8. **System.** Hosts and terminals matrix, heartbeat timeline, pipeline lag/gaps, time-offset history, reconciliation status.
9. **Audit.** Searchable log of commands, limit changes, version changes, manual interventions.

Principles: every number links to its definition and underlying rows; every chart has a table view; statistics show **n** and uncertainty; "last updated Ns ago" on every live panel; empty and insufficient-data states are designed; units explicit (pips vs points vs account currency, always labelled and switchable).

## 8. Design direction

Hallmark gate (inferred, correct me): **Audience** discretionary/algo FX traders and the strategy developers; **Use case** verify safety and performance at a glance, act fast when something is wrong; **Tone** utilitarian/technical.

- Genre modern-minimal / dense instrument UI; Cobalt-family theme (grotesk + tabular mono figures); dark default, light supported, each *selected*, not inverted.
- Tokens only (`tokens.css`, OKLCH); 4pt spacing; no invented stats, no marketing blocks; no fake window chrome.
- **Dataviz (dataviz skill):** one axis per chart; form chosen by job (equity → line, drawdown → area under zero, distributions → histogram, hour×weekday → heat grid, exposure → diverging bar by currency); **fixed hue per account/agent** stable across filters; sequential = one hue; diverging = two hues + neutral (long/short, profit/loss); **reserved status colors with icon + label**; thin marks, recessive grid, selective labels, crosshair tooltip; validate palette with `validate_palette.js` (light + dark + CVD) before shipping.
- **Colour caution for FX:** profit/loss red/green is a CVD trap. Use a validated diverging pair + sign (+/−) + arrow glyph; never color alone.
- Account-state badges (DEMO / REAL / PROP, tier MONITOR / CONTROL, health), active alerts and the Kill control carry the highest visual weight; REAL and PROP accounts carry a persistent colored edge. Every destructive action: typed confirmation that lists exactly which positions and orders will close, then a per-ticket result view (done / failed + retcode).
- A11y: 4.5:1 text, visible focus, 44px targets, reduced motion, keyboard-first (command palette, table navigation), table alternative for charts.
- Responsive 320–1440; mobile = monitor + alerts + breach distances + flatten/kill (friends will mostly use the phone); analysis is desktop-first.
- Motion minimal: number flash on tick (150ms, opacity), no decorative animation.
- Run `plan-design-review` before build and `design-review` + Hallmark slop gates per milestone.

## 9. Security (Monitor + Control, friends and family)

- **Passwords never in the control plane DB.** Investor (Monitor) and master (Control) passwords live on the bridge host in Windows Credential Manager / DPAPI. A full cloud breach cannot trade. A full *host* breach with Control accounts can close positions, though never open them, because the bridge code has no opening path (reduce-only invariant, CI-enforced). Master passwords can still withdraw or change settings at the broker if the broker allows it with that password; this is why Control is opt-in and the host must be hardened (disk encryption, minimal software, RDP locked down, no shared logins).
- **Consent and revoke.** Control tier requires the account owner's explicit, recorded opt-in per account. Provide one-click downgrade that deletes the stored master password. Remind friends to change their master password if they stop using the platform.
- Commands: Ed25519-signed, nonce + timestamp (replay-proof), idempotent by `command_id`, acked, fully audited. The bridge verifies the signature against a pinned key and refuses unsigned or stale commands. Rate-limit command issuance.
- Bridge to control plane: per-host ingest key (hashed at rest, rotatable), TLS only, strict versioned payload validation, rate limits.
- User auth: email + password (hashed) or magic link, 2FA required for anyone who can issue commands. **Each user sees only accounts they own or were granted**, enforced by Postgres RLS (owner/org on every table) with tests that user A cannot read or command user B's accounts.
- Roles: **admin** (you/partner), **owner/operator** (an account's owner may issue reduce-only commands on their own accounts), **viewer** (read-only, e.g. a spouse). Tightening limits and kill: any role with command access. Loosening limits: operator+ only, logged. Kill/flatten require typed confirmation.
- `audit_log`: logins, account adds, tier changes, rule/limit changes, every command and result (append-only; no UPDATE/DELETE grant for the app role).
- **One shared sanitizer plus a global response safety net:** one `toPublic*()` per row type and middleware that strips known-sensitive keys (password hashes, tokens, ingest keys, any credential field) from every outgoing body. Day one.
- Any session regeneration (`req.login`, `session.regenerate/save`) sends its response **inside** the callback. Prefer stateless signed sessions to avoid the class.
- DB schema changes are applied in the same task; CI verifies DB matches the ORM.
- Privacy: balances and trades are personal financial data. Access logs, minimal raw-quote retention, per-user export and delete.
- **Legal/trust:** operating friends' accounts with their consent is lower risk than a public service, but holding someone's master password to act on their account can still raise licensing or liability questions depending on jurisdiction, and a bug can cost a friend real money. Get written consent, keep the reduce-only scope, and get advice before widening the audience or charging.

## 10. Reliability

- At-least-once delivery from host spool; idempotent ingest by `event_id`; ordered replay; `seq` gap detection shown in UI ("N events missing") rather than silently wrong numbers.
- **Source of truth split:** the broker/terminal is truth for money and positions (reconcile against `account_info`/`positions_get` snapshots); the event log is truth for behavior.
- Late/backfilled history: bridge does a full history resync on first connect and after any gap, keyed on deal ticket/time; derived tables must be rebuildable from events.
- Handle MT5 realities: terminal restarts, weekend market close, disconnect/reconnect, broker rollover spread spikes, DST offset change, symbol rename, partial closes, hedging-to-netting differences.
- Postgres backups + PITR with a documented restore drill; platform SLOs (ingest p95 < 2s, UI freshness < 5s, command delivery p95 < 10s); feature flags; staged rollout for anything touching Control.

## 11. Delivery plan (Monitor + Control)

- **M0 · Contract + proof (1 wk).** Freeze §4 with partner. JSON Schemas and conformance tests. **Spike on a MetaQuotes-Demo account:** bridge logs in (investor), pulls `account_info`, `positions_get`, `history_deals_get`, `symbol_info`, emits normalized events (UTC, canonical symbols, pip values). Then with a master login on demo: close by position ticket and remove a pending order on hedging and netting accounts, including filling-mode handling. Build the `trade` builder with fixtures (partial close, scale-in, netting reverse).
- **M1 · Observe (2–3 wks).** Ingest API, Postgres schema + RLS, bridge v1 (multi-account, local spool, resync, heartbeats), derived `trades`, auth, Overview + Account detail (Live) + Trades, first alerts (heartbeat, margin level, daily loss).
- **M2 · Control (2 wks).** Command channel (signed/acked), pause/cancel/flatten/kill with per-ticket results, reduce-only CI guard, tier upgrade/downgrade flow with consent, `AutoTradeGuard.mqh` + `autotrade_guard.py`, audit log, typed-confirm UX. Chaos tests: drop network, kill bridge, kill terminal, market closed, double-send, replayed command, bad signature, partial fills.
- **M3 · Analytics (3 wks).** Rollups, Performance / Execution / Risk pages, MAE/MFE, currency exposure, session/hour grids, deflated Sharpe, min-n gating, table views, a11y pass.
- **M4 · Rules (2 wks).** Rules engine with individual and prop profiles, distance- and time-to-breach, prop presets for firms you name, **auto-protect (opt-in)**, full alert set and routing.
- **M5 · Harden + onboard (2 wks).** Reconciliation, RLS tests, read-only/privilege probe on add-account, add-account flow, bridge installer, host hardening checklist, backups and restore drill, docs, runbooks, invite friends.
- **Later:** Reporter EA, `decision` events, news-exposure, hosted offering.

Definition of done per milestone: contract tests green, derived numbers match the terminal on a replayed week, a11y clean, design review passed, runbooks written. M2 additionally: every command path demonstrated on demo accounts for both account types, with failure injection, before any REAL account gets Control.

## 12. Decisions

**Locked (your answers):** (1) **Monitor + Control**, with control reduce-only and opt-in per account. (2) MQL5 and Python strategies, zero-touch attribution via magic number + comment, optional guard include for soft pause. (3) Platform is MetaTrader 5. (4) Individual and prop-firm profiles in one rules engine. (5) Self-hosted, internal, friends and family only. **v5 additions:** (6) the product goal is a **fully automated trading system** (scalping + longer day trades), not only monitoring. (7) **Personal capital first**; prop-firm compatibility is designed in now (rules as data, §6.9, §15.5) and activated only if live results justify it. (8) Strategies are **jointly owned**; every strategy change goes through the §15.3 promotion gates and is recorded in the decision log. (9) Broker, symbols, timeframes and strategies are **unknown today** and must be configuration (§15.6).

**Assumptions I made, correct if wrong:**
- "MetaTrader" is the platform, not a broker. I'll spike against **MetaQuotes-Demo** unless you name a real broker.
- One Windows host (your PC or a Windows VPS) runs the MT5 terminals + bridge for everyone's accounts; web app and Postgres on a small Linux VPS (or the same Windows box in early dev). Friends install nothing.
- One terminal instance per account, so host size caps account count. Fine at this scale.
- Control is **reduce-only**: close, cancel, pause. The platform never opens or adds to a position. I'm treating that as a firm product rule, not a v1 shortcut.
- Auto-protect (automatic de-risking on rule breach) exists but is **off by default** and only for Control accounts.

**Still need from you:**
1. Brokers you and friends use (filling modes, stops level, time offset, netting/hedging vary).
2. Prop firms, for accurate rule presets. Also: do those firms allow external tools/bridges and automated closes on their accounts? Many prop firms restrict third-party access or copy tools, so check each firm's terms before connecting its account (even Monitor).
3. Alert channel: Telegram, Discord, email, or push.
4. Who may issue commands on a friend's account: only the friend, only you/partner, or both?
5. Roughly how many accounts, demo versus real mix.
6. Host location (home PC vs VPS). Control needs the host up and reachable at the moment you press Kill, so uptime matters more now.
7. Do you want any friend-visible leaderboard? Default: strictly private.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Dashboard disagrees with the terminal | Reconciliation job, mismatch alert, show data freshness |
| Wrong analytics from broker time/symbol quirks | Normalize at bridge, keep raw, alert on offset change, canonical symbol table |
| Netting-account trades reconstructed wrong | Dedicated trade-builder with fixtures for partial close, reverse, scale-in; replay tests |
| "Kill" doesn't fully kill (EA keeps trading, market closed, requotes) | Flatten-until-flat loop, per-ticket results, terminal-process escalation, clear partial-failure UI; `AutoTradeGuard.mqh` for cooperating EAs; reduce-only invariant bounds the damage of any bug |
| Control abuse or bug opens/increases risk | Reduce-only whitelist in bridge code + CI test that fails if any opening order path exists; every command audited; master password never in cloud |
| Holding friends' master passwords is a trust and liability problem | Control strictly opt-in per account with recorded consent; reduce-only scope; easy revoke; see §9 and §12 |
| Misleading stats from small n | Min-n gating, CIs, deflated Sharpe, n always visible |
| Credentials exposure | No passwords in cloud, DPAPI on host, sanitizer + global response filter, hashed ingest keys |
| Polling misses fast events | Incremental deal-ticket sync (history is authoritative), optional Reporter EA for push |
| Contract churn with partner | Versioned schemas, CI conformance tests, single contract owner |
| Scope creep into strategy tooling | Explicit non-goals |

## 14. First three actions

1. Create a MetaQuotes-Demo account, install MT5 + Python `MetaTrader5` on Windows, run the bridge spike (investor read path, then master close/remove path on demo). Record real return values and retcodes.
2. Freeze `schema_version: 1` (§4) with partner: event envelope, magic/comment convention, command set, guard-include interface.
3. Build static-data mocks of Overview, Account detail (with Control actions and the per-ticket result view) and the rules/breach panel; run `plan-design-review` before wiring real data.
4. (v5) Build the cost-realistic backtester and one deliberately simple baseline strategy to validate the harness (§15.8 M0b), and write the scalping feasibility check before choosing any broker or pair.

## 15. Execution Engine and research pipeline (v5)

Honest framing: automation provides speed, discipline and consistency. It does not provide an edge. Retail forex scalping is cost-dominated (spread + commission + slippage), so most small edges vanish after costs. This section exists mainly to **find out cheaply whether an edge is real and to stop losing money when it stops being real.** No claim of guaranteed profit is made anywhere in the product or docs.

### 15.1 Components and trust boundaries

```
 Research (offline, any machine)        WINDOWS HOST
 ┌──────────────────────────┐          ┌──────────────────────────────────────────┐
 │ data → backtest → WFO →  │ promote  │ EXECUTION ENGINE (can open/close)        │
 │ Monte Carlo → report     │ ───────► │  strategy plugins → signal → RISK GATE   │
 └──────────────────────────┘ (signed  │  → order router → MT5                    │
                              config)  │                                          │
                                       │ GUARDIAN = existing Bridge (reduce-only) │
                                       │  reads account, can pause/flatten/kill   │
                                       │  independent process, independent limits │
                                       └──────────────────────────────────────────┘
```

- **Execution Engine** is the only component allowed to open positions. Python service (MT5 API) first; an MQL5 EA path stays supported for strategies that need tick-level latency.
- **Guardian** (§3 Bridge, reduce-only) is unchanged and **runs as a separate process with its own limits**. If the engine hangs, loops or has a bug, Guardian can still flatten and kill. The reduce-only CI lint (§3.1) applies to Guardian and the control plane only; the engine has its own CI rule: **every order path must pass through `RiskGate`**, enforced by a test that fails if any `order_send` is reachable without it.
- The control plane (web app) never sends an entry. It can only pause the engine (`trading_enabled=false`), tighten limits, or trigger Guardian actions.

### 15.2 Risk gate (hard, code-enforced, strategy cannot bypass)

Evaluated before every order, fail-closed (any error or missing data = reject):

- Risk per trade as % of equity (fixed-fractional sizing from SL distance, `tick_value`, account currency); **no order without a stop-loss**
- Max open risk (sum of SL risk) and max open positions; per-currency net exposure and correlated-pair cluster cap (§6.5)
- Daily loss cap and max drawdown from the **high-water equity**; breach = halt new entries until a human re-enables, and Guardian may flatten per §6.9 auto-protect
- Spread filter (absolute and vs rolling median), slippage/deviation limit, min free margin, max leverage in use
- News blackout windows (needs an economic-calendar feed) and rollover/weekend rules
- Max orders per minute and a duplicate-order guard (idempotency key per signal)
- Banned behaviors by default: **martingale, grid averaging-down, no-SL trades**. These also happen to be prohibited by most prop firms.
- Kill switch flag checked every cycle; stale-data guard (no trading on quotes older than N seconds or after a feed gap)
- Every decision (allowed or denied, with reason) is logged as a `decision` event (§4.3) so the dashboard can answer "why did it take / skip that trade".

### 15.3 Research pipeline and promotion gates

Each strategy is a versioned plugin (`Strategy` interface: `on_bar`/`on_tick` returns intents; no direct order access). It moves through gates; failing a gate sends it back, never forward:

| Stage | What | Pass criteria (set before running, recorded in the decision log) |
|---|---|---|
| 0 Data | MT5 history, UTC-normalized, canonical symbols, gaps flagged | Data checks pass; broker-time offset handled |
| 1 Backtest | Cost-realistic: variable spread, commission, slippage model, swap, session/news spreads | Net-of-cost expectancy > 0 with n above the min-n rule |
| 2 Validation | Walk-forward optimization, out-of-sample holdout never used for tuning, parameter-stability sweep, Monte Carlo (trade reshuffle, cost stress +50%), deflated Sharpe over all variants tried | Worst fold acceptable; edge survives cost stress; no cliff in neighboring parameters |
| 3 Demo forward | Engine on a demo account, real feed, weeks of data | Live-demo metrics within the backtest's confidence band; fills/slippage match model |
| 4 Micro-live | Minimum lot, real money, strict caps | Same, plus real slippage/commission vs model |
| 5 Scale | Stepwise risk increases only after N trades and a positive, stable result | Human sign-off by **both owners** |

Numeric thresholds are chosen **before** the run and written to the decision log, because picking them after seeing results is how backtests lie. The more variants tried, the more likely a result passes by luck, hence deflated Sharpe.

### 15.4 Reactivity and consistency without overfitting

- **Reactive** (intraday): regime filters (volatility, trend/range, session), spread/latency-aware entry, news awareness, volatility-scaled sizing, time-of-day gating. These are rules in the strategy, validated like any other.
- **Adaptive tuning** (slow): scheduled walk-forward re-tune (e.g. weekly/monthly), **bounded parameter ranges**, **champion/challenger** (challenger trades demo or min-lot beside the champion; promoted only through the §15.3 gates). **No continuous online re-optimization on recent trades.** It overfits recent noise and is the usual reason bots decay.
- **Degradation detection:** compare live to expected using control limits on rolling expectancy, win rate, slippage and drawdown. Outside the band: alert, then reduce size, then auto-pause that strategy (all steps audited). A strategy that "stopped working" is disabled by rule, not by hope.
- **Consistency** comes from small, fixed risk per trade, diversification across uncorrelated strategies and pairs, and the daily/DD caps. It does not come from a high win rate.

### 15.5 Prop-firm adaptability (designed in now, activated later)

- Rule profiles are data (§6.9). The engine loads the account's active profile and merges it into `RiskGate` as the **stricter of** (own limits, firm limits) plus a safety buffer.
- Engine-level prop-safe defaults now: SL on every trade, no martingale/grid, configurable news blackout, max lot/leverage caps, daily loss measured on **equity** with the firm's reset time and timezone, minimum-trading-days and consistency tracking.
- Per-firm presets are added only when a firm is chosen. **Check each firm's terms for automated trading, EAs and bridges before connecting** (many restrict HFT/latency-arbitrage styles, copy trading or third-party tools). Do not assume allowed.
- The §6.9 honesty rule applies: our numbers are estimates; the firm's tracker is authoritative.

### 15.6 Unknowns handled as configuration

Broker, symbols, timeframes and strategies are unknown today, so nothing is hardcoded:

- **Broker profile** (YAML/JSON, auto-discovered at startup and cached): filling modes per symbol, stops/freeze levels, min/max/step lot, digits, `tick_size`, `tick_value`, contract size, swap, session times, server time offset, hedging vs netting, commission schedule, typical spread table (measured over time). Broker-specific behavior lives only here.
- **Symbol universe** and per-symbol parameters (spread cap, session window, risk multiplier) in config; canonical symbol mapping from §5.
- **Strategy config** versioned with `config_hash`; the engine refuses to run an unapproved hash on a REAL account.
- **Scalping feasibility check** runs first on any candidate broker/symbol: measure spread, commission, latency and slippage over 1-2 weeks of demo and compute break-even pips. If round-trip cost is a large fraction of the strategy's average win, scalping there is rejected before any strategy work.

### 15.7 Tooling decisions (evaluated, not yet adopted)

- **Vibe-Trading (HKUDS)** (MIT, reviewed 2026-10-03, verdict CAUTION): useful as a research aid (MT5 loader, backtest engines, trade-journal analysis) and as a design reference for a fail-closed order guard with a mandate, halt flag and daily trade counter. **Do not enable its broker connectors or credentials.** Install only in an isolated venv if used.
- **Kronos** (MIT, reviewed 2026-10-03, verdict APPROVE as a library): optional forecasting feature for stage 1, only after a rule-based baseline exists. No proven fee-adjusted edge; treat as a hypothesis to test.
- **Paperclip**: optional agent-team orchestration for building the platform. Never in the execution path, never given broker credentials.
- Default stance: own thin engine + vectorized backtester first; adopt a library only when it removes real work.

### 15.8 Delivery additions (parallel to §11)

- **M0b · Cost model + baseline (1-2 wks).** Data loader, cost-realistic backtester, one deliberately simple baseline strategy (to validate the harness, not to make money), scalping feasibility check tooling.
- **M2b · Engine on demo (2-3 wks).** Engine + `RiskGate` + order router + kill flag, Guardian integration, `decision` events, chaos tests (feed gap, requote storm, disconnect mid-order, duplicate signal, market closed, bridge down). Demo only.
- **M3b · Validation tooling (2 wks).** Walk-forward, Monte Carlo, deflated Sharpe, promotion-gate report, decision log.
- **M4b · Micro-live (4+ wks forward).** Minimum lot on personal capital after stage 3 passes. Prop adaptation only after stage 5 and written firm terms.

### 15.9 Added risks

| Risk | Mitigation |
|---|---|
| No edge after costs (the most likely outcome for any given idea) | Gates 1-2 fail fast and cheaply; never go live on an unvalidated strategy |
| Overfitting via repeated tuning | Bounded ranges, untouched holdout, deflated Sharpe, no online re-optimization |
| Engine bug opens unwanted risk | `RiskGate` is the only order path (CI-enforced), independent Guardian can flatten, demo-first with chaos tests |
| Backtest differs from live (slippage, spread spikes, requotes) | Cost-stress Monte Carlo, forward demo, micro-live, live-vs-expected degradation alerts |
| Prop firm bans EAs/bridges or flags behavior | Read terms per firm first; prop-safe defaults; Monitor-only fallback |
| Joint-ownership disagreements | Decision log, both-owner sign-off at stage 5, thresholds fixed before runs |
| Scope explosion | Baseline strategy first; no ML/LLM in the path until a rule-based baseline passes the gates |
