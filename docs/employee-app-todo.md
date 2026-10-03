# Employee app — what's left (notes from 2026-10-03)

Repos: `TRACEMOBILE-EMPLOYEE` (Expo app), `TRACEBACKEND`, `TRACE` (web). All work is on branch `feature/employee-app`.

## Status

- Mobile code is wired: all ~60 API calls in the app match routes that exist in the backend.
- Mobile WIP is committed locally (`4156f18`). It hasn't been pushed.
- Mobile `tsc` passes.

## Blockers before employees can install it

### 1. Release build has no server address
`TRACEMOBILE-EMPLOYEE/eas.json`: the `preview` and `production` profiles have
`EXPO_PUBLIC_API_URL: "REPLACE_WITH_PRODUCTION_API_URL"`.
Set it to `https://trace-backend-production-cbce.up.railway.app/api`, or a custom domain if we add one.

### 2. Login only works for one restaurant
`src/lib/auth.ts` sends `X-Tenant: EXPO_PUBLIC_LOGIN_TENANT`, which `eas.json` hardcodes to `"benedict"`.
Employees of any other restaurant can't log in. Pick one:
- **(Recommended)** Backend finds the restaurant from the login itself. It then returns `branches[]`, which the app already handles (`data.branches[0]`).
- Or the app shows a "restaurant code" field / picker before login.

### 3. Face check not tested on a real phone
- ML Kit doesn't run on the iOS 26 simulator. Build to a physical iPhone:
  `cd ~/Projects/TRACEMOBILE-EMPLOYEE && npx expo run:ios --device`
- Test flow:
  1. GM adds your face on the web: Employees → employee card → Face photo.
  2. Clock in on the phone: look → blink → turn.
- If the server says "turned the other way" when you turned correctly, the left/right sign in `TRACEBACKEND/src/services/face/check.ts` is flipped. That's a one-line fix.
- Tune `CENTER_MAX_ANGLE`, `TURN_MIN_YAW` and `TURN_MIN_PITCH` in `src/ui/FaceCheck.tsx` if steps feel too strict or too loose.

### 4. Backend branch must be merged into `main`
`TRACEBACKEND` `feature/employee-app` conflicts with `main` in 8 files:
- `public/assets/*`, `public/index.html`: rebuild with `build.sh` instead of merging by hand
- `src/db/schema.sql`
- `src/middleware/tenant.ts`
- `src/routes/admin.ts`
- `src/server.ts`
- `src/types/tenant.ts`
- `src/ws/handler.ts`

Railway deploys `main` only, so nothing from the employee app is live until this is done.

### 5. Deploy checklist (after merge)
- Watch the Railway deploy log: `onnxruntime-node` must install on Linux (face engine).
- RAM: the face engine adds ~200–300 MB on first use. Optional: unload it after 10 min idle.
- Supabase must allow creating the private `trace-faces` bucket (it's created on first face upload).
- Eskiz SMS: register the invite/temp-password templates. Set `ESKIZ_EMAIL` / `ESKIZ_PASSWORD` on Railway.
- App Store / Play Store: build with `eas build --profile production`, then `eas submit`.

## Security: check soon (not the app, the dashboard API)

`TRACEBACKEND/src/middleware/tenant.ts`: `tenantMiddleware` finds the restaurant from the subdomain / `X-Tenant` header but **does not check any login**.
Dashboard routes such as `/operations` (`server.ts`: `app.use('/operations', tenantMiddleware, operationsRoutes)`) have no auth middleware of their own.
Likely result: anyone who knows a restaurant's subdomain can read its live dashboard data without a password.

**Not yet confirmed against prod.** Test with:
```
curl -H "X-Tenant: <subdomain>" https://trace-backend-production-cbce.up.railway.app/api/operations/stop-list
```
If it returns data, add token checks (owner / manager / employee JWT) to all tenant data routes. Fix this before onboarding new restaurants.

## Later (not started)
- Face check on shift **close** (only on open today).
- % of sales pay for **Poster** restaurants (only iiko is synced).
- Absence deduction for monthly-salary employees (missed whole days).
- AI guest-roleplay trainer (Sun Group Asia idea). Planned for November.
- Per-waiter average-check baseline: start recording now so the "+X% check" pitch has proof.

## Also done today: Railway cost cuts (live on `main`)
- gzip + 1-year caching of the frontend bundle; Chrome for PDFs closes after 2 min idle.
- Backend talks to Postgres over Railway's internal network (no egress fees).
- Index `(tenant_id, type, created_at)` on `realtime_events`.
- `kitchen_order_changed`, `order_updated` and `order_bill_printed` are kept 14 days, everything else 90. The nightly prune can no longer skip a day.
- Expected bill: ~$19.45 → ~$9–10/month. Check the Railway graph after a few days.
- Only backup is Railway's own snapshots. Confirm Postgres → Backups is set to daily.
