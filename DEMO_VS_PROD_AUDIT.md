# Demo-vs-Production Audit — Poster capabilities the demo oversells

Scope: `services/traceApi.ts` (the entire `demo*` fixture layer + `isDemoTenant()`/`getDemoPos()` switchboard), the views that render it, and the real `pos_type === 'poster'` branches in `TRACEBACKEND/src/routes/{operations,loyalty,financial,sales}.ts` + `src/adapters/posterAdapter.ts`.
Read-only audit — no code was changed. Companion to `POSTER_AUDIT.md` (which audits the real Poster integration; this one audits what the sales demo *claims* that integration does).

## How demo mode works (root cause)

`isDemoTenant()` (`services/traceApi.ts:100`) is true when the subdomain is `demo` (apex/localhost/preview also fall through to `'demo'`, `traceApi.ts:2314-2316`). Every `traceApi.*` method short-circuits to a `demo*()` fixture **before** any network call, so the demo never touches a backend route and therefore never hits a `pos_type` branch.

`getDemoPos()` (`traceApi.ts:106`) records the prospect's POS choice from `DemoPosPicker` (`App.tsx:112-145`) in `localStorage`. Of the ~60 `demo*` fixtures, **only four consult it**:

| Fixture | Line | POS-aware? |
|---|---|---|
| `demoSalesStatus` | `traceApi.ts:547` | yes — returns `{ poster: {...} }` |
| `demoReservations` | `traceApi.ts:726` | yes — Poster-only feature |
| `demoActiveOrderRows` (`kitchenStatus`) | `traceApi.ts:957` | yes |
| `financial.inventory` / `inventoryDocs` | `traceApi.ts:1530, 1533` | yes |

Everything else returns the same iiko-grade fixture regardless of the POS the prospect picked.

The **UI-level** gating is mostly sound: views branch on `traceApi.sales.status().poster`, which `demoSalesStatus()` does set, so P&L, GL summary, event feed, hall-occupancy card, void tracker, smart alerts, kitchen serve time, revenue-type selector, real-guest filter, Sales AI insights and Reports templates r7/r8/r14 all correctly disappear in demo-Poster mode (see "Correctly gated" at the bottom). The leaks below are all **data-level**: a card that a real Poster tenant *does* see, but populated with numbers a real Poster tenant can never get, so it renders "—"/0/empty for them and a full, plausible value in the demo.

## Summary

| # | Feature | Severity | Demo path | Real Poster path |
|---|---|---|---|---|
| 1 | Staff clock-in / shift-start times | High | `traceApi.ts:895-901` | `operations.ts:385` (`enterTime: null`) |
| 2 | Staff profitability: salary, ROI, salary type | High | `traceApi.ts:786-813` | `operations.ts:676-681` (all null) |
| 3 | Loyalty: new members / returning % / 14-day trend | High | `traceApi.ts:1271-1277` | `loyalty.ts:30` (0/0/0/`[]`) |
| 4 | Loyalty: per-visit itemized purchase history | High | `traceApi.ts:1257-1269` | `loyalty.ts:186` (`res.json([])`) |
| 5 | Loyalty guest list: visit count, first/last seen | High | `traceApi.ts:1279-1289` | `loyalty.ts:85-90` (0 / null / null) |
| 6 | Guest detail: loyalty card, tier ladder, registration date | High | `traceApi.ts:1291-1308` | `loyalty.ts:140-150` (`cards: []`, no dates) |
| 7 | ABC / Menu Optimization: cost, margin %, food-cost %, profit-ABC | High | `traceApi.ts:624-650` | `posterAdapter.ts:585` (`cost: 0`, by design) |
| 8 | Write-offs: itemized ingredient + real quantity | Medium | `traceApi.ts:1026-1033` | `posterAdapter.ts:640-648` (reason name, `qty: 1`) |
| 9 | Cash shift: card breakdown by payment system + payouts | Medium | `traceApi.ts:871-889` | `operations.ts:187-189` (one lumped line, `payOut: 0`) |
| 10 | Menu Analysis margins always populated | Medium | `traceApi.ts:1311-1339` | `posterAdapter.ts` `getMenuAnalysis` (null when cost fetch fails) |
| 11 | AI waste root-cause names dishes | Medium | `traceApi.ts:345-370` | `ai.ts:2430` ("Poster has no per-dish breakdown") |
| 12 | Cash-shift docs: `payOrders` semantics + open-shift `cashDiff` | Low | `traceApi.ts:1112-1118` | `posterAdapter.ts:430-441` |
| 13 | Reservation party size | Low | `traceApi.ts:729-731` | `posterAdapter.ts:936-938` (`partySize` null) |
| 14 | Poster inventory-doc item drill-down fixtures | Low (dead) | `traceApi.ts:1103-1110` | `financial.ts:596-598` (iiko-only) |

