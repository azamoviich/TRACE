// Employees — the GM's one place for staff: who's on the team and on shift,
// inviting people into the TRACE Employee app (picked from the POS staff
// list, or app-only staff with no POS record), each person's details, pay
// and working hours, plus the clock-in rules (radius, lateness) and the
// shift schedule. Payroll/roster/geofence UIs are shared with Workforce.tsx;
// Workforce keeps the team-hub content (feed, learn, chat, hub settings).
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, ChevronRight, ChevronLeft, Send, Check, UserPlus, Link2, RotateCcw, Wallet, Phone, Mail, Cake, Users, Clock, CalendarDays } from 'lucide-react';
import { Card } from '../ui/Card';
import { Language, ChecklistRole, ChecklistEmployee } from '../../types';
import { checklistApi, EmployeeDashboard, EmployeeDashboardRow, EmployeeStatus, PosCandidate } from '../../services/traceApi';
import { statusBadge, relativeTimeShort } from './Checklists';
import { PayrollTab, PayProfileEditor, RosterTab, GeofenceTab, AttendanceRulesCard } from './Workforce';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

type Toast = (message: string, type: 'success' | 'error' | 'info') => void;
type Tab = 'team' | 'schedule' | 'payroll' | 'settings';

// post()/checkedFetch() throw "409: {\"error\":\"...\"}" — surface the
// server's own message (e.g. "This phone already belongs to Aziz").
function serverMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  const json = msg.slice(msg.indexOf(':') + 1).trim();
  try { return JSON.parse(json).error ?? null; } catch { return null; }
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
}

// iiko keeps phones however the admin typed them ("90 123 45 67",
// "+998901234567", "998901234567"); the invite needs +998XXXXXXXXX.
function toUzPhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  return digits ? `+${digits}` : '+998';
}

function phoneValid(phone: string): boolean {
  return /^\+998\d{9}$/.test(phone) || /^\+(7|996|992|993)\d{7,12}$/.test(phone);
}

interface Props {
  lang: Language;
  onShowToast: Toast;
}

export function Employees({ lang, onShowToast }: Props) {
  const [tab, setTab] = useState<Tab>('team');

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'team', label: tr(lang, 'Команда', 'Team', 'Jamoa'), icon: Users },
    { id: 'schedule', label: tr(lang, 'Расписание', 'Schedule', 'Jadval'), icon: CalendarDays },
    { id: 'payroll', label: tr(lang, 'Зарплата', 'Payroll', 'Ish haqi'), icon: Wallet },
    { id: 'settings', label: tr(lang, 'Правила входа', 'Clock-in rules', 'Kirish qoidalari'), icon: Clock },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              tab === t.id ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'team' && <TeamTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'schedule' && <RosterTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'payroll' && <PayrollTab lang={lang} onShowToast={onShowToast} />}
      {tab === 'settings' && (
        <div className="space-y-5">
          <AttendanceRulesCard lang={lang} onShowToast={onShowToast} />
          <GeofenceTab lang={lang} onShowToast={onShowToast} />
        </div>
      )}
    </div>
  );
}

// ── Team: stats + list + invite + per-employee drawer ────────────────────
const STATUS_FILTERS: { id: EmployeeStatus | ''; ru: string; en: string; uz: string }[] = [
  { id: '', ru: 'Все', en: 'All', uz: 'Barchasi' },
  { id: 'on_shift', ru: 'На смене', en: 'On shift', uz: 'Smenada' },
  { id: 'invited_not_logged_in', ru: 'Приглашены', en: 'Invited', uz: 'Taklif qilingan' },
  { id: 'onboarded_offline', ru: 'Офлайн', en: 'Offline', uz: 'Oflayn' },
  { id: 'suspended', ru: 'Отключены', en: 'Disabled', uz: "O'chirilgan" },
];

