import { Language } from '../types';
import { tashkentDateStr as tzDateStr } from '../utils/tz';

const BASE = import.meta.env.VITE_API_URL || '/api';

export const LIVE_MODE = window.location.hostname !== 'localhost';

// ── Branch switcher: re-points all tenant-scoped requests at a sibling branch
// in the same organization via the X-Branch-Id header (see tenantMiddleware).
const ACTIVE_BRANCH_KEY = 'trace_active_branch_id';

export function getActiveBranchId(): string | null {
  return sessionStorage.getItem(ACTIVE_BRANCH_KEY);
}

export function setActiveBranch(id: string | null): void {
  if (id) sessionStorage.setItem(ACTIVE_BRANCH_KEY, id);
  else sessionStorage.removeItem(ACTIVE_BRANCH_KEY);
}

// Sentinel for "All branches" in the UI/sessionStorage — gated to only
// appear when the org has an iikoChain server configured (see
// traceApi.org.info), since that's what makes a combined view coherent.
export const ALL_BRANCHES_ID = '__all__';

// Sent as X-Branch-Id when ALL_BRANCHES_ID is active — must match
// CHAIN_BRANCH_SENTINEL in TRACEBACKEND's middleware/tenant.ts exactly.
// tenantMiddleware recognizes this value and splices the org's iikoChain
// credentials onto the session tenant's iiko_server/login/password, so
// every existing OLAP-backed call (Dashboard/Sales/Financial/etc.)
// transparently returns chain-combined data with no per-page changes.
// tenant.id itself is left untouched by that override, so anything scoped
// by tenant.id (realtime_events — active orders, hall map) still resolves
// to the real session tenant, not the chain — Operations.tsx's own
// explicit per-branch fan-out is what combines that data instead.
const CHAIN_BRANCH_HEADER_VALUE = '__chain__';

export function branchHeaders(branchIdOverride?: string): Record<string, string> {
  const id = branchIdOverride ?? getActiveBranchId();
  if (!id) return {};
  if (id === ALL_BRANCHES_ID) return { 'X-Branch-Id': CHAIN_BRANCH_HEADER_VALUE };
  return { 'X-Branch-Id': id };
}

// Tenant-scoped fetch — adds the active branch override header when set.
// Pass branchIdOverride to force a specific sibling branch regardless of the
// globally active one — used to fan out a request to every branch in an
// organization (e.g. combined active-orders) without touching global state.
function apiFetch(path: string, init: RequestInit = {}, branchIdOverride?: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...branchHeaders(branchIdOverride), ...(init.headers ?? {}) },
  });
}

async function authedGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function patch<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function del(path: string, token: string): Promise<void> {
  await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Demo tenant: fixed AI responses (no backend/LLM calls) ───────────────────
// The "demo" subdomain (apex domain, localhost, preview URLs — see getSubdomain)
// shows prospective customers the full feature set without depending on a wired
// backend tenant or burning AI API quota. Every traceApi.ai.* method below
// short-circuits to one of these canned payloads when isDemoTenant() is true.

export function isDemoTenant(): boolean {
  return getSubdomain() === 'demo';
}

// Which POS the demo pretends to run on — chosen once via the demo POS picker,
// persisted so reloads stay on the same choice. Defaults to iiko.
export function getDemoPos(): 'iiko' | 'poster' {
  return localStorage.getItem('trace_demo_pos') === 'poster' ? 'poster' : 'iiko';
}

export function setDemoPos(pos: 'iiko' | 'poster'): void {
  localStorage.setItem('trace_demo_pos', pos);
}

function demoBriefing(lang: Language): AIDailyBriefing {
  const ru = lang === 'ru';
  return {
    fromAI: true,
    summary: ru
      ? 'Выручка к этому часу — 8.4 млн сум, на 12% выше обычного четверга. Рост тянут гриль и напитки.'
      : 'Revenue so far is 8.4M UZS, 12% above a typical Thursday — Grill and Drinks are driving the lift.',
    actions: ru
      ? ['Ribeye Steak закончится к 19:00 — пополните стоп-лист заранее', 'Запустите акцию на Tom Yum: продажи просели на 9% за неделю', 'Переведите официанта с утра на вечер пятницы — там выше нагрузка']
      : ['Ribeye Steak runs out by 7 PM — restock before the rush', 'Promote Tom Yum — sales dipped 9% this week', 'Move a server from morning to the Friday evening shift, where load peaks'],
    staff: ru ? 'Смена закрыта без замечаний, средний чек на 6% выше нормы' : 'Shift closed clean — average check is 6% above baseline',
    forecast: ru ? 'Завтра ожидается +9% к выручке на фоне выходных' : 'Tomorrow is forecast at +9% revenue heading into the weekend',
    risk: ru ? 'Truffle Burger ушёл в стоп-лист — это ~450 тыс сум упущенной выручки в день' : 'Truffle Burger just hit the stop list — about 450K UZS in lost revenue per day',
  };
}

function demoInsight(lang: Language): { text: string | null; fromAI: boolean } {
  const ru = lang === 'ru';
  return {
    fromAI: true,
    text: ru
      ? 'Выручка выросла на 12% к прошлому четвергу — основной вклад внёс Ribeye Steak (+2.1 млн сум) и категория «Гриль» в целом.'
      : 'Revenue is up 12% vs last Thursday, led by Ribeye Steak (+2.1M UZS) and the Grill category overall.',
  };
}

// Demo tenant's /ai/chat is used from three very different call sites
// (per-dish BCG recommendations, whole-menu analysis, and the free-form
// AskAI panel). A single canned disclaimer read as broken/lazy on the
// first two — they already build a fully-specified context string, so we
// can parse it and hand back a genuinely dish/menu-specific answer. Only
// the true free-form chat falls back to the "demo mode" disclaimer.
function demoChat(context: string, lang: Language): { text: string; fromAI: boolean } {
  const ru = lang === 'ru';

  const dishMatch = context.match(ru ? /Блюдо: "([^"]+)"/ : /Dish: "([^"]+)"/);
  const quadrantMatch = context.match(ru ? /Позиция на BCG-матрице: (\S+)/ : /Matrix position: (\S+)/);
  if (dishMatch && quadrantMatch) {
    const dish = dishMatch[1];
    const quadrant = quadrantMatch[1].replace(/[.,]$/, '');
    const byQuadrant: Record<string, [string, string]> = {
      'Звезда':          [`«${dish}» — звезда меню: высокие продажи и высокая маржа.`, '1) Держите цену — здесь есть запас на +5-10%. 2) Выносите в топ меню и на фото первым. 3) Следите за стоп-листом — потеря звезды бьёт по выручке сильнее всего. 4) Тестируйте комбо с менее популярными позициями той же категории.'],
      Star:              [`"${dish}" is a menu star — high sales and high margin.`, '1) Hold the price — there\'s room for +5-10%. 2) Feature it first in the menu and photos. 3) Watch the stop-list closely — losing a star hurts revenue the most. 4) Test combos pairing it with slower movers in the same category.'],
      'Рабочая лошадка': [`«${dish}» — рабочая лошадка: продаётся часто, но маржа ниже средней.`, '1) Пересмотрите себестоимость — ищите более дешёвого поставщика или порцию. 2) Аккуратно поднимите цену на 3-5%, спрос вряд ли просядет. 3) Не убирайте — это стабильный поток гостей. 4) Проверьте, не тянет ли соседняя категория маржу выше.'],
      'Cash cow':        [`"${dish}" is a cash cow — sells often, but margin is below average.`, '1) Review cost price — look for a cheaper supplier or portion size. 2) Nudge the price up 3-5%, demand likely won\'t drop. 3) Don\'t cut it — it\'s a stable traffic driver. 4) Check if a neighboring category could absorb a higher margin instead.'],
      'Вопрос':          [`«${dish}» — «вопрос»: маржинально, но продаётся редко.`, '1) Проверьте позицию в меню — возможно, гости её просто не видят. 2) Добавьте фото и короткое описание. 3) Предложите официантам рекомендовать её лично. 4) Дайте 4-6 недель — если продажи не растут, замените.'],
      Question:          [`"${dish}" is a question mark — profitable, but rarely ordered.`, '1) Check its menu placement — guests may simply not be seeing it. 2) Add a photo and a short description. 3) Have waitstaff recommend it directly. 4) Give it 4-6 weeks — replace it if sales don\'t pick up.'],
      'Аутсайдер':       [`«${dish}» — аутсайдер: низкие продажи и низкая маржа.`, '1) Кандидат на исключение из меню в следующем цикле. 2) Перед этим попробуйте разовую акцию, чтобы понять, дело в цене или в самом блюде. 3) Проверьте себестоимость — иногда аутсайдер убыточен из-за одного дорогого ингредиента. 4) Освободившееся место в меню отдайте растущей позиции той же категории.'],
      Dog:               [`"${dish}" is a dog — low sales and low margin.`, '1) A candidate to drop from the menu next cycle. 2) Before that, try a one-time promo to see if it\'s the price or the dish itself. 3) Check cost price — sometimes a dog is unprofitable because of one expensive ingredient. 4) Give the freed-up menu slot to a rising item in the same category.'],
    };
    const [lead, rest] = byQuadrant[quadrant] ?? (ru
      ? [`«${dish}»: данные по позиции ниже.`, 'В демо-режиме доступна только эта карточка блюда — на реальном тенанте здесь будет развёрнутая рекомендация на основе истории продаж.']
      : [`"${dish}": here's what the data shows.`, 'Demo mode only covers this dish card — on a live tenant this would be a full recommendation built from real sales history.']);
    return { fromAI: true, text: `${lead} ${rest}` };
  }

  const isMenuAnalysis = ru ? context.includes('аналитик меню') : context.includes('menu analyst');
  if (isMenuAnalysis) {
    const catMatch = context.match(ru ? /Выручка по категориям:\n\s*([^:]+):\s*([\d\s]+) UZS/ : /Revenue by category:\n\s*([^:]+):\s*([\d\s]+) UZS/);
    const topCat = catMatch?.[1]?.trim();
    const topCatLine = topCat
      ? (ru ? `Категория «${topCat}» приносит больше всего выручки — держите в ней достаточный ассортимент и не допускайте стоп-листа.`
             : `The "${topCat}" category brings in the most revenue — keep enough range in it and avoid stop-list gaps there.`)
      : '';
    return {
      fromAI: true,
      text: ru
        ? [
            topCatLine,
            'Позиции с классом C по количеству и марже — кандидаты на исключение или пересмотр цены.',
            'Проверьте позиции с высокой выручкой, но низкой маржой (класс A по выручке, C по марже) — это самое дорогое место в меню, где вы недозарабатываете.',
            'Для позиций с низкой скоростью продаж (<0.5/день) — попробуйте переместить их выше в меню или добавить фото перед тем, как убирать.',
            'Сравните маржу похожих позиций внутри одной категории — большой разброс обычно означает, что цена не пересматривалась давно.',
          ].filter(Boolean).join(' ')
        : [
            topCatLine,
            'Items graded C on both quantity and margin are candidates for removal or a price review.',
            'Watch for items with high revenue but low margin (A on revenue, C on margin) — that\'s the most expensive real estate in your menu, underperforming on profit.',
            'For low-velocity items (<0.5/day), try repositioning them in the menu or adding a photo before cutting them.',
            'Compare margins of similar items within the same category — a wide spread usually means pricing hasn\'t been revisited in a while.',
          ].filter(Boolean).join(' '),
    };
  }

  return {
    fromAI: true,
    text: ru
      ? 'Это демо-режим — свободный чат отвечает фиксированными примерами. На реальном тенанте я анализирую ваши продажи, персонал и меню в реальном времени и отвечаю на вопросы по вашим данным.'
      : 'This is demo mode — free-form chat replies are fixed examples. On a live tenant I analyze your sales, staff, and menu in real time and answer questions about your own data.',
  };
}

function demoProfitForecast(lang: Language) {
  const ru = lang === 'ru';
  return {
    fromAI: true,
    nextMonth: ru ? 'Июль' : 'July',
    nextMonthKey: '2026-07',
    forecastRevenue: 168_500_000,
    forecastProfit: 39_400_000,
    reasoning: ru
      ? 'Тренд последних трёх месяцев растущий (+6% м/м), сезонный рост в июле даёт дополнительный буфер к прогнозу.'
      : 'The last three months trend upward (+6% MoM); July seasonality adds extra headroom to the forecast.',
    trend: 'up' as const,
  };
}

function demoHourlyForecast(lang: Language) {
  const ru = lang === 'ru';
  return {
    fromAI: true,
    forecastRevenue: 9_200_000,
    reasoning: ru
      ? 'При текущем темпе и среднем по четвергам за 4 недели день закроется около 9.2 млн сум.'
      : 'At the current pace and the 4-week Thursday average, the day should close around 9.2M UZS.',
    todayRevSoFar: 6_140_000,
    avgSameDow: 8_430_000,
    dayProgressPct: 68,
  };
}

function demoSlowHour(lang: Language) {
  const ru = lang === 'ru';
  return {
    fromAI: true,
    isAlert: true,
    pctBelow: 14,
    currentRevenue: 1_240_000,
    expectedByNow: 1_440_000,
    suggestion: ru
      ? 'Отправьте push-уведомление с обеденной акцией постоянным гостям — обычно поднимает чек на этот час на 15-20%.'
      : 'Send a lunch-deal push notification to regulars — it usually lifts this hour\'s revenue by 15-20%.',
  };
}

function demoStopListImpact(lang: Language) {
  const ru = lang === 'ru';
  return {
    fromAI: true,
    hits: [
      { name: 'Ribeye Steak', rank: 1, dailyAvg: 26, hoursLeft: 4, estimatedLoss: 480_000 },
      { name: 'Truffle Burger', rank: 4, dailyAvg: 18, hoursLeft: 6, estimatedLoss: 310_000 },
    ],
    summary: ru
      ? 'Два топ-блюда в стоп-листе — до конца дня это ~790 тыс сум упущенной выручки.'
      : 'Two top dishes are on the stop list — about 790K UZS in lost revenue by end of day.',
  };
}

function demoGuestReturn(lang: Language) {
  const ru = lang === 'ru';
  return {
    fromAI: true,
    weeklyRetentionPct: 34,
    returnProbability7d: 0.41,
    audienceType: ru ? 'Постоянные гости выходного дня' : 'Weekend regulars',
    insight: ru
      ? 'Каждый третий гость возвращается в течение недели — это выше среднего по сегменту казуальных ресторанов.'
      : 'About one in three guests returns within a week — above average for casual-dining venues.',
    avgGuestsPerDay: 96,
    avgCheck30: 118_000,
    peakDowName: ru ? 'Суббота' : 'Saturday',
  };
}

function demoPriceElasticity(lang: Language) {
  const uz = lang === 'uz';
  const en = lang === 'en';
  return {
    fromAI: true,
    hints: [
      {
        name: 'Caesar Salad', currentPrice: 65_000, suggestedPrice: 72_000,
        reasoning: en ? '18% below category avg price, strong demand'
          : uz ? 'Kategoriya o\'rtachasidan 18% past, talab yuqori'
          : 'На 18% ниже средней цены категории, высокий спрос',
        promo: en ? 'Marathon: sell 25 orders this week — 40,000 UZS bonus'
          : uz ? 'Marafon: bu hafta 25 buyurtma sot — 40 000 UZS bonus'
          : 'Марафон: продай 25 порций за неделю — бонус 40 000 UZS',
      },
      {
        name: 'Mojito', currentPrice: 55_000, suggestedPrice: 60_000,
        reasoning: en ? 'Margin below category average during evening hours'
          : uz ? 'Kechki soatlarda kategoriya o\'rtachasidan past marja'
          : 'Маржа ниже средней по категории в вечерние часы',
        promo: en ? '2 sales per shift — +15,000 UZS to pay'
          : uz ? 'Smenada 2 sotuv — ish haqiga +15 000 UZS'
          : '2 продажи в смену — +15 000 UZS к зарплате',
      },
      {
        name: 'Espresso', currentPrice: 28_000, suggestedPrice: 32_000,
        reasoning: en ? 'High volume, price well below category avg'
          : uz ? 'Yuqori hajm, narx kategoriya o\'rtachasidan past'
          : 'Высокий объём, цена заметно ниже средней по категории',
        promo: en ? 'Sell 40 this week — team lunch on the house'
          : uz ? 'Bu hafta 40 ta sot — jamoa uchun bepul tushlik'
          : 'Продай 40 за неделю — командный обед за счёт заведения',
      },
    ],
  };
}

function demoComboSuggestions(lang: Language) {
  const uz = lang === 'uz';
  const en = lang === 'en';
  return {
    fromAI: true,
    hasPluginData: true,
    combos: [
      {
        items: ['Ribeye Steak', 'Mojito'],
        reason: en ? 'Frequently ordered together on Friday evenings'
          : uz ? 'Juma kechlarida tez-tez birgalikda buyurtma qilinadi'
          : 'Часто заказывают вместе по пятницам вечером',
        mechanic: en ? '10% off when ordered as a pair'
          : uz ? 'Juft buyurtmada 10% chegirma'
          : 'Скидка 10% при заказе пары',
      },
      {
        items: ['Caesar Salad', 'Passion Fruit Lemonade'],
        reason: en ? 'Popular weekday lunch pairing'
          : uz ? 'Ish kunlari tushlik uchun mashhur kombinatsiya'
          : 'Популярная обеденная пара по будням',
        mechanic: en ? 'Fixed-price lunch set'
          : uz ? 'Belgilangan narxli tushlik to\'plami'
          : 'Сет за фиксированную цену',
      },
    ],
  };
}

function demoWasteRootCause(lang: Language) {
  const uz = lang === 'uz'; const en = lang === 'en';
  const t = <R, U, E>(r: R, u: U, e: E) => en ? e : uz ? u : r;
  return {
    fromAI: true,
    patterns: [
      {
        dish: 'Авокадо',
        peakDay: t('Понедельник', 'Dushanba', 'Monday'),
        rootCause: t('Закупка партии превышает спрос в начале недели', 'Partiya xaridi haftaning boshida talabdan oshib ketadi', 'Batch purchasing outpaces early-week demand'),
        advice: t('Снизить объём закупки на 20% по понедельникам', 'Dushanbadagi xarid hajmini 20% ga kamaytiring', 'Cut Monday order volume by 20%'),
      },
      {
        dish: 'Кокосовое молоко',
        peakDay: t('Среда', 'Chorshanba', 'Wednesday'),
        rootCause: t('Срок годности короче цикла поставки', 'Yaroqlilik muddati yetkazib berish siklidan qisqaroq', 'Shelf life shorter than the supply cycle'),
        advice: t('Перейти на меньшую тару у поставщика', 'Yetkazib beruvchidan kichikroq qadoqga o\'ting', 'Switch to smaller-pack supplier units'),
      },
    ],
    summary: t(
      'Основные потери — из-за избыточных закупок скоропортящихся продуктов в начале недели.',
      'Asosiy yo\'qotishlar — haftaning boshida tez buziladigan mahsulotlarni ortiqcha xarid qilishdan.',
      'Most waste comes from over-ordering perishables early in the week.',
    ),
  };
}

function demoStaffNarrative(lang: Language) {
  const uz = lang === 'uz'; const en = lang === 'en';
  return {
    fromAI: true,
    narrative: en
      ? 'Dmitriy and Maria post consistently high average checks and fast table turns — worth using their pattern as a template for onboarding new servers.'
      : uz
      ? 'Dmitriy va Mariya doimiy ravishda yuqori o\'rtacha chek va tez stol almashinuvini ko\'rsatmoqda — yangi ofitsiantlarni o\'qitishda ularning uslubidan foydalanish tavsiya etiladi.'
      : 'Дмитрий и Мария показывают стабильно высокий средний чек и скорость обслуживания — их паттерн стоит использовать как образец при онбординге новых официантов.',
    staff: [
      { name: 'Дмитрий В.', revenue: 4_200_000, orders: 86, avgCheck: 48_800, avgTurnMin: 34 },
      { name: 'Maria S.', revenue: 3_950_000, orders: 79, avgCheck: 50_000, avgTurnMin: 31 },
      { name: 'Alex K.', revenue: 2_870_000, orders: 71, avgCheck: 40_400, avgTurnMin: 42 },
    ],
  };
}

function demoShiftSchedule(lang: Language): { fromAI: boolean; schedule: ShiftScheduleDay[]; summary: string } {
  const uz = lang === 'uz'; const en = lang === 'en';
  const t = <R, U, E>(r: R, u: U, e: E) => en ? e : uz ? u : r;
  const names = { a: t('Дмитрий В.', 'Dmitriy V.', 'Dmitry V.'), b: t('Мария С.', 'Mariya S.', 'Maria S.'), c: t('Алекс К.', 'Aleks K.', 'Alex K.') };
  return {
    fromAI: true,
    schedule: [
      { day: t('Пн 07.10', 'Du 07.10', 'Mon 07.10'), assignments: [{ waiter: names.a, start: '10:00', end: '18:00' }] },
      { day: t('Вт 08.10', 'Se 08.10', 'Tue 08.10'), assignments: [{ waiter: names.b, start: '10:00', end: '18:00' }] },
      { day: t('Пт 11.10', 'Ju 11.10', 'Fri 11.10'), assignments: [{ waiter: names.a, start: '12:00', end: '20:00' }, { waiter: names.b, start: '15:00', end: '23:00' }] },
      { day: t('Сб 12.10', 'Sh 12.10', 'Sat 12.10'), assignments: [{ waiter: names.a, start: '11:00', end: '19:00' }, { waiter: names.b, start: '11:00', end: '19:00' }, { waiter: names.c, start: '15:00', end: '23:30' }] },
    ],
    summary: t(
      'Пятница и суббота требуют усиленного состава — добавлены дополнительные смены на вечер.',
      'Juma va shanba kuni kuchaytirilgan tarkib talab etiladi — kechqurun uchun qo\'shimcha smenalar qo\'shildi.',
      'Friday and Saturday need a stronger lineup — extra evening shifts added.',
    ),
  };
}

function demoReviewReply(rating: number | null, lang: Language) {
  const uz = lang === 'uz'; const en = lang === 'en';
  const positive = (rating ?? 5) >= 4;
  return {
    fromAI: true,
    reply: en
      ? (positive
        ? 'Thank you for the kind words! We\'re glad you enjoyed your visit — looking forward to seeing you again.'
        : 'Thanks for the feedback — sorry it wasn\'t a perfect visit. We\'ve shared this with the team and will do better next time.')
      : uz
      ? (positive
        ? 'Iliq fikringiz uchun rahmat! Tashrif sizga yoqqanidan xursandmiz — yana kutib qolamiz.'
        : 'Fikr-mulohazangiz uchun rahmat — hamma narsa muammosiz o\'tmagani uchun kechirim so\'raymiz. Izohingizni jamoaga yetkazdik, keyingi safar yaxshiroq bo\'lamiz.')
      : (positive
        ? 'Спасибо за тёплый отзыв! Очень рады, что вам понравилось — ждём вас снова.'
        : 'Спасибо за обратную связь — нам жаль, что не всё прошло гладко. Передали ваш комментарий команде, в следующий раз будет лучше.'),
  };
}

function demoReviewTrends(lang: Language) {
  const uz = lang === 'uz'; const en = lang === 'en';
  const t = <R, U, E>(r: R, u: U, e: E) => en ? e : uz ? u : r;
  return {
    fromAI: true,
    trends: [
      { topic: t('Скорость подачи', 'Xizmat tezligi', 'Service speed'), change: '+', pctChange: 8 },
      { topic: t('Качество блюд', 'Taomlar sifati', 'Food quality'), change: '+', pctChange: 5 },
      { topic: t('Уровень шума', 'Shovqin darajasi', 'Noise level'), change: '-', pctChange: 3 },
    ],
    summary: t(
      'Отзывы стабильно положительные, скорость подачи отмечают чаще всего.',
      'Sharhlar barqaror ijobiy, xizmat tezligi ko\'pincha qayd etiladi.',
      'Reviews stay positive overall — service speed comes up most often.',
    ),
    alertLevel: 'low',
    weeklyData: [
      { week: t('Нед. 1', '1-hafta', 'Wk 1'), positive: 58, neutral: 22, negative: 9 },
      { week: t('Нед. 2', '2-hafta', 'Wk 2'), positive: 61, neutral: 20, negative: 8 },
      { week: t('Нед. 3', '3-hafta', 'Wk 3'), positive: 64, neutral: 19, negative: 7 },
      { week: t('Нед. 4', '4-hafta', 'Wk 4'), positive: 66, neutral: 18, negative: 6 },
    ],
  };
}

function demoShiftTrends(lang: Language) {
  const uz = lang === 'uz'; const en = lang === 'en';
  const t = <R, U, E>(r: R, u: U, e: E) => en ? e : uz ? u : r;
  return {
    fromAI: true,
    patterns: [
      {
        topic: t('Опоздания на пересменке', 'Smenalar almashuvida kechikishlar', 'Late shift handovers'),
        detail: t('Чаще всего по пятницам между 17:00 и 18:00', 'Ko\'pincha jumalari 17:00 va 18:00 oralig\'ida', 'Most common Fridays between 5 and 6 PM'),
        severity: 'medium' as const,
      },
      {
        topic: t('Расхождения в кассе', 'Kassa tafovutlari', 'Cash drawer discrepancies'),
        detail: t('Единичные случаи, в пределах нормы', 'Alohida holatlar, me\'yor doirasida', 'Isolated cases, within normal range'),
        severity: 'low' as const,
      },
    ],
    topConcerns: [
      t('Пересменка по пятницам', 'Juma kuni smena almashuvi', 'Friday handovers'),
      t('Загрузка кухни в выходные', 'Dam olish kunlari oshxona yuklanishi', 'Weekend kitchen load'),
    ],
    summary: t(
      'Основная точка внимания — пересменка по пятницам вечером.',
      'Asosiy e\'tibor nuqtasi — juma kechki smena almashuvi.',
      'The main thing to watch is the Friday evening handover.',
    ),
    alertLevel: 'medium',
    stats: {
      total: 240,
      goodPct: 78,
      badPct: 9,
      managers: [
        { name: 'Дмитрий В.', total: 64, bad: 4 },
        { name: 'Maria S.', total: 58, bad: 2 },
      ],
      branches: [
        { name: t('Центр', 'Markaz', 'Downtown'), total: 140, bad: 11 },
        { name: t('Юг', 'Janub', 'South'), total: 100, bad: 9 },
      ],
    },
  };
}

// ── Demo tenant: fixed sales/operations data (no backend/iiko calls) ────────
// Same rationale as the AI fixtures above — the "demo" tenant has no iiko
// connection, so these endpoints would 400/404. Generate a believable,
// internally-consistent fictional dataset instead.

const DEMO_DISHES: { name: string; category: string; price: number; weight: number }[] = [
  { name: 'Плов Узбекский',        category: 'Основные блюда', price: 45000, weight: 1.4 },
  { name: 'Шашлык из баранины',    category: 'Основные блюда', price: 38000, weight: 1.2 },
  { name: 'Лагман',                category: 'Основные блюда', price: 32000, weight: 1.1 },
  { name: 'Манты',                 category: 'Основные блюда', price: 28000, weight: 1.0 },
  { name: 'Самса с мясом',         category: 'Выпечка',        price: 12000, weight: 0.9 },
  { name: 'Салат «Ачичук»',        category: 'Салаты',         price: 18000, weight: 0.7 },
  { name: 'Чай зелёный (чайник)',  category: 'Напитки',        price: 8000,  weight: 1.3 },
  { name: 'Морс ягодный',          category: 'Напитки',        price: 14000, weight: 0.8 },
];

function demoDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return tzDateStr(d);
}

