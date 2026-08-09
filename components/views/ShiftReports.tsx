import React, { useState, useEffect } from 'react';
import { ClipboardList, Trash2, Sun, Moon, MapPin, CheckCircle, XCircle, ChevronDown, ChevronUp, ChevronRight, RefreshCw, Sparkles, TrendingUp, AlertTriangle } from 'lucide-react';
import { Language, ShiftReport } from '../../types';
import { traceApi, analyzeShiftReport, getTenantPlan, ShiftReportAnalysis } from '../../services/traceApi';
import { Card } from '../ui/Card';
import { ProLock } from '../ui/ProLock';
import { tr } from '../../constants';

const isBasePlan = getTenantPlan() === 'base';

const BRANCHES = ['Мирабад', 'Нукус'] as const;

function formatDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}.${m}.${y}`;
}

function shiftLabel(shift: string, lang: Language) {
  if (shift === 'morning') return tr(lang, 'Утро 07:30–15:30', 'Morning 07:30–15:30', 'Ertalab 07:30–15:30');
  return tr(lang, 'Вечер 15:30–00:00', 'Evening 15:30–00:00', 'Kechqurun 15:30–00:00');
}

function PhotoToggle({ photos, lang }: { photos: string[]; lang: Language }) {
  const [open, setOpen] = React.useState(false);
  if (!photos.length) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[10px] text-muted hover:text-primary transition-colors mt-1"
      >
        <ChevronRight size={11} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        {photos.length} {tr(lang, 'фото', 'photos', 'rasm')}
      </button>
      {open && (
        <div className="grid grid-cols-4 gap-1 mt-1.5">
          {photos.map((url, j) => (
            <a key={j} href={url} target="_blank" rel="noopener noreferrer"
              className="aspect-square rounded-[3px] overflow-hidden bg-card border border-border block hover:opacity-80 transition-opacity">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export const ShiftReports: React.FC<{ lang: Language }> = ({ lang }) => {
  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterShift, setFilterShift] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [analysisMap, setAnalysisMap] = useState<Record<string, { loading: boolean; data: ShiftReportAnalysis | null; error?: string }>>({});
  const [trends, setTrends] = useState<{ patterns?: { topic: string; detail: string; severity: 'low' | 'medium' | 'high' }[]; topConcerns?: string[]; summary?: string; alertLevel?: string; stats?: { total: number; goodPct: number; badPct: number; managers: { name: string; total: number; bad: number }[]; branches: { name: string; total: number; bad: number }[] } } | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (filterBranch !== 'all') params.branch = filterBranch;
      if (filterShift !== 'all') params.shift = filterShift;
      const data = await traceApi.shiftReports.list(params);
      setReports(data);
    } catch {
      setError(tr(lang, 'Не удалось загрузить отчёты', 'Failed to load reports', "Hisobotlarni yuklab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterBranch, filterShift]);

  const handleAnalyze = async (report: ShiftReport) => {
    setAnalysisMap(m => ({ ...m, [report.id]: { loading: true, data: null, error: undefined } }));
    try {
      const data = await analyzeShiftReport(report, lang);
      setAnalysisMap(m => ({ ...m, [report.id]: { loading: false, data, error: undefined } }));
    } catch (e: any) {
      const msg = String(e.message ?? e);
      console.error('[analyzeShiftReport]', msg, e);
      setAnalysisMap(m => ({ ...m, [report.id]: { loading: false, data: null, error: msg } }));
    }
  };

  const loadTrends = () => {
    setTrendsLoading(true);
    traceApi.ai.shiftTrends(lang)
      .then(r => { if (r.fromAI) setTrends(r); })
      .catch(() => {}).finally(() => setTrendsLoading(false));
  };

  const handleDelete = async (id: string) => {
    if (!confirm(tr(lang, 'Удалить отчёт?', 'Delete report?', "Hisobotni o'chirish?"))) return;
    try {
      await traceApi.shiftReports.remove(id);
      setReports(r => r.filter(x => x.id !== id));
    } catch { /* silently ignore */ }
  };

  const goodCount = reports.filter(r => r.status === 'good').length;
  const badCount  = reports.filter(r => r.status === 'bad').length;

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-primary" />
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted font-medium">
            {tr(lang, 'Отчёты по сменам', 'Shift Reports', 'Smena hisobotlari')}
          </h2>
        </div>
        <button onClick={load} disabled={loading}
          className="text-muted hover:text-text transition-colors disabled:opacity-40">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Shift trend analysis */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <TrendingUp size={13} className="text-primary" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
              {tr(lang, 'Анализ трендов смен', 'Shift trend analysis', 'Smena tendentsiyalari tahlili')}
            </p>
          </div>
          <button onClick={loadTrends} disabled={trendsLoading} className="text-[11px] font-medium text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50">
            {trendsLoading ? tr(lang, 'Анализ...', 'Analyzing...', 'Tahlil qilinmoqda...') : trends ? tr(lang, 'Обновить', 'Refresh', 'Yangilash') : tr(lang, 'Анализировать', 'Analyze', 'Tahlil qilish')}
          </button>
        </div>
        {!trends && !trendsLoading && <p className="text-[12px] text-muted/50 mt-2">{tr(lang, 'Находит паттерны по менеджерам, филиалам и инцидентам за последние 40 смен.', 'Finds patterns across managers, branches, and incidents over the last 40 shifts.', "Oxirgi 40 smena bo'yicha menejerlar, filiallar va insidentlardagi qoliplarni topadi.")}</p>}
        {trendsLoading && <div className="mt-3 space-y-2">{[70, 50, 60].map(w => <div key={w} className="h-3 bg-border/60 rounded animate-pulse" style={{ width: `${w}%` }} />)}</div>}
        {trends && !trendsLoading && (
          <div className="mt-3 space-y-3">
            {trends.alertLevel === 'high' && (
              <div className="flex items-center gap-1.5 text-danger text-[11px] font-semibold">
                <AlertTriangle size={11} />
                {tr(lang, 'Тревожный сигнал', 'Alert signal', 'Ogohlantirish signali')}
              </div>
            )}
            {trends.summary && <p className="text-[12px] text-muted leading-relaxed">{trends.summary}</p>}
            {trends.stats && (
              <div className="flex gap-4 flex-wrap">
                {trends.stats.branches.map(b => (
                  <div key={b.name} className="text-[11px]">
                    <span className="text-text font-semibold">{b.name}</span>
                    <span className="text-muted ml-1">{b.total} {tr(lang, 'смен', 'shifts', 'smena')}</span>
                    {b.bad > 0 && <span className="text-danger ml-1">· {b.bad} {tr(lang, 'плохих', 'bad', 'yomon')}</span>}
                  </div>
                ))}
              </div>
            )}
            {trends.patterns && trends.patterns.length > 0 && (
              <div className="space-y-1.5">
                {trends.patterns.map((p, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`text-[10px] font-bold mt-0.5 flex-shrink-0 ${p.severity === 'high' ? 'text-danger' : p.severity === 'medium' ? 'text-yellow-400' : 'text-muted'}`}>
                      {p.severity === 'high' ? '!' : p.severity === 'medium' ? '▲' : '–'}
                    </span>
                    <div>
                      <p className="text-[11px] text-text font-medium">{p.topic}</p>
                      <p className="text-[11px] text-muted">{p.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {trends.topConcerns && trends.topConcerns.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-danger font-medium mb-1.5">{tr(lang, 'Главные проблемы', 'Top concerns', 'Asosiy muammolar')}</p>
                {trends.topConcerns.map((c, i) => (
                  <div key={i} className="flex gap-2 text-[11px] text-[#c0c0c0] mb-1">
                    <span className="text-danger flex-shrink-0">→</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-px bg-border rounded-md overflow-hidden">
        {[
          { value: reports.length, label: tr(lang, 'Всего отчётов', 'Total', 'Jami hisobotlar') },
          { value: goodCount, label: tr(lang, 'Хорошие смены', 'Good shifts', 'Yaxshi smenalar'), color: 'text-success' },
          { value: badCount,  label: tr(lang, 'Плохие смены', 'Bad shifts', 'Yomon smenalar'),  color: 'text-danger'  },
        ].map(s => (
          <div key={s.label} className="bg-card px-4 py-3 text-center">
            <p className={`metric-number text-[22px] font-black ${s.color ?? 'text-text'}`}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1">
          {['all', ...BRANCHES].map(b => (
            <button key={b} onClick={() => setFilterBranch(b)}
              className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors flex items-center gap-1 ${filterBranch === b ? 'bg-primary text-white' : 'bg-card border border-border text-muted hover:text-text'}`}>
              {b !== 'all' && <MapPin size={9} />}
              {b === 'all' ? tr(lang, 'Все филиалы', 'All branches', 'Barcha filiallar') : b}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['all', 'morning', 'evening'] as const).map(s => (
            <button key={s} onClick={() => setFilterShift(s)}
              className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors flex items-center gap-1 ${filterShift === s ? 'bg-primary text-white' : 'bg-card border border-border text-muted hover:text-text'}`}>
              {s === 'morning' && <Sun size={9} />}
              {s === 'evening' && <Moon size={9} />}
              {s === 'all' ? tr(lang, 'Все смены', 'All shifts', 'Barcha smenalar') : shiftLabel(s, lang)}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass rounded-3xl p-4 animate-pulse h-20" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-danger/5 border border-danger/20 rounded-md p-4 text-[13px] text-danger">{error}</div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="glass rounded-3xl p-10 text-center text-muted text-[13px]">
          {tr(lang, 'Отчётов пока нет', 'No reports yet', "Hisobotlar hali yo'q")}
        </div>
      )}

      {!loading && reports.map((report) => (
        <div key={report.id}
          className={`rounded-md border transition-colors ${
            report.status === 'good'
              ? 'bg-success/5 border-success/25 hover:border-success/40'
              : 'bg-danger/5 border-danger/25 hover:border-danger/40'
          }`}
        >
          <div className="p-4">
            {/* Top row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {report.status === 'good'
                  ? <CheckCircle size={14} className="text-success flex-shrink-0" />
                  : <XCircle    size={14} className="text-danger flex-shrink-0" />}
                <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${report.status === 'good' ? 'text-success' : 'text-danger'}`}>
                  {report.status === 'good' ? tr(lang, 'Хорошая смена', 'Good shift', 'Yaxshi smena') : tr(lang, 'Плохая смена', 'Bad shift', 'Yomon smena')}
                </span>
                <span className="text-muted text-[10px]">·</span>
                <span className="text-[12px] font-semibold text-text">{report.manager_name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => {
                  setExpanded(expanded === report.id ? null : report.id);
                }} className="text-muted hover:text-text transition-colors">
                  {expanded === report.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button onClick={() => handleDelete(report.id)} className="text-muted hover:text-danger transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <div className="flex items-center gap-1 text-[11px] text-muted">
                <MapPin size={10} />{report.branch}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted">
                {report.shift === 'morning' ? <Sun size={10} /> : <Moon size={10} />}
                {shiftLabel(report.shift, lang)}
              </div>
              <span className="text-[11px] text-muted">{formatDate(report.date)}</span>
              {report.tables_total != null && report.tables_total > 0 && (() => {
                const covered = report.tables_covered ?? ((report.good_feedbacks?.length ?? 0) + (report.bad_feedbacks?.length ?? 0));
                const left = Math.max(0, report.tables_total - covered);
                return (
                  <span className={`text-[10px] font-medium ${left > 0 ? 'text-danger' : 'text-primary'}`}>
                    {covered}/{report.tables_total} {tr(lang, 'столов с отзывом', 'tables covered', 'stol qamrovi')}
                    {left > 0 && ` · ${tr(lang, `осталось ${left}`, `${left} left`, `${left} qoldi`)}`}
                  </span>
                );
              })()}
              {(report.good_feedbacks?.length > 0 || report.bad_feedbacks?.length > 0) && (
                <div className="flex gap-2">
                  {report.good_feedbacks?.length > 0 && (
                    <span className="text-[10px] text-success font-medium">+{report.good_feedbacks.length} {tr(lang, 'позитивных', 'positive', 'ijobiy')}</span>
                  )}
                  {report.bad_feedbacks?.length > 0 && (
                    <span className="text-[10px] text-danger font-medium">−{report.bad_feedbacks.length} {tr(lang, `инцидент${report.bad_feedbacks.length > 1 ? 'ов' : ''}`, 'incidents', 'insident')}</span>
                  )}
                </div>
              )}
            </div>

            {/* Expanded details */}
            {expanded === report.id && (
              <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                {/* KPI */}
                {(report.cash_total || report.guests_count || report.avg_check || report.weather || report.prev_manager) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                    {report.weather      && <span>{report.weather}</span>}
                    {report.guests_count != null && <span>{report.guests_count} {tr(lang, 'гостей', 'guests', 'mehmon')}</span>}
                    {report.cash_total   != null && <span>{Number(report.cash_total).toLocaleString()} {tr(lang, 'сум', 'UZS', "so'm")}</span>}
                    {report.avg_check    != null && <span>{tr(lang, 'ср. чек', 'avg check', "o'rt. chek")} {Number(report.avg_check).toLocaleString()} {tr(lang, 'сум', 'UZS', "so'm")}</span>}
                    {report.prev_manager && <span>{tr(lang, 'принял у', 'took over from', 'qabul qildi')} {report.prev_manager}</span>}
                  </div>
                )}

                {/* Good feedbacks */}
                {report.good_feedbacks?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-success font-medium">{tr(lang, 'Положительные отзывы', 'Positive feedback', 'Ijobiy fikrlar')}</p>
                    {report.good_feedbacks.map((fb, i) => (
                      <div key={i} className="bg-success/8 border border-success/20 rounded-lg px-3 py-2 text-[12px]">
                        <span className="text-success font-semibold">{tr(lang, 'Стол', 'Table', 'Stol')} {fb.table}</span>
                        <span className="text-[#c0c0c0]"> — {fb.note}</span>
                        {fb.photos && fb.photos.length > 0 && <PhotoToggle photos={fb.photos} lang={lang} />}
                      </div>
                    ))}
                  </div>
                )}

                {/* Bad feedbacks */}
                {report.bad_feedbacks?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-danger font-medium">{tr(lang, 'Жалобы и инциденты', 'Complaints and incidents', 'Shikoyatlar va insidentlar')}</p>
                    {report.bad_feedbacks.map((fb, i) => (
                      <div key={i} className="bg-danger/8 border border-danger/20 rounded-lg px-3 py-2 text-[12px]">
                        <span className="text-danger font-semibold">{tr(lang, 'Стол', 'Table', 'Stol')} {fb.table}</span>
                        {fb.time && <span className="text-muted"> · {fb.time}</span>}
                        <span className="text-[#c0c0c0]"> — {fb.note}</span>
                        {fb.photos && fb.photos.length > 0 && <PhotoToggle photos={fb.photos} lang={lang} />}
                      </div>
                    ))}
                  </div>
                )}

                {/* General text */}
                {report.report_text && (
                  <p className="text-[13px] text-[#c0c0c0] leading-relaxed whitespace-pre-wrap break-words">{report.report_text}</p>
                )}

                {/* AI Analysis */}
                {isBasePlan ? (
                  <div className="pt-2 border-t border-border/50">
                    <ProLock
                      lang={lang}
                      title={tr(lang, 'AI-анализ смены', 'AI shift analysis', 'AI smena tahlili')}
                      description={tr(lang, 'Умный разбор смены: аномалии, советы, итоги', 'Smart shift breakdown: anomalies, tips, and summary', 'Aqlli smena tahlili: anomaliyalar, maslahatlar va xulosa')}
                    />
                  </div>
                ) : (
                <div className="pt-2 border-t border-border/50">
                  {analysisMap[report.id]?.loading && (
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
                      <Sparkles size={10} className="text-primary" />
                      {tr(lang, 'AI анализирует смену...', 'AI analyzing shift...', 'AI smenani tahlil qilmoqda...')}
                    </div>
                  )}

                  {!analysisMap[report.id] && (
                    <button
                      onClick={() => handleAnalyze(report)}
                      className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary-hover font-medium transition-colors"
                    >
                      <Sparkles size={11} />
                      {tr(lang, 'Анализировать смену', 'Analyze shift', 'Smenani tahlil qilish')}
                    </button>
                  )}

                  {analysisMap[report.id] && !analysisMap[report.id].loading && !analysisMap[report.id].data && (
                    <div className="space-y-2">
                      {analysisMap[report.id].error && (
                        <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                          <p className="text-[11px] text-danger">{tr(lang, 'Не удалось получить анализ. Попробуйте ещё раз.', 'Could not get analysis. Please try again.', "Tahlil olib bo'lmadi. Qaytadan urining.")}</p>
                        </div>
                      )}
                      <button
                        onClick={() => handleAnalyze(report)}
                        className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary-hover font-medium transition-colors"
                      >
                        <Sparkles size={11} />
                        {tr(lang, 'Повторить анализ', 'Retry analysis', 'Tahlilni qaytarish')}
                      </button>
                    </div>
                  )}

                  {analysisMap[report.id]?.data && (() => {
                    const a = analysisMap[report.id].data!;
                    return (
                      <div className="space-y-3 mt-1">
                        {/* Score + summary */}
                        <div className="flex items-start gap-3">
                          {a.score != null && (
                            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-[16px] font-black border ${
                              a.score >= 8 ? 'bg-success/10 border-success/30 text-success'
                              : a.score >= 5 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                              : 'bg-danger/10 border-danger/30 text-danger'
                            }`}>
                              {a.score}
                            </div>
                          )}
                          <p className="text-[12px] text-[#c0c0c0] leading-relaxed">{a.summary}</p>
                        </div>

                        {/* Positives */}
                        {a.positives.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.15em] text-success font-medium mb-1.5">
                              {tr(lang, 'Что прошло хорошо', 'What went well', "Nima yaxshi bo'ldi")}
                            </p>
                            {a.positives.map((p, i) => (
                              <div key={i} className="flex gap-2 text-[12px] text-[#c0c0c0] mb-1">
                                <span className="text-success mt-0.5 flex-shrink-0">✓</span>
                                <span>{p}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Concerns */}
                        {a.concerns.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.15em] text-danger font-medium mb-1.5">
                              {tr(lang, 'Требует внимания', 'Needs attention', "E'tibor talab qiladi")}
                            </p>
                            {a.concerns.map((c, i) => (
                              <div key={i} className="flex gap-2 text-[12px] text-[#c0c0c0] mb-1">
                                <span className="text-danger mt-0.5 flex-shrink-0">!</span>
                                <span>{c}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Recommendations */}
                        {a.recommendations.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium mb-1.5">
                              {tr(lang, 'Рекомендации', 'Recommendations', 'Tavsiyalar')}
                            </p>
                            {a.recommendations.map((r, i) => (
                              <div key={i} className="flex gap-2 text-[12px] text-[#c0c0c0] mb-1">
                                <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
