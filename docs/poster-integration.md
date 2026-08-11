# Poster POS Integration — Research & Plan

Status: research complete, implementation not started.
Goal: TRACE support two POS backends — iiko (existing) and Poster (joinposter.com) — selectable per tenant at restaurant creation.

## 0. How deep the real iiko integration actually goes

Checked directly against TRACEBACKEND + TRACEPLUGIN source (not assumed). iiko integration is **four separate surfaces**, not one API:

**A. iikoServer REST (`src/iiko.ts`)** — per-branch, hits the restaurant's own `iiko_server` URL (on-prem or hosted), sha1-password auth (`/resto/api/auth`), 50min token cache.
- OLAP reports (`/resto/api/v2/reports/olap`) — the real workhorse. Used with multiple `reportType`s and field combos: `SALES` (grouped by `OpenDate.Typed`, `PayTypes`, `DishCategory`, `WaiterName`; aggregated on `DishSumInt`, `DishDiscountSumInt`, `UniqOrderId`, `GuestNum`), `TRANSACTIONS` (GL, grouped by `DateTime.Typed`/`Account.Name`, aggregated `Sum.Incoming`/`Sum.Outgoing`) — this is how revenue, top dishes, category performance, waiter sales, and GL income/expense are all derived. Report shape is hand-tuned per metric, not a single generic pull.
- Cash shifts (`/resto/api/v2/cashshifts/list`) — open/closed session detection, cashier, open time.
- Write-offs with GL classification (financial.ts) — "why" a write-off happened (staff meals, depreciation, etc), iiko's own accounting taxonomy.
- Employees + roles (`/resto/api/employees`, `/resto/api/employees/roles`) — XML-only, no JSON variant. Cross-referenced to reconcile waiter identity against free-text name suffixes because the two sources disagree in practice (see `iiko.ts:70-133` — this took real debugging, not a docs read).
- Kitchen timing (`cookingStartTime`/`readyTime`) surfaced per order.
- Table/hall plan sync (`ws/hallSync.ts`) — maps iiko's own restaurant sections/tables to TRACE's hall-map elements, diffed and persisted, not just a one-time pull.
- Chain-server multi-branch: `organizations.iiko_chain_server/login/password` gets spliced onto every branch's session tenant so "all branches" OLAP queries fan out per-branch and aggregate (`middleware/tenant.ts`, `routes/org.ts`).

**B. iikoCloud API (`services/iikoLoyalty.ts`, separate from A)** — different base (`api-ru.iiko.services`), different auth (`apiLogin` → `/api/1/access_token`, Bearer token), gets `organizations` + `restaurant_sections` (org GUID lookup).

**C. iikoLoyalty (also `services/iikoLoyalty.ts`)** — yet another auth flow (`appId` + `apiKey` + `clientSecret` → `/api/v2/access_token`), separate token cache, customer info + loyalty counters by phone/customerId. Three different credential shapes live on one tenant record because of this (`iiko_login/password/server`, `iiko_cloud_api`, `iiko_loyalty_app_id/client_secret`).