**Total: 14** (7 High, 4 Medium, 3 Low)

---

## HIGH

### 1. Staff clock-in / shift-start times

**Demo:** `services/traceApi.ts:895-901` — `demoStaffOpsRows()` gives four of five waiters an `enterTime` (`'09:02'`, `'09:15'`, `'08:58'`, `'09:30'`).
**Rendered:** `components/views/Operations.tsx:931-945` — the block only renders `if (s.enterTime || s.exitTime)`, so the demo shows a "shift start / shift end / hours" strip inside every staff row.
**Real Poster:** `TRACEBACKEND/src/routes/operations.ts:385` — `enterTime: null, exitTime: null, hoursWorked: null`, with the route's own comment at `operations.ts:362-364`: *"Poster has no attendance/clock-in data in one call … enterTime/exitTime/hoursWorked/openTables stay null/empty rather than guessed."*

A prospect sees per-waiter attendance tracking in the demo; the same card is completely absent for their tenant on day one. `openTables` is fine by accident — the demo fixture omits it, so it coerces to 0, matching Poster's hardcoded `openTables: 0`.

---

### 2. Staff profitability — salary cost, salary type, ROI

**Demo:** `services/traceApi.ts:786-813` — `demoStaffProfitability()` assigns `salaryCost` to three of four waiters, tags two `salaryType: 'attendance'` and one `'fixed'`, and computes `profit`, `profitabilityPct` and `roi` against that salary.
**Rendered:** `components/views/Reports.tsx:742-765` — the "Staff Profitability" XLSX/PDF export ships `ЗП (UZS)`, `Прибыль`, `Рентабельность %`, `ROI %` columns (`Reports.tsx:757`). The template is *not* in the Poster exclusion list (`Reports.tsx:965` only drops r7/r8/r14), so a Poster tenant can and will download this report.
**Real Poster:** `TRACEBACKEND/src/routes/operations.ts:676-681` — `salaryCost: null, salaryType: null, roi: null, hasSalary: false`; only `profit`/`profitabilityPct` survive, and those are product-cost-derived, not salary-derived. Route comment at `operations.ts:666-671`: *"Poster has no salary/attendance module to compute cost-based profitability against."*

Worse than a blank: `salaryType: 'attendance'` is a second, implicit claim that TRACE reads clock-in hours from Poster (see finding 1).

---

### 3. Loyalty — new members, returning %, 14-day guest trend

**Demo:** `services/traceApi.ts:1271-1277` — `demoLoyaltySummary()` returns `totalMembers: 312, newMembers: 28, returningMembers: 194, returningPct: 62` plus a 14-point `trend` array.
**Rendered:** `components/views/Loyalty.tsx:242-243` (the "Новых за 30 дней" and "Возвращаются %" stat tiles) and `Loyalty.tsx:251` (the trend area chart). **Nothing on this page is gated by `isPoster`** — `grep -n poster components/views/Loyalty.tsx` returns nothing.
**Real Poster:** `TRACEBACKEND/src/routes/loyalty.ts:30` — `{ totalMembers: clients.length, newMembers: 0, returningMembers: 0, returningPct: 0, avgSpent, trend: [] }`, with the comment at `loyalty.ts:17-18`: *"totalMembers/avgSpent are real; newMembers/returningMembers/returningPct/trend stay at 0/empty rather than guessed — Poster's client endpoint has no per-visit history."*

A real Poster tenant lands on Loyalty and sees "New (30d): 0", "Returning: 0%", and an empty chart. Note `totalMembers` is additionally capped at 300 by the adapter slice (POSTER_AUDIT M4), so even the "real" number is wrong for a large account, while the demo's 312 reads as uncapped.

