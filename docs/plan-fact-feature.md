# План и факт — feature plan

Scope: **iiko tenants only, restaurants only.** Poster, coffee shops, and chain-level roll-ups are out of scope for now.

Goal: this is not a form where the owner types a number and gets a percentage back. TRACE **builds the plan itself** from the restaurant's own iiko history. The owner adjusts the levers that make up the plan. Every day the page shows where the month is heading, why it is off, and what it takes to catch up.

---

## 1. Who uses it and where

| Who | Where | What they do |
|---|---|---|
| Owner / GM | New **«План»** page in the web + desktop app | Accepts or edits the monthly plan, tracks progress, sees why it's off |
| Owner / GM | Dashboard widget | One-glance progress card that links to the page |
| Owner / GM | Telegram reports bot (phase 5) | Morning pace message + alert when the forecast drops below plan |
| AI chat (AskAI) | Page context (phase 5) | Answers "почему мы не выполняем план?" from real plan/fact numbers |
| Waiters | Employee app (later, not in this plan) | Personal target derived from the restaurant plan |

Only the owner login (main app) can edit the plan. Managers are view-only (later).

---

## 2. Metrics in the plan (driver tree)

```
Выручка           = Чеки × Средний чек            (primary driver)
Гости, ср. на гостя                               (secondary, shown — GuestNum depends on waiters entering it)
Себестоимость     = Выручка × Фудкост %
ФОТ               = фикс. часть (мес.)
Аренда, коммуналка, прочие расходы (мес.)
Валовая прибыль   = Выручка − Себестоимость − ФОТ
Чистая прибыль    = Валовая − Аренда − Коммуналка − Прочие
Точка безубыточности = Пост. расходы / (1 − Фудкост %)   → per month + per day
```

The owner edits the **drivers** (checks, average check, food cost %, fixed costs). Revenue and profit are derived from them, so the plan always stays internally consistent.

---

## 3. Data sources (all already in TRACEBACKEND)

