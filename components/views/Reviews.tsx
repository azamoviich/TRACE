// Отзывы — redesigned per TRACE-mockups/reviews.html (styles/rd/reviews.css).
import React, { useState, useEffect, useRef } from 'react';
import { Star, MessageSquare, RefreshCw, Sparkles, TrendingUp, Copy, Check, ClipboardList, QrCode, Calendar as CalendarIcon, X, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Card } from '../ui/Card';
import { Language } from '../../types';
import { traceApi, getSubdomain, isDemoTenant, getTenantPlan, demoReviewRows, demoReviewStats, branchHeaders } from '../../services/traceApi';
import { ShiftReports } from './ShiftReports';
import { Waiters } from './Waiters';
import { ProLock } from '../ui/ProLock';
import { DateRangePicker } from '../ui/DateRangePicker';
import { Skel, AiMeta, Pop, Opt } from '../rd/ui';

const BASE = import.meta.env.VITE_API_URL || '/api';

interface ReviewRow {
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

interface Stats {
  total: number;
  avg_rating: number | null;
  this_week: number;
  positive_pct: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  'Google': 'text-blue-400',
  'Yandex': 'text-red-400',
  'Yandex Карты': 'text-red-400',
  '2GIS': 'text-green-400',
  'TripAdvisor': 'text-emerald-400',
  'Rahmat': 'text-primary',
};

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-muted text-[13px]">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={11}
          className={i <= rating ? 'text-yellow-400' : 'text-border'}
          fill={i <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}

export const Reviews: React.FC<{ lang: Language; onContextReady?: (ctx: string) => void }> = ({ lang, onContextReady }) => {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const sub = getSubdomain();
  const isBenedict = sub === 'benedict' || sub === 'benedict-nukus';
  const [mainTab, setMainTab] = useState<'reviews' | 'shifts' | 'waiters'>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'shifts' || t === 'waiters' ? t : 'reviews';
  });
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  // Unfiltered snapshot (always the "all platforms" fetch) — used for the
  // platform filter buttons and the sidebar breakdown, which both need to
  // show every platform even while `reviews` itself is server-filtered
  // down to one platform for the main list.
  const [allReviews, setAllReviews] = useState<ReviewRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'rating_desc' | 'rating_asc'>('newest');
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [replyMap, setReplyMap] = useState<Record<string, { text: string; loading: boolean; copied: boolean }>>({});
  const [trends, setTrends] = useState<{ trends?: { topic: string; change: string; pctChange: number }[]; summary?: string; alertLevel?: string } | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState(false);

  const buildContext = (rv: ReviewRow[], st: Stats | null) => {
    if (!onContextReady || rv.length === 0) return;
    const pos = rv.filter(r => r.sentiment === 'positive').length;
    const neg = rv.filter(r => r.sentiment === 'negative').length;
    const neu = rv.filter(r => r.sentiment === 'neutral').length;
    const withRating = rv.filter(r => r.rating != null);
    const avgRating = withRating.length > 0
      ? (withRating.reduce((s, r) => s + r.rating!, 0) / withRating.length).toFixed(1)
      : 'н/д';
    const byPlatform = rv.reduce<Record<string, { count: number; sum: number; rCount: number }>>((acc, r) => {
      if (!acc[r.platform]) acc[r.platform] = { count: 0, sum: 0, rCount: 0 };
      acc[r.platform].count++;
      if (r.rating != null) { acc[r.platform].sum += r.rating; acc[r.platform].rCount++; }
      return acc;
    }, {});
    const platformLines = Object.entries(byPlatform)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([p, d]) => `  ${p}: ${d.count} отзывов${d.rCount > 0 ? `, рейтинг ${(d.sum / d.rCount).toFixed(1)}` : ''}`)
      .join('\n');
    const negReviews = rv.filter(r => r.sentiment === 'negative').slice(0, 10);
    const negLines = negReviews.map(r =>
      `  [${r.platform}] ${r.author} (${r.rating ?? '?'}★, ${r.date}): "${r.text.slice(0, 200)}"`
    ).join('\n');
    const posReviews = rv.filter(r => r.sentiment === 'positive').slice(0, 5);
    const posLines = posReviews.map(r =>
      `  [${r.platform}] ${r.author} (${r.rating ?? '?'}★, ${r.date}): "${r.text.slice(0, 150)}"`
    ).join('\n');
    const recent = [...rv].sort((a, b) => (b.date || b.created_at).localeCompare(a.date || a.created_at)).slice(0, 5);
    const recentLines = recent.map(r =>
      `  ${r.date} [${r.platform}] ${r.author} (${r.sentiment}, ${r.rating ?? '?'}★): "${r.text.slice(0, 150)}"`
    ).join('\n');
    onContextReady(
      `Раздел: Отзывы гостей\n` +
      `Всего отзывов: ${rv.length}` + (st ? ` | Средний рейтинг: ${st.avg_rating?.toFixed(1) ?? avgRating}★ | За неделю: ${st.this_week} | Позитивных: ${st.positive_pct}%` : '') + '\n' +
      `Тональность: позитивных ${pos}, негативных ${neg}, нейтральных ${neu}\n` +
      `\nПо платформам:\n${platformLines}\n` +
      `\nПоследние 5 отзывов:\n${recentLines}\n` +
      `\nНегативные отзывы (до 10):\n${negLines || '  нет'}\n` +
      `\nЛучшие отзывы (до 5):\n${posLines || '  нет'}`
    );
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (isDemoTenant()) {
        const rv = demoReviewRows();
        const st = demoReviewStats();
        setReviews(rv as ReviewRow[]);
        setAllReviews(rv as ReviewRow[]);
        setStats(st);
        buildContext(rv as ReviewRow[], st);
        setLoading(false);
        return;
      }
      const safeJson = (r: Response) => r.ok ? r.json().catch(() => null) : Promise.resolve(null);
      const headers = { 'X-Tenant': sub, ...branchHeaders() };
      // Server-side platform filter — the API's 200-row window is sorted by
      // review_date across ALL platforms, so client-filtering that shared
      // window after the fact starves any platform with fewer/older reviews
      // than the top 200 combined (e.g. clicking "2GIS" shows almost
      // nothing even though 2GIS reviews exist, because they fell outside
      // the 200-row cut dominated by a busier platform).
      const platformParam = filter !== 'all' ? `&platform=${encodeURIComponent(filter)}` : '';
      const fetches = [
        fetch(`${BASE}/reviews?limit=200${platformParam}`, { headers }).then(safeJson),
        fetch(`${BASE}/reviews/stats`, { headers }).then(safeJson),
      ];
      // Also fetch the unfiltered set when a platform filter is active, so
      // the filter buttons/sidebar breakdown still show every platform.
      if (filter !== 'all') fetches.push(fetch(`${BASE}/reviews?limit=200`, { headers }).then(safeJson));
      const [rv, st, rvAll] = await Promise.all(fetches);
      const rvArr: ReviewRow[] = Array.isArray(rv) ? rv : [];
      const stObj: Stats | null = st?.total !== undefined ? st : null;
      const allArr: ReviewRow[] = filter !== 'all' ? (Array.isArray(rvAll) ? rvAll : []) : rvArr;
      setReviews(rvArr);
      setAllReviews(allArr);
      setStats(stObj);
      buildContext(allArr, stObj);
    } catch {
      setError(ru ? 'Не удалось загрузить отзывы' : isUz ? "Sharhlarni yuklab bo'lmadi" : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const generateReply = (review: ReviewRow) => {
    setReplyMap(m => ({ ...m, [review.id]: { text: '', loading: true, copied: false } }));
    traceApi.ai.reviewReply(review.text, review.rating, review.platform, lang)
      .then(r => {
        const text = r.fromAI && r.reply ? r.reply : (ru ? 'Не удалось сгенерировать ответ. Попробуйте ещё раз.' : isUz ? 'Javob yaratib bo\'lmadi. Qaytadan urining.' : 'Could not generate reply. Please try again.');
        setReplyMap(m => ({ ...m, [review.id]: { text, loading: false, copied: false } }));
      })
      .catch(() => setReplyMap(m => ({ ...m, [review.id]: { text: ru ? 'Ошибка AI. Попробуйте позже.' : isUz ? 'AI xatosi. Keyinroq urining.' : 'AI error. Try again later.', loading: false, copied: false } })));
  };

  const copyReply = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setReplyMap(m => ({ ...m, [id]: { ...m[id], copied: true } }));
      setTimeout(() => setReplyMap(m => ({ ...m, [id]: { ...m[id], copied: false } })), 2000);
    });
  };

  const loadTrends = () => {
    setTrendsLoading(true);
    setTrendsError(false);
    traceApi.ai.reviewTrends(lang)
      .then(r => { if (r.fromAI) setTrends(r); else setTrendsError(true); })
      .catch(() => setTrendsError(true))
      .finally(() => setTrendsLoading(false));
  };

  const platforms = [...new Set(allReviews.map(r => r.platform))];
  // reviews is already server-filtered by platform (see load()) — only
  // sentiment/date/sort remain to apply client-side. Filtering/sorting by
  // review_date (r.date) here, not created_at (ingestion time) — those two
  // can diverge (a review from months ago ingested today), which used to
  // make the date-range filter and "newest/oldest" sort disagree with the
  // "this week" stat (computed server-side from review_date).
  const filtered = reviews
    .filter(r => sentimentFilter === 'all' || r.sentiment === sentimentFilter)
    .filter(r => {
      if (!dateRange) return true;
      const d = (r.date || r.created_at || '').slice(0, 10);
      return d >= dateRange.from && d <= dateRange.to;
    })
    .sort((a, b) => {
      const ad = a.date || a.created_at, bd = b.date || b.created_at;
      if (sortMode === 'newest') return bd.localeCompare(ad);
      if (sortMode === 'oldest') return ad.localeCompare(bd);
      if (sortMode === 'rating_desc') return (b.rating ?? -1) - (a.rating ?? -1);
      return (a.rating ?? 999) - (b.rating ?? 999);
    });
  const hasActiveFilters = filter !== 'all' || sentimentFilter !== 'all' || dateRange !== null || sortMode !== 'newest';
  const resetFilters = () => { setFilter('all'); setSentimentFilter('all'); setDateRange(null); setSortMode('newest'); };

  const negCount = reviews.filter(r => r.sentiment === 'negative').length;
  const ratingDist = [5, 4, 3, 2, 1].map(s => [s, allReviews.filter(r => r.rating === s).length] as const);
  const maxDist = Math.max(1, ...ratingDist.map(d => d[1]));
  const platStats = platforms.map(p => {
    const list = allReviews.filter(r => r.platform === p);
    const rated = list.filter(r => r.rating != null);
    return { p, n: list.length, avg: rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : null };
  }).sort((a, b) => b.n - a.n);
  const maxPlat = Math.max(1, ...platStats.map(p => p.n));
  const sentCount = (k: 'all' | 'positive' | 'negative' | 'neutral') => reviews.filter(r => k === 'all' || r.sentiment === k).length;
  const lastDays = dateRange ? Math.round((Date.now() - Date.parse(dateRange.from)) / 86400000) : 0;
  const setDays = (d: number) => {
    if (!d) { setDateRange(null); return; }
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - (d - 1) * 86400000).toISOString().slice(0, 10);
    setDateRange({ from, to });
  };
  const ago = (iso: string) => {
    const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
    if (!isFinite(d)) return iso;
    return d <= 0 ? (ru ? 'сегодня' : isUz ? 'bugun' : 'today') : d === 1 ? (ru ? 'вчера' : isUz ? 'kecha' : 'yesterday') : d < 30 ? (ru ? `${d} дн. назад` : isUz ? `${d} kun oldin` : `${d} days ago`) : new Date(iso).toLocaleDateString(ru ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const Stars = ({ r }: { r: number | null }) => r ? (
    <span className="stars" aria-label={`${r} / 5`}>{[1, 2, 3, 4, 5].map(i => <i key={i} className={`${i <= r ? 'ph-fill' : 'ph'} ph-star`} aria-hidden="true" />)}<b>{r}</b></span>
  ) : <span className="stars faint">—</span>;
  const tabs: { id: typeof mainTab; label: string; n?: string }[] = [
    { id: 'reviews', label: ru ? 'Отзывы гостей' : isUz ? 'Mehmonlar sharhlari' : 'Guest reviews', n: negCount ? (ru ? `${negCount} негативных` : isUz ? `${negCount} salbiy` : `${negCount} negative`) : undefined },
    { id: 'shifts', label: ru ? 'Отчёты смен' : isUz ? 'Smena hisobotlari' : 'Shift reports' },
    { id: 'waiters', label: ru ? 'QR официантов' : isUz ? 'Ofitsiant QR' : 'Waiter QR' },
  ];
  const T = (a: string, b: string, c: string) => ru ? a : isUz ? c : b;
  const trendsState = trendsLoading ? 'loading' : trends ? 'done' : 'empty';

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>{T('Отзывы', 'Reviews', 'Sharhlar')}</h1>
          <div className="sub">{T('Google, Яндекс Карты, 2ГИС и TripAdvisor, собираем каждый день.', 'Google, Yandex Maps, 2GIS and TripAdvisor, collected daily.', "Google, Yandex Xaritalar, 2GIS va TripAdvisor, har kuni yig'iladi.")}
            {' '}<button className="link" type="button" onClick={load}>{loading ? T('Обновляем…', 'Refreshing…', 'Yangilanmoqda…') : T('Обновить', 'Refresh', 'Yangilash')}</button></div>
        </div>
      </div>

      {isBenedict && (
        <nav className="tabs rise" role="tablist" aria-label={T('Разделы', 'Sections', "Bo'limlar")} style={{ animationDelay: '.04s' }}>
          {tabs.map(t => <button key={t.id} role="tab" aria-selected={mainTab === t.id} onClick={() => setMainTab(t.id)}>{t.label}{t.n && <span className="n">{t.n}</span>}</button>)}
        </nav>
      )}

      {isBenedict && mainTab === 'shifts' && <div className="pane rise rd-legacy-pane"><ShiftReports lang={lang} /></div>}
      {isBenedict && mainTab === 'waiters' && <div className="pane rise rd-legacy-pane"><Waiters lang={lang} /></div>}

      {(!isBenedict || mainTab === 'reviews') && (
        <div className="pane rise" role="tabpanel" style={{ animationDelay: '.08s' }}>
          <section className="strip" aria-label={T('Итоги отзывов', 'Review totals', 'Sharhlar yakuni')}>
            <button type="button" aria-pressed={sortMode === 'rating_asc'} onClick={() => setSortMode(m => m === 'rating_asc' ? 'newest' : 'rating_asc')}>
              <div className="s-l">{T('Средняя оценка', 'Average rating', "O'rtacha baho")}<span className="hint">{T('сначала низкие', 'lowest first', 'avval past')}</span></div>
              <div className="s-v">{stats?.avg_rating ? stats.avg_rating.toFixed(1).replace('.', ',') : '—'}<small>{T('из 5', 'of 5', '5 dan')}</small></div>
              <div className="s-d">{T('по всем площадкам', 'across all platforms', 'barcha platformalar')}</div>
            </button>
            <button type="button" aria-pressed={false} onClick={resetFilters}>
              <div className="s-l">{T('Всего отзывов', 'Total reviews', 'Jami sharhlar')}{hasActiveFilters && <span className="hint">{T('сбросить', 'reset', 'tozalash')}</span>}</div>
              <div className="s-v">{stats ? stats.total.toLocaleString('ru-RU') : '—'}</div>
              <div className="s-d">{stats ? T(`+${stats.this_week} за эту неделю`, `+${stats.this_week} this week`, `shu hafta +${stats.this_week}`) : ''}</div>
            </button>
            <button type="button" aria-pressed={sentimentFilter === 'positive'} onClick={() => setSentimentFilter(f => f === 'positive' ? 'all' : 'positive')}>
              <div className="s-l">{T('Позитивных', 'Positive', 'Ijobiy')}<span className="hint">{T('показать', 'show', "ko'rsatish")}</span></div>
              <div className="s-v">{stats ? stats.positive_pct : '—'}<small>%</small></div>
              <div className="s-d">{T('по тону текста', 'by the tone of text', 'matn ohangi')}</div>
            </button>
            <button type="button" aria-pressed={sentimentFilter === 'negative'} onClick={() => setSentimentFilter(f => f === 'negative' ? 'all' : 'negative')}>
              <div className="s-l">{T('Негативных', 'Negative', 'Salbiy')}<span className="hint">{T('показать', 'show', "ko'rsatish")}</span></div>
              <div className="s-v neg">{negCount}</div>
              <div className="s-d">{T('стоит ответить', 'worth replying to', 'javob berish kerak')}</div>
            </button>
          </section>

          {getTenantPlan() === 'base' ? (
            <section className="ai"><div className="ai-head"><h2>{T('Тренды отзывов', 'Review trends', 'Sharhlar tendensiyasi')}</h2></div>
              <p className="ai-desc"><i className="ph ph-lock-simple" aria-hidden="true" /> {T('Доступно в тарифе Pro: что изменилось в тоне и темах отзывов за 8 недель.', 'Available on Pro: what changed in review tone and topics over 8 weeks.', "Pro tarifida: 8 haftadagi o'zgarishlar.")}</p></section>
          ) : (
            <section className="ai" data-state={trendsState} aria-labelledby="h-tr">
              <div className="ai-head"><h2 id="h-tr">{T('Тренды отзывов', 'Review trends', 'Sharhlar tendensiyasi')}</h2>{trendsState === 'done' && <AiMeta lang={lang} onRerun={loadTrends} />}</div>
              {trendsState === 'empty' && <div className="st-empty"><p className="ai-desc">{T('Что изменилось в тоне и темах отзывов за 8 недель: о чём стали писать чаще, что ушло.', 'What changed in review tone and topics over 8 weeks: what people write about more, what faded.', "8 hafta ichida sharhlar ohangi va mavzularida nima o'zgardi.")}{trendsError && <span className="rd-err" style={{ display: 'block' }}>{T('Не получилось. Попробуйте позже.', "Didn't work. Try later.", "Bo'lmadi. Keyinroq urinib ko'ring.")}</span>}</p>
                <button className="btn solid" type="button" onClick={loadTrends}><i className="ph ph-sparkle" aria-hidden="true" />{T('Найти тренды', 'Find trends', 'Tendensiyalarni topish')}</button></div>}
              {trendsState === 'loading' && <div className="st-loading" aria-live="polite"><p className="ai-wait">{T(`Читаем отзывы за 8 недель…`, 'Reading 8 weeks of reviews…', "8 haftalik sharhlarni o'qiyapmiz…")}</p><Skel lines={['w9', 'w7', 'w5']} /></div>}
              {trendsState === 'done' && trends && <div className="st-done">
                {trends.alertLevel === 'high' && <p className="alarm"><i className="ph ph-warning" aria-hidden="true" />{T('Тревожный сигнал', 'Warning sign', 'Ogohlantirish')}</p>}
                {trends.summary && <p className="sum">{trends.summary}</p>}
                {!!trends.trends?.length && <ul className="topics">{trends.trends.map((t, i) => (
                  <li key={i}><span>{t.topic}</span><span className={`ch ${t.pctChange > 0 ? 'neg' : 'pos'}`}>{t.pctChange > 0 ? '+' : ''}{t.pctChange}%</span><small>{t.change}</small></li>
                ))}</ul>}
              </div>}
            </section>
          )}

          <div className="rv-grid">
            <section aria-labelledby="h-rv">
              <div className="sec-head" style={{ marginBottom: 12 }}><h2 id="h-rv">{T('Отзывы', 'Reviews', 'Sharhlar')}</h2><span className="sec-note">{T(`Показано ${filtered.length}`, `Showing ${filtered.length}`, `${filtered.length} ta`)}{filter !== 'all' ? `, ${filter}` : ''}</span></div>
              <div className="tools">
                <div className="seg-scroll"><div className="seg small" role="group" aria-label={T('Тон', 'Tone', 'Ohang')}>
                  {([['all', T('Все', 'All', 'Barchasi')], ['positive', T('Позитивные', 'Positive', 'Ijobiy')], ['negative', T('Негативные', 'Negative', 'Salbiy')], ['neutral', T('Нейтральные', 'Neutral', 'Neytral')]] as const).map(([k, l]) => (
                    <button key={k} aria-pressed={sentimentFilter === k} onClick={() => setSentimentFilter(k)}>{l}<span className="n">{sentCount(k)}</span></button>
                  ))}
                </div></div>
                <span className="spacer" />
                <span className="sel"><select value={sortMode} onChange={e => setSortMode(e.target.value as typeof sortMode)} aria-label={T('Сортировка', 'Sort', 'Saralash')}>
                  <option value="newest">{T('Сначала новые', 'Newest first', 'Avval yangi')}</option>
                  <option value="oldest">{T('Сначала старые', 'Oldest first', 'Avval eski')}</option>
                  <option value="rating_desc">{T('Сначала высокие оценки', 'Highest rating first', 'Avval yuqori baho')}</option>
                  <option value="rating_asc">{T('Сначала низкие оценки', 'Lowest rating first', 'Avval past baho')}</option>
                </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span>
                <Pop right btnClass="btn" label={<><i className="ph ph-calendar-blank" aria-hidden="true" /><span>{!dateRange ? T('Любая дата', 'Any date', 'Istalgan sana') : lastDays <= 8 ? T('За 7 дней', 'Last 7 days', '7 kun') : lastDays <= 31 ? T('За 30 дней', 'Last 30 days', '30 kun') : T('За 3 месяца', 'Last 3 months', '3 oy')}</span></>}>
                  {close => <>
                    <div className="pop-title">{T('Показать отзывы', 'Show reviews', "Sharhlarni ko'rsatish")}</div>
                    {([[0, T('За всё время', 'All time', 'Butun vaqt')], [7, T('За 7 дней', 'Last 7 days', '7 kun')], [30, T('За 30 дней', 'Last 30 days', '30 kun')], [90, T('За 3 месяца', 'Last 3 months', '3 oy')]] as const).map(([d, l]) => (
                      <Opt key={d} checked={d === 0 ? !dateRange : !!dateRange && Math.abs(lastDays - (d - 1)) <= 1} onClick={() => { setDays(d); close(); }}>{l}</Opt>
                    ))}
                  </>}
                </Pop>
              </div>
              {loading && <Skel lines={['w9', 'w7', 'w9', 'w5', 'w9', 'w7']} />}
              {!loading && error && <p className="rd-err">{error}</p>}
              {!loading && !error && filtered.length === 0 && <p className="empty">{T('Нет отзывов под эти фильтры', 'No reviews match these filters', "Bu filtrlarga sharh yo'q")}</p>}
              {!loading && filtered.map(review => {
                const rep = replyMap[review.id];
                const st = rep?.loading ? 'loading' : rep?.text ? 'done' : 'empty';
                return (
                  <article className="rv" key={review.id}>
                    <div className="rv-top"><span className="ava" aria-hidden="true">{review.author[0]?.toUpperCase()}</span>
                      <div className="rv-who"><b>{review.author}</b><div className="meta">{[review.platform, ago(review.date || review.created_at), review.branch].filter(Boolean).join(', ')}</div></div>
                      <Stars r={review.rating} /></div>
                    <p className="txt">{review.text}</p>
                    <div className="reply" data-state={st}>
                      <div className="rv-foot" style={{ marginLeft: 0 }}>
                        <span className={`sent ${review.sentiment === 'positive' ? 'p' : review.sentiment === 'negative' ? 'n' : ''}`}>{review.sentiment === 'positive' ? T('Позитивный', 'Positive', 'Ijobiy') : review.sentiment === 'negative' ? T('Негативный', 'Negative', 'Salbiy') : T('Нейтральный', 'Neutral', 'Neytral')}</span>
                        {st === 'empty' && <button className="tlink" type="button" style={{ margin: 0 }} onClick={() => generateReply(review)}><i className="ph ph-sparkle" aria-hidden="true" />{T('Написать ответ', 'Draft a reply', 'Javob yozish')}</button>}
                      </div>
                      {st === 'loading' && <div className="st-loading"><p className="ai-wait">{T('Пишем ответ от имени ресторана…', 'Writing a reply on behalf of the restaurant…', 'Restoran nomidan javob yozyapmiz…')}</p><Skel lines={['w9', 'w7']} /></div>}
                      {st === 'done' && <div className="st-done"><p>{rep!.text}</p>
                        <div className="r-acts"><span className="faint">{T('Черновик, проверьте перед отправкой', 'Draft, check before sending', 'Qoralama, yuborishdan oldin tekshiring')}</span>
                          <button className="tlink" type="button" onClick={() => copyReply(review.id, rep!.text)}><i className={`ph ${rep!.copied ? 'ph-check' : 'ph-copy'}`} aria-hidden="true" />{rep!.copied ? T('Скопировано', 'Copied', 'Nusxalandi') : T('Копировать', 'Copy', 'Nusxalash')}</button>
                          <button className="tlink" type="button" onClick={() => generateReply(review)}>{T('Другой вариант', 'Another version', 'Boshqa variant')}</button></div></div>}
                    </div>
                  </article>
                );
              })}
            </section>
            <aside className="side">
              <section className="card-ph" aria-labelledby="h-pl"><h3 id="h-pl">{T('По площадкам', 'By platform', "Platformalar bo'yicha")}</h3>
                {platStats.length === 0 ? <p className="rd-empty">{T('Нет данных', 'No data', "Ma'lumot yo'q")}</p> : <ul className="plat">
                  <li><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}><span className="nm">{T('Все площадки', 'All platforms', 'Barcha platformalar')}</span><span>{stats?.avg_rating ? stats.avg_rating.toFixed(1).replace('.', ',') : ''}</span><span className="sub2">{allReviews.length} {T('отзывов', 'reviews', 'sharh')}</span><span /></button></li>
                  {platStats.map(p => (
                    <li key={p.p}><button type="button" aria-pressed={filter === p.p} onClick={() => setFilter(p.p)}><span className="nm">{p.p}</span><span>{p.avg != null ? p.avg.toFixed(1).replace('.', ',') : ''}</span><span className="sub2">{p.n} {T('отзывов', 'reviews', 'sharh')}</span><span /><span className="bar"><i style={{ width: `${p.n / maxPlat * 100}%` }} /></span></button></li>
                  ))}
                </ul>}
              </section>
              <section className="card-ph" aria-labelledby="h-ds"><h3 id="h-ds">{T('Оценки', 'Ratings', 'Baholar')}</h3>
                <ul className="dist">{ratingDist.map(([s, n]) => (
                  <li key={s}><span>{s}<i className="ph-fill ph-star" style={{ fontSize: 11, marginLeft: 2 }} aria-hidden="true" /></span><span className="bar"><i style={{ width: `${n / maxDist * 100}%` }} /></span><span className="c">{n}</span></li>
                ))}</ul>
              </section>
            </aside>
          </div>
        </div>
      )}
    </>
  );
};