---

### 4. Loyalty — per-visit itemized purchase history

**Demo:** `services/traceApi.ts:1257-1269` — `demoLoyaltyHistory()` fabricates five visits, each with a date, a total and an itemized dish list.
**Rendered:** `components/views/Loyalty.tsx:224` and `Loyalty.tsx:335` — `PurchaseHistoryPanel` under both the manual phone lookup and each guest row.
**Real Poster:** `TRACEBACKEND/src/routes/loyalty.ts:186` — `if (tenant.pos_type === 'poster') { res.json([]); return; }`, comment at `loyalty.ts:184`: *"Poster has no itemized per-client visit history endpoint."* The panel then renders its empty state (`Loyalty.tsx:88`): "No purchase history in TRACE yet."

This is the single most demo-able loyalty feature ("look, you can see exactly what this guest ordered on each visit") and it does not exist for Poster at all.

---

### 5. Loyalty guest list — visit count, first seen, last seen

**Demo:** `services/traceApi.ts:1279-1289` — `demoLoyaltyGuests()` returns `visitCount: 12…5`, `firstSeen` ~4 months back, `lastSeen` recent, per guest.
**Rendered:** `components/views/Loyalty.tsx:311` (visit-count column) plus first/last-seen columns in the same table.
**Real Poster:** `TRACEBACKEND/src/routes/loyalty.ts:85-90` — `visitCount: 0, // not derivable from clients.getClients — no per-visit history field`, `firstSeen: null, lastSeen: null`. The frontend type already documents it (`traceApi.ts:1246`: *"null for Poster — clients.getClients has no join-date field"*), which makes the demo fixture's populated values a deliberate-looking contradiction.

Every row of a real Poster tenant's guest table reads "0 visits".

---

### 6. Guest detail — loyalty card number, tier ladder, registration/first-order dates

**Demo:** `services/traceApi.ts:1291-1308` — `demoLoyaltyGuestDetail()` returns a `cards: [{ number }]` entry, a three-tier Bronze/Silver/Gold `categories` ladder with one active, a named wallet balance, plus `whenRegistered`, `firstOrderDate` and `lastProcessedOrderDate`.
**Rendered:** `components/views/Loyalty.tsx:39-40, 68` — card number, balances and the "registered on" date.
**Real Poster:** `TRACEBACKEND/src/routes/loyalty.ts:140-150` — `cards: []`, `categories` is at most the *single* Poster CRM group name, `whenRegistered/firstOrderDate/lastProcessedOrderDate: undefined`. Poster has no card-number concept and no multi-tier ladder here.

The demo shows a full loyalty-program panel; the real Poster panel is a name, a phone and a bonus balance.

---

### 7. ABC / Menu Optimization — cost, margin %, food-cost %, profit-ABC grade

**Demo:** `services/traceApi.ts:618-650` — `DEMO_COST_RATIOS` + `demoAbc()` fabricate `cost`, `grossProfit`, `marginPct`, `costPerUnit`, `foodCostPct` **and** `abcProfit` (the margin-based ABC grade) for every dish.
**Rendered:** `components/views/Sales.tsx:1178-1219` — the Menu Optimization table's Себест. / Себест/шт / Фудкост % / Маржа columns, each of which falls back to `'—'` when null/0 (`Sales.tsx:1210-1219`); also the Menu Matrix quadrants (`Sales.tsx:1287`), the XLSX/PDF exports (`Sales.tsx:902-904`) and the Ask-AI dish context (`Sales.tsx:101-102`).
**Real Poster:** `TRACEBACKEND/src/adapters/posterAdapter.ts:585` — `cost: 0` for every row, deliberately, per the comment at `posterAdapter.ts:576-584`: *"dash.getProductsSales has no cost field usable at Poster's own scale … cost is left at 0 on purpose … an invented cost number would silently misgrade dishes."*

So a real Poster tenant's entire cost/margin half of the ABC page is dashes, the profit-ABC grade silently degrades to the `avgPrice` fallback in `computeAbcGrades()`, and the Menu Matrix loses its margin axis (`hasCostData` false). The demo shows the full four-column margin analysis. This is the most visually prominent leak in the audit — it is the headline feature of the Sales page.

---

## MEDIUM

