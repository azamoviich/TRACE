import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import * as XLSX from 'xlsx';
import { Users, TrendingUp, Wallet, Repeat, Search, X, Heart, Download } from 'lucide-react';
import { Card } from '../ui/Card';
import { ChartTooltip } from '../ui/ChartTooltip';
import { Language } from '../../types';
import { traceApi, LoyaltySummary, LoyaltyGuestRow, LoyaltyVisit } from '../../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

function fmtSum(n: number) {
  return n.toLocaleString('ru-RU');
}

function fmtDate(lang: Language, iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-Latn-UZ' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface IikoCustomerInfo {
  name?: string;
  surname?: string;
  phone?: string;
  cards?: { number: string }[];
  categories?: { name: string; isActive: boolean }[];
  walletBalances?: { id: string; name: string; balance: number }[];
  whenRegistered?: string;
  firstOrderDate?: string;
  lastProcessedOrderDate?: string;
}

function GuestDetailPanel({ lang, data }: { lang: Language; data: IikoCustomerInfo }) {
  const fullName = [data.name, data.surname].filter(Boolean).join(' ') || tr(lang, 'Без имени', 'Unnamed', 'Ismsiz');
  const tier = data.categories?.find(c => c.isActive)?.name;
  const balances = (data.walletBalances ?? []).filter(w => w.balance > 0);
  const cardNumber = data.cards?.[0]?.number;

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[13px] font-semibold text-text">{fullName}</p>
          <p className="text-[11px] text-muted">{data.phone}{cardNumber ? ` · ${tr(lang, 'карта', 'card', 'karta')} ${cardNumber}` : ''}</p>
        </div>
        {tier && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">{tier}</span>
        )}
      </div>

      {balances.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {balances.map(w => (
            <div key={w.id} className="text-[12px] bg-card border border-border rounded-lg px-2.5 py-1.5">
              <span className="text-muted">{w.name}: </span>
              <span className="font-semibold text-text metric-number">{fmtSum(w.balance)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-border text-[11px]">
        <div>
          <p className="text-muted">{tr(lang, 'С нами с', 'Member since', "A'zo bo'lgan")}</p>
          <p className="text-text font-medium mt-0.5">{fmtDate(lang, data.whenRegistered)}</p>
        </div>
        <div>
          <p className="text-muted">{tr(lang, 'Первый визит', 'First visit', 'Birinchi tashrif')}</p>
          <p className="text-text font-medium mt-0.5">{fmtDate(lang, data.firstOrderDate)}</p>
        </div>
        <div>
          <p className="text-muted">{tr(lang, 'Последний визит', 'Last visit', 'Oxirgi tashrif')}</p>
          <p className="text-text font-medium mt-0.5">{fmtDate(lang, data.lastProcessedOrderDate)}</p>
        </div>
      </div>
    </div>
  );
}

function PurchaseHistoryPanel({ lang, visits, loading }: { lang: Language; visits: LoyaltyVisit[]; loading: boolean }) {
  if (loading) {
    return <p className="text-[12px] text-muted mt-2">{tr(lang, 'Загрузка покупок...', 'Loading purchases...', 'Xaridlar yuklanmoqda...')}</p>;
  }
  if (visits.length === 0) {
    return <p className="text-[12px] text-muted mt-2">{tr(lang, 'Нет истории покупок в TRACE — накопится по мере визитов', 'No purchase history in TRACE yet — will build up as visits come in', "TRACE'da xaridlar tarixi yo'q — tashriflar bilan to'planadi")}</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-muted">{tr(lang, 'Покупки', 'Purchases', 'Xaridlar')}</p>
      {visits.map((v, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-2.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-muted">{fmtDate(lang, v.at)}</p>
            <p className="text-[12px] font-semibold text-text metric-number">{fmtSum(v.sum)} UZS</p>
          </div>
          {v.items.length > 0 && (
            <p className="text-[12px] text-text">
              {v.items.map((it, j) => (
                <span key={j}>{j > 0 && ', '}{it.name}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</span>
              ))}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, suffix }: { icon: React.ElementType; label: string; value: string; suffix?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-muted mb-1.5">
        <Icon size={13} />
        <p className="text-[12px] font-medium">{label}</p>
      </div>
      <p className="metric-number font-display font-bold text-text leading-none" style={{ fontSize: 'clamp(18px, 2vw, 24px)' }}>
        {value}{suffix && <span className="text-muted ml-1" style={{ fontSize: '0.55em' }}>{suffix}</span>}
      </p>
    </div>
  );
}

export const Loyalty: React.FC<{ lang: Language }> = ({ lang }) => {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const [summary, setSummary] = useState<LoyaltySummary | null>(null);
  const [guests, setGuests] = useState<LoyaltyGuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<{ phone: string; loading: boolean; data: any; error: boolean } | null>(null);
  const [history, setHistory] = useState<{ phone: string; loading: boolean; visits: LoyaltyVisit[] } | null>(null);
  const [manualPhone, setManualPhone] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([traceApi.loyalty.summary(), traceApi.loyalty.guests(100)])
      .then(([s, g]) => { setSummary(s); setGuests(g); })
      .catch(() => { setSummary(null); setGuests([]); })
      .finally(() => setLoading(false));
  }, []);

  const lookupGuest = (phone: string) => {
    setDetail({ phone, loading: true, data: null, error: false });
    traceApi.loyalty.guestDetail(phone)
      .then(data => setDetail({ phone, loading: false, data, error: false }))
      .catch(() => setDetail({ phone, loading: false, data: null, error: true }));

    setHistory({ phone, loading: true, visits: [] });
    traceApi.loyalty.guestHistory(phone)
      .then(visits => setHistory({ phone, loading: false, visits }))
      .catch(() => setHistory({ phone, loading: false, visits: [] }));
  };

  // Clicking an already-open row closes it instead of re-fetching.
  const toggleGuest = (phone: string) => {
    if (detail?.phone === phone) {
      setDetail(null);
      setHistory(null);
      return;
    }
    lookupGuest(phone);
  };

  const filtered = search
    ? guests.filter(g => g.phone.includes(search) || (g.name ?? '').toLowerCase().includes(search.toLowerCase()))
    : guests;

  const noData = !loading && (!summary || summary.totalMembers === 0);

  const exportToExcel = () => {
    const header = [
      tr(lang, 'Гость', 'Guest', 'Mehmon'), tr(lang, 'Телефон', 'Phone', 'Telefon'),
      tr(lang, 'Визиты', 'Visits', 'Tashriflar'), tr(lang, 'Потрачено (UZS)', 'Spent (UZS)', 'Sarflangan (UZS)'),
      tr(lang, 'Любимое блюдо', 'Favorite item', 'Sevimli taom'),
      tr(lang, 'Последний визит', 'Last visit', 'Oxirgi tashrif'),
    ];
    const rows = guests.map(g => [
      g.name ?? tr(lang, 'Без имени', 'Unnamed', 'Ismsiz'),
      g.phone,
      g.visitCount,
      g.totalSpent,
      g.favoriteItem ?? '—',
      fmtDate(lang, g.lastSeen),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 24 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tr(lang, 'Лояльность', 'Loyalty', 'Sadoqat'));
    XLSX.writeFile(wb, `loyalty-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[18px] font-bold text-text">{tr(lang, 'Программа лояльности', 'Loyalty program', 'Sadoqat dasturi')}</h2>
          <p className="text-[13px] text-muted mt-0.5">{tr(lang, 'Гости, идентифицированные по номеру телефона на кассе', 'Guests identified by phone at checkout', "Kassada telefon raqami orqali aniqlangan mehmonlar")}</p>
        </div>
        {!noData && guests.length > 0 && (
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg bg-card border border-border text-text hover:bg-card-hover transition-colors flex-shrink-0"
          >
            <Download size={13} />
            {tr(lang, 'Скачать Excel', 'Download Excel', 'Excel yuklab olish')}
          </button>
        )}
      </div>

      {/* Manual lookup — works via iiko's Cloud API directly, for any phone
          number, even before the POS has ever captured that guest. Doesn't
          depend on accumulated history like the table below does. */}
      <Card>
        <p className="text-[13px] font-semibold text-text mb-1">{tr(lang, 'Найти гостя по телефону', 'Look up a guest by phone', 'Telefon orqali mehmonni topish')}</p>
        <p className="text-[12px] text-muted mb-3">{tr(lang, 'Баланс, статус и последний визит — по любому номеру', 'Balance, tier, and last visit — for any phone number', "Balans, status va oxirgi tashrif — istalgan raqam bo'yicha")}</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 flex-1 max-w-[280px]">
            <Search size={13} className="text-muted flex-shrink-0" />
            <input
              value={manualPhone}
              onChange={e => setManualPhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && manualPhone.trim()) lookupGuest(manualPhone.trim()); }}
              placeholder={tr(lang, '+998 90 123 45 67', '+998 90 123 45 67', '+998 90 123 45 67')}
              className="bg-transparent outline-none text-[13px] text-text placeholder:text-muted w-full"
            />
          </div>
          <button
            onClick={() => manualPhone.trim() && lookupGuest(manualPhone.trim())}
            disabled={!manualPhone.trim()}
            className="px-3 py-1.5 text-[13px] font-medium rounded-lg bg-primary text-white disabled:opacity-40 transition-opacity"
          >
            {tr(lang, 'Найти', 'Look up', 'Topish')}
          </button>
        </div>
        {detail?.phone === manualPhone && manualPhone && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex justify-end mb-1">
              <button
                onClick={() => { setDetail(null); setHistory(null); }}
                className="text-muted hover:text-text transition-colors p-1"
                title={tr(lang, 'Закрыть', 'Close', 'Yopish')}
              >
                <X size={14} />
              </button>
            </div>
            {detail.loading ? (
              <p className="text-[12px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
            ) : detail.error ? (
              <p className="text-[12px] text-danger">{tr(lang, 'Гость не найден', 'Guest not found', 'Mehmon topilmadi')}</p>
            ) : (
              <GuestDetailPanel lang={lang} data={detail.data} />
            )}
            {history?.phone === manualPhone && (
              <PurchaseHistoryPanel lang={lang} visits={history.visits} loading={history.loading} />
            )}
          </div>
        )}
      </Card>

      {noData ? (
        <Card>
          <div className="py-10 text-center text-muted text-[13px]">
            {tr(lang, 'Аналитика гостей появится здесь после первых визитов с программой лояльности',
                'Guest analytics will show up here after the first loyalty visits come in',
                "Sadoqat dasturi bo'yicha birinchi tashriflardan so'ng mehmonlar tahlili shu yerda paydo bo'ladi")}
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={Users} label={tr(lang, 'Участников', 'Members', "A'zolar")} value={loading ? '—' : (summary?.totalMembers ?? 0).toLocaleString('ru-RU')} />
            <StatTile icon={TrendingUp} label={tr(lang, 'Новых за 30 дней', 'New (30d)', '30 kunda yangi')} value={loading ? '—' : (summary?.newMembers ?? 0).toLocaleString('ru-RU')} />
            <StatTile icon={Repeat} label={tr(lang, 'Возвращаются', 'Returning', 'Qaytadigan')} value={loading ? '—' : `${summary?.returningPct ?? 0}%`} />
            <StatTile icon={Wallet} label={tr(lang, 'Средний чек гостя', 'Avg spend/guest', "O'rtacha xarajat")} value={loading ? '—' : fmtSum(summary?.avgSpent ?? 0)} suffix="UZS" />
          </div>

          <Card>
            <p className="text-[13px] text-muted font-medium mb-4">{tr(lang, 'Активность гостей (30 дней)', 'Guest activity (30 days)', 'Mehmonlar faolligi (30 kun)')}</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary?.trend ?? []} margin={{ top: 4, right: 0, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gLoyalty" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff6b35" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="#ff6b35" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" vertical={false} stroke="rgb(var(--color-border))" />
                  <XAxis dataKey="date" stroke="transparent" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11, fontFamily: 'Onest' }} tickLine={false} axisLine={false} tickFormatter={v => fmtDate(lang, v)} />
                  <YAxis stroke="transparent" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11, fontFamily: 'Onest' }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                  <Tooltip
                    content={(props: any) => <ChartTooltip {...props} labelFormatter={(l) => fmtDate(lang, l)} />}
                  />
                  <Area type="monotone" dataKey="guests" name={tr(lang, 'Гости', 'Guests', 'Mehmonlar')} stroke="#ff6b35" strokeWidth={1.5} fill="url(#gLoyalty)" dot={false} activeDot={{ r: 3, fill: '#ff6b35', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <p className="text-[13px] font-semibold text-text">{tr(lang, 'Гости', 'Guests', 'Mehmonlar')}</p>
              <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 w-full max-w-[240px]">
                <Search size={13} className="text-muted flex-shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={tr(lang, 'Телефон или имя', 'Phone or name', 'Telefon yoki ism')}
                  className="bg-transparent outline-none text-[13px] text-text placeholder:text-muted w-full"
                />
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <div key={i} className="h-10 bg-card-hover rounded animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-[13px] text-muted py-6 text-center">{tr(lang, 'Гости не найдены', 'No guests found', 'Mehmonlar topilmadi')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border">
                      {[tr(lang, 'Гость', 'Guest', 'Mehmon'), tr(lang, 'Визиты', 'Visits', 'Tashriflar'), tr(lang, 'Потрачено', 'Spent', 'Sarflangan'), tr(lang, 'Последний визит', 'Last visit', "Oxirgi tashrif")].map(h => (
                        <th key={h} className="py-2 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(g => (
                      <React.Fragment key={g.phone}>
                        <tr
                          className="border-b border-border last:border-0 hover:bg-card-hover transition-colors cursor-pointer"
                          onClick={() => toggleGuest(g.phone)}
                        >
                          <td className="py-2.5 pr-4">
                            <p className="text-[13px] font-medium text-text">{g.name ?? tr(lang, 'Без имени', 'Unnamed', 'Ismsiz')}</p>
                            <p className="text-[11px] text-muted">{g.phone}</p>
                            {g.favoriteItem && (
                              <p className="text-[11px] text-primary flex items-center gap-1 mt-0.5">
                                <Heart size={10} className="flex-shrink-0" fill="currentColor" />
                                <span className="truncate">{g.favoriteItem}</span>
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-[13px] text-text metric-number">{g.visitCount}</td>
                          <td className="py-2.5 pr-4 text-[13px] text-text metric-number">{fmtSum(g.totalSpent)}</td>
                          <td className="py-2.5 pr-4 text-[12px] text-muted">{fmtDate(lang, g.lastSeen)}</td>
                        </tr>
                        {detail?.phone === g.phone && (
                          <tr>
                            <td colSpan={4} className="pb-3 px-2">
                              <div className="flex justify-end mb-1">
                                <button
                                  onClick={() => toggleGuest(g.phone)}
                                  className="text-muted hover:text-text transition-colors p-1"
                                  title={tr(lang, 'Закрыть', 'Close', 'Yopish')}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              {detail.loading ? (
                                <p className="text-[12px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
                              ) : detail.error ? (
                                <p className="text-[12px] text-danger">{tr(lang, 'Не удалось загрузить баланс', 'Could not load balance', "Balansni yuklab bo'lmadi")}</p>
                              ) : (
                                <GuestDetailPanel lang={lang} data={detail.data} />
                              )}
                              {history?.phone === g.phone && (
                                <PurchaseHistoryPanel lang={lang} visits={history.visits} loading={history.loading} />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
