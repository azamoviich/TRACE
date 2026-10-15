// TRACE Employee — owner-facing admin surface for the employee mobile app.
// Structured like Checklists.tsx: one file, internal tab state. Phase 0 ships
// only the Geofence tab (branch clock-in radius + attendance/payroll policy);
// Roster/Shifts/Swaps/Payroll/Rules tabs land in later phases as more tabs
// added to the same `Tab` union, following this file's own pattern.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Locate, ShieldCheck, ShieldAlert, Save, Plus, Send, Check, X, Calendar, Pin, FileText, Link as LinkIcon, MessageSquare, Trash2, Upload, Folder, BellOff } from 'lucide-react';
import { Card } from '../ui/Card';
import { Wallet } from 'lucide-react';
import { Language, ChecklistRole, ChecklistEmployee } from '../../types';
import { Lock, ShieldQuestion } from 'lucide-react';
import {
  traceApi, WorkforceGeofenceSettings, checklistApi, RosterShift, SwapRequest, PayProfile, PayrollPeriod, Payslip, PayrollRule, EmployeeSchedule,
  RosterCoverageRow, ShiftSignal,
  FeedPost, KnowledgeCategory, ChatChannel, ChatMessage, AuditLogEntry,
} from '../../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

// Clock-in radius, roster and payroll moved to the Employees page
// (Employees.tsx imports those tab components from this file).
type Tab = 'feed' | 'knowledge' | 'chat' | 'hub';

