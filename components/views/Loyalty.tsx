// Лояльность — redesigned per TRACE-mockups/owner/more.js S.loyalty
// (styles/rd/more.css): look a guest up by phone, members strip, guests over
// 30 days, best guests; a guest opens in a side panel with balance and buys.
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { tr } from '../../constants';
import { Language } from '../../types';
import { traceApi, LoyaltySummary, LoyaltyGuestRow, LoyaltyVisit } from '../../services/traceApi';
import { Empty, LineChart, Skel, fmt, money, ruPl } from '../rd/ui';

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

const locale = (lang: Language) => lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-Latn-UZ' : 'en-GB';
function fmtDate(lang: Language, iso: string | null | undefined, year = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(+d)) return '—';
  return d.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', ...(year && d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), timeZone: 'Asia/Tashkent' });
}

export const Loyalty: React.FC<{ lang: Language }> = ({ lang }) => {
  const T = (ru: string, en: string, uz: string) => tr(lang, ru, en, uz);
  const [summary, setSummary] = useState<LoyaltySummary | null>(null);
  const [guests, setGuests] = useState<LoyaltyGuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState('');
  const [open, setOpen] = useState<{ phone: string; row?: LoyaltyGuestRow } | null>(null);
  const [detail, setDetail] = useState<{ loading: boolean; data: IikoCustomerInfo | null; error: boolean }>({ loading: false, data: null, error: false });
  const [visits, setVisits] = useState<{ loading: boolean; list: LoyaltyVisit[] }>({ loading: false, list: [] });

  useEffect(() => {
    setLoading(true);
    Promise.all([traceApi.loyalty.summary(), traceApi.loyalty.guests(100)])
      .then(([s, g]) => { setSummary(s); setGuests(g); })
      .catch(() => { setSummary(null); setGuests([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  const openGuest = (p: string, row?: LoyaltyGuestRow) => {
    setOpen({ phone: p, row });
    setDetail({ loading: true, data: null, error: false });
    setVisits({ loading: true, list: [] });
    traceApi.loyalty.guestDetail(p)
      .then(data => setDetail({ loading: false, data, error: !data }))
      .catch(() => setDetail({ loading: false, data: null, error: true }));
    traceApi.loyalty.guestHistory(p)
      .then(list => setVisits({ loading: false, list }))
      .catch(() => setVisits({ loading: false, list: [] }));
  };

  const digits = (s: string) => s.replace(/\D/g, '');
  const filtered = q
    ? guests.filter(g => (digits(q) && digits(g.phone).includes(digits(q))) || (g.name ?? '').toLowerCase().includes(q.toLowerCase().trim()))
    : guests;
  const noData = !loading && (!summary || summary.totalMembers === 0);
  const unnamed = T('Без имени', 'Unnamed', 'Ismsiz');

  const exportExcel = () => {
    const header = [T('Гость', 'Guest', 'Mehmon'), T('Телефон', 'Phone', 'Telefon'), T('Визиты', 'Visits', 'Tashriflar'), T('Потрачено (UZS)', 'Spent (UZS)', 'Sarflangan (UZS)'), T('Любимое блюдо', 'Favourite dish', 'Sevimli taom'), T('Последний визит', 'Last visit', 'Oxirgi tashrif')];
    const rows = guests.map(g => [g.name ?? unnamed, g.phone, g.visitCount, g.totalSpent, g.favoriteItem ?? '—', fmtDate(lang, g.lastSeen)]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 24 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, T('Лояльность', 'Loyalty', 'Sadoqat'));
    XLSX.writeFile(wb, `loyalty-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const trend = summary?.trend ?? [];
  const d = detail.data;
  const fullName = d ? [d.name, d.surname].filter(Boolean).join(' ') : '';
  const title = fullName || open?.row?.name || unnamed;
  const tier = d?.categories?.find(c => c.isActive)?.name;
  const balances = (d?.walletBalances ?? []).filter(w => w.balance > 0);
  const card = d?.cards?.[0]?.number;

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>{T('Лояльность', 'Loyalty', 'Sadoqat')}</h1>
          <div className="sub">{T('Гости, которых касса узнала по номеру телефона', 'Guests the till recognised by phone number', 'Kassa telefon raqami orqali tanigan mehmonlar')}</div>
        </div>
        {!noData && guests.length > 0 && <button className="btn" type="button" onClick={exportExcel}><i className="ph ph-download-simple" aria-hidden="true" />{T('Скачать Excel', 'Download Excel', 'Excel yuklab olish')}</button>}
      </div>

      <section className="card rise" aria-labelledby="h-find">
        <div className="card-h"><h2 id="h-find">{T('Найти гостя', 'Find a guest', 'Mehmonni topish')}</h2></div>
        <p className="card-sub">{T('Баланс, статус и последний визит по любому номеру, даже если гость ещё не попал в список ниже', 'Balance, tier and last visit for any number, even if the guest is not in the list below yet', "Istalgan raqam bo'yicha balans, status va oxirgi tashrif")}</p>
        <form className="find" onSubmit={e => { e.preventDefault(); if (digits(phone).length >= 7) openGuest(phone.trim()); }}>
          <input className="input" type="tel" inputMode="tel" placeholder="+998 90 123 45 67" value={phone} onChange={e => setPhone(e.target.value)} aria-label={T('Телефон гостя', 'Guest phone', 'Mehmon telefoni')} />
          <button className="btn solid" type="submit" disabled={digits(phone).length < 7}>{T('Найти', 'Find', 'Topish')}</button>
        </form>
      </section>

      {loading && <div className="stack"><div className="card"><Skel lines={['w9', 'w7', 'w9', 'w5']} /></div></div>}

      {noData && <div className="stack"><div className="card"><Empty>{T('Аналитика гостей появится здесь после первых визитов с программой лояльности.', 'Guest analytics will show up here after the first loyalty visits.', "Sadoqat dasturi bo'yicha birinchi tashriflardan so'ng tahlil shu yerda paydo bo'ladi.")}</Empty></div></div>}

      {!loading && !noData && summary && (
        <div className="stack">
          <section className="strip rise" aria-label={T('Итоги', 'Totals', 'Yakunlar')}>
            <div><div className="s-l">{T('Участников', 'Members', "A'zolar")}</div><div className="s-v">{fmt(summary.totalMembers)}</div><div className="s-d">{T('всего в программе', 'in the programme', 'dasturda jami')}</div></div>
            <div><div className="s-l">{T('Новых за 30 дней', 'New in 30 days', '30 kunda yangi')}</div><div className="s-v">{fmt(summary.newMembers)}</div><div className="s-d">{T('первый визит', 'first visit', 'birinchi tashrif')}</div></div>
            <div><div className="s-l">{T('Возвращаются', 'Come back', 'Qaytadi')}</div><div className="s-v">{summary.returningPct}<small>%</small></div><div className="s-d">{T(`${fmt(summary.returningMembers)} ${ruPl(summary.returningMembers, 'гость', 'гостя', 'гостей')}`, `${fmt(summary.returningMembers)} guests`, `${fmt(summary.returningMembers)} mehmon`)}</div></div>
            <div><div className="s-l">{T('Средние траты', 'Average spend', "O'rtacha xarajat")}</div><div className="s-v">{money(summary.avgSpent, lang)}</div><div className="s-d">{T('на гостя за всё время', 'per guest, all time', 'mehmon boshiga')}</div></div>
          </section>

          {trend.length > 1 && (
            <section className="card rise" aria-labelledby="h-act">
              <div className="card-h"><h2 id="h-act">{T('Гости за 30 дней', 'Guests over 30 days', '30 kunlik mehmonlar')}</h2></div>
              <LineChart height={200} labels={trend.map(t => `${+t.date.slice(8, 10)}.${t.date.slice(5, 7)}`)} cur={trend.map(t => t.guests)}
                curName={T('Гости', 'Guests', 'Mehmonlar')} axis={v => String(Math.round(v))} tip={v => fmt(v)} />
            </section>
          )}

          <section className="card rise" aria-labelledby="h-best">
            <div className="card-h"><h2 id="h-best">{T('Лучшие гости', 'Best guests', 'Eng yaxshi mehmonlar')}</h2>
              <div className="search"><i className="ph ph-magnifying-glass" aria-hidden="true" /><input className="input" type="search" placeholder={T('Телефон или имя', 'Phone or name', 'Telefon yoki ism')} value={q} onChange={e => setQ(e.target.value)} aria-label={T('Поиск гостя', 'Search guests', 'Mehmon qidirish')} /></div>
            </div>
            {filtered.length === 0 ? <Empty>{T(`Нет гостей по запросу «${q}».`, `No guests match “${q}”.`, `«${q}» bo'yicha mehmon yo'q.`)}</Empty> : (
              <div className="tbl-wrap"><table>
                <thead><tr><th className="rank">#</th><th>{T('Гость', 'Guest', 'Mehmon')}</th><th className="r">{T('Визиты', 'Visits', 'Tashriflar')}</th><th className="r">{T('Потрачено', 'Spent', 'Sarflangan')}</th><th className="r hide-ph">{T('Последний визит', 'Last visit', 'Oxirgi tashrif')}</th></tr></thead>
                <tbody>{filtered.map(g => (
                  <tr key={g.phone} className="click" tabIndex={0} onClick={() => openGuest(g.phone, g)} onKeyDown={e => { if (e.key === 'Enter') openGuest(g.phone, g); }}>
                    <td className="rank">{guests.indexOf(g) + 1}</td>
                    <td className="who"><b>{g.name ?? unnamed}</b><span>{g.phone}{g.favoriteItem ? ` · ${T('любит', 'likes', 'yoqtiradi')} ${g.favoriteItem}` : ''}</span></td>
                    <td className="r num">{fmt(g.visitCount)}</td>
                    <td className="r num">{money(g.totalSpent, lang)}</td>
                    <td className="r num faint hide-ph">{fmtDate(lang, g.lastSeen)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </div>
      )}

      <div className={`scrim${open ? ' on' : ''}`} onClick={() => setOpen(null)} />
      <aside className={`panel${open ? ' on' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        {open && <>
          <div className="p-head">
            <div style={{ minWidth: 0 }}>
              <h2>{detail.loading ? (open.row?.name ?? open.phone) : title}</h2>
              <div className="faint">{d?.phone ?? open.phone}{card ? ` · ${T('карта', 'card', 'karta')} ${card}` : ''}</div>
              {tier && <span className="tag acc" style={{ marginTop: 8 }}>{tier}</span>}
            </div>
            <button className="p-close" type="button" onClick={() => setOpen(null)} aria-label={T('Закрыть', 'Close', 'Yopish')}><i className="ph ph-x" aria-hidden="true" /></button>
          </div>
          <div className="p-body">
            {detail.loading ? <Skel lines={['w9', 'w7', 'w5']} />
              : detail.error && !open.row ? <Empty>{T('Гость с таким номером не найден.', 'No guest with this number.', 'Bunday raqamli mehmon topilmadi.')}</Empty>
              : <>
                <div className="kgrid">
                  {balances.length > 0
                    ? balances.slice(0, 2).map(w => <div key={w.id}><div className="k-l">{w.name}</div><div className="k-v num">{fmt(w.balance)}</div></div>)
                    : <div><div className="k-l">{T('Баллы', 'Points', 'Ballar')}</div><div className="k-v">0</div></div>}
                  {balances.length < 2 && <div><div className="k-l">{T('Визиты', 'Visits', 'Tashriflar')}</div><div className="k-v num">{open.row ? fmt(open.row.visitCount) : '—'}</div></div>}
                  <div><div className="k-l">{T('Участник с', 'Member since', "A'zo bo'lgan")}</div><div className="k-v">{fmtDate(lang, d?.whenRegistered ?? open.row?.firstSeen)}</div></div>
                  <div><div className="k-l">{T('Последний визит', 'Last visit', 'Oxirgi tashrif')}</div><div className="k-v">{fmtDate(lang, d?.lastProcessedOrderDate ?? open.row?.lastSeen)}</div></div>
                </div>
                {detail.error && <p className="note">{T('Баланс не загрузился, показываем то, что знает TRACE.', "Balance didn't load, showing what TRACE knows.", "Balans yuklanmadi, TRACE bilganini ko'rsatyapmiz.")}</p>}
                <div className="sec-label">{T('Покупки', 'Purchases', 'Xaridlar')}</div>
                {visits.loading ? <Skel lines={['w9', 'w7']} />
                  : visits.list.length === 0 ? <Empty>{T('В TRACE пока нет покупок этого гостя. История копится с каждым визитом.', 'No purchases of this guest in TRACE yet. History builds up with every visit.', "TRACE'da bu mehmonning xaridlari hali yo'q.")}</Empty>
                  : visits.list.map((v, i) => (
                    <div className="visit" key={i}>
                      <span>{v.items.length ? v.items.map(it => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ') : T('Без позиций', 'No items', "Pozitsiyasiz")}</span>
                      <span className="num">{money(v.sum, lang)}</span>
                      <span className="faint">{fmtDate(lang, v.at)}</span>
                    </div>
                  ))}
              </>}
          </div>
        </>}
      </aside>
    </>
  );
};
