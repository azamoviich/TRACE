# R-Keeper POS Integration — Research & Plan

Status: research complete, implementation not started.
Goal: same as `docs/poster-integration.md` — evaluate R-Keeper (UCS/Restera) as a third selectable `pos_type` alongside `iiko` and `poster`.

Read `docs/poster-integration.md` §0 first — it documents what iiko integration actually does in TRACEBACKEND (4 surfaces: OLAP-tuned iikoServer REST, iikoCloud, iikoLoyalty, TRACEPLUGIN realtime terminal plugin). This doc holds R-Keeper to that same bar, not to a generic feature list.

## 0. Vendor note — docs are mid-rebrand, sourcing is shakier than Poster's

`docs.rkeeper.com` 301-redirects to `docs.restera.com`. `apidocs.ucs.ru` (the URL cited by third-party SDKs as "official docs") 302-redirects to `docs.rkeeper.ru`. UCS (the original vendor) appears to be rebranding product lines across at least two live domains simultaneously. This isn't just cosmetic — it means any URL saved today may dead-link by the time Phase 2 implementation starts. **Before implementation, re-resolve every link in this doc's Sources section and confirm it still points somewhere live**, don't trust it stayed put.

## 1. What R-Keeper actually is — three separate products, not one

Unlike Poster (single cloud product, single API), "R-Keeper integration" is ambiguous until you pick which of three things you mean:

**A. R-Keeper 7 (RK7) — the cash-register/terminal system itself**, analogous to iikoServer. On-prem, XML-over-HTTP(S) interface, disabled by default (has to be manually enabled + server restarted before any integration can talk to it).

**B. StoreHouse 5 (SH5) — separate inventory/warehouse product**, its own JSON API, no overlap with RK7's XML interface. Analogous to iiko's storage/write-off surface, but architecturally its own system with its own login, not a module of RK7.

**C. R-Keeper Delivery / web-delivery + CRM — separate cloud product** (`dlv.ucs.ru`) for online ordering and delivery, with its own REST API and its own auth (dealer-issued SID key). Analogous to nothing in TRACE's current iiko footprint — iiko doesn't have a delivery-specific surface TRACE uses today.

This is structurally like iiko's 3-REST-surface split (iikoServer / iikoCloud / iikoLoyalty), except worse: these are three separately-sold products from the vendor's side, not three APIs on one account. A restaurant could have RK7 without StoreHouse, or vice versa — TRACE can't assume all three credential sets exist for a given R-Keeper tenant the way it can assume a Poster tenant has one token that covers everything.

## 2. Access model (per surface — separate from §3-6's capability findings)

This section is about **getting to** the API — credentials, licensing, partner status. It does not bear on whether a given feature exists in R-Keeper (§3-6 answer that on capability alone, and come back comparable to iiko). Treat this as a separate onboarding-cost question, not a discount on what the API can do.



**RK7 XML Interface:**
- HTTP Basic Auth using an **employee's own login/password** on the restaurant's RK7 system — not a service account, not an API key. (`Authorization: Basic base64(login:passwordHash)`, per the search summary; needs confirming against `AUTHTTP` doc page directly before implementation — the "usr header with Base64 login+passwordHash+token" detail from an early search result and the "Basic Auth with employee login/password" detail from the fetched page **partially disagree and need reconciling against the primary doc, not assumed**.)
- Endpoint must be explicitly enabled on the RK7 server + server restarted — this is an on-site IT action the restaurant has to take before TRACE can connect, same category of friction as iiko's on-prem `iiko_server` setup, arguably worse since it's off by default.
- **Licensing gate**: UCS sells API access as a licensed feature ("RKeeper 7 Write XML Order" — lifetime or subscription license, subscription tier requires request signing). This is a real cost/paperwork barrier that neither iiko nor Poster's core reporting API has — needs a straight answer from UCS/Restera sales before assuming any restaurant's RK7 can be integrated for free.

**StoreHouse 5 API:**
- `UserName` + `Password` (StoreHouse Pro user), sent as JSON body fields, not a header — separate credential pair from RK7's.

**Delivery/CRM API (`dlv.ucs.ru`):**
- `SID` access key, issued once via dealer login to a UCS partner portal — this implies TRACE (or its integrator) needs a *dealer/partner relationship with UCS*, not just a per-restaurant credential the restaurant owner hands over. Needs confirming — if true, this is a materially different onboarding model than iiko/Poster (both are "restaurant owner pastes their own credentials," R-Keeper delivery API may require UCS to onboard TRACE as a partner first).

**Net: three credential pairs, one of which may require a vendor partnership rather than a customer-supplied token, plus a possible paid license just to unlock the API.** Confirm the licensing and partner-account questions before writing a single line of adapter code — they could make this integration a business/sales conversation before it's an engineering one.

