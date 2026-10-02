# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TRACE frontend — React 19 + TypeScript + Vite SPA for a multi-tenant restaurant-ops SaaS (Uzbekistan/CIS). Sibling repos: `../TRACEBACKEND` (Express/Postgres API on Railway, owns all POS/iiko/Poster integration, AI, business logic), TRACEPLUGIN (C# iikoFront plugin streaming live events to the backend over WebSocket), TRACE LANDING (marketing site). The frontend never talks to a POS directly.

## Commands

```bash
npm run dev            # Vite dev server on :3000 (host 0.0.0.0)
npm run build          # production build → dist/
npx tsc --noEmit       # typecheck (no lint or test setup exists; tsc has a few pre-existing errors in services/traceApi.ts)
npx tauri build        # desktop app (Windows NSIS / macOS dmg) — see src-tauri/
```

**Deploy:** tenant subdomains (`*.trace-os.uz`) are served by the backend's `public/` folder, not Vercel. After frontend changes, run `../TRACEBACKEND/build.sh` (builds this repo and copies `dist/` into `TRACEBACKEND/public`, preserving `public/downloads`), then commit/push the backend. Railway deploys `main` only.

## Architecture

**Host-based routing, not a router.** `App.tsx` picks which app to render from `window.location.hostname` (helpers in `services/traceApi.ts`):
- `admin.*` or bare `localhost` → admin panel (`components/admin/`)
- `reportmirabad.*` / `reportnukus.*` → `ManagerPortal` (shift reports, hardcoded tenant map in `getManagerTenant`)
- subdomain containing a `manager` segment → `ChecklistManagerPortal`
- `checklist-{role}-{tenant}.*` → `EmployeeChecklistPortal` (the `checklist-` prefix is mandatory because tenant subdomains can contain hyphens)
- apex / `www` / 2-part hosts → `demo` tenant
- anything else → tenant dashboard; first subdomain label is the tenant

Inside the tenant dashboard, navigation is a `currentView: ViewState` switch in `App.tsx` rendering `components/views/*`. Nav items, hideable pages, accent, and nav style live in `components/navConfig.ts` (persisted in localStorage).

To hit a specific tenant locally use `{tenant}.localtest.me:3000` (wildcard DNS → 127.0.0.1; allowed in `vite.config.ts`). Plain `localhost` lands on admin.

**`services/traceApi.ts` is the single API client** (~3.5k lines). All backend calls go through it — `traceApi.*` namespaces plus `checklistApi`, `checklistManagerApi`, etc. Key mechanics:
- `apiFetch` adds `X-Branch-Id` from the active branch (sessionStorage). `ALL_BRANCHES_ID` maps to the `__chain__` sentinel, which must match `CHAIN_BRANCH_SENTINEL` in `TRACEBACKEND/src/middleware/tenant.ts`; the backend swaps in iikoChain credentials so every OLAP endpoint returns chain-combined data.
- **Demo mode:** every method short-circuits to a `demo*()` fixture when `isDemoTenant()` (subdomain `demo`). Any new API method needs a demo branch. `getDemoPos()`/`setDemoPos()` switch demo data between iiko and Poster flavours.
- `isTauriApp()` gates desktop-only behaviour (QR login, bootstrap token, cross-tenant login). Never let it affect the browser site.

**Real-time:** live orders/tables come from the backend WebSocket (`hooks/useRealtimeData.ts`, `VITE_BACKEND_WS_URL`), fed by the iikoFront plugin — not polled.

**Plan/fact feature:** `lib/planEngine.ts` is a mirror of `TRACEBACKEND/src/services/planEngine.ts` — keep the two identical. Spec in `docs/plan-fact-feature.md`. UI in `components/views/Plan.tsx` + `components/views/plan/`; demo data in `services/planDemo.ts`.

**Desktop app (Tauri 2):** `src-tauri/` ships `launcher/index.html` (standalone login/tenant picker, not the React app) as `frontendDist`; the launcher then navigates to the tenant's live subdomain. NSIS hooks in `installer/`. CI (`.github/workflows/tauri-build.yml`) builds on push to `main` touching `launcher/` or `src-tauri/`.

## Conventions

- **i18n:** every user-facing string goes through `tr(lang, ru, en, uz)` or `TRANSLATIONS` in `constants.ts`. All three languages are required.
- **Styling:** Tailwind is loaded from the CDN in `index.html` with an inline `tailwind.config` (theme colors are CSS variables like `--color-primary`, `darkMode: 'class'`). There's no PostCSS/Tailwind build step — new theme tokens go in `index.html`.
- `@/` path alias resolves to the repo root.
- Business dates use Tashkent time — use `utils/tz.ts` helpers, not raw `new Date()` date strings.
- Feature/integration specs live in `docs/` (Poster integration phases, RKeeper, Windows app, plan-fact).
