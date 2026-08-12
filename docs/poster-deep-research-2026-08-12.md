# Poster API — Full Capability Audit (2026-08-12)

Complete pass over `github.com/joinposter/docs` (195 method docs across 15 groups), read directly method-by-method — not the earlier surface-level pass. Goal: find every real feature TRACE could build for Poster tenants, and correct any prior "impossible" calls that don't hold up.

## 0. Major correction to prior work

Earlier today I hid **Active Orders board** and the **Kitchen/Service time KPIs** for Poster tenants, reasoning they were TRACEPLUGIN-only with no Poster equivalent. That's wrong for two of the three:

**`dash.getTransactions` supports `status=1` (open orders only), `include_products=true`, and `include_history=true`** — confirmed via direct doc read, not previously checked. This single already-used endpoint returns:
- `table_id`, `table_name`, `guests_count`, `user_id`/`name` (waiter), `date_start` — everything Active Orders / Hall Occupancy need, live (poll-based).
- `products[]` with `num` per line — item count, no second call needed.
- `history[]` embedded per transaction — `open`, `additem`/`deleteitem`, `sendtokitchen`, `close`, `print` events with real Unix timestamps — the same shape `dash.getTransactionHistory(transaction_id)` returns standalone.

This means:
- **Active Orders board** — buildable: poll `dash.getTransactions?status=1&include_products=true` (e.g. every 20-30s, same pattern already used for the existing "all branches" 30s-refresh note in `Operations.tsx`). Not a push feed like TRACEPLUGIN, but not fake either — real open orders, real tables, real ticket-open time. The endpoint also accepts a direct `table_id` filter param, so a single-table drill-down doesn't need a second call type.
- **Hall Occupancy** — same call gives occupied `table_id`s directly.
- **Avg Service Time** — `date_close - date_start` on closed transactions, no extra call.
- **Kitchen Serve Time** — better than initially found: `dash.getTransactions` (and `getTransactionHistory`) expose **`processing_status`** — `10=open, 20=preparing, 30=cooked/ready, 40=courier en route, 50=delivered, 60=closed, 70=deleted` — a real "food ready" state, not just an inferred proxy from `sendtokitchen`→`close`. Combined with `history[]` timestamps this gives an honest kitchen-ready time, on par with what TRACEPLUGIN provides. (Found via the more complete Russian-language doc dump at `docs/poster.md` in this repo — richer than the English `github.com/joinposter/docs` mirror I used for the first pass; it also surfaces `round_sum`, `payed_third_party`, `client_phone`, and a full `delivery{}` object with `courier_id`/lat-lng/zone not visible in the English docs.)

**Void Tracker** stays genuinely dead — `history[]` has `deleteitem` (item removed while order still open) but nothing for a fully deleted/voided *closed* order the way TRACEPLUGIN's `order_before_delete`/`order_printed_items_deleted` capture it. Partial coverage at best, not equivalent.

**Recommendation:** revert the "hide entirely" decision for Active Orders + service/kitchen timing, rebuild them on `status=1&include_products=true&include_history=true`, and label them "poll · updates every ~30s" rather than "Live" (same honesty principle as everything else built today) — don't reuse the pulsing "Live" badge that implies a push feed.

## 1. Full method inventory by group

| Group | Method count | What TRACE uses today |
|---|---|---|
| `dash` | 11 | `getTransactions`, `getProductsSales`, `getCategoriesSales`, `getWaitersSales` |
| `finance` | 19 | `getCashShifts` |
| `menu` | 25 (+writes) | `getCategories`, `getProducts` |
| `access` | 9 (+writes) | `getEmployees`, `getRoles`* |
| `storage` | 21 (+writes) | `getWastes`, `getSupplies`, `getStorageLeftovers`, `getStorages` (added today) |
| `clients` | 14 (+writes) | none |
| `spots` | 4 | none |
| `incomingOrders` | 8 (+writes) | `getIncomingOrders` (delivery only) |
| `settings` | 7 | none |
| `application` | 2 | none |
| `franchise` | 3 | none |
| `payments` | 2 | none |
| `transactions` | 11 (+writes) | none (this is the write-back / POS-terminal-action group) |
| webhooks | — | none (no Marketplace app registered) |

\* `access.getRoles` used in `posterEmployees()` for checklist import, not in `posterAdapter.ts`.

## 2. New feature opportunities, ranked

### A. Real, buildable now (poll-based, no new project needed)

