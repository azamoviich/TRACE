import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Package, Scale, Search, X } from 'lucide-react';
import { Language } from '../../types';
import { tr } from '../../constants';
import { traceApi, FinancialInventoryDoc, InventoryItem } from '../../services/traceApi';

// iiko records a stocktake as two sets of corrections: shortages (less on the
// shelf than in the books) and surpluses (more). Its own document list shows
// those two sums side by side, and so does this screen — a single blended
// "amount" hides a 5M shortage behind a 5M surplus.

const money = (n: number) => Math.round(n).toLocaleString('ru-RU');
const qty = (n: number) => {
  const a = Math.abs(n);
  return a.toLocaleString('ru-RU', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 3 });
};
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);

const shortageOf = (d: FinancialInventoryDoc) => d.shortageSum ?? 0;
const surplusOf  = (d: FinancialInventoryDoc) => d.surplusSum ?? 0;

type Tone = 'danger' | 'success' | 'neutral';
const toneText: Record<Tone, string> = { danger: 'text-danger', success: 'text-success', neutral: 'text-text' };

const Stat: React.FC<{
  label: string; value: string; caption?: string; tone: Tone; icon: React.ReactNode;
}> = ({ label, value, caption, tone, icon }) => (
  <div className="flex-1 min-w-[132px] rounded-2xl border border-border bg-background px-4 py-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted font-medium">
      <span className={toneText[tone]}>{icon}</span>
      {label}
    </div>
    <p className={`mt-1.5 text-[20px] leading-none font-semibold metric-number ${toneText[tone]}`}>{value}</p>
    {caption && <p className="mt-1.5 text-[11px] text-muted truncate">{caption}</p>}
  </div>
);

const Totals: React.FC<{
  lang: Language; shortage: number; surplus: number;
  shortageCaption?: string; surplusCaption?: string; netCaption?: string;
}> = ({ lang, shortage, surplus, shortageCaption, surplusCaption, netCaption }) => {
  const net = surplus - shortage;
  return (
    <div className="flex flex-wrap gap-2.5">
      <Stat
        tone="danger" icon={<ArrowDownRight size={12} />}
        label={tr(lang, 'Недостача', 'Shortage', 'Kamomad')}
        value={shortage ? `−${money(shortage)}` : '0'}
        caption={shortageCaption}
      />
      <Stat
        tone="success" icon={<ArrowUpRight size={12} />}
        label={tr(lang, 'Излишки', 'Surplus', 'Ortiqcha')}
        value={surplus ? `+${money(surplus)}` : '0'}
        caption={surplusCaption}
      />
      <Stat
        tone={net < 0 ? 'danger' : net > 0 ? 'success' : 'neutral'} icon={<Scale size={12} />}
        label={tr(lang, 'Итог', 'Net', 'Yakun')}
        value={`${net > 0 ? '+' : net < 0 ? '−' : ''}${money(Math.abs(net))}`}
        caption={netCaption}
      />
    </div>
  );
};

// Shortage grows left from the centre line, surplus right, both on one scale.
const SplitBar: React.FC<{ shortage: number; surplus: number; max: number }> = ({ shortage, surplus, max }) => {
  const pct = (v: number) => (max > 0 ? Math.max(v > 0 ? 3 : 0, (v / max) * 100) : 0);
  return (
    <div className="flex items-center h-2 w-full" aria-hidden>
      <div className="flex-1 flex justify-end">
        <div className="h-2 rounded-l-full bg-danger/70" style={{ width: `${pct(shortage)}%` }} />
      </div>
      <div className="w-px h-3 bg-border" />
      <div className="flex-1">
        <div className="h-2 rounded-r-full bg-success/70" style={{ width: `${pct(surplus)}%` }} />
      </div>
    </div>
  );
};

// ── Document list ────────────────────────────────────────────────────────────

