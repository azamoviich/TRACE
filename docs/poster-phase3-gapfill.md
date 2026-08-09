# Poster Phase 3 — Gap-Fill + New Features

Prereq: Phase 1 (frontend) and Phase 2 (backend adapter) both live and proven against a real Poster test tenant. Do not start this phase until Phase 2's "definition of done" is actually met — these items build on the adapter existing and working.

## A. Confirmed gaps to resolve

### A1. Stop-list equivalent
TRACE's Operations page shows a stop-list (86'd items) sourced from iiko. No `stoplist`-named method found in the Poster SDK catalog during Phase 0 research (`docs/poster-integration.md` §3 MenuAPI list). Before building anything:
1. Check `menu.updateProduct` params (visible in `Descriptions.php` around the `MenuAPI` class, line ~424 in the raw file if still cached at `/private/tmp/.../scratchpad/poster_descriptions.php` from the original research session, otherwise re-fetch `https://raw.githubusercontent.com/joinposter/api-php/master/src/Descriptions.php`) for a hidden/visibility/out-of-stock flag per spot.
2. If no per-spot availability flag exists in MenuAPI, check `storage.getStorageLeftovers` — a stop-list is often just "items with zero stock," so it may be derivable from Phase 2's inventory data instead of a dedicated endpoint. This is plausible and would make the feature better than iiko's (real stock-driven stop-list vs iiko's presumably manually-toggled one — confirm which iiko actually does before assuming).

### A2. Void-events field mapping
`dash.getTransactionWriteOffs` is the rough match flagged in the original comparison. Needs a real transaction pulled from a test account, fields compared against what `operations.ts`'s void-events route currently expects from iiko, and a mapping layer written. Don't assume the shapes match.

### A3. Chain/multi-branch compare
Whichever approach Phase 2 Step 4 chose (disable vs per-tenant fan-out) — if disabled, this is where it gets built properly. Per-tenant fan-out design: iterate all Poster-backed tenants under one `organization_id`, call `dash.*` per tenant in parallel (same pattern as `org.ts`'s existing `Promise.all` fan-out for iiko chain branches, just keyed differently — no shared chain credential, each tenant's own `poster_account_name`/`poster_access_token`).

## B. New features Poster enables that iiko doesn't (today)

These aren't required for parity — they're upside. Prioritize by what a restaurant owner would actually notice, not by API availability.

### B1. Live inventory balance (`storage.getStorageLeftovers`, `storage.getStorages`)
iiko side only gives write-off GL classification, never a live "how much flour do we have right now" number. This is a genuinely new screen/widget — a real-time stock view, potential low-stock alert (could plug into the existing `/ai/*` briefing pattern other pages use, e.g. `AI Daily Briefing` in Dashboard already synthesizes iiko data into prose — same idea, low-stock items included).

### B2. Writable loyalty/CRM (`clients.*` full CRUD, `changeClientBonus`, `getGroups`, `sendSms`)
Current Loyalty page (`components/views/Loyalty.tsx`) is read-only guest lookup via iikoLoyalty. Poster-backed tenants could get: manual bonus balance adjustment (staff-initiated), client segmentation into groups, bulk SMS campaigns. This is a materially bigger feature than what exists today — scope it as its own sub-project once base parity (Phase 1+2) ships, not bundled in.

### B3. Invoices / incoming supply docs (`storage.getSupplies`, `createSupply`)
No equivalent screen exists today for either POS. New Financial sub-page: view/create incoming supply documents. Straightforward addition given Phase 2's adapter pattern already handles the auth/request plumbing.

### B4. Live order read/write (`transactions.*`)
iiko integration is read-only against orders (TRACE polls OLAP/cashshift state, never writes an order). Poster's TransactionsAPI allows creating/modifying live orders via API. Whether TRACE wants this is a product decision, not an engineering one — flag to the user before building, this changes TRACE from an observability tool into an actual order-entry surface for Poster tenants, which is a scope change worth confirming explicitly.

### B5. Branch provisioning (`access.createSpot`)
Could let TRACE create a new branch directly in Poster from the admin panel instead of the restaurant owner setting it up manually first. Nice-to-have, low priority — most restaurants already have their POS set up before onboarding to TRACE.

## C. Realtime events spike (do this before promising anything here)
TRACEPLUGIN (`/Users/plagueson/Projects/TRACEPLUGIN`, C#, hooks `Resto.Front.Api` inside iikoFront) gives TRACE realtime order/payment/session events with no Poster equivalent found in the REST catalog. Poster's dev portal mentions webhook support (`dev.joinposter.com`) but this was never actually inspected — only referenced. Before claiming any realtime parity:
1. Register a webhook against a real test account, trigger a few order lifecycle events, capture actual payloads.
2. Compare latency and granularity against what `EventBuilder.cs`/`RealtimeClient.cs` currently send from TRACEPLUGIN.
3. Decide: webhook is close enough (likely fine for order-completion-triggered features like review requests or receipt notifications), or it's not (if TRACE needs in-progress order state, e.g. "table 4 just got their food," webhooks won't deliver that — only a terminal-level hook would, and Poster doesn't publish one).
4. Write findings back into `docs/poster-integration.md` §8, don't just build against assumptions.

## Definition of done
Each item above is independently shippable — don't block one on another. Suggested order: A1 → A2 → B1 → B3 → C (spike, informs whether B4 is even worth scoping) → A3 → B2 (bigger, its own mini-project) → B5 (lowest priority).