1. **Active Orders + Hall Occupancy** (revert today's hide, rebuild per §0) — `dash.getTransactions?status=1&include_products=true`.
2. **Service/Kitchen time KPIs** (revert today's hide) — same call + `include_history=true`, or targeted `dash.getTransactionHistory` for today's closed orders.
3. **Table Reservations** — `incomingOrders.getReservations`/`createReservation`. Fields: `date_reservation`, `duration` (seconds), guest contact info, `status` (new/accepted/canceled). **This has no iiko-side equivalent in TRACE at all** — genuinely new capability for Poster tenants specifically, not a port.
4. **CRM / Loyalty tab for Poster** — `clients.getClients`/`getClient`/`getGroups`. Real fields: `bonus` (points balance, kopecks), `total_payed_sum` (lifetime spend), `loyalty_type` (1=points, 2=discount), `discount_per`, `birthday` (+ `birthday_bonus`), `ewallet` balance, group membership. `clients.sendSms` exists for write-back (marketing blast) if ever wanted. Distinct from iiko's certificate/program loyalty model — a Poster-native "customer list with lifetime value + bonus balance" view, not a port.
5. **Doc-based Inventory alternative** — `storage.getStorageInventories(storage_id)` returns actual stocktaking documents (`inventory_id`, `date_start`, `date_end`, `sum`, `inventory_status`) — the literal iiko-shaped equivalent, sitting alongside the live-balance view (`getStorageLeftovers`) already wired today. Could offer both: "Live Stock" (already built) and "Count History" (this) as two views in the Inventory tab.
6. **GL-ish P&L category breakdown** — `finance.getReport` gives `categories` with `parent_id`/`level` hierarchy and `amounts` per period (`dateFrom`/`dateTo`, `period`: year/quarter/month/week/day). Not a full chart-of-accounts like iiko's TRANSACTIONS OLAP, but real enough to back a simplified GL Summary tab for Poster instead of the current empty stub — previously assumed impossible, isn't.
7. **Fiscal/receipt info** — `spots.getSpotFiscalCompanies`, `getSpotInvoiceData` — minor, mostly relevant if TRACE ever needs receipt/tax compliance display.
8. **Better Delivery Orders** — current `getDeliveryOrders` joins `incomingOrders.getIncomingOrders` (crude new/accepted status) against `dash.getTransactions` just for the sum. `dash.getTransactions?service_mode=3&include_delivery=true` gives the real thing directly: `processing_status` (open/preparing/cooked/courier/delivered), full `delivery{}` (courier_id, address, lat/lng, delivery zone, delivery_time), in one call instead of two joined ones.

### B. Real, but a genuine separate project (write access, new auth model, or new infra)

8. **Webhooks (push, not poll)** — confirmed event catalog: `transaction`, `incoming_order`, `client`/`client_payed_sum`/`clients_group`/`promotion`/`client_ewallet`/`loyalty_rule`, `storage`/`stock`/`supply`/`book_transaction`/`cash_shift_transaction`, plus menu-entity events. Payload is a bare ping (`account`, `object`, `object_id`, `action`, `time`, `verify` MD5 signature) — always needs a follow-up API call. Requires registering TRACE as a **Poster Marketplace application** + each tenant "connecting" it — real onboarding step, not just a token field. Would upgrade Active Orders/reservations/CRM changes from 20-30s polling to near-instant push. Worth doing eventually, not a quick add.
9. **Franchise / multi-branch chain compare** — `franchise.getSpots`/`getTransactionsByClientId` **require a separate franchise-level token**, distinct from the per-branch `poster_access_token` tenants currently provide — confirmed via docs, not assumed. This is a different provisioning model (one franchise token covering many spots) than TRACE's current per-tenant-per-branch Poster setup. Real project: new admin field, new auth path, new `org.ts` branch — matches what was already flagged as backlog, now with the actual blocker identified precisely (not just "no chain equivalent," specifically "needs a second credential type").
10. **Write-back actions** (`transactions.*` group — `addTransactionProduct`, `closeTransaction`, `changeTransactionProductCount`, etc.; `menu.createProduct/updateProduct`; `storage.createWriteOff/createSupply`; `access.createSpot`) — lets TRACE *act* on Poster (86 an item from the stop-list UI instead of just viewing it, log a write-off from TRACE instead of Poster's own app, create a reservation from TRACE). Bigger trust/scope question — read-only has been the posture everywhere else in this codebase (see `posterRequest`'s own comment: "Read-only GET calls only" era). Worth a deliberate decision, not a silent add.

## 3. Recommendation / suggested order

1. Revert today's "hide Active Orders + service/kitchen KPIs" for Poster, rebuild on `status=1` polling (§0) — closes the gap I introduced today with better information than I had at the time.
2. Ship Reservations tab for Poster (§A3) — zero iiko overlap, real customer-facing value, moderate effort.
3. Ship Poster CRM/Loyalty view (§A4) — same effort tier, fills the Admin.tsx loyalty-fields gap noted earlier.
4. Doc-based Inventory toggle (§A5) and GL Summary via `finance.getReport` (§A6) — smaller, finishes off the Financial tab gaps.
5. Webhooks (§B8) and franchise chain-compare (§B9) — flag as real projects, don't start without your go-ahead given the new-infra/new-auth-model scope.
6. Write-back actions (§B10) — flag as a scope decision (read-only vs act-on-Poster), not something to default into.

Sources: `github.com/joinposter/docs` (`en/web/dash/*`, `finance/*`, `storage/*`, `clients/*`, `spots/*`, `incomingOrders/*`, `franchise/*`, `webhooks.md`, `payments/getOpenTransactionsOnTable.md`) — every field/param above quoted from the doc, not inferred. `payments.getOpenTransactionsOnTable` was checked and ruled out as the live-orders mechanism (it's a per-table, payment-terminal-signed endpoint, not a general reporting call) — `dash.getTransactions?status=1` is the real path.
