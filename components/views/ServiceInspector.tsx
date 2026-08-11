import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '../ui/Card';
import { Language } from '../../types';
import { tr } from '../../constants';
import {
  Plus, Trash2, Loader2, Copy, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, KeyRound, UserPlus,
  Camera, TriangleAlert, CheckCheck, X, Flame, Trophy, Send, Clock, LayoutGrid, Building2, BarChart3,
} from 'lucide-react';
import {
  traceApi, staffApi, ChecklistDepartment, ChecklistResultRow, ChecklistViolation, ChecklistStreak, ChecklistLeaderboardRow,
  ChecklistDayDetail, ChecklistDuePeriod, ChecklistShift, ChecklistPendingSubmission, ChecklistMonthDay, ChecklistQuestionType,
  getStaffToken, StaffAccount, StaffPermissions,
} from '../../services/traceApi';

// Fully custom permission flags — no fixed role templates. Whoever creates
// or edits an account ticks these individually, matching the "list of
// permissions per person" hierarchy the owner asked for (Super Admin →
// Branch Manager → Dept Manager → ... → Employee, plus separate Chef/
// Finance/HR verticals — all built from the same flag set + reports-to
// tree rather than hardcoded role names).
const PERMISSION_KEYS: (keyof StaffPermissions)[] = [
  'manage_departments', 'manage_checklists', 'manage_employees', 'manage_staff',
  'create_staff', 'delete_staff', 'assign_managers', 'view_all_branches',
  'view_finance', 'approve_violations', 'view_team_only',
];

function permissionLabel(key: keyof StaffPermissions, lang: Language): string {
  switch (key) {
    case 'manage_departments': return tr(lang, 'Управлять подразделениями', 'Manage departments', "Bo'limlarni boshqarish");
    case 'manage_checklists': return tr(lang, 'Управлять чек-листами', 'Manage checklists', 'Chek-listlarni boshqarish');
    case 'manage_employees': return tr(lang, 'Управлять сотрудниками', 'Manage employees', 'Xodimlarni boshqarish');
    case 'manage_staff': return tr(lang, 'Редактировать права своей команды', "Edit own team's permissions", "O'z jamoasi huquqlarini tahrirlash");
    case 'create_staff': return tr(lang, 'Создавать менеджеров', 'Create managers', 'Menejer yaratish');
    case 'delete_staff': return tr(lang, 'Удалять менеджеров', 'Delete managers', "Menejerni o'chirish");
    case 'assign_managers': return tr(lang, 'Переназначать подчинение', 'Reassign reporting lines', "Bo'ysunishni qayta belgilash");
    case 'view_all_branches': return tr(lang, 'Видеть все филиалы', 'View all branches', "Barcha filiallarni ko'rish");
    case 'view_finance': return tr(lang, 'Видеть финансы', 'View finance', 'Moliyani ko\'rish');
    case 'approve_violations': return tr(lang, 'Подтверждать/отклонять нарушения', 'Approve/dismiss violations', "Buzilishlarni tasdiqlash/rad etish");
    case 'view_team_only': return tr(lang, 'Только своя команда', 'Own team only', "Faqat o'z jamoasi");
  }
}

const QUESTION_TYPES: ChecklistQuestionType[] = ['boolean', 'text', 'single_choice', 'multi_choice', 'rating'];
function questionTypeLabel(t: ChecklistQuestionType, lang: Language): string {
  if (t === 'text') return tr(lang, 'Текст', 'Text answer', 'Matn javob');
  if (t === 'single_choice') return tr(lang, 'Один вариант', 'Single choice', 'Bitta variant');
  if (t === 'multi_choice') return tr(lang, 'Несколько вариантов', 'Multiple choice', "Bir nechta variant");
  if (t === 'rating') return tr(lang, 'Оценка 1-5', 'Rating 1-5', 'Baho 1-5');
  return tr(lang, 'Да/Нет', 'Checkbox', 'Ha/Yoq');
}

function formatChecklistDate(iso: string, lang: Language): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function shiftLabel(shift: ChecklistShift, lang: Language): string {
  if (shift === 'day') return tr(lang, 'День', 'Day', 'Kunduzi');
  if (shift === 'night') return tr(lang, 'Ночь', 'Night', 'Tunda');
  return tr(lang, 'Любая', 'Any', "Har qanday");
}

function periodLabel(period: ChecklistDuePeriod, lang: Language): string {
  if (period === 'opening') return tr(lang, 'Открытие', 'Opening', 'Ochilish');
  if (period === 'midshift') return tr(lang, 'В течение смены', 'Midshift', 'Smena davomida');
  if (period === 'closing') return tr(lang, 'Закрытие', 'Closing', 'Yopilish');
  return tr(lang, 'Без времени', 'Any time', 'Vaqtsiz');
}

const DUE_PERIODS: ChecklistDuePeriod[] = ['any', 'opening', 'midshift', 'closing'];
const SHIFTS: ChecklistShift[] = ['any', 'day', 'night'];
const WEEKDAY_LABELS: Record<Language, string[]> = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
};

type Range = 'today' | '7days' | '30days';
type Tab = 'overview' | 'departments' | 'results' | 'team';