interface Props {
  lang: Language;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function Workforce({ lang, onShowToast }: Props) {
  const [tab, setTab] = useState<Tab>('feed');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {([
          { id: 'feed' as Tab, label: tr(lang, 'Лента', 'Feed', 'Lenta') },
          { id: 'knowledge' as Tab, label: tr(lang, 'База знаний', 'Knowledge', 'Bilimlar') },
          { id: 'chat' as Tab, label: tr(lang, 'Чат', 'Chat', 'Chat') },
          { id: 'hub' as Tab, label: tr(lang, 'Настройки хаба', 'Hub settings', 'Hub sozlamalari') },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'feed' && <FeedTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'knowledge' && <KnowledgeTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'chat' && <ChatTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'hub' && <HubSettingsTab lang={lang} onShowToast={onShowToast} />}
    </div>
  );
}

// ── Hub settings (Phase 7, plan §6) ─────────────────────────────────────
// Server-backed replacement for navConfig.ts's client-only localStorage
// hiding — reads/writes tenant_modules.config via /settings/hub-config,
// GM-reachable (no admin gate), never touches `enabled` (admin-only lever).
function HubSettingsTab({ lang, onShowToast }: { lang: Language; onShowToast: (m: string, t: 'success' | 'error' | 'info') => void }) {
  const [modules, setModules] = useState<{ moduleKey: string; enabled: boolean; config: Record<string, unknown> }[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Employee Hub Phase 9 (plan §14) — audit-log review, CSV export.
  const [auditRows, setAuditRows] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  const load = () => { traceApi.settings.hubConfig().then(d => setModules(d.modules)).catch(() => {}); };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    traceApi.settings.auditLog(200).then(d => setAuditRows(d.rows)).catch(() => setAuditRows([])).finally(() => setAuditLoading(false));
  }, []);

  const exportAuditCsv = () => {
    const header = ['created_at', 'actor_type', 'actor_label', 'action', 'entity_type', 'entity_id'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [header.join(','), ...auditRows.map(r => header.map(k => escape((r as any)[k])).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const feed = modules.find(m => m.moduleKey === 'feed');
  const penaltyPolicy = (feed?.config?.penaltyFeedPolicy as string) ?? 'anonymized';

  const savePenaltyPolicy = async (policy: 'anonymized' | 'named') => {
    setBusyKey('feed');
    try {
      await traceApi.settings.saveHubConfig('feed', { penaltyFeedPolicy: policy });
      onShowToast(tr(lang, 'Сохранено', 'Saved', 'Saqlandi'), 'success');
      load();
    } catch { onShowToast(tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error'); }
    finally { setBusyKey(null); }
  };

  return (
    <div className="space-y-5">
    <Card>
      <h3 className="text-[14px] font-semibold text-text mb-1">{tr(lang, 'Настройки хаба', 'Hub settings', 'Hub sozlamalari')}</h3>
      <p className="text-[12px] text-muted mb-4">{tr(lang, 'Поведение включённых модулей. Включение/выключение модулей — в Admin Panel.', 'Behavior of already-enabled modules. Turning modules on/off happens in the Admin Panel.', "Yoqilgan modullar xatti-harakati. Modullarni yoqish/o'chirish Admin Panelda.")}</p>

      {!feed?.enabled ? (
        <p className="text-[12px] text-muted">{tr(lang, 'Модуль "Лента" выключен', 'Feed module is disabled', "Lenta moduli o'chirilgan")}</p>
      ) : (
        <div className="p-3.5 rounded-xl border border-border bg-background space-y-2">
          <p className="text-[13px] font-semibold text-text">{tr(lang, 'Публикация штрафов в ленту', 'Penalty posts in feed', 'Jarimalarni lentada e\'lon qilish')}</p>
          <p className="text-[11px] text-muted">{tr(lang, 'Штрафы всегда публикуются; премии — всегда с именем. Этот флаг решает только видимость имени в штрафах.', 'Penalties always post; bonuses are always named. This flag only decides whether the penalized employee is named.', "Jarimalar har doim e'lon qilinadi; mukofotlar har doim ism bilan. Bu belgi faqat jarima uchun ism ko'rsatishni belgilaydi.")}</p>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => savePenaltyPolicy('anonymized')} disabled={busyKey === 'feed'} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold ${penaltyPolicy !== 'named' ? 'bg-primary text-white' : 'bg-card border border-border text-muted'}`}>
              {tr(lang, 'Анонимно', 'Anonymized', 'Anonim')}
            </button>
            <button onClick={() => savePenaltyPolicy('named')} disabled={busyKey === 'feed'} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold ${penaltyPolicy === 'named' ? 'bg-primary text-white' : 'bg-card border border-border text-muted'}`}>
              {tr(lang, 'С именем', 'Named', 'Ism bilan')}
            </button>
          </div>
        </div>
      )}
    </Card>

    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-text">{tr(lang, 'Журнал аудита', 'Audit log', 'Audit jurnali')}</h3>
        <button
          onClick={exportAuditCsv}
          disabled={auditRows.length === 0}
          className="px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold text-text disabled:opacity-50"
        >
          {tr(lang, 'Экспорт CSV', 'Export CSV', 'CSV eksport')}
        </button>
      </div>
      {auditLoading ? (
        <p className="text-[12px] text-muted">{tr(lang, 'Загрузка…', 'Loading…', 'Yuklanmoqda…')}</p>
      ) : auditRows.length === 0 ? (
        <p className="text-[12px] text-muted">{tr(lang, 'Записей нет', 'No entries yet', "Yozuvlar yo'q")}</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {auditRows.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-background text-[12px]">
              <div className="min-w-0">
                <p className="text-text font-medium truncate">{r.actor_label} · {r.action} · {r.entity_type}</p>
                <p className="text-muted text-[11px]">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded bg-card border border-border text-[10px] text-muted uppercase">{r.actor_type}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
    </div>
  );
}

// ── Payroll ──────────────────────────────────────────────────────────────
// Redesign (TRACE-mockups/staff.html "Зарплата"): period picker + lock,
// totals strip, one accruals table; clicking a person opens their pay
// settings in a side panel.
const fmtMoney = (n: number) => Math.round(n).toLocaleString('ru-RU');
const ini = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
const periodLabel = (p: PayrollPeriod) => {
  const a = new Date(p.starts_on), b = new Date(p.ends_on);
  const f = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${f(b)}` : `${f(a)} – ${f(b)}`;
};

// Right-hand panel used by Payroll (and anywhere else in the Employees page).
export function SidePanel({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', k); }; }, []);
  return (
    <>
      <div className={`scrim${on ? ' on' : ''}`} onClick={onClose} />
      <aside className={`panel${on ? ' on' : ''}`} role="dialog" aria-label={title}>
        <div className="p-head"><div><h2>{title}</h2>{sub && <div className="faint">{sub}</div>}</div>
          <button className="p-close" onClick={onClose} aria-label="Close"><i className="ph ph-x" aria-hidden="true" /></button></div>
        <div className="p-body">{children}</div>
      </aside>
    </>
  );
}

export function PayrollTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([]);
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);

  const loadPeriods = () => checklistApi.payroll.periods().then(ps => { setPeriods(ps); if (!selectedPeriodId && ps[0]) setSelectedPeriodId(ps[0].id); }).catch(() => {});
  useEffect(() => {
    checklistApi.employees.list().then(setEmployees).catch(() => {});
    checklistApi.roles.list().then(setRoles).catch(() => {});
    loadPeriods();
  }, []);
  useEffect(() => {
    if (selectedPeriodId) checklistApi.payroll.payslips(selectedPeriodId).then(setPayslips).catch(() => {});
  }, [selectedPeriodId]);

  const lockPeriod = async () => {
    if (!selectedPeriodId) return;
    setLocking(true);
    try {
      await checklistApi.payroll.lockPeriod(selectedPeriodId);
      await Promise.all([loadPeriods(), checklistApi.payroll.payslips(selectedPeriodId).then(setPayslips)]);
      setConfirmLock(false);
      onShowToast(tr(lang, 'Период закрыт', 'Period locked', 'Davr yopildi'), 'success');
    } catch { onShowToast(tr(lang, 'Не удалось закрыть период', 'Failed to lock', "Davrni yopib bo'lmadi"), 'error'); }
    finally { setLocking(false); }
  };

  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? '—';
  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);
  const total = payslips.reduce((s, p) => s + Number(p.total_amount), 0);
  const slipBy = new Map(payslips.map(p => [p.employee_id, p]));
  const currency = payslips[0]?.currency ?? tr(lang, 'сум', 'UZS', "so'm");
  const editing = employees.find(e => e.id === editingEmployeeId) ?? null;
  const rows = [...employees].sort((a, b) => Number(slipBy.get(b.id)?.total_amount ?? 0) - Number(slipBy.get(a.id)?.total_amount ?? 0));
  const locked = selectedPeriod?.status === 'locked';

  return (
    <>
      <div className="tools">
        {periods.length > 0 && (
          <span className="sel"><select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} aria-label={tr(lang, 'Расчётный период', 'Pay period', 'Hisob davri')}>
            {periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}{p.status === 'locked' ? '' : tr(lang, ', идёт', ', open', ', ochiq')}</option>)}
          </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span>
        )}
        <span className="spacer" />
        {selectedPeriod && (
          <span className="lock-row">{locked
            ? <span className="tag"><i className="ph ph-lock-simple" aria-hidden="true" /> {tr(lang, 'Закрыт, изменить нельзя', 'Locked, read-only', "Yopilgan, o'zgartirib bo'lmaydi")}</span>
            : <button className="btn" type="button" disabled={!payslips.length} onClick={() => setConfirmLock(true)}><i className="ph ph-lock-simple" aria-hidden="true" />{tr(lang, 'Закрыть период', 'Lock period', 'Davrni yopish')}</button>}
          </span>
        )}
      </div>
      {confirmLock && selectedPeriod && (
        <div className="confirm">
          <span>{tr(lang, `Закрыть период ${periodLabel(selectedPeriod)}? Начисления заморозятся: ставки, бонусы и штрафы за эти даты больше не изменить.`, `Lock ${periodLabel(selectedPeriod)}? Accruals freeze: rates, bonuses and penalties for these dates can't change any more.`, `${periodLabel(selectedPeriod)} davrini yopasizmi? Hisoblar muzlatiladi.`)}</span>
          <button className="btn solid" type="button" disabled={locking} onClick={lockPeriod}>{locking ? tr(lang, 'Закрываем…', 'Locking…', 'Yopilmoqda…') : tr(lang, 'Закрыть период', 'Lock period', 'Davrni yopish')}</button>
          <button className="btn" type="button" onClick={() => setConfirmLock(false)}>{tr(lang, 'Отмена', 'Cancel', 'Bekor')}</button>
        </div>
      )}
      <section className="strip" aria-label={tr(lang, 'Итоги периода', 'Period totals', 'Davr yakunlari')}>
        <div><div className="s-l">{tr(lang, 'К выплате', 'To pay', "To'lanadi")}</div><div className="s-v">{fmtMoney(total)}<small>{currency}</small></div><div className="s-d">{selectedPeriod ? (locked ? tr(lang, 'период закрыт', 'period locked', 'davr yopilgan') : tr(lang, 'период идёт', 'period open', 'davr ochiq')) : tr(lang, 'периодов ещё нет', 'no periods yet', "davrlar yo'q")}</div></div>
        <div><div className="s-l">{tr(lang, 'Сотрудников с начислением', 'People with accruals', 'Hisobli xodimlar')}</div><div className="s-v">{payslips.filter(p => Number(p.total_amount) > 0).length}</div><div className="s-d">{tr(lang, `из ${employees.length}`, `of ${employees.length}`, `${employees.length} dan`)}</div></div>
        <div><div className="s-l">{tr(lang, 'В среднем на человека', 'Average per person', "O'rtacha bir kishiga")}</div><div className="s-v">{payslips.length ? fmtMoney(total / payslips.length) : '—'}</div><div className="s-d">{currency}</div></div>
        <div><div className="s-l">{tr(lang, 'Без ставки', 'No rate set', "Stavkasiz")}</div><div className="s-v">{employees.filter(e => !slipBy.has(e.id)).length}</div><div className="s-d">{tr(lang, 'задайте в карточке', 'set it per person', 'kartochkada belgilang')}</div></div>
      </section>
      <section className="card-ph" aria-labelledby="h-pay">
        <div className="sec-head"><h2 id="h-pay">{tr(lang, 'Начисления', 'Accruals', 'Hisoblar')}</h2><span className="sec-note">{tr(lang, 'Нажмите на сотрудника, чтобы настроить ставку, часы или добавить бонус', 'Click a person to set their rate, hours or add a bonus', "Stavka, soat yoki bonus uchun xodimni bosing")}</span></div>
        {!selectedPeriod && <p className="note"><i className="ph ph-info" aria-hidden="true" /><span>{tr(lang, 'Периодов пока нет: первый появится после первой закрытой смены.', 'No periods yet: the first appears after the first closed shift.', "Hozircha davr yo'q: birinchi yopilgan smenadan keyin paydo bo'ladi.")}</span></p>}
        {employees.length === 0 ? <div className="empty"><b>{tr(lang, 'Сотрудников пока нет', 'No employees yet', "Hozircha xodimlar yo'q")}</b></div> : (
          <table className="dt">
            <thead><tr><th>{tr(lang, 'Сотрудник', 'Employee', 'Xodim')}</th><th className="hide-sm">{tr(lang, 'Должность', 'Role', 'Lavozim')}</th><th className="r">{tr(lang, 'К выплате', 'To pay', "To'lanadi")}</th><th className="hide-sm" aria-label="open" /></tr></thead>
            <tbody>{rows.map(e => {
              const slip = slipBy.get(e.id);
              return (
                <tr key={e.id} className="click" tabIndex={0} onClick={() => setEditingEmployeeId(e.id)} onKeyDown={ev => { if (ev.key === 'Enter') setEditingEmployeeId(e.id); }}>
                  <td><div className="who"><span className="ava" aria-hidden="true">{ini(e.name)}</span><div style={{ minWidth: 0 }}><b>{e.name}</b><span className="ph-sub">{slip ? roleName(e.role_id) : <span style={{ color: 'var(--accent)' }}>{tr(lang, 'начислений нет', 'nothing accrued', "hisob yo'q")}</span>}</span></div></div></td>
                  <td className="hide-sm muted">{roleName(e.role_id)}</td>
                  <td className="r" style={{ fontWeight: 500 }}>{slip ? fmtMoney(Number(slip.total_amount)) : <span className="faint">0</span>}</td>
                  <td className="go hide-sm"><i className="ph ph-caret-right" aria-hidden="true" /></td>
                </tr>
              );
            })}</tbody>
            {payslips.length > 0 && <tfoot><tr><td>{tr(lang, 'Итого', 'Total', 'Jami')}</td><td className="hide-sm" /><td className="r">{fmtMoney(total)}</td><td className="hide-sm" /></tr></tfoot>}
          </table>
        )}
      </section>
      {editing && (
        <SidePanel title={editing.name} sub={roleName(editing.role_id)} onClose={() => setEditingEmployeeId(null)}>
          <PayProfileEditor lang={lang} employee={editing} onShowToast={onShowToast}
            onDone={() => { setEditingEmployeeId(null); if (selectedPeriodId) checklistApi.payroll.payslips(selectedPeriodId).then(setPayslips); }} />
        </SidePanel>
      )}
    </>
  );
}

// Lateness rules the payroll engine applies (TRACEBACKEND services/payroll/
// compute.ts): past the grace minutes, every missed minute is deducted
// pro-rata from fixed pay AND the fixed late penalty below is added on top.
export function AttendanceRulesCard({ lang, onShowToast }: {
  lang: Language;
  onShowToast: Props['onShowToast'];
}) {
  const [rules, onRulesChange] = useState<PayrollRule[]>([]);
  useEffect(() => { checklistApi.payroll.rules().then(onRulesChange).catch(() => {}); }, []);
  const [graceMin, setGraceMin] = useState<number | null>(null);
  const [earlyMin, setEarlyMin] = useState<number | null>(null);
  const [lateAmount, setLateAmount] = useState(0);
  const [missedAmount, setMissedAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const lateRule = rules.find(r => r.type === 'late_penalty');
  const missedRule = rules.find(r => r.type === 'missed_checklist_penalty');

  useEffect(() => {
    traceApi.settings.geofence().then(st => { setGraceMin(st.attendanceGraceMin); setEarlyMin(st.attendanceEarlyMin ?? 30); }).catch(() => {});
  }, []);
  useEffect(() => { setLateAmount(lateRule ? Number(lateRule.amount) : 0); }, [lateRule?.id, lateRule?.amount]);
  useEffect(() => { setMissedAmount(missedRule ? Number(missedRule.amount) : 0); }, [missedRule?.id, missedRule?.amount]);

  // amount 0 = rule off; any positive amount = rule on with that amount.
  const saveRule = async (type: PayrollRule['type'], amount: number, existing?: PayrollRule): Promise<PayrollRule | null> => {
    if (existing) return checklistApi.payroll.updateRule(existing.id, amount > 0 ? { amount, active: true } : { active: false });
    if (amount > 0) return checklistApi.payroll.createRule({ type, amount });
    return null;
  };

  const save = async () => {
    setBusy(true);
    try {
      await traceApi.settings.saveGeofence({ attendanceGraceMin: graceMin ?? 0, attendanceEarlyMin: earlyMin ?? 30 });
      const [late, missed] = await Promise.all([
        saveRule('late_penalty', lateAmount, lateRule),
        saveRule('missed_checklist_penalty', missedAmount, missedRule),
      ]);
      const next = rules.filter(r => r.id !== late?.id && r.id !== missed?.id);
      onRulesChange([...next, ...(late ? [late] : []), ...(missed ? [missed] : [])]);
      onShowToast(tr(lang, 'Правила сохранены', 'Rules saved', 'Qoidalar saqlandi'), 'success');
    } catch { onShowToast(tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="card" aria-labelledby="h-late">
      <h2 id="h-late">{tr(lang, 'Опоздания и штрафы', 'Lateness and penalties', 'Kechikish va jarimalar')}</h2>
      <p className="lead">{tr(lang, 'После льготных минут каждая пропущенная минута вычитается из фиксированной оплаты, а штраф добавляется сверху.', 'Past the grace minutes, every missed minute comes off fixed pay and the penalty is added on top.', "Imtiyozli daqiqalardan keyin har bir daqiqa fiks to'lovdan ayiriladi, ustiga jarima qo'shiladi.")}</p>
      <div className="fgrid">
        <Field label={tr(lang, 'Льготные минуты опоздания', 'Grace minutes for lateness', 'Kechikish uchun imtiyoz')} unit={tr(lang, 'мин', 'min', 'daq')} value={graceMin ?? 0} onChange={setGraceMin} />
        <Field label={tr(lang, 'Можно открыть смену раньше на', 'Can clock in early by', 'Smenani oldinroq ochish')} unit={tr(lang, 'мин', 'min', 'daq')} value={earlyMin ?? 30} onChange={setEarlyMin} />
        <Field label={tr(lang, 'Штраф за опоздание', 'Late penalty', 'Kechikish jarimasi')} unit={tr(lang, 'сум', 'UZS', "so'm")} hint={tr(lang, '0, чтобы выключить', '0 turns it off', "0 — o'chiq")} value={lateAmount} onChange={setLateAmount} step={5000} />
        <Field label={tr(lang, 'Штраф за невыполненный чек-лист', 'Missed checklist penalty', 'Bajarilmagan cheklist jarimasi')} unit={tr(lang, 'сум', 'UZS', "so'm")} hint={tr(lang, '0, чтобы выключить', '0 turns it off', "0 — o'chiq")} value={missedAmount} onChange={setMissedAmount} step={5000} />
      </div>
      <p className="fine">{tr(lang, 'Время до начала смены не оплачивается. Ранний уход считается так же, как опоздание.', 'Time before the shift starts is never paid. Leaving early counts the same as lateness.', "Smenadan oldingi vaqt to'lanmaydi. Erta ketish kechikish kabi hisoblanadi.")}</p>
      <div className="save"><button className="btn solid" type="button" onClick={save} disabled={busy || graceMin === null}>{busy ? tr(lang, 'Сохранение…', 'Saving…', 'Saqlanmoqda…') : tr(lang, 'Сохранить правила', 'Save rules', 'Qoidalarni saqlash')}</button></div>
    </section>
  );
}

const WEEKDAYS: { iso: number; ru: string; en: string; uz: string }[] = [
  { iso: 1, ru: 'Пн', en: 'Mon', uz: 'Du' }, { iso: 2, ru: 'Вт', en: 'Tue', uz: 'Se' },
  { iso: 3, ru: 'Ср', en: 'Wed', uz: 'Ch' }, { iso: 4, ru: 'Чт', en: 'Thu', uz: 'Pa' },
  { iso: 5, ru: 'Пт', en: 'Fri', uz: 'Ju' }, { iso: 6, ru: 'Сб', en: 'Sat', uz: 'Sh' },
  { iso: 7, ru: 'Вс', en: 'Sun', uz: 'Ya' },
];

export function PayProfileEditor({ lang, employee, onShowToast, onDone }: {
  lang: Language; employee: ChecklistEmployee;
  onShowToast: Props['onShowToast']; onDone: () => void;
}) {
  const [profile, setProfile] = useState<{
    monthlyAmount: number; dailyAmount: number; perShiftAmount: number; hourlyRate: number;
    overtimeMultiplier: number; overtimeAfterMinutes: number; unpaidBreakMinutes: number; minShiftMinutes: number;
  }>({ monthlyAmount: 0, dailyAmount: 0, perShiftAmount: 0, hourlyRate: 0, overtimeMultiplier: 1.5, overtimeAfterMinutes: 480, unpaidBreakMinutes: 0, minShiftMinutes: 0 });
  const [salesPercent, setSalesPercent] = useState(0);
  const [schedule, setSchedule] = useState<EmployeeSchedule>({ start: null, end: null, days: [] });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adjKind, setAdjKind] = useState<'bonus' | 'penalty' | 'advance'>('bonus');
  const [adjAmount, setAdjAmount] = useState(0);
  const [adjReason, setAdjReason] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);

  useEffect(() => {
    checklistApi.payroll.getPayProfile(employee.id).then(p => {
      if (p) {
        setProfile({
          monthlyAmount: Number(p.monthly_amount), dailyAmount: Number(p.daily_amount),
          perShiftAmount: Number(p.per_shift_amount), hourlyRate: Number(p.hourly_rate),
          overtimeMultiplier: Number(p.overtime_multiplier), overtimeAfterMinutes: p.overtime_after_minutes,
          unpaidBreakMinutes: p.unpaid_break_minutes, minShiftMinutes: p.min_shift_minutes,
        });
        setSalesPercent(Number(p.config?.percent ?? 0));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
    checklistApi.payroll.getSchedule(employee.id).then(sc => setSchedule({ start: sc.start, end: sc.end, days: sc.days ?? [] })).catch(() => {});
  }, [employee.id]);

  const toggleDay = (iso: number) => setSchedule(sc => ({ ...sc, days: sc.days.includes(iso) ? sc.days.filter(d => d !== iso) : [...sc.days, iso].sort() }));
  const scheduleMinutes = (() => {
    if (!schedule.start || !schedule.end) return 0;
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    let diff = toMin(schedule.end) - toMin(schedule.start);
    if (diff <= 0) diff += 24 * 60;
    return diff;
  })();
  const update = (key: keyof typeof profile, value: number) => setProfile(p => ({ ...p, [key]: value }));
  const estimatedMonthly = profile.monthlyAmount + profile.dailyAmount * 22 + profile.perShiftAmount * 22 + profile.hourlyRate * 8 * 22;

  const save = async () => {
    if ((schedule.start == null) !== (schedule.end == null)) {
      onShowToast(tr(lang, 'Укажите и начало, и конец смены', 'Set both shift start and end', 'Smena boshlanishi va tugashini kiriting'), 'error');
      return;
    }
    setBusy(true);
    try {
      const percent = Math.max(0, Math.min(100, salesPercent));
      const salaryType = percent > 0 ? 'percent_of_sales' : profile.hourlyRate > 0 ? 'hourly' : profile.perShiftAmount > 0 ? 'per_shift' : 'fixed';
      await Promise.all([
        checklistApi.payroll.savePayProfile(employee.id, { ...profile, salaryType, config: { percent } }),
        checklistApi.payroll.saveSchedule(employee.id, schedule),
      ]);
      onShowToast(tr(lang, 'Ставка сохранена', 'Pay rate saved', 'Stavka saqlandi'), 'success');
      onDone();
    } catch { onShowToast(tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  const addAdjustment = async () => {
    if (!adjAmount || adjAmount <= 0) return;
    setAdjBusy(true);
    try {
      await checklistApi.payroll.addAdjustment(employee.id, { kind: adjKind, amount: adjAmount, reason: adjReason.trim() || undefined });
      setAdjAmount(0); setAdjReason('');
      onShowToast(tr(lang, 'Начисление добавлено', 'Adjustment added', "Hisoblash qo'shildi"), 'success');
    } catch { onShowToast(tr(lang, 'Не удалось добавить (возможно, период закрыт)', 'Failed to add (the period may be locked)', "Qo'shib bo'lmadi (davr yopilgan bo'lishi mumkin)"), 'error'); }
    finally { setAdjBusy(false); }
  };

  if (!loaded) return <div className="sk w9" />;
  const sumU = tr(lang, 'сум', 'UZS', "so'm");

  return (
    <>
      <p className="lead">{tr(lang, 'Виды оплаты складываются: заполните только нужные поля.', 'Pay types add up: fill in only what applies.', "To'lov turlari qo'shiladi: faqat keraklisini to'ldiring.")}</p>
      <div className="fgrid">
        <Field label={tr(lang, 'Фикс в месяц', 'Fixed per month', 'Oylik fiks')} unit={sumU} value={profile.monthlyAmount} onChange={v => update('monthlyAmount', v)} step={50000} />
        <Field label={tr(lang, 'За день', 'Per day', 'Kunlik')} unit={sumU} value={profile.dailyAmount} onChange={v => update('dailyAmount', v)} step={5000} />
        <Field label={tr(lang, 'За смену', 'Per shift', 'Smena uchun')} unit={sumU} value={profile.perShiftAmount} onChange={v => update('perShiftAmount', v)} step={5000} />
        <Field label={tr(lang, 'За час', 'Per hour', 'Soatlik')} unit={sumU} value={profile.hourlyRate} onChange={v => update('hourlyRate', v)} step={1000} />
        <Field label={tr(lang, 'Процент от продаж', 'Percent of sales', 'Savdodan foiz')} unit="%" value={salesPercent} onChange={setSalesPercent} step={0.5}
          hint={salesPercent > 0 && !employee.iiko_employee_id ? tr(lang, 'Работает только для сотрудника, связанного с iiko: продажи берутся по официанту в заказе.', 'Only works for an employee linked to iiko: sales are taken by the waiter on the order.', "Faqat iiko'ga bog'langan xodim uchun ishlaydi.") : undefined} bad={salesPercent > 0 && !employee.iiko_employee_id} />
      </div>
      <h3>{tr(lang, 'Рабочие часы', 'Working hours', 'Ish vaqti')}</h3>
      <p className="faint" style={{ fontSize: 13, margin: 0 }}>{tr(lang, 'По ним считаются опоздания, если на день нет смены в расписании.', 'Lateness is measured against these when the roster has no shift that day.', "Jadvalda smena bo'lmasa, kechikish shu bo'yicha hisoblanadi.")}</p>
      <div className="times">
        <input className="in" type="time" value={schedule.start ?? ''} onChange={e => setSchedule(sc => ({ ...sc, start: e.target.value || null }))} aria-label={tr(lang, 'Начало', 'Start', 'Boshlanishi')} />
        <span className="faint">—</span>
        <input className="in" type="time" value={schedule.end ?? ''} onChange={e => setSchedule(sc => ({ ...sc, end: e.target.value || null }))} aria-label={tr(lang, 'Конец', 'End', 'Tugashi')} />
        {scheduleMinutes > 0 && <span className="faint">{Math.floor(scheduleMinutes / 60)} {tr(lang, 'ч', 'h', 'soat')}{scheduleMinutes % 60 ? ` ${scheduleMinutes % 60} ${tr(lang, 'мин', 'min', 'daq')}` : ''}</span>}
      </div>
      <div className="days">
        {WEEKDAYS.map(d => <button key={d.iso} type="button" aria-pressed={schedule.days.includes(d.iso)} onClick={() => toggleDay(d.iso)}>{tr(lang, d.ru, d.en, d.uz)}</button>)}
      </div>
      <div className="fgrid three">
        <Field label={tr(lang, 'Сверхурочные ×', 'Overtime ×', "Qo'shimcha ×")} value={profile.overtimeMultiplier} onChange={v => update('overtimeMultiplier', v)} step={0.1} />
        <Field label={tr(lang, 'Сверхурочные после', 'Overtime after', 'Keyin')} unit={tr(lang, 'мин', 'min', 'daq')} value={profile.overtimeAfterMinutes} onChange={v => update('overtimeAfterMinutes', v)} step={15} />
        <Field label={tr(lang, 'Минимум смены', 'Minimum shift', 'Min smena')} unit={tr(lang, 'мин', 'min', 'daq')} value={profile.minShiftMinutes} onChange={v => update('minShiftMinutes', v)} step={15} />
      </div>
      <div className="est"><small>{tr(lang, 'Примерно в месяц (22 смены по 8 ч)', 'About a month (22 shifts × 8 h)', 'Taxminan oyiga (22 smena × 8 soat)')}</small><b>{fmtMoney(estimatedMonthly)}</b></div>
      <button className="btn solid wide-btn" type="button" onClick={save} disabled={busy}>{busy ? tr(lang, 'Сохранение…', 'Saving…', 'Saqlanmoqda…') : tr(lang, 'Сохранить', 'Save', 'Saqlash')}</button>

      <h3>{tr(lang, 'Разовое начисление', 'One-off adjustment', 'Bir martalik hisob')}</h3>
      <div className="fgrid">
        <label className="fld"><span>{tr(lang, 'Что', 'Type', 'Turi')}</span>
          <span className="sel"><select className="in" value={adjKind} onChange={e => setAdjKind(e.target.value as 'bonus' | 'penalty' | 'advance')}>
            <option value="bonus">{tr(lang, 'Бонус', 'Bonus', 'Bonus')}</option>
            <option value="penalty">{tr(lang, 'Штраф', 'Penalty', 'Jarima')}</option>
            <option value="advance">{tr(lang, 'Аванс (уже выплачен)', 'Advance (already paid)', "Avans (to'langan)")}</option>
          </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span></label>
        <Field label={tr(lang, 'Сумма', 'Amount', 'Summa')} unit={sumU} value={adjAmount} onChange={setAdjAmount} step={5000} />
      </div>
      <label className="fld"><span>{tr(lang, 'Причина', 'Reason', 'Sabab')}{adjKind !== 'advance' ? ' *' : ''}</span><input className="in" value={adjReason} onChange={e => setAdjReason(e.target.value)} /></label>
      <button className="btn" type="button" onClick={addAdjustment} disabled={adjBusy || !adjAmount || (adjKind !== 'advance' && !adjReason.trim())}>{adjBusy ? tr(lang, 'Добавляем…', 'Adding…', "Qo'shilmoqda…") : tr(lang, 'Добавить', 'Add', "Qo'shish")}</button>
    </>
  );
}

function Field({ label, value, onChange, step = 1, unit, hint, bad }: { label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string; hint?: string; bad?: boolean }) {
  return (
    <label className="fld">
      <span>{label}</span>
      <span className="inu"><input className="in" type="number" step={step} min={0} value={value} onChange={e => onChange(Number(e.target.value) || 0)} />{unit && <em>{unit}</em>}</span>
      {hint && <span className={`hint${bad ? ' bad' : ''}`}>{hint}</span>}
    </label>
  );
}

// ── Roster ───────────────────────────────────────────────────────────────
// Redesign: a week grid (people grouped by role × 7 days). Empty cells add a
// shift for that person and day; a shift opens a small popover to cancel it.
// Swap requests and location signals sit underneath.
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function RosterTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([]);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [coverage, setCoverage] = useState<RosterCoverageRow[]>([]);
  const [signals, setSignals] = useState<ShiftSignal[]>([]);
  const [busy, setBusy] = useState(false);
  const [week, setWeek] = useState(0);
  const [adding, setAdding] = useState<{ employeeId: string; roleId: string; date: string } | null>(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [conflict, setConflict] = useState(false);
  const [openShift, setOpenShift] = useState<string | null>(null);

  const load = () => {
    checklistApi.roles.list().then(setRoles).catch(() => {});
    checklistApi.employees.list().then(setEmployees).catch(() => {});
    checklistApi.roster.list().then(setShifts).catch(() => {});
    checklistApi.roster.swapRequests('open').then(setSwaps).catch(() => {});
    checklistApi.roster.swapRequests('claimed').then(claimed => setSwaps(prev => [...prev.filter(s => s.status !== 'claimed'), ...claimed])).catch(() => {});
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    checklistApi.roster.coverage(from, to).then(setCoverage).catch(() => {});
    checklistApi.shifts.signals().then(setSignals).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // Week starts on Monday.
  const start = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + week * 7);
    return d;
  }, [week]);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const todayKey = dayKey(new Date());
  const live = shifts.filter(s => s.status !== 'cancelled');
  const byCell = new Map<string, RosterShift[]>();
  for (const s of live) { const k = `${s.employee_id}|${dayKey(new Date(s.planned_start))}`; byCell.set(k, [...(byCell.get(k) ?? []), s]); }
  const swapByShift = new Map(swaps.map(s => [s.roster_shift_id, s]));
  const fmtDay = (d: Date) => `${tr(lang, WEEKDAYS[(d.getDay() + 6) % 7].ru, WEEKDAYS[(d.getDay() + 6) % 7].en, WEEKDAYS[(d.getDay() + 6) % 7].uz)}, ${d.getDate()}`;
  const dm = (d: Date) => d.toLocaleDateString(tr(lang, 'ru-RU', 'en-GB', 'uz-Latn-UZ'), { day: 'numeric', month: 'long' });
  const weekLabel = days[0].getMonth() === days[6].getMonth() ? `${days[0].getDate()}–${dm(days[6])}` : `${dm(days[0])} – ${dm(days[6])}`;
  const gaps = coverage.filter(c => c.days_with_coverage === 0 && c.active_employee_count > 0);
  const groups = roles.map(r => ({ role: r, people: employees.filter(e => e.role_id === r.id) })).filter(g => g.people.length);

  const addShift = async (force = false) => {
    if (!adding) return;
    setBusy(true);
    const plannedStart = new Date(`${adding.date}T${startTime}:00`).toISOString();
    let endDate = adding.date;
    if (endTime <= startTime) { const d = new Date(`${adding.date}T00:00:00`); d.setDate(d.getDate() + 1); endDate = dayKey(d); }
    const plannedEnd = new Date(`${endDate}T${endTime}:00`).toISOString();
    try {
      const created = await checklistApi.roster.create({ employeeId: adding.employeeId, roleId: adding.roleId, plannedStart, plannedEnd, force });
      await checklistApi.roster.publish([created.id]);
      setAdding(null); setConflict(false);
      load();
      onShowToast(tr(lang, 'Смена опубликована', 'Shift published', "Smena e'lon qilindi"), 'success');
    } catch (err: any) {
      if (String(err?.message ?? '').includes('DOUBLE_BOOKED')) setConflict(true);
      else onShowToast(tr(lang, 'Не удалось создать смену', 'Failed to create shift', "Smena yaratib bo'lmadi"), 'error');
    } finally { setBusy(false); }
  };
  const cancelShift = async (id: string) => {
    try { await checklistApi.roster.cancel(id); setOpenShift(null); load(); } catch { onShowToast(tr(lang, 'Не удалось отменить', 'Failed to cancel', "Bekor qilib bo'lmadi"), 'error'); }
  };
  const approveSwap = async (id: string) => {
    try { await checklistApi.roster.approveSwap(id); load(); onShowToast(tr(lang, 'Замена одобрена', 'Swap approved', 'Almashtirish tasdiqlandi'), 'success'); }
    catch { onShowToast(tr(lang, 'Нужен желающий: дождитесь отклика', 'Needs a volunteer first', "Avval kimdir javob berishini kuting"), 'error'); }
  };
  const rejectSwap = async (id: string) => {
    try { await checklistApi.roster.rejectSwap(id); load(); }
    catch { onShowToast(tr(lang, 'Не удалось отклонить', 'Failed to reject', "Rad etib bo'lmadi"), 'error'); }
  };
  const nameOf = (id: string) => employees.find(e => e.id === id)?.name ?? '—';

  return (
    <>
      <div className="tools">
        <div className="wk">
          <button type="button" aria-label={tr(lang, 'Предыдущая неделя', 'Previous week', 'Oldingi hafta')} onClick={() => setWeek(w => w - 1)} disabled={week <= -2}><i className="ph ph-caret-left" aria-hidden="true" /></button>
          <span>{weekLabel}</span>
          <button type="button" aria-label={tr(lang, 'Следующая неделя', 'Next week', 'Keyingi hafta')} onClick={() => setWeek(w => w + 1)}><i className="ph ph-caret-right" aria-hidden="true" /></button>
        </div>
        {week !== 0 && <button className="link" type="button" onClick={() => setWeek(0)}>{tr(lang, 'Эта неделя', 'This week', 'Shu hafta')}</button>}
        <span className="spacer" />
        <button className="btn solid" type="button" onClick={() => { const e = employees[0]; if (e) setAdding({ employeeId: e.id, roleId: e.role_id, date: dayKey(days.find(d => dayKey(d) >= todayKey) ?? days[0]) }); }}><i className="ph ph-plus" aria-hidden="true" />{tr(lang, 'Добавить смену', 'Add shift', "Smena qo'shish")}</button>
      </div>
      {gaps.length > 0 && week === 0 && (
        <p className="note"><i className="ph ph-warning" aria-hidden="true" /><span>{tr(lang, `Нет ни одной смены на ближайшие 7 дней: ${gaps.map(g => g.role_name.toLowerCase()).join(', ')}.`, `No shifts in the next 7 days for: ${gaps.map(g => g.role_name).join(', ')}.`, `Keyingi 7 kunga smena yo'q: ${gaps.map(g => g.role_name).join(', ')}.`)}</span></p>
      )}

      {adding && (
        <div className="confirm" style={{ flexWrap: 'wrap' }}>
          <span className="sel"><select className="in" value={adding.employeeId} onChange={e => { const emp = employees.find(x => x.id === e.target.value); if (emp) setAdding({ ...adding, employeeId: emp.id, roleId: emp.role_id }); }} aria-label={tr(lang, 'Сотрудник', 'Employee', 'Xodim')}>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span>
          <input className="in" type="date" value={adding.date} onChange={e => setAdding({ ...adding, date: e.target.value })} aria-label={tr(lang, 'Дата', 'Date', 'Sana')} />
          <input className="in" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} aria-label={tr(lang, 'Начало', 'Start', 'Boshlanishi')} />
          <input className="in" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} aria-label={tr(lang, 'Конец', 'End', 'Tugashi')} />
          <button className="btn solid" type="button" disabled={busy} onClick={() => addShift(false)}>{tr(lang, 'Опубликовать', 'Publish', "E'lon qilish")}</button>
          <button className="btn" type="button" onClick={() => { setAdding(null); setConflict(false); }}>{tr(lang, 'Отмена', 'Cancel', 'Bekor')}</button>
          {conflict && <span className="neg" style={{ flexBasis: '100%' }}>{tr(lang, 'У сотрудника уже есть смена в это время.', 'This person already has an overlapping shift.', 'Bu xodimning shu vaqtda smenasi bor.')} <button className="link" type="button" onClick={() => addShift(true)}>{tr(lang, 'Всё равно создать', 'Create anyway', 'Baribir yaratish')}</button></span>}
        </div>
      )}

      {groups.length === 0 ? <div className="empty"><b>{tr(lang, 'Нет сотрудников с должностью', 'No employees with a role yet', "Lavozimli xodimlar yo'q")}</b></div> : (
        <div className="grid-wrap"><table className="ros">
          <thead><tr><th>{tr(lang, 'Сотрудник', 'Employee', 'Xodim')}</th>{days.map(d => <th key={dayKey(d)} className={dayKey(d) === todayKey ? 'today' : ''}>{fmtDay(d)}</th>)}</tr></thead>
          <tbody>{groups.map(g => {
            const hasShift = g.people.some(p => days.some(d => byCell.has(`${p.id}|${dayKey(d)}`)));
            return (
              <React.Fragment key={g.role.id}>
                <tr className="role"><td colSpan={8}>{g.role.name}{!hasShift && <span className="gap-warn">{tr(lang, 'нет смен', 'no shifts', "smena yo'q")}</span>}</td></tr>
                {g.people.map(p => (
                  <tr key={p.id}>
                    <td><div className="who"><span className="ava" aria-hidden="true">{ini(p.name)}</span><b>{p.name}</b></div></td>
                    {days.map(d => {
                      const k = dayKey(d);
                      const cell = byCell.get(`${p.id}|${k}`) ?? [];
                      return (
                        <td key={k} className={k < todayKey ? 'past' : ''} style={{ position: 'relative' }}>
                          {cell.length ? cell.map(s => {
                            const sw = swapByShift.get(s.id);
                            return (
                              <span key={s.id} className="pop-wrap" style={{ display: 'block' }}>
                                <button className={`shift${sw ? ' swap' : ''}`} type="button" onClick={() => setOpenShift(o => o === s.id ? null : s.id)}>
                                  {hm(s.planned_start).replace(/:00/g, '')}–{hm(s.planned_end).replace(/:00/g, '')}{sw && <i className="ph ph-arrows-left-right" aria-label={tr(lang, 'просит замену', 'wants a swap', "almashtirish so'raydi")} />}
                                </button>
                                {openShift === s.id && (
                                  <div className="pop shift-pop">
                                    <p><b>{p.name}</b><br />{fmtDay(d)}, {hm(s.planned_start)}–{hm(s.planned_end)}</p>
                                    {sw && <p className="faint">{sw.status === 'claimed' ? tr(lang, `Готов выйти: ${sw.coverer_employee_name}`, `Volunteer: ${sw.coverer_employee_name}`, `Tayyor: ${sw.coverer_employee_name}`) : tr(lang, 'Просит замену, ждёт желающего', 'Wants a swap, waiting for a volunteer', "Almashtirish so'ramoqda")}</p>}
                                    {k >= todayKey && <button className="btn danger" type="button" onClick={() => cancelShift(s.id)}>{tr(lang, 'Отменить смену', 'Cancel shift', 'Smenani bekor qilish')}</button>}
                                  </div>
                                )}
                              </span>
                            );
                          }) : k >= todayKey ? (
                            <button className="add-cell" type="button" aria-label={tr(lang, `Добавить смену: ${p.name}, ${fmtDay(d)}`, `Add shift: ${p.name}, ${fmtDay(d)}`, `Smena qo'shish: ${p.name}, ${fmtDay(d)}`)}
                              onClick={() => setAdding({ employeeId: p.id, roleId: p.role_id, date: k })}><i className="ph ph-plus" aria-hidden="true" /></button>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            );
          })}</tbody>
        </table></div>
      )}

      <div className="rost-side">
        <section className="card-ph" aria-labelledby="h-swap">
          <div className="sec-head"><h2 id="h-swap">{tr(lang, 'Запросы на замену', 'Swap requests', "Almashtirish so'rovlari")}</h2><span className="sec-note">{tr(lang, 'Сотрудники просят в приложении TRACE', 'Staff ask in the TRACE app', "Xodimlar TRACE ilovasida so'raydi")}</span></div>
          {swaps.length === 0 ? <p className="rd-empty">{tr(lang, 'Активных запросов нет', 'No active requests', "Faol so'rovlar yo'q")}</p> : swaps.map(s => (
            <div className="req" key={s.id}>
              <p><b>{s.requesting_employee_name}</b> {tr(lang, 'просит замену на', 'wants cover for', 'uchun almashtirish so‘raydi')} {new Date(s.planned_start).toLocaleString(tr(lang, 'ru-RU', 'en-GB', 'uz-Latn-UZ'), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              {s.reason && <p className="faint">{s.reason}</p>}
              <p className="faint">{s.status === 'claimed' ? tr(lang, `Готов выйти: ${s.coverer_employee_name}`, `Volunteer: ${s.coverer_employee_name}`, `Tayyor: ${s.coverer_employee_name}`) : tr(lang, 'Ждёт желающего', 'Waiting for a volunteer', "Ko'ngilli kutilmoqda")}</p>
              {s.status === 'claimed' && <div className="acts">
                <button className="btn solid" type="button" onClick={() => approveSwap(s.id)}>{tr(lang, 'Одобрить', 'Approve', 'Tasdiqlash')}</button>
                <button className="btn" type="button" onClick={() => rejectSwap(s.id)}>{tr(lang, 'Отклонить', 'Reject', 'Rad etish')}</button>
              </div>}
            </div>
          ))}
        </section>
        <section className="card-ph" aria-labelledby="h-sig">
          <div className="sec-head"><h2 id="h-sig">{tr(lang, 'Сигналы геолокации', 'Location signals', 'Geolokatsiya signallari')}</h2><span className="sec-note">{tr(lang, 'Попытки войти не с места', 'Clock-in attempts from elsewhere', 'Boshqa joydan kirish urinishlari')}</span></div>
          {signals.length === 0 ? <p className="rd-empty">{tr(lang, 'Всё спокойно', 'All quiet', 'Hammasi joyida')}</p> : signals.slice(0, 20).map(s => (
            <div className="sig" key={s.id}><b>{s.employee_name || nameOf(s.employee_id)}</b> <span>{s.type === 'geo_fail' ? tr(lang, 'вне радиуса', 'outside the radius', 'radiusdan tashqarida') : tr(lang, 'подмена геолокации', 'mocked location', 'soxta joylashuv')}</span>
              <span className="faint"> · {new Date(s.created_at).toLocaleString(tr(lang, 'ru-RU', 'en-GB', 'uz-Latn-UZ'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
          ))}
        </section>
      </div>
    </>
  );
}

// Loaded on demand rather than imported at module top — Leaflet touches
// `window`/DOM globals that don't exist during any server-side pass, and it's
// only ever needed once this tab actually mounts.
async function loadLeaflet() {
  const L = await import('leaflet');
  return L.default ?? L;
}

const DEFAULT_CENTER: [number, number] = [41.311081, 69.240562]; // Tashkent — sane default before a branch pin exists

export function GeofenceTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [settings, setSettings] = useState<WorkforceGeofenceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState('');
  const [searching, setSearching] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  useEffect(() => {
    traceApi.settings.geofence()
      .then(setSettings)
      .catch(() => onShowToast(tr(lang, 'Не удалось загрузить настройки', 'Failed to load settings', "Sozlamalarni yuklab bo'lmadi"), 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Map setup — runs once settings have loaded so the initial pin position
  // (existing lat/lng, or the Tashkent default) is known before Leaflet mounts.
  useEffect(() => {
    if (loading || !mapRef.current || mapInstance.current) return;
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !mapRef.current) return;
      leafletRef.current = L;
      const center: [number, number] = settings?.geofenceLat != null && settings?.geofenceLng != null
        ? [settings.geofenceLat, settings.geofenceLng] : DEFAULT_CENTER;
      const map = L.map(mapRef.current, { zoomControl: true }).setView(center, settings?.geofenceLat != null ? 16 : 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E8642C';
      const marker = L.marker(center, { draggable: true }).addTo(map);
      const circle = L.circle(center, { radius: settings?.geofenceRadiusM ?? 150, color: accent, fillColor: accent, fillOpacity: 0.12, weight: 2 }).addTo(map);
      const applyPosition = (lat: number, lng: number) => {
        marker.setLatLng([lat, lng]);
        circle.setLatLng([lat, lng]);
        setSettings(s => (s ? { ...s, geofenceLat: lat, geofenceLng: lng } : s));
      };
      marker.on('dragend', () => { const { lat, lng } = marker.getLatLng(); applyPosition(lat, lng); });
      map.on('click', (e: any) => applyPosition(e.latlng.lat, e.latlng.lng));
      mapInstance.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    });
    return () => { cancelled = true; };
  }, [loading]);

  useEffect(() => {
    if (circleRef.current && settings) circleRef.current.setRadius(settings.geofenceRadiusM);
  }, [settings?.geofenceRadiusM]);

  function update<K extends keyof WorkforceGeofenceSettings>(key: K, value: WorkforceGeofenceSettings[K]) {
    setSettings(s => (s ? { ...s, [key]: value } : s));
  }
  const moveTo = (lat: number, lng: number) => {
    update('geofenceLat', lat); update('geofenceLng', lng);
    if (mapInstance.current) mapInstance.current.setView([lat, lng], 17);
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    if (circleRef.current) circleRef.current.setLatLng([lat, lng]);
  };
  async function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => moveTo(pos.coords.latitude, pos.coords.longitude),
      () => onShowToast(tr(lang, 'Не удалось определить геолокацию', 'Could not get your location', "Joylashuvni aniqlab bo'lmadi"), 'error'),
    );
  }
  async function searchAddress() {
    if (!address.trim()) return;
    setSearching(true);
    try {
      // Nominatim: free and keyless, like the OSM tiles above.
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) { onShowToast(tr(lang, 'Адрес не найден', 'Address not found', 'Manzil topilmadi'), 'error'); return; }
      moveTo(parseFloat(rows[0].lat), parseFloat(rows[0].lon));
    } finally { setSearching(false); }
  }
  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await traceApi.settings.saveGeofence(settings);
      setSettings(result);
      onShowToast(tr(lang, 'Настройки сохранены', 'Settings saved', 'Sozlamalar saqlandi'), 'success');
    } catch { onShowToast(tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error'); }
    finally { setSaving(false); }
  }

  if (loading || !settings) return <section className="card wide"><div className="sk w9" /><div className="sk w7" /></section>;
  const pinDropped = settings.geofenceLat != null && settings.geofenceLng != null;

  return (
    <section className="card wide" aria-labelledby="h-geo">
      <h2 id="h-geo">{tr(lang, 'Геолокация', 'Location', 'Geolokatsiya')}</h2>
      <p className="lead">{tr(lang, 'Смену можно открыть только рядом с филиалом. Нажмите на карту, чтобы переставить точку.', 'A shift can only be opened near the branch. Click the map to move the pin.', "Smenani faqat filial yonida ochish mumkin. Nuqtani ko'chirish uchun xaritani bosing.")}</p>
      <div className="geo">
        <div className="map rd-leaflet"><div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 360 }} /></div>
        <div className="geo-side">
          <div>
            <span className="fld"><span>{tr(lang, 'Точка филиала', 'Branch location', 'Filial nuqtasi')}</span></span>
            <div className="row" style={{ marginTop: 5 }}>
              <input className="in" value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchAddress()} placeholder={tr(lang, 'Найти по адресу', 'Find by address', "Manzil bo'yicha topish")} aria-label={tr(lang, 'Адрес', 'Address', 'Manzil')} />
              <button className="btn" type="button" onClick={searchAddress} disabled={searching}>{tr(lang, 'Найти', 'Find', 'Topish')}</button>
            </div>
            <button className="btn wide-btn" type="button" style={{ marginTop: 8 }} onClick={useMyLocation}><i className="ph ph-crosshair" aria-hidden="true" />{tr(lang, 'Взять моё местоположение', 'Use my location', 'Mening joylashuvim')}</button>
            <div className="coords"><i className="ph ph-map-pin" aria-hidden="true" /><span className="mono">{pinDropped ? `${settings.geofenceLat!.toFixed(6)}, ${settings.geofenceLng!.toFixed(6)}` : tr(lang, 'Точка ещё не поставлена', 'No pin yet', "Nuqta hali qo'yilmagan")}</span></div>
          </div>
          <div>
            <span className="fld"><span>{tr(lang, 'Радиус входа', 'Clock-in radius', 'Kirish radiusi')}</span></span>
            <div className="radius-v"><span>{settings.geofenceRadiusM}</span><small>{tr(lang, 'метров', 'metres', 'metr')}</small></div>
            <input type="range" min={25} max={500} step={5} value={settings.geofenceRadiusM} onChange={e => update('geofenceRadiusM', Number(e.target.value))} aria-label={tr(lang, 'Радиус входа, метров', 'Clock-in radius, metres', 'Kirish radiusi, metr')} />
          </div>
          <div>
            <div className="sw-row"><div><b>{tr(lang, 'Блокировать вход вне радиуса', 'Block clock-in outside the radius', 'Radiusdan tashqarida bloklash')}</b>
              <p>{settings.geofenceEnabled ? tr(lang, 'Сотрудники вне радиуса не смогут открыть смену', "Staff outside the radius can't open a shift", "Radiusdan tashqaridagi xodimlar smena ocha olmaydi") : tr(lang, 'Выключено: вход откуда угодно, попытки записываются', 'Off: clock-in from anywhere, attempts are logged', "O'chiq: istalgan joydan, urinishlar yoziladi")}</p></div>
              <button className="sw" role="switch" aria-checked={settings.geofenceEnabled} onClick={() => update('geofenceEnabled', !settings.geofenceEnabled)} aria-label={tr(lang, 'Блокировать вход вне радиуса', 'Block clock-in outside the radius', 'Radiusdan tashqarida bloklash')} /></div>
            <div className="sw-row"><div><b>{tr(lang, 'Приложение для сотрудников', 'Employee app', 'Xodimlar ilovasi')}</b><p>{tr(lang, 'Смены и вход через приложение TRACE в этом филиале', 'Shifts and clock-in through the TRACE app at this branch', 'Shu filialda TRACE ilovasi orqali smena va kirish')}</p></div>
              <button className="sw" role="switch" aria-checked={settings.employeeAppEnabled} onClick={() => update('employeeAppEnabled', !settings.employeeAppEnabled)} aria-label={tr(lang, 'Приложение для сотрудников', 'Employee app', 'Xodimlar ilovasi')} /></div>
          </div>
          <button className="btn solid wide-btn" type="button" onClick={save} disabled={saving}><i className="ph ph-floppy-disk" aria-hidden="true" />{saving ? tr(lang, 'Сохранение…', 'Saving…', 'Saqlanmoqda…') : tr(lang, 'Сохранить', 'Save', 'Saqlash')}</button>
        </div>
      </div>
    </section>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────────
function FeedTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => checklistApi.feed.list().then(setPosts).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim()) { onShowToast(tr(lang, 'Укажите заголовок', 'Enter a title', 'Sarlavha kiriting'), 'error'); return; }
    setBusy(true);
    try {
      await checklistApi.feed.create({ title: title.trim(), body, pinned });
      setTitle(''); setBody(''); setPinned(false);
      setShowAdd(false);
      load();
    } catch { onShowToast(tr(lang, 'Не удалось опубликовать', 'Failed to publish', "Nashr qilib bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await checklistApi.feed.remove(id); load(); } catch { onShowToast(tr(lang, 'Не удалось удалить', 'Failed to delete', "O'chirib bo'lmadi"), 'error'); }
  };

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="text-[15px] font-semibold text-text tracking-tight">{tr(lang, 'Лента объявлений', 'Announcements feed', "E'lonlar lentasi")}</h3>
        <button onClick={() => setShowAdd(v => !v)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold flex items-center gap-1.5">
          <Plus size={14} /> {tr(lang, 'Написать', 'New post', 'Yozish')}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-3.5 rounded-xl border border-border bg-background space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={tr(lang, 'Заголовок', 'Title', 'Sarlavha')} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={tr(lang, 'Текст объявления', 'Announcement text', "E'lon matni")} rows={3} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text resize-none" />
          <button onClick={() => setPinned(v => !v)} className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <Pin size={13} className={pinned ? 'text-primary' : ''} /> {tr(lang, 'Закрепить', 'Pin to top', "Yuqorida mahkamlash")}
          </button>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={create} disabled={busy} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50">
              {tr(lang, 'Опубликовать', 'Publish', "Nashr qilish")}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-3.5 py-2 rounded-lg bg-card border border-border text-muted text-[13px] font-medium">
              {tr(lang, 'Отмена', 'Cancel', 'Bekor qilish')}
            </button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Пока нет публикаций', 'No posts yet', "Hozircha post yo'q")}</p>
      ) : (
        <div className="space-y-2">
          {posts.map(p => (
            <div key={p.id} className="p-3 rounded-lg bg-background border border-border">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    {p.pinned && <Pin size={12} className="text-primary" />}
                    {p.kind === 'birthday' && <span>🎂</span>}
                    {p.kind === 'bonus' && <span>💰</span>}
                    {p.kind === 'penalty' && <span>⚠️</span>}
                    {p.kind === 'welcome' && <span>👋</span>}
                    <p className="text-[13px] font-semibold text-text">{p.title}</p>
                  </div>
                  {p.body && <p className="text-[12px] text-muted mt-1">{p.body}</p>}
                  <p className="text-[10px] text-muted mt-1.5">
                    {p.author_name} · {new Date(p.published_at).toLocaleDateString()}
                    {(p.reaction_count > 0 || p.comment_count > 0) && (
                      <> · {p.reaction_count > 0 ? `👍 ${p.reaction_count}` : ''} {p.comment_count > 0 ? `💬 ${p.comment_count}` : ''}</>
                    )}
                  </p>
                </div>
                {p.kind !== 'birthday' && (
                  <button onClick={() => remove(p.id)} className="text-red-500 hover:text-red-600 shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Knowledge Room ───────────────────────────────────────────────────────
function KnowledgeTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemType, setItemType] = useState<'file' | 'link'>('file');
  const [externalUrl, setExternalUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => checklistApi.knowledge.list().then(setCategories).catch(() => {});
  useEffect(() => { load(); }, []);

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await checklistApi.knowledge.createCategory(newCategoryName.trim());
      setNewCategoryName('');
      load();
    } catch { onShowToast(tr(lang, 'Не удалось создать раздел', 'Failed to create category', "Bo'lim yaratib bo'lmadi"), 'error'); }
  };

  const removeCategory = async (id: string) => {
    if (!confirm(tr(lang, 'Удалить раздел и все файлы в нём?', 'Delete this category and everything in it?', "Bo'lim va undagi barcha fayllarni o'chirasizmi?"))) return;
    try { await checklistApi.knowledge.removeCategory(id); load(); } catch { onShowToast(tr(lang, 'Не удалось удалить', 'Failed to delete', "O'chirib bo'lmadi"), 'error'); }
  };

  const onFileSelected = async (categoryId: string, file: File) => {
    setUploading(true);
    try {
      const { url, fileType, fileSizeBytes } = await checklistApi.knowledge.uploadDocument(file);
      await checklistApi.knowledge.createItem({
        categoryId, title: itemTitle.trim() || file.name, itemType: 'file',
        fileUrl: url, fileType, fileSizeBytes,
      });
      setItemTitle(''); setAddingItemTo(null);
      load();
    } catch { onShowToast(tr(lang, 'Не удалось загрузить файл', 'Failed to upload file', "Faylni yuklab bo'lmadi"), 'error'); }
    finally { setUploading(false); }
  };

  const addLink = async (categoryId: string) => {
    if (!itemTitle.trim() || !externalUrl.trim()) { onShowToast(tr(lang, 'Укажите название и ссылку', 'Enter a title and URL', 'Nomi va havolani kiriting'), 'error'); return; }
    try {
      await checklistApi.knowledge.createItem({ categoryId, title: itemTitle.trim(), itemType: 'link', externalUrl: externalUrl.trim() });
      setItemTitle(''); setExternalUrl(''); setAddingItemTo(null);
      load();
    } catch { onShowToast(tr(lang, 'Не удалось добавить', 'Failed to add', "Qo'shib bo'lmadi"), 'error'); }
  };

  const removeItem = async (id: string) => {
    try { await checklistApi.knowledge.removeItem(id); load(); } catch { onShowToast(tr(lang, 'Не удалось удалить', 'Failed to delete', "O'chirib bo'lmadi"), 'error'); }
  };

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-[15px] font-semibold text-text tracking-tight mb-3">{tr(lang, 'Новый раздел', 'New category', "Yangi bo'lim")}</h3>
        <div className="flex items-center gap-2">
          <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder={tr(lang, 'Например: Меню', 'e.g. Menu', 'masalan: Menyu')} className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
          <button onClick={addCategory} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold flex items-center gap-1.5">
            <Plus size={14} /> {tr(lang, 'Создать', 'Create', 'Yaratish')}
          </button>
        </div>
      </Card>

      {categories.map(cat => (
        <Card key={cat.id}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-text tracking-tight flex items-center gap-2">
              <Folder size={16} /> {cat.name}
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={() => { setAddingItemTo(cat.id); setItemType('file'); }} className="px-2.5 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold text-text flex items-center gap-1">
                <Plus size={13} /> {tr(lang, 'Добавить', 'Add', "Qo'shish")}
              </button>
              <button onClick={() => removeCategory(cat.id)} className="text-red-500 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {addingItemTo === cat.id && (
            <div className="mb-3 p-3 rounded-lg border border-border bg-background space-y-2">
              <div className="flex gap-2">
                <button onClick={() => setItemType('file')} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold ${itemType === 'file' ? 'bg-primary text-white' : 'bg-card text-muted'}`}>{tr(lang, 'Файл', 'File', 'Fayl')}</button>
                <button onClick={() => setItemType('link')} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold ${itemType === 'link' ? 'bg-primary text-white' : 'bg-card text-muted'}`}>{tr(lang, 'Ссылка', 'Link', 'Havola')}</button>
              </div>
              <input value={itemTitle} onChange={e => setItemTitle(e.target.value)} placeholder={tr(lang, 'Название', 'Title', 'Nomi')} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
              {itemType === 'file' ? (
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border text-[13px] text-muted cursor-pointer hover:border-primary/40">
                  <Upload size={14} /> {uploading ? tr(lang, 'Загрузка…', 'Uploading…', 'Yuklanmoqda…') : tr(lang, 'Выбрать PDF/Word/Excel', 'Choose PDF/Word/Excel', 'PDF/Word/Excel tanlash')}
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" hidden disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelected(cat.id, f); }} />
                </label>
              ) : (
                <div className="flex gap-2">
                  <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://..." className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
                  <button onClick={() => addLink(cat.id)} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold">{tr(lang, 'Добавить', 'Add', "Qo'shish")}</button>
                </div>
              )}
              <button onClick={() => setAddingItemTo(null)} className="text-[12px] text-muted">{tr(lang, 'Отмена', 'Cancel', 'Bekor qilish')}</button>
            </div>
          )}

          {cat.items.length === 0 ? (
            <p className="text-[13px] text-muted">{tr(lang, 'Пока пусто', 'Nothing here yet', "Hozircha bo'sh")}</p>
          ) : (
            <div className="space-y-1.5">
              {cat.items.map(item => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
                  <a href={item.file_url ?? item.external_url ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-text hover:text-primary min-w-0">
                    {item.item_type === 'link' ? <LinkIcon size={14} className="shrink-0" /> : <FileText size={14} className="shrink-0" />}
                    <span className="truncate">{item.title}</span>
                  </a>
                  <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-600 shrink-0 ml-2">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Chat ─────────────────────────────────────────────────────────────────
function ChatTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    checklistApi.chat.channels().then(chs => {
      setChannels(chs);
      if (!activeChannelId && chs[0]) setActiveChannelId(chs[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeChannelId) return;
    const load = () => checklistApi.chat.messages(activeChannelId).then(setMessages).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [activeChannelId]);

  const send = async () => {
    if (!draft.trim() || !activeChannelId) return;
    setSending(true);
    try {
      await checklistApi.chat.send(activeChannelId, draft.trim());
      setDraft('');
      checklistApi.chat.messages(activeChannelId).then(setMessages);
    } catch { onShowToast(tr(lang, 'Не удалось отправить', 'Failed to send', "Yuborib bo'lmadi"), 'error'); }
    finally { setSending(false); }
  };

  // GM moderation (plan §5). Delete is soft on the server (audit trail kept)
  // — this just drops it from the local list optimistically.
  const deleteMessage = async (messageId: string) => {
    if (!activeChannelId) return;
    setMessages(prev => prev.filter(m => m.id !== messageId));
    try { await checklistApi.chat.deleteMessage(activeChannelId, messageId); }
    catch { onShowToast(tr(lang, 'Не удалось удалить', 'Failed to delete', "O'chirib bo'lmadi"), 'error'); }
  };

  const muteEmployee = async (employeeId: string, minutes: number) => {
    if (!activeChannelId) return;
    try {
      await checklistApi.chat.mute(activeChannelId, employeeId, minutes);
      onShowToast(tr(lang, 'Сотрудник заглушён', 'Employee muted', 'Xodim ovozsiz qilindi'), 'success');
    } catch { onShowToast(tr(lang, 'Не удалось заглушить', 'Failed to mute', "Ovozsiz qilib bo'lmadi"), 'error'); }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1 !p-2">
        <div className="space-y-1">
          {channels.length === 0 && <p className="text-[12px] text-muted p-2">{tr(lang, 'Нет каналов', 'No channels', "Kanallar yo'q")}</p>}
          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => setActiveChannelId(ch.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-[13px] font-medium ${activeChannelId === ch.id ? 'bg-primary text-white' : 'text-text hover:bg-card-hover'}`}
            >
              <MessageSquare size={14} className="shrink-0" /> {ch.name}
            </button>
          ))}
        </div>
      </Card>

      <Card className="md:col-span-2 flex flex-col" style={{ minHeight: 420 }}>
        <div className="flex-1 overflow-y-auto space-y-2 mb-3">
          {messages.length === 0 ? (
            <p className="text-[13px] text-muted">{tr(lang, 'Пока нет сообщений', 'No messages yet', "Hozircha xabar yo'q")}</p>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`group max-w-[80%] p-2.5 rounded-xl text-[13px] relative ${m.sender_type === 'owner' || m.sender_type === 'manager' ? 'bg-primary/10 ml-auto text-text' : 'bg-background text-text'}`}>
                <p className="text-[11px] font-semibold text-muted mb-0.5">{m.sender_name}</p>
                <p>{m.body}</p>
                {m.sender_type === 'employee' && m.sender_id && (
                  <div className="hidden group-hover:flex items-center gap-2 absolute -top-2 right-1 bg-card border border-border rounded-md px-1.5 py-0.5">
                    <button onClick={() => deleteMessage(m.id)} className="text-[10px] text-muted hover:text-red-500" title={tr(lang, 'Удалить', 'Delete', "O'chirish")}>
                      <Trash2 size={11} />
                    </button>
                    <button onClick={() => muteEmployee(m.sender_id!, 60)} className="text-[10px] text-muted hover:text-amber-500" title={tr(lang, 'Заглушить на 1 час', 'Mute for 1h', '1 soatga ovozsiz')}>
                      <BellOff size={11} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={tr(lang, 'Сообщение…', 'Message…', 'Xabar…')}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text"
          />
          <button onClick={send} disabled={sending || !draft.trim()} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-1.5">
            <Send size={14} />
          </button>
        </div>
      </Card>
    </div>
  );
}
