# TRACE

TRACE is a restaurant operations platform for Uzbekistan/CIS restaurants — a real-time dashboard that turns raw POS data into decisions a General Manager can act on immediately: revenue, staff performance, waste, AI-generated insights, and a full P&L, all pulled live from the restaurant's iiko POS.

This repo is the frontend. TRACE is a multi-tenant SaaS: each restaurant gets its own subdomain (`{restaurant}.trace-os.uz`), and an internal admin panel (`admin.trace-os.uz`) manages every connected tenant.

## Stack

- **React 19 + TypeScript + Vite** — SPA, no server-side rendering
- **Tailwind CSS** — utility-first styling, dark-theme-first design
- **Recharts** — charts and data visualization
- **Deployed on Vercel**, served in production by the backend's `public/` build output

## Architecture

TRACE is one part of a larger system:

- **This repo (frontend)** — the dashboard UI
- **[TRACEBACKEND](../TRACEBACKEND)** — Express/Postgres API, all POS integration and AI logic live here
- **TRACEPLUGIN** — a C# plugin running inside the restaurant's iikoFront POS terminal, streaming live order/table events to the backend over WebSocket
- **TRACE LANDING** — the public marketing site

The frontend never talks to iiko directly — every request goes through the backend, which owns tenant credentials, AI calls, and all business logic. See `services/traceApi.ts` for the single client used across the whole app.

## Project structure

```
App.tsx                 # root component, view routing
components/
  views/                 # one file per page (Dashboard, Operations, Financial, Sales, ...)
  ui/                     # shared UI primitives (Card, DateRangePicker, charts, ...)
  ManagerPortal.tsx        # standalone manager-facing shift report flow
services/
  traceApi.ts              # single API client — every backend call goes through here
hooks/                   # shared React hooks (realtime data, count-up animations, ...)
utils/                   # date/timezone helpers, data transforms
constants.ts             # translations (ru/en/uz), mock/demo data
types.ts                 # shared TypeScript types
```

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Required environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API base URL |
| `VITE_BACKEND_WS_URL` | Backend WebSocket URL, for live plugin data |
| `VITE_TENANT_ID` | Tenant UUID for local dev (skips subdomain-based tenant resolution) |

For production build config, see `.env.production.example`.

## Scripts

```bash
npm run dev       # local dev server
npm run build     # production build (output: dist/)
npm run preview   # preview a production build locally
```

## Key conventions

- **Multi-language**: every user-facing string goes through `tr(lang, ru, en, uz)` or the `TRANSLATIONS` object in `constants.ts` — ru/en/uz are all first-class, not an afterthought.
- **Demo mode**: tenants can run in a fully mocked demo state (`isDemoTenant()` in `traceApi.ts`) — every API method has a demo fallback so the product can be shown without live restaurant data.
- **Real-time data**: live order/table state comes from the backend's WebSocket (`hooks/useRealtimeData.ts`), fed by the iikoFront plugin — not polled from iiko's REST API.