### 8. Write-offs — itemized ingredient names and real quantities

**Demo:** `services/traceApi.ts:1026-1033` — rows like `{ name: 'Зелень микс', category: 'Овощи', qty: 0.4, docNumber: 'СП-0142' }`: a named ingredient, a food category, a fractional kg quantity, an iiko-style document number.
**Rendered:** `components/views/Financial.tsx:1375-1384` (name / category / doc / qty / cost / date columns) and the `WasteImpactBanner` (`Financial.tsx:208-232`), which groups by `category` through `isRealFoodWaste`.
**Real Poster:** `TRACEBACKEND/src/adapters/posterAdapter.ts:640-648` — `name` is the **waste reason** string, `category` is the **storage name**, `qty` is **always 1**, `docNumber` is Poster's opaque `waste_id`. Adapter comment at `posterAdapter.ts:625-627`: *"storage.getWastes has no per-dish breakdown … `name` is the waste reason, `qty` is always 1 — an honest shape for what Poster actually gives."*

The demo sells per-ingredient waste tracking; Poster gives "Списание по сроку годности / Кухня / 1". The `isRealFoodWaste` category filter and the waste-impact banner are also built around iiko-shaped food categories and will behave differently against storage names.

---

### 9. Cash shift — card breakdown by payment system, and payouts

**Demo:** `services/traceApi.ts:871-889` — `demoCashShift()` returns `cardBreakdown: [Uzcard 3.18M, Humo 1.24M, Visa/Mastercard 0.7M]` and `payOut: 220_000`.
**Rendered:** `components/views/Operations.tsx:1466` (the Card tile becomes clickable only when `cardBreakdown?.length`) → the breakdown modal at `Operations.tsx:1488-1505`; `Operations.tsx:1468` shows Payouts or `'—'`.
**Real Poster:** `TRACEBACKEND/src/routes/operations.ts:187-189` — `cardBreakdown: card > 0 ? [{ type: 'card', amount: card }] : []` (one lumped, generically-labelled line: `payed_card + payed_third_party + payed_ewallet`), `payOut: 0` always, `sessionId: null`.

The demo implies acquirer-level payment-mix reporting and cash-drawer payout tracking; Poster's shift card offers neither.

---

### 10. Menu Analysis margins are always populated

**Demo:** `services/traceApi.ts:1311-1339` — `demoMenuAnalysis()` computes `cost`, `grossProfit`, `marginPct`, `costPerUnit` from hardcoded cost ratios for all eight dishes, unconditionally.
**Rendered:** Financial → Menu tab (`components/views/Financial.tsx:707-720` fetch, table below).
**Real Poster:** `TRACEBACKEND/src/adapters/posterAdapter.ts` `getMenuAnalysis` — a `costFetchFailed` flag makes `cost`/`grossProfit`/`marginPct`/`costPerUnit` **null** whenever either `menu.getProducts` call rejects, and `costPerUnit` is null whenever a product simply has no configured cost. Poster tenants that never configured technical cards see an empty margin column, and even a fully-configured account gets an approximation (per-unit cost × qty, not a true COGS).

Milder than finding 7 only because the failure mode is conditional rather than guaranteed — but it is the same promise made twice.

---

### 11. AI waste root-cause names specific dishes

**Demo:** `services/traceApi.ts:345-370` — `demoWasteRootCause()` returns `patterns: [{ dish: 'Авокадо', peakDay: 'Понедельник', … }, { dish: 'Кокосовое молоко', … }]`, i.e. a per-ingredient waste-pattern analysis with a day-of-week peak.
**Real Poster:** `TRACEBACKEND/src/routes/ai.ts:2430` — the Poster prompt is explicitly built from *"waste reason [storage]"* entries and states *"(Poster has no per-dish breakdown)"*. The `dish` field in a real Poster response is therefore a waste **reason** or storage label, and there is no per-item day-of-week signal to find a `peakDay` in.

---

## LOW

### 12. Cash-shift documents — `payOrders` semantics and open-shift `cashDiff`

