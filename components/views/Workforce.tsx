// TRACE Employee — owner-facing admin surface for the employee mobile app.
// Structured like Checklists.tsx: one file, internal tab state. Phase 0 ships
// only the Geofence tab (branch clock-in radius + attendance/payroll policy);
// Roster/Shifts/Swaps/Payroll/Rules tabs land in later phases as more tabs
// added to the same `Tab` union, following this file's own pattern.
import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Locate, ShieldCheck, ShieldAlert, Save, Plus, Send, Check, X, Calendar, Pin, FileText, Link as LinkIcon, MessageSquare, Trash2, Upload, Folder } from 'lucide-react';
import { Card } from '../ui/Card';
import { Wallet } from 'lucide-react';
import { Language, ChecklistRole, ChecklistEmployee } from '../../types';
import { Lock, ShieldQuestion } from 'lucide-react';
import {
  traceApi, WorkforceGeofenceSettings, checklistApi, RosterShift, SwapRequest, PayProfile, PayrollPeriod, Payslip, PayrollRule,
  FeedPost, KnowledgeCategory, ChatChannel, ChatMessage,
} from '../../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

type Tab = 'geofence' | 'roster' | 'payroll' | 'feed' | 'knowledge' | 'chat';

interface Props {
  lang: Language;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function Workforce({ lang, onShowToast }: Props) {
  const [tab, setTab] = useState<Tab>('geofence');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {([
          { id: 'geofence' as Tab, label: tr(lang, 'Геолокация', 'Geofence', 'Geolokatsiya') },
          { id: 'roster' as Tab, label: tr(lang, 'Расписание', 'Roster', 'Jadval') },
          { id: 'payroll' as Tab, label: tr(lang, 'Зарплата', 'Payroll', 'Ish haqi') },
          { id: 'feed' as Tab, label: tr(lang, 'Лента', 'Feed', 'Lenta') },
          { id: 'knowledge' as Tab, label: tr(lang, 'База знаний', 'Knowledge', 'Bilimlar') },
          { id: 'chat' as Tab, label: tr(lang, 'Чат', 'Chat', 'Chat') },
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

      {tab === 'geofence' && <GeofenceTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'roster' && <RosterTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'payroll' && <PayrollTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'feed' && <FeedTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'knowledge' && <KnowledgeTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'chat' && <ChatTab lang={lang} onShowToast={onShowToast} />}
    </div>
  );
}

// ── Payroll ──────────────────────────────────────────────────────────────
// Pay-profile editor (four additive inputs, per plan §1.4) + a period
// review table. No lock button here yet — that's Phase 7.
function PayrollTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([]);
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  const loadPeriods = () => checklistApi.payroll.periods().then(ps => { setPeriods(ps); if (!selectedPeriodId && ps[0]) setSelectedPeriodId(ps[0].id); }).catch(() => {});

  useEffect(() => {
    checklistApi.employees.list().then(setEmployees).catch(() => {});
    checklistApi.roles.list().then(setRoles).catch(() => {});
    checklistApi.payroll.rules().then(setRules).catch(() => {});
    loadPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriodId) checklistApi.payroll.payslips(selectedPeriodId).then(setPayslips).catch(() => {});
  }, [selectedPeriodId]);

  const toggleRule = async (type: 'late_penalty' | 'missed_checklist_penalty', amount: number) => {
    const existing = rules.find(r => r.type === type);
    if (existing) {
      const updated = await checklistApi.payroll.updateRule(existing.id, { active: !existing.active });
      setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
    } else {
      const created = await checklistApi.payroll.createRule({ type, amount });
      setRules(prev => [...prev, created]);
    }
  };

  const lockPeriod = async () => {
    if (!selectedPeriodId) return;
    if (!confirm(tr(lang, 'Заблокировать период? Это заморозит все расчёты.', 'Lock this period? This freezes every payslip in it.', 'Bu davrni bloklaysizmi? Bu barcha hisob-kitoblarni muzlatadi.'))) return;
    setLocking(true);
    try {
      await checklistApi.payroll.lockPeriod(selectedPeriodId);
      await Promise.all([loadPeriods(), checklistApi.payroll.payslips(selectedPeriodId).then(setPayslips)]);
      onShowToast(tr(lang, 'Период заблокирован', 'Period locked', 'Davr bloklandi'), 'success');
    } catch { onShowToast(tr(lang, 'Не удалось заблокировать', 'Failed to lock', "Bloklab bo'lmadi"), 'error'); }
    finally { setLocking(false); }
  };

  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? '—';
  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);
  const totalForPeriod = payslips.reduce((sum, p) => sum + Number(p.total_amount), 0);

