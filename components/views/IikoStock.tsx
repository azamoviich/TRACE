// Live store balances for iiko tenants (Склад): what is left, in which store,
// what it is worth. Min/max come from the product card in iiko; a product
// without them can only be flagged as negative. Redesign markup (.rd-fin).
import React, { useState, useEffect, useMemo } from 'react';
import { Language } from '../../types';
import { tr } from '../../constants';
import { traceApi, StockItem, StockSnapshot } from '../../services/traceApi';
import { Skel, mln, mlnUnit, sum } from '../rd/ui';

type StatusFilter = 'all' | 'negative' | 'low' | 'over';
type SortKey = 'value' | 'qty' | 'name';

function statusLabel(lang: Language, s: StockItem['status']) {
  return s === 'negative' ? tr(lang, 'Минус', 'Negative', 'Minus')
    : s === 'low' ? tr(lang, 'Ниже минимума', 'Below min', 'Minimumdan kam')
    : s === 'over' ? tr(lang, 'Выше максимума', 'Above max', "Maksimumdan ko'p")
    : '';
}

const fmtQty = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const fmtSum = (n: number) => Math.round(n).toLocaleString('ru-RU');
const PAGE = 50;

export const IikoStock: React.FC<{ lang: Language }> = ({ lang }) => {
  const [data, setData] = useState<StockSnapshot | null | undefined>(undefined);
  const [store, setStore] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('value');
  const [page, setPage] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    traceApi.financial.stock()
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, []);

  const stores = useMemo(
    () => Array.from(new Set((data?.items ?? []).map(i => i.store))).sort((a, b) => a.localeCompare(b, 'ru')),
    [data],
  );
  const inStore = useMemo(() => (data?.items ?? []).filter(i => store === 'all' || i.store === store), [data, store]);
  const counts = useMemo(() => ({
    negative: inStore.filter(i => i.status === 'negative').length,
    low: inStore.filter(i => i.status === 'low').length,
    over: inStore.filter(i => i.status === 'over').length,
  }), [inStore]);
  const totalValue = useMemo(() => inStore.reduce((s, i) => s + Math.max(0, i.totalValue), 0), [inStore]);
  const list = useMemo(() => {
    let l = inStore;
    if (status !== 'all') l = l.filter(i => i.status === status);
    const q = query.trim().toLowerCase();
    if (q) l = l.filter(i => i.name.toLowerCase().includes(q));
    return [...l].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'ru') : sort === 'qty' ? a.qty - b.qty : b.totalValue - a.totalValue);
  }, [inStore, status, query, sort]);

  if (data === undefined) return <div style={{ padding: '8px 0' }}><Skel lines={['w9', 'w9', 'w7', 'w9', 'w5']} /></div>;
  if (!data) return <p className="rd-empty">{tr(lang, 'Не удалось получить остатки из iiko. Попробуйте позже.', 'Could not load stock from iiko. Try again later.', "iiko'dan qoldiqlarni olib bo'lmadi. Keyinroq urinib ko'ring.")}</p>;

  const asOf = data.asOf.replace('T', ' ').slice(0, 16);
  const big = totalValue >= 1e6;
  const shown = list.slice(0, page);
  const chips: { id: StatusFilter; label: string; n?: number }[] = [
    { id: 'all', label: tr(lang, 'Все', 'All', 'Hammasi') },
    { id: 'negative', label: statusLabel(lang, 'negative'), n: counts.negative },
    { id: 'low', label: statusLabel(lang, 'low'), n: counts.low },
    { id: 'over', label: statusLabel(lang, 'over'), n: counts.over },
  ];

  return (
    <>
      <section className="strip four" style={{ marginBottom: 26 }}>
        <div><div className="s-l">{tr(lang, 'Стоимость остатков', 'Stock value', 'Qoldiq qiymati')}</div>
          <div className="s-v">{big ? mln(totalValue) : fmtSum(totalValue)}<small>{big ? mlnUnit(lang) : sum(lang)}</small></div>
          <div className="s-d">{store === 'all' ? tr(lang, 'все склады', 'all stores', 'barcha omborlar') : store}</div></div>
        <div><div className="s-l">{tr(lang, 'Позиций', 'Lines', 'Pozitsiyalar')}</div>
          <div className="s-v">{inStore.length.toLocaleString('ru-RU')}</div>
          <div className="s-d">{tr(lang, `${stores.length} ${stores.length % 10 === 1 && stores.length % 100 !== 11 ? 'склад' : stores.length % 10 >= 2 && stores.length % 10 <= 4 && (stores.length % 100 < 10 || stores.length % 100 >= 20) ? 'склада' : 'складов'}`, `${stores.length} ${stores.length === 1 ? 'store' : 'stores'}`, `${stores.length} ombor`)}</div></div>
        <div><div className="s-l">{tr(lang, 'В минусе', 'Below zero', 'Minusda')}</div>
          <div className={`s-v${counts.negative ? ' neg' : ''}`}>{counts.negative}</div>
          <div className="s-d">{tr(lang, 'нужна проверка', 'need checking', 'tekshirish kerak')}</div></div>
        <div><div className="s-l">{tr(lang, 'Ниже минимума', 'Below minimum', 'Minimumdan kam')}</div>
          <div className="s-v">{counts.low}</div>
          <div className="s-d">{tr(lang, 'пора заказать', 'time to reorder', 'buyurtma qilish vaqti')}</div></div>
      </section>

      {counts.negative > 0 && status === 'all' && (
        <p className="stock-warn"><i className="ph ph-warning" aria-hidden="true" />
          {tr(lang,
            `${counts.negative} позиций ушли в минус. Обычно это непроведённые приходные накладные или неверные техкарты.`,
            `${counts.negative} lines are below zero. Usually unposted incoming invoices or wrong recipes.`,
            `${counts.negative} pozitsiya minusda. Odatda kirim yuk xatlari o'tkazilmagan yoki texkarta noto'g'ri.`)}
        </p>
      )}

      <div className="tools">
        <label className="search"><i className="ph ph-magnifying-glass" aria-hidden="true" /><input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(PAGE); }} placeholder={tr(lang, 'Найти товар', 'Find an item', 'Mahsulot topish')} aria-label={tr(lang, 'Найти товар', 'Find an item', 'Mahsulot topish')} /></label>
        {stores.length > 1 && (
          <label className="sel"><select value={store} onChange={e => { setStore(e.target.value); setPage(PAGE); }} aria-label={tr(lang, 'Склад', 'Store', 'Ombor')}>
            <option value="all">{tr(lang, 'Все склады', 'All stores', 'Barcha omborlar')}</option>
            {stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select><i className="ph ph-caret-down chev" aria-hidden="true" /></label>
        )}
        <span className="seg small stock-seg" role="group" aria-label={tr(lang, 'Статус', 'Status', 'Holat')}>
          {chips.map(c => <button key={c.id} aria-pressed={status === c.id} onClick={() => { setStatus(c.id); setPage(PAGE); }}>{c.label}{c.n ? <span className="cnt">{c.n}</span> : null}</button>)}
        </span>
        <span className="spacer" />
        <label className="sel"><select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label={tr(lang, 'Сортировка', 'Sort', 'Saralash')}>
          <option value="value">{tr(lang, 'По сумме', 'By value', "Summa bo'yicha")}</option>
          <option value="qty">{tr(lang, 'По остатку', 'By quantity', "Qoldiq bo'yicha")}</option>
          <option value="name">{tr(lang, 'По названию', 'By name', "Nomi bo'yicha")}</option>
        </select><i className="ph ph-caret-down chev" aria-hidden="true" /></label>
      </div>

      <table className="dt stock">
        <thead><tr>
          <th>{tr(lang, 'Товар', 'Item', 'Mahsulot')}</th>
          {stores.length > 1 && <th className="hide-sm">{tr(lang, 'Склад', 'Store', 'Ombor')}</th>}
          <th className="r">{tr(lang, 'Остаток', 'On hand', 'Qoldiq')}</th>
          <th className="r hide-sm">{tr(lang, 'Мин / макс', 'Min / max', 'Min / maks')}</th>
          <th className="r hide-sm">{tr(lang, 'Цена ед.', 'Unit cost', 'Birlik narxi')}</th>
          <th className="r">{tr(lang, 'Сумма', 'Value', 'Summa')}</th>
        </tr></thead>
        <tbody>
          {shown.length ? shown.map(i => (
            <tr key={i.storeId + i.id}>
              <td className="strong">{i.name}{i.status !== 'ok' && <span className={`tag ${i.status === 'negative' ? 'bad' : i.status === 'low' ? 'warn' : ''}`} style={{ marginLeft: 8 }}>{statusLabel(lang, i.status)}</span>}</td>
              {stores.length > 1 && <td className="hide-sm muted">{i.store}</td>}
              <td className={`r num${i.qty < 0 ? ' hi-bad' : ''}`}>{fmtQty(i.qty)} {i.unit}</td>
              <td className="r hide-sm muted num">{i.min != null || i.max != null ? `${i.min != null ? fmtQty(i.min) : '—'} / ${i.max != null ? fmtQty(i.max) : '—'}` : '—'}</td>
              <td className="r hide-sm muted num">{i.unitCost ? fmtSum(i.unitCost) : '—'}</td>
              <td className={`r num${i.totalValue < 0 ? ' hi-bad' : ''}`}>{fmtSum(i.totalValue)}</td>
            </tr>
          )) : <tr><td colSpan={6} className="muted">{tr(lang, 'Ничего не нашлось', 'Nothing found', 'Hech narsa topilmadi')}{query ? ` «${query}»` : ''}</td></tr>}
        </tbody>
      </table>
      <div className="foot">
        <span>{tr(lang, `Остатки на ${asOf} · iikoServer`, `Balances as of ${asOf} · iikoServer`, `${asOf} holatiga qoldiqlar · iikoServer`)}</span>
        {list.length > page && <button className="link" type="button" onClick={() => setPage(p => p + PAGE)}>{tr(lang, `Показать ещё ${Math.min(PAGE, list.length - page)}`, `Show ${Math.min(PAGE, list.length - page)} more`, `Yana ${Math.min(PAGE, list.length - page)} ta`)}</button>}
      </div>
    </>
  );
};
