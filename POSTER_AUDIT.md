# Poster Integration Audit — TRACEBACKEND

Scope: `src/adapters/posterAdapter.ts`, `src/poster.ts`, `src/adapters/types.ts`, and the Poster branches in `src/routes/{operations,sales,financial,loyalty,org,checklistEmployees,ai}.ts`.
Read-only audit — no code was changed.

## Summary

| Severity | Count |
|---|---|
| High | 4 |
| Medium | 10 |
| Low | 4 |
| **Total** | **18** |

Two themes dominate: (a) the `to` date passed into every Poster range call follows iiko's **exclusive** convention while Poster's `dateTo` is **inclusive**, and (b) `spotParams(tenant)` is applied to `dash.getProductsSales`/`getCategoriesSales`/`getTransactions` but is **missing from every `storage.*`, `finance.*`, `incomingOrders.*` and — critically — `dash.getWaitersSales` call**.

---

## HIGH

### H1. Every Poster date range includes one extra day (`to` is exclusive by convention, inclusive at Poster)

**File:** `src/routes/sales.ts:13-28` (`parseDateRange`) + all `fmtPosterDate(to)` call sites in `src/adapters/posterAdapter.ts` (lines 273, 295, 319, 370, 490, 517, 565, 586, 631, 744, 793, 942)
**Severity:** High

`parseDateRange` deliberately makes `to` exclusive, matching iiko's OLAP `DateRange` semantics:

```ts
const to = new Date(query.to as string); to.setDate(to.getDate() + 1);
...
return { from, to: tomorrow, numDays };
```

Every Poster adapter method then does `date_to: fmtPosterDate(to)`, e.g.:

```ts
posterRequest<PosterProductSale[]>(tenant, 'dash.getProductsSales', {
  date_from: fmtPosterDate(from),
  date_to: fmtPosterDate(to),
```

Poster's `dateTo`/`date_to` is an **inclusive calendar day**, so the query covers `from .. to+1day`.

**Failure scenario:** A GM picks 2026-08-01 → 2026-08-07 on Sales. `parseDateRange` returns `to = 2026-08-08`; Poster returns Aug 1–8 inclusive. Top Dishes, ABC, Category Perf, Menu Analysis, Writeoffs, Invoices, Cash Shifts and the GL report are all inflated by one full extra trading day, while the UI's `numDays` (used for `velocity`, `avgPerDay`) still says 7 — so per-day averages are wrong too. For `range=7days` the tenant silently sees 8 days of revenue. `getSalesReport` is the only one that partly self-corrects (it re-buckets by `date_close_date`), but it still emits an extra day row.

**Fix direction:** Subtract one day inside the Poster adapter before formatting (`fmtPosterDateInclusive(to)` = `to - 1 day`), applied once in a helper rather than at each call site, so the iiko-exclusive convention keeps working unchanged for iiko.

---

### H2. `dash.getWaitersSales` is never scoped to the tenant's spot

**File:** `src/adapters/posterAdapter.ts:487-505`
**Severity:** High

```ts
async getWaiterSales(tenant: Tenant, from: Date, to: Date): Promise<WaiterSalesRow[]> {
  const waiters = await posterRequest<PosterWaiterSale[]>(tenant, 'dash.getWaitersSales', {
    dateFrom: fmtPosterDate(from),
    dateTo: fmtPosterDate(to),
  });
```

No `...spotParams(tenant)`, and unlike `getSalesReport`/`getHourly`/`getCashShifts` there is no post-fetch `spot_id` filter either — the response has no per-spot rows to filter on.

**Failure scenario:** `benefitcoffee`-style tenant with 2 spots and `poster_spot_id` set to branch A. Branch A's manager opens Operations → Staff, Staff ABC, Staff Profitability, or the KPI card, and sees **branch B's waiters mixed into their own list**, with branch B's revenue counted in `totalRevenue`, distorting every `share`, `cumShare` and A/B/C grade. `operations.ts:322` (`staffActive: waiters.length`) over-counts headcount for the same reason. This is a cross-location data leak, not just a rounding issue.