  if (editingEmployeeId) {
    const employee = employees.find(e => e.id === editingEmployeeId)!;
    return (
      <PayProfileEditor
        lang={lang}
        employee={employee}
        onShowToast={onShowToast}
        onDone={() => { setEditingEmployeeId(null); if (selectedPeriodId) checklistApi.payroll.payslips(selectedPeriodId).then(setPayslips); }}
      />
    );
  }

  const lateRule = rules.find(r => r.type === 'late_penalty');
  const missedRule = rules.find(r => r.type === 'missed_checklist_penalty');

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-[15px] font-semibold text-text tracking-tight mb-3 flex items-center gap-2">
          <ShieldQuestion size={16} /> {tr(lang, 'Автоматические штрафы', 'Automatic penalties', 'Avtomatik jarimalar')}
        </h3>
        <div className="space-y-2">
          <button onClick={() => toggleRule('late_penalty', 10000)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-background border border-border text-left">
            <div>
              <p className="text-[13px] font-medium text-text">{tr(lang, 'Опоздание', 'Lateness', 'Kechikish')}</p>
              <p className="text-[11px] text-muted mt-0.5">{tr(lang, 'Штраф за опоздание относительно расписания', 'Penalty for clocking in late against the roster', "Jadvalga nisbatan kechikish uchun jarima")}</p>
            </div>
            <span className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${lateRule?.active ? 'bg-primary' : 'bg-card-hover'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${lateRule?.active ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
          <button onClick={() => toggleRule('missed_checklist_penalty', 25000)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-background border border-border text-left">
            <div>
              <p className="text-[13px] font-medium text-text">{tr(lang, 'Незавершённый чек-лист', 'Missed checklist', "Bajarilmagan cheklist")}</p>
              <p className="text-[11px] text-muted mt-0.5">{tr(lang, 'Если менеджер закрыл смену вручную с невыполненным чек-листом', "If a manager closes a shift with a required checklist incomplete", "Agar menejer talab qilingan cheklist bajarilmagan holda smenani yopsa")}</p>
            </div>
            <span className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${missedRule?.active ? 'bg-primary' : 'bg-card-hover'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${missedRule?.active ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </div>
      </Card>

      <Card>
        <h3 className="text-[15px] font-semibold text-text tracking-tight mb-3 flex items-center gap-2">
          <Wallet size={16} /> {tr(lang, 'Ставки сотрудников', 'Employee pay rates', "Xodimlar ish haqi")}
        </h3>
        <div className="space-y-1.5">
          {employees.map(e => (
            <button key={e.id} onClick={() => setEditingEmployeeId(e.id)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-background border border-border text-left hover:border-primary/40">
              <div>
                <p className="text-[13px] font-medium text-text">{e.name}</p>
                <p className="text-[11px] text-muted mt-0.5">{roleName(e.role_id)}</p>
              </div>
              <span className="text-[12px] text-primary font-semibold">{tr(lang, 'Настроить', 'Configure', 'Sozlash')}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-[15px] font-semibold text-text tracking-tight">{tr(lang, 'Расчётный период', 'Payroll period', 'Hisob davri')}</h3>
          {periods.length > 0 && (
            <select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border bg-background text-[12px] text-text">
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  {new Date(p.starts_on).toLocaleDateString()} – {new Date(p.ends_on).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
        </div>

        {!selectedPeriod ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Периодов пока нет — появятся после первой закрытой смены', 'No periods yet — one appears after the first closed shift', "Hozircha davr yo'q — birinchi yopilgan smenadan keyin paydo bo'ladi")}</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <span className="text-[13px] text-muted block">{tr(lang, 'Итого за период', 'Period total', "Davr uchun jami")}</span>
                <span className="text-[22px] font-display font-bold text-text tabular-nums">{totalForPeriod.toLocaleString()} {payslips[0]?.currency ?? ''}</span>
              </div>
              {selectedPeriod.status === 'locked' ? (
                <span className="px-3 py-1.5 rounded-lg bg-card-hover text-[12px] font-semibold text-muted flex items-center gap-1.5">
                  <Lock size={13} /> {tr(lang, 'Заблокирован', 'Locked', 'Bloklangan')}
                </span>
              ) : (
                <button onClick={lockPeriod} disabled={locking || payslips.length === 0} className="px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold flex items-center gap-1.5 text-text disabled:opacity-50">
                  <Lock size={13} /> {locking ? tr(lang, 'Блокировка…', 'Locking…', 'Bloklanmoqda…') : tr(lang, 'Заблокировать период', 'Lock period', 'Davrni bloklash')}
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {payslips.map(p => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
                  <div>
                    <span className="text-[13px] text-text">{p.employee_name}</span>
                    <span className="text-[11px] text-muted ml-2">{p.role_name}</span>
                  </div>
                  <span className="text-[13px] font-semibold text-text tabular-nums">{Number(p.total_amount).toLocaleString()} {p.currency}</span>
                </div>
              ))}
              {payslips.length === 0 && <p className="text-[13px] text-muted">{tr(lang, 'Нет данных за этот период', 'No payslips for this period', "Bu davr uchun ma'lumot yo'q")}</p>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function PayProfileEditor({ lang, employee, onShowToast, onDone }: {
  lang: Language; employee: ChecklistEmployee;
  onShowToast: Props['onShowToast']; onDone: () => void;
}) {
  const [profile, setProfile] = useState<{
    monthlyAmount: number; dailyAmount: number; perShiftAmount: number; hourlyRate: number;
    overtimeMultiplier: number; overtimeAfterMinutes: number; unpaidBreakMinutes: number; minShiftMinutes: number;
  }>({ monthlyAmount: 0, dailyAmount: 0, perShiftAmount: 0, hourlyRate: 0, overtimeMultiplier: 1.5, overtimeAfterMinutes: 480, unpaidBreakMinutes: 0, minShiftMinutes: 0 });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adjKind, setAdjKind] = useState<'bonus' | 'penalty'>('bonus');
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
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [employee.id]);

  const update = (key: keyof typeof profile, value: number) => setProfile(p => ({ ...p, [key]: value }));

  const estimatedMonthly = profile.monthlyAmount
    + profile.dailyAmount * 22
    + profile.perShiftAmount * 22
    + profile.hourlyRate * 8 * 22;

  const save = async () => {
    setBusy(true);
    try {
      await checklistApi.payroll.savePayProfile(employee.id, profile);
      onShowToast(tr(lang, 'Ставка сохранена', 'Pay rate saved', "Stavka saqlandi"), 'success');
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
    } catch { onShowToast(tr(lang, 'Не удалось добавить (возможно, период заблокирован)', 'Failed to add (period may be locked)', "Qo'shib bo'lmadi (davr bloklangan bo'lishi mumkin)"), 'error'); }
    finally { setAdjBusy(false); }
  };

  if (!loaded) return <Card><p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p></Card>;

  return (
    <Card>
      <button onClick={onDone} className="text-[13px] text-muted hover:text-text mb-4">{tr(lang, '← Назад', '← Back', '← Orqaga')}</button>
      <h3 className="text-[15px] font-semibold text-text tracking-tight mb-1">{employee.name}</h3>
      <p className="text-[12px] text-muted mb-4">{tr(lang, 'Типы оплаты складываются — заполните только нужные поля', 'Salary types are additive — fill in only what applies', "To'lov turlari qo'shiladi — faqat kerakli maydonlarni to'ldiring")}</p>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={tr(lang, 'Фикс. в месяц', 'Fixed monthly', 'Oylik fiks')} value={profile.monthlyAmount} onChange={v => update('monthlyAmount', v)} />
        <Field label={tr(lang, 'За день', 'Per day', 'Kunlik')} value={profile.dailyAmount} onChange={v => update('dailyAmount', v)} />
        <Field label={tr(lang, 'За смену', 'Per shift', 'Smena uchun')} value={profile.perShiftAmount} onChange={v => update('perShiftAmount', v)} />
        <Field label={tr(lang, 'За час', 'Per hour', 'Soatlik')} value={profile.hourlyRate} onChange={v => update('hourlyRate', v)} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-3">
        <Field label={tr(lang, 'Множитель сверхурочных', 'Overtime multiplier', "Qo'shimcha ish koeffitsienti")} value={profile.overtimeMultiplier} onChange={v => update('overtimeMultiplier', v)} step={0.1} />
        <Field label={tr(lang, 'После, мин', 'Overtime after, min', "Necha daqiqadan keyin")} value={profile.overtimeAfterMinutes} onChange={v => update('overtimeAfterMinutes', v)} />
        <Field label={tr(lang, 'Мин. смена, мин', 'Min shift, min', "Min smena, daqiqa")} value={profile.minShiftMinutes} onChange={v => update('minShiftMinutes', v)} />
      </div>

      <div className="mt-4 p-3 rounded-lg bg-primary/10 flex items-baseline justify-between">
        <span className="text-[12px] text-muted">{tr(lang, 'Ориентировочно в месяц (22 смены × 8ч)', 'Estimated monthly (22 shifts × 8h)', "Taxminiy oylik (22 smena × 8soat)")}</span>
        <span className="text-[16px] font-bold text-text tabular-nums">{estimatedMonthly.toLocaleString()}</span>
      </div>

      <button onClick={save} disabled={busy} className="w-full mt-4 px-3.5 py-2.5 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50">
        {busy ? tr(lang, 'Сохранение…', 'Saving…', 'Saqlanmoqda…') : tr(lang, 'Сохранить', 'Save', 'Saqlash')}
      </button>

      <div className="mt-6 pt-4 border-t border-border">
        <h4 className="text-[13px] font-semibold text-text mb-2">{tr(lang, 'Разовое начисление', 'One-off adjustment', "Bir martalik hisoblash")}</h4>
        <div className="grid sm:grid-cols-2 gap-2 mb-2">
          <select value={adjKind} onChange={e => setAdjKind(e.target.value as 'bonus' | 'penalty')} className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text">
            <option value="bonus">{tr(lang, 'Бонус', 'Bonus', 'Bonus')}</option>
            <option value="penalty">{tr(lang, 'Штраф', 'Penalty', 'Jarima')}</option>
          </select>
          <input type="number" value={adjAmount || ''} onChange={e => setAdjAmount(Number(e.target.value) || 0)} placeholder={tr(lang, 'Сумма', 'Amount', "Summa")} className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
        </div>
        <input value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder={tr(lang, 'Причина', 'Reason', 'Sabab')} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text mb-2" />
        <button onClick={addAdjustment} disabled={adjBusy || !adjAmount} className="px-3.5 py-2 rounded-lg bg-card border border-border text-[13px] font-semibold text-text disabled:opacity-50">
          {adjBusy ? tr(lang, 'Добавление…', 'Adding…', "Qo'shilmoqda…") : tr(lang, 'Добавить', 'Add', "Qo'shish")}
        </button>
      </div>
    </Card>
  );
}

function Field({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="text-[11px] text-muted mb-1 block">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text tabular-nums"
      />
    </div>
  );
}

// ── Roster ───────────────────────────────────────────────────────────────
// Build-a-week + swap approvals. Keeps the same Card/tr conventions as the
// rest of this file — a genuine "grid" builder (drag to assign, etc.) is a
// future pass; this ships create → publish → approve end-to-end.
function RosterTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([]);
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const [roleId, setRoleId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  const load = () => {
    checklistApi.roles.list().then(setRoles).catch(() => {});
    checklistApi.employees.list().then(setEmployees).catch(() => {});
    checklistApi.roster.list().then(setShifts).catch(() => {});
    checklistApi.roster.swapRequests('open').then(setSwaps).catch(() => {});
    checklistApi.roster.swapRequests('claimed').then(claimed => setSwaps(prev => [...prev.filter(s => s.status !== 'claimed'), ...claimed])).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!roleId && roles[0]) setRoleId(roles[0].id); }, [roles]);
  useEffect(() => {
    const roleEmployees = employees.filter(e => e.role_id === roleId);
    if (roleEmployees[0] && !roleEmployees.some(e => e.id === employeeId)) setEmployeeId(roleEmployees[0].id);
  }, [roleId, employees]);

  const roleEmployees = employees.filter(e => e.role_id === roleId);
  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? '—';
  const employeeName = (id: string) => employees.find(e => e.id === id)?.name ?? '—';

  const addShift = async () => {
    if (!employeeId || !roleId || !date) {
      onShowToast(tr(lang, 'Укажите дату, роль и сотрудника', 'Enter a date, role and employee', "Sana, rol va xodimni kiriting"), 'error');
      return;
    }
    setBusy(true);
    try {
      const plannedStart = new Date(`${date}T${startTime}:00`).toISOString();
      const plannedEnd = new Date(`${date}T${endTime}:00`).toISOString();
      const created = await checklistApi.roster.create({ employeeId, roleId, plannedStart, plannedEnd });
      await checklistApi.roster.publish([created.id]);
      setShowAdd(false);
      load();
      onShowToast(tr(lang, 'Смена опубликована', 'Shift published', 'Smena e\'lon qilindi'), 'success');
    } catch { onShowToast(tr(lang, 'Не удалось создать смену', 'Failed to create shift', "Smena yaratib bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  const cancelShift = async (id: string) => {
    try { await checklistApi.roster.cancel(id); load(); } catch { onShowToast(tr(lang, 'Не удалось отменить', 'Failed to cancel', "Bekor qilib bo'lmadi"), 'error'); }
  };

  const approveSwap = async (id: string) => {
    try { await checklistApi.roster.approveSwap(id); load(); onShowToast(tr(lang, 'Замена одобрена', 'Swap approved', 'Almashtirish tasdiqlandi'), 'success'); }
    catch { onShowToast(tr(lang, 'Нужен исполнитель — дождитесь отклика', 'Needs a claimer first — wait for someone to volunteer', "Avval kimdir javob berishini kuting"), 'error'); }
  };
  const rejectSwap = async (id: string) => {
    try { await checklistApi.roster.rejectSwap(id); load(); }
    catch { onShowToast(tr(lang, 'Не удалось отклонить', 'Failed to reject', "Rad etib bo'lmadi"), 'error'); }
  };

  const upcoming = shifts.filter(s => s.status === 'published' && new Date(s.planned_end) > new Date()).sort((a, b) => a.planned_start.localeCompare(b.planned_start));

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="text-[15px] font-semibold text-text tracking-tight flex items-center gap-2">
            <Calendar size={16} /> {tr(lang, 'Расписание', 'Roster', 'Jadval')}
          </h3>
          <button onClick={() => setShowAdd(v => !v)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold flex items-center gap-1.5">
            <Plus size={14} /> {tr(lang, 'Добавить смену', 'Add shift', "Smena qo'shish")}
          </button>
        </div>

        {showAdd && (
          <div className="mt-3 mb-4 p-3.5 rounded-xl border border-border bg-background space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <select value={roleId} onChange={e => setRoleId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text">
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text">
                {roleEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={addShift} disabled={busy} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50">
                <Send size={14} /> {tr(lang, 'Опубликовать', 'Publish', "E'lon qilish")}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-3.5 py-2 rounded-lg bg-card border border-border text-muted text-[13px] font-medium">
                {tr(lang, 'Отмена', 'Cancel', 'Bekor qilish')}
              </button>
            </div>
          </div>
        )}

        {upcoming.length === 0 ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Смены не запланированы', 'No shifts scheduled', "Smenalar rejalashtirilmagan")}</p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map(s => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
                <div>
                  <span className="text-[13px] text-text font-medium">{s.employee_name}</span>
                  <span className="text-[11px] text-muted ml-2">{s.role_name}</span>
                  <p className="text-[11px] text-muted mt-0.5">
                    {new Date(s.planned_start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {new Date(s.planned_end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button onClick={() => cancelShift(s.id)} className="text-red-500 hover:text-red-600 text-[11px] font-semibold">
                  {tr(lang, 'Отменить', 'Cancel', 'Bekor qilish')}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-[15px] font-semibold text-text tracking-tight mb-3">{tr(lang, 'Запросы на замену', 'Swap requests', "Almashtirish so'rovlari")}</h3>
        {swaps.length === 0 ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Нет активных запросов', 'No active requests', "Faol so'rovlar yo'q")}</p>
        ) : (
          <div className="space-y-1.5">
            {swaps.map(s => (
              <div key={s.id} className="p-3 rounded-lg bg-background border border-border space-y-1.5">
                <p className="text-[13px] text-text">
                  <span className="font-medium">{s.requesting_employee_name}</span>{' '}
                  {tr(lang, 'просит замену на', 'wants coverage for', 'uchun almashtirish so\'ramoqda')}{' '}
                  {new Date(s.planned_start).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {s.reason && <p className="text-[11px] text-muted">{s.reason}</p>}
                <p className="text-[11px] text-muted">
                  {s.status === 'claimed'
                    ? tr(lang, `Готов выйти: ${s.coverer_employee_name}`, `Volunteered: ${s.coverer_employee_name}`, `Tayyor: ${s.coverer_employee_name}`)
                    : tr(lang, 'Ожидает желающего', 'Waiting for a volunteer', "Ko'ngilli kutilmoqda")}
                </p>
                {s.status === 'claimed' && (
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => approveSwap(s.id)} className="px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-600 text-[12px] font-semibold flex items-center gap-1">
                      <Check size={13} /> {tr(lang, 'Одобрить', 'Approve', 'Tasdiqlash')}
                    </button>
                    <button onClick={() => rejectSwap(s.id)} className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 text-[12px] font-semibold flex items-center gap-1">
                      <X size={13} /> {tr(lang, 'Отклонить', 'Reject', 'Rad etish')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
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

function GeofenceTab({ lang, onShowToast }: { lang: Language; onShowToast: Props['onShowToast'] }) {
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
  // (existing lat/lng, or the Tashkent default) is known before Leaflet
  // mounts. Dragging the marker or clicking the map updates `settings`
  // directly; the circle radius reacts to the radius slider separately below.
  useEffect(() => {
    if (loading || !mapRef.current || mapInstance.current) return;
    let cancelled = false;

    loadLeaflet().then(L => {
      if (cancelled || !mapRef.current) return;
      leafletRef.current = L;
      const center: [number, number] = settings?.geofenceLat != null && settings?.geofenceLng != null
        ? [settings.geofenceLat, settings.geofenceLng]
        : DEFAULT_CENTER;

      const map = L.map(mapRef.current, { zoomControl: true }).setView(center, settings?.geofenceLat != null ? 16 : 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker(center, { draggable: true }).addTo(map);
      const circle = L.circle(center, {
        radius: settings?.geofenceRadiusM ?? 150,
        color: '#FF6B35',
        fillColor: '#FF6B35',
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);

      const applyPosition = (lat: number, lng: number) => {
        marker.setLatLng([lat, lng]);
        circle.setLatLng([lat, lng]);
        setSettings(s => (s ? { ...s, geofenceLat: lat, geofenceLng: lng } : s));
      };

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        applyPosition(lat, lng);
      });
      map.on('click', (e: any) => applyPosition(e.latlng.lat, e.latlng.lng));

      mapInstance.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    });

    return () => { cancelled = true; };
  }, [loading]);

  // Radius slider moves the circle live without waiting for save.
  useEffect(() => {
    if (circleRef.current && settings) circleRef.current.setRadius(settings.geofenceRadiusM);
  }, [settings?.geofenceRadiusM]);

  function update<K extends keyof WorkforceGeofenceSettings>(key: K, value: WorkforceGeofenceSettings[K]) {
    setSettings(s => (s ? { ...s, [key]: value } : s));
  }

  async function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        update('geofenceLat', latitude);
        update('geofenceLng', longitude);
        if (mapInstance.current) mapInstance.current.setView([latitude, longitude], 17);
        if (markerRef.current) markerRef.current.setLatLng([latitude, longitude]);
        if (circleRef.current) circleRef.current.setLatLng([latitude, longitude]);
      },
      () => onShowToast(tr(lang, 'Не удалось определить геолокацию', 'Could not get your location', "Joylashuvni aniqlab bo'lmadi"), 'error'),
    );
  }

  async function searchAddress() {
    if (!address.trim()) return;
    setSearching(true);
    try {
      // Nominatim — free, keyless, matches this project's existing
      // no-paid-map-SDK posture (Tailwind/recharts/lucide are all CDN too).
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        onShowToast(tr(lang, 'Адрес не найден', 'Address not found', 'Manzil topilmadi'), 'error');
        return;
      }
      const lat = parseFloat(rows[0].lat);
      const lng = parseFloat(rows[0].lon);
      update('geofenceLat', lat);
      update('geofenceLng', lng);
      if (mapInstance.current) mapInstance.current.setView([lat, lng], 17);
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      if (circleRef.current) circleRef.current.setLatLng([lat, lng]);
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await traceApi.settings.saveGeofence(settings);
      setSettings(result);
      onShowToast(tr(lang, 'Настройки сохранены', 'Settings saved', 'Sozlamalar saqlandi'), 'success');
    } catch {
      onShowToast(tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return <Card><div className="h-64 animate-pulse bg-card-hover rounded-2xl" /></Card>;
  }

  const pinDropped = settings.geofenceLat != null && settings.geofenceLng != null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="lg:col-span-2 !p-0 overflow-hidden">
        <div ref={mapRef} className="w-full h-[420px] rounded-3xl" />
      </Card>

      <div className="space-y-5">
        <Card title={tr(lang, 'Точка филиала', 'Branch location', 'Filial nuqtasi')}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchAddress()}
                placeholder={tr(lang, 'Найти по адресу…', 'Search by address…', 'Manzil bo\'yicha qidirish…')}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text"
              />
              <button
                onClick={searchAddress}
                disabled={searching}
                className="px-3 py-2 rounded-lg bg-card-hover text-[13px] font-medium text-text disabled:opacity-50"
              >
                {tr(lang, 'Найти', 'Search', 'Qidirish')}
              </button>
            </div>
            <button
              onClick={useMyLocation}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-card-hover text-[13px] font-medium text-text"
            >
              <Locate size={14} /> {tr(lang, 'Использовать моё местоположение', 'Use my current location', 'Joriy joylashuvimni ishlatish')}
            </button>
            <p className="text-[12px] text-muted flex items-center gap-1.5">
              <MapPin size={12} />
              {pinDropped
                ? `${settings.geofenceLat!.toFixed(6)}, ${settings.geofenceLng!.toFixed(6)}`
                : tr(lang, 'Точка ещё не установлена — кликните по карте', 'No pin set yet — click the map', 'Nuqta hali belgilanmagan — xaritani bosing')}
            </p>
          </div>
        </Card>

        <Card title={tr(lang, 'Радиус входа', 'Clock-in radius', 'Kirish radiusi')}>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[32px] font-display font-bold text-text tabular-nums">{settings.geofenceRadiusM}</span>
              <span className="text-[13px] text-muted">{tr(lang, 'метров', 'meters', 'metr')}</span>
            </div>
            <input
              type="range"
              min={25}
              max={500}
              step={5}
              value={settings.geofenceRadiusM}
              onChange={e => update('geofenceRadiusM', Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </Card>

        <Card>
          <button
            onClick={() => update('geofenceEnabled', !settings.geofenceEnabled)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 text-left">
              {settings.geofenceEnabled ? <ShieldAlert size={18} className="text-danger shrink-0" /> : <ShieldCheck size={18} className="text-muted shrink-0" />}
              <div>
                <div className="text-[13px] font-semibold text-text">
                  {tr(lang, 'Блокировать вход вне радиуса', 'Enforce geofence on clock-in', 'Kirishni radius tashqarisida bloklash')}
                </div>
                <div className="text-[12px] text-muted mt-0.5">
                  {settings.geofenceEnabled
                    ? tr(lang, 'Сотрудники вне радиуса не смогут открыть смену', 'Employees outside the radius cannot open a shift', "Radiusdan tashqaridagi xodimlar smenani ocha olmaydi")
                    : tr(lang, 'Выключено — вход разрешён из любой точки, попытки логируются', 'Off — clock-in allowed from anywhere, attempts are still logged', "O'chirilgan — istalgan joydan kirish mumkin, urinishlar qayd etiladi")}
                </div>
              </div>
            </div>
            <span className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${settings.geofenceEnabled ? 'bg-danger' : 'bg-card-hover'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.geofenceEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </Card>

        <Card>
          <button
            onClick={() => update('employeeAppEnabled', !settings.employeeAppEnabled)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="text-left">
              <div className="text-[13px] font-semibold text-text">
                {tr(lang, 'Приложение для сотрудников', 'Employee app', 'Xodimlar ilovasi')}
              </div>
              <div className="text-[12px] text-muted mt-0.5">
                {tr(lang, 'Включить смены/пропуска для этого филиала', 'Turn on shifts/clock-in for this branch', 'Ushbu filial uchun smenalarni yoqish')}
              </div>
            </div>
            <span className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${settings.employeeAppEnabled ? 'bg-primary' : 'bg-card-hover'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.employeeAppEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </Card>

        <button
          onClick={save}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold disabled:opacity-50"
        >
          <Save size={14} /> {saving ? tr(lang, 'Сохранение…', 'Saving…', 'Saqlanmoqda…') : tr(lang, 'Сохранить', 'Save', 'Saqlash')}
        </button>
      </div>
    </div>
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
                    <p className="text-[13px] font-semibold text-text">{p.title}</p>
                  </div>
                  {p.body && <p className="text-[12px] text-muted mt-1">{p.body}</p>}
                  <p className="text-[10px] text-muted mt-1.5">{p.author_name} · {new Date(p.published_at).toLocaleDateString()}</p>
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
              <div key={m.id} className={`max-w-[80%] p-2.5 rounded-xl text-[13px] ${m.sender_type === 'owner' || m.sender_type === 'manager' ? 'bg-primary/10 ml-auto text-text' : 'bg-background text-text'}`}>
                <p className="text-[11px] font-semibold text-muted mb-0.5">{m.sender_name}</p>
                <p>{m.body}</p>
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