function TeamTab({ lang, onShowToast }: { lang: Language; onShowToast: Toast }) {
  const [dashboard, setDashboard] = useState<EmployeeDashboard | null>(null);
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('');
  const [roleId, setRoleId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => checklistApi.employees.dashboard().then(setDashboard).catch(() => onShowToast(tr(lang, 'Не удалось загрузить сотрудников', 'Failed to load employees', "Xodimlarni yuklab bo'lmadi"), 'error'));
  const loadRoles = () => checklistApi.roles.list().then(setRoles).catch(() => {});
  useEffect(() => { load(); loadRoles(); }, []);

  const rows = useMemo(() => (dashboard?.employees ?? []).filter(e =>
    (!q || e.name.toLowerCase().includes(q.toLowerCase()) || (e.phone ?? '').includes(q))
    && (!status || e.status === status)
    && (!roleId || e.roleId === roleId),
  ), [dashboard, q, status, roleId]);

  const open = dashboard?.employees.find(e => e.id === openId) ?? null;
  const s = dashboard?.summary;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: tr(lang, 'Сотрудников', 'Employees', 'Xodimlar'), value: s?.total },
          { label: tr(lang, 'На смене сейчас', 'On shift now', 'Hozir smenada'), value: s?.onShiftNow, accent: true },
          { label: tr(lang, 'Ждут входа', 'Awaiting first login', 'Kirishni kutmoqda'), value: s?.notYetOnboarded },
          { label: tr(lang, 'Чек-листы сегодня', 'Checklists today', 'Bugungi cheklistlar'), value: s ? (s.checklistsToday.total ? `${s.checklistsToday.done}/${s.checklistsToday.total}` : '—') : undefined },
        ].map(tile => (
          <Card key={tile.label}>
            <p className={`text-[24px] font-display font-bold tabular-nums ${tile.accent ? 'text-primary' : 'text-text'}`}>{tile.value ?? '…'}</p>
            <p className="text-[11px] text-muted uppercase tracking-[0.1em] mt-0.5">{tile.label}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr(lang, 'Имя или телефон', 'Name or phone', 'Ism yoki telefon')}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
          </div>
          <select value={roleId} onChange={e => setRoleId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text">
            <option value="">{tr(lang, 'Все должности', 'All roles', 'Barcha lavozimlar')}</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={() => setInviting(true)} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold flex items-center gap-1.5 hover:bg-primary-hover transition-colors">
            <UserPlus size={15} /> {tr(lang, 'Пригласить', 'Invite', 'Taklif qilish')}
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-3">
          {STATUS_FILTERS.map(f => (
            <button key={f.id || 'all'} onClick={() => setStatus(f.id)}
              className={`px-2.5 py-1 rounded-full text-[12px] font-medium whitespace-nowrap border transition-colors ${status === f.id ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted hover:text-text'}`}>
              {tr(lang, f.ru, f.en, f.uz)}
            </button>
          ))}
        </div>

        {!dashboard ? (
          <p className="text-[13px] text-muted py-6 text-center">{tr(lang, 'Загрузка…', 'Loading…', 'Yuklanmoqda…')}</p>
        ) : dashboard.employees.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[14px] text-text font-semibold">{tr(lang, 'Пока никого нет', 'No one here yet', "Hozircha hech kim yo'q")}</p>
            <p className="text-[12px] text-muted mt-1 mb-4">{tr(lang, 'Пригласите сотрудников из iiko — они получат логин по SMS', 'Invite staff from iiko — they get their login by SMS', "Xodimlarni iiko'dan taklif qiling — ular loginni SMS orqali oladi")}</p>
            <button onClick={() => setInviting(true)} className="px-4 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold inline-flex items-center gap-1.5">
              <UserPlus size={15} /> {tr(lang, 'Пригласить первого', 'Invite the first one', 'Birinchisini taklif qilish')}
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted py-6 text-center">{tr(lang, 'Никого не найдено', 'No matches', 'Hech kim topilmadi')}</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(e => <EmployeeRow key={e.id} lang={lang} e={e} onOpen={() => setOpenId(e.id)} />)}
          </div>
        )}
      </Card>

      {inviting && (
        <InviteModal lang={lang} roles={roles} onShowToast={onShowToast} onRolesChanged={loadRoles}
          onClose={() => setInviting(false)} onInvited={load} />
      )}
      {open && (
        <EmployeeDrawer lang={lang} e={open} roles={roles} onShowToast={onShowToast}
          onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
}

function Avatar({ name, photoUrl, size = 36 }: { name: string; photoUrl: string | null; size?: number }) {
  return photoUrl
    ? <img src={photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : (
      <div className="rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.36 }}>
        {initials(name)}
      </div>
    );
}

function EmployeeRow({ lang, e, onOpen }: { lang: Language; e: EmployeeDashboardRow; onOpen: () => void }) {
  const badge = statusBadge(lang, e.status);
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-card-hover/50 rounded-lg transition-colors">
      <Avatar name={e.name} photoUrl={e.photoUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-medium text-text truncate">{e.name}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
          {e.tempPasswordUsed && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600">{tr(lang, 'Нужна повторная отправка', 'Needs resend', 'Qayta yuborish kerak')}</span>
          )}
        </div>
        <p className="text-[12px] text-muted mt-0.5 truncate">
          {e.roleName}
          {e.status === 'invited_not_logged_in'
            ? ` · ${tr(lang, 'приглашён', 'invited', 'taklif qilingan')} ${relativeTimeShort(lang, e.invitedAt)}`
            : ` · ${tr(lang, 'был(а)', 'active', 'faol edi')} ${relativeTimeShort(lang, e.lastActiveAt)}`}
          {e.posEmployeeId && ' · iiko'}
        </p>
      </div>
      {e.payroll && (
        <div className="text-right hidden sm:block">
          <p className="text-[13px] font-semibold text-text tabular-nums">{Math.round(e.payroll.accrued).toLocaleString('ru-RU')}</p>
          <p className="text-[10px] text-muted">{tr(lang, 'начислено', 'accrued', 'hisoblangan')}</p>
        </div>
      )}
      <ChevronRight size={16} className="text-muted shrink-0" />
    </button>
  );
}

// ── Invite: pick from POS (or no POS) → details → sent ───────────────────
type InviteStep = { kind: 'pick' } | { kind: 'form'; candidate: PosCandidate | null; posRoleName: string | null } | { kind: 'sent'; name: string; to: string };

function InviteModal({ lang, roles, onShowToast, onRolesChanged, onClose, onInvited }: {
  lang: Language; roles: ChecklistRole[]; onShowToast: Toast; onRolesChanged: () => void;
  onClose: () => void; onInvited: () => void;
}) {
  const [step, setStep] = useState<InviteStep>({ kind: 'pick' });
  const [groups, setGroups] = useState<{ posRoleName: string; candidates: PosCandidate[] }[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    checklistApi.employees.posCandidates()
      .then(r => setGroups(r.groups.map(g => ({ posRoleName: g.posRoleName, candidates: g.candidates ?? [] }))))
      .catch(() => setGroups([]));
  }, []);

  const filtered = (groups ?? [])
    .map(g => ({ ...g, candidates: g.candidates.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase())) }))
    .filter(g => g.candidates.length > 0);
  const notActiveCount = (groups ?? []).reduce((n, g) => n + g.candidates.filter(c => c.status === 'not_active').length, 0);

  return (
    <Modal onClose={onClose} title={
      step.kind === 'pick' ? tr(lang, 'Пригласить сотрудника', 'Invite an employee', 'Xodimni taklif qilish')
        : step.kind === 'form' ? tr(lang, 'Данные сотрудника', 'Employee details', "Xodim ma'lumotlari")
        : tr(lang, 'Приглашение отправлено', 'Invite sent', 'Taklifnoma yuborildi')
    } onBack={step.kind === 'form' ? () => setStep({ kind: 'pick' }) : undefined}>
      {step.kind === 'pick' && (
        <div className="space-y-3">
          <p className="text-[12px] text-muted">
            {tr(lang, 'Выберите сотрудника из iiko. Уже подключённые к приложению отмечены — их пригласить нельзя.', 'Pick someone from iiko. People already on the app are marked and can’t be invited again.', "iiko'dan xodimni tanlang. Ilovaga ulanganlar belgilangan — ularni qayta taklif qilib bo'lmaydi.")}
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={tr(lang, 'Поиск по имени', 'Search by name', "Ism bo'yicha qidirish")}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
          </div>
          <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-3">
            {groups === null ? (
              <p className="text-[13px] text-muted py-4 text-center">{tr(lang, 'Загружаем сотрудников из iiko…', 'Loading staff from iiko…', "iiko'dan xodimlar yuklanmoqda…")}</p>
            ) : groups.length === 0 ? (
              <p className="text-[13px] text-muted py-4 text-center">{tr(lang, 'POS не подключён или в нём нет сотрудников', 'No POS connected, or it has no staff', "POS ulanmagan yoki unda xodim yo'q")}</p>
            ) : filtered.length === 0 ? (
              <p className="text-[13px] text-muted py-4 text-center">{tr(lang, 'Никого не найдено', 'No matches', 'Hech kim topilmadi')}</p>
            ) : filtered.map(g => (
              <div key={g.posRoleName}>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-[0.12em] mb-1">{g.posRoleName}</p>
                <div className="space-y-1">
                  {g.candidates.map(c => {
                    const active = c.status === 'active';
                    return (
                      <button key={c.posEmployeeId ?? c.name} disabled={active}
                        onClick={() => setStep({ kind: 'form', candidate: c, posRoleName: g.posRoleName })}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${active ? 'border-border opacity-55 cursor-not-allowed' : 'border-border hover:border-primary/50 hover:bg-primary/5'}`}>
                        <Avatar name={c.name} photoUrl={null} size={30} />
                        <span className="flex-1 text-[13px] text-text truncate">{c.name}</span>
                        {active
                          ? <span className="text-[11px] font-semibold text-green-600 flex items-center gap-1"><Check size={12} /> {tr(lang, 'В приложении', 'On the app', 'Ilovada')}</span>
                          : <ChevronRight size={15} className="text-muted" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {groups !== null && groups.length > 0 && (
            <p className="text-[11px] text-muted">{tr(lang, `Можно пригласить: ${notActiveCount}`, `Available to invite: ${notActiveCount}`, `Taklif qilish mumkin: ${notActiveCount}`)}</p>
          )}
          <button onClick={() => setStep({ kind: 'form', candidate: null, posRoleName: null })}
            className="w-full px-3 py-2.5 rounded-lg border border-dashed border-border text-[13px] text-text hover:border-primary/50 flex items-center justify-center gap-1.5">
            <Plus size={14} /> {tr(lang, 'Сотрудник без iiko', 'Someone without iiko', "iiko'siz xodim")}
          </button>
          <p className="text-[11px] text-muted text-center -mt-1">
            {tr(lang, 'Открывает и закрывает смены только в приложении TRACE', 'Opens and closes shifts in the TRACE app only', 'Smenalarni faqat TRACE ilovasida ochadi va yopadi')}
          </p>
        </div>
      )}

      {step.kind === 'form' && (
        <InviteForm lang={lang} roles={roles} candidate={step.candidate} posRoleName={step.posRoleName}
          onShowToast={onShowToast} onRolesChanged={onRolesChanged}
          onSent={(name, to) => { onInvited(); setStep({ kind: 'sent', name, to }); }} />
      )}

      {step.kind === 'sent' && (
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-full bg-green-500/15 text-green-600 flex items-center justify-center mx-auto mb-3"><Send size={22} /></div>
          <p className="text-[15px] font-semibold text-text">{step.name}</p>
          <p className="text-[13px] text-muted mt-1">
            {tr(lang, `Логин и одноразовый пароль отправлены на ${step.to}`, `Login and one-time password sent to ${step.to}`, `Login va bir martalik parol ${step.to} ga yuborildi`)}
          </p>
          <p className="text-[11px] text-muted mt-3 max-w-sm mx-auto">
            {tr(lang, 'Пароль работает один раз. Если сотрудник его потеряет или войдёт и не завершит регистрацию — нажмите «Отправить снова» в его карточке.', 'The password works once. If they lose it, or sign in without finishing setup, press “Send again” on their card.', "Parol bir marta ishlaydi. Agar xodim uni yo'qotsa yoki kirib ro'yxatdan o'tishni tugatmasa — kartasida «Qayta yuborish» tugmasini bosing.")}
          </p>
          <div className="flex gap-2 justify-center mt-5">
            <button onClick={() => setStep({ kind: 'pick' })} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold">
              {tr(lang, 'Пригласить ещё', 'Invite another', 'Yana taklif qilish')}
            </button>
            <button onClick={onClose} className="px-3.5 py-2 rounded-lg bg-card border border-border text-[13px] font-medium text-muted">
              {tr(lang, 'Готово', 'Done', 'Tayyor')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function InviteForm({ lang, roles, candidate, posRoleName, onShowToast, onRolesChanged, onSent }: {
  lang: Language; roles: ChecklistRole[]; candidate: PosCandidate | null; posRoleName: string | null;
  onShowToast: Toast; onRolesChanged: () => void; onSent: (name: string, to: string) => void;
}) {
  // iiko role name → TRACE role with the same name; offered as a one-click
  // "create" when there's no match yet.
  const matchedRole = posRoleName ? roles.find(r => r.name.trim().toLowerCase() === posRoleName.trim().toLowerCase()) : undefined;
  const [name, setName] = useState(candidate?.name ?? '');
  const [roleId, setRoleId] = useState(matchedRole?.id ?? '');
  const [phone, setPhone] = useState(toUzPhone(candidate?.phone));
  const [email, setEmail] = useState(candidate?.email ?? '');
  const [birthDate, setBirthDate] = useState(candidate?.birthDate ?? '');
  const [language, setLanguage] = useState<'ru' | 'uz' | 'en'>(lang === 'en' ? 'ru' : lang);
  const [busy, setBusy] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);

  const createRoleFromPos = async () => {
    if (!posRoleName) return;
    setCreatingRole(true);
    try {
      const role = await checklistApi.roles.create(posRoleName.trim());
      onRolesChanged();
      setRoleId(role.id);
    } catch { onShowToast(tr(lang, 'Не удалось создать должность', 'Failed to create role', "Lavozim yaratib bo'lmadi"), 'error'); }
    finally { setCreatingRole(false); }
  };

  const phoneOk = phoneValid(phone);
  const canSend = name.trim() && roleId && phoneOk && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      await checklistApi.employees.inviteFull({
        name: name.trim(), roleId, phone, email: email.trim() || undefined, language,
        posEmployeeId: candidate?.posEmployeeId ?? null, posRoleId: candidate?.posRoleId ?? null,
        birthDate: birthDate || null,
      });
      onSent(name.trim(), phone);
    } catch (err) {
      onShowToast(serverMessage(err) ?? tr(lang, 'Не удалось отправить приглашение', 'Failed to send invite', "Taklifnomani yuborib bo'lmadi"), 'error');
    } finally { setBusy(false); }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text';
  return (
    <div className="space-y-3">
      {candidate ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-[12px] text-text">
          <Link2 size={13} className="text-primary" />
          {tr(lang, 'Связан с iiko — данные из iiko можно исправить здесь, в iiko они не изменятся', 'Linked to iiko — fix anything below; iiko itself won’t change', "iiko bilan bog'langan — quyidagilarni tuzatish mumkin, iiko o'zgarmaydi")}
        </div>
      ) : (
        <div className="px-3 py-2 rounded-lg bg-background border border-border text-[12px] text-muted">
          {tr(lang, 'Без iiko: смены только в приложении, процент от продаж недоступен', 'No iiko: shifts in the app only, % of sales unavailable', "iiko'siz: smenalar faqat ilovada, savdodan foiz mavjud emas")}
        </div>
      )}

      <FormField label={tr(lang, 'Имя и фамилия', 'Full name', 'Ism va familiya')}>
        <input value={name} onChange={e => setName(e.target.value)} className={input} />
      </FormField>

      <FormField label={tr(lang, 'Должность', 'Role', 'Lavozim')}>
        <select value={roleId} onChange={e => setRoleId(e.target.value)} className={input}>
          <option value="">{tr(lang, '— выберите —', '— choose —', '— tanlang —')}</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {!roleId && posRoleName && !matchedRole && (
          <button onClick={createRoleFromPos} disabled={creatingRole} className="mt-1.5 text-[12px] text-primary font-semibold disabled:opacity-50">
            + {tr(lang, `Создать должность «${posRoleName}»`, `Create role “${posRoleName}”`, `«${posRoleName}» lavozimini yaratish`)}
          </button>
        )}
      </FormField>

      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label={tr(lang, 'Телефон *', 'Phone *', 'Telefon *')} hint={!phoneOk && phone.length > 4 ? tr(lang, 'Формат: +998 и 9 цифр', 'Format: +998 and 9 digits', 'Format: +998 va 9 raqam') : undefined}>
          <input value={phone} inputMode="tel" onChange={e => setPhone('+' + e.target.value.replace(/\D/g, '').slice(0, 15))} className={`${input} tabular-nums`} />
        </FormField>
        <FormField label={tr(lang, 'Email (необязательно)', 'Email (optional)', 'Email (ixtiyoriy)')}>
          <input value={email} type="email" onChange={e => setEmail(e.target.value)} className={input} />
        </FormField>
        <FormField label={tr(lang, 'Дата рождения', 'Date of birth', "Tug'ilgan sana")}>
          <input value={birthDate} type="date" onChange={e => setBirthDate(e.target.value)} className={input} />
        </FormField>
        <FormField label={tr(lang, 'Язык SMS и приложения', 'SMS & app language', 'SMS va ilova tili')}>
          <select value={language} onChange={e => setLanguage(e.target.value as 'ru' | 'uz' | 'en')} className={input}>
            <option value="ru">Русский</option>
            <option value="uz">O'zbekcha</option>
            <option value="en">English</option>
          </select>
        </FormField>
      </div>

      <button onClick={send} disabled={!canSend} className="w-full mt-1 px-3.5 py-2.5 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
        <Send size={14} /> {busy ? tr(lang, 'Отправка…', 'Sending…', 'Yuborilmoqda…') : tr(lang, 'Отправить приглашение по SMS', 'Send SMS invite', 'SMS taklifnoma yuborish')}
      </button>
    </div>
  );
}

// ── Employee drawer ──────────────────────────────────────────────────────
function EmployeeDrawer({ lang, e, roles, onShowToast, onClose, onChanged }: {
  lang: Language; e: EmployeeDashboardRow; roles: ChecklistRole[]; onShowToast: Toast;
  onClose: () => void; onChanged: () => void;
}) {
  const [view, setView] = useState<'info' | 'pay'>('info');
  const [phone, setPhone] = useState(e.phone ?? '');
  const [email, setEmail] = useState(e.email ?? '');
  const [birthDate, setBirthDate] = useState(e.birthDate ?? '');
  const [roleId, setRoleId] = useState(e.roleId);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setPhone(e.phone ?? ''); setEmail(e.email ?? ''); setBirthDate(e.birthDate ?? ''); setRoleId(e.roleId); setView('info');
  }, [e.id]);

  const dirty = phone !== (e.phone ?? '') || email !== (e.email ?? '') || birthDate !== (e.birthDate ?? '') || roleId !== e.roleId;
  const badge = statusBadge(lang, e.status);
  const invited = e.status === 'invited_not_logged_in';

  const save = async () => {
    if (phone && !phoneValid(phone)) { onShowToast(tr(lang, 'Телефон: +998 и 9 цифр', 'Phone: +998 and 9 digits', 'Telefon: +998 va 9 raqam'), 'error'); return; }
    setBusy(true);
    try {
      await checklistApi.employees.updateDetails(e.id, { phone: phone || null, email: email || null, birthDate: birthDate || null, roleId });
      onShowToast(tr(lang, 'Сохранено', 'Saved', 'Saqlandi'), 'success');
      onChanged();
    } catch (err) {
      onShowToast(serverMessage(err) ?? tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error');
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setResending(true);
    try {
      await checklistApi.employees.resendInvite(e.id);
      onShowToast(tr(lang, `Новый одноразовый пароль отправлен на ${e.phone ?? e.email}`, `New one-time password sent to ${e.phone ?? e.email}`, `Yangi bir martalik parol ${e.phone ?? e.email} ga yuborildi`), 'success');
      onChanged();
    } catch (err) { onShowToast(serverMessage(err) ?? tr(lang, 'Не удалось отправить', 'Failed to send', "Yuborib bo'lmadi"), 'error'); }
    finally { setResending(false); }
  };

  const toggleActive = async () => {
    const disabling = e.status !== 'suspended';
    if (disabling && !window.confirm(tr(lang, `Отключить ${e.name}? Сотрудник потеряет доступ к приложению. Данные сохранятся.`, `Disable ${e.name}? They lose app access; their history is kept.`, `${e.name} o'chirilsinmi? Ilovaga kirish yopiladi, ma'lumotlar saqlanadi.`))) return;
    try {
      await checklistApi.employees.updateDetails(e.id, { active: !disabling });
      onChanged();
    } catch { onShowToast(tr(lang, 'Не удалось изменить', 'Failed to update', "O'zgartirib bo'lmadi"), 'error'); }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text';
  // PayProfileEditor only reads id/name/iiko link from this shape.
  const asChecklistEmployee: ChecklistEmployee = {
    id: e.id, tenant_id: '', role_id: e.roleId, name: e.name, active: e.status !== 'suspended', created_at: '',
    iiko_employee_id: e.posEmployeeId,
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-surface border-l border-border overflow-y-auto animate-slide-in-right" onClick={ev => ev.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-border px-5 py-4 flex items-center gap-3">
          <Avatar name={e.name} photoUrl={e.photoUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-text truncate">{e.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[12px] text-muted">{e.roleName}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text p-1"><X size={18} /></button>
        </div>

        <div className="px-5 pt-4 flex gap-1.5">
          {([['info', tr(lang, 'Профиль', 'Profile', 'Profil')], ['pay', tr(lang, 'Оплата и часы', 'Pay & hours', "To'lov va soatlar")]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setView(id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold ${view === id ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'}`}>{label}</button>
          ))}
        </div>

        {view === 'pay' ? (
          <div className="p-5">
            <PayProfileEditor lang={lang} employee={asChecklistEmployee} onShowToast={onShowToast} onDone={() => { setView('info'); onChanged(); }} />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {invited && (
              <div className={`p-3.5 rounded-xl border ${e.tempPasswordUsed ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                <p className="text-[13px] font-semibold text-text">
                  {e.tempPasswordUsed
                    ? tr(lang, 'Одноразовый пароль уже использован', 'One-time password already used', 'Bir martalik parol ishlatilgan')
                    : tr(lang, 'Ещё не вошёл в приложение', 'Hasn’t signed in yet', 'Hali ilovaga kirmagan')}
                </p>
                <p className="text-[12px] text-muted mt-0.5">
                  {e.tempPasswordUsed
                    ? tr(lang, 'Вошёл, но не задал свой логин и пароль. Отправьте новый пароль.', 'Signed in but never set their own login and password. Send a new one.', "Kirgan, lekin o'z login va parolini o'rnatmagan. Yangisini yuboring.")
                    : tr(lang, `Приглашение отправлено ${relativeTimeShort(lang, e.invitedAt)}. Исправьте телефон ниже, если он неверный, и отправьте снова.`, `Invited ${relativeTimeShort(lang, e.invitedAt)}. Fix the phone below if it's wrong, then send again.`, `Taklif ${relativeTimeShort(lang, e.invitedAt)} yuborilgan. Telefon noto'g'ri bo'lsa, tuzating va qayta yuboring.`)}
                </p>
                <button onClick={resend} disabled={resending || dirty} className="mt-2.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50">
                  <RotateCcw size={13} /> {resending ? tr(lang, 'Отправка…', 'Sending…', 'Yuborilmoqda…') : tr(lang, 'Отправить снова', 'Send again', 'Qayta yuborish')}
                </button>
                {dirty && <p className="text-[11px] text-muted mt-1.5">{tr(lang, 'Сначала сохраните изменения', 'Save your changes first', "Avval o'zgarishlarni saqlang")}</p>}
              </div>
            )}

            <div className="space-y-3">
              <FormField label={tr(lang, 'Телефон', 'Phone', 'Telefon')} icon={Phone}>
                <input value={phone} inputMode="tel" onChange={ev => setPhone(ev.target.value ? '+' + ev.target.value.replace(/\D/g, '').slice(0, 15) : '')} className={`${input} tabular-nums`} />
              </FormField>
              <FormField label="Email" icon={Mail}>
                <input value={email} type="email" onChange={ev => setEmail(ev.target.value)} className={input} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={tr(lang, 'Дата рождения', 'Date of birth', "Tug'ilgan sana")} icon={Cake}>
                  <input value={birthDate} type="date" onChange={ev => setBirthDate(ev.target.value)} className={input} />
                </FormField>
                <FormField label={tr(lang, 'Должность', 'Role', 'Lavozim')}>
                  <select value={roleId} onChange={ev => setRoleId(ev.target.value)} className={input}>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </FormField>
              </div>
              {dirty && (
                <button onClick={save} disabled={busy} className="w-full px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50">
                  {busy ? tr(lang, 'Сохранение…', 'Saving…', 'Saqlanmoqda…') : tr(lang, 'Сохранить', 'Save', 'Saqlash')}
                </button>
              )}
              <p className="text-[11px] text-muted">{tr(lang, 'Имя меняется только здесь или в iiko — сотрудник сам его изменить не может.', 'Only you (or iiko) can change the name — the employee can’t.', "Ismni faqat siz (yoki iiko) o'zgartira oladi — xodim o'zi o'zgartira olmaydi.")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <InfoTile label={tr(lang, 'Начислено за период', 'Accrued this period', 'Davr uchun hisoblangan')} value={e.payroll ? Math.round(e.payroll.accrued).toLocaleString('ru-RU') : '—'} />
              <InfoTile label={tr(lang, 'Рабочие часы', 'Working hours', 'Ish vaqti')} value={e.schedule ? `${e.schedule.start}–${e.schedule.end}` : tr(lang, 'не заданы', 'not set', "belgilanmagan")} onClick={() => setView('pay')} />
              <InfoTile label="iiko" value={e.posEmployeeId ? tr(lang, 'привязан', 'linked', "bog'langan") : tr(lang, 'нет', 'no', "yo'q")} />
              <InfoTile label={tr(lang, 'Последний вход', 'Last sign-in', 'Oxirgi kirish')} value={relativeTimeShort(lang, e.lastActiveAt)} />
            </div>

            <div className="pt-3 border-t border-border">
              <button onClick={toggleActive} className={`text-[13px] font-semibold ${e.status === 'suspended' ? 'text-primary' : 'text-red-500'}`}>
                {e.status === 'suspended' ? tr(lang, 'Вернуть доступ', 'Restore access', 'Kirishni qaytarish') : tr(lang, 'Отключить доступ', 'Disable access', "Kirishni o'chirish")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small shared bits ────────────────────────────────────────────────────
function Modal({ title, onClose, onBack, children }: { title: string; onClose: () => void; onBack?: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface border border-border p-5 animate-slide-up" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          {onBack && <button onClick={onBack} className="text-muted hover:text-text -ml-1"><ChevronLeft size={20} /></button>}
          <h3 className="text-[16px] font-semibold text-text flex-1">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, hint, icon: Icon, children }: { label: string; hint?: string; icon?: typeof Phone; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-muted mb-1 flex items-center gap-1">{Icon && <Icon size={11} />}{label}</label>
      {children}
      {hint && <p className="text-[11px] text-red-500 mt-1">{hint}</p>}
    </div>
  );
}

function InfoTile({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`p-3 rounded-lg bg-background border border-border text-left ${onClick ? 'hover:border-primary/40' : ''}`}>
      <p className="text-[10px] text-muted uppercase tracking-[0.1em]">{label}</p>
      <p className="text-[13px] font-semibold text-text mt-0.5 truncate">{value}</p>
    </Tag>
  );
}