**Demo:** `services/traceApi.ts:1112-1118` — `payOrders: 142/168/151/159` (reads as an **order count**) and `cashDiff: 0` on the OPEN shift `cs-1`.
**Real Poster:** `TRACEBACKEND/src/adapters/posterAdapter.ts:432, 441` — `payOrders: toCurrency(cash + card)` is a **money total** (so a real Poster tenant sees an 8-digit number in that column, not ~150), and `cashDiff` is `null` for open shifts, deliberately: *"null while open — not the same thing as a reconciled 0.00 diff."* The demo's `0` renders as a reconciled zero discrepancy.

`sessionNumber` is fine — the adapter now derives a sequential number (`posterAdapter.ts:431`), matching the demo's 409-412 style.

### 13. Reservation party size

**Demo:** `services/traceApi.ts:729-731` — `partySize: 4 / 2 / 6`.
**Real Poster:** `TRACEBACKEND/src/adapters/posterAdapter.ts:936-938` — *"Poster's response has no party-size field … so partySize stays null rather than guessed."*
Currently **not user-visible**: the reservations table (`components/views/Operations.tsx:1770-1795`) renders guest/phone/date/duration/status and no party-size column. Fix the fixture anyway before someone adds the column off the back of the demo.

### 14. Poster inventory-document item drill-down

**Demo:** `services/traceApi.ts:1103-1110` — `demoInventoryItems()` carries `pd1`/`pd2` sets (book qty / actual qty / diff) keyed to the Poster inventory docs.
**Real Poster:** `TRACEBACKEND/src/routes/financial.ts:596-598` — `/financial/inventory/items` returns `[]` without iiko credentials; it is 100% iiko OLAP/XML.
Currently **dead code**: the Poster docs table (`components/views/Financial.tsx:1461-1469`) has no click handler, so `InventoryDrawer` is never opened for Poster. Harmless today, a live overselling bug the moment anyone makes those rows clickable.

---

## Correctly gated (verified, no action needed)

These *are* Poster gaps, and the demo does hide them because `demoSalesStatus()` (`traceApi.ts:547-550`) sets `status.poster`, which every gate below reads:

- **P&L tab** — `components/views/Financial.tsx:482, 485` (tab filtered out; `/financial/pl` is iiko-only, `financial.ts:1081-1083`).
- **GL summary** — `Financial.tsx:696-706` routes Poster to `glCategories` instead (`financial.ts:1229`).
- **Event feed** — `components/views/Dashboard.tsx:986`; Poster's webhook only logs (`src/posterWebhook.ts:61-63`), it writes no `realtime_events`.
- **Hall occupancy card** — `Dashboard.tsx:1106`.
- **iikoFront Plugin status row** — `Dashboard.tsx:1167`.
- **Revenue-type selector** — `Dashboard.tsx:849` (`sales.ts:231` 400s for non-`net`).
- **Real-guest filter** — `Dashboard.tsx:873`.
- **Void tracker** — `components/views/Operations.tsx:586-591` via `pluginConnected = !isPoster && …` (`Operations.tsx:1234`).
- **Smart alerts** — `Operations.tsx:436-450`, same `pluginConnected` gate.
- **Kitchen serve time KPI** — `Operations.tsx:1366-1388` (`operations.ts:326` returns `avgKitchenMin: null`).
- **Sales AI insights** (price elasticity, combos, guest return) — `Sales.tsx:2134` (`ai.ts:2135, 1917` require iiko creds).
- **Reports r7/r8/r14** — `Reports.tsx:965`.
- **Financial-summary report subscription** — `Settings.tsx:433`.
- **Inventory** — `traceApi.ts:1530, 1533` correctly serve the Poster-shaped live-stock fixture.

## Suggested fix direction

Rather than patching 14 fixtures one at a time, make the fixture layer POS-aware the way the UI already is: add a single `demoPoster<T>(iikoValue, posterValue)` helper next to `getDemoPos()` and wrap each field that a real Poster tenant gets as null/0/empty — `enterTime`, `salaryCost`/`salaryType`/`roi`, the loyalty summary counters and trend, loyalty history, `visitCount`/`firstSeen`/`lastSeen`, guest `cards`/`whenRegistered`, ABC `cost`/`marginPct`/`foodCostPct`/`costPerUnit`, write-off shape, `cardBreakdown`/`payOut`, `partySize`. The demo then degrades exactly the way a real Poster tenant's account does, and the picker becomes a genuine capability comparison instead of the same iiko dataset under a Poster badge.
