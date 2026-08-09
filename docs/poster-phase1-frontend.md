# Poster Phase 1 — Frontend + Data Model

Prereq reading: `docs/poster-integration.md` (full research, endpoint catalog, gap analysis).
Repo: TRACE (this one). No Poster credentials needed — pure type/form plumbing, testable without a live account.
Estimated shape: one focused session.

## Goal
Add a `pos_type` selector (`'iiko' | 'poster'`) to every tenant create/edit form. Selecting `poster` swaps the credential fields from iiko's four (`iiko_login`, `iiko_password`, `iiko_server`, `iiko_cloud_api`) to Poster's two (`poster_account_name`, `poster_access_token`). Backend contract only — do not build any Poster-calling logic here, that's Phase 2.

## Exact places to change (verified paths/lines, re-check line numbers before editing since the file may have shifted)

### 1. `services/traceApi.ts:1774-1800` — `Tenant` interface
Add:
```ts
pos_type: 'iiko' | 'poster';
poster_account_name: string | null;
poster_access_token: string | null;
```
Keep all existing `iiko_*` fields as-is — both credential sets live on the same row, only one set is active per `pos_type`, same pattern iiko already uses alongside `onec_*` fields.

### 2. `components/views/Admin.tsx` — three form instances, all need the same treatment
- **Line ~490** — edit-tenant form state (`const [form, setForm] = useState<{...}>`). Add `pos_type: 'iiko' | 'poster'`, `poster_account_name: string`, `poster_access_token: string` to the type and initial state.
- **Line ~585** — form hydration from an existing tenant (`setForm({ name: tenant.name, iiko_login: ... })`). Add `pos_type: tenant.pos_type ?? 'iiko'`, `poster_account_name: tenant.poster_account_name ?? ''`, `poster_access_token: tenant.poster_access_token ?? ''`.
- **Line ~642-649** — payload build before PATCH/PUT. Add `pos_type: form.pos_type`, `poster_account_name: form.pos_type === 'poster' ? (form.poster_account_name || null) : null`, `poster_access_token: form.pos_type === 'poster' ? (form.poster_access_token || null) : null`. Null out the iiko fields the same way when `pos_type !== 'iiko'` — mirror whatever null-out convention the existing code already uses for unused optional fields (check `onec_*` handling nearby for the pattern to copy).
- **Line ~895-905** — JSX for iiko credential fields (`ServerField`, `Field label="Login"`, `PasswordField`, `Field label="Cloud API Key"`). Wrap in `{form.pos_type === 'iiko' && (...)}`, add a sibling `{form.pos_type === 'poster' && (...)}` block with two fields: `Field label="Account Name" value={form.poster_account_name} onChange={...}` and `PasswordField label="Access Token" value={form.poster_access_token} onChange={...}`. Add the `pos_type` selector itself above both blocks — a simple two-option toggle/select, styled consistently with the existing `plan` selector (`'base' | 'pro'`) nearby in the same form.
- **Line ~1059-1062** — read-only detail view (`ReadRow label="iiko Server"` etc). Same conditional split: show iiko rows when `tenant.pos_type === 'iiko'`, poster rows (`Account Name`, masked `Access Token` via existing `mask()` helper) when `'poster'`.

- **Lines ~1509-1530 and ~1622-1643** — these are two more create-tenant form instances (likely "create org + tenant" vs "create branch under existing org" flows — confirm which is which by reading surrounding function names before editing, don't assume). Both need the identical treatment: form state + `pos_type` field, hydration if applicable, payload build, JSX fields. Do not skip either — they're separate code paths, not shared components, based on the duplicated field lists found.

### 3. Backend field expectations (do NOT implement backend logic, just confirm contract)
The PATCH/POST payload TRACE sends must include `pos_type`, and `poster_account_name`/`poster_access_token` when applicable. TRACEBACKEND's tenant create/update route currently doesn't know these fields exist — Phase 2 adds them there. Frontend Phase 1 can ship independently; extra fields sent to a backend that ignores them are harmless (confirm the backend does a passthrough/whitelist insert — if it's a strict schema-validated insert, Phase 1's payload changes will 400 until Phase 2 backend lands; check `TRACEBACKEND` tenant route validation before assuming Phase 1 is fully independent).

## Definition of done
- All three Admin.tsx form instances have a working `pos_type` toggle that swaps field sets.
- `Tenant` type includes the three new fields.
- Existing iiko tenants render unaffected (`pos_type` defaults to `'iiko'` via `?? 'iiko'` fallback wherever `tenant.pos_type` is read, since existing DB rows won't have the column populated until a migration backfills it).
- No calls to any Poster API anywhere in this repo yet — that's explicitly out of scope.

## Explicitly out of scope for this phase
- Any `PosterAdapter` / backend logic (Phase 2)
- Any tenant-facing (non-admin) UI changes — `pos_type` only matters in the admin tenant-management flow
- Testing against a real Poster account (no credentials needed for this phase)