export const StocktakeList: React.FC<{
  docs: FinancialInventoryDoc[];
  lang: Language;
  onOpen: (doc: FinancialInventoryDoc) => void;
}> = ({ docs, lang, onOpen }) => {
  const shortage = docs.reduce((s, d) => s + shortageOf(d), 0);
  const surplus  = docs.reduce((s, d) => s + surplusOf(d), 0);
  const max = Math.max(1, ...docs.map(d => Math.max(shortageOf(d), surplusOf(d))));
  const positions = (n: number) => tr(lang, `${n} поз.`, `${n} items`, `${n} poz.`);

  return (
    <div className="space-y-4">
      <Totals
        lang={lang} shortage={shortage} surplus={surplus}
        shortageCaption={positions(docs.reduce((s, d) => s + (d.shortageCount ?? 0), 0))}
        surplusCaption={positions(docs.reduce((s, d) => s + (d.surplusCount ?? 0), 0))}
        netCaption={tr(lang, `${docs.length} инвентаризаций`, `${docs.length} stocktakes`, `${docs.length} inventarizatsiya`)}
      />

      <p className="text-[11px] text-muted leading-relaxed">
        {tr(lang,
          'Недостача — на полке меньше, чем в учёте. Излишки — больше. Суммы по себестоимости, UZS.',
          'Shortage: less on the shelf than in the books. Surplus: more. Sums at cost, UZS.',
          "Kamomad — javonda hisobdagidan kam. Ortiqcha — ko'p. Summalar tannarx bo'yicha, UZS.")}
      </p>

      <div className="space-y-2">
        {docs.map(doc => {
          const sh = shortageOf(doc), su = surplusOf(doc), net = su - sh;
          return (
            <button
              key={doc.id} type="button" onClick={() => onOpen(doc)}
              className="group w-full text-left rounded-2xl border border-border bg-background hover:bg-card-hover hover:border-primary/40 transition-colors px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="min-w-0 w-[150px] flex-shrink-0">
                  <p className="text-[13px] font-semibold text-text truncate">{doc.storeCode || '—'}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {dmy(doc.date)} · №<span className="font-mono">{doc.documentNumber}</span>
                  </p>
                </div>

                <div className="hidden sm:block flex-1 min-w-[120px]">
                  <SplitBar shortage={sh} surplus={su} max={max} />
                </div>

                <div className="ml-auto flex items-center gap-4 sm:gap-6 flex-shrink-0">
                  <div className="text-right w-[84px] sm:w-[100px]">
                    <p className="text-[13px] font-semibold text-danger metric-number">{sh ? `−${money(sh)}` : '—'}</p>
                    <p className="text-[10px] text-muted mt-0.5">{positions(doc.shortageCount ?? 0)}</p>
                  </div>
                  <div className="text-right w-[84px] sm:w-[100px]">
                    <p className="text-[13px] font-semibold text-success metric-number">{su ? `+${money(su)}` : '—'}</p>
                    <p className="text-[10px] text-muted mt-0.5">{positions(doc.surplusCount ?? 0)}</p>
                  </div>
                  <div className="hidden md:block text-right w-[110px]">
                    <p className={`text-[13px] font-semibold metric-number ${net < 0 ? 'text-danger' : net > 0 ? 'text-success' : 'text-muted'}`}>
                      {net > 0 ? '+' : net < 0 ? '−' : ''}{money(Math.abs(net))}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">{tr(lang, 'итог', 'net', 'yakun')}</p>
                  </div>
                  <ChevronRight size={14} className="text-muted group-hover:text-primary transition-colors" />
                </div>
              </div>
              <div className="sm:hidden mt-3">
                <SplitBar shortage={sh} surplus={su} max={max} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Document detail ──────────────────────────────────────────────────────────

type Filter = 'all' | 'shortage' | 'surplus';

export const StocktakeDrawer: React.FC<{
  doc: FinancialInventoryDoc;
  lang: Language;
  onClose: () => void;
}> = ({ doc, lang, onClose }) => {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    traceApi.financial.inventoryItems(doc.id, doc.date, doc.documentNumber)
      .then(rows => { if (alive) setItems(rows); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [doc.id, doc.date, doc.documentNumber]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const all = items ?? [];
  const shortageItems = all.filter(i => i.sum < 0);
  const surplusItems  = all.filter(i => i.sum > 0);
  // Prefer the document's own totals; fall back to the lines while they load.
  const shortage = doc.shortageSum ?? -shortageItems.reduce((s, i) => s + i.sum, 0);
  const surplus  = doc.surplusSum  ??  surplusItems.reduce((s, i) => s + i.sum, 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter(i => filter === 'all' || (filter === 'shortage' ? i.sum < 0 : i.sum > 0))
      .filter(i => !q || `${i.productName} ${i.productCode} ${i.category}`.toLowerCase().includes(q))
      .sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
  }, [all, filter, query]);

  const maxAbs = Math.max(1, ...all.map(i => Math.abs(i.sum)));

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all',      label: tr(lang, 'Все', 'All', 'Hammasi'),           count: all.length },
    { key: 'shortage', label: tr(lang, 'Недостача', 'Shortage', 'Kamomad'), count: shortageItems.length },
    { key: 'surplus',  label: tr(lang, 'Излишки', 'Surplus', 'Ortiqcha'),   count: surplusItems.length },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">

        <div className="flex items-start justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-text truncate">
              {tr(lang, 'Инвентаризация', 'Stocktake', 'Inventarizatsiya')} · {doc.storeCode || '—'}
            </p>
            <p className="text-[11px] text-muted mt-1">
              {dmy(doc.date)} · №<span className="font-mono">{doc.documentNumber}</span>
            </p>
          </div>
          <button
            onClick={onClose} aria-label={tr(lang, 'Закрыть', 'Close', 'Yopish')}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-card-hover transition-colors ml-4 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-4 flex-shrink-0">
          <Totals
            lang={lang} shortage={shortage} surplus={surplus}
            shortageCaption={doc.shortageAccount || undefined}
            surplusCaption={doc.surplusAccount || undefined}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 pb-3 border-b border-border flex-shrink-0">
          <div className="inline-flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
            {tabs.map(t => (
              <button
                key={t.key} onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-[5px] transition-all ${filter === t.key ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'}`}>
                {t.label} <span className={filter === t.key ? 'opacity-80' : 'opacity-60'}>{t.count}</span>
              </button>
            ))}
          </div>
          <label className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder={tr(lang, 'Найти продукт', 'Find a product', 'Mahsulotni topish')}
              className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-text placeholder:text-muted/60 focus:outline-none focus:border-primary/60"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {loading ? (
            <div className="space-y-3 py-4">
              {[90, 70, 80, 60, 75].map(w => <div key={w} className="h-4 bg-border/60 rounded animate-pulse" style={{ width: `${w}%` }} />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Package size={24} className="text-muted/40" />
              <p className="text-[12px] text-muted">
                {all.length === 0
                  ? tr(lang, 'Расхождений нет', 'No differences', "Farqlar yo'q")
                  : tr(lang, 'Ничего не найдено', 'Nothing found', 'Hech narsa topilmadi')}
              </p>
            </div>
          ) : (
            <ul>
              {visible.map((item, i) => {
                const short = item.sum < 0;
                return (
                  <li key={`${item.productCode}-${item.productName}-${i}`} className="relative border-b border-border/50 last:border-0">
                    <div
                      className={`absolute inset-y-1 left-0 rounded-md ${short ? 'bg-danger/[0.07]' : 'bg-success/[0.07]'}`}
                      style={{ width: `${(Math.abs(item.sum) / maxAbs) * 100}%` }} aria-hidden />
                    <div className="relative flex items-center gap-3 py-2.5 px-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-text truncate">{item.productName}</p>
                        <p className="text-[10px] text-muted mt-0.5 truncate">
                          {[item.category, item.productCode].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 w-[92px]">
                        <p className={`text-[12px] font-mono font-semibold ${short ? 'text-danger' : 'text-success'}`}>
                          {short ? '−' : '+'}{qty(item.diffQty)} <span className="font-sans font-normal text-muted">{item.unit}</span>
                        </p>
                        <p className="hidden sm:block text-[10px] text-muted mt-0.5 font-mono">× {money(item.price ?? 0)}</p>
                      </div>
                      <p className={`text-right flex-shrink-0 w-[104px] text-[13px] font-semibold metric-number ${short ? 'text-danger' : 'text-success'}`}>
                        {short ? '−' : '+'}{money(Math.abs(item.sum))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!loading && all.length > 0 && (
          <div className="px-5 py-3 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted">
              {tr(lang,
                `Показано ${visible.length} из ${all.length} · по убыванию суммы`,
                `Showing ${visible.length} of ${all.length} · largest first`,
                `${all.length} tadan ${visible.length} ta · summa bo'yicha`)}
            </p>
            <p className="text-[11px] text-muted font-mono">
              {visible.length !== all.length && `${money(Math.abs(visible.reduce((s, i) => s + i.sum, 0)))} UZS`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
