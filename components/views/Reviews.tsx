import React, { useState, useEffect, useRef } from 'react';
import { Star, MessageSquare, RefreshCw, Sparkles, TrendingUp, Copy, Check, ClipboardList, QrCode, Calendar as CalendarIcon, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { Language } from '../../types';
import { traceApi, getSubdomain, isDemoTenant, getTenantPlan, demoReviewRows, demoReviewStats, branchHeaders } from '../../services/traceApi';
import { ShiftReports } from './ShiftReports';
import { Waiters } from './Waiters';
import { ProLock } from '../ui/ProLock';
import { DateRangePicker } from '../ui/DateRangePicker';

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

  return (
    <div className="space-y-5 pb-24 animate-fade-in">

      {/* Benedict: tab switcher */}
      {isBenedict && (
        <div className="flex gap-2">
          <button
            onClick={() => setMainTab('reviews')}
            className={`px-3 py-2 text-[13px] rounded-lg transition-colors font-medium flex items-center gap-1.5 ${mainTab === 'reviews' ? 'bg-primary text-white' : 'bg-card border border-border text-muted hover:text-text'}`}
          >
            <MessageSquare size={13} />
            {ru ? 'Отзывы гостей' : isUz ? 'Mehmonlar sharhlari' : 'Guest Reviews'}
          </button>
          <button
            onClick={() => setMainTab('shifts')}
            className={`px-3 py-2 text-[13px] rounded-lg transition-colors font-medium flex items-center gap-1.5 ${mainTab === 'shifts' ? 'bg-primary text-white' : 'bg-card border border-border text-muted hover:text-text'}`}
          >
            <ClipboardList size={13} />
            {ru ? 'Отчёты смен' : isUz ? 'Smena hisobotlari' : 'Shift Reports'}
          </button>
          <button
            onClick={() => setMainTab('waiters')}
            className={`px-3 py-2 text-[13px] rounded-lg transition-colors font-medium flex items-center gap-1.5 ${mainTab === 'waiters' ? 'bg-primary text-white' : 'bg-card border border-border text-muted hover:text-text'}`}
          >
            <QrCode size={13} />
            {ru ? 'QR официантов' : isUz ? 'Ofitsiant QR' : 'Waiter QR'}
          </button>
        </div>
      )}

      {/* Shift reports panel (Benedict only) */}
      {isBenedict && mainTab === 'shifts' && <ShiftReports lang={lang} />}

      {/* Waiter QR codes panel (Benedict only) */}
      {isBenedict && mainTab === 'waiters' && <Waiters lang={lang} />}

      {/* Guest reviews — hidden when shift/waiters tab active */}
      {(!isBenedict || mainTab === 'reviews') && <>

      {/* ── REVIEW TREND ANALYSIS ── */}
      {getTenantPlan() === 'base' ? (
        <ProLock
          lang={lang}
          title={ru ? 'Тренды отзывов' : isUz ? 'Sharhlar tendensiyasi' : 'Review trends'}
          description={ru ? 'AI-анализ динамики отзывов, тональности и ключевых жалоб' : isUz ? 'Sharhlar dinamikasi, tonal\'ligi va asosiy shikoyatlarning AI tahlili' : 'AI analysis of review dynamics, sentiment, and top complaints'}
        />
      ) : (
      <Card>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <TrendingUp size={13} className="text-primary" />
            <p className="text-[13px] text-muted font-medium">
              {ru ? 'Тренды отзывов' : isUz ? 'Sharhlar tendensiyasi' : 'Review trends'}
            </p>
          </div>
          <button onClick={loadTrends} disabled={trendsLoading} className="text-[13px] font-medium text-primary border border-primary/30 rounded-lg px-3 py-2 hover:bg-primary/10 transition-colors disabled:opacity-50">
            {trendsLoading ? (ru ? 'Анализ...' : isUz ? 'Tahlil...' : 'Analyzing...') : trends ? (ru ? 'Обновить' : isUz ? 'Yangilash' : 'Refresh') : (ru ? 'Анализировать' : isUz ? 'Tahlil qilish' : 'Analyze')}
          </button>
        </div>
        {!trends && !trendsLoading && !trendsError && <p className="text-[13px] text-muted/50 mt-2">{ru ? 'Находит изменения в тональности и темах за 8 недель.' : isUz ? "8 hafta ichidagi kayfiyat va mavzu o'zgarishlarini topadi." : 'Finds sentiment and topic shifts over 8 weeks.'}</p>}
        {trendsError && !trendsLoading && <p className="text-[13px] text-danger mt-2">{ru ? 'Не удалось получить анализ. Попробуйте позже.' : isUz ? "Tahlil olib bo'lmadi. Keyinroq urining." : 'Could not load analysis. Try again later.'}</p>}
        {trendsLoading && <div className="mt-3 space-y-2">{[70,50,60].map(w=><div key={w} className="h-3 bg-border/60 rounded animate-pulse" style={{width:`${w}%`}}/>)}</div>}
        {trends && !trendsLoading && (
          <div className="mt-3">
            {trends.alertLevel === 'high' && <p className="text-[13px] text-danger font-semibold mb-2">{ru ? 'Тревожный сигнал' : isUz ? 'Ogohlantirish signali' : 'Alert signal'}</p>}
            {trends.summary && <p className="text-[13px] text-muted leading-relaxed mb-3">{trends.summary}</p>}
            <div className="space-y-1.5">
              {trends.trends?.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <p className="text-[13px] text-text">{t.topic}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-semibold ${t.pctChange > 0 ? 'text-danger' : 'text-success'}`}>
                      {t.pctChange > 0 ? '+' : ''}{t.pctChange}%
                    </span>
                    <span className="text-[12px] text-muted/60">{t.change}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      )}

      {/* Stats strip — clickable, each card filters/sorts the list below */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-md overflow-hidden">
        {[
          {
            value: stats?.avg_rating ? stats.avg_rating.toFixed(1) : '—',
            label: ru ? 'Средняя оценка' : isUz ? "O'rtacha baho" : 'Avg rating',
            sub: stats?.avg_rating ? '★★★★★'.slice(0, Math.round(stats.avg_rating)) : '',
            subClass: 'text-yellow-400 text-[13px]',
            active: sortMode === 'rating_desc',
            onClick: () => setSortMode(m => m === 'rating_desc' ? 'newest' : 'rating_desc'),
          },
          {
            value: stats ? stats.total.toLocaleString() : '—',
            label: ru ? 'Всего отзывов' : isUz ? 'Jami sharhlar' : 'Total reviews',
            sub: stats ? `+${stats.this_week} ${ru ? 'эта неделя' : isUz ? 'shu hafta' : 'this week'}` : '',
            subClass: 'text-primary text-[13px]',
            active: hasActiveFilters,
            onClick: resetFilters,
          },
          {
            value: stats ? `${stats.positive_pct}%` : '—',
            label: ru ? 'Позитивных' : isUz ? 'Ijobiy' : 'Positive',
            sub: ru ? 'настроение' : isUz ? 'kayfiyat' : 'sentiment',
            subClass: 'text-success text-[13px]',
            active: sentimentFilter === 'positive',
            onClick: () => setSentimentFilter(f => f === 'positive' ? 'all' : 'positive'),
          },
          {
            value: reviews.filter(r => r.sentiment === 'negative').length.toString(),
            label: ru ? 'Негативных' : isUz ? 'Salbiy' : 'Negative',
            sub: ru ? 'требуют ответа' : isUz ? 'javob talab qiladi' : 'need reply',
            subClass: 'text-danger text-[13px]',
            active: sentimentFilter === 'negative',
            onClick: () => setSentimentFilter(f => f === 'negative' ? 'all' : 'negative'),
          },
        ].map((s, i) => (
          <button
            key={i}
            onClick={s.onClick}
            className={`text-left bg-card p-5 stagger-item transition-colors hover:bg-card-hover ${s.active ? 'ring-1 ring-inset ring-primary bg-primary/5' : ''}`}
            style={{ animationDelay: `${i * 55}ms` }}
          >
            <p className="metric-number text-[28px] font-bold text-text leading-none">{s.value}</p>
            <p className="text-[13px] text-muted mt-2 mb-1">{s.label}</p>
            <p className={s.subClass}>{s.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-[13px] font-semibold text-text">
              {ru ? 'Отзывы' : isUz ? 'Sharhlar' : 'Reviews'}
              {filtered.length > 0 && <span className="text-muted font-normal ml-2">({filtered.length})</span>}
            </h3>
            <div className="flex gap-1.5 items-center flex-wrap">
              <button onClick={load} className="text-muted hover:text-text transition-colors p-1">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors ${filter === 'all' ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text border border-border'}`}
                >
                  {ru ? 'Все' : isUz ? 'Barchasi' : 'All'}
                </button>
                {platforms.map(p => (
                  <button
                    key={p}
                    onClick={() => setFilter(p)}
                    className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors ${filter === p ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text border border-border'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Second row: sentiment, sort, date range */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {([
                ['all', ru ? 'Все' : isUz ? 'Barchasi' : 'All'],
                ['positive', ru ? 'Позитивные' : isUz ? 'Ijobiy' : 'Positive'],
                ['negative', ru ? 'Негативные' : isUz ? 'Salbiy' : 'Negative'],
                ['neutral', ru ? 'Нейтральные' : isUz ? 'Neytral' : 'Neutral'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSentimentFilter(key)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${sentimentFilter === key ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text border border-border'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as typeof sortMode)}
              className="px-2.5 py-1 text-[11px] rounded-md bg-card text-muted hover:text-text border border-border transition-colors cursor-pointer"
            >
              <option value="newest">{ru ? 'Сначала новые' : isUz ? 'Avval yangi' : 'Newest first'}</option>
              <option value="oldest">{ru ? 'Сначала старые' : isUz ? 'Avval eski' : 'Oldest first'}</option>
              <option value="rating_desc">{ru ? 'Рейтинг ↓' : isUz ? 'Reyting ↓' : 'Rating ↓'}</option>
              <option value="rating_asc">{ru ? 'Рейтинг ↑' : isUz ? 'Reyting ↑' : 'Rating ↑'}</option>
            </select>

            <button
              ref={calendarBtnRef}
              onClick={() => setCalendarOpen(o => !o)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                dateRange ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted hover:text-text bg-card'
              }`}
            >
              <CalendarIcon size={11} />
              {dateRange ? `${dateRange.from.slice(5)} – ${dateRange.to.slice(5)}` : (ru ? 'Дата' : isUz ? 'Sana' : 'Date')}
            </button>
            <DateRangePicker
              lang={lang}
              value={dateRange}
              isOpen={calendarOpen}
              onClose={() => setCalendarOpen(false)}
              anchorRef={calendarBtnRef}
              onApply={r => { setDateRange(r); setCalendarOpen(false); }}
              onClear={() => { setDateRange(null); setCalendarOpen(false); }}
            />

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md text-muted hover:text-danger transition-colors"
              >
                <X size={11} />
                {ru ? 'Сбросить' : isUz ? 'Tozalash' : 'Clear'}
              </button>
            )}
          </div>

          {loading && (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="glass rounded-3xl p-5 animate-pulse">
                  <div className="flex gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-card-hover" />
                    <div className="flex-1">
                      <div className="h-3 bg-card-hover rounded w-32 mb-2" />
                      <div className="h-2.5 bg-card-hover rounded w-20" />
                    </div>
                  </div>
                  <div className="h-3 bg-card-hover rounded w-full mb-1.5" />
                  <div className="h-3 bg-card-hover rounded w-3/4" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="bg-danger/5 border border-danger/20 rounded-md p-5 text-[13px] text-danger">{error}</div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="glass rounded-3xl p-10 text-center text-muted text-[13px]">
              {ru ? 'Отзывов пока нет' : isUz ? "Hozircha sharhlar yo'q" : 'No reviews yet'}
            </div>
          )}

          {!loading && filtered.map((review, i) => (
            <Card
              key={review.id}
              className="stagger-item hover:border-primary/20 transition-colors"
              style={{ animationDelay: `${i * 40 + 100}ms` } as React.CSSProperties}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-card-hover border border-border flex items-center justify-center font-semibold text-[13px] text-text flex-shrink-0">
                    {review.author[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-[14px] font-semibold text-text">{review.author}</h4>
                      <span className={`text-[12px] font-bold ${PLATFORM_COLORS[review.platform] ?? 'text-muted'}`}>
                        {review.platform}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[12px] text-muted">{review.date}</p>
                      {review.branch && (
                        <p className="text-[12px] text-muted">· {review.branch}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-card-hover border border-border px-2 py-1 rounded-lg">
                  <StarRating rating={review.rating} />
                  {review.rating && (
                    <span className="metric-number text-[13px] font-bold text-text ml-0.5">{review.rating}</span>
                  )}
                </div>
              </div>

              <p className="text-[14px] text-text leading-relaxed mb-3">{review.text}</p>

              <div className="flex justify-between items-center pt-3 border-t border-border">
                <span className={`text-[12px] font-medium px-2 py-0.5 rounded-[3px] ${
                  review.sentiment === 'positive' ? 'text-success bg-success/10'
                  : review.sentiment === 'negative' ? 'text-danger bg-danger/10'
                  : 'text-muted bg-card-hover'
                }`}>
                  {review.sentiment === 'positive' ? (ru ? 'Позитивный' : isUz ? 'Ijobiy' : 'Positive')
                  : review.sentiment === 'negative' ? (ru ? 'Негативный' : isUz ? 'Salbiy' : 'Negative')
                  : (ru ? 'Нейтральный' : isUz ? "Neytral" : 'Neutral')}
                </span>
                <button
                  onClick={() => generateReply(review)}
                  disabled={replyMap[review.id]?.loading}
                  className="text-[12px] text-primary hover:text-primary-hover font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <Sparkles size={12} />
                  {replyMap[review.id]?.loading ? (ru ? 'Генерация...' : isUz ? 'Yaratilmoqda...' : 'Generating...') : (ru ? 'AI ответ' : isUz ? 'AI javob' : 'AI reply')}
                </button>
              </div>
              {replyMap[review.id]?.text && (
                <div className="mt-2 pt-3 border-t border-border">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] text-muted leading-relaxed flex-1">{replyMap[review.id].text}</p>
                    <button
                      onClick={() => copyReply(review.id, replyMap[review.id].text)}
                      className="text-muted hover:text-primary transition-colors flex-shrink-0 mt-0.5"
                    >
                      {replyMap[review.id].copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Sidebar: platform breakdown */}
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold text-text">{ru ? 'По платформам' : isUz ? 'Platformalar bo\'yicha' : 'By platform'}</h3>
          <Card>
            {platforms.length === 0 && !loading && (
              <p className="text-muted text-[13px]">{ru ? 'Нет данных' : isUz ? "Ma'lumot yo'q" : 'No data'}</p>
            )}
            {platforms.map(p => {
              const count = allReviews.filter(r => r.platform === p).length;
              const pct = allReviews.length > 0 ? Math.round(count / allReviews.length * 100) : 0;
              const ratedForP = allReviews.filter(r => r.platform === p && r.rating != null);
              const avgR = ratedForP.length > 0 ? ratedForP.reduce((s, r) => s + (r.rating ?? 0), 0) / ratedForP.length : null;
              return (
                <div key={p} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                  <div>
                    <p className={`text-[13px] font-semibold ${PLATFORM_COLORS[p] ?? 'text-text'}`}>{p}</p>
                    <p className="text-[12px] text-muted">{count} {ru ? 'отзывов' : isUz ? 'sharh' : 'reviews'}{avgR != null ? ` · ${avgR.toFixed(1)}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-text">{pct}%</p>
                    <div className="w-16 h-1 bg-border rounded-full mt-1">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      </> /* end guest reviews fragment */}
    </div>
  );
};