## 3. RK7 XML Interface — command list (confirmed by reading the actual vendor doc pages, not summarized from a nav menu)

Transport: `https://{ip}:{HTTPDataPort}/rk7api/v0/xmlinterface.xml`, XML request/response, UTF-8. Three request wrapper formats exist — `RK7CMD` (legacy, single command per request), `RK7Command` (batch, multiple commands, but response doesn't echo the original request), `RK7Command2` (current recommended form, response includes `<SourceCommand>` so request/response can be correlated in logs — **use this one**).

### 3a. Confirmed CMD list (from "Запросы и функции" vendor page, 16 commands + `GetFunctions`)

| CMD | Scope | Purpose |
|---|---|---|
| `GetSystemInfo` | CS | Server version/system info |
| `GetFunctions` | CS | **Self-describing** — returns the full list of commands this specific RK7 install actually supports (version-dependent, so this is the real source of truth per-restaurant, not a static doc) |
| `GetOrderList` | CS | List orders — `onlyOpened="1"` for open orders only; **no date-range filter or aggregation documented** (confirmed by reading the order-management page directly, not inferred) |
| `GetOrder` | CS | Full single order by GUID or visit+orderident — dishes, modifiers, discounts |
| `CreateOrder` | CS | New order — table required, waiter code/station/guest-count optional, banquet-order fields supported |
| `SaveOrder` | CS | Add/modify dishes, modifiers, discounts, combos on an open order; cannot touch closed orders |
| `PayOrder` | CS | Process payment |
| `PrintBill` | CS | Generate receipt |
| `VoidOrder` | CS | Delete an order — only if contents already cleared, requires station/manager/reason |
| `CloseVisit` | CS | Close a visit by VisitID |
| `GetOrderMenu` | CS | Menu data scoped to an order context |
| `GetWaiterList` | CS | **Employee roster** — resolves the "employees unconfirmed" gap from the first pass; no XML two-endpoint role-reconciliation hack like iiko needs, single call |
| `GetWaiterMessages` / `WaiterMessage` / `DelWaiterMessages` | CS/ST | Staff messaging system |
| `GetRefData` / `SetRefData` | CS,RS / RS | **Generic reference-data read/write** — `RefName` parameter selects which table (see 3b) |
| `LoginOnStation` | CS | Station-level auth |
| `GetItemBlob` | CS | Binary/base64 file retrieval |
| `GetDocByLayout` | CS | Fetch a formatted document by layout template |
| `DeleteReceipt` | CS | Remove a receipt record |

Also documented separately (order-management page): `DeliveryUpdateStatus`, `ChangeSessionCourse`, `TransferDishes` — delivery status, course timing, dish transfer between orders.

**`GetFunctions` matters more than any static list here** — since command availability is version/config-dependent per install, the correct Phase-2 implementation pattern is: call `GetFunctions` against the actual test restaurant's RK7 first, don't hardcode against this table.

### 3b. `GetRefData` — the real breadth of the API (confirmed via vendor's "Структуры данных" reference page, ~150+ table types)

`GetRefData RefName="X"` reads any of R-Keeper's own internal reference tables. The ones that matter for TRACE parity — **all confirmed present in the vendor's own schema documentation, not guessed:**

- `TEmployee`, `TEmployeeGroup`, `TEmployeeGroupDetail` — staff data (redundant with `GetWaiterList` but structured differently, more detail)
- `Trk7Table`, `THallPlan` — **hall/table plan data exists**, resolves the second "unconfirmed" gap from the first pass
- `TCashStation`, `TCashGroup` — cash register/server topology
- `TRK7MenuItem`, `TCategListItem`, `TModifier`, `TModiGroup`, `TDiscount`, `TDiscountType`, `TPrice`, `TPriceType` — full menu/pricing/discount structure
- **`Trk7OlapCube`, `Trk7OlapCubeScheme`, `Trk7OlapReport`, `Trk7OlapReportGroup`** — R-Keeper has its own OLAP cube reporting engine, architecturally the same idea as iikoServer's OLAP reports. This directly overturns the first-pass finding of "no sales-aggregation command" — see §3c.
- Operational (non-reference, transaction-level) tables also documented: `Visits`, `Orders`, `OrderWaiters`, `SessionDishes`, `DishModifiers`, `DishDiscounts`, `DishVoids`, `Payments`, `Shifts`, `GlobalShifts`, `ZReportData`, `DeliveryData`, `ReturnData` — this is a genuinely rich operational data model, comparable in breadth to what iiko's OLAP + cashshift + write-off surfaces cover combined.

### 3c. Sales reporting — walked back from "real gap" to "likely exists, invocation command unconfirmed"

Evidence an OLAP report engine exists: `Trk7OlapCube`/`Trk7OlapReport` schema objects are real, documented vendor table types (not third-party speculation), and a `RunReport` command name surfaced in search results tied to an `OLAPREPORTS` table — consistent with "define a report shape via `Trk7OlapReport`, then execute it and get rows back." **The exact CMD name and parameter shape to actually invoke/pull results from an OLAP report was not confirmed in what's publicly reachable** — the vendor page describing execution methods (`RK7CMD`/`RK7Command`/`RK7Command2`) didn't mention OLAP invocation at all, so this needs either the XSD bundle or a direct test against `GetFunctions` on a real install to nail down. Downgrade from "assume you'll aggregate raw orders client-side" (first pass) to "assume a report engine exists, confirm the exact call before estimating the reporting work."

Third-party open-source client (`antonko/RK7Die`, .NET, "example, not a complete project") only implements `GetSystemInfo`+`GetOrderList` — not a full SDK the way Poster's PHP client is. No ready reference client exists; expect to hand-roll the XML request/response types, ideally against the real XSD bundle from UCS/Restera rather than reverse-engineering from docs alone.

## 4. Realtime events — `httpordernotify`

R-Keeper Delivery has a documented webhook mechanism: **Admin Panel → Communications → External API for Push Notifications** — restaurant configures a template + external URL, RKeeper Delivery POSTs order status changes (cooking / packed / on the way) to that URL.

This is the one area where R-Keeper's public docs are *more explicit* than Poster's (Poster's webhook support was only referenced, never found in detail). But scope-check against TRACEPLUGIN before claiming parity:
- `httpordernotify` looks scoped to **order status transitions** (Delivery product), not general terminal/device/payment events the way TRACEPLUGIN hooks `Resto.Front.Api` inside iikoFront itself.
- Unclear if `httpordernotify` exists for **dine-in/hall orders through RK7 proper**, or only for the separate Delivery product — needs a direct check, the doc trail found so far is Delivery-specific.

**Same rule as the Poster doc: don't promise TRACEPLUGIN parity until a real webhook payload from a real R-Keeper test account is captured and compared.**

## 5. StoreHouse 5 — inventory surface

Procedure-call style API, not a fixed report catalog: `sh5struct` (ask the schema of a named procedure) then `sh5exec` (run it, read/write). Procedures named things like `Divisions`, `GDoc0` (generic document — likely a stock-move or stock-take doc) — the *actual* list of available procedure names wasn't found in what's public; StoreHouse's procedure catalog is likely restaurant/install-specific or requires vendor docs access TRACE doesn't have yet.

This is structurally closest to iiko's OLAP flexibility (arbitrary query shape) rather than Poster's fixed `dash.*`/`storage.*` endpoints — more powerful in theory, more reverse-engineering work in practice since there's no public exhaustive procedure list the way there's a public exhaustive Poster method list.

## 6. Comparison vs iiko (same framework as the Poster doc §4) — updated after deeper research

| iiko surface | R-Keeper equivalent | Gap |
|---|---|---|
| OLAP SALES/TRANSACTIONS reports | `Trk7OlapCube`/`Trk7OlapReport` engine confirmed to exist; exact invocation command unconfirmed | **Downgraded from real gap to unconfirmed invocation** — the reporting engine is real (documented vendor schema types), not a doc gap; only the exact CMD to run a report and pull rows is missing. Needs `GetFunctions` on a real install or the XSD bundle, not assumed unavailable |
| Cash shifts | `Shifts`, `GlobalShifts`, `ZReportData` via `GetRefData`; shift-close behavior documented (general/fiscal/reporting shift types, Z-report on close) | **Confirmed** — richer than first pass found, includes Z-report data access |
| Write-off GL / inventory | StoreHouse 5, separate product+login, procedure-call API (`sh5struct`/`sh5exec`) | Exists but behind a second, separate credential set; procedure catalog (e.g. write-off doc names) still not enumerated publicly |
| Employees/roles | `GetWaiterList` command + `TEmployee`/`TEmployeeGroup` via `GetRefData` | **Confirmed, resolved** — single-call roster, no XML two-endpoint role-reconciliation workaround needed like iiko requires |
| Hall/table sync | `Trk7Table`, `THallPlan` via `GetRefData` | **Confirmed, resolved** — hall-plan data exists as a documented reference table |
| Void/discount events | `DishVoids`, `DishDiscounts`, `VoidOrder` command all documented | **Confirmed** — direct match to iiko's void-tracking, better documented than Poster's equivalent (`dash.getTransactionWriteOffs`, which was a "rough match" in the Poster doc) |
| Loyalty/CRM | Delivery/CRM REST API (`dlv.ucs.ru/api/v1/crm`), separate SID auth, possibly partner-gated | Unchanged — exists, but heaviest onboarding friction of the three vendors, still needs the partner-account question answered |
| TRACEPLUGIN realtime | `httpordernotify`, likely Delivery-product-scoped | **Unchanged open risk**, same as Poster, arguably narrower scope (order-status-only vs full terminal events) |

**Bottom line on capability alone (ignoring §2's access questions entirely): R-Keeper's feature surface is comparably rich to iiko's.** `Trk7OlapCube`, `GetWaiterList`, `Trk7Table`/`THallPlan`, `DishVoids`/`DishDiscounts` cover reporting, staff, hall-sync, and void-tracking at a level matching or exceeding what iiko exposes — this was a research-depth gap in the first pass, not a real capability gap. The two things left unresolved *on capability itself*, not access: (1) the exact command to invoke an OLAP report and pull result rows (the engine's existence is confirmed, the call isn't), (2) whether `httpordernotify` covers RK7 dine-in orders or is Delivery-product-only. Everything else in §2 (partner account, licensing, auth-scheme ambiguity) is an access-cost question that sits on top of this, not a reason to doubt the capability findings above.

## 7. Recommended next step (before any Phase 1/2/3 split like Poster's)

Unlike Poster, do not proceed straight to a phased build-out plan — the open questions here are business/access questions, not just implementation-detail questions:
1. Confirm whether TRACE needs a UCS/Restera partner or dealer account to get RK7 XSD schemas + Delivery/CRM API access at all.
2. Confirm the RK7 API licensing cost ("Write XML Order" license) — lifetime vs subscription, per-restaurant or per-integrator.
3. Get one real test restaurant with RK7 + StoreHouse credentials (a restaurant already on R-Keeper, willing to enable the HTTP interface) — nothing here can be verified without one.
4. Only after 1–3 are answered, mirror `docs/poster-phase1-frontend.md`/`phase2-backend.md`/`phase3-gapfill.md` structure for R-Keeper — add `'rkeeper'` as a third `pos_type` option, extend the adapter interface from Poster's Phase 2 with an `RKeeperAdapter`.

## Open questions (narrowed after deeper research — resolved items removed)
- RK7 auth: Basic Auth (login/password) vs "usr header, Base64 login+passwordHash+token" — two sources still disagree, unresolved. Check the `AUTHTTP` doc page directly (linked from the XML Interface index, not yet fetched) before implementation.
- **Exact command to invoke an `Trk7OlapReport` and retrieve result rows** — the report engine's existence is confirmed, the invocation call is not. Top-priority unknown for estimating Phase 1 parity work.
- Is `httpordernotify` available for dine-in/hall orders via RK7, or Delivery-product only?
- Does StoreHouse 5 require a separate license/subscription from RK7, or is it bundled?
- Whether TRACE needs a UCS/Restera partner/dealer account for API + XSD access, and the licensing cost of the RK7 "Write XML Order" feature — unchanged from first pass, still the biggest non-technical blocker.
- `GetFunctions` should be run against a real test install as the actual source of truth for what that specific restaurant's RK7 version supports — static docs are a starting point, not the final answer, since command availability is version-dependent.

## Sources
- https://docs.restera.com/display/translate/r_keeper+7+XML+Interface (redirected from docs.rkeeper.com)
- https://docs.rkeeper.ru/rk7/latest/ru/xml-interfejs-r_keeper-7-19605640.html (XML Interface index — read directly)
- https://docs.rkeeper.ru/rk7/latest/ru/zaprosy-i-funktsii-70366840.html (Запросы и функции — full 16-command table, read directly)
- https://docs.rkeeper.ru/rk7/7.7.0/ru/rabota-s-zakazami-46466350.html (Работа с заказами — order command details, read directly)
- https://docs.rkeeper.ru/rk7/7.7.0/ru/struktury-dannyh-r-keeper-7-spravochniki-i-operativnaya-informatsiya-105879434.html (data structure reference — ~150+ table types incl. OLAP, read directly)
- https://docs.rkeeper.ru/rk7/latest/ru/obmen-dannymi-46466362.html (data exchange / GetRefData mechanics, read directly)
- https://docs.rkeeper.ru/rk7/latest/ru/sposoby-vypolneniya-komand-9799581.html (RK7CMD/RK7Command/RK7Command2 execution methods, read directly)
- https://docs.rkeeper.ru/sh5/api-19612347.html (StoreHouse 5 API)
- https://docs.rkeeper.ru/rk7/latest/ru/api-19597826.html (RK7 API index)
- https://docs.rkeeper.com/api/webdelivery_api-37429732.html (Delivery/CRM REST API)
- https://github.com/antonko/RK7Die (unofficial .NET client, partial/example only)
- https://github.com/nutnetru/rkeeper7-crm-api (unofficial CRM API wrapper, not inspected in depth)
- https://apidocs.ucs.ru/doku.php/ru:rk7xmlinterface (redirects to docs.rkeeper.ru — original vendor doc URL cited by third-party SDKs)