| Metric | Source | Existing code |
|---|---|---|
| Revenue, checks, guests per day | OLAP SALES by `OpenDate.Typed`: `DishDiscountSumInt` (fallback `DishSumInt`), `UniqOrderId`, `GuestNum` | same pattern as `cron/snapshot.ts:40-70` |
| COGS per day / category | OLAP `ProductCostBase.ProductCost` | `routes/financial.ts` `/pl` |
| Labor | GL + attendance | `fetchLaborCost` (financial.ts:881) |
| Rent / utilities / other opex | GL | `fetchOtherOpex` (financial.ts:980) |
| Hourly curve (for today's live pace) | `hourly_snapshots` table | cron/snapshot.ts |
| Manual break-even | `tenants.break_even_revenue` | settings.ts:277 — plan will auto-fill it |

⚠️ **Revenue field inconsistency to fix:** `/financial/pl` sums `DishSumInt` (before discount), while the snapshot/dashboard use `DishDiscountSumInt` (after discount). The plan uses **after discount** (the money actually taken), same as the dashboard. `/pl` is left as is but noted.

⚠️ **GL costs are posted monthly, not daily** (payroll a few times a month, rent once). Month-to-date fact for fixed costs = **planned fixed costs prorated by elapsed days** until the month closes; after that the real GL totals replace them. The UI labels this "начислено по плану" vs "факт по книге".

---

## 4. Algorithms (pure functions, `services/planEngine.ts`)

**4.1 Auto-suggestion for month M**
- **LY baseline:** daily revenue/checks/guests for the same month last year, aligned **−364 days** (weekday to weekday).
- **Trend baseline:** average per weekday over the last 8 full weeks × the weekday counts in M.
- Default = LY × (1 + growth%), growth default **6%**, editable.
- If LY covers <80% of days (new restaurant / missing data), fall back to trend.
- If LY and trend differ by >15%, show a warning: «Ваш текущий темп на X% выше/ниже прошлого года» and offer the other baseline in one click.
- Food cost % = actual for the last 3 full months (best month shown as a hint).
- Labor, rent, utilities, other = average of the last 3 full months from the GL.
- Stored in `baseline` JSONB so the UI can explain the plan: «Октябрь 2025: 812 млн → +6% = 861 млн».

**4.2 Daily split**
- Weekday weights = each weekday's share of weekly revenue over the last 8 weeks.
- Monthly target × normalised day weights → `plan_days`.
- Uzbek holidays constant (fixed dates + Hayit dates per year) flags days; owner can override any day (banquet, closure).

**4.3 Pace**
- Plan MTD = Σ plan_days up to yesterday; fact MTD = Σ fact up to yesterday; today shown separately (live, % vs today's plan scaled by the hourly curve).
- % выполнения = fact MTD / plan MTD (never vs the full month).
- **Forecast** = fact MTD + Σ remaining plan_days × recent ratio (fact/plan over the last 7 days, clamped 0.5–1.5).
- **Needed per day** = remaining gap distributed by remaining day weights (so it says "пятница: 48 млн, понедельник: 22 млн", not one flat number).
- Break-even day = first date where cumulative contribution ≥ fixed costs.

**4.4 Variance ("почему", in sums)**
- Revenue Δ = checks effect (Δчеки × план ср.чек) + check effect (факт чеки × Δср.чек).
- Profit Δ = volume effect (Δвыручка × план. маржа) + food cost effect (−Δфудкост% × факт выручка) + labor Δ + opex Δ.
- Output is a waterfall: «План 150 млн → чеки −7 → ср. чек −2 → фудкост −3 → Факт 138 млн».

---

## 5. Database (TRACEBACKEND/src/db/schema.sql)

Additive only: `CREATE TABLE IF NOT EXISTS`, never a `DROP` (schema.sql replays in full on every migrate).

```sql
plans (
  id UUID PK, tenant_id UUID FK, month DATE,           -- first day of month
  status VARCHAR(10) CHECK (status IN ('draft','active')),
  method VARCHAR(10) CHECK (method IN ('ly','trend','manual')),
  growth_pct NUMERIC(5,2),
  revenue BIGINT, checks INT, avg_check BIGINT, guests INT,
  food_cost_pct NUMERIC(5,2),
  labor BIGINT, rent BIGINT, utilities BIGINT, other_opex BIGINT,
  baseline JSONB,                                        -- numbers the suggestion came from
  updated_by VARCHAR(255), created_at, updated_at,
  UNIQUE (tenant_id, month)
)
plan_days (
  plan_id UUID FK ON DELETE CASCADE, date DATE,
  revenue BIGINT, checks INT, weight NUMERIC(6,4),
  is_override BOOLEAN DEFAULT false, note VARCHAR(100),
  PRIMARY KEY (plan_id, date)
)
plan_fact_daily (                                        -- fact cache, avoids re-hitting OLAP
  tenant_id UUID FK, date DATE,
  revenue BIGINT, checks INT, guests INT, cogs BIGINT,
  fetched_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, date)
)
```

`plan_fact_daily` is backfilled for 13 months on first use (one OLAP call grouped by day) and topped up nightly by the existing 18:45 UTC cron in `cron/snapshot.ts`. Today is always fetched live.

---

## 6. Backend (TRACEBACKEND)

- `src/services/planEngine.ts`: pure math from §4, no I/O, unit-testable.
- `src/services/planData.ts`: fact fetch + cache (`plan_fact_daily`), GL cost baselines. Needs `fetchLaborCost` / `fetchOtherOpex` / `fetchProratedGLTotals` **exported** from `routes/financial.ts`.
- `src/routes/plan.ts`, mounted in `server.ts` as `/plan` + `/api/plan` with `tenantMiddleware`.
- Guard: `pos_type !== 'iiko'` or missing creds → `{ supported: false }`.

| Endpoint | Returns |
|---|---|
| `GET /plan/suggest?month=YYYY-MM` | auto-plan + both baselines + explanations |
| `GET /plan?month=` | saved plan + days (or null) |
| `PUT /plan` | save draft / activate; body = drivers + day overrides; rebuilds `plan_days` |
| `GET /plan/progress?month=` | per metric: plan, plan MTD, fact MTD, %, forecast, needed/day, status; today live; break-even day; daily series for the chart |
| `GET /plan/variance?month=` | waterfall items for revenue + profit |
| `GET /plan/drilldown?month=&driver=food_cost\|avg_check\|checks` | phase 4 — root cause lists |
| `GET /plan/history?months=12` | phase 5 — plan vs fact per past month |

---

## 7. Frontend (TRACE)

- `components/views/Plan.tsx`: new view. `ViewState` gets `'plan'`; wired in `App.tsx` switch + valid list; `navConfig.ts` entry (icon `Target`) placed after `financial`; hidden for Poster tenants.
- `services/traceApi.ts`: `plan` namespace + demo data when `isDemoTenant()`.
- `constants.ts` TRANSLATIONS: ru / en / uz keys.
- Global rule: inputs `font-size: max(16px, 1em)` (Safari zoom), already global.

**Page layout**
1. Header: month switcher, status badge (черновик / активен), «Изменить план».
2. Hero: revenue + net profit progress rings, forecast, status colour (green ≥100%, amber 95–100%, red <95%).
3. KPI grid: Выручка, Чеки, Средний чек, Гости, Фудкост %, ФОТ, Чистая прибыль. Each shows plan / fact / % / forecast.
4. Chart: cumulative plan vs fact line, daily bars, break-even line.
5. «Почему отклонение» waterfall (profit + revenue).
6. «Сегодня нужно»: today's target, live progress, remaining-days table.
7. Empty state (no plan yet): the suggestion card «Мы подготовили план на октябрь» → «Принять» / «Настроить».

**Plan editor** (drawer, 3 steps)
1. Base: LY vs trend cards, growth % slider, explanation text.
2. Drivers: checks, avg check, food cost %, labor, rent, utilities, other. Live-recalculated P&L + break-even on the right (this doubles as the what-if simulator).
3. Calendar: daily targets, holiday flags, per-day override.

**Dashboard widget** (phase 4): small card showing revenue % + forecast; clicking it opens the Plan page.

---

## 8. Phases

| # | Deliverable | Done when |
|---|---|---|
| 1 | Schema + `planEngine` + `planData` (fact cache, GL baselines) + `GET /suggest`, `GET/PUT /plan` | suggestion for benedict matches iiko numbers by hand check |
| 2 | `GET /progress`, `GET /variance`, nightly fact top-up | numbers verified against iiko OLAP for current month |
| 3 | Frontend page: empty state, editor (3 steps), progress dashboard, demo data, i18n | usable end-to-end on benedict; `TRACEBACKEND/build.sh` + deploy |
| 4 | Drill-down (food cost → categories/dishes/writeoffs; avg check → waiters/categories; checks → weekdays/hours) + dashboard widget | each red KPI click-throughs to a cause |
| 5 | Telegram morning pace (09:00 Tashkent) + forecast alert + AskAI context + 12-month history | messages arrive in the reports chat |

Each phase gets committed and pushed separately.

---

## 9. Decisions (2026-09-30)

1. **Venue type**: new `tenants.venue_type` ('restaurant' | 'fastfood' | 'coffeeshop', NULL = not set), set by staff in the admin drawer. The feature shows only when `venue_type = 'restaurant'` AND `pos_type = 'iiko'` with credentials.
2. **Average check = per whole check** (revenue / checks). Guests shown alongside, not a driver.
3. **Growth default 6%**, editable.
4. **Everything is editable.** An owner with their own plan types it in (method `manual`): revenue, checks, avg check, guests, food cost %, labor, rent, utilities, other opex, and any individual day. The editor recalculates P&L, break-even and the daily split live on the client as they type; progress vs fact updates in real time on the page (today = live iiko).

## 10. Progress

- [x] Phase 1 backend: schema, `planEngine.ts`, `planData.ts`, `routes/plan.ts` (`/meta`, `/suggest`, `GET/PUT/DELETE /plan`), admin venue type
- [x] Phase 2 backend: `/progress`, `/variance`, nightly fact top-up (`cron/planFacts.ts`, 22:30 UTC), live today pace from `hourly_snapshots`
- [x] Phase 3 frontend page: `components/views/Plan.tsx` + `plan/` (editor, progress, format, warnings), `lib/planEngine.ts` mirror, demo via `services/planDemo.ts`
- [x] Phase 4 drill-down (`GET /plan/drilldown`, `services/planDrilldown.ts`, `plan/DrilldownDrawer.tsx`) + dashboard widget (`plan/PlanWidget.tsx`)
- [x] Phase 5: morning Telegram pace message (`cron/planMorning.ts`, 09:00 Tashkent, `services/planMessage.ts`, toggle `/plan/settings`), AI context (page), 12-month history (`/plan/history`, `plan/PlanHistory.tsx`)
