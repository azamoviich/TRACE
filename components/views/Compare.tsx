// Сравнение филиалов — redesigned per TRACE-mockups/owner/more.js S.compare
// (styles/rd/more.css): AI on why branches differ, the metrics side by side
// with the leader in bold, one metric by day, top dishes and category mix.
import React, { useEffect, useMemo, useState } from 'react';
import { tr } from '../../constants';
import { Language } from '../../types';
import { traceApi, BranchSummary, BranchCompareResult } from '../../services/traceApi';
import { AiMeta, Empty, MultiLine, Opt, PeriodSeg, PeriodValue, Pop, Skel, fmt, money, seriesCls, wdShort } from '../rd/ui';

type Range = 'today' | '7days' | '30days';
type Metric = 'revenue' | 'orders' | 'avgCheck' | 'guests';

export const Compare: React.FC<{ lang: Language; branches: BranchSummary[] }> = ({ lang }) => {
  const T = (ru: string, en: string, uz: string) => tr(lang, ru, en, uz);
  const [period, setPeriod] = useState<PeriodValue>({ range: '7days', custom: null });
  const range = period.range as Range;
  const [data, setData] = useState<BranchCompareResult[] | null>(null);
  const [metric, setMetric] = useState<Metric>('revenue');
  const [ai, setAi] = useState<{ state: 'empty' | 'loading' | 'done'; text?: string; err?: boolean; when?: string }>({ state: 'empty' });

  useEffect(() => {
    setData(null);
    setAi({ state: 'empty' });
    traceApi.org.compare(range)
      .then(d => setData(d.branches ?? []))
      .catch(() => setData([]));
  }, [range]);

  const valid = useMemo(() => (data ?? []).filter(b => !b.error), [data]);
  const failed = useMemo(() => (data ?? []).filter(b => b.error), [data]);

  const METRICS: { key: Metric; label: string; money: boolean }[] = [
    { key: 'revenue', label: T('Выручка', 'Revenue', 'Tushum'), money: true },
    { key: 'orders', label: T('Заказы', 'Orders', 'Buyurtmalar'), money: false },
    { key: 'avgCheck', label: T('Средний чек', 'Avg check', "O'rtacha chek"), money: true },
    { key: 'guests', label: T('Гости', 'Guests', 'Mehmonlar'), money: false },
  ];
  const val = (b: BranchCompareResult, k: Metric) => (b[k] as number | undefined) ?? 0;
  const best = (k: Metric) => Math.max(0, ...valid.map(b => val(b, k)));
  const show = (k: Metric, v: number) => METRICS.find(m => m.key === k)!.money ? money(v, lang) : fmt(v);

  // Day axis: union of every branch's dates.
  const dates = useMemo(() => [...new Set(valid.flatMap(b => (b.series ?? []).map(r => r.date.slice(0, 10))))].sort(), [valid]);
  const labels = dates.map(d => range === '30days' ? `${+d.slice(8, 10)}.${d.slice(5, 7)}` : wdShort(d, lang));
  const series = valid.map(b => {
    const by = new Map((b.series ?? []).map(r => [r.date.slice(0, 10), r]));
    return {
      name: b.name,
      v: dates.map(d => {
        const r = by.get(d);
        if (!r) return null;
        return metric === 'avgCheck' ? (r.orders ? r.revenue / r.orders : null) : metric === 'revenue' ? r.revenue : metric === 'orders' ? r.orders : r.guests;
      }),
    };
  });
  const isMoney = metric === 'revenue' || metric === 'avgCheck';

  // Dishes: union of every branch's top list, ordered by combined revenue.
  const dishes = useMemo(() => {
    const tot = new Map<string, number>();
    for (const b of valid) for (const d of b.topDishes ?? []) tot.set(d.name, (tot.get(d.name) ?? 0) + d.revenue);
    return [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
  }, [valid]);
  const cats = useMemo(() => {
    const tot = new Map<string, number>();
    for (const b of valid) for (const c of b.categories ?? []) tot.set(c.name, (tot.get(c.name) ?? 0) + c.revenue);
    return [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
  }, [valid]);
  const catPct = (b: BranchCompareResult, name: string) => {
    const list = b.categories ?? [];
    const total = list.reduce((s, c) => s + c.revenue, 0);
    const c = list.find(x => x.name === name);
    return c && total ? c.revenue / total * 100 : null;
  };

  const periodName = range === 'today' ? T('сегодня', 'today', 'bugun') : range === '7days' ? T('за 7 дней', 'last 7 days', '7 kunda') : T('за 30 дней', 'last 30 days', '30 kunda');

  const runAi = () => {
    setAi({ state: 'loading' });
    const lines = valid.map(b => {
      const top = (b.topDishes ?? []).slice(0, 5).map(d => `${d.name} ${d.quantity} шт / ${Math.round(d.revenue)} UZS`).join('; ');
      const cat = (b.categories ?? []).map(c => `${c.name} ${Math.round(catPct(b, c.name) ?? 0)}%`).join('; ');
      return `${b.name}: выручка ${Math.round(val(b, 'revenue'))} UZS, заказы ${val(b, 'orders')}, средний чек ${Math.round(val(b, 'avgCheck'))} UZS, гости ${val(b, 'guests')}\n  Топ блюд: ${top || '—'}\n  Категории (доля выручки): ${cat || '—'}`;
    }).join('\n');
    const context = `[branch-compare] Сравнение филиалов ${periodName}\n${lines}`;
    const ask = T(
      'Почему филиалы расходятся? Коротко: в чём главный разрыв (трафик, чек, меню) и 2–3 конкретных шага для отстающего филиала.',
      'Why do the branches differ? Briefly: where is the main gap (traffic, check, menu), and 2–3 concrete steps for the lagging branch.',
      "Nega filiallar farq qiladi? Qisqacha: asosiy farq qayerda (oqim, chek, menyu) va ortda qolgan filial uchun 2–3 aniq qadam.",
    );
    traceApi.ai.chat(context, [{ role: 'user', text: ask }], lang)
      .then(r => setAi({ state: 'done', text: r.text, when: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }) }))
      .catch(() => setAi({ state: 'empty', err: true }));
  };

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>{T('Сравнение филиалов', 'Branch comparison', 'Filiallarni taqqoslash')}</h1>
          <div className="sub">{data ? T(`${valid.length} филиала, ${periodName}`, `${valid.length} branches, ${periodName}`, `${valid.length} ta filial, ${periodName}`) : T('Загружаем…', 'Loading…', 'Yuklanmoqda…')}</div>
        </div>
        <PeriodSeg lang={lang} value={period} onChange={setPeriod} allowCustom={false} />
      </div>

      {!data && <div className="card"><Skel lines={['w9', 'w7', 'w9', 'w5', 'w9']} /></div>}

      {data && valid.length < 2 && (
        <div className="card"><Empty>{valid.length === 0 && failed.length
          ? T('Не удалось получить данные филиалов. Попробуйте позже.', "Couldn't load branch data. Try again later.", "Filiallar ma'lumotini olib bo'lmadi. Keyinroq urinib ko'ring.")
          : T('Сравнивать не с чем. Нужно хотя бы два филиала в одной сети.', 'Nothing to compare yet. You need at least two branches in one chain.', "Taqqoslash uchun kamida ikkita filial kerak.")}</Empty></div>
      )}

      {data && valid.length >= 2 && (
        <>
          <section className="ai rise" data-state={ai.state} aria-labelledby="h-cai">
            <div className="ai-head"><h2 id="h-cai">{T('Почему филиалы расходятся', 'Why the branches differ', 'Nega filiallar farq qiladi')}</h2>{ai.state === 'done' && <AiMeta lang={lang} when={ai.when} onRerun={runAi} />}</div>
            {ai.state === 'empty' && <div className="st-empty"><p className="ai-desc">{T('AI сравнит выручку, чек, меню и загрузку и скажет, что даёт разницу.', 'AI compares revenue, check, menu and traffic and says what makes the difference.', "AI tushum, chek, menyu va oqimni taqqoslab, farq nimadan ekanini aytadi.")}
              {ai.err && <span className="rd-err" style={{ display: 'block' }}>{T('Не получилось. Попробуйте позже.', "Didn't work. Try later.", "Bo'lmadi. Keyinroq urinib ko'ring.")}</span>}</p>
              <button className="btn solid" type="button" onClick={runAi}><i className="ph ph-sparkle" aria-hidden="true" />{T('Сравнить филиалы', 'Compare branches', 'Filiallarni taqqoslash')}</button></div>}
            {ai.state === 'loading' && <div className="st-loading" aria-live="polite"><p className="ai-wait">{T('Сравниваем филиалы…', 'Comparing branches…', 'Filiallarni taqqoslayapmiz…')}</p><Skel lines={['w9', 'w7', 'w5']} /></div>}
            {ai.state === 'done' && <div className="st-done"><p className="ai-out">{ai.text}</p></div>}
          </section>

          <div className="stack">
            <section className="card rise" aria-labelledby="h-cm">
              <div className="card-h"><h2 id="h-cm">{T('Показатели', 'Metrics', "Ko'rsatkichlar")}</h2><span className="sec-note">{T('Жирным отмечен лидер, ниже — отставание от него', 'Leader in bold, gap to the leader below', "Yetakchi qalin, ostida undan farq")}</span></div>
              <div className="tbl-wrap"><table>
                <thead><tr><th />{valid.map(b => <th key={b.id} className="r">{b.name}</th>)}</tr></thead>
                <tbody>{METRICS.map(m => {
                  const top = best(m.key);
                  return (
                    <tr key={m.key}><td>{m.label}</td>{valid.map(b => {
                      const v = val(b, m.key), lead = v === top && top > 0;
                      const gap = top > 0 && !lead ? (v / top - 1) * 100 : null;
                      return <td key={b.id} className={`r num${lead ? ' lead' : ''}`}>{show(m.key, v)}{gap != null && <small className="neg">−{Math.abs(Math.round(gap))}%</small>}</td>;
                    })}</tr>
                  );
                })}</tbody>
              </table></div>
              {failed.length > 0 && <p className="note">{T(`Нет данных: ${failed.map(b => b.name).join(', ')}`, `No data: ${failed.map(b => b.name).join(', ')}`, `Ma'lumot yo'q: ${failed.map(b => b.name).join(', ')}`)}</p>}
            </section>

            {dates.length > 0 && (
              <section className="card rise" aria-labelledby="h-cd">
                <div className="card-h"><h2 id="h-cd">{T('По дням', 'By day', "Kunlar bo'yicha")}</h2>
                  <Pop right label={<span>{METRICS.find(m => m.key === metric)!.label}</span>}>
                    {close => METRICS.map(m => <Opt key={m.key} checked={metric === m.key} onClick={() => { setMetric(m.key); close(); }}>{m.label}</Opt>)}
                  </Pop>
                </div>
                <MultiLine labels={labels} series={series} axis={isMoney ? (v => money(v, lang)) : (v => String(Math.round(v)))} tip={isMoney ? (v => money(v, lang)) : fmt} />
                <div className="legend" style={{ marginTop: 10 }}>{valid.map((b, i) => <span key={b.id}><i className={seriesCls(i)} />{b.name}</span>)}</div>
              </section>
            )}

            <div className="grid2">
              <section className="card rise" aria-labelledby="h-cdish">
                <div className="card-h"><h2 id="h-cdish">{T('Топ блюд', 'Top dishes', 'Top taomlar')}</h2><span className="sec-note">{T('штук за период', 'pcs in period', 'davrda dona')}</span></div>
                {dishes.length === 0 ? <Empty>{T('Нет данных', 'No data', "Ma'lumot yo'q")}</Empty> : <div className="tbl-wrap"><table>
                  <thead><tr><th />{valid.map(b => <th key={b.id} className="r">{b.name}</th>)}</tr></thead>
                  <tbody>{dishes.map(name => {
                    const q = valid.map(b => (b.topDishes ?? []).find(d => d.name === name)?.quantity ?? null);
                    const top = Math.max(0, ...q.map(x => x ?? 0));
                    return <tr key={name}><td>{name}</td>{q.map((x, i) => <td key={i} className={`r num${x != null && x === top && top > 0 ? ' lead' : ''}`}>{x != null ? fmt(x) : <span className="faint">—</span>}</td>)}</tr>;
                  })}</tbody>
                </table></div>}
              </section>
              <section className="card rise" aria-labelledby="h-ccat">
                <div className="card-h"><h2 id="h-ccat">{T('Категории, доля выручки', 'Categories, share of revenue', 'Toifalar, tushum ulushi')}</h2></div>
                {cats.length === 0 ? <Empty>{T('Нет данных', 'No data', "Ma'lumot yo'q")}</Empty> : <div className="tbl-wrap"><table>
                  <thead><tr><th />{valid.map(b => <th key={b.id} className="r">{b.name}</th>)}</tr></thead>
                  <tbody>{cats.map(name => <tr key={name}><td>{name}</td>{valid.map(b => {
                    const p = catPct(b, name);
                    return <td key={b.id} className="r num">{p != null ? `${Math.round(p)}%` : <span className="faint">—</span>}</td>;
                  })}</tr>)}</tbody>
                </table></div>}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
};