Downstream consumers: `operations.ts:319, 371, 673, 871`, `ai.ts:788, 2543, 2676`.

**Fix direction:** Add `...spotParams(tenant)` to the `dash.getWaitersSales` params (Poster accepts `spot_id` on `dash.*`, as the file's own comment at line 21 states); if that endpoint ignores it, derive per-waiter rows from the already-spot-scoped `dash.getTransactions` pull used by `getWaiterAttendanceStats` instead.

---

### H3. Peak-prep day-of-week is off by one on a UTC server

**File:** `src/adapters/posterAdapter.ts:809`
**Severity:** High

```ts
const dateStr = `${get('year')}-${get('month')}-${get('day')}`;   // Tashkent calendar date
const hour = parseInt(get('hour'), 10);
const dow = new Date(dateStr + 'T00:00:00+05:00').getDay();
```

`getDay()` returns the weekday **in the process's local timezone**. Railway runs UTC. `2026-08-15T00:00:00+05:00` is `2026-08-14T19:00Z`, so `getDay()` yields the *previous* weekday for every bucket.

Meanwhile the consumer computes "today" correctly in Tashkent:

`src/routes/operations.ts:1688`
```ts
const todayDowPoster = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent' })).getDay();
...
if (b.dow === todayDowPoster) hourAvgMap.set(b.hour, b.avgOrders);
```

**Failure scenario:** On a Saturday, the buckets tagged `dow=6` actually contain **Sunday's** history. Operations → Peak Prep shows Sunday's traffic curve labelled as today, recommending the wrong staffing for the wrong day. `ai.ts:2670` (shift-schedule) consumes the same mis-tagged `dow`. The bug is invisible in local dev if `TZ=Asia/Tashkent`, which is likely why it shipped.

**Fix direction:** Compute the weekday timezone-independently, e.g. `new Date(dateStr + 'T12:00:00Z').getUTCDay()`, or read the weekday straight out of the same `Intl.DateTimeFormat` by adding `weekday: 'short'` to the formatter used at line 797.

---

### H4. `fmtPosterDate(new Date())` computes "today" in UTC, not Tashkent

**File:** `src/adapters/posterAdapter.ts:11` (`fmtPosterDate`), used for "today" at lines 443, 708; `src/routes/operations.ts:172`
**Severity:** High

```ts
const fmtPosterDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
```

`src/routes/operations.ts:172`
```ts
const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
```

The rest of the codebase explicitly rejects this. `src/routes/sales.ts:863` and its iiko sibling comment:

```ts
// "Today" must be the restaurant's day, not the server's UTC day —
// before 05:00 Tashkent the UTC date is still yesterday.
const today = dateParam ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
```

**Failure scenario:** Tashkent is UTC+5. Between 00:00 and 05:00 local, `toISOString()` still reports **yesterday**. A late-night bar checking the dashboard at 01:30:
- `getDeliveryOrders` (line 443) queries yesterday → the active-deliveries board is empty even with live orders.
- `getServiceTiming` (line 708) computes median service time from yesterday's orders → Operations KPI shows a stale number.
- `operations.ts:172-175` cash-shift card reports yesterday's cash/card/revenue/orders totals as "today".

Note the mirror case for the *end* of the day: a shift closing at 23:30 Tashkent is 18:30 UTC — same date, so only the 00:00–05:00 window is affected, but that is exactly the window a bar/night venue cares about.

**Fix direction:** Add a `posterToday()` helper built on `toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })` (Poster returns `date_close_date` in the account's local time, so this is the matching frame) and use it everywhere a bare `new Date()` currently feeds `fmtPosterDate`.

---

## MEDIUM

### M1. `storage.*`, `finance.getReport` and `incomingOrders.*` calls are not spot/storage-scoped

**File:** `src/adapters/posterAdapter.ts` — `getWriteoffs` (560), `getInvoices` (583), `getInventory` (604), `getInventoryDocs` (882), `getGLReport` (912), `getReservations` (835), `getStopList` (470)
**Severity:** Medium

None of these pass `spotParams(tenant)` or a `storage_id`. `getInventoryDocs` explicitly fans out over **all** storages (`storages ?? []`), and `getInventory` calls `storage.getStorageLeftovers` with no arguments at all.

**Failure scenario:** A two-spot tenant scoped to branch A sees branch B's warehouse in Financial → Inventory, B's supplier invoices in Financial → Invoices, and B's waste in the Operations KPI `wasteSum` (`operations.ts:321`) and the AI waste-root-cause prompt (`ai.ts:2394`). Because `getWriteoffs` maps `category` to the **storage name**, the mixed rows even look plausible — the manager just sees warehouses they don't recognise. Same class of leak as H2 but on the cost side, so P&L-adjacent numbers are affected.

**Fix direction:** Resolve the tenant's storage id(s) once (`storage.getStorages` filtered by the spot, cached), and pass `storage_id` to `getStorageLeftovers`/`getWastes`/`getSupplies`/`getStorageInventories`; add `spot_id` to `incomingOrders.getReservations` and `finance.getReport`. Where Poster offers no scoping param, filter the returned `storage_id`/`spot_id` client-side the way `getCashShiftStatus` already does.

---

### M2. Waiter data is joined by display name, not `user_id`

**File:** `src/adapters/posterAdapter.ts:521-524`, consumed at `src/routes/operations.ts:388`, `src/routes/ai.ts:2548, 2678`
**Severity:** Medium

```ts
const byWaiter = new Map<string, {...}>();
for (const o of orders ?? []) {
  const name = o.name; if (!name) continue;
```

and

`src/routes/operations.ts:388`
```ts
const att = attendance.get(w.name);
```

Both `PosterTransaction.user_id` (line 66) and `PosterWaiterSale.user_id` (line 98) are declared and available.

**Failure scenario (a):** Two waiters named "Aziza" — their guests, service times and dish lists are merged into one bucket, and both `getWaitersSales` rows read the same merged attendance record. **(b):** `dash.getWaitersSales` returns a name formatted differently from `dash.getTransactions`' `name` (e.g. trailing whitespace, or first-name-only vs "First Last"). The `.get()` miss is silent — `att` is `undefined`, so the row renders `guests: 0`, `avgServiceMin: null`, `topDishes: []` and looks like "Poster doesn't support this" rather than a join failure. Note `getWaiterSales` applies `w.name || 'Unknown'` but does **not** `.trim()`, while nothing trims `o.name` either.

**Fix direction:** Key `getWaiterAttendanceStats` by `user_id` and return `user_id` on `WaiterSalesRow`, joining on that; keep name only for display. At minimum, `.trim()` both sides and fall back to a normalized-name lookup.

---

### M3. `getMenuAnalysis` reports 100% margin on every dish when the cost fetch fails

**File:** `src/adapters/posterAdapter.ts:625-648`
**Severity:** Medium

```ts
posterRequest<PosterProductCost[]>(tenant, 'menu.getProducts', { type: 'products' }).catch(() => []),
posterRequest<PosterProductCost[]>(tenant, 'menu.getProducts', { type: 'batchtickets' }).catch(() => []),
...
const costPerUnitKopecks = costByProductId.get(s.product_id) ?? 0;
const cost = toCurrency(costPerUnitKopecks * qty);
const grossProfit = revenue - cost;
const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : null;
```

**Failure scenario:** Poster rate-limits or 500s on `menu.getProducts` (a heavy call, made 2× here and 2× more in `productNameMap`). Both promises resolve to `[]`, `costByProductId` is empty, and **every** row comes back `cost: 0, grossProfit: revenue, marginPct: 100`. Financial → Menu Analysis renders a fully populated, plausible-looking table telling the owner every dish has a 100% margin. The route (`financial.ts:1302-1304`) has no way to tell this apart from a genuine "no cost configured" account. Contrast `getAbcRows`, which sets `cost: 0` *deliberately* and is documented as such — here it is an error being laundered into data.

**Fix direction:** Let the cost fetch reject, or track a `costsAvailable` flag; when the cost map is empty, return `cost: null`/`marginPct: null` (the `MenuAnalysisRow.marginPct` type already allows null) rather than 0/100, so the UI shows "—".

---

### M4. Loyalty member count is capped at 300 by the adapter's display slice

**File:** `src/adapters/posterAdapter.ts:874` (`.slice(0, 300)`), consumed at `src/routes/loyalty.ts:29-30`
**Severity:** Medium

```ts
.sort((a, b) => b.totalSpent - a.totalSpent)
.slice(0, 300);
```

```ts
const avgSpent = clients.length ? Math.round(clients.reduce((s, c) => s + c.totalSpent, 0) / clients.length) : 0;
res.json({ totalMembers: clients.length, ... avgSpent, ... });
```

**Failure scenario:** A tenant with 5,000 CRM clients sees **"300 members"** on the Loyalty page forever, and `avgSpent` is the average of the top-300 spenders — materially higher than the true average. The cap is documented as a *dashboard display* limit but is being reused as a *count*.

**Fix direction:** Return the untruncated total (and true average) alongside the capped row list — e.g. `{ total, avgSpent, rows }` — and slice only in the list-rendering path (`loyalty.ts:83`, which already applies its own `limit`).

---

### M5. `GET /loyalty/guests/:phone` misses any client outside the top 300 or with a formatted phone

**File:** `src/routes/loyalty.ts:131-133`
**Severity:** Medium

```ts
const clients = await posterAdapter.getClientsList!(tenant);
const c = clients.find(c => c.phone === phone || c.id === phone);
if (!c) { res.status(404).json({ error: 'not found' }); return; }
```

`c.phone` is Poster's raw `phone` string, which commonly comes back formatted (`+998 (90) 123-45-67`). The route param comes from whatever the guest list rendered.

**Failure scenario:** Exact string equality plus the 300-row cap means the guest-detail panel 404s for most of a real account's customers. It also refetches the entire client list on every single lookup (no cache), so a busy Loyalty page hammers `clients.getClients`.

**Fix direction:** Normalize both sides to digits-only before comparing, and use Poster's `clients.getClient`/`clients.getClients?phone=` single-lookup rather than scanning a capped in-memory list.

---

### M6. Operations → Staff `dishes` is a distinct-name count capped at 15, not items sold

**File:** `src/routes/operations.ts:386`
**Severity:** Medium

```ts
name: w.name, orders: w.orders, revenue: w.revenue, guests: att?.guests ?? 0, dishes: att?.topDishes.length ?? 0,
```

`topDishes` is `.slice(0, 15)` in the adapter (`posterAdapter.ts:549`). The iiko branch of the same route sets `dishes` from `DishAmountInt` — **total items sold** (`operations.ts:588`).

**Failure scenario:** A waiter who sold 340 items across 22 distinct dishes shows `dishes: 15` — hard-capped, so every busy waiter shows the identical number 15 and the column looks broken. The correct figure is already computed inside the adapter (`b.dishes` entries carry `qty`); it is just never summed or returned.

**Fix direction:** Have `getWaiterAttendanceStats` also return `totalItems` (sum of `qty` over the full pre-slice dish map) and use that for `dishes`, keeping `topDishes` for the drill-down.

---

### M7. Poster per-waiter `topDishes` includes service charges and modifiers

**File:** `src/adapters/posterAdapter.ts:533-541`
**Severity:** Medium

The loop adds every product line with no filtering. The iiko branch of the same feature explicitly strips them, and explains why (`operations.ts:519-525`):

> Excludes: the "Обслуживание N%" service-charge line (a fee, not a sold dish — every order carries one) and zero-revenue rows (cooking-preference/allergen modifiers…). A single breakfast-set order routinely has 6-8 of these alongside 2-3 real dishes.

`NOISE_CATEGORIES` already exists in the same file (line 29) and is applied in `getCategoryPerf`, `getAbcRows` and `getMenuAnalysis` — just not here.

**Failure scenario:** The Poster staff drill-down's #1 "top dish" for every waiter is the service charge, and the 15-row cap is consumed by zero-revenue modifiers, pushing real dishes out. This is the same drill-down the just-fixed dishes bug restored, so it will be the first thing a user looks at.

**Fix direction:** Filter zero-revenue lines and service-charge/modifier names before bucketing, reusing `NOISE_CATEGORIES` plus the `/^Обслуживание\b/i` test the iiko path uses.

---

### M8. `getCategoryPerf` ranks and truncates by revenue-per-item, and `orders` is an item count

**File:** `src/adapters/posterAdapter.ts:316-333`
**Severity:** Medium

```ts
const orders = Math.round(Number(c.count)) || 0;
return { name: ..., revenue, orders, avgCheck: orders > 0 ? Math.round(revenue / orders) : 0 };
})
.sort((a, b) => b.avgCheck - a.avgCheck)
.slice(0, 6);
const maxAvg = rows[0]?.avgCheck ?? 1;
return rows.map(r => ({ ...r, pct: Math.round((r.avgCheck / maxAvg) * 100) }));
```

The file comment acknowledges `avgCheck` is revenue-per-item, but the `.slice(0, 6)` is applied **after sorting by that approximation**, and `orders` is shipped to the frontend under a field name that means order count everywhere else (`CategoryPerf.orders`, `types.ts:37`).

**Failure scenario:** A restaurant with a "Wine / Bottles" category selling 4 bottles at 900k each outranks "Hot Drinks" with 3,000 cups — Sales → Category Performance shows six niche high-ticket categories and omits the ones actually driving revenue. The `orders` column simultaneously reads ~10× too high for drink categories (items, not orders).

**Fix direction:** Slice the top 6 by `revenue` (keeping `avgCheck` as a displayed column), and either rename the field to `items` or surface a `unit: 'items'` marker so the frontend stops labelling it "orders".

---

### M9. `dash.*` parameter casing is inconsistent — one convention must be silently ignored

**File:** `src/adapters/posterAdapter.ts` — `date_from`/`date_to` at 272-273, 294-295, 318-319, 415-416, 447-448, 517, 630-631, 711-712, 744, 793, 941-942 vs `dateFrom`/`dateTo` at 369-370, 489-490, 564-565, 585-586, 918-919
**Severity:** Medium

Two spellings are used against the same API surface, including two different spellings for `dash.*` methods (`dash.getTransactions` → `date_from`, `dash.getWaitersSales` → `dateFrom`). `posterRequest` passes params through verbatim (`poster.ts:28-30`), and Poster ignores unrecognised query params rather than erroring.

**Failure scenario:** Whichever convention is wrong for a given endpoint causes Poster to fall back to its **default range** (typically the current day or the full account history) with a 200 OK. `getWaiterSales` for a 30-day Staff-ABC range would then quietly return only today's numbers — a plausible-looking but wrong table, with no error anywhere in the logs. The file's own comments flag `dash.getWaitersSales` and the `storage.*` methods as "not yet live-verified", which is exactly the set using the minority casing.

**Fix direction:** Verify each endpoint's parameter name against Poster's docs and normalize; add a one-time assertion in dev (e.g. request a deliberately narrow range and confirm the response is actually narrower) so a silently-ignored date param surfaces during integration rather than in production.

---

### M10. Open-order calls have no date bound

**File:** `src/adapters/posterAdapter.ts:670-675` (`getActiveOrders`), `741-742` (`getTableTurnsRaw` open leg)
**Severity:** Medium

```ts
const orders = await posterRequest<PosterTransaction[]>(tenant, 'dash.getTransactions', {
  status: 1,
  include_products: true,
  ...spotParams(tenant),
});
```

No `date_from`/`date_to` at all, unlike every other `getTransactions` call in the file.

**Failure scenario:** If Poster defaults this to "today", a bar's order opened at 23:40 disappears from Active Orders and Hall Occupancy the instant the clock passes midnight — while the table is still occupied. If instead it defaults to the full account history, every stale never-closed order from months back is rendered as a live table with a `ticketMin` in the hundreds of thousands, and `getTableTurnsRaw`'s `active` list fills with phantom overdue tables. Either default is wrong; the call doesn't say which it is getting.

**Fix direction:** Pass an explicit window (e.g. yesterday → today in Tashkent) and drop rows whose `openTime` exceeds the same stale cutoff the iiko path uses (`operations.ts:575`: 300 minutes).

---

## LOW

### L1. `getSalesReport` dereferences `date_close_date` before checking it

**File:** `src/adapters/posterAdapter.ts:280-281`
**Severity:** Low

```ts
const date = t.date_close_date.slice(0, 10);
if (!date) continue;
```

The guard runs *after* the dereference. `getHourly` (line 419) correctly pre-filters on `t.date_close_date`. A `status === '2'` transaction with a null/absent `date_close_date` (Poster returns `''` or omits it for some refund/void shapes) throws a `TypeError`, which `sales.ts:236` turns into a 500 on the whole revenue endpoint rather than skipping one row.

**Fix direction:** Move the truthiness check into the `scoped` filter, matching `getHourly`.

### L2. Orders with no table land in a phantom "table 0"

**File:** `src/adapters/posterAdapter.ts:748-749`, `766`, `947-949`
**Severity:** Low

`o.table_id != null` passes for the string `"0"`, which Poster uses for takeaway/counter orders. `Number("0")` is finite, so `getTableRevenue` emits a `table: 0` bucket and `getTableTurnsRaw` reports a permanently occupied table 0. The Hall Map heat mode gets a phantom high-revenue table; the iiko path filters these via `isRealTable()`.

**Fix direction:** Treat `"0"`/`""` as "no table" in both methods, and apply the same `isRealTable(tenant.subdomain, n)` check the iiko branch uses.

### L3. `PosAdapter.getWaiterAttendanceStats` signature omits `topDishes`

**File:** `src/adapters/types.ts:238` vs `src/adapters/posterAdapter.ts:514`
**Severity:** Low

```ts
getWaiterAttendanceStats?(tenant: Tenant, from: Date, to: Date): Promise<Map<string, { guests: number; avgServiceMin: number | null }>>;
```

The implementation returns `topDishes` too, and `operations.ts:386, 391` reads it. `posterAdapter` is annotated `: PosAdapter`, so the property is not in the declared type — the call sites only compile because `.catch(() => new Map())` widens the union to `Map<any, any>`. The project runs on `tsx` with no typecheck step, so nothing catches it; remove the `.catch` and the build breaks.

**Fix direction:** Add `topDishes: { name: string; qty: number; revenue: number }[]` (and, per M6, `totalItems`) to the interface's return type.

### L4. `sessionNumber` and `cashDiff` carry misleading semantics

**File:** `src/adapters/posterAdapter.ts:394, 403`
**Severity:** Low

```ts
sessionNumber: Number(s.cash_shift_id) || 0,
...
cashDiff: isOpen ? 0 : toCurrency(end - expectedEnd),
```

`sessionNumber` renders Poster's opaque internal shift id where the iiko path shows a human-scale sequential shift number — a Poster tenant sees "Shift #148372" next to iiko's "Shift #412". Separately, `cashDiff: 0` for an open shift is indistinguishable in the UI from a genuinely reconciled 0.00 discrepancy.

**Fix direction:** Derive `sessionNumber` from the shift's position in the date-sorted list (or drop the field for Poster), and make `cashDiff` `null` for open shifts so the UI can render "—". The `CashShiftRow.cashDiff` type would need widening to `number | null`.