**D. TRACEPLUGIN (separate repo, C#, `Resto.Front.Api`)** — a native plugin installed *inside* iikoFront on the terminal itself. Not a REST call — it hooks live order/device/payment/session events directly in the POS process and pushes them out (`RealtimeClient.cs`, `EventBuilder.cs`). This is how TRACE gets true realtime terminal events (order state changes, payments as they happen) that no polling of the REST API could give at the same latency or granularity.

**Net: iiko integration is 4 credential sets, 3 REST auth flows, hand-tuned OLAP report bodies per metric, XML employee/role reconciliation with a documented real-world data-quality bug, and a native terminal plugin for realtime events.** Any Poster integration claiming parity has to be honest about which of these four it can actually match.

## 1. What Poster is

Poster POS (joinposter.com) — cloud POS/restaurant management platform, ~23,000 locations, 100 countries. REST API only (`api.joinposter.com`), no on-prem server component like iikoServer, no published terminal-plugin SDK.

## 2. Auth model

- `account_name` — Poster subdomain (e.g. `demo` in `demo.joinposter.com`)
- `access_token` — API token from Poster admin panel (Settings → Application/API access), or from an OAuth app-install flow (`application_id`/`application_secret`/`redirect_uri`) if TRACE registers as a listed Poster application later
- Requests: `https://{account_name}.joinposter.com/api/{group}.{method}?token={access_token}`

One token, one auth flow, one set of credentials — simpler than iiko's three-surface split by construction, not by TRACE's design choice. **MVP: `poster_account_name` + `poster_access_token`, mirrors `iiko_login`/`iiko_password` pattern on the tenant record.**

## 3. Full method catalog (from `joinposter/api-php` SDK `Descriptions.php` — verified by reading the actual source, not summarized from docs pages that failed to render)

Base URL: `https://{account_name}.joinposter.com/api/{group}.{method}`

**DashAPI** — `getAnalytics`, `getTransaction(s)`, `getTransactionProducts`, `getTransactionHistory`, `getProductsSales`, `getCategoriesSales`, `getClientsSales`, `getWaitersSales`, `getSpotsSales`, `getTransactionWriteOffs`, `getPaymentsReport`. Pre-aggregated report endpoints (revenue/profit/avg-check/transaction-count/visitor-count by day/week/month, sliced by waiter/workshop/category/product/spot/client) — **this replaces iiko's hand-tuned OLAP bodies with fixed report shapes.** Good: no per-metric OLAP tuning needed. Bad: less flexible if TRACE needs a custom slice OLAP can do that these fixed endpoints can't.

**MenuAPI** — full CRUD on categories/products/dishes(technical cards)/prepacks(modifiers)/ingredients/category-ingredients/workshops(kitchen stations).

**StorageAPI** — manufactures, moves/transfers, supplies (incoming docs), write-offs, packs, wastes+reasons, inventory/stocktaking, storage leftovers (current stock — better real-time equivalent than iiko's write-off GL classification, which only explains *why* stock left, not current balance).

**ClientsAPI** — full CRM CRUD, bonus/loyalty balance changes, groups, SMS — **broader than iiko's loyalty surface**, which TRACE currently only reads (customer info + counters), doesn't write.

**TransactionsAPI** — live order write access: create/modify/close transactions, add/remove products, change client/comment. iiko path has no equivalent in TRACE today (TRACE only reads iiko, never writes orders).

**IncomingOrdersAPI** — delivery orders + table reservations.

**SpotsAPI** — `getSpotTablesHalls`, `getTableHallTables`, `getSpotsWorkingTime`. Direct equivalent to iiko's hall/table sync, but read-only in this group (spot creation is under AccessAPI).

**FinanceAPI** — cash shifts (open/close, matches iiko), GL transactions, accounts, finance categories, taxes, `getReport`. Direct equivalent to iiko's cashshifts + write-off GL classification, same shape.

**AccessAPI** — employees (with role directly on the record — no separate XML role-reconciliation problem like iiko has), tablets, spots (create/update — Poster lets you provision a branch via API, iiko's branch creation is not something TRACE currently does through the API either).

**PaymentsAPI**, **FranchiseAPI** (`getTransactionsByClientId` — cross-branch client lookup, partial analog to iiko's chain-server fan-out but at the client level, not full multi-branch OLAP aggregation), **SettingsAPI**, **ApplicationAPI** (OAuth-app-only).

## 4. Honest capability comparison vs iiko

| iiko surface | Poster equivalent | Gap |
|---|---|---|
| OLAP SALES/TRANSACTIONS reports (hand-tuned) | `dash.*` fixed report endpoints | Less flexible; fine for TRACE's current metrics (revenue, top dishes, category perf, waiter sales all have direct `dash.*` matches), untested for anything more exotic |
| Cash shifts | `finance.getCashShifts/open/close` | Direct match |
| Write-off GL classification | `finance.getTaxes/getAccounts` + `storage.getWasteReasons` | Roughly equivalent, different taxonomy, needs real-account testing |
| Employee/role XML reconciliation | `access.getEmployees` (role inline) | **Better** — no need for iiko's two-endpoint XML cross-reference workaround |
| Hall/table sync | `spots.getSpotTablesHalls/getTableHallTables` | Direct match |
| Chain multi-branch OLAP fan-out | `franchise.getTransactionsByClientId` only | **Real gap** — no full multi-branch aggregated report endpoint found in the SDK; would need to fan out `dash.*` calls per Poster account manually, same as iiko chain-server pattern, but Poster doesn't have a native "chain" auth concept iiko does |
| iikoLoyalty (read customer info/counters) | `clients.*` (full CRUD) | Poster is ahead here |
| **TRACEPLUGIN realtime terminal events** | **None found** | **Real gap.** Poster publishes no terminal-plugin SDK equivalent to `Resto.Front.Api`. Closest substitute is webhooks (mentioned on Poster's dev portal, not yet inspected in detail) — server-side push on transaction/order events, but that's push-on-completion, not the in-process hook TRACEPLUGIN has into live order/device state changes. Needs a follow-up spike against the actual webhook payloads before claiming parity here. |

**Bottom line: Poster can match iiko's REST-based reporting, inventory, CRM, and hall-sync surfaces reasonably closely, and exceeds it in a few (CRM writes, live order writes, inline employee roles). It cannot match TRACEPLUGIN's realtime terminal-level events without a webhook spike proving it's close enough — that's the one open risk, not a checkbox.**

## 5. What TRACE should pull, phased

**Phase 1 — parity with iiko's OLAP-derived reports + hall map + employees:**
`dash.getProductsSales`, `dash.getCategoriesSales`, `dash.getWaitersSales`, `dash.getSpotsSales`, `dash.getPaymentsReport`, `dash.getAnalytics` → direct swap-ins for the current OLAP `SALES`-report call sites in `sales.ts`/`operations.ts`.
`menu.getCategories`, `menu.getProducts` → nomenclature.
`access.getSpots`, `spots.getSpotTablesHalls`, `spots.getTableHallTables` → hall map, same shape as `hallSync.ts`.
`access.getEmployees` → simpler than the iiko roles.xml + employees.xml cross-reference.
`finance.getCashShifts` → shift open/close status (operations.ts today).

**Phase 2 — inventory:**
`storage.getStorageLeftovers`, `storage.getStorages`, `storage.getWastes` — genuinely new capability, iiko side doesn't currently expose real-time stock balance to TRACE, only write-off GL.

**Phase 3 — write-back:**
`access.createSpot` (branch provisioning), `menu.createProduct/updateProduct`, `clients.*` writes (loyalty parity+).

**Phase 4 — realtime (needs spike first):**
Investigate Poster webhooks against the same events TRACEPLUGIN captures (order state, payment, session) before promising this tier — do not assume parity.

## 6. Data model changes needed (TRACEBACKEND, separate repo)

```
pos_type: 'iiko' | 'poster'

// existing (unchanged, now conditionally required)
iiko_login, iiko_password, iiko_server, iiko_cloud_api
iiko_loyalty_app_id, iiko_loyalty_client_secret

// new
poster_account_name
poster_access_token
```

Needs a POS adapter interface (`getSalesReport`, `getMenu`, `getSpots`, `getEmployees`, `getCashShiftStatus`, `getStorageLeftovers`, ...) with `IikoAdapter`/`PosterAdapter` implementations, selected by `tenant.pos_type`, replacing the current direct `iiko.ts` imports scattered across `sales.ts`/`financial.ts`/`operations.ts`/`org.ts`/`ws/hallSync.ts`. This is the real work — every one of those files currently imports iiko-specific functions directly.

Chain/multi-branch: iiko's `organizations.iiko_chain_server/login/password` splice pattern (`middleware/tenant.ts`) has no Poster equivalent yet — needs its own design once Phase 1 is real (Poster franchise-level API surface is much thinner than iiko chain-server).

## 7. Frontend changes needed (this repo)

- Add-restaurant flow: POS type selector (iiko / Poster) as first field, drives which credential fields render.
- `types.ts`: add `pos_type` + poster fields to Tenant type.
- `services/traceApi.ts`: createTenant payload includes `pos_type` + relevant credentials.
- Validation: iiko fields required only if `pos_type === 'iiko'`, poster fields only if `pos_type === 'poster'`.

## 8. Open questions

- ~~Poster webhook payload shape/latency vs TRACEPLUGIN events~~ — **resolved 2026-08-11, real gap confirmed.** Read `en/web/webhooks.md` from `github.com/joinposter/docs` directly. Webhooks exist but: (1) require registering TRACE as a Poster Marketplace application and having each tenant "connect" it from their account — not a drop-in like the `poster_access_token` field TRACE uses today, a real onboarding step; (2) the payload itself is a bare ping (`account`, `object`, `object_id`, `action`, `time`, `verify` signature) — no order/item/table detail included, a follow-up API call is required to fetch what actually changed; (3) `transaction` fires on `added`/`changed`/`removed` (order-level only) and `incoming_order` fires only on new→applied/rejected — there is no entity for in-progress kitchen state, table seating, or item-level order changes the way TRACEPLUGIN hooks `Resto.Front.Api` for. **Verdict: webhooks could feed order-completion-triggered features (e.g. review requests) and possibly a coarse void/removed-order signal (`transaction` action=`removed`), but cannot replace TRACEPLUGIN for active-orders/kitchen-timing/table-turns — those stay a hard gap.** Not built — requires Marketplace app registration, a webhook receiver route, and signature verification, out of scope for a single session; revisit as its own project.
- Poster API rate limits — still not published, still needs empirical testing with a real token under load.
- Whether `dash.*` fixed reports can reproduce every current OLAP metric exactly (e.g. `revenueType === 'food_only'` category-split logic in `sales.ts:146`) — needs field-by-field verification against a live Poster account, not just docs.
- No chain/franchise multi-branch aggregation equivalent to iiko chain-server — needs its own design pass. Still not built.
- **New finding, not in original research:** `menu.getProducts` returns an undocumented `out` field (portions/units still makeable — Poster's own stock+tech-card computation) and a documented `spots[].visible` (manual per-location hide). Verified live against benefitcoffee 2026-08-11 — `out: 0` correctly flagged genuinely-out-of-stock items (Red Bull, teas). This became the basis for the Phase 3 A1 stop-list implementation (`posterAdapter.getStopList`) — no ingredient/tech-card cross-referencing needed, Poster already computes it. One caveat: neither field carries a real "went out at" timestamp, so `stoppedAt` on the Poster path is "when TRACE polled and saw it," not a real event time like the iiko plugin gives.

## Sources
- TRACEBACKEND `src/iiko.ts`, `src/services/iikoLoyalty.ts`, `src/routes/{sales,financial,operations,org}.ts`, `src/ws/hallSync.ts`, `src/middleware/tenant.ts` — read directly
- TRACEPLUGIN `TracePlugin/{TracePlugin,EventBuilder,RealtimeClient}.cs` — read directly
- https://github.com/joinposter/api-php (`src/Descriptions.php`) — read directly
- https://dev.joinposter.com/en
- https://help.joinposter.com/en/