function demoRevenueRows(days: number): RevenueRow[] {
  const rows: RevenueRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = demoDateStr(i);
    const dow = new Date(date).getDay();
    const weekendBoost = (dow === 5 || dow === 6) ? 1.28 : 1;
    // Upward trend: newer days (lower i) get a growth multiplier
    const trend = 1 + (days - 1 - i) * 0.004;
    const wave = 1 + 0.06 * Math.sin(i / 2.1);
    const orders = Math.round(96 * weekendBoost * wave * trend);
    const guests = Math.round(orders * 1.85);
    const avgCheck = Math.round(36000 * weekendBoost * (1 + 0.04 * Math.cos(i / 2.5)) * trend);
    rows.push({ date, revenue: orders * avgCheck, orders, guests });
  }
  return rows;
}

function demoTopDishes(limit: number): DishRow[] {
  return [...DEMO_DISHES]
    .map(d => ({
      name: d.name,
      category: d.category,
      quantity: Math.round(40 * d.weight),
      revenue: Math.round(40 * d.weight) * d.price,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function demoSalesStatus(): IntegrationStatus {
  if (getDemoPos() === 'poster') {
    return { poster: { ok: true, label: 'Demo Poster · подключено' } };
  }
  return {
    iikoServer: { ok: true, label: 'Demo POS · подключено' },
    iikoCloud:  { ok: true, label: 'Demo Cloud · подключено' },
  };
}

function demoHourly(): HourlyRow[] {
  const curve = [2, 3, 6, 12, 22, 16, 9, 7, 11, 19, 24, 14, 6, 3];
  return curve.map((mult, idx) => {
    const hour = 11 + idx;
    return {
      hour,
      h: `${hour}:00`,
      orders: mult,
      revenue: mult * 36000,
    };
  });
}

function demoCategoryPerf(): CategoryPerfRow[] {
  const byCat = new Map<string, { revenue: number; orders: number }>();
  for (const d of DEMO_DISHES) {
    const qty = Math.round(40 * d.weight);
    const cur = byCat.get(d.category) ?? { revenue: 0, orders: 0 };
    cur.revenue += qty * d.price;
    cur.orders += qty;
    byCat.set(d.category, cur);
  }
  const total = [...byCat.values()].reduce((s, c) => s + c.revenue, 0);
  return [...byCat.entries()].map(([name, c]) => ({
    name,
    revenue: c.revenue,
    orders: c.orders,
    avgCheck: Math.round(c.revenue / c.orders),
    pct: Math.round((c.revenue / total) * 1000) / 10,
  })).sort((a, b) => b.revenue - a.revenue);
}

function demoCompare(range: 'today' | '7days' | '30days'): { branches: BranchCompareResult[] } {
  const days = range === 'today' ? 1 : range === '30days' ? 30 : 7;
  const branchDefs = [
    { id: 'demo-branch-1', name: 'Chorsu', subdomain: 'demo', factor: 1 },
    { id: 'demo-branch-2', name: 'Yunusobod', subdomain: 'demo2', factor: 0.8 },
  ];
  return {
    branches: branchDefs.map(({ id, name, subdomain, factor }) => {
      const series = demoRevenueRows(days).map(r => ({
        ...r,
        revenue: Math.round(r.revenue * factor),
        orders: Math.round(r.orders * factor),
        guests: Math.round(r.guests * factor),
      }));
      const revenue = series.reduce((s, r) => s + r.revenue, 0);
      const orders = series.reduce((s, r) => s + r.orders, 0);
      const guests = series.reduce((s, r) => s + r.guests, 0);
      return {
        id, name, subdomain,
        revenue, orders, guests,
        avgCheck: orders > 0 ? Math.round(revenue / orders) : 0,
        series,
        topDishes: demoTopDishes(5).map(d => ({ ...d, revenue: Math.round(d.revenue * factor), quantity: Math.round(d.quantity * factor) })),
        categories: demoCategoryPerf(),
      };
    }),
  };
}

const DEMO_COST_RATIOS: Record<string, number> = {
  'Плов Узбекский': 0.38, 'Шашлык из баранины': 0.42, 'Лагман': 0.35,
  'Манты': 0.33, 'Самса с мясом': 0.28, 'Салат «Ачичук»': 0.25,
  'Чай зелёный (чайник)': 0.15, 'Морс ягодный': 0.22,
};

function demoAbc(): AbcRow[] {
  const sorted = [...DEMO_DISHES].sort((a, b) => b.weight - a.weight);
  const total = sorted.reduce((s, d) => s + 40 * d.weight * d.price, 0);
  let cum = 0;
  return sorted.map((d, i) => {
    const qty = Math.round(40 * d.weight);
    const revenue = qty * d.price;
    cum += revenue;
    const share = Math.round((revenue / total) * 1000) / 10;
    const grade: AbcGrade = cum / total <= 0.7 ? 'A' : cum / total <= 0.9 ? 'B' : 'C';
    const costRatio = DEMO_COST_RATIOS[d.name] ?? 0.35;
    const cost = Math.round(revenue * costRatio);
    const grossProfit = revenue - cost;
    const marginPct = Math.round(((revenue - cost) / revenue) * 1000) / 10;
    const costPerUnit = Math.round(d.price * costRatio);
    const foodCostPct = Math.round(costRatio * 1000) / 10;
    return {
      name: d.name, cat: d.category, revenue, qty,
      avgPrice: d.price, velocity: Math.round(qty / 7 * 10) / 10, share,
      cost, grossProfit, marginPct, costPerUnit, foodCostPct,
      abc: grade, abcRevenue: grade,
      abcQty: i < 3 ? 'A' : i < 6 ? 'B' : 'C',
      abcProfit: marginPct >= 65 ? 'A' : marginPct >= 60 ? 'B' : 'C',
    };
  });
}

// Deterministic per-string PRNG — same dish always renders the same demo
// history/daypart shape instead of reshuffling on every fetch.
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function demoAbcHistory(dishName: string, lang: Language): AbcHistoryItem[] {
  const ru = lang === 'ru';
  const current = demoAbc().find(d => d.name === dishName);
  const grades: AbcGrade[] = ['A', 'B', 'C'];
  const rand = seededRandom(dishName);
  const drift = (grade: AbcGrade): AbcGrade => {
    if (rand() > 0.7) {
      const i = grades.indexOf(grade);
      return grades[Math.max(0, Math.min(2, i + (rand() > 0.5 ? 1 : -1)))];
    }
    return grade;
  };
  const base = {
    abcRevenue: current?.abcRevenue ?? 'B' as AbcGrade,
    abcQty: current?.abcQty ?? 'B' as AbcGrade,
    abcProfit: current?.abcProfit ?? 'B' as AbcGrade,
  };
  const out: AbcHistoryItem[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const label = d.toLocaleDateString(ru ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US', { month: 'long', year: 'numeric' });
    out.push({
      month: d.toISOString().slice(0, 7),
      label,
      found: true,
      abcRevenue: i === 0 ? base.abcRevenue : drift(base.abcRevenue),
      abcQty: i === 0 ? base.abcQty : drift(base.abcQty),
      abcProfit: i === 0 ? base.abcProfit : drift(base.abcProfit),
    });
  }
  return out;
}

function demoAbcDaypart(dishName: string, lang: Language): DaypartData {
  const dowLabels = lang === 'ru' ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    : lang === 'uz' ? ['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const rand = seededRandom(dishName + ':dow');
  // Weekend-leaning curve — reads more like a real restaurant than flat noise.
  const dowWeights = [0.7, 0.65, 0.75, 0.85, 1.1, 1.3, 1.2];
  const byDow = dowLabels.map((label, dow) => ({
    dow,
    label,
    qty: Math.max(1, Math.round((8 + rand() * 6) * dowWeights[dow])),
  }));

  const randH = seededRandom(dishName + ':hour');
  const hours = [11, 12, 13, 14, 18, 19, 20, 21, 22];
  const hourWeights = [0.4, 0.7, 0.6, 0.3, 0.6, 1.0, 1.3, 1.1, 0.7];
  const byHour = hours.map((hour, i) => ({
    hour,
    label: `${hour}:00`,
    qty: Math.max(1, Math.round((3 + randH() * 4) * hourWeights[i])),
  }));

  return { byDow, byHour };
}

function demoReservations(): ReservationRow[] {
  if (getDemoPos() !== 'poster') return [];
  return [
    { id: 'r1', guestName: 'Азиз Каримов', phone: '+998 90 123 45 67', partySize: 4, date: demoDateStr(0) + 'T19:30:00', durationMin: 90, status: 'accepted', comment: 'У окна' },
    { id: 'r2', guestName: 'Мадина Юсупова', phone: '+998 91 234 56 78', partySize: 2, date: demoDateStr(0) + 'T20:00:00', durationMin: 60, status: 'new', comment: null },
    { id: 'r3', guestName: 'Шерзод Ахмедов', phone: '+998 93 345 67 89', partySize: 6, date: demoDateStr(1) + 'T18:00:00', durationMin: 120, status: 'accepted', comment: 'День рождения' },
  ];
}

function demoTableTurns(): TableTurnRow[] {
  return [
    { orderId: 'demo-1', tableNumber: '4',  tableName: 'Зал · Стол 4',  waiter: 'Дмитрий В.', seatedMinutes: 78, avgMinutes: 55, status: 'overdue' },
    { orderId: 'demo-2', tableNumber: '9',  tableName: 'Терраса · Стол 9', waiter: 'Maria S.', seatedMinutes: 41, avgMinutes: 50, status: 'soon' },
    { orderId: 'demo-3', tableNumber: '12', tableName: 'Зал · Стол 12', waiter: 'Дмитрий В.', seatedMinutes: 18, avgMinutes: 50, status: 'normal' },
    { orderId: 'demo-4', tableNumber: '2',  tableName: 'VIP · Стол 2',  waiter: 'Aziz N.',    seatedMinutes: 26, avgMinutes: 60, status: 'normal' },
  ];
}

function demoHalls(): HallPlan[] {
  // Table numbers line up with demoTableTurns/demoRevenueRows so the
  // occupancy + revenue heatmap reads as one consistent fictional venue.
  // Wide landscape layout (4 cols × 2 rows) — mirrors how a real hall plan
  // reads wider than it is tall, so the fitted SVG viewBox scales to a
  // compact strip instead of blowing up to a near-square, oversized block.
  const mainHallTables = [
    { n: 1, x: 30,  y: 30  }, { n: 2, x: 160, y: 30  }, { n: 3, x: 290, y: 30  }, { n: 5, x: 420, y: 30  },
    { n: 4, x: 30,  y: 140 }, { n: 6, x: 160, y: 140 }, { n: 7, x: 290, y: 140 }, { n: 8, x: 420, y: 140 },
  ];
  const terraceTables = [
    { n: 9,  x: 30,  y: 30  }, { n: 10, x: 160, y: 30  }, { n: 11, x: 290, y: 30  },
    { n: 12, x: 30,  y: 140 },
  ];
  const toElements = (tables: { n: number; x: number; y: number }[]): HallElement[] =>
    tables.map(t => ({
      id: `table-${t.n}`,
      type: 'rect_table' as HallElementType,
      x: t.x, y: t.y, w: 90, h: 70,
      label: `Стол ${t.n}`,
      seats: 4,
      iiko_table_number: t.n,
    }));
  return [
    { id: 'demo-hall-1', tenant_id: 'demo', name: 'Зал', display_order: 0, elements: toElements(mainHallTables) },
    { id: 'demo-hall-2', tenant_id: 'demo', name: 'Терраса', display_order: 1, elements: toElements(terraceTables) },
  ];
}

function demoTableRevenue(): { table: number; revenue: number; orders: number }[] {
  return [
    { table: 4,  revenue: 1_240_000, orders: 18 },
    { table: 9,  revenue: 980_000,  orders: 14 },
    { table: 2,  revenue: 860_000,  orders: 12 },
    { table: 6,  revenue: 640_000,  orders: 9  },
    { table: 12, revenue: 520_000,  orders: 8  },
    { table: 1,  revenue: 410_000,  orders: 7  },
    { table: 8,  revenue: 305_000,  orders: 5  },
    { table: 11, revenue: 190_000,  orders: 3  },
  ];
}

function demoStaffProfitability(range: 'today' | '7days' | '30days'): StaffProfitabilityResult {
  const daysInPeriod = range === 'today' ? 1 : range === '7days' ? 7 : 30;
  const staff: { name: string; revenue: number; orders: number; avgCheck: number; salaryCost: number | null; salaryType: 'attendance' | 'fixed' | null }[] = [
    { name: 'Дмитрий В.', revenue: 1_710_000 * daysInPeriod / 7, orders: 38 * daysInPeriod / 7, avgCheck: 45000, salaryCost: 350_000 * daysInPeriod / 7, salaryType: 'attendance' },
    { name: 'Maria S.',   revenue: 1_485_000 * daysInPeriod / 7, orders: 33 * daysInPeriod / 7, avgCheck: 45000, salaryCost: 300_000 * daysInPeriod / 7, salaryType: 'attendance' },
    { name: 'Aziz N.',    revenue: 1_276_000 * daysInPeriod / 7, orders: 29 * daysInPeriod / 7, avgCheck: 44000, salaryCost: 3_500_000 / 30 * daysInPeriod, salaryType: 'fixed' },
    { name: 'Лола К.',    revenue: 1_032_000 * daysInPeriod / 7, orders: 24 * daysInPeriod / 7, avgCheck: 43000, salaryCost: null, salaryType: null },
  ];
  const rows: StaffProfitabilityRow[] = staff.map(s => {
    const revenue = Math.round(s.revenue);
    const orders = Math.round(s.orders);
    const salaryCost = s.salaryCost !== null ? Math.round(s.salaryCost) : null;
    const profit = salaryCost !== null ? revenue - salaryCost : null;
    return {
      name: s.name,
      revenue,
      orders,
      avgCheck: s.avgCheck,
      salaryCost,
      salaryType: s.salaryType,
      profit,
      profitabilityPct: profit !== null && salaryCost ? Math.round((profit / salaryCost) * 100) : null,
      roi: profit !== null && salaryCost ? Math.round((revenue / salaryCost) * 100) / 100 : null,
      hasSalary: salaryCost !== null,
    };
  });
  return { range, daysInPeriod, rows };
}

function demoStaffAbc(range: 'today' | '7days' | '30days'): StaffAbcResult {
  const daysInPeriod = range === 'today' ? 1 : range === '7days' ? 7 : 30;
  const base = [
    { name: 'Дмитрий В.', revenue: 1_710_000, orders: 38 },
    { name: 'Maria S.',   revenue: 1_485_000, orders: 33 },
    { name: 'Aziz N.',    revenue: 1_276_000, orders: 29 },
    { name: 'Лола К.',    revenue: 1_032_000, orders: 24 },
    { name: 'Sardor T.',  revenue: 738_000,   orders: 18 },
  ].map(s => ({ ...s, revenue: Math.round(s.revenue * daysInPeriod / 7), orders: Math.round(s.orders * daysInPeriod / 7) }))
    .sort((a, b) => b.revenue - a.revenue);
  const total = base.reduce((s, r) => s + r.revenue, 0);
  let cum = 0;
  const rows: StaffAbcRow[] = base.map(s => {
    const prevPct = total > 0 ? (cum / total) * 100 : 0;
    cum += s.revenue;
    const cumPct = total > 0 ? (cum / total) * 100 : 0;
    return {
      name: s.name,
      revenue: s.revenue,
      orders: s.orders,
      avgCheck: s.orders > 0 ? Math.round(s.revenue / s.orders) : 0,
      avgPerDay: Math.round(s.revenue / daysInPeriod),
      share: total > 0 ? Math.round((s.revenue / total) * 1000) / 10 : 0,
      cumShare: Math.round(cumPct * 10) / 10,
      abc: prevPct < 70 ? 'A' : prevPct < 90 ? 'B' : 'C',
    };
  });
  return { range, daysInPeriod, rows };
}

function demoVoidTracker(): VoidRow[] {
  const now = Date.now();
  return [
    { waiter: 'Дмитрий В.', voidCount: 4, firstVoidAt: new Date(now - 3 * 3600_000).toISOString() },
    { waiter: 'Aziz N.',    voidCount: 2, firstVoidAt: new Date(now - 5 * 3600_000).toISOString() },
  ];
}

function demoDelivery(): DeliveryRow[] {
  const now = Date.now();
  return [
    { id: 'demo-dlv-1', number: 5021, status: 'Cooking',   sum: 186000, updatedAt: new Date(now - 6 * 60_000).toISOString() },
    { id: 'demo-dlv-2', number: 5019, status: 'OnWay',     sum: 244000, updatedAt: new Date(now - 18 * 60_000).toISOString() },
    { id: 'demo-dlv-3', number: 5016, status: 'Delivered', sum: 132000, updatedAt: new Date(now - 52 * 60_000).toISOString() },
  ];
}

function demoPeakPrep(): PeakSlot[] {
  return [
    { hour: 13, label: '13:00', avgOrders: 22, currentStaff: 3, recommendedStaff: 4, isPeak: true,  understaffed: true  },
    { hour: 14, label: '14:00', avgOrders: 19, currentStaff: 3, recommendedStaff: 3, isPeak: true,  understaffed: false },
    { hour: 19, label: '19:00', avgOrders: 24, currentStaff: 4, recommendedStaff: 5, isPeak: true,  understaffed: true  },
    { hour: 20, label: '20:00', avgOrders: 21, currentStaff: 4, recommendedStaff: 4, isPeak: true,  understaffed: false },
  ];
}

function demoCashShift(): CashShift {
  const open = new Date(); open.setHours(10, 0, 0, 0);
  return {
    cashier: 'Нодира А.',
    sessionId: 'demo-session-1',
    openTime: open.toISOString(),
    status: 'open',
    cash: 1_840_000,
    card: 5_120_000,
    cardBreakdown: [
      { type: 'Uzcard', amount: 3_180_000 },
      { type: 'Humo', amount: 1_240_000 },
      { type: 'Visa/Mastercard', amount: 700_000 },
    ],
    revenue: 6_960_000,
    orders: 142,
    payOut: 220_000,
  };
}

function demoKpis(): OpsKpis {
  return { avgServiceMin: 16, avgKitchenMin: 11, wasteSum: 184000, staffActive: 9 };
}

function demoStaffOpsRows(): StaffRow[] {
  const dishes = (a: [string, number, number][]) => a.map(([name, qty, revenue]) => ({ name, qty, revenue }));
  return [
    { name: 'Дмитрий В.', orders: 38, revenue: 1_710_000, guests: 71, dishes: 96, avgCheck: 45000, avgServiceMin: 14, enterTime: '09:02', exitTime: null,    hoursWorked: null, topDishes: dishes([['Плов', 12, 480_000], ['Лагман', 9, 315_000], ['Чай зелёный', 22, 66_000]]) },
    { name: 'Maria S.',   orders: 33, revenue: 1_485_000, guests: 64, dishes: 88, avgCheck: 45000, avgServiceMin: 12, enterTime: '09:15', exitTime: null,    hoursWorked: null, topDishes: dishes([['Шашлык из баранины', 10, 420_000], ['Салат Цезарь', 14, 350_000], ['Компот', 18, 54_000]]) },
    { name: 'Aziz N.',    orders: 29, revenue: 1_276_000, guests: 55, dishes: 74, avgCheck: 44000, avgServiceMin: 18, enterTime: '08:58', exitTime: null,    hoursWorked: null, topDishes: dishes([['Манты', 11, 385_000], ['Борщ', 8, 216_000], ['Морс', 16, 48_000]]) },
    { name: 'Лола К.',    orders: 24, revenue: 1_032_000, guests: 47, dishes: 61, avgCheck: 43000, avgServiceMin: 15, enterTime: '09:30', exitTime: null,    hoursWorked: null, topDishes: dishes([['Стейк рибай', 6, 480_000], ['Тирамису', 9, 225_000], ['Латте', 12, 96_000]]) },
    { name: 'Sardor T.',  orders: 18, revenue: 738_000,   guests: 36, dishes: 47, avgCheck: 41000, avgServiceMin: 21, enterTime: null,    exitTime: null,    hoursWorked: null, topDishes: dishes([['Пицца Маргарита', 7, 315_000], ['Паста Карбонара', 5, 200_000], ['Лимонад', 10, 60_000]]) },
  ];
}

function demoOpsStopList(): StopItem[] {
  const now = Date.now();
  return [
    { id: 'demo-stop-1', name: 'Шашлык из баранины', category: 'Основные блюда', amount: 0, stoppedAt: new Date(now - 95 * 60_000).toISOString() },
    { id: 'demo-stop-2', name: 'Морс ягодный',        category: 'Напитки',        amount: 2, stoppedAt: new Date(now - 40 * 60_000).toISOString() },
  ];
}

function demoOpsAlerts(): OpsAlert[] {
  const now = Date.now();
  return [
    { id: 'demo-alert-1', level: 'info', type: 'peak_hour', title: 'Пиковая нагрузка — 19:00–21:00',
      detail: 'Ожидается +34% заказов. Рекомендуем выставить 5 официантов', since: new Date(now - 5 * 60_000).toISOString() },
  ];
}

export interface DemoActiveOrder {
  id: string;
  tableNum: number;
  waiter: string;
  items: number;
  openTime: string;
  sum: number;
  number: number;
  status: string;
}

export function demoActiveOrders(): DemoActiveOrder[] {
  const now = Date.now();
  return [
    { id: 'demo-ord-1', tableNum: 4,  waiter: 'Aziz N.',    items: 3, openTime: new Date(now - 7 * 60_000).toISOString(),  sum: 168000, number: 1044, status: 'New' },
    { id: 'demo-ord-2', tableNum: 7,  waiter: 'Дмитрий В.', items: 5, openTime: new Date(now - 18 * 60_000).toISOString(), sum: 312000, number: 1042, status: 'New' },
    { id: 'demo-ord-3', tableNum: 9,  waiter: 'Лола К.',    items: 2, openTime: new Date(now - 4 * 60_000).toISOString(),  sum: 96000,  number: 1045, status: 'New' },
    { id: 'demo-ord-4', tableNum: 12, waiter: 'Maria S.',   items: 4, openTime: new Date(now - 24 * 60_000).toISOString(), sum: 244000, number: 1043, status: 'Bill' },
    { id: 'demo-ord-5', tableNum: 16, waiter: 'Sardor T.',  items: 6, openTime: new Date(now - 11 * 60_000).toISOString(), sum: 398000, number: 1046, status: 'New' },
  ];
}

export interface DemoLiveFeedEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, any>;
}

// Fixed "live" feed for the demo dashboard — same shape the WS hook produces,
// so the UI can render it without ever opening a socket.
export function demoLiveOrderFeed(): DemoLiveFeedEvent[] {
  const now = Date.now();
  const waiters = ['Aziz N.', 'Дмитрий В.', 'Лола К.', 'Maria S.', 'Sardor T.'];
  const raw: { minsAgo: number; type: string; table: number; sum?: number }[] = [
    { minsAgo: 2,  type: 'order_opened',       table: 16, sum: undefined },
    { minsAgo: 5,  type: 'order_bill_printed', table: 12, sum: 244000 },
    { minsAgo: 9,  type: 'order_opened',       table: 9,  sum: undefined },
    { minsAgo: 14, type: 'order_closed',       table: 3,  sum: 186000 },
    { minsAgo: 19, type: 'order_opened',       table: 7,  sum: undefined },
    { minsAgo: 26, type: 'order_closed',       table: 11, sum: 312000 },
    { minsAgo: 33, type: 'order_bill_printed', table: 4,  sum: 168000 },
    { minsAgo: 41, type: 'order_closed',       table: 6,  sum: 95000 },
  ];
  return raw.map((r, i) => ({
    id: `demo-feed-${i}`,
    type: r.type,
    timestamp: new Date(now - r.minsAgo * 60_000).toISOString(),
    data: {
      orderId: `demo-feed-order-${i}`,
      table: { number: r.table, name: `Стол ${r.table}` },
      waiter: waiters[i % waiters.length],
      sum: r.sum,
      items: [],
    },
  }));
}

function demoRealtimeEvents(): RealtimeEvent[] {
  const now = Date.now();
  const waiters = ['Дмитрий В.', 'Maria S.', 'Aziz N.'];
  const events: RealtimeEvent[] = [];
  for (let i = 0; i < 12; i++) {
    const opened = i % 2 === 0;
    const orderId = `demo-order-${Math.floor(i / 2)}`;
    events.push({
      id: `demo-evt-${i}`,
      type: opened ? 'order_opened' : 'order_closed',
      payload: {
        type: opened ? 'order_opened' : 'order_closed',
        timestamp: new Date(now - i * 9 * 60_000).toISOString(),
        data: {
          table: { number: 2 + (i % 6), name: `Стол ${2 + (i % 6)}` },
          waiter: waiters[i % waiters.length],
          orderId,
          sum: opened ? undefined : 80000 + (i % 5) * 15000,
        },
      },
      created_at: new Date(now - i * 9 * 60_000).toISOString(),
    });
  }
  return events;
}

function demoWriteoffs(): FinancialWriteoffRow[] {
  return [
    { id: 1, name: 'Зелень микс', category: 'Овощи', qty: 0.4, cost: 14000, date: demoDateStr(1), docNumber: 'СП-0142' },
    { id: 2, name: 'Молоко 3.2%', category: 'Молочные продукты', qty: 1, cost: 14000, date: demoDateStr(2), docNumber: 'СП-0141' },
    { id: 3, name: 'Томаты черри', category: 'Овощи', qty: 0.8, cost: 24000, date: demoDateStr(3), docNumber: 'СП-0140' },
    { id: 4, name: 'Хлеб', category: 'Выпечка', qty: 2, cost: 12000, date: demoDateStr(4), docNumber: 'СП-0139' },
  ];
}

function demoInvoices(): FinancialInvoiceRow[] {
  return [
    { id: 'inv-1', date: demoDateStr(0), supplier: 'Mega Trade Foods', amount: 8_420_000, status: 'paid' },
    { id: 'inv-2', date: demoDateStr(1), supplier: 'FreshLine Distribution', amount: 3_180_000, status: 'paid' },
    { id: 'inv-3', date: demoDateStr(2), supplier: 'Uzbek Meat Group', amount: 5_960_000, status: 'paid' },
    { id: 'inv-4', date: demoDateStr(4), supplier: 'AquaBrand Beverages', amount: 1_240_000, status: 'paid' },
    { id: 'inv-5', date: demoDateStr(6), supplier: 'GreenFarm Vegetables', amount: 2_070_000, status: 'pending' },
  ];
}

function demoInventory(): FinancialInventoryDoc[] {
  return [
    { id: 'inv-doc-1', documentNumber: 'ИНВ-0034', date: demoDateStr(2), status: 'PROCESSED', storeCode: 'Кухня', comment: 'Плановая инвентаризация', itemCount: 86, sum: 24_300_000 },
    { id: 'inv-doc-2', documentNumber: 'ИНВ-0033', date: demoDateStr(9), status: 'PROCESSED', storeCode: 'Бар', comment: 'Плановая инвентаризация', itemCount: 54, sum: 9_120_000 },
    { id: 'inv-doc-3', documentNumber: 'ИНВ-0032', date: demoDateStr(16), status: 'NEW', storeCode: 'Склад', comment: 'Сверка остатков', itemCount: 132, sum: 41_870_000 },
  ];
}

function demoPosterInventory(): PosterInventoryItem[] {
  return [
    { id: 'p1', name: 'Говядина (вырезка)', unit: 'кг', qty: 14.2, unitCost: 180_000, totalValue: 2_556_000 },
    { id: 'p2', name: 'Курица (филе)', unit: 'кг', qty: 22.0, unitCost: 85_000, totalValue: 1_870_000 },
    { id: 'p3', name: 'Лосось охл.', unit: 'кг', qty: 5.4, unitCost: 320_000, totalValue: 1_728_000 },
    { id: 'p4', name: 'Томаты', unit: 'кг', qty: 18.6, unitCost: 14_000, totalValue: 260_400 },
    { id: 'p5', name: 'Сыр Моцарелла', unit: 'кг', qty: 9.1, unitCost: 92_000, totalValue: 837_200 },
    { id: 'p6', name: 'Пиво разливное', unit: 'л', qty: 64.0, unitCost: 18_000, totalValue: 1_152_000 },
    { id: 'p7', name: 'Молоко', unit: 'л', qty: 26.0, unitCost: 9_500, totalValue: 247_000 },
  ];
}

function demoPosterInventoryDocs(): PosterInventoryDoc[] {
  return [
    { id: 'pd1', storageId: 'st1', storageName: 'Кухня', dateStart: demoDateStr(2), dateEnd: demoDateStr(2), sum: 24_300_000, status: 'PROCESSED' },
    { id: 'pd2', storageId: 'st2', storageName: 'Бар', dateStart: demoDateStr(9), dateEnd: demoDateStr(9), sum: 9_120_000, status: 'PROCESSED' },
  ];
}

function demoInventoryItems(docId: string): InventoryItem[] {
  const sets: Record<string, InventoryItem[]> = {
    'inv-doc-1': [
      { productName: 'Говядина (вырезка)', productCode: '00142', category: 'Мясо', unit: 'кг', bookQty: 12.0, actualQty: 12.2, diffQty: 0.2, price: 180_000, sum: 2_196_000 },
      { productName: 'Курица (филе)', productCode: '00143', category: 'Мясо', unit: 'кг', bookQty: 18.0, actualQty: 18.5, diffQty: 0.5, price: 85_000, sum: 1_572_500 },
      { productName: 'Лосось охл.', productCode: '00210', category: 'Рыба', unit: 'кг', bookQty: 6.0, actualQty: 6.0, diffQty: 0, price: 320_000, sum: 1_920_000 },
      { productName: 'Масло сливочное', productCode: '00301', category: 'Молочное', unit: 'кг', bookQty: 4.0, actualQty: 4.3, diffQty: 0.3, price: 48_000, sum: 206_400 },
      { productName: 'Сливки 33%', productCode: '00302', category: 'Молочное', unit: 'л', bookQty: 8.5, actualQty: 8.5, diffQty: 0, price: 32_000, sum: 272_000 },
      { productName: 'Помидоры', productCode: '00401', category: 'Овощи', unit: 'кг', bookQty: 15.0, actualQty: 15.4, diffQty: 0.4, price: 18_000, sum: 277_200 },
      { productName: 'Картофель', productCode: '00402', category: 'Овощи', unit: 'кг', bookQty: 30.0, actualQty: 31.0, diffQty: 1.0, price: 8_000, sum: 248_000 },
      { productName: 'Трюфельное масло', productCode: '00501', category: 'Специи/соусы', unit: 'л', bookQty: 0.5, actualQty: 0.5, diffQty: 0, price: 420_000, sum: 210_000 },
    ],
    'inv-doc-2': [
      { productName: 'Водка премиум', productCode: '00601', category: 'Крепкий алкоголь', unit: 'л', bookQty: 3.0, actualQty: 3.1, diffQty: 0.1, price: 280_000, sum: 868_000 },
      { productName: 'Вино красное сухое', productCode: '00602', category: 'Вино', unit: 'бут', bookQty: 12.0, actualQty: 12.0, diffQty: 0, price: 220_000, sum: 2_640_000 },
      { productName: 'Вино белое сухое', productCode: '00603', category: 'Вино', unit: 'бут', bookQty: 8.0, actualQty: 8.0, diffQty: 0, price: 195_000, sum: 1_560_000 },
      { productName: 'Сок апельсиновый', productCode: '00701', category: 'Безалкогольное', unit: 'л', bookQty: 10.0, actualQty: 10.5, diffQty: 0.5, price: 22_000, sum: 231_000 },
      { productName: 'Тоник Schweppes', productCode: '00702', category: 'Безалкогольное', unit: 'бут', bookQty: 24.0, actualQty: 24.0, diffQty: 0, price: 18_000, sum: 432_000 },
    ],
    'inv-doc-3': [
      { productName: 'Мука пшеничная в/с', productCode: '00801', category: 'Бакалея', unit: 'кг', bookQty: 50.0, actualQty: 50.5, diffQty: 0.5, price: 12_000, sum: 606_000 },
      { productName: 'Сахар', productCode: '00802', category: 'Бакалея', unit: 'кг', bookQty: 25.0, actualQty: 25.0, diffQty: 0, price: 10_000, sum: 250_000 },
      { productName: 'Рис круглозерный', productCode: '00803', category: 'Бакалея', unit: 'кг', bookQty: 40.0, actualQty: 40.5, diffQty: 0.5, price: 14_000, sum: 567_000 },
      { productName: 'Оливковое масло', productCode: '00804', category: 'Масла', unit: 'л', bookQty: 6.0, actualQty: 6.5, diffQty: 0.5, price: 95_000, sum: 617_500 },
      { productName: 'Соевый соус', productCode: '00805', category: 'Соусы', unit: 'л', bookQty: 4.0, actualQty: 4.0, diffQty: 0, price: 45_000, sum: 180_000 },
      { productName: 'Пармезан', productCode: '00901', category: 'Сыры', unit: 'кг', bookQty: 3.0, actualQty: 3.1, diffQty: 0.1, price: 380_000, sum: 1_178_000 },
    ],
    'pd1': [
      { productName: 'Говядина (вырезка)', productCode: '00142', category: 'Мясо', unit: 'кг', bookQty: 14.0, actualQty: 14.2, diffQty: 0.2, price: 180_000, sum: 2_556_000 },
      { productName: 'Курица (филе)', productCode: '00143', category: 'Мясо', unit: 'кг', bookQty: 21.5, actualQty: 22.0, diffQty: 0.5, price: 85_000, sum: 1_870_000 },
      { productName: 'Томаты', productCode: '00401', category: 'Овощи', unit: 'кг', bookQty: 18.0, actualQty: 18.6, diffQty: 0.6, price: 14_000, sum: 260_400 },
    ],
    'pd2': [
      { productName: 'Пиво разливное', productCode: '00601', category: 'Крепкий алкоголь', unit: 'л', bookQty: 64.0, actualQty: 64.0, diffQty: 0, price: 18_000, sum: 1_152_000 },
      { productName: 'Вино красное сухое', productCode: '00602', category: 'Вино', unit: 'бут', bookQty: 12.0, actualQty: 12.0, diffQty: 0, price: 220_000, sum: 2_640_000 },
    ],
  };
  return sets[docId] ?? [];
}

function demoCashShiftDocs(): CashShiftDoc[] {
  return [
    { id: 'cs-1', sessionNumber: 412, openDate: `${demoDateStr(0)}T09:00:00`, closeDate: null, payOrders: 142, salesCash: 1_840_000, salesCard: 5_120_000, salesCredit: 0, payIn: 200000, payOut: 220000, cashDiff: 0, sessionStatus: 'OPEN' },
    { id: 'cs-2', sessionNumber: 411, openDate: `${demoDateStr(1)}T09:00:00`, closeDate: `${demoDateStr(1)}T23:40:00`, payOrders: 168, salesCash: 2_120_000, salesCard: 6_340_000, salesCredit: 0, payIn: 150000, payOut: 180000, cashDiff: 0, sessionStatus: 'CLOSED' },
    { id: 'cs-3', sessionNumber: 410, openDate: `${demoDateStr(2)}T09:00:00`, closeDate: `${demoDateStr(2)}T23:35:00`, payOrders: 151, salesCash: 1_960_000, salesCard: 5_780_000, salesCredit: 0, payIn: 100000, payOut: 140000, cashDiff: 0, sessionStatus: 'CLOSED' },
    { id: 'cs-4', sessionNumber: 409, openDate: `${demoDateStr(3)}T09:00:00`, closeDate: `${demoDateStr(3)}T23:50:00`, payOrders: 159, salesCash: 2_040_000, salesCard: 6_010_000, salesCredit: 0, payIn: 180000, payOut: 200000, cashDiff: 4000, sessionStatus: 'CLOSED' },
  ];
}

function demoPL(): FinancialPL {
  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'];
  return {
    revenue: 412_000_000,
    cogs: 144_200_000,
    grossProfit: 267_800_000,
    foodCostPct: 35,
    laborCost: 98_880_000,
    laborCostPct: 24,
    laborBreakdown: { tariff: 68_000_000, incentive: 20_000_000, bonus: 12_000_000, penalty: 1_120_000 },
    profitPct: 41,
    rent: 24_000_000,
    utilities: 8_500_000,
    otherOpex: 6_200_000,
    netProfit: 229_100_000,
    netProfitPct: 36,
    categories: [
      { name: 'Горячие блюда', revenue: 168_000_000, cogs: 58_800_000, foodCostPct: 35 },
      { name: 'Напитки', revenue: 96_000_000, cogs: 24_000_000, foodCostPct: 25 },
      { name: 'Закуски', revenue: 64_000_000, cogs: 23_040_000, foodCostPct: 36 },
      { name: 'Десерты', revenue: 48_000_000, cogs: 16_800_000, foodCostPct: 35 },
      { name: 'Салаты', revenue: 36_000_000, cogs: 12_960_000, foodCostPct: 36 },
    ],
    monthly: months.map((label, i) => ({ month: `2026-0${i + 1}`, label, revenue: 58_000_000 + i * 6_400_000 })),
  };
}

function demoGLSummary(): GLSummary {
  return {
    laborBreakdown: { tariff: 68_000_000, incentive: 20_000_000, bonus: 12_000_000, penalty: 1_120_000, total: 98_880_000 },
    payables: { invoiced: 42_000_000, paid: 38_500_000, netChange: -3_500_000 },
    taxes: {
      lines: [
        { name: 'НДС (12%)', amount: 12_400_000 },
        { name: 'НДФЛ', amount: 3_100_000 },
        { name: 'Налог ЕСП', amount: 2_800_000 },
      ],
      total: 18_300_000,
    },
    cashPositions: [
      { account: 'Сейф', incoming: 82_000_000, outgoing: 61_000_000, net: 21_000_000 },
      { account: 'Эквайринг, Uzcard', incoming: 54_000_000, outgoing: 40_000_000, net: 14_000_000 },
      { account: 'Р/С банк', incoming: 30_000_000, outgoing: 27_500_000, net: 2_500_000 },
    ],
    income: {
      lines: [
        { name: 'Выручка Кухня', amount: 248_000_000 },
        { name: 'Выручка Бар', amount: 124_000_000 },
        { name: 'Надбавка за обслуживание', amount: 24_000_000 },
        { name: 'Выручка Кондитеры', amount: 16_000_000 },
      ],
      discounts: 4_200_000,
      total: 412_000_000,
    },
  };
}

function demoGLCategories(): PosterGLCategory[] {
  return [
    { name: 'Выручка', level: 0, amount: 388_000_000 },
    { name: 'Кухня', level: 1, amount: 248_000_000 },
    { name: 'Бар', level: 1, amount: 124_000_000 },
    { name: 'Кондитерская', level: 1, amount: 16_000_000 },
    { name: 'Себестоимость', level: 0, amount: -134_600_000 },
    { name: 'Продукты', level: 1, amount: -98_000_000 },
    { name: 'Напитки', level: 1, amount: -36_600_000 },
    { name: 'Зарплата', level: 0, amount: -98_880_000 },
    { name: 'Списания', level: 0, amount: -6_400_000 },
  ];
}

export interface DemoReviewRow {
  id: string;
  platform: string;
  author: string;
  date: string;
  text: string;
  rating: number | null;
  branch: string | null;
  sentiment: 'positive' | 'negative' | 'neutral';
  created_at: string;
}

export function demoReviewRows(): DemoReviewRow[] {
  const platforms = ['Google', 'Yandex Карты', '2GIS', 'TripAdvisor', 'Rahmat'];
  const sentiments: DemoReviewRow['sentiment'][] = ['positive', 'positive', 'neutral', 'negative', 'positive'];
  const samples = [
    { author: 'Aziza R.', rating: 5, text: 'Отличная подача и быстрое обслуживание, шашлык просто огонь!' },
    { author: 'Jasur T.', rating: 4, text: 'Вкусно, но ждали столик дольше обычного. В целом понравилось.' },
    { author: 'Kamola S.', rating: 3, text: 'Средне — основное блюдо понравилось, но десерт был слишком сладкий.' },
    { author: 'Bekzod M.', rating: 2, text: 'Долго не несли счёт, музыка слишком громкая для разговора.' },
    { author: 'Nilufar A.', rating: 5, text: 'Уютная атмосфера, персонал очень внимательный. Вернёмся ещё!' },
    { author: 'Sherzod Q.', rating: 5, text: 'Лучший плов в городе, готовим заказывать с собой каждую неделю.' },
    { author: 'Madina K.', rating: 4, text: 'Хорошее соотношение цены и качества, парковка немного тесная.' },
  ];
  return samples.map((s, i) => ({
    id: `demo-review-${i}`,
    platform: platforms[i % platforms.length],
    author: s.author,
    date: demoDateStr(i),
    text: s.text,
    rating: s.rating,
    branch: null,
    sentiment: sentiments[i % sentiments.length],
    created_at: `${demoDateStr(i)}T18:30:00Z`,
  }));
}

export function demoReviewStats(): { total: number; avg_rating: number | null; this_week: number; positive_pct: number } {
  return { total: 184, avg_rating: 4.4, this_week: 12, positive_pct: 78 };
}

export interface LoyaltySummary {
  totalMembers: number;
  newMembers: number;
  returningMembers: number;
  returningPct: number;
  avgSpent: number;
  trend: { date: string; guests: number; revenue: number }[];
}

export interface LoyaltyGuestRow {
  phone: string;
  name: string | null;
  visitCount: number;
  totalSpent: number;
  firstSeen: string | null; // null for Poster — clients.getClients has no join-date field
  lastSeen: string | null;
}

export interface LoyaltyVisit {
  at: string;
  sum: number;
  items: { name: string; quantity: number; sum: number }[];
}

export function demoLoyaltyHistory(): LoyaltyVisit[] {
  const dishes = ['Плов Узбекский', 'Шашлык из баранины', 'Лагман', 'Самса с мясом', 'Чай зелёный', 'Салат «Ачичук»'];
  return Array.from({ length: 5 }, (_, i) => {
    const n = 1 + Math.round(Math.random() * 2);
    const items = Array.from({ length: n }, () => {
      const name = dishes[Math.floor(Math.random() * dishes.length)];
      const quantity = 1 + Math.round(Math.random() * 1);
      const sum = quantity * (15000 + Math.round(Math.random() * 25000));
      return { name, quantity, sum };
    });
    return { at: `${demoDateStr(i * 9)}T19:30:00Z`, sum: items.reduce((s, it) => s + it.sum, 0), items };
  });
}

export function demoLoyaltySummary(): LoyaltySummary {
  const trend = Array.from({ length: 14 }, (_, i) => {
    const guests = 4 + Math.round(Math.random() * 6);
    return { date: demoDateStr(13 - i), guests, revenue: guests * (35000 + Math.round(Math.random() * 15000)) };
  });
  return { totalMembers: 312, newMembers: 28, returningMembers: 194, returningPct: 62, avgSpent: 412000, trend };
}

export function demoLoyaltyGuests(): LoyaltyGuestRow[] {
  const names = ['Aziza R.', 'Jasur T.', 'Kamola S.', 'Bekzod M.', 'Nilufar A.', 'Sherzod Q.', 'Madina K.', 'Dilshod P.'];
  return names.map((name, i) => ({
    phone: `+99890${(1234567 + i * 111).toString().slice(0, 7)}`,
    name,
    visitCount: 12 - i,
    totalSpent: (12 - i) * (380000 - i * 9000),
    firstSeen: `${demoDateStr(120 - i * 6)}T12:00:00Z`,
    lastSeen: `${demoDateStr(i)}T19:00:00Z`,
  })).sort((a, b) => b.totalSpent - a.totalSpent);
}

export function demoLoyaltyGuestDetail(phone: string) {
  const known = demoLoyaltyGuests().find(g => g.phone === phone);
  const digits = phone.replace(/\D/g, '');
  const seed = digits.split('').reduce((s, d) => s + Number(d), 0);
  const [name, surname] = (known?.name ?? 'Гость Демо').split(' ');
  const tiers = ['Bronze', 'Silver', 'Gold'];
  const tier = tiers[seed % tiers.length];
  return {
    name,
    surname: surname ?? '',
    phone,
    cards: [{ number: `${4000 + (seed % 999)} ${1000 + (seed % 8999)}` }],
    categories: tiers.map(t => ({ name: t, isActive: t === tier })),
    walletBalances: [{ id: 'demo-wallet', name: 'Бонусный счёт', balance: (known?.totalSpent ?? 50000 + seed * 1000) % 200000 }],
    whenRegistered: known?.firstSeen ?? `${demoDateStr(120)}T12:00:00Z`,
    firstOrderDate: known?.firstSeen ?? `${demoDateStr(118)}T12:00:00Z`,
    lastProcessedOrderDate: known?.lastSeen ?? `${demoDateStr(1)}T19:00:00Z`,
  };
}

function demoMenuAnalysis(): MenuAnalysisRow[] {
  const dishes = [
    { name: 'Плов Узбекский',     category: 'Основные блюда', qty: 56, avgPrice: 45000, costRatio: 0.38 },
    { name: 'Шашлык из баранины', category: 'Основные блюда', qty: 48, avgPrice: 38000, costRatio: 0.42 },
    { name: 'Лагман',             category: 'Основные блюда', qty: 44, avgPrice: 32000, costRatio: 0.35 },
    { name: 'Манты',              category: 'Основные блюда', qty: 40, avgPrice: 28000, costRatio: 0.33 },
    { name: 'Самса с мясом',      category: 'Выпечка',        qty: 72, avgPrice: 12000, costRatio: 0.28 },
    { name: 'Салат «Ачичук»',     category: 'Салаты',         qty: 36, avgPrice: 18000, costRatio: 0.25 },
    { name: 'Чай зелёный',        category: 'Напитки',        qty: 104, avgPrice: 8000, costRatio: 0.15 },
    { name: 'Морс ягодный',       category: 'Напитки',        qty: 58,  avgPrice: 14000, costRatio: 0.22 },
  ];
  return dishes.map(d => {
    const revenue     = d.qty * d.avgPrice;
    const cost        = Math.round(revenue * d.costRatio);
    const grossProfit = revenue - cost;
    return {
      name:        d.name,
      category:    d.category,
      qty:         d.qty,
      revenue,
      cost,
      grossProfit,
      marginPct:   Math.round((grossProfit / revenue) * 1000) / 10,
      avgPrice:    d.avgPrice,
      costPerUnit: Math.round(d.avgPrice * d.costRatio),
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export const traceApi = {
  realtimeEvents: (): Promise<RealtimeEvent[]> => Promise.resolve(demoRealtimeEvents()),
  admin: {
    login: (password: string) =>
      post<{ token: string }>('/auth/login', { password }),
    tenants: (token: string) =>
      authedGet<Tenant[]>('/admin/tenants', token),
    create: (token: string, data: Partial<Tenant>) =>
      post<Tenant>('/admin/tenants', data, token),
    update: (token: string, id: string, data: Partial<Tenant>) =>
      patch<Tenant>(`/admin/tenants/${id}`, data, token),
    disable: (token: string, id: string) =>
      patch<Tenant>(`/admin/tenants/${id}`, { enabled: false }, token),
    deleteTenant: (token: string, id: string) =>
      del(`/admin/tenants/${id}`, token),
    branches: (token: string, id: string) =>
      authedGet<BranchSummary[]>(`/admin/tenants/${id}/branches`, token),
    addBranch: (token: string, id: string, data: Partial<Tenant>) =>
      post<Tenant>(`/admin/tenants/${id}/branches`, data, token),
    // The organization this tenant belongs to (name + iikoChain credentials),
    // or null if it isn't part of a multi-branch organization yet.
    organization: (token: string, tenantId: string) =>
      authedGet<Organization | null>(`/admin/tenants/${tenantId}/organization`, token),
    updateOrganization: (token: string, orgId: string, data: Partial<Organization>) =>
      patch<Organization>(`/admin/organizations/${orgId}`, data, token),
    liveStatus: (token: string) =>
      authedGet<Record<string, LiveStatus>>('/admin/live-status', token),
    tenantEvents: (token: string, id: string, limit = 20) =>
      authedGet<RealtimeEvent[]>(`/admin/tenants/${id}/events?limit=${limit}`, token),
    testConnection: (token: string, id: string) =>
      post<Record<string, { ok: boolean; error?: string }>>(`/admin/tenants/${id}/test-connection`, {}, token),
    iikoSections: (token: string, tenantId: string) =>
      authedGet<IikoSection[]>(`/admin/tenants/${tenantId}/iiko-sections`, token),
    hallPlans: (token: string, tenantId: string) =>
      authedGet<HallPlan[]>(`/admin/tenants/${tenantId}/hall-plans`, token),
    saveHallPlan: (token: string, tenantId: string, plan: HallPlan) =>
      fetch(`${BASE}/admin/tenants/${tenantId}/hall-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(plan),
      }).then(r => r.json() as Promise<HallPlan>),
    deleteHallPlan: (token: string, tenantId: string, planId: string) =>
      del(`/admin/tenants/${tenantId}/hall-plans/${planId}`, token),
  },
  sales: {
    revenue: (range: 'today' | '7days' | '30days' | 'custom', customFrom?: string, customTo?: string, revenueType?: RevenueType): Promise<RevenueRow[]> => {
      if (isDemoTenant()) {
        if (range === 'custom' && customFrom && customTo) {
          // Comparison period — match day count of the custom range, scaled 15% lower
          const msPerDay = 86400000;
          const spanDays = Math.max(1, Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / msPerDay));
          const rows = demoRevenueRows(spanDays);
          return Promise.resolve(rows.map(r => ({
            ...r,
            revenue: Math.round(r.revenue * 0.85),
            orders:  Math.round(r.orders  * 0.85),
            guests:  Math.round(r.guests  * 0.85),
          })));
        }
        const days = range === 'today' ? 1 : range === '30days' ? 30 : 7;
        return Promise.resolve(demoRevenueRows(days));
      }
      const q = (customFrom && customTo
        ? `from=${customFrom}&to=${customTo}`
        : `range=${range}`) + (revenueType && revenueType !== 'net' ? `&type=${revenueType}` : '');
      return apiFetch(`/sales/revenue?${q}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    // Benedict-only: revenue excluding staff/management comp tables and
    // delivery/takeaway aggregator channels — real seated-guest revenue.
    // Returns { available: false } for every other tenant.
    realGuestRevenue: (range: 'today' | '7days' | '30days' | 'custom', customFrom?: string, customTo?: string): Promise<{ available: boolean; revenue?: number; orders?: number; guests?: number; excludedRevenue?: number }> => {
      if (isDemoTenant()) return Promise.resolve({ available: false });
      const q = customFrom && customTo
        ? `from=${customFrom}&to=${customTo}`
        : `range=${range}`;
      return apiFetch(`/sales/real-guest-revenue?${q}`).then(r => r.json()).catch(() => ({ available: false }));
    },
    hourly: (date?: string): Promise<HourlyRow[]> =>
      isDemoTenant() ? Promise.resolve(demoHourly()) : apiFetch(`/sales/hourly${date ? `?date=${date}` : ''}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    topDishes: (range: 'today' | '7days' | '30days' | 'custom', limit = 10, customFrom?: string, customTo?: string): Promise<DishRow[]> => {
      if (isDemoTenant()) return Promise.resolve(demoTopDishes(limit));
      const q = customFrom && customTo
        ? `from=${customFrom}&to=${customTo}&limit=${limit}`
        : `range=${range}&limit=${limit}`;
      return apiFetch(`/sales/top-dishes?${q}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    status: (): Promise<IntegrationStatus> =>
      isDemoTenant() ? Promise.resolve(demoSalesStatus()) : apiFetch(`/sales/status`).then(r => r.json()),
    categoryPerf: (range: 'today' | '7days' | '30days' | 'custom', customFrom?: string, customTo?: string): Promise<CategoryPerfRow[]> => {
      if (isDemoTenant()) return Promise.resolve(demoCategoryPerf());
      const q = customFrom && customTo ? `from=${customFrom}&to=${customTo}` : `range=${range}`;
      return apiFetch(`/sales/category-perf?${q}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    abc: (range: 'today' | '7days' | '30days' | 'custom', customFrom?: string, customTo?: string): Promise<AbcRow[]> => {
      if (isDemoTenant()) return Promise.resolve(demoAbc());
      const q = customFrom && customTo ? `from=${customFrom}&to=${customTo}` : `range=${range}`;
      return apiFetch(`/sales/abc?${q}`).then(r => r.json()).then(d => Array.isArray(d) ? d : [])
        // Backend sends cost + marginPct but not foodCostPct yet — derive it
        // here so the column works today regardless of backend rollout order.
        .then((rows: AbcRow[]) => rows.map(r => ({
          ...r,
          foodCostPct: r.foodCostPct ?? (r.marginPct != null ? Math.round((100 - r.marginPct) * 10) / 10
            : (r.cost != null && r.revenue > 0 ? Math.round((r.cost / r.revenue) * 1000) / 10 : null)),
        })));
    },
    abcHistory: (dishName: string, lang: Language = 'ru'): Promise<AbcHistoryItem[]> =>
      isDemoTenant() ? Promise.resolve(demoAbcHistory(dishName, lang)) : apiFetch(`/sales/abc/history?dishName=${encodeURIComponent(dishName)}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    abcDaypart: (dishName: string, range = '30days', lang: Language = 'ru'): Promise<DaypartData> =>
      isDemoTenant() ? Promise.resolve(demoAbcDaypart(dishName, lang)) : apiFetch(`/sales/abc/daypart?dishName=${encodeURIComponent(dishName)}&range=${range}`).then(r => r.json()).then(d => (d && !d.error) ? d : { byDow: [], byHour: [] }),
  },
  ai: {
    briefing: (lang: Language, force = false): Promise<AIDailyBriefing> =>
      isDemoTenant() ? Promise.resolve(demoBriefing(lang)) : post<AIDailyBriefing>(`/ai/briefing`, { lang, force }),
    insight: (metrics: {
      last: { date: string; revenue: number; orders: number };
      prev: { date: string; revenue: number; orders: number };
      pct: number;
      up: boolean;
      topDish?: { name: string; quantity: number; revenue: number };
    }, lang: Language): Promise<{ text: string | null; fromAI: boolean }> =>
      isDemoTenant() ? Promise.resolve(demoInsight(lang)) : post(`/ai/insight`, { metrics, lang }),
    chat: (context: string, messages: { role: 'user' | 'ai'; text: string }[], lang: Language): Promise<{ text: string; fromAI: boolean }> =>
      isDemoTenant() ? Promise.resolve(demoChat(context, lang)) : post(`/ai/chat`, { context, messages, lang }),
    profitForecast: (payload: {
      monthly: { month: string; label: string; revenue: number }[];
      foodCostPct: number | null;
      laborCostPct: number | null;
      profitPct: number | null;
      lang: Language;
      targetMonth?: string; // "YYYY-MM", defaults to the month after the last full month
    }): Promise<{ fromAI: boolean; nextMonth?: string; nextMonthKey?: string; forecastRevenue?: number; forecastProfit?: number; forecastProfitPct?: number; reasoning?: string; trend?: 'up' | 'flat' | 'down'; risks?: string }> =>
      isDemoTenant() ? Promise.resolve(demoProfitForecast(payload.lang)) : post(`/ai/profit-forecast`, payload),
    hourlyForecast: (lang: Language): Promise<{ fromAI: boolean; forecastRevenue?: number; reasoning?: string; todayRevSoFar?: number; avgSameDow?: number; dayProgressPct?: number }> =>
      isDemoTenant() ? Promise.resolve(demoHourlyForecast(lang)) : post(`/ai/hourly-forecast`, { lang }),
    slowHour: (lang: Language): Promise<{ fromAI: boolean; isAlert?: boolean; pctBelow?: number; currentRevenue?: number; expectedByNow?: number; suggestion?: string }> =>
      isDemoTenant() ? Promise.resolve(demoSlowHour(lang)) : post(`/ai/slow-hour`, { lang }),
    stopListImpact: (lang: Language): Promise<{ fromAI: boolean; hits?: { name: string; rank: number; dailyAvg: number; hoursLeft: number; estimatedLoss: number }[]; summary?: string }> =>
      isDemoTenant() ? Promise.resolve(demoStopListImpact(lang)) : post(`/ai/stop-list-impact`, { lang }),
    guestReturn: (lang: Language): Promise<{ fromAI: boolean; weeklyRetentionPct?: number; isRealRetentionData?: boolean; avgVisitsPerGuest?: number | null; returnProbability7d?: number | null; audienceType?: string; insight?: string; avgGuestsPerDay?: number; avgCheck30?: number; peakDowName?: string }> =>
      isDemoTenant() ? Promise.resolve(demoGuestReturn(lang)) : post(`/ai/guest-return`, { lang }),
    priceElasticity: (lang: Language, force = false): Promise<{ fromAI: boolean; hints?: { name: string; currentPrice: number; suggestedPrice: number; reasoning: string; promo?: string }[] }> =>
      isDemoTenant() ? Promise.resolve(demoPriceElasticity(lang)) : post(`/ai/price-elasticity`, { lang, force }),
    comboSuggestions: (lang: Language, force = false): Promise<{ fromAI: boolean; combos?: { items: string[]; reason: string; mechanic: string }[]; hasPluginData?: boolean }> =>
      isDemoTenant() ? Promise.resolve(demoComboSuggestions(lang)) : post(`/ai/combo-suggestions`, { lang, force }),
    wasteRootCause: (lang: Language): Promise<{ fromAI: boolean; patterns?: { dish: string; peakDay: string; rootCause: string; advice: string }[]; summary?: string }> =>
      isDemoTenant() ? Promise.resolve(demoWasteRootCause(lang)) : post(`/ai/waste-root-cause`, { lang }),
    staffNarrative: (lang: Language): Promise<{ fromAI: boolean; narrative?: string; staff?: { name: string; revenue: number; orders: number; avgCheck: number; avgTurnMin: number | null }[] }> =>
      isDemoTenant() ? Promise.resolve(demoStaffNarrative(lang)) : post(`/ai/staff-narrative`, { lang }),
    shiftSchedule: (lang: Language): Promise<{ fromAI: boolean; schedule?: ShiftScheduleDay[]; summary?: string }> =>
      isDemoTenant() ? Promise.resolve(demoShiftSchedule(lang)) : post(`/ai/shift-schedule`, { lang }),
    shiftScheduleExportPdf: (
      schedule: ShiftScheduleDay[],
      summary: string | undefined,
      lang: Language,
    ): Promise<Blob> =>
      apiFetch(`/ai/shift-schedule/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule, summary, lang }),
      }).then(r => { if (!r.ok) throw new Error(`export failed: ${r.status}`); return r.blob(); }),
    shiftScheduleSendTelegram: (
      schedule: ShiftScheduleDay[],
      summary: string | undefined,
      lang: Language,
    ): Promise<{ ok: boolean; error?: string }> =>
      post(`/ai/shift-schedule/send-telegram`, { schedule, summary, lang }),
    reviewReply: (text: string, rating: number | null, platform: string, lang: Language): Promise<{ fromAI: boolean; reply?: string }> =>
      isDemoTenant() ? Promise.resolve(demoReviewReply(rating, lang)) : post(`/ai/review-reply`, { text, rating, platform, lang }),
    reviewTrends: (lang: Language): Promise<{ fromAI: boolean; trends?: { topic: string; change: string; pctChange: number }[]; summary?: string; alertLevel?: string; weeklyData?: { week: string; positive: number; neutral: number; negative: number }[] }> =>
      isDemoTenant() ? Promise.resolve(demoReviewTrends(lang)) : post(`/ai/review-trends`, { lang }),
    shiftTrends: (lang: Language): Promise<{ fromAI: boolean; patterns?: { topic: string; detail: string; severity: 'low' | 'medium' | 'high' }[]; topConcerns?: string[]; summary?: string; alertLevel?: string; stats?: { total: number; goodPct: number; badPct: number; managers: { name: string; total: number; bad: number }[]; branches: { name: string; total: number; bad: number }[] } }> =>
      isDemoTenant() ? Promise.resolve(demoShiftTrends(lang)) : post(`/ai/shift-trends`, { lang }),
  },
  halls: {
    list: async (branchIdOverride?: string): Promise<HallPlan[]> => {
      if (isDemoTenant()) return demoHalls();
      const r = await apiFetch(`/halls`, {}, branchIdOverride);
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  },
  financial: {
    writeoffs: (range: 'today' | '7days' | '30days' | 'custom' = '7days', customFrom?: string, customTo?: string): Promise<FinancialWriteoffRow[]> => {
      if (isDemoTenant()) return Promise.resolve(demoWriteoffs());
      const q = range === 'custom' && customFrom && customTo ? `from=${customFrom}&to=${customTo}` : `range=${range}`;
      return apiFetch(`/financial/writeoffs?${q}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    invoices: (range: 'today' | '7days' | '30days' = '7days'): Promise<FinancialInvoiceRow[]> =>
      isDemoTenant() ? Promise.resolve(demoInvoices()) : apiFetch(`/financial/invoices?range=${range}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    inventory: (range: 'today' | '7days' | '30days' = '30days'): Promise<(FinancialInventoryDoc | PosterInventoryItem)[] | null> =>
      isDemoTenant() ? Promise.resolve(getDemoPos() === 'poster' ? demoPosterInventory() : demoInventory()) : apiFetch(`/financial/inventory?range=${range}`).then(r => r.json()).then(d => (Array.isArray(d) && d.length ? d : null)),
    // Poster only — doc-based stocktaking archive, a second view alongside inventory() above.
    inventoryDocs: (): Promise<PosterInventoryDoc[]> =>
      isDemoTenant() ? Promise.resolve(getDemoPos() === 'poster' ? demoPosterInventoryDocs() : []) : apiFetch(`/financial/inventory-docs`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    inventoryItems: (docId: string, date: string, docNum?: string): Promise<InventoryItem[]> =>
      isDemoTenant() ? Promise.resolve(demoInventoryItems(docId)) : apiFetch(`/financial/inventory/items?docId=${encodeURIComponent(docId)}&date=${date}${docNum ? `&docNum=${encodeURIComponent(docNum)}` : ''}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    pl: (range: 'today' | '7days' | '30days' | 'custom' = '7days', customFrom?: string, customTo?: string): Promise<FinancialPL | null> => {
      if (isDemoTenant()) return Promise.resolve(demoPL());
      const q = range === 'custom' && customFrom && customTo ? `from=${customFrom}&to=${customTo}` : `range=${range}`;
      return apiFetch(`/financial/pl?${q}`).then(r => r.json()).then(d => d ?? null);
    },
    glSummary: (range: 'today' | '7days' | '30days' | 'custom' = '7days', customFrom?: string, customTo?: string): Promise<GLSummary | null> => {
      if (isDemoTenant()) return Promise.resolve(demoGLSummary());
      const q = range === 'custom' && customFrom && customTo ? `from=${customFrom}&to=${customTo}` : `range=${range}`;
      return apiFetch(`/financial/gl-summary?${q}`).then(r => r.json()).then(d => d ?? null);
    },
    // Poster only — see PosterGLCategory.
    glCategories: (range: 'today' | '7days' | '30days' | 'custom' = '7days', customFrom?: string, customTo?: string): Promise<PosterGLCategory[]> => {
      if (isDemoTenant()) return Promise.resolve(demoGLCategories());
      const q = range === 'custom' && customFrom && customTo ? `from=${customFrom}&to=${customTo}` : `range=${range}`;
      return apiFetch(`/financial/gl-categories?${q}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    cashshifts: (range: 'today' | '7days' | '30days' | 'custom' = '7days', customFrom?: string, customTo?: string): Promise<CashShiftDoc[]> => {
      if (isDemoTenant()) return Promise.resolve(demoCashShiftDocs());
      const q = range === 'custom' && customFrom && customTo ? `from=${customFrom}&to=${customTo}` : `range=${range}`;
      return apiFetch(`/financial/cashshifts?${q}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    menuAnalysis: (range: 'today' | '7days' | '30days' = '7days'): Promise<MenuAnalysisRow[]> =>
      isDemoTenant() ? Promise.resolve(demoMenuAnalysis()) : apiFetch(`/financial/menu-analysis?range=${range}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  },
  settings: {
    listReportSubscriptions: (): Promise<ReportSubscription[]> =>
      isDemoTenant() ? Promise.resolve([]) : apiFetch(`/settings/report-subscriptions`).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? d : []),
    createReportSubscription: (data: { channel: ReportChannel; email?: string; report_type: ReportType; frequency: 'daily' | 'weekly'; send_hour: number; enabled: boolean }): Promise<ReportSubscription> =>
      apiFetch(`/settings/report-subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    updateReportSubscription: (id: string, data: { email?: string; frequency: 'daily' | 'weekly'; send_hour: number; enabled: boolean }): Promise<ReportSubscription> =>
      apiFetch(`/settings/report-subscriptions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    deleteReportSubscription: (id: string): Promise<void> =>
      apiFetch(`/settings/report-subscriptions/${id}`, { method: 'DELETE' }).then(() => undefined),
    telegramStatus: (): Promise<TelegramStatus> =>
      apiFetch(`/settings/telegram-status`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    relinkTelegram: (): Promise<TelegramStatus> =>
      apiFetch(`/settings/telegram-relink`, { method: 'POST' }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    sendTestReport: (sub: { channel: ReportChannel; email?: string | null; report_type: ReportType }): Promise<{ ok: boolean; error?: string }> =>
      apiFetch(`/settings/report-subscriptions/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      }).then(r => r.json()),
    listRealGuestSections: (): Promise<{ sections: { name: string; tableCount: number; excluded: boolean }[]; hasPluginData: boolean }> =>
      isDemoTenant() ? Promise.resolve({ sections: [], hasPluginData: false }) : apiFetch(`/settings/real-guest-sections`).then(r => r.json()),
    saveRealGuestSections: (excluded: string[]): Promise<{ ok: boolean; excluded: string[] }> =>
      apiFetch(`/settings/real-guest-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded }),
      }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    businessHours: (): Promise<{ openHour: number | null; closeHour: number | null; breakEvenRevenue: number | null }> =>
      isDemoTenant() ? Promise.resolve({ openHour: null, closeHour: null, breakEvenRevenue: null }) : apiFetch(`/settings/business-hours`).then(r => r.json()),
    saveBusinessHours: (data: { openHour: number | null; closeHour: number | null; breakEvenRevenue: number | null }): Promise<{ ok: boolean }> =>
      apiFetch(`/settings/business-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    alertThresholds: (): Promise<AlertThresholds> =>
      isDemoTenant() ? Promise.resolve(demoAlertThresholds()) : apiFetch(`/settings/alert-thresholds`).then(r => r.json()),
    saveAlertThresholds: (data: AlertThresholds): Promise<AlertThresholds> =>
      apiFetch(`/settings/alert-thresholds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
  },
  operations: {
    tableRevenue: (days = 30, range?: { from: string; to: string }, branchIdOverride?: string): Promise<{ table: number; revenue: number; orders: number }[]> => {
      if (isDemoTenant()) return Promise.resolve(demoTableRevenue());
      const qs = range ? `from=${range.from}&to=${range.to}` : `days=${days}`;
      return apiFetch(`/operations/table-revenue?${qs}`, {}, branchIdOverride).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    // branchIdOverride: force this call at a specific sibling branch,
    // independent of the globally active branch — used to fan out across
    // every branch when "All branches" is selected (see Operations.tsx).
    activeOrders: (branchIdOverride?: string): Promise<ActiveOrderRow[]> =>
      isDemoTenant() ? Promise.resolve([]) : apiFetch(`/operations/active-orders`, {}, branchIdOverride).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    cashShift: (): Promise<CashShift> =>
      isDemoTenant() ? Promise.resolve(demoCashShift()) : apiFetch(`/operations/cash-shift`).then(r => r.json()),
    kpis: (): Promise<OpsKpis> =>
      isDemoTenant() ? Promise.resolve(demoKpis()) : apiFetch(`/operations/kpis`).then(r => r.json()),
    staff: (): Promise<StaffRow[]> =>
      isDemoTenant() ? Promise.resolve(demoStaffOpsRows()) : apiFetch(`/operations/staff`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    stopList: (): Promise<StopItem[]> =>
      isDemoTenant() ? Promise.resolve(demoOpsStopList()) : apiFetch(`/operations/stop-list`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staffProfitability: (range: 'today' | '7days' | '30days' = '30days'): Promise<StaffProfitabilityResult> =>
      isDemoTenant() ? Promise.resolve(demoStaffProfitability(range)) : apiFetch(`/operations/staff-profitability?range=${range}`).then(r => r.json()),
    staffAbc: (range: 'today' | '7days' | '30days' | 'custom' = '30days', customFrom?: string, customTo?: string): Promise<StaffAbcResult> => {
      if (isDemoTenant()) return Promise.resolve(demoStaffAbc(range === 'custom' ? '30days' : range));
      const q = range === 'custom' && customFrom && customTo ? `from=${customFrom}&to=${customTo}` : `range=${range}`;
      return apiFetch(`/operations/staff-abc?${q}`).then(r => r.json());
    },
    alerts: (lang: Language = 'ru'): Promise<OpsAlert[]> =>
      isDemoTenant() ? Promise.resolve(demoOpsAlerts()) : apiFetch(`/operations/alerts?lang=${lang}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    voidTracker: (range: 'today' | '7days' | '30days' | 'custom' = 'today', customFrom?: string, customTo?: string): Promise<VoidRow[]> => {
      if (isDemoTenant()) return Promise.resolve(demoVoidTracker());
      const q = range === 'custom' && customFrom && customTo ? `from=${customFrom}&to=${customTo}` : (range !== 'today' ? `range=${range}` : '');
      return apiFetch(`/operations/void-tracker${q ? `?${q}` : ''}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    voidEvents: (): Promise<VoidEvent[]> =>
      isDemoTenant() ? Promise.resolve([]) : apiFetch(`/operations/void-events`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    delivery: (): Promise<DeliveryRow[]> =>
      isDemoTenant() ? Promise.resolve(demoDelivery()) : apiFetch(`/operations/delivery`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    // Poster only — no iiko-side equivalent anywhere in TRACE.
    reservations: (): Promise<ReservationRow[]> =>
      isDemoTenant() ? Promise.resolve(demoReservations()) : apiFetch(`/operations/reservations`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    tableTurns: (): Promise<TableTurnRow[]> =>
      isDemoTenant() ? Promise.resolve(demoTableTurns()) : apiFetch(`/operations/table-turns`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    peakPrep: (): Promise<PeakSlot[]> =>
      isDemoTenant() ? Promise.resolve(demoPeakPrep()) : apiFetch(`/operations/peak-prep`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  },
  loyalty: {
    summary: (): Promise<LoyaltySummary> =>
      isDemoTenant() ? Promise.resolve(demoLoyaltySummary()) : apiFetch(`/loyalty/summary`).then(r => r.json()),
    guests: (limit = 50): Promise<LoyaltyGuestRow[]> =>
      isDemoTenant() ? Promise.resolve(demoLoyaltyGuests()) : apiFetch(`/loyalty/guests?limit=${limit}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    guestDetail: (phone: string): Promise<any> =>
      isDemoTenant() ? Promise.resolve(demoLoyaltyGuestDetail(phone)) : apiFetch(`/loyalty/guests/${encodeURIComponent(phone)}`).then(r => r.json()),
    guestHistory: (phone: string): Promise<LoyaltyVisit[]> =>
      isDemoTenant() ? Promise.resolve(demoLoyaltyHistory()) : apiFetch(`/loyalty/guests/${encodeURIComponent(phone)}/history`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  },
  org: {
    branches: (): Promise<BranchSummary[]> =>
      isDemoTenant() ? Promise.resolve([]) : apiFetch(`/org/branches`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    compare: (range: 'today' | '7days' | '30days'): Promise<{ branches: BranchCompareResult[] }> =>
      isDemoTenant() ? Promise.resolve(demoCompare(range)) : apiFetch(`/org/compare?range=${range}`).then(r => r.json()),
    // Whether this org has an iikoChain server configured — gates the "All
    // branches" option in the branch selector.
    info: (): Promise<{ organizationId: string | null; hasChainServer: boolean }> =>
      isDemoTenant() ? Promise.resolve({ organizationId: null, hasChainServer: false }) : apiFetch(`/org/info`).then(r => r.json()),
  },
  shiftReports: {
    list: (params?: { branch?: string; shift?: string; from?: string; to?: string }): Promise<import('../types').ShiftReport[]> => {
      const q = new URLSearchParams();
      if (params?.branch) q.set('branch', params.branch);
      if (params?.shift)  q.set('shift',  params.shift);
      if (params?.from)   q.set('from',   params.from);
      if (params?.to)     q.set('to',     params.to);
      const qs = q.toString();
      return apiFetch(`/shift-reports${qs ? `?${qs}` : ''}`)
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []);
    },
    create: (data: Omit<import('../types').ShiftReport, 'id' | 'tenant_id' | 'created_at'>): Promise<import('../types').ShiftReport> =>
      apiFetch(`/shift-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    remove: (id: string): Promise<void> =>
      apiFetch(`/shift-reports/${id}`, { method: 'DELETE' }).then(() => undefined),
  },
};


export interface CashShift {
  cashier: string | null;
  sessionId: string | null;
  openTime: string | null;
  status: 'open' | 'closed';
  cash: number;
  card: number;
  cardBreakdown: { type: string; amount: number }[];
  revenue: number;
  orders: number;
  payOut: number;
}

export interface OpsKpis {
  avgServiceMin: number | null;
  avgKitchenMin?: number | null;
  wasteSum: number | null;
  staffActive: number | null;
}

export interface FinancialWriteoffRow {
  id: number;
  name: string;
  category: string;
  qty: number;
  cost: number;
  date: string;
  docNumber?: string;
  isFood?: boolean;
}

export interface FinancialInvoiceRow {
  id: string;
  date: string;
  supplier: string;
  amount: number;
  status: string;
}

export interface FinancialInventoryDoc {
  id: string;
  documentNumber: string;
  date: string;
  status: string;
  storeCode: string;
  comment: string;
  itemCount: number;
  sum?: number;
}

// Poster has no stocktaking-document concept like iiko's inventory tab —
// storage.getStorageLeftovers is a live current-balance snapshot, so this is
// a flat per-item shape, not FinancialInventoryDoc. Financial.tsx renders it
// via a separate branch when the tenant is on Poster.
export interface PosterInventoryItem {
  id: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  totalValue: number;
}

export interface InventoryItem {
  productName: string;
  productCode: string;
  category: string;
  unit: string;
  bookQty: number;
  actualQty: number;
  diffQty: number;
  price: number;
  sum: number;
}

export type ReportType = 'daily_summary' | 'financial_summary';
export type ReportChannel = 'email' | 'telegram';

export interface ReportSubscription {
  id: string;
  channel: ReportChannel;
  email: string | null;
  report_type: ReportType;
  frequency: 'daily' | 'weekly';
  send_hour: number;
  enabled: boolean;
  last_sent_at: string | null;
}

export interface TelegramStatus {
  connected: boolean;
  deep_link: string | null;
}

export interface AlertThresholds {
  lowStockQty: number | null;
  negativeMarginPct: number | null;
  highWriteoffPct: number | null;
  staleOpenTableMin: number | null;
}

function demoAlertThresholds(): AlertThresholds {
  return { lowStockQty: 5, negativeMarginPct: 0, highWriteoffPct: 5, staleOpenTableMin: 180 };
}

export interface CashShiftDoc {
  id: string;
  sessionNumber: number;
  openDate: string | null;
  closeDate: string | null;
  payOrders: number;
  salesCash: number;
  salesCard: number;
  salesCredit: number;
  payIn: number;
  payOut: number;
  cashDiff: number;
  sessionStatus: string;
}

export interface MenuAnalysisRow {
  name: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number | null;
  avgPrice: number;
  costPerUnit: number | null;
}

export interface FinancialPLCategory {
  name: string;
  revenue: number;
  cogs: number;
  foodCostPct: number | null;
}

export interface FinancialPLMonth {
  month: string;   // YYYY-MM
  label: string;   // Jan, Feb …
  revenue: number;
}

export interface FinancialPL {
  revenue: number;
  cogs: number;
  grossProfit: number;
  foodCostPct: number | null;
  laborCost: number;
  laborCostPct: number | null;
  laborBreakdown?: { tariff: number; incentive: number; bonus: number; penalty: number };
  profitPct: number | null;
  rent: number;
  utilities: number;
  otherOpex: number;
  netProfit: number;
  netProfitPct: number | null;
  opexLines?: { account: string; amount: number }[];
  categories: FinancialPLCategory[];
  monthly: FinancialPLMonth[];
}

export interface GLSummary {
  laborBreakdown: { tariff: number; incentive: number; bonus: number; penalty: number; total: number };
  payables: { invoiced: number; paid: number; netChange: number };
  taxes: { lines: { name: string; amount: number }[]; total: number };
  cashPositions: { account: string; incoming: number; outgoing: number; net: number }[];
  income: { lines: { name: string; amount: number }[]; discounts: number; total: number };
}

export interface StaffProfitabilityRow {
  name: string;
  revenue: number;
  orders: number;
  avgCheck: number;
  salaryCost: number | null;
  salaryType: 'attendance' | 'fixed' | null;
  profit: number | null;
  profitabilityPct: number | null;
  roi: number | null;
  hasSalary: boolean;
}

export interface StaffProfitabilityResult {
  range: string;
  daysInPeriod: number;
  rows: StaffProfitabilityRow[];
}

export interface StaffAbcRow {
  name: string;
  revenue: number;
  orders: number;
  avgCheck: number;
  avgPerDay: number;
  share: number;
  cumShare: number;
  abc: 'A' | 'B' | 'C';
}

export interface StaffAbcResult {
  range: string;
  daysInPeriod: number;
  rows: StaffAbcRow[];
}

export interface StaffRow {
  name: string;
  orders: number;
  revenue: number;
  guests: number;
  dishes: number;
  avgCheck: number;
  avgServiceMin: number | null;
  enterTime: string | null;
  exitTime: string | null;
  hoursWorked: number | null;
  topDishes: { name: string; qty: number; revenue: number }[];
  openTables?: number;
}

export interface StopItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  stoppedAt: string;
}

export interface OpsAlert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  type: string;
  title: string;
  detail: string;
  since: string;
}

export interface VoidRow {
  waiter: string;
  voidCount: number;
  firstVoidAt: string;
}

export interface VoidEvent {
  id: string;
  type: 'order_before_delete' | 'order_printed_items_deleted';
  waiter: string;
  table: string | null;
  orderNum: number | null;
  sum: number;
  items: { name: string; quantity: number; sum?: number }[];
  at: string;
}

export interface DeliveryRow {
  id: string;
  number?: number;
  status: string;
  sum: number;
  updatedAt: string;
}

// Poster only — incomingOrders.getReservations, no iiko-side equivalent.
export interface ReservationRow {
  id: string;
  guestName: string;
  phone: string | null;
  partySize: number | null; // Poster's reservation API has no party-size field
  date: string;
  durationMin: number;
  status: 'new' | 'accepted' | 'canceled';
  comment: string | null;
}

// Poster only — finance.getReport's category/amount breakdown. Not a full
// chart-of-accounts like iiko's GLSummary (no payables/cash-positions/
// payroll concept in Poster), so it's its own shape/endpoint rather than
// forced into GLSummary.
export interface PosterGLCategory {
  name: string;
  level: number;
  amount: number;
}

// Poster only — storage.getStorageInventories, the doc-based stocktaking
// archive, offered alongside the live-balance PosterInventoryItem view.
export interface PosterInventoryDoc {
  id: string;
  storageId: string;
  storageName: string;
  dateStart: string;
  dateEnd: string;
  sum: number;
  status: string;
}

export interface TableTurnRow {
  orderId: string;
  tableNumber: string;
  tableName: string;
  waiter: string;
  seatedMinutes: number;
  avgMinutes: number | null;
  status: 'overdue' | 'soon' | 'normal';
}

export interface PeakSlot {
  hour: number;
  label: string;
  avgOrders: number;
  currentStaff: number;
  recommendedStaff: number | null;
  isPeak: boolean;
  understaffed: boolean;
}

export interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  iiko_login: string | null;
  iiko_password: string | null;
  iiko_server: string | null;
  iiko_cloud_api: string | null;
  pos_type: 'iiko' | 'poster';
  poster_account_name: string | null;
  poster_access_token: string | null;
  poster_spot_id: string | null;
  enabled: boolean;
  created_at: string;
  google_maps_url: string | null;
  yandex_maps_url: string | null;
  tripadvisor_url: string | null;
  twogis_url: string | null;
  telegram_chat_id: string | null;
  plan: 'base' | 'pro' | null;
  review_refresh_google: number | null;
  review_refresh_yandex: number | null;
  review_refresh_2gis: number | null;
  review_refresh_tripadvisor: number | null;
  organization_id: string | null;
  iiko_loyalty_app_id: string | null;
  iiko_loyalty_client_secret: string | null;
  onec_base_url: string | null;
  onec_login: string | null;
  onec_password: string | null;
}

export interface AIDailyBriefing {
  fromAI: boolean;
  summary?: string;
  actions?: string[];
  staff?: string;
  forecast?: string;
  risk?: string;
}

export interface RevenueRow {
  date: string;
  revenue: number;
  orders: number;
  guests: number;
}

// iiko has no single "revenue" — it's ~10 different sums (with/without
// discount, by payment method, by category) that legitimately disagree.
// This picks which one drives the Dashboard headline number.
export type RevenueType = 'net' | 'gross' | 'food_only' | 'cash' | 'card' | 'excl_comp'
  | 'gl_kitchen' | 'gl_bar' | 'gl_pastry' | 'gl_service_charge' | 'gl_transfers' | 'gl_other_income' | 'gl_no_discount';

export interface HourlyRow {
  hour: number;
  h: string;
  revenue: number;
  orders: number;
}

export interface ShiftScheduleDay {
  day: string;
  assignments: { waiter: string; start: string; end: string }[];
}

export interface IntegrationStatus {
  iikoServer?: { ok: boolean; label: string };
  iikoCloud?:  { ok: boolean; label: string };
  poster?:     { ok: boolean; label: string };
}

export type AbcGrade = 'A' | 'B' | 'C';

export interface AbcRow {
  name: string;
  cat: string;
  revenue: number;
  qty: number;
  avgPrice: number;
  velocity: number;
  share: number;
  cost?: number;
  grossProfit?: number;
  marginPct?: number | null;
  costPerUnit?: number | null;
  // (cost ÷ revenue) × 100 — the inverse of marginPct, kept as its own field
  // since "food cost %" is the term kitchens actually think in (lower = better).
  foodCostPct?: number | null;
  abc: AbcGrade;        // = abcRevenue (backward compat)
  abcRevenue: AbcGrade;
  abcQty: AbcGrade;
  abcProfit: AbcGrade;
}

export interface AbcHistoryItem {
  month: string;       // "YYYY-MM"
  label: string;       // "март 2026"
  found: boolean;
  abcRevenue: AbcGrade | '—';
  abcQty: AbcGrade | '—';
  abcProfit: AbcGrade | '—';
}

export interface DaypartData {
  byDow:  { dow: number; label: string; qty: number }[];
  byHour: { hour: number; label: string; qty: number }[];
}

export interface CategoryPerfRow {
  name: string;
  revenue: number;
  orders: number;
  avgCheck: number;
  pct: number;
}

export interface DishRow {
  name: string;
  category: string;
  revenue: number;
  quantity: number;
}

export interface BranchSummary {
  id: string;
  name: string;
  subdomain: string;
}

// iikoChain — iiko's own chain-level server that reports combined data
// across every branch, distinct from each branch tenant's own iiko_server.
export interface Organization {
  id: string;
  name: string;
  iiko_chain_server: string | null;
  iiko_chain_login: string | null;
  iiko_chain_password: string | null;
}

export interface BranchCompareResult extends BranchSummary {
  revenue?: number;
  orders?: number;
  guests?: number;
  avgCheck?: number;
  series?: RevenueRow[];
  topDishes?: DishRow[];
  categories?: CategoryPerfRow[];
  error?: string;
}

export interface ActiveOrderRow {
  id: string;
  number?: number;
  table: string;
  tableNum?: number | null;
  waiter: string;
  items: number;
  guests?: number | null;
  status: string;
  kitchenStatus?: 'preparing' | 'ready' | null; // Poster only — live processing_status snapshot, no iiko equivalent
  openTime: string;
  sum: number;
  ticketMin: number;
}

export interface LiveStatus {
  pluginConnected: boolean;
  connectedSince: string | null;
  ip: string | null;
  eventsToday: number;
  lastEventAt: string | null;
}

export interface RealtimeEvent {
  id: string;
  type: string;
  payload: {
    type: string;
    timestamp?: string;
    data?: {
      table?: { number: number; name: string };
      waiter?: string;
      cashier?: string;
      sum?: number;
      orderId?: string;
      [key: string]: unknown;
    };
  };
  created_at: string;
}

export type HallElementType = 'rect_table' | 'round_table' | 'stool' | 'wall' | 'bar' | 'entrance';

export interface HallElement {
  id: string;
  type: HallElementType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  cx?: number;
  cy?: number;
  r?: number;
  rotation?: number;
  label: string;
  seats: number;
  iiko_table_number?: number;
}

export interface HallPlan {
  id: string;
  tenant_id: string;
  iiko_section_id?: string;
  name: string;
  display_order: number;
  elements: HallElement[];
  created_at?: string;
  updated_at?: string;
}

export interface IikoSection {
  id: string;
  name: string;
  tables: Array<{ id: string; number: number; name: string; seatingCapacity?: number }>;
}

const TENANT_PLAN_KEY = 'trace_tenant_plan';

const TENANT_TOKEN_KEY = 'trace_token';

export async function tenantAuth(login: string, password: string): Promise<boolean> {
  const subdomain = getSubdomain();
  try {
    const r = await fetch(`${BASE}/admin/tenant-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain, login, password }),
    });
    const json = await r.json();
    if (json.ok === true) {
      sessionStorage.setItem(TENANT_PLAN_KEY, json.plan ?? 'pro');
      if (json.token) sessionStorage.setItem(TENANT_TOKEN_KEY, json.token);
    }
    return json.ok === true;
  } catch { return false; }
}

// Returns: true = verified, false = explicitly rejected (clear tokens), null = network error (keep tokens)
export async function verifyTenantToken(): Promise<boolean | null> {
  const token = localStorage.getItem(TENANT_TOKEN_KEY) ?? sessionStorage.getItem(TENANT_TOKEN_KEY);
  if (!token) return false;
  try {
    const r = await fetch(`${BASE}/admin/tenant-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const json = await r.json();
    if (json.ok === true) {
      sessionStorage.setItem(TENANT_PLAN_KEY, json.plan ?? 'pro');
      return true;
    }
    localStorage.removeItem(TENANT_TOKEN_KEY);
    sessionStorage.removeItem(TENANT_TOKEN_KEY);
    return false;
  } catch {
    return null; // network error — keep tokens, retry next visit
  }
}

export function clearTenantToken() {
  localStorage.removeItem(TENANT_TOKEN_KEY);
  sessionStorage.removeItem(TENANT_TOKEN_KEY);
}

// Owner bearer token, wherever App.tsx currently keeps it (localStorage once
// "remember me" is on, sessionStorage otherwise — see App.tsx's promote/demote
// on login/logout). Needed for owner-only calls like the Team (staff) CRUD
// endpoints, gated server-side by requireOwnerToken.
export function getTenantOwnerToken(): string | null {
  return localStorage.getItem(TENANT_TOKEN_KEY) ?? sessionStorage.getItem(TENANT_TOKEN_KEY);
}

// Tenants with no plan set (or plan='pro') have unrestricted access.
// Only plan='base' restricts AI features (5 chat msgs / 2h, daily briefing only).
export function getTenantPlan(): 'base' | 'pro' {
  if (isDemoTenant()) return 'pro';
  return sessionStorage.getItem(TENANT_PLAN_KEY) === 'base' ? 'base' : 'pro';
}

export function getSubdomain(): string {
  const host = window.location.hostname;
  const parts = host.split('.');
  // 'www' is never a real tenant — treat it like the apex domain (demo).
  if (parts.length >= 3 && parts[0] !== 'www') return parts[0];
  return 'demo';
}

export function isAdminSubdomain(): boolean {
  return getSubdomain() === 'admin' || window.location.hostname === 'localhost';
}

export function isManagerPortal(): boolean {
  const h = window.location.hostname;
  return h === 'reportmirabad.trace-os.uz' || h === 'reportnukus.trace-os.uz';
}

export function getManagerTenant(): string {
  const h = window.location.hostname;
  if (h === 'reportnukus.trace-os.uz') return 'benedict-nukus';
  return 'benedict'; // reportmirabad.trace-os.uz + localhost fallback
}

export async function managerAuth(subdomain: string, pin: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/manager-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain, pin }),
    });
    const json = await r.json();
    return json.ok === true;
  } catch { return false; }
}

export interface ShiftReportAnalysis {
  fromAI: boolean;
  summary: string;
  positives: string[];
  concerns: string[];
  recommendations: string[];
  score: number | null;
}

export interface DailySnapshot {
  guest_count: number | null;
  cash_total: number | null;
  avg_check: number | null;
  weather_mirabad: string | null;
  weather_nukus: string | null;
}

export async function analyzeShiftReport(report: import('../types').ShiftReport, lang: Language = 'ru'): Promise<ShiftReportAnalysis> {
  const data = await post<ShiftReportAnalysis & { fromAI?: boolean; _error?: string }>(
    '/ai/shift-report-analysis',
    { report, lang },
  );
  console.log('[analyzeShiftReport] response:', JSON.stringify(data));
  if (!data.fromAI) throw new Error(data._error || 'AI unavailable');
  if (!data.summary && !data.positives?.length && !data.concerns?.length) {
    throw new Error('AI returned empty analysis');
  }
  return data;
}

export async function fetchDailySnapshot(subdomain: string, date: string): Promise<DailySnapshot | null> {
  try {
    const r = await fetch(`${BASE}/daily-snapshot?date=${date}`, {
      headers: { 'X-Tenant': subdomain },
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export interface ShiftTable {
  orderId: string;
  table: string;
  // "23 · 10:15" — a table number reused later in the same shift (a second
  // seating) gets its own row with a different label, so it isn't silently
  // merged with the first seating's feedback coverage.
  label: string;
  waiter: string | null;
  openTime: string;
  closeTime: string | null;
  status: 'open' | 'closed';
  minsOpen: number;
  needsAttention: boolean;
}

export interface ShiftTablesResult {
  tables: ShiftTable[];
  managerName: string | null;
}

export async function fetchShiftTables(subdomain: string, date: string, shift: 'morning' | 'evening'): Promise<ShiftTablesResult> {
  const empty: ShiftTablesResult = { tables: [], managerName: null };
  try {
    const r = await fetch(`${BASE}/shift-reports/tables?date=${date}&shift=${shift}`, {
      headers: { 'X-Tenant': subdomain },
    });
    if (!r.ok) return empty;
    const d = await r.json();
    return { tables: Array.isArray(d?.tables) ? d.tables : [], managerName: d?.managerName ?? null };
  } catch { return empty; }
}

// Downscale + re-encode in-browser before the file ever hits the network —
// phone photos are commonly 3-8MB, and the network trip is the slow part of
// "upload", not the server-side processing. HEIC (iPhone default) decodes
// fine via createImageBitmap on Safari/iOS; if a browser can't decode a
// format, this throws and we just fall back to uploading the original.
async function compressForUpload(file: File, maxWidth = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function uploadPhoto(subdomain: string, file: File): Promise<string> {
  const toSend = await compressForUpload(file);
  const fd = new FormData();
  fd.append('file', toSend);
  const r = await fetch(`${BASE}/upload`, { method: 'POST', headers: { 'X-Tenant': subdomain }, body: fd });
  if (!r.ok) throw new Error(`upload failed: ${r.status}`);
  const { url } = await r.json();
  return url as string;
}

// ── Checklists ────────────────────────────────────────────────────────────
// Three tiers, three auth shapes:
//   owner    — normal apiFetch (implicit tenant via Origin/Host, matches every
//              other traceApi.* namespace), no bearer token.
//   manager  — hosted on an owner-chosen arbitrary subdomain (portal_subdomain),
//              so the REAL tenant subdomain must be sent explicitly as X-Tenant
//              on every call, alongside the manager's bearer token.
//   employee — hosted on role-tenant.trace-os.uz; tenant subdomain is parsed
//              from the hostname (see parseEmployeeChecklistHost below) and
//              sent the same explicit way, alongside the employee's bearer token.
import {
  ChecklistRole, ChecklistEmployee, ChecklistManager, ChecklistWithItems,
  ChecklistTodayItem, ChecklistStats,
} from '../types';

// apiFetch alone doesn't check res.ok — a plain `.then(r => r.json())` on a
// 500 (e.g. tables not migrated yet) silently resolves to an error payload
// shaped nothing like the expected type, and reading a field off it later
// crashes the render. Every checklistApi read goes through this instead.
async function checkedFetch<T>(path: string, init: RequestInit = {}, branchIdOverride?: string): Promise<T> {
  const res = await apiFetch(path, init, branchIdOverride);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function scopedFetch<T>(
  path: string,
  tenantSubdomain: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant': tenantSubdomain,
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const checklistAuthApi = {
  managerLogin: (portalSubdomain: string, password: string) =>
    post<{ token: string; name: string; tenantSubdomain: string; branches: { subdomain: string; name: string }[] }>(
      '/checklist/manager-login',
      { portalSubdomain, password },
    ),
  // PINs are unique across every active employee in the tenant's
  // organization — the PIN alone identifies who's logging in, no name-picker
  // step. The token is scope-bound, not branch-bound; `branches` lists every
  // branch sharing that scope so the frontend can ask which one to open.
  employeeLogin: (tenantSubdomain: string, pin: string) =>
    fetch(`${BASE}/checklist/auth/employee/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant': tenantSubdomain },
      body: JSON.stringify({ pin }),
    }).then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<{ token: string; name: string; roleName: string; branches: { subdomain: string; name: string }[] }>;
    }),
};

// Owner surface — plain apiFetch (implicit tenant), used from the normal
// TRACE dashboard's Checklists tab. Owner routes trust tenantMiddleware alone.
export const checklistApi = {
  roles: {
    list: () => checkedFetch<ChecklistRole[]>('/checklist/roles'),
    create: (name: string) => post<ChecklistRole>('/checklist/roles', { name }),
    update: (id: string, patchBody: { name?: string; active?: boolean }) =>
      checkedFetch<ChecklistRole>(`/checklist/roles/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody) }),
    remove: (id: string) => checkedFetch<void>(`/checklist/roles/${id}`, { method: 'DELETE' }),
  },
  employees: {
    list: (roleId?: string) =>
      checkedFetch<ChecklistEmployee[]>(`/checklist/employees${roleId ? `?roleId=${roleId}` : ''}`),
    create: (name: string, roleId: string, pin: string) =>
      post<ChecklistEmployee>('/checklist/employees', { name, roleId, pin }),
    update: (id: string, patchBody: { name?: string; active?: boolean; pin?: string }) =>
      checkedFetch<ChecklistEmployee>(`/checklist/employees/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody) }),
    remove: (id: string) => checkedFetch<void>(`/checklist/employees/${id}`, { method: 'DELETE' }),
    posPreview: () => checkedFetch<{ groups: { posRoleName: string; names: string[] }[] }>('/checklist/employees/pos-preview'),
    import: (roleId: string, names: string[]) =>
      post<{ created: { name: string; pin: string }[] }>('/checklist/employees/import', { roleId, names }),
  },
  managers: {
    list: () => checkedFetch<ChecklistManager[]>('/checklist/managers'),
    create: (data: { name: string; password: string; portalSubdomain: string; roleIds: string[] }) =>
      post<ChecklistManager>('/checklist/managers', data),
    update: (id: string, data: Partial<{ name: string; password: string; portalSubdomain: string; active: boolean; roleIds: string[] }>) =>
      checkedFetch<ChecklistManager>(`/checklist/managers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    remove: (id: string) => checkedFetch<void>(`/checklist/managers/${id}`, { method: 'DELETE' }),
  },
  checklists: {
    list: (roleId?: string) =>
      checkedFetch<import('../types').Checklist[]>(`/checklist/checklists${roleId ? `?roleId=${roleId}` : ''}`),
    items: (id: string) => checkedFetch<ChecklistWithItems>(`/checklist/checklists/${id}/items`),
    // "Copy from another branch" — reads a sibling branch's checklists via
    // the existing X-Branch-Id override (same mechanism the Sales/Dashboard
    // branch switcher uses), no new backend endpoint needed.
    listForBranch: (roleId: string, branchId: string) =>
      checkedFetch<import('../types').Checklist[]>(`/checklist/checklists?roleId=${roleId}`, {}, branchId),
    itemsForBranch: (id: string, branchId: string) =>
      checkedFetch<ChecklistWithItems>(`/checklist/checklists/${id}/items`, {}, branchId),
    create: (data: { roleId: string; name: string; description?: string; items: { text: string; requiresPhoto?: boolean; itemType?: import('../types').ChecklistItemType; options?: string[] }[] }) =>
      post<ChecklistWithItems>('/checklist/checklists', data),
    update: (id: string, data: Partial<{ name: string; description: string; active: boolean; items: { text: string; requiresPhoto?: boolean; itemType?: import('../types').ChecklistItemType; options?: string[] }[] }>) =>
      checkedFetch<ChecklistWithItems>(`/checklist/checklists/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    remove: (id: string) => checkedFetch<void>(`/checklist/checklists/${id}`, { method: 'DELETE' }),
  },
  stats: (params: { roleId?: string; from?: string; to?: string } = {}) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return checkedFetch<ChecklistStats>(`/checklist/stats${q ? `?${q}` : ''}`);
  },
  history: (date: string, roleId?: string) => {
    const q = new URLSearchParams({ date, ...(roleId ? { roleId } : {}) }).toString();
    return checkedFetch<import('../types').ChecklistHistoryRow[]>(`/checklist/history?${q}`);
  },
  auditLog: (limit?: number) =>
    checkedFetch<import('../types').ChecklistAuditLogEntry[]>(`/checklist/audit-log${limit ? `?limit=${limit}` : ''}`),
};

// Manager portal surface — same shape as checklistApi.checklists/stats, but
// explicit tenant+token since the manager isn't on the tenant's real subdomain.
export const checklistManagerApi = {
  checklists: {
    list: (tenantSubdomain: string, token: string, roleId?: string) =>
      scopedFetch<import('../types').Checklist[]>(`/checklist-manager/checklists${roleId ? `?roleId=${roleId}` : ''}`, tenantSubdomain, token),
    items: (tenantSubdomain: string, token: string, id: string) =>
      scopedFetch<ChecklistWithItems>(`/checklist-manager/checklists/${id}/items`, tenantSubdomain, token),
    create: (tenantSubdomain: string, token: string, data: { roleId: string; name: string; description?: string; items: { text: string; requiresPhoto?: boolean; itemType?: import('../types').ChecklistItemType; options?: string[] }[] }) =>
      scopedFetch<ChecklistWithItems>('/checklist-manager/checklists', tenantSubdomain, token, { method: 'POST', body: JSON.stringify(data) }),
    update: (tenantSubdomain: string, token: string, id: string, data: Partial<{ name: string; description: string; active: boolean; items: { text: string; requiresPhoto?: boolean; itemType?: import('../types').ChecklistItemType; options?: string[] }[] }>) =>
      scopedFetch<ChecklistWithItems>(`/checklist-manager/checklists/${id}`, tenantSubdomain, token, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (tenantSubdomain: string, token: string, id: string) =>
      scopedFetch<void>(`/checklist-manager/checklists/${id}`, tenantSubdomain, token, { method: 'DELETE' }),
  },
  roles: (tenantSubdomain: string, token: string) =>
    scopedFetch<ChecklistRole[]>('/checklist-manager/roles', tenantSubdomain, token), // scoped server-side to this manager's assigned roles; role CRUD stays owner-only
  employees: {
    list: (tenantSubdomain: string, token: string, roleId?: string) =>
      scopedFetch<ChecklistEmployee[]>(`/checklist-manager/employees${roleId ? `?roleId=${roleId}` : ''}`, tenantSubdomain, token),
    create: (tenantSubdomain: string, token: string, name: string, roleId: string, pin: string) =>
      scopedFetch<ChecklistEmployee>('/checklist-manager/employees', tenantSubdomain, token, { method: 'POST', body: JSON.stringify({ name, roleId, pin }) }),
    update: (tenantSubdomain: string, token: string, id: string, patchBody: { name?: string; active?: boolean; pin?: string }) =>
      scopedFetch<ChecklistEmployee>(`/checklist-manager/employees/${id}`, tenantSubdomain, token, { method: 'PATCH', body: JSON.stringify(patchBody) }),
    remove: (tenantSubdomain: string, token: string, id: string) =>
      scopedFetch<void>(`/checklist-manager/employees/${id}`, tenantSubdomain, token, { method: 'DELETE' }),
    posPreview: (tenantSubdomain: string, token: string) =>
      scopedFetch<{ groups: { posRoleName: string; names: string[] }[] }>('/checklist-manager/employees/pos-preview', tenantSubdomain, token),
    import: (tenantSubdomain: string, token: string, roleId: string, names: string[]) =>
      scopedFetch<{ created: { name: string; pin: string }[] }>('/checklist-manager/employees/import', tenantSubdomain, token, { method: 'POST', body: JSON.stringify({ roleId, names }) }),
  },
  stats: (tenantSubdomain: string, token: string, params: { roleId?: string; from?: string; to?: string } = {}) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return scopedFetch<ChecklistStats>(`/checklist-manager/stats${q ? `?${q}` : ''}`, tenantSubdomain, token);
  },
  history: (tenantSubdomain: string, token: string, date: string, roleId?: string) => {
    const q = new URLSearchParams({ date, ...(roleId ? { roleId } : {}) }).toString();
    return scopedFetch<import('../types').ChecklistHistoryRow[]>(`/checklist-manager/history?${q}`, tenantSubdomain, token);
  },
};

// Employee portal surface.
export const checklistEmployeeApi = {
  today: (tenantSubdomain: string, token: string) =>
    scopedFetch<{ date: string; checklists: ChecklistTodayItem[] }>('/checklist/completions/today', tenantSubdomain, token),
  toggle: (tenantSubdomain: string, token: string, itemId: string, done: boolean, photoUrl?: string, answerValue?: import('../types').ChecklistAnswerValue) =>
    scopedFetch(`/checklist/completions/${itemId}`, tenantSubdomain, token, { method: 'PATCH', body: JSON.stringify({ done, photoUrl, answerValue }) }),
};

// Manager builder portal convention: owner sets portal_subdomain to
// "manager-<anything>" (see the Managers tab placeholder) and that whole
// first label is sent back to the login endpoint verbatim — checked before
// parseEmployeeChecklistHost below, since "manager-benedict" would otherwise
// also match the generic role-tenant split-on-first-hyphen pattern.
// "manager" as its own hyphen-delimited segment, anywhere in the subdomain —
// not just a leading "manager-" prefix. Owners naturally name these things
// "service-manager", "night-manager-mirabad", etc; requiring the word at the
// very start meant "service-manager.trace-os.uz" never even reached the
// manager login screen (fell through to the normal tenant login instead,
// which is what actually produced the confusing "incorrect password").
export function isChecklistManagerHost(): boolean {
  return /(^|-)manager(-|$)/.test(window.location.hostname.split('.')[0]);
}

export function getChecklistManagerPortalSubdomain(): string {
  return window.location.hostname.split('.')[0];
}

// checklist-role-tenant.trace-os.uz → { roleSlug, tenantSubdomain }.
// MUST carry the reserved "checklist-" prefix — a bare "role-tenant" pattern
// (e.g. splitting on the first hyphen) is unsafe: real tenant subdomains can
// contain hyphens themselves (e.g. "benedict-nukus"), which would otherwise
// get misrouted into this portal and break the owner dashboard for that
// tenant. The prefix guarantees no real tenant subdomain ever matches, the
// same way the reserved "manager" segment does for isChecklistManagerHost above.
export function parseEmployeeChecklistHost(): { roleSlug: string; tenantSubdomain: string } | null {
  const host = window.location.hostname;
  const parts = host.split('.');
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (!sub.startsWith('checklist-')) return null;
  const rest = sub.slice('checklist-'.length);
  const dashIdx = rest.indexOf('-');
  if (dashIdx <= 0) return null;
  return { roleSlug: rest.slice(0, dashIdx), tenantSubdomain: rest.slice(dashIdx + 1) };
}

export async function managerShiftReportCreate(
  subdomain: string,
  data: Omit<import('../types').ShiftReport, 'id' | 'tenant_id' | 'created_at'>
): Promise<import('../types').ShiftReport> {
  const r = await fetch(`${BASE}/shift-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant': subdomain },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
