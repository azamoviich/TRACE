import React, { useState, useEffect, useMemo } from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import { Language } from '../../types';
import { tr } from '../../constants';
import { traceApi, StockItem, StockSnapshot } from '../../services/traceApi';

// Live store balances for iiko tenants (Склад): what is left, in which store,
// what it is worth. Min/max come from the product card in iiko; a product
// without them can only be flagged as negative.

type StatusFilter = 'all' | 'negative' | 'low' | 'over';
type SortKey = 'value' | 'qty' | 'name';

const STATUS_CLS: Record<StockItem['status'], string> = {
  negative: 'bg-danger/10 text-danger',
  low: 'bg-amber-400/10 text-amber-400',
  over: 'bg-sky-400/10 text-sky-400',
  ok: '',
};

function statusLabel(lang: Language, s: StockItem['status']) {
  return s === 'negative' ? tr(lang, 'Минус', 'Negative', 'Minus')
    : s === 'low' ? tr(lang, 'Ниже минимума', 'Below min', 'Minimumdan kam')
    : s === 'over' ? tr(lang, 'Выше максимума', 'Above max', "Maksimumdan ko'p")
    : '';
}

const fmtQty = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const fmtSum = (n: number) => Math.round(n).toLocaleString('ru-RU');

export const IikoStock: React.FC<{ lang: Language }> = ({ lang }) => {
  const [data, setData] = useState<StockSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('value');
  const [page, setPage] = useState(50);

  useEffect(() => {
    let alive = true;
    traceApi.financial.stock()
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const stores = useMemo(
    () => Array.from(new Set((data?.items ?? []).map(i => i.store))).sort((a, b) => a.localeCompare(b, 'ru')),
    [data],
  );
  const inStore = useMemo(
    () => (data?.items ?? []).filter(i => store === 'all' || i.store === store),
    [data, store],
  );
  const counts = useMemo(() => ({
    negative: inStore.filter(i => i.status === 'negative').length,
    low: inStore.filter(i => i.status === 'low').length,
    over: inStore.filter(i => i.status === 'over').length,
  }), [inStore]);
  const totalValue = useMemo(() => inStore.reduce((s, i) => s + Math.max(0, i.totalValue), 0), [inStore]);

  const list = useMemo(() => {
    let l = inStore;
    if (status !== 'all') l = l.filter(i => i.status === status);
    if (query.trim()) { const q = query.trim().toLowerCase(); l = l.filter(i => i.name.toLowerCase().includes(q)); }
    return [...l].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'ru') : sort === 'qty' ? a.qty - b.qty : b.totalValue - a.totalValue);
  }, [inStore, status, query, sort]);

  if (loading) {
    return <div className="h-32 flex items-center justify-center text-[12px] text-muted">{tr(lang, 'Загрузка остатков из iiko…', 'Loading stock from iiko…', "iiko'dan qoldiqlar yuklanmoqda…")}</div>;
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Package size={28} className="text-muted/40" />
        <p className="text-[12px] text-muted max-w-[260px]">{tr(lang, 'Не удалось получить остатки из iiko', 'Could not load stock from iiko', "iiko'dan qoldiqlarni olib bo'lmadi")}</p>
      </div>
    );
  }

  const asOf = data.asOf.replace('T', ' ').slice(0, 16);
  const chips: { id: StatusFilter; label: string; n?: number; cls: string }[] = [
    { id: 'all', label: tr(lang, 'Все', 'All', 'Hammasi'), cls: '' },
    { id: 'negative', label: statusLabel(lang, 'negative'), n: counts.negative, cls: 'text-danger' },
    { id: 'low', label: statusLabel(lang, 'low'), n: counts.low, cls: 'text-amber-400' },
    { id: 'over', label: statusLabel(lang, 'over'), n: counts.over, cls: 'text-sky-400' },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { label: tr(lang, 'Стоимость остатков', 'Stock value', 'Qoldiq qiymati'), value: fmtSum(totalValue) },
          { label: tr(lang, 'Позиций', 'Lines', 'Pozitsiyalar'), value: inStore.length.toLocaleString('ru-RU') },
          { label: tr(lang, 'В минусе', 'Negative', 'Minusda'), value: String(counts.negative), cls: counts.negative ? 'text-danger' : '' },
          { label: tr(lang, 'Ниже минимума', 'Below min', 'Minimumdan kam'), value: String(counts.low), cls: counts.low ? 'text-amber-400' : '' },
        ].map(t => (
          <div key={t.label} className="bg-background border border-border rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-muted">{t.label}</p>
            <p className={`text-[15px] font-bold metric-number ${t.cls ?? 'text-text'}`}>{t.value}</p>
          </div>
        ))}
      </div>

      {counts.negative > 0 && status === 'all' && (
        <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-danger/5 border border-danger/20">
          <AlertTriangle size={13} className="text-danger mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted">
            {tr(lang,
              `${counts.negative} позиций ушли в минус — обычно это непроведённые приходные накладные или неверные техкарты.`,
              `${counts.negative} lines are below zero — usually unposted incoming invoices or wrong recipes.`,
              `${counts.negative} pozitsiya minusda — odatda kirim yuk xatlari o'tkazilmagan yoki texkarta noto'g'ri.`)}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={store} onChange={e => { setStore(e.target.value); setPage(50); }}
          className="bg-background border border-border rounded-lg px-2.5 py-1 text-text focus:outline-none focus:border-primary max-w-[220px]">
          <option value="all">{tr(lang, 'Все склады', 'All stores', 'Barcha omborlar')}</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {chips.map(c => (
          <button key={c.id} onClick={() => { setStatus(c.id); setPage(50); }}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${status === c.id ? 'border-primary text-primary bg-primary/10' : `border-border hover:text-text ${c.cls || 'text-muted'}`}`}>
            {c.label}{c.n != null ? ` · ${c.n}` : ''}
          </button>
        ))}
        <input value={query} onChange={e => { setQuery(e.target.value); setPage(50); }}
          placeholder={tr(lang, 'Поиск товара', 'Search item', 'Mahsulot qidirish')}
          className="flex-1 min-w-[140px] bg-transparent border border-border rounded-lg px-2.5 py-1 text-text placeholder:text-muted focus:outline-none focus:border-primary" />
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
          className="bg-background border border-border rounded-lg px-2.5 py-1 text-text focus:outline-none focus:border-primary">
          <option value="value">{tr(lang, 'По сумме', 'By value', "Summa bo'yicha")}</option>
          <option value="qty">{tr(lang, 'По остатку', 'By quantity', "Qoldiq bo'yicha")}</option>
          <option value="name">{tr(lang, 'По названию', 'By name', "Nomi bo'yicha")}</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[640px]">
          <thead className="border-b border-border">
            <tr>
              {[
                tr(lang, 'Товар', 'Item', 'Mahsulot'),
                tr(lang, 'Склад', 'Store', 'Ombor'),
                tr(lang, 'Остаток', 'Left', 'Qoldiq'),
                tr(lang, 'Мин / Макс', 'Min / Max', 'Min / Maks'),
                tr(lang, 'Цена ед.', 'Unit cost', 'Birlik narxi'),
                tr(lang, 'Сумма', 'Value', 'Summa'),
                '',
              ].map((h, i) => (
                <th key={i} className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, page).map(i => (
              <tr key={i.storeId + i.id} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                <td className="py-2.5 pr-4 max-w-[240px]"><p className="text-[12px] font-medium text-text truncate">{i.name}</p></td>
                <td className="py-2.5 pr-4 text-[11px] text-muted max-w-[180px] truncate">{i.store}</td>
                <td className={`py-2.5 pr-4 text-[12px] font-semibold metric-number whitespace-nowrap ${i.qty < 0 ? 'text-danger' : 'text-text'}`}>{fmtQty(i.qty)} {i.unit}</td>
                <td className="py-2.5 pr-4 text-[11px] text-muted metric-number whitespace-nowrap">
                  {i.min != null || i.max != null ? `${i.min != null ? fmtQty(i.min) : '—'} / ${i.max != null ? fmtQty(i.max) : '—'}` : '—'}
                </td>
                <td className="py-2.5 pr-4 text-[12px] text-muted metric-number">{i.unitCost ? fmtSum(i.unitCost) : '—'}</td>
                <td className={`py-2.5 pr-4 text-[12px] font-semibold metric-number ${i.totalValue < 0 ? 'text-danger' : 'text-text'}`}>{fmtSum(i.totalValue)}</td>
                <td className="py-2.5">
                  {i.status !== 'ok' && (
                    <span className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold whitespace-nowrap ${STATUS_CLS[i.status]}`}>{statusLabel(lang, i.status)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && (
        <p className="py-6 text-center text-[12px] text-muted">{tr(lang, 'Ничего не найдено', 'Nothing found', 'Hech narsa topilmadi')}</p>
      )}
      {list.length > page && (
        <button onClick={() => setPage(p => p + 50)}
          className="mt-3 w-full py-2 text-[11px] font-medium text-muted hover:text-text border border-border hover:border-primary/40 rounded-lg transition-all">
          {tr(lang, `Показать ещё (${list.length - page})`, `Show more (${list.length - page})`, `Ko'proq ko'rsat (${list.length - page})`)}
        </button>
      )}
      <p className="mt-3 text-[10px] text-muted">{tr(lang, `Остатки на ${asOf} · iikoServer`, `Balances as of ${asOf} · iikoServer`, `${asOf} holatiga qoldiqlar · iikoServer`)}</p>
    </div>
  );
};
