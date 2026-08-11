# Poster — Features TRACE Cannot Match iiko On

Companion to `docs/poster-integration.md` (research) and `docs/poster-phase3-gapfill.md` (build log). This file is the definitive "cannot do" list — checked against Poster's real API + webhook docs (`github.com/joinposter/docs`), not assumed. Frontend widgets for the Category A items below are hidden for Poster tenants (`pos_type === 'poster'`) rather than shown in a permanently-broken "waiting..." state.

## A. Genuinely impossible — no Poster data source exists at all

These depend on **TRACEPLUGIN**, a C# plugin installed *inside* iikoFront on the physical terminal, hooking `Resto.Front.Api` in-process. It sees order/table/kitchen state change *as it happens on the terminal*. Poster is cloud-only with no terminal-plugin SDK — confirmed, not assumed (`docs/poster-integration.md` §0D, §4).

- **Live Orders Feed / Event Feed** (Dashboard) — every event type in the feed (`order_opened`, `order_updated`, `kitchen_order_changed`, `terminal_opened`, etc.) is a TRACEPLUGIN push. Removed for Poster.
- **Hall Occupancy live gauge** (Dashboard) — needs a live table↔order mapping updated in real time. Removed for Poster.
- **Active Orders board** (Operations) — same live table/order state dependency. Removed for Poster.
- **Table Turns** (`operations/table-turns`) — seated-time-vs-average needs the same live per-table order state. Not built for Poster.
- **Kitchen timing** (`avgKitchenMin` in KPIs) — `cookingStartTime`/`readyTime` are TRACEPLUGIN-only timestamps. Always `null` for Poster.
- **Service timing** (`avgServiceMin` in KPIs) — same, derived from plugin-pushed open/close timestamps per table.
- **Void Tracker** (live card + `operations/void-tracker` REST data) — sourced from `realtime_events` (`order_before_delete`, `order_printed_items_deleted`), TRACEPLUGIN-only. Poster's `transaction` webhook fires on `removed` but that requires the Marketplace path in §B below — not built.
- **Smart Alerts** (Operations) — mostly derived from the live event stream above; inherits the same gap. Removed for Poster (gated on the same `pluginConnected` flag).
- **Stop-list "stopped at" timestamp** — the list itself now works for Poster (`menu.getProducts` `out`/`spots.visible`, verified live 2026-08-11), but there's no real "went out of stock at HH:MM" event the way TRACEPLUGIN gives — `stoppedAt` on the Poster path is "when TRACE last polled and saw it," not a real event time. Not a missing feature, just a lower-fidelity version of one that works.

## B. Technically possible, but needs a real project (not started)

Poster does publish webhooks (`en/web/webhooks.md`), confirmed by reading the doc directly, 2026-08-11. But:
1. Requires registering TRACE as a **Poster Marketplace application** and each tenant "connecting" it from their own Poster account — a real onboarding step beyond the `poster_access_token` field TRACE uses today.
2. The webhook payload is a bare ping (`account`, `object`, `object_id`, `action`, `time`, signature) — no order/item/table detail. A follow-up API call is required to see what actually changed.
3. `transaction` fires on `added`/`changed`/`removed` (order-level only), `incoming_order` only on new→applied/rejected. **There is no entity for in-progress kitchen state, table seating, or item-level order changes** — even with webhooks built, Active Orders / Table Turns / kitchen timing stay unreachable.

What webhooks *could* realistically unlock, if this project happens:
- A coarse "order was removed" signal (`transaction` action=`removed`) — a rough Void Tracker substitute, not equivalent to TRACEPLUGIN's per-item deletion detail.
- Order-completion-triggered features (e.g. review requests, receipt notifications) — genuinely fine on webhook latency.

Needs: Marketplace app registration, a webhook receiver route, signature verification (`verify` field, md5 of account/object/object_id/action/data/secret), and its own spike before promising anything — same as `docs/poster-phase3-gapfill.md` §C already flagged.

## C. Possible, just not built yet (backlog, not a wall)

- **Table Revenue** (`operations/table-revenue`) — Poster exposes `spots.getSpotTablesHalls`/`getTableHallTables`, but per-table revenue needs a transaction↔table join not available as a direct report. Doable, not done.
- **Chain/multi-branch compare** (`org.ts`) — Poster has no chain-level credential the way iiko's `organizations.iiko_chain_server` does. Would need a per-tenant fan-out design (`docs/poster-integration.md` §6, `poster-phase2-backend.md` Step 4).
- **GL Summary / full P&L with COGS** (`financial/gl-summary`, `financial/pl`) — needs iiko's chart-of-accounts concept; Poster's `finance.getReport`/accounts/taxes are a different taxonomy, would need real mapping work, not impossible.
- **Inventory** (`financial/inventory`) — Poster's `storage.getStorageLeftovers` is actually *better* than iiko here (live stock balance vs. write-off-only), just not wired into this route yet.
- **Invoices / supplies** (`financial/invoices`) — Poster's `storage.getSupplies`/`createSupply` covers this, not wired yet.
- **Writeoffs** (`financial/writeoffs`) — Poster's `storage.getWastes` covers this (same source used for the stop-list fix), not wired into this specific route yet.
- **Menu-analysis** (`financial/menu-analysis`) — composable from data TRACE already pulls for Poster (`getAbcRows`), not wired yet.

## What already works for Poster (for context, not a gap)

`sales/abc`, `sales/revenue`, `sales/top-dishes`, `sales/category-perf`, `sales/hourly`, `sales/status`, `financial/cashshifts`, `operations/staff`, `operations/staff-abc`, `operations/staff-profitability`, `operations/kpis` (partial — `staffActive` only), `operations/delivery`, `operations/stop-list`, `operations/cash-shift`.

## Sources
- `github.com/joinposter/docs` (`en/web/webhooks.md`, `en/web/menu/getProducts.md`, `en/web/storage/getStorageLeftovers.md`, `en/web/dash/*`, `en/web/finance/*`) — read directly
- `docs/poster-integration.md`, `docs/poster-phase2-backend.md`, `docs/poster-phase3-gapfill.md` — prior research/planning in this repo
- Live verification against `benefitcoffee.trace-os.uz` (real Poster tenant), 2026-08-11