export const ServiceInspector: React.FC<{
  lang: Language;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}> = ({ lang, onShowToast }) => {
  // Staff (delegated manager) sessions never carry the owner token this
  // component's Team tab needs, and their checklist writes are already
  // scoped server-side to their departments (see staffAuth.ts /
  // checklist.ts) — hiding org-structure controls here is just UX polish
  // on top of that, not the enforcement boundary itself.
  const isStaff = !!getStaffToken();
  const [tab, setTab] = useState<Tab>('overview');

  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffDisplayName, setNewStaffDisplayName] = useState('');
  const [newStaffRoleName, setNewStaffRoleName] = useState('');
  const [newStaffDepts, setNewStaffDepts] = useState<Set<string>>(new Set());
  const [newStaffParentId, setNewStaffParentId] = useState('');
  const [newStaffPermissions, setNewStaffPermissions] = useState<Set<string>>(new Set());
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [newEmpManager, setNewEmpManager] = useState<Record<string, string>>({});

  const [departments, setDepartments] = useState<ChecklistDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newDeptSlug, setNewDeptSlug] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [creatingDept, setCreatingDept] = useState(false);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [newItemType, setNewItemType] = useState<Record<string, ChecklistQuestionType>>({});
  const [newItemOptionsRaw, setNewItemOptionsRaw] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newEmpName, setNewEmpName] = useState<Record<string, string>>({});
  const [newEmpPin, setNewEmpPin] = useState<Record<string, string>>({});
  const [pinDraft, setPinDraft] = useState<Record<string, string>>({});

  const [range, setRange] = useState<Range>('7days');
  const [results, setResults] = useState<ChecklistResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(true);

  const [violations, setViolations] = useState<ChecklistViolation[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(true);
  const [violationFilter, setViolationFilter] = useState<'open' | 'all'>('open');

  const [streaks, setStreaks] = useState<ChecklistStreak[]>([]);
  const [leaderboard, setLeaderboard] = useState<ChecklistLeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const [dayDetail, setDayDetail] = useState<ChecklistDayDetail | null>(null);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [dayDetailError, setDayDetailError] = useState<string | null>(null);

  const [pending, setPending] = useState<ChecklistPendingSubmission[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const todayIso = new Date().toISOString();

  const [calendarDept, setCalendarDept] = useState<string>('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthDays, setMonthDays] = useState<ChecklistMonthDay[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    traceApi.checklist.departments().then(setDepartments).finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    traceApi.checklist.departments().then(setDepartments);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!calendarDept && departments.length > 0) setCalendarDept(departments[0].id);
  }, [departments, calendarDept]);

  useEffect(() => {
    setResultsLoading(true);
    traceApi.checklist.results(range).then(setResults).finally(() => setResultsLoading(false));
  }, [range]);

  useEffect(() => {
    traceApi.checklist.streaks().then(setStreaks);
  }, [departments]);

  useEffect(() => {
    setPendingLoading(true);
    traceApi.checklist.pendingSubmissions().then(setPending).finally(() => setPendingLoading(false));
  }, [departments]);

  useEffect(() => {
    setLeaderboardLoading(true);
    traceApi.checklist.leaderboard(range).then(setLeaderboard).finally(() => setLeaderboardLoading(false));
  }, [range]);

  useEffect(() => {
    if (!calendarDept) return;
    setMonthLoading(true);
    traceApi.checklist.month(calendarMonth, calendarDept).then(setMonthDays).finally(() => setMonthLoading(false));
  }, [calendarMonth, calendarDept]);

  const loadViolations = useCallback(() => {
    setViolationsLoading(true);
    traceApi.checklist.violations(violationFilter).then(setViolations).finally(() => setViolationsLoading(false));
  }, [violationFilter]);

  useEffect(() => { loadViolations(); }, [loadViolations]);

  const loadStaffAccounts = useCallback(() => {
    setStaffLoading(true);
    staffApi.list().then(setStaffAccounts).catch(() => {}).finally(() => setStaffLoading(false));
  }, []);

  useEffect(() => { loadStaffAccounts(); }, [loadStaffAccounts]);

  const handleCreateStaff = async () => {
    if (!newStaffUsername.trim() || newStaffPassword.length < 6 || !newStaffDisplayName.trim() || !newStaffRoleName.trim()) return;
    setCreatingStaff(true);
    try {
      const permissions: StaffPermissions = {};
      for (const key of newStaffPermissions) (permissions as any)[key] = true;
      await staffApi.create({
        username: newStaffUsername.trim(),
        password: newStaffPassword,
        display_name: newStaffDisplayName.trim(),
        role_name: newStaffRoleName.trim(),
        department_ids: Array.from(newStaffDepts),
        parent_staff_id: newStaffParentId || null,
        permissions,
      });
      setNewStaffUsername(''); setNewStaffPassword(''); setNewStaffDisplayName(''); setNewStaffRoleName('');
      setNewStaffDepts(new Set()); setNewStaffParentId(''); setNewStaffPermissions(new Set());
      loadStaffAccounts();
    } catch (e: any) {
      onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error');
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleToggleStaffActive = (staff: StaffAccount) => withBusy(`staff-${staff.id}`, async () => {
    await staffApi.update(staff.id, { active: !staff.active });
    loadStaffAccounts();
  });

  const handleDeleteStaff = (staff: StaffAccount) => withBusy(`staff-del-${staff.id}`, async () => {
    await staffApi.remove(staff.id);
    loadStaffAccounts();
  });

  const handleTogglePermission = (staff: StaffAccount, key: keyof StaffPermissions) => withBusy(`staff-perm-${staff.id}-${key}`, async () => {
    await staffApi.update(staff.id, { permissions: { ...staff.permissions, [key]: !staff.permissions[key] } });
    loadStaffAccounts();
  });

  const handleReparentStaff = (staff: StaffAccount, parentId: string) => withBusy(`staff-parent-${staff.id}`, async () => {
    await staffApi.update(staff.id, { parent_staff_id: parentId || null });
    loadStaffAccounts();
  });

  const handleViolationStatus = (id: string, status: 'resolved' | 'dismissed') => withBusy(`vio-${id}`, async () => {
    await traceApi.checklist.updateViolationStatus(id, status);
    loadViolations();
  });

  const openDayDetail = (departmentId: string, isoDate: string) => {
    setDayDetail(null);
    setDayDetailError(null);
    setDayDetailLoading(true);
    const date = isoDate.slice(0, 10);
    traceApi.checklist.day(departmentId, date)
      .then(setDayDetail)
      .catch((e: Error) => setDayDetailError(e.message))
      .finally(() => setDayDetailLoading(false));
  };

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyIds(p => new Set(p).add(id));
    try { await fn(); } catch (e: any) { onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error'); }
    finally { setBusyIds(p => { const n = new Set(p); n.delete(id); return n; }); }
  };

  const handleCreateDept = async () => {
    if (!newDeptSlug.trim() || !newDeptName.trim()) return;
    setCreatingDept(true);
    try {
      await traceApi.checklist.createDepartment(newDeptSlug.trim(), newDeptName.trim());
      setNewDeptSlug(''); setNewDeptName('');
      refresh();
      onShowToast?.(tr(lang, 'Подразделение создано', 'Department created', "Bo'lim yaratildi"), 'success');
    } catch (e: any) {
      onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error');
    } finally {
      setCreatingDept(false);
    }
  };

  const handleDeleteDept = (dept: ChecklistDepartment) => withBusy(dept.id, async () => {
    if (!confirm(tr(lang, `Удалить «${dept.name}» вместе со всеми пунктами?`, `Delete "${dept.name}" and all its items?`, `"${dept.name}" va barcha bandlarini o'chirasizmi?`))) return;
    await traceApi.checklist.deleteDepartment(dept.id);
    refresh();
  });

  const handleToggleActive = (dept: ChecklistDepartment) => withBusy(dept.id, async () => {
    await traceApi.checklist.updateDepartment(dept.id, { active: !dept.active });
    refresh();
  });

  const handleAddItem = (dept: ChecklistDepartment) => withBusy(`add-${dept.id}`, async () => {
    const text = (newItemText[dept.id] ?? '').trim();
    if (!text) return;
    const question_type = newItemType[dept.id] ?? 'boolean';
    const options = (question_type === 'single_choice' || question_type === 'multi_choice')
      ? (newItemOptionsRaw[dept.id] ?? '').split(',').map(s => s.trim()).filter(Boolean)
      : undefined;
    await traceApi.checklist.addItem(dept.id, text, { question_type, options });
    setNewItemText(p => ({ ...p, [dept.id]: '' }));
    setNewItemOptionsRaw(p => ({ ...p, [dept.id]: '' }));
    refresh();
  });

  const handleDeleteItem = (itemId: string) => withBusy(itemId, async () => {
    await traceApi.checklist.deleteItem(itemId);
    refresh();
  });

  const handleEditItem = (itemId: string, text: string) => withBusy(itemId, async () => {
    await traceApi.checklist.updateItem(itemId, { text });
    refresh();
  });

  const handleChangeQuestionType = (itemId: string, question_type: ChecklistQuestionType) => withBusy(`qtype-${itemId}`, async () => {
    const needsOptions = question_type === 'single_choice' || question_type === 'multi_choice';
    await traceApi.checklist.updateItem(itemId, { question_type, options: needsOptions ? ['Option 1', 'Option 2'] : undefined });
    refresh();
  });

  const handleEditOptions = (itemId: string, optionsCsv: string) => withBusy(`opts-${itemId}`, async () => {
    const options = optionsCsv.split(',').map(s => s.trim()).filter(Boolean);
    if (options.length < 2) return;
    await traceApi.checklist.updateItem(itemId, { options });
    refresh();
  });

  const handleTogglePhotoRequired = (itemId: string, photo_required: boolean) => withBusy(`photo-${itemId}`, async () => {
    await traceApi.checklist.updateItem(itemId, { photo_required });
    refresh();
  });

  const handleCycleDuePeriod = (itemId: string, current: ChecklistDuePeriod) => withBusy(`period-${itemId}`, async () => {
    const next = DUE_PERIODS[(DUE_PERIODS.indexOf(current) + 1) % DUE_PERIODS.length];
    await traceApi.checklist.updateItem(itemId, { due_period: next });
    refresh();
  });

  const handleCycleShift = (itemId: string, current: ChecklistShift) => withBusy(`shift-${itemId}`, async () => {
    const next = SHIFTS[(SHIFTS.indexOf(current) + 1) % SHIFTS.length];
    await traceApi.checklist.updateItem(itemId, { shift: next });
    refresh();
  });

  const handleAddEmployee = (dept: ChecklistDepartment) => withBusy(`add-emp-${dept.id}`, async () => {
    const name = (newEmpName[dept.id] ?? '').trim();
    const pin = (newEmpPin[dept.id] ?? '').trim();
    if (!name) return;
    if (pin && !/^\d{4,6}$/.test(pin)) {
      onShowToast?.(tr(lang, 'PIN должен быть 4-6 цифр', 'PIN must be 4-6 digits', 'PIN 4-6 raqamdan iborat bo\'lishi kerak'), 'error');
      return;
    }
    const reportsTo = newEmpManager[dept.id] || undefined;
    await traceApi.checklist.addEmployee(dept.id, name, pin || undefined, reportsTo);
    setNewEmpName(p => ({ ...p, [dept.id]: '' }));
    setNewEmpPin(p => ({ ...p, [dept.id]: '' }));
    refresh();
  });

  const handleSetEmployeeManager = (empId: string, managerId: string) => withBusy(`emp-manager-${empId}`, async () => {
    await traceApi.checklist.updateEmployee(empId, { reports_to_staff_id: managerId || null });
    refresh();
  });

  const handleSetPin = (empId: string) => withBusy(`pin-${empId}`, async () => {
    const pin = (pinDraft[empId] ?? '').trim();
    if (!/^\d{4,6}$/.test(pin)) {
      onShowToast?.(tr(lang, 'PIN должен быть 4-6 цифр', 'PIN must be 4-6 digits', 'PIN 4-6 raqamdan iborat bo\'lishi kerak'), 'error');
      return;
    }
    await traceApi.checklist.updateEmployee(empId, { pin });
    setPinDraft(p => ({ ...p, [empId]: '' }));
    onShowToast?.(tr(lang, 'PIN обновлён', 'PIN updated', 'PIN yangilandi'), 'success');
    refresh();
  });

  const handleToggleEmployeeActive = (empId: string, active: boolean) => withBusy(`emp-active-${empId}`, async () => {
    await traceApi.checklist.updateEmployee(empId, { active });
    refresh();
  });

  const handleDeleteEmployee = (empId: string, name: string) => withBusy(`del-emp-${empId}`, async () => {
    if (!confirm(tr(lang, `Удалить сотрудника «${name}»?`, `Delete employee "${name}"?`, `"${name}" xodimini o'chirasizmi?`))) return;
    await traceApi.checklist.deleteEmployee(empId);
    refresh();
  });

  const copySubdomain = (dept: ChecklistDepartment) => {
    navigator.clipboard?.writeText(`https://${dept.subdomainPreview}`);
    setCopiedId(dept.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const RANGES: { key: Range; label: string }[] = [
    { key: 'today',  label: tr(lang, 'Сегодня', 'Today', 'Bugun') },
    { key: '7days',  label: tr(lang, '7 дней', '7 days', '7 kun') },
    { key: '30days', label: tr(lang, '30 дней', '30 days', '30 kun') },
  ];

  const openViolationsCount = violations.filter(v => v.status === 'open').length;
  const pendingCount = pending.length;

  const TABS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'overview', label: tr(lang, 'Обзор', 'Overview', 'Umumiy'), icon: <LayoutGrid size={13} />, badge: (violationFilter === 'open' ? openViolationsCount : 0) + pendingCount || undefined },
    { key: 'departments', label: tr(lang, 'Отделы', 'Departments', "Bo'limlar"), icon: <Building2 size={13} /> },
    { key: 'results', label: tr(lang, 'Результаты', 'Results', 'Natijalar'), icon: <BarChart3 size={13} /> },
    { key: 'team' as Tab, label: tr(lang, 'Команда', 'Team', 'Jamoa'), icon: <UserPlus size={13} /> },
  ];

  // ── Calendar grid ──────────────────────────────────────────────────────
  const monthByDate = useMemo(() => {
    const map = new Map<string, ChecklistMonthDay>();
    monthDays.forEach(d => map.set(d.date.slice(0, 10), d));
    return map;
  }, [monthDays]);

  const calendarCells = useMemo(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const startOffset = (first.getUTCDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: (string | null)[] = Array(startOffset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${calendarMonth}-${String(d).padStart(2, '0')}`);
    }
    return cells;
  }, [calendarMonth]);

  const shiftMonth = (delta: number) => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + delta, 1));
    setCalendarMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = new Date(`${calendarMonth}-01T00:00:00`).toLocaleDateString(
    lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US', { month: 'long', year: 'numeric' },
  );

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-[22px] font-bold text-text tracking-tight">ServiceInspector</h1>
      </div>

      <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg transition-all ${
              tab === t.key ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'
            }`}
          >
            {t.icon}
            {t.label}
            {!!t.badge && (
              <span className="ml-0.5 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[9px] font-bold">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {!pendingLoading && pending.length > 0 && (
            <Card
              title={tr(lang, 'Ещё не отправлено сегодня', 'Not submitted yet today', 'Bugun hali yuborilmagan')}
              action={<Clock size={15} className="text-amber-500" />}
            >
              <div className="flex flex-wrap gap-2">
                {pending.map(p => (
                  <button
                    key={`${p.department_id}:${p.shift}`}
                    onClick={() => openDayDetail(p.department_id, todayIso)}
                    className="flex items-center gap-1.5 text-[11px] font-medium bg-amber-500/10 text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/15 transition-colors"
                  >
                    {p.department_name}
                    {p.shift !== 'any' && <span className="opacity-70">· {shiftLabel(p.shift, lang)}</span>}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card
            title={tr(lang, 'Нарушения', 'Violations', 'Nosozliklar')}
            action={
              <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
                {(['open', 'all'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setViolationFilter(f)}
                    className={`px-2.5 py-1 text-[10px] font-medium rounded-[3px] transition-all ${violationFilter === f ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'}`}
                  >
                    {f === 'open' ? tr(lang, 'Открытые', 'Open', 'Ochiq') : tr(lang, 'Все', 'All', 'Hammasi')}
                  </button>
                ))}
              </div>
            }
          >
            {violationsLoading ? (
              <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-muted" /></div>
            ) : violations.length === 0 ? (
              <p className="text-[12px] text-muted text-center py-6">
                {violationFilter === 'open'
                  ? tr(lang, 'Открытых нарушений нет', 'No open violations', "Ochiq nosozliklar yo'q")
                  : tr(lang, 'Нарушений пока нет', 'No violations yet', "Hozircha nosozliklar yo'q")}
              </p>
            ) : (
              <div className="space-y-2">
                {violations.map(v => (
                  <div key={v.id} className={`flex gap-3 p-3 rounded-xl border ${v.status === 'open' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-background border-border opacity-60'}`}>
                    <a href={v.photo_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                      <img src={v.photo_url} alt="" className="w-14 h-14 rounded-lg object-cover" />
                    </a>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted mb-0.5">
                        <span className="font-medium text-text">{v.department_name}</span>
                        <span>·</span>
                        <span>{v.item_text}</span>
                        {v.employee_name && <><span>·</span><span>{v.employee_name}</span></>}
                      </div>
                      {v.note && <p className="text-[12px] text-text mb-1.5">{v.note}</p>}
                      <div className="text-[10px] text-muted">{new Date(v.created_at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')}</div>
                    </div>
                    {v.status === 'open' && (
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleViolationStatus(v.id, 'resolved')}
                          disabled={busyIds.has(`vio-${v.id}`)}
                          title={tr(lang, 'Решено', 'Resolved', 'Hal qilindi')}
                          className="p-1.5 bg-success/10 text-success hover:bg-success hover:text-white rounded-lg transition-colors"
                        >
                          <CheckCheck size={13} />
                        </button>
                        <button
                          onClick={() => handleViolationStatus(v.id, 'dismissed')}
                          disabled={busyIds.has(`vio-${v.id}`)}
                          title={tr(lang, 'Отклонить', 'Dismiss', "Rad etish")}
                          className="p-1.5 text-muted hover:text-danger rounded-lg transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={tr(lang, 'Лидеры', 'Leaderboard', 'Yetakchilar')} action={<Trophy size={15} className="text-amber-500" />}>
            {leaderboardLoading ? (
              <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted" /></div>
            ) : leaderboard.length === 0 ? (
              <p className="text-[12px] text-muted text-center py-4">{tr(lang, 'Пока нет данных', 'No data yet', "Hozircha ma'lumot yo'q")}</p>
            ) : (
              <div className="space-y-1.5">
                {leaderboard.map((row, i) => (
                  <div key={row.employee_name} className="flex items-center gap-3 px-2.5 py-1.5">
                    <span className={`text-[12px] font-bold w-5 text-center flex-shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-muted' : i === 2 ? 'text-orange-600' : 'text-muted/60'}`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[13px] font-medium text-text truncate">{row.employee_name}</span>
                    <span className="text-[12px] font-bold text-text metric-number">{row.completed_count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'departments' && (
        <div className="space-y-4 animate-fade-in">
          {!isStaff && (
          <Card title={tr(lang, 'Новое подразделение', 'New Department', "Yangi bo'lim")}>
            <p className="text-[11px] text-muted mb-3 leading-relaxed">
              {tr(lang,
                'Например: bar, kitchen, manager, cleaner — станет ссылкой вида bar-название.trace-os.uz для сотрудников без входа в систему.',
                'E.g.: bar, kitchen, manager, cleaner — becomes a no-login employee link like bar-name.trace-os.uz.',
                "Masalan: bar, kitchen, manager, cleaner — xodimlar uchun bar-nomi.trace-os.uz ko'rinishidagi havolaga aylanadi.")}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={newDeptSlug}
                onChange={e => setNewDeptSlug(e.target.value)}
                placeholder={tr(lang, 'slug (например bar)', 'slug (e.g. bar)', 'slug (masalan bar)')}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
              />
              <input
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                placeholder={tr(lang, 'Название (например Бар)', 'Display name (e.g. Bar)', "Nomi (masalan Bar)")}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
              />
              <button
                onClick={handleCreateDept}
                disabled={creatingDept || !newDeptSlug.trim() || !newDeptName.trim()}
                className="px-4 py-2 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {creatingDept ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {tr(lang, 'Создать', 'Create', 'Yaratish')}
              </button>
            </div>
          </Card>
          )}

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted" /></div>
          ) : departments.length === 0 ? (
            <Card><p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Подразделений пока нет', 'No departments yet', "Hozircha bo'limlar yo'q")}</p></Card>
          ) : (
            <div className="space-y-3">
              {departments.map(dept => {
                const isOpen = expanded.has(dept.id);
                const busy = busyIds.has(dept.id);
                const deptStreaks = streaks.filter(s => s.department_id === dept.id && s.streak > 0);
                return (
                  <Card key={dept.id} className={!dept.active ? 'opacity-70' : ''}>
                    <button
                      onClick={() => setExpanded(p => { const n = new Set(p); n.has(dept.id) ? n.delete(dept.id) : n.add(dept.id); return n; })}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[14px] font-semibold text-text truncate">{dept.name}</h3>
                          {!dept.active && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/15 text-muted uppercase tracking-wide">
                              {tr(lang, 'скрыт', 'hidden', 'yashirin')}
                            </span>
                          )}
                          {deptStreaks.map(s => (
                            <span key={s.shift} className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-500 flex-shrink-0">
                              <Flame size={11} /> {s.streak}{s.shift !== 'any' && <span className="text-[9px] opacity-70">({shiftLabel(s.shift, lang)})</span>}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-[10px] text-muted truncate">{dept.subdomainPreview}</code>
                          <span
                            role="button"
                            onClick={e => { e.stopPropagation(); copySubdomain(dept); }}
                            className="text-muted hover:text-primary flex-shrink-0"
                          >
                            {copiedId === dept.id ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                          </span>
                        </div>
                      </div>
                      <span className="p-1.5 text-muted flex-shrink-0">
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="mt-4 pt-4 border-t border-border space-y-4">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
                            {tr(lang, 'Пункты чек-листа', 'Checklist items', "Chek-list bandlari")}
                          </div>
                          <div className="space-y-2">
                            {dept.items.map(item => (
                              <div key={item.id} className="rounded-xl bg-background border border-border p-2.5 space-y-2">
                                <div className="flex items-center gap-2">
                                  {item.photo_url && (
                                    <a href={item.photo_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                                      <img src={item.photo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-border" />
                                    </a>
                                  )}
                                  <input
                                    defaultValue={item.text}
                                    onBlur={e => { if (e.target.value.trim() && e.target.value !== item.text) handleEditItem(item.id, e.target.value.trim()); }}
                                    className="flex-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                                  />
                                  <button
                                    onClick={() => handleTogglePhotoRequired(item.id, !item.photo_required)}
                                    disabled={busyIds.has(`photo-${item.id}`)}
                                    title={tr(lang, 'Требовать фото', 'Require photo', 'Foto talab qilish')}
                                    className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${item.photo_required ? 'bg-primary/10 text-primary' : 'text-muted hover:text-text'}`}
                                  >
                                    <Camera size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    disabled={busyIds.has(item.id)}
                                    className="p-1.5 text-muted hover:text-danger flex-shrink-0"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => handleCycleDuePeriod(item.id, item.due_period)}
                                    disabled={busyIds.has(`period-${item.id}`)}
                                    title={tr(lang, 'Когда выполнять', 'When to do it', 'Qachon bajarish')}
                                    className={`text-[9px] px-2 py-1 rounded-full font-medium transition-colors ${item.due_period !== 'any' ? 'bg-primary/10 text-primary' : 'bg-card text-muted hover:text-text border border-border'}`}
                                  >
                                    {periodLabel(item.due_period, lang)}
                                  </button>
                                  <button
                                    onClick={() => handleCycleShift(item.id, item.shift)}
                                    disabled={busyIds.has(`shift-${item.id}`)}
                                    title={tr(lang, 'Какая смена', 'Which shift', 'Qaysi smena')}
                                    className={`text-[9px] px-2 py-1 rounded-full font-medium transition-colors ${item.shift !== 'any' ? 'bg-orange-500/10 text-orange-600' : 'bg-card text-muted hover:text-text border border-border'}`}
                                  >
                                    {shiftLabel(item.shift, lang)}
                                  </button>
                                  <select
                                    value={item.question_type}
                                    onChange={e => handleChangeQuestionType(item.id, e.target.value as ChecklistQuestionType)}
                                    disabled={busyIds.has(`qtype-${item.id}`)}
                                    className="text-[9px] px-2 py-1 rounded-full font-medium bg-card text-muted hover:text-text border border-border focus:outline-none focus:border-primary"
                                  >
                                    {QUESTION_TYPES.map(qt => (
                                      <option key={qt} value={qt}>{questionTypeLabel(qt, lang)}</option>
                                    ))}
                                  </select>
                                </div>
                                {(item.question_type === 'single_choice' || item.question_type === 'multi_choice') && (
                                  <input
                                    key={item.id + (item.options?.join(',') ?? '')}
                                    defaultValue={item.options?.join(', ') ?? ''}
                                    onBlur={e => { if (e.target.value.trim()) handleEditOptions(item.id, e.target.value); }}
                                    placeholder={tr(lang, 'Варианты через запятую', 'Options, comma-separated', 'Variantlar, vergul bilan')}
                                    className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary"
                                  />
                                )}
                              </div>
                            ))}
                            {dept.items.length === 0 && (
                              <p className="text-[11px] text-muted py-1">{tr(lang, 'Пунктов пока нет', 'No items yet', "Hozircha bandlar yo'q")}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              value={newItemText[dept.id] ?? ''}
                              onChange={e => setNewItemText(p => ({ ...p, [dept.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter' && (newItemType[dept.id] ?? 'boolean') === 'boolean') handleAddItem(dept); }}
                              placeholder={tr(lang, 'Новый пункт...', 'New item...', 'Yangi band...')}
                              className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                            />
                            <select
                              value={newItemType[dept.id] ?? 'boolean'}
                              onChange={e => setNewItemType(p => ({ ...p, [dept.id]: e.target.value as ChecklistQuestionType }))}
                              className="bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary flex-shrink-0"
                            >
                              {QUESTION_TYPES.map(qt => (
                                <option key={qt} value={qt}>{questionTypeLabel(qt, lang)}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAddItem(dept)}
                              disabled={busyIds.has(`add-${dept.id}`) || !(newItemText[dept.id] ?? '').trim()}
                              className="p-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg flex-shrink-0 transition-colors disabled:opacity-40"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          {(newItemType[dept.id] === 'single_choice' || newItemType[dept.id] === 'multi_choice') && (
                            <input
                              value={newItemOptionsRaw[dept.id] ?? ''}
                              onChange={e => setNewItemOptionsRaw(p => ({ ...p, [dept.id]: e.target.value }))}
                              placeholder={tr(lang, 'Варианты через запятую', 'Options, comma-separated', 'Variantlar, vergul bilan')}
                              className="w-full mt-2 bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary"
                            />
                          )}
                        </div>

                        <div className="pt-4 border-t border-border">
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted mb-2.5">
                            <UserPlus size={12} />
                            {tr(lang, 'Сотрудники', 'Employees', 'Xodimlar')}
                          </div>
                          <p className="text-[10px] text-muted mb-3 leading-relaxed">
                            {tr(lang,
                              'Добавь сотрудников с PIN — на входной странице они введут PIN вместо общего доступа.',
                              'Add employees with a PIN — on the entry page they enter their PIN instead of shared access.',
                              "PIN bilan xodim qo'sh — kirish sahifasida umumiy kirish o'rniga PIN kiritadi.")}
                          </p>
                          <div className="space-y-2 mb-3">
                            {dept.employees.map(emp => (
                              <div key={emp.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background border border-border ${!emp.active ? 'opacity-50' : ''}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[12px] font-medium text-text truncate">{emp.name}</span>
                                    {!emp.has_pin && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 uppercase tracking-wide flex-shrink-0">
                                        {tr(lang, 'нет PIN', 'no PIN', 'PIN yo\'q')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <select
                                  value={emp.reports_to_staff_id ?? ''}
                                  onChange={e => handleSetEmployeeManager(emp.id, e.target.value)}
                                  disabled={busyIds.has(`emp-manager-${emp.id}`)}
                                  title={tr(lang, 'Подчиняется', 'Reports to', "Bo'ysunadi")}
                                  className="w-28 bg-card border border-border rounded-lg px-1.5 py-1 text-[10px] text-text focus:outline-none focus:border-primary flex-shrink-0"
                                >
                                  <option value="">{tr(lang, 'без менеджера', 'no manager', "menejersiz")}</option>
                                  {staffAccounts.map(s => (
                                    <option key={s.id} value={s.id}>{s.display_name}</option>
                                  ))}
                                </select>
                                <input
                                  value={pinDraft[emp.id] ?? ''}
                                  onChange={e => setPinDraft(p => ({ ...p, [emp.id]: e.target.value.replace(/\D/g, '') }))}
                                  placeholder={tr(lang, 'новый PIN', 'new PIN', 'yangi PIN')}
                                  inputMode="numeric"
                                  maxLength={6}
                                  className="w-24 bg-card border border-border rounded-lg px-2 py-1 text-[11px] text-text focus:outline-none focus:border-primary"
                                />
                                <button
                                  onClick={() => handleSetPin(emp.id)}
                                  disabled={busyIds.has(`pin-${emp.id}`) || !pinDraft[emp.id]}
                                  className="p-1.5 text-muted hover:text-primary disabled:opacity-40 flex-shrink-0"
                                  title={tr(lang, 'Установить PIN', 'Set PIN', 'PIN belgilash')}
                                >
                                  {busyIds.has(`pin-${emp.id}`) ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                                </button>
                                <button
                                  onClick={() => handleToggleEmployeeActive(emp.id, !emp.active)}
                                  disabled={busyIds.has(`emp-active-${emp.id}`)}
                                  className="text-[10px] font-medium text-muted hover:text-text flex-shrink-0 px-1"
                                >
                                  {emp.active ? tr(lang, 'скрыть', 'hide', 'yashirish') : tr(lang, 'вернуть', 'restore', 'qaytarish')}
                                </button>
                                <button
                                  onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                  disabled={busyIds.has(`del-emp-${emp.id}`)}
                                  className="p-1.5 text-muted hover:text-danger flex-shrink-0"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                            {dept.employees.length === 0 && (
                              <p className="text-[11px] text-muted py-1">{tr(lang, 'Сотрудников пока нет — общий доступ по ссылке', 'No employees yet — shared access via link', "Hozircha xodimlar yo'q — havola orqali umumiy kirish")}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              value={newEmpName[dept.id] ?? ''}
                              onChange={e => setNewEmpName(p => ({ ...p, [dept.id]: e.target.value }))}
                              placeholder={tr(lang, 'Имя', 'Name', 'Ism')}
                              className="flex-1 min-w-[100px] bg-background border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                            />
                            <input
                              value={newEmpPin[dept.id] ?? ''}
                              onChange={e => setNewEmpPin(p => ({ ...p, [dept.id]: e.target.value.replace(/\D/g, '') }))}
                              placeholder={tr(lang, 'PIN (необязательно)', 'PIN (optional)', 'PIN (majburiy emas)')}
                              inputMode="numeric"
                              maxLength={6}
                              className="w-28 bg-background border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                            />
                            {staffAccounts.length > 0 && (
                              <select
                                value={newEmpManager[dept.id] ?? ''}
                                onChange={e => setNewEmpManager(p => ({ ...p, [dept.id]: e.target.value }))}
                                title={tr(lang, 'Подчиняется', 'Reports to', "Bo'ysunadi")}
                                className="w-32 bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary"
                              >
                                <option value="">{tr(lang, 'без менеджера', 'no manager', 'menejersiz')}</option>
                                {staffAccounts.map(s => (
                                  <option key={s.id} value={s.id}>{s.display_name}</option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => handleAddEmployee(dept)}
                              disabled={busyIds.has(`add-emp-${dept.id}`) || !(newEmpName[dept.id] ?? '').trim()}
                              className="p-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg flex-shrink-0 transition-colors disabled:opacity-40"
                            >
                              {busyIds.has(`add-emp-${dept.id}`) ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-border">
                          <button
                            onClick={() => handleToggleActive(dept)}
                            disabled={busy}
                            className="text-[11px] font-medium text-muted hover:text-text"
                          >
                            {dept.active ? tr(lang, 'Скрыть подразделение', 'Hide department', "Bo'limni yashirish") : tr(lang, 'Показать подразделение', 'Show department', "Bo'limni ko'rsatish")}
                          </button>
                          {!isStaff && (
                          <button
                            onClick={() => handleDeleteDept(dept)}
                            disabled={busy}
                            className="text-[11px] font-semibold text-danger hover:bg-danger/8 px-2 py-1 rounded-lg flex items-center gap-1.5"
                          >
                            {busy ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                            {tr(lang, 'Удалить', 'Delete', "O'chirish")}
                          </button>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-4 animate-fade-in">
          <Card
            title={tr(lang, 'Календарь', 'Calendar', 'Taqvim')}
            action={
              departments.length > 1 ? (
                <select
                  value={calendarDept}
                  onChange={e => setCalendarDept(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary"
                >
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ) : undefined
            }
          >
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => shiftMonth(-1)} className="p-1.5 text-muted hover:text-text rounded-lg">
                <ChevronLeft size={16} />
              </button>
              <span className="text-[13px] font-semibold text-text capitalize">{monthLabel}</span>
              <button onClick={() => shiftMonth(1)} className="p-1.5 text-muted hover:text-text rounded-lg">
                <ChevronRight size={16} />
              </button>
            </div>

            {monthLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-muted" /></div>
            ) : (
              <div className="max-w-[300px] mx-auto">
                <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                  {WEEKDAY_LABELS[lang].map(d => (
                    <div key={d} className="text-center text-[8px] font-semibold text-muted/70 uppercase py-1 tracking-wide">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {calendarCells.map((date, i) => {
                    if (!date) return <div key={`e${i}`} />;
                    const entry = monthByDate.get(date);
                    const done = entry ? Number(entry.done) : 0;
                    const total = entry ? Number(entry.total) : 0;
                    const pct = total > 0 ? Math.round((done / total) * 100) : null;
                    const submitted = entry ? Number(entry.submissions) > 0 : false;
                    const dayNum = Number(date.slice(-2));
                    const isFuture = date > new Date().toISOString().slice(0, 10);
                    const colorClass =
                      pct === null ? 'bg-transparent text-muted/40 border-transparent' :
                      pct === 100 ? 'bg-success/15 text-success border-success/20' :
                      pct >= 50 ? 'bg-amber-500/15 text-amber-600 border-amber-500/20' :
                      'bg-danger/10 text-danger border-danger/15';
                    return (
                      <button
                        key={date}
                        onClick={() => calendarDept && total > 0 && openDayDetail(calendarDept, date)}
                        disabled={total === 0 || isFuture}
                        className={`relative aspect-square rounded-md border text-[10px] font-medium flex items-center justify-center transition-colors ${colorClass} ${total > 0 && !isFuture ? 'hover:brightness-110 cursor-pointer' : 'cursor-default'}`}
                      >
                        {dayNum}
                        {submitted && <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-success" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[9px] text-muted">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success/15 border border-success/20" /> 100%</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/15 border border-amber-500/20" /> 50-99%</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-danger/10 border border-danger/15" /> &lt;50%</span>
                  <span className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-success" /> {tr(lang, 'отправлено', 'submitted', 'yuborildi')}</span>
                </div>
              </div>
            )}
          </Card>

          <Card title={tr(lang, 'История', 'History', 'Tarix')}>
            <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5 w-fit mb-4">
              {RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded-[3px] transition-all ${range === r.key ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {resultsLoading ? (
              <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-muted" /></div>
            ) : results.length === 0 ? (
              <p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Пока нет данных за период', 'No data for this period yet', "Davr uchun hali ma'lumot yo'q")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border">
                      <th className="pb-2 font-medium">{tr(lang, 'Дата', 'Date', 'Sana')}</th>
                      <th className="pb-2 font-medium">{tr(lang, 'Подразделение', 'Department', "Bo'lim")}</th>
                      <th className="pb-2 font-medium">{tr(lang, 'Смена', 'Shift', 'Smena')}</th>
                      <th className="pb-2 font-medium">{tr(lang, 'Отправлено', 'Submitted', 'Yuborildi')}</th>
                      <th className="pb-2 font-medium text-right">{tr(lang, 'Выполнено', 'Done', 'Bajarildi')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const done = parseInt(r.done, 10);
                      const total = parseInt(r.total, 10);
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      return (
                        <tr
                          key={i}
                          onClick={() => openDayDetail(r.department_id, r.date)}
                          className="border-b border-border/50 cursor-pointer hover:bg-background transition-colors"
                        >
                          <td className="py-2 text-text">{formatChecklistDate(r.date, lang)}</td>
                          <td className="py-2 text-text">{r.department_name}</td>
                          <td className="py-2 text-muted">{r.shift !== 'any' ? shiftLabel(r.shift, lang) : '—'}</td>
                          <td className="py-2 text-muted">
                            {r.submitted_by ? (
                              <span className="flex items-center gap-1 text-success">
                                <Send size={11} /> {r.submitted_by}
                              </span>
                            ) : '—'}
                          </td>
                          <td className={`py-2 text-right font-semibold ${pct === 100 ? 'text-emerald-500' : pct < 50 ? 'text-danger' : 'text-text'}`}>
                            {done}/{total} ({pct}%)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'team' && (() => {
        // Tree render: root = whoever this account reports to (owner = no
        // staff row at all). Depth comes from walking parent_staff_id, used
        // purely for indentation — no fixed role→level mapping, matches
        // the "custom hierarchy per restaurant" model.
        const byParent = new Map<string, StaffAccount[]>();
        for (const s of staffAccounts) {
          const key = s.parent_staff_id ?? '';
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key)!.push(s);
        }
        const rows: { staff: StaffAccount; depth: number }[] = [];
        const walk = (parentKey: string, depth: number) => {
          for (const s of byParent.get(parentKey) ?? []) {
            rows.push({ staff: s, depth });
            walk(s.id, depth + 1);
          }
        };
        walk('', 0);

        return (
        <div className="space-y-4 animate-fade-in">
          <Card title={tr(lang, 'Новый сотрудник команды', 'New team member', 'Jamoaga yangi a\'zo')}>
            <p className="text-[11px] text-muted mb-3 leading-relaxed">
              {tr(lang,
                'Создайте аккаунт с должностью, подчинением и списком разрешений — управляющий, шеф, финдиректор, кассир и т.д.',
                'Create an account with a job title, a reporting line, and a permission list — branch manager, chef, finance director, cashier, etc.',
                "Lavozim, bo'ysunish va ruxsatlar ro'yxati bilan hisob yarating — boshqaruvchi, shef, moliya direktori, kassir va h.k.")}
            </p>
            <div className="grid sm:grid-cols-2 gap-2 mb-2">
              <input
                value={newStaffDisplayName}
                onChange={e => setNewStaffDisplayName(e.target.value)}
                placeholder={tr(lang, 'Имя', 'Display name', 'Ismi')}
                className="bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
              />
              <input
                value={newStaffRoleName}
                onChange={e => setNewStaffRoleName(e.target.value)}
                placeholder={tr(lang, 'Должность (например Су-шеф)', 'Job title (e.g. Sous-chef)', 'Lavozim (masalan Su-shef)')}
                className="bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
              />
              <input
                value={newStaffUsername}
                onChange={e => setNewStaffUsername(e.target.value)}
                placeholder={tr(lang, 'Логин', 'Username', 'Login')}
                autoComplete="off"
                className="bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
              />
              <input
                value={newStaffPassword}
                onChange={e => setNewStaffPassword(e.target.value)}
                placeholder={tr(lang, 'Пароль (мин. 6 символов)', 'Password (min 6 chars)', 'Parol (kamida 6 belgi)')}
                type="password"
                autoComplete="new-password"
                className="bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
                {tr(lang, 'Подчиняется', 'Reports to', "Bo'ysunadi")}
              </div>
              <select
                value={newStaffParentId}
                onChange={e => setNewStaffParentId(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
              >
                <option value="">{tr(lang, 'Владелец (верхний уровень)', 'Owner (top level)', 'Egasi (yuqori daraja)')}</option>
                {rows.map(({ staff: s, depth }) => (
                  <option key={s.id} value={s.id}>{'—'.repeat(depth)} {s.display_name} ({s.role_name})</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
                {tr(lang, 'Доступные подразделения', 'Departments this account can manage', "Boshqara oladigan bo'limlar")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {departments.map(d => {
                  const checked = newStaffDepts.has(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setNewStaffDepts(p => { const n = new Set(p); checked ? n.delete(d.id) : n.add(d.id); return n; })}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                        checked ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-background border-border text-muted hover:text-text'
                      }`}
                    >
                      {d.name}
                    </button>
                  );
                })}
                {departments.length === 0 && (
                  <p className="text-[11px] text-muted">{tr(lang, 'Сначала создайте подразделение', 'Create a department first', "Avval bo'lim yarating")}</p>
                )}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
                {tr(lang, 'Разрешения', 'Permissions', 'Ruxsatlar')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PERMISSION_KEYS.map(key => {
                  const checked = newStaffPermissions.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewStaffPermissions(p => { const n = new Set(p); checked ? n.delete(key) : n.add(key); return n; })}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                        checked ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-background border-border text-muted hover:text-text'
                      }`}
                    >
                      {permissionLabel(key, lang)}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleCreateStaff}
              disabled={creatingStaff || !newStaffUsername.trim() || newStaffPassword.length < 6 || !newStaffDisplayName.trim() || !newStaffRoleName.trim()}
              className="px-4 py-2 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {creatingStaff ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              {tr(lang, 'Создать', 'Create', 'Yaratish')}
            </button>
          </Card>

          {staffLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted" /></div>
          ) : staffAccounts.length === 0 ? (
            <Card><p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Команда пока пуста', 'Team is empty so far', "Jamoa hozircha bo'sh")}</p></Card>
          ) : (
            <div className="space-y-2">
              {rows.map(({ staff: s, depth }) => (
                <Card key={s.id} className={!s.active ? 'opacity-60' : ''} style={{ marginLeft: depth * 18 }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {depth > 0 && <span className="text-muted text-[11px]">└</span>}
                        <h3 className="text-[13px] font-semibold text-text truncate">{s.display_name}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/15 text-muted uppercase tracking-wide">{s.role_name}</span>
                      </div>
                      <div className="text-[11px] text-muted mt-1">
                        {s.username} · {s.departments.map(d => d.name).join(', ') || tr(lang, 'нет доступа', 'no access', "kirish yo'q")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleToggleStaffActive(s)}
                        disabled={busyIds.has(`staff-${s.id}`)}
                        className="text-[11px] font-medium text-muted hover:text-text px-2 py-1"
                      >
                        {s.active ? tr(lang, 'отключить', 'disable', "o'chirish") : tr(lang, 'включить', 'enable', 'yoqish')}
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(s)}
                        disabled={busyIds.has(`staff-del-${s.id}`)}
                        className="p-1.5 text-muted hover:text-danger flex-shrink-0"
                      >
                        {busyIds.has(`staff-del-${s.id}`) ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted flex-shrink-0">
                        {tr(lang, 'Подчиняется', 'Reports to', "Bo'ysunadi")}
                      </span>
                      <select
                        value={s.parent_staff_id ?? ''}
                        onChange={e => handleReparentStaff(s, e.target.value)}
                        disabled={busyIds.has(`staff-parent-${s.id}`)}
                        className="bg-background border border-border rounded-lg px-2 py-1 text-[11px] text-text focus:outline-none focus:border-primary"
                      >
                        <option value="">{tr(lang, 'Владелец', 'Owner', 'Egasi')}</option>
                        {staffAccounts.filter(o => o.id !== s.id).map(o => (
                          <option key={o.id} value={o.id}>{o.display_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PERMISSION_KEYS.map(key => {
                        const checked = s.permissions?.[key] === true;
                        const busy = busyIds.has(`staff-perm-${s.id}-${key}`);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleTogglePermission(s, key)}
                            disabled={busy}
                            className={`text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
                              checked ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-background border-border text-muted hover:text-text'
                            }`}
                          >
                            {permissionLabel(key, lang)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      {(dayDetailLoading || dayDetail || dayDetailError) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => { setDayDetail(null); setDayDetailError(null); }}>
          <div className="glass rounded-3xl p-5 max-w-[440px] w-full max-h-[80vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-text">
                {dayDetail ? `${dayDetail.department_name} · ${formatChecklistDate(dayDetail.date, lang)}` : tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}
              </h3>
              <button onClick={() => { setDayDetail(null); setDayDetailError(null); }} className="text-muted hover:text-text flex-shrink-0">
                <X size={18} />
              </button>
            </div>

            {dayDetailLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted" /></div>
            ) : dayDetailError ? (
              <p className="text-danger text-[12px] text-center py-6">{dayDetailError}</p>
            ) : dayDetail ? (
              <>
                {dayDetail.submissions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {dayDetail.submissions.map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-success bg-success/10 rounded-lg px-2.5 py-1.5 w-fit">
                        <Send size={11} />
                        {s.shift !== 'any' && <span className="font-semibold">{shiftLabel(s.shift, lang)}:</span>}
                        {s.employee_name ?? tr(lang, 'сотрудник', 'employee', 'xodim')}
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  {dayDetail.items.map(item => (
                    <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${item.completed ? 'bg-success/5 border-success/20' : 'bg-background border-border'}`}>
                      {item.completed
                        ? <CheckCheck size={16} className="text-success flex-shrink-0" />
                        : <X size={16} className="text-muted flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] ${item.completed ? 'text-text' : 'text-muted'}`}>{item.text}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.shift !== 'any' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/15 text-muted uppercase tracking-wide">{shiftLabel(item.shift, lang)}</span>
                          )}
                          {item.employee_name && (
                            <p className="text-[10px] text-muted">{item.employee_name}</p>
                          )}
                        </div>
                      </div>
                      {item.photo_url && (
                        <a href={item.photo_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                          <img src={item.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
