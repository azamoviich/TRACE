# Poster Phase 2 — Backend Adapter + Poster Client

Prereq: `docs/poster-integration.md` (research), `docs/poster-phase1-frontend.md` (tenant fields shipped).
Repo: TRACEBACKEND (separate repo, Railway).
**Blocker: needs a real Poster test account + `access_token` before any endpoint call can be verified.** Don't write this phase's code against assumed field shapes — the doc's §8 open questions exist because nothing here has been tested live yet.

## Goal
Introduce a POS adapter interface so `sales.ts`/`financial.ts`/`operations.ts`/`org.ts`/`ws/hallSync.ts` stop importing `iiko.ts` functions directly, and instead call through an adapter selected by `tenant.pos_type`. Build `PosterAdapter` as the second implementation alongside the existing iiko logic (which becomes `IikoAdapter` in spirit, though the actual `iiko.ts` file can stay mostly as-is — wrap it, don't rewrite it).

## Step 0 — DB migration
Add columns to `tenants` table: `pos_type TEXT NOT NULL DEFAULT 'iiko'`, `poster_account_name TEXT`, `poster_access_token TEXT` (encrypted at rest — check `src/db/encryptCredentials.ts`, iiko_password and similar are likely encrypted; `poster_access_token` needs the same treatment, follow the exact pattern used for `iiko_password`/`iiko_loyalty_client_secret`, don't invent a new one).

## Step 1 — `src/poster.ts` (new file, mirrors `src/iiko.ts` shape)
```ts
export function posterBase(tenant: Tenant): string {
  return `https://${tenant.poster_account_name}.joinposter.com/api`;
}

export async function posterRequest<T>(tenant: Tenant, method: string, params: Record<string, any> = {}, httpMethod: 'get' | 'post' = 'get'): Promise<T> {
  // token is a query param (?token=...), not a header — confirmed from api-php SDK
  // no separate auth step needed unlike iiko — token is static per account, no expiry/refresh cycle to manage
}
```
No token-cache map needed here (unlike `iiko.ts:8` `tokenCache`) — Poster's `access_token` doesn't expire the way iiko's session token does, per the SDK. **Verify this against real API behavior before shipping — if wrong, add the same cache pattern `iiko.ts` uses.**

## Step 2 — Adapter interface
```ts
interface PosAdapter {
  getSalesReport(tenant: Tenant, from: string, to: string, opts?: {...}): Promise<SalesRow[]>;
  getTopDishes(tenant: Tenant, from: string, to: string): Promise<...>;
  getCategoryPerf(tenant: Tenant, from: string, to: string): Promise<...>;
  getWaiterSales(tenant: Tenant, from: string, to: string): Promise<...>;
  getCashShiftStatus(tenant: Tenant): Promise<{ isOpen: boolean; cashier: string | null; openTime: string | null }>;
  getEmployees(tenant: Tenant): Promise<Employee[]>;
  getSpotsAndHalls(tenant: Tenant): Promise<HallSection[]>;
  getStorageLeftovers(tenant: Tenant): Promise<StockItem[]>; // new capability, no iiko equivalent — see phase 3
}
```
Shape the interface around what the call sites in Step 3 actually need — read each call site first, then define the interface to match, not the other way around. The list above is a starting sketch from `docs/poster-integration.md` §5/§6, not gospel.

`IikoAdapter` implementation: thin wrappers around existing `iiko.ts` functions (`iikoAuth`, `iikoOlapRaw`, etc) — reshape their output to the common interface, don't touch their internals.

`PosterAdapter` implementation: calls `posterRequest` with the matching Poster method per `docs/poster-integration.md` §5 Phase 1 list (`dash.getProductsSales`, `dash.getCategoriesSales`, `dash.getWaitersSales`, `finance.getCashShifts`, `access.getEmployees`, `spots.getSpotTablesHalls`/`getTableHallTables`).

## Step 3 — Rewire call sites (the actual refactor — do this file by file, test after each)
Real import sites found by reading source directly:
- `src/routes/sales.ts:3` — `import { iikoBase, iikoAuth, iikoOlapRaw } from '../iiko.js'`, used in `iikoOlap()` (line ~80) for revenue/top-dishes/category-perf.
- `src/routes/financial.ts:3` — same imports, used for P&L, inventory, write-offs, GL summary.
- `src/routes/operations.ts:3` — `iikoBase, iikoAuth, iikoOlapRaw, iikoWaiterNames, isWaiterName`, used for active-orders, cash-shift, staff-abc, table-revenue.
- `src/routes/org.ts:4,6` — `iikoAuth` + re-imports `iikoOlap` from `sales.js`, used for multi-branch compare fan-out.
- `src/ws/hallSync.ts` — no direct iiko import shown in earlier grep (works off `hall_plans` DB table + `iiko_section_id` column), but the sync job that populates `hall_plans` from iiko sections lives somewhere upstream — find it before assuming this file is adapter-agnostic already.

For each file: replace the direct `iiko.ts` import with a call through `getAdapter(tenant)` (a small factory: `tenant.pos_type === 'poster' ? posterAdapter : iikoAdapter`), keep every existing `if (!tenant.iiko_server || ...)` credential-check guard but branch it on `pos_type` too (`pos_type === 'iiko' ? checkIikoCreds(tenant) : checkPosterCreds(tenant)`).

**Do this incrementally — one route file per commit, run existing tests/manual smoke test against a real iiko tenant after each, to confirm the adapter refactor didn't regress iiko behavior.** iiko is the production path for every existing tenant; breaking it while adding Poster is the failure mode to avoid most.

## Step 4 — Chain/multi-branch gap
`org.ts` compare route depends on `organizations.iiko_chain_server/login/password` (see `middleware/tenant.ts:56-81`). Poster has no equivalent credential concept. For Phase 2, either: (a) explicitly disable multi-branch compare for `pos_type === 'poster'` tenants with a clear UI message, or (b) if the org has multiple Poster tenants, fan out `dash.*` calls per-tenant client-side (each branch's own `poster_account_name`/`poster_access_token`, no chain-level auth needed since Poster tokens aren't chain-scoped the way iiko's are) — this is actually simpler than iiko's chain-server splice, just needs its own code path, not a reuse of `spliceChainCredentials`.

## Definition of done
- A tenant with `pos_type = 'poster'` and real test credentials can load Dashboard, Sales, Operations (minus stop-list), Financial (minus exact GL taxonomy match), and hall map, all showing real Poster data.
- Every existing iiko tenant still works identically (regression check, not assumption).
- `docs/poster-integration.md` §8 open questions are resolved or explicitly re-flagged with findings from real testing.

## Explicitly out of scope
- Stop-list, live inventory UI, writable loyalty, invoices screen — Phase 3.
- TRACEPLUGIN-equivalent realtime events / webhooks — Phase 3, and only after a dedicated spike.
