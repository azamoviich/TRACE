import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Camera, ChevronRight, ArrowLeft, X, Download, Pencil, Calendar as CalendarIcon, History as HistoryIcon, Building2 as Building2Icon, Copy } from 'lucide-react';
import { Card } from '../ui/Card';
import { DateRangePicker } from '../ui/DateRangePicker';
import { Language } from '../../types';
import { checklistApi, getSubdomain, getActiveBranchId, traceApi, BranchSummary } from '../../services/traceApi';
import type {
  ChecklistRole, ChecklistEmployee, ChecklistManager, Checklist, ChecklistItem, ChecklistItemType, ChecklistStats,
  ChecklistHistoryRow, ChecklistAuditLogEntry, ChecklistWithItems,
} from '../../types';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

// Every delete action in this feature is irreversible (roles/employees are
// now shared across every branch in the organization — deleting one removes
// it everywhere at once) — a plain click was one accidental tap away from
// wiping something. Native confirm() is blunt but reliable and needs no
// extra UI plumbing to wire into five different delete buttons.
function confirmDelete(lang: Language, what: string): boolean {
  return window.confirm(tr(lang, `Удалить «${what}»? Это нельзя отменить.`, `Delete "${what}"? This can't be undone.`, `"${what}" o'chirilsinmi? Buni bekor qilib bo'lmaydi.`));
}

type Tab = 'dashboard' | 'roles' | 'employees' | 'managers' | 'checklists' | 'history';

interface Props {
  lang: Language;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function Checklists({ lang, onShowToast }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [branches, setBranches] = useState<BranchSummary[]>([]);

  const loadRoles = () => checklistApi.roles.list().then(setRoles).catch(() => onShowToast(tr(lang, 'Не удалось загрузить роли', 'Failed to load roles', "Rollarni yuklab bo'lmadi"), 'error')).finally(() => setLoadingRoles(false));
  useEffect(() => { loadRoles(); }, []);
  useEffect(() => { traceApi.org.branches().then(setBranches).catch(() => {}); }, []);

  // The header's branch switcher doesn't change the actual URL/subdomain —
  // it just sets an X-Branch-Id override (see getActiveBranchId/apiFetch) for
  // every request. getSubdomain() always reflects the real browser hostname
  // (the home branch), so it never changed after switching — this component
  // remounts on switch (App.tsx's key={branchKey}), so re-reading
  // getActiveBranchId() here on mount gives the actual selected branch.
  const activeBranchId = getActiveBranchId();
  const currentBranch = branches.find(b => b.id === activeBranchId) ?? branches.find(b => b.subdomain === getSubdomain());

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: tr(lang, 'Дашборд', 'Dashboard', 'Boshqaruv') },
    { id: 'checklists', label: tr(lang, 'Чек-листы', 'Checklists', "Cheklistlar") },
    { id: 'roles', label: tr(lang, 'Должности', 'Roles', 'Lavozimlar') },
    { id: 'employees', label: tr(lang, 'Сотрудники', 'Employees', 'Xodimlar') },
    { id: 'managers', label: tr(lang, 'Менеджеры', 'Managers', 'Menejerlar') },
    { id: 'history', label: tr(lang, 'История', 'History', 'Tarix') },
  ];

  return (
    <div className="space-y-4">
      {branches.length > 1 && (
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <Building2Icon size={13} />
          {tr(lang, 'Вы редактируете чек-листы филиала:', 'Editing checklists for branch:', 'Filial cheklistlarini tahrirlamoqdasiz:')}
          <span className="font-semibold text-text">{currentBranch?.name ?? getSubdomain()}</span>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab lang={lang} roles={roles} />}
      {tab === 'roles' && <RolesTab lang={lang} roles={roles} loading={loadingRoles} onChange={loadRoles} onShowToast={onShowToast} />}
      {tab === 'employees' && <EmployeesTab lang={lang} roles={roles} onShowToast={onShowToast} />}
      {tab === 'managers' && <ManagersTab lang={lang} roles={roles} onShowToast={onShowToast} />}
      {tab === 'checklists' && <ChecklistsTab lang={lang} roles={roles} onShowToast={onShowToast} branches={branches} currentBranch={currentBranch} />}
      {tab === 'history' && (
        <HistoryTab
          lang={lang}
          roles={roles}
          historyApi={(date, roleId) => checklistApi.history(date, roleId)}
          auditLogApi={(limit) => checklistApi.auditLog(limit)}
        />
      )}
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────
type StatsApi = (params: { roleId?: string; from?: string; to?: string }) => Promise<ChecklistStats>;

export function DashboardTab({ lang, roles, statsApi = checklistApi.stats }: { lang: Language; roles: ChecklistRole[]; statsApi?: StatsApi }) {
  const [roleId, setRoleId] = useState<string>('');
  const [stats, setStats] = useState<ChecklistStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const dateBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLoading(true);
    const params = { ...(roleId ? { roleId } : {}), ...(range ? { from: range.from, to: range.to } : {}) };
    statsApi(params).then(setStats).catch(() => setStats(null)).finally(() => setLoading(false));
  }, [roleId, range]);

  const pct = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setRoleId('')} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${!roleId ? 'bg-primary text-white' : 'bg-card text-muted'}`}>
            {tr(lang, 'Все', 'All', 'Barchasi')}
          </button>
          {roles.map(r => (
            <button key={r.id} onClick={() => setRoleId(r.id)} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${roleId === r.id ? 'bg-primary text-white' : 'bg-card text-muted'}`}>
              {r.name}
            </button>
          ))}
        </div>
        <div className="relative">
          <button
            ref={dateBtnRef}
            onClick={() => setPickerOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-medium text-text"
          >
            <CalendarIcon size={13} />
            {range ? `${range.from} — ${range.to}` : tr(lang, 'Сегодня', 'Today', 'Bugun')}
          </button>
          <DateRangePicker
            lang={lang}
            value={range}
            isOpen={pickerOpen}
            onClose={() => setPickerOpen(false)}
            anchorRef={dateBtnRef}
            onApply={r => { setRange(r); setPickerOpen(false); }}
            onClear={() => { setRange(null); setPickerOpen(false); }}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card title={tr(lang, 'Выполнено сегодня', "Completed today", 'Bugun bajarilgan')}>
              <p className="text-[26px] font-bold text-text metric-number">{pct}%</p>
              <p className="text-[12px] text-muted mt-1">{stats?.done ?? 0} / {stats?.total ?? 0}</p>
            </Card>
          </div>

          <Card title={tr(lang, 'Лидерборд', 'Leaderboard', 'Yetakchilar')}>
            {(!stats?.leaderboard || stats.leaderboard.length === 0) ? (
              <p className="text-[13px] text-muted">{tr(lang, 'Пока нет данных', 'No data yet', "Hozircha ma'lumot yo'q")}</p>
            ) : (
              <div className="space-y-2">
                {stats.leaderboard.map(row => (
                  <div key={row.employee_id} className="flex items-center justify-between text-[13px]">
                    <span className="text-text">{row.name}</span>
                    <span className="text-muted metric-number">{row.done}/{row.total}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={tr(lang, 'Фото-подтверждения', 'Photo proof', 'Foto tasdiqlar')}>
            {(!stats?.recentPhotos || stats.recentPhotos.length === 0) ? (
              <p className="text-[13px] text-muted">{tr(lang, 'Пока нет фото', 'No photos yet', "Hozircha fotolar yo'q")}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {stats.recentPhotos.map((p, i) => (
                  <a key={i} href={p.photo_url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-border aspect-square">
                    <img src={p.photo_url} alt={p.item_text} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────
type HistoryApi = (date: string, roleId?: string) => Promise<ChecklistHistoryRow[]>;
type AuditLogApi = (limit?: number) => Promise<ChecklistAuditLogEntry[]>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function answerText(lang: Language, row: ChecklistHistoryRow): string | null {
  if (!row.answer_value) return null;
  if ('text' in row.answer_value) return row.answer_value.text;
  if ('number' in row.answer_value) return String(row.answer_value.number);
  if ('rating' in row.answer_value) return `${row.answer_value.rating}/5`;
  if ('choice' in row.answer_value) return row.answer_value.choice;
  return null;
}

export function HistoryTab({ lang, roles, historyApi, auditLogApi }: {
  lang: Language; roles: ChecklistRole[]; historyApi: HistoryApi; auditLogApi?: AuditLogApi;
}) {
  const [date, setDate] = useState(todayISO());
  const [roleId, setRoleId] = useState('');
  const [rows, setRows] = useState<ChecklistHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLog, setAuditLog] = useState<ChecklistAuditLogEntry[] | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    setLoading(true);
    historyApi(date, roleId || undefined).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [date, roleId]);

  const loadAuditLog = () => {
    if (!auditLogApi) return;
    auditLogApi(150).then(setAuditLog).catch(() => setAuditLog([]));
  };

  // role -> checklist -> employee -> items
  const grouped: { roleName: string; checklists: { checklistName: string; employees: { employeeName: string; items: ChecklistHistoryRow[] }[] }[] }[] = [];
  for (const row of rows) {
    let roleGroup = grouped.find(g => g.roleName === row.role_name);
    if (!roleGroup) { roleGroup = { roleName: row.role_name, checklists: [] }; grouped.push(roleGroup); }
    let clGroup = roleGroup.checklists.find(c => c.checklistName === row.checklist_name);
    if (!clGroup) { clGroup = { checklistName: row.checklist_name, employees: [] }; roleGroup.checklists.push(clGroup); }
    let empGroup = clGroup.employees.find(e => e.employeeName === row.employee_name);
    if (!empGroup) { empGroup = { employeeName: row.employee_name, items: [] }; clGroup.employees.push(empGroup); }
    empGroup.items.push(row);
  }

  const actionLabel = (a: ChecklistAuditLogEntry['action']) =>
    a === 'create' ? tr(lang, 'добавил(а)', 'created', "qo'shdi")
      : a === 'update' ? tr(lang, 'изменил(а)', 'updated', "o'zgartirdi")
      : tr(lang, 'удалил(а)', 'deleted', "o'chirdi");

  const entityLabel = (e: ChecklistAuditLogEntry['entity_type']) =>
    e === 'checklist' ? tr(lang, 'чек-лист', 'checklist', 'cheklist')
      : e === 'role' ? tr(lang, 'роль', 'role', 'rol')
      : e === 'employee' ? tr(lang, 'сотрудника', 'employee', 'xodim')
      : tr(lang, 'менеджера', 'manager', 'menejer');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={e => setDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text"
        />
        <select value={roleId} onChange={e => setRoleId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text">
          <option value="">{tr(lang, 'Все роли', 'All roles', 'Barcha rollar')}</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
      ) : grouped.length === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Ничего не пройдено в этот день', 'Nothing completed this day', "Bu kunda hech narsa bajarilmagan")}</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(roleGroup => (
            <Card key={roleGroup.roleName} title={roleGroup.roleName}>
              <div className="space-y-3">
                {roleGroup.checklists.map(cl => (
                  <div key={cl.checklistName}>
                    <p className="text-[13px] font-medium text-text mb-1.5">{cl.checklistName}</p>
                    <div className="space-y-2 pl-2 border-l-2 border-border">
                      {cl.employees.map(emp => (
                        <div key={emp.employeeName} className="pl-2">
                          <p className="text-[12px] font-semibold text-text mb-1">{emp.employeeName}</p>
                          <div className="space-y-1">
                            {emp.items.map(item => {
                              const text = answerText(lang, item);
                              return (
                                <div key={item.item_id} className="flex items-center gap-2 text-[12px] flex-wrap">
                                  <span className={item.done ? 'text-green-600' : 'text-muted'}>{item.done ? '✓' : '—'}</span>
                                  <span className="text-muted">{item.item_text}</span>
                                  {text && <span className="text-text font-medium">({text})</span>}
                                  {item.photo_url && (
                                    <a href={item.photo_url} target="_blank" rel="noreferrer" className="text-primary underline">
                                      {tr(lang, 'фото', 'photo', 'foto')}
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {auditLogApi && (
        <Card
          title={tr(lang, 'Журнал изменений', 'Change log', "O'zgarishlar jurnali")}
          subtitle={tr(lang, 'Кто и когда менял роли, сотрудников, менеджеров и чек-листы', 'Who changed roles, employees, managers, and checklists, and when', "Kim va qachon rol, xodim, menejer va cheklistlarni o'zgartirgani")}
          action={
            <button
              onClick={() => { const next = !showAudit; setShowAudit(next); if (next && !auditLog) loadAuditLog(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold text-text"
            >
              <HistoryIcon size={13} /> {showAudit ? tr(lang, 'Скрыть', 'Hide', 'Yashirish') : tr(lang, 'Показать', 'Show', "Ko'rsatish")}
            </button>
          }
        >
          {showAudit && (
            !auditLog ? (
              <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
            ) : auditLog.length === 0 ? (
              <p className="text-[13px] text-muted">{tr(lang, 'Пока нет изменений', 'No changes yet', "Hozircha o'zgarish yo'q")}</p>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {auditLog.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between gap-2 flex-wrap text-[12px] px-2 py-1.5 rounded-lg bg-background border border-border">
                    <span className="text-text break-words">
                      <span className="font-semibold">{entry.actor_name}</span>
                      {' '}{actionLabel(entry.action)}{' '}{entityLabel(entry.entity_type)}{' '}
                      <span className="font-medium">«{entry.entity_name}»</span>
                    </span>
                    <span className="text-muted whitespace-nowrap">{new Date(entry.created_at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </Card>
      )}
    </div>
  );
}

// ── Roles ────────────────────────────────────────────────────────────────
function RolesTab({ lang, roles, loading, onChange, onShowToast }: {
  lang: Language; roles: ChecklistRole[]; loading: boolean; onChange: () => void;
  onShowToast: (m: string, t: 'success' | 'error' | 'info') => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await checklistApi.roles.create(name.trim());
      setName('');
      onChange();
    } catch { onShowToast(tr(lang, 'Не удалось создать роль', 'Failed to create role', "Rol yaratib bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  const tenantSubdomain = getSubdomain();
  const employeeUrl = (r: ChecklistRole) => `checklist-${r.slug}-${tenantSubdomain}.trace-os.uz`;
  const copyUrl = (r: ChecklistRole) => {
    navigator.clipboard.writeText(`https://${employeeUrl(r)}`);
    onShowToast(tr(lang, 'Ссылка скопирована', 'Link copied', 'Havola nusxalandi'), 'success');
  };

  return (
    <Card title={tr(lang, 'Должности', 'Roles', 'Lavozimlar')} subtitle={tr(lang, 'Официант, кассир, хостес и т.д.', 'Waiter, cashier, hostess, etc.', 'Ofitsiant, kassir va h.k.')}>
      <div className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={tr(lang, 'Название должности', 'Role name', 'Lavozim nomi')}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text"
        />
        <button onClick={add} disabled={busy} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50">
          <Plus size={15} /> {tr(lang, 'Добавить', 'Add', "Qo'shish")}
        </button>
      </div>

      {loading ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
      ) : roles.length === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Ролей пока нет', 'No roles yet', "Hozircha rol yo'q")}</p>
      ) : (
        <div className="space-y-1.5">
          {roles.map(r => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
              <div>
                <span className="text-[13px] text-text">{r.name}</span>
                <button onClick={() => copyUrl(r)} className="block text-[11px] text-muted hover:text-primary mt-0.5 text-left">
                  {employeeUrl(r)}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => { await checklistApi.roles.update(r.id, { active: !r.active }); onChange(); }}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${r.active ? 'bg-green-500/10 text-green-600' : 'bg-muted/10 text-muted'}`}
                >
                  {r.active ? tr(lang, 'Активна', 'Active', 'Faol') : tr(lang, 'Скрыта', 'Hidden', 'Yashirilgan')}
                </button>
                <button onClick={async () => { if (!confirmDelete(lang, r.name)) return; await checklistApi.roles.remove(r.id); onChange(); }} className="text-red-500 hover:text-red-600">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Employees ────────────────────────────────────────────────────────────
// Shape shared by checklistApi.employees (owner) and a manager-bound
// equivalent (see ChecklistManagerPortal.tsx) — lets EmployeesTab/
// PosImportPanel work unmodified for both, just fed a different api prop.
export interface EmployeesApi {
  list: (roleId?: string) => Promise<ChecklistEmployee[]>;
  create: (name: string, roleId: string, pin: string) => Promise<ChecklistEmployee>;
  update: (id: string, patchBody: { name?: string; active?: boolean; pin?: string }) => Promise<ChecklistEmployee>;
  remove: (id: string) => Promise<void>;
  posPreview: () => Promise<{ groups: { posRoleName: string; names: string[] }[] }>;
  import: (roleId: string, names: string[]) => Promise<{ created: { name: string; pin: string }[] }>;
}

// ── POS import ───────────────────────────────────────────────────────────
function PosImportPanel({ lang, roles, onShowToast, onImported, api }: {
  lang: Language; roles: ChecklistRole[];
  onShowToast: (m: string, t: 'success' | 'error' | 'info') => void;
  onImported: () => void;
  api: EmployeesApi;
}) {
  const [groups, setGroups] = useState<{ posRoleName: string; names: string[] }[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // posRoleName -> checklist roleId
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Record<string, { name: string; pin: string }[]>>({});

  useEffect(() => {
    api.posPreview()
      .then(res => setGroups(res.groups))
      .catch(() => onShowToast(tr(lang, 'Не удалось получить данные из POS', 'Failed to fetch POS data', "POS'dan ma'lumot olib bo'lmadi"), 'error'))
      .finally(() => setLoading(false));
  }, []);

  const importGroup = async (posRoleName: string, names: string[]) => {
    const roleId = mapping[posRoleName];
    if (!roleId) { onShowToast(tr(lang, 'Выберите роль для этой группы', 'Pick a role for this group', 'Bu guruh uchun rol tanlang'), 'error'); return; }
    setImporting(posRoleName);
    try {
      const res = await api.import(roleId, names);
      setImported(prev => ({ ...prev, [posRoleName]: res.created }));
      onImported();
    } catch { onShowToast(tr(lang, 'Не удалось импортировать', 'Import failed', "Import qilib bo'lmadi"), 'error'); }
    finally { setImporting(null); }
  };

  return (
    <div className="mb-4 p-3.5 rounded-xl border border-border bg-background space-y-3">
      {loading ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Запрашиваем POS...', 'Fetching from POS...', "POS'dan so'ralmoqda...")}</p>
      ) : !groups || groups.length === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'В POS не найдено сотрудников', 'No employees found in POS', "POS'da xodim topilmadi")}</p>
      ) : (
        groups.map(g => (
          <div key={g.posRoleName} className="p-2.5 rounded-lg bg-card border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div>
                <p className="text-[13px] font-medium text-text">{g.posRoleName}</p>
                <p className="text-[11px] text-muted">{g.names.join(', ')}</p>
              </div>
              {imported[g.posRoleName] ? (
                <span className="text-[11px] font-semibold text-green-600">{tr(lang, 'Импортировано', 'Imported', "Import qilindi")}</span>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={mapping[g.posRoleName] ?? ''}
                    onChange={e => setMapping(prev => ({ ...prev, [g.posRoleName]: e.target.value }))}
                    className="px-2 py-1.5 rounded-lg border border-border bg-background text-[12px] text-text"
                  >
                    <option value="">{tr(lang, 'Роль...', 'Role...', 'Rol...')}</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button
                    onClick={() => importGroup(g.posRoleName, g.names)}
                    disabled={importing === g.posRoleName}
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold disabled:opacity-50"
                  >
                    {tr(lang, 'Импорт', 'Import', 'Import')}
                  </button>
                </div>
              )}
            </div>
            {imported[g.posRoleName] && (
              <div className="mt-2 text-[12px] text-muted space-y-0.5">
                <p className="text-[11px] text-text font-medium">{tr(lang, 'PIN-коды (запишите, больше не показываются):', 'PINs (write these down, shown only once):', 'PIN kodlar (yozib qoying, faqat bir marta ko\'rsatiladi):')}</p>
                {imported[g.posRoleName].map(e => <p key={e.name}>{e.name} — <span className="metric-number font-semibold text-text">{e.pin}</span></p>)}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export function EmployeesTab({ lang, roles, onShowToast, api = checklistApi.employees }: {
  lang: Language; roles: ChecklistRole[];
  onShowToast: (m: string, t: 'success' | 'error' | 'info') => void;
  api?: EmployeesApi;
}) {
  const [employees, setEmployees] = useState<ChecklistEmployee[]>([]);
  const [roleId, setRoleId] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = () => api.list().then(setEmployees).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!roleId && roles[0]) setRoleId(roles[0].id); }, [roles]);

  const add = async () => {
    if (!name.trim() || !roleId || !/^\d{4,6}$/.test(pin)) {
      onShowToast(tr(lang, 'Укажите имя, роль и PIN (4-6 цифр)', 'Enter name, role and a 4-6 digit PIN', "Ism, rol va PIN (4-6 raqam) kiriting"), 'error');
      return;
    }
    setBusy(true);
    try {
      await api.create(name.trim(), roleId, pin);
      setName(''); setPin('');
      load();
    } catch { onShowToast(tr(lang, 'Не удалось добавить сотрудника', 'Failed to add employee', "Xodimni qo'shib bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? '—';

  return (
    <Card
      title={tr(lang, 'Сотрудники', 'Employees', 'Xodimlar')}
      subtitle={tr(lang, 'Имя и PIN для входа на своей странице', 'Name and PIN to log into their own page', "O'z sahifasiga kirish uchun ism va PIN")}
      action={
        <button onClick={() => setShowImport(v => !v)} className="px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold flex items-center gap-1.5 text-text">
          <Download size={14} /> {tr(lang, 'Загрузить из POS', 'Load from POS', "POS'dan yuklash")}
        </button>
      }
    >
      {showImport && (
        <PosImportPanel lang={lang} roles={roles} onShowToast={onShowToast} onImported={() => { setShowImport(false); load(); }} api={api} />
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={roleId} onChange={e => setRoleId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text">
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={tr(lang, 'Имя', 'Name', 'Ism')} className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="PIN" className="w-24 px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
        <button onClick={add} disabled={busy} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50">
          <Plus size={15} /> {tr(lang, 'Добавить', 'Add', "Qo'shish")}
        </button>
      </div>

      {employees.length === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Сотрудников пока нет', 'No employees yet', "Hozircha xodim yo'q")}</p>
      ) : (
        <div className="space-y-1.5">
          {employees.map(e => (
            <div key={e.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
              <div>
                <span className="text-[13px] text-text">{e.name}</span>
                <span className="text-[11px] text-muted ml-2">{roleName(e.role_id)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => { await api.update(e.id, { active: !e.active }); load(); }}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${e.active ? 'bg-green-500/10 text-green-600' : 'bg-muted/10 text-muted'}`}
                >
                  {e.active ? tr(lang, 'Активен', 'Active', 'Faol') : tr(lang, 'Скрыт', 'Hidden', 'Yashirilgan')}
                </button>
                <button onClick={async () => { if (!confirmDelete(lang, e.name)) return; await api.remove(e.id); load(); }} className="text-red-500 hover:text-red-600">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Managers ─────────────────────────────────────────────────────────────
function ManagersTab({ lang, roles, onShowToast }: {
  lang: Language; roles: ChecklistRole[];
  onShowToast: (m: string, t: 'success' | 'error' | 'info') => void;
}) {
  const [managers, setManagers] = useState<ChecklistManager[]>([]);
  const [form, setForm] = useState({ name: '', password: '', portalSubdomain: '' });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => checklistApi.managers.list().then(setManagers).catch(() => {});
  useEffect(() => { load(); }, []);

  const toggleRole = (id: string) => setSelectedRoleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const add = async () => {
    if (!form.name.trim() || !form.password || !form.portalSubdomain.trim()) {
      onShowToast(tr(lang, 'Заполните все поля', 'Fill in all fields', "Barcha maydonlarni to'ldiring"), 'error');
      return;
    }
    setBusy(true);
    try {
      await checklistApi.managers.create({ ...form, roleIds: selectedRoleIds });
      setForm({ name: '', password: '', portalSubdomain: '' });
      setSelectedRoleIds([]);
      load();
    } catch { onShowToast(tr(lang, 'Не удалось добавить менеджера', 'Failed to add manager', "Menejerni qo'shib bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card
      title={tr(lang, 'Менеджеры (доступ по департаменту)', 'Managers (department access)', "Menejerlar (bo'lim kirishi)")}
      subtitle={tr(lang, 'У каждого своя страница для чек-листов своих сотрудников', "Each gets their own page to manage their employees' checklists", "Har biri o'z xodimlari cheklistlari uchun sahifaga ega")}
    >
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={tr(lang, 'Имя', 'Name', 'Ism')} className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
        <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} type="password" placeholder={tr(lang, 'Пароль', 'Password', 'Parol')} className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
        <input value={form.portalSubdomain} onChange={e => setForm({ ...form, portalSubdomain: e.target.value })} placeholder={tr(lang, 'Поддомен, со словом manager (service-manager)', 'Subdomain, with "manager" in it (service-manager)', '"manager" so\'zi bilan subdomen (service-manager)')} className="px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text sm:col-span-2" />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {roles.map(r => (
          <button
            key={r.id}
            onClick={() => toggleRole(r.id)}
            className={`px-2.5 py-1 rounded-lg text-[12px] font-medium ${selectedRoleIds.includes(r.id) ? 'bg-primary text-white' : 'bg-background border border-border text-muted'}`}
          >
            {r.name}
          </button>
        ))}
      </div>

      <button onClick={add} disabled={busy} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50 mb-4">
        <Plus size={15} /> {tr(lang, 'Добавить менеджера', 'Add manager', "Menejer qo'shish")}
      </button>

      {managers.length === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Менеджеров пока нет', 'No managers yet', "Hozircha menejer yo'q")}</p>
      ) : (
        <div className="space-y-1.5">
          {managers.map(m => (
            editingId === m.id ? (
              <ManagerEditRow
                key={m.id}
                lang={lang}
                roles={roles}
                manager={m}
                onShowToast={onShowToast}
                onDone={() => { setEditingId(null); load(); }}
              />
            ) : (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
                <div>
                  <span className="text-[13px] text-text">{m.name}</span>
                  <span className="text-[11px] text-muted ml-2">{m.portal_subdomain}.trace-os.uz</span>
                  {!m.active && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted/10 text-muted ml-2">
                      {tr(lang, 'Отключён', 'Disabled', "O'chirilgan")}
                    </span>
                  )}
                  <div className="text-[11px] text-muted mt-0.5">
                    {m.role_ids.map(id => roles.find(r => r.id === id)?.name).filter(Boolean).join(', ') || tr(lang, 'Нет ролей', 'No roles', 'Rol yoq')}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingId(m.id)} className="text-muted hover:text-text">
                    <Pencil size={15} />
                  </button>
                  <button onClick={async () => { if (!confirmDelete(lang, m.name)) return; await checklistApi.managers.remove(m.id); load(); }} className="text-red-500 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </Card>
  );
}

function ManagerEditRow({ lang, roles, manager, onShowToast, onDone }: {
  lang: Language; roles: ChecklistRole[]; manager: ChecklistManager;
  onShowToast: (m: string, t: 'success' | 'error' | 'info') => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(manager.name);
  const [password, setPassword] = useState('');
  const [portalSubdomain, setPortalSubdomain] = useState(manager.portal_subdomain);
  const [roleIds, setRoleIds] = useState<string[]>(manager.role_ids);
  const [active, setActive] = useState(manager.active);
  const [busy, setBusy] = useState(false);

  const toggleRole = (id: string) => setRoleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const save = async () => {
    if (!name.trim() || !portalSubdomain.trim()) {
      onShowToast(tr(lang, 'Укажите имя и поддомен', 'Enter a name and subdomain', 'Ism va subdomenni kiriting'), 'error');
      return;
    }
    setBusy(true);
    try {
      await checklistApi.managers.update(manager.id, {
        name: name.trim(),
        portalSubdomain: portalSubdomain.trim(),
        roleIds,
        active,
        ...(password ? { password } : {}),
      });
      onDone();
    } catch { onShowToast(tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-3 rounded-lg bg-background border border-primary/40 space-y-2.5">
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={tr(lang, 'Имя', 'Name', 'Ism')} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder={tr(lang, 'Новый пароль (необязательно)', 'New password (optional)', "Yangi parol (ixtiyoriy)")} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text" />
        <input value={portalSubdomain} onChange={e => setPortalSubdomain(e.target.value)} placeholder={tr(lang, 'Поддомен', 'Subdomain', 'Subdomen')} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text sm:col-span-2" />
      </div>
      <div className="flex flex-wrap gap-2">
        {roles.map(r => (
          <button
            key={r.id}
            onClick={() => toggleRole(r.id)}
            className={`px-2.5 py-1 rounded-lg text-[12px] font-medium ${roleIds.includes(r.id) ? 'bg-primary text-white' : 'bg-card border border-border text-muted'}`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActive(a => !a)}
          className={`text-[11px] font-semibold px-2 py-1 rounded ${active ? 'bg-green-500/10 text-green-600' : 'bg-muted/10 text-muted'}`}
        >
          {active ? tr(lang, 'Активен', 'Active', 'Faol') : tr(lang, 'Отключён', 'Disabled', "O'chirilgan")}
        </button>
        <button onClick={save} disabled={busy} className="px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50">
          {tr(lang, 'Сохранить', 'Save', 'Saqlash')}
        </button>
        <button onClick={onDone} className="px-3.5 py-2 rounded-lg bg-card border border-border text-muted text-[13px] font-medium">
          {tr(lang, 'Отмена', 'Cancel', 'Bekor qilish')}
        </button>
      </div>
    </div>
  );
}

// ── Checklists builder ──────────────────────────────────────────────────
export function ChecklistsTab({ lang, roles, onShowToast, branches = [], currentBranch }: {
  lang: Language; roles: ChecklistRole[];
  onShowToast: (m: string, t: 'success' | 'error' | 'info') => void;
  branches?: BranchSummary[]; currentBranch?: BranchSummary;
}) {
  const [list, setList] = useState<Checklist[]>([]);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [showCopyPanel, setShowCopyPanel] = useState(false);

  const load = () => checklistApi.checklists.list().then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? '—';
  const otherBranches = branches.filter(b => b.id !== currentBranch?.id);

  if (editingId) {
    return (
      <ChecklistEditor
        lang={lang}
        roles={roles}
        checklistId={editingId === 'new' ? null : editingId}
        onDone={() => { setEditingId(null); load(); }}
        onShowToast={onShowToast}
      />
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="text-[15px] font-semibold text-text tracking-tight">{tr(lang, 'Чек-листы', 'Checklists', 'Cheklistlar')}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {otherBranches.length > 0 && (
            <button onClick={() => setShowCopyPanel(v => !v)} className="px-3 py-1.5 rounded-lg bg-card border border-border text-[12px] font-semibold flex items-center gap-1.5 text-text">
              <Copy size={14} /> <span className="hidden sm:inline">{tr(lang, 'Скопировать из филиала', 'Copy from branch', 'Filialdan nusxalash')}</span>
            </button>
          )}
          <button onClick={() => setEditingId('new')} className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold flex items-center gap-1.5">
            <Plus size={14} /> {tr(lang, 'Новый', 'New', 'Yangi')}
          </button>
        </div>
      </div>

      {showCopyPanel && (
        <CopyFromBranchPanel
          lang={lang}
          roles={roles}
          branches={otherBranches}
          onShowToast={onShowToast}
          onCopied={() => { setShowCopyPanel(false); load(); }}
        />
      )}

      {list.length === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Чек-листов пока нет', 'No checklists yet', "Hozircha cheklist yo'q")}</p>
      ) : (
        <div className="space-y-1.5">
          {list.map(c => (
            <button key={c.id} onClick={() => setEditingId(c.id)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-background border border-border text-left hover:border-primary/40">
              <div>
                <p className="text-[13px] font-medium text-text">{c.name}</p>
                <p className="text-[11px] text-muted mt-0.5">{roleName(c.role_id)}</p>
              </div>
              <ChevronRight size={16} className="text-muted" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// Reads a sibling branch's checklists via the X-Branch-Id override (same
// mechanism the Sales/Dashboard branch switcher already uses — see
// checklistApi.checklists.listForBranch/itemsForBranch) and re-creates the
// picked one in the CURRENT branch. Roles are shared org-wide, so the same
// `roles` list applies to whichever branch is picked.
function CopyFromBranchPanel({ lang, roles, branches, onShowToast, onCopied }: {
  lang: Language; roles: ChecklistRole[]; branches: BranchSummary[];
  onShowToast: (m: string, t: 'success' | 'error' | 'info') => void;
  onCopied: () => void;
}) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [sourceList, setSourceList] = useState<Checklist[] | null>(null);
  const [preview, setPreview] = useState<ChecklistWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!branchId || !roleId) return;
    setLoading(true);
    setSourceList(null);
    setPreview(null);
    checklistApi.checklists.listForBranch(roleId, branchId)
      .then(setSourceList)
      .catch(() => onShowToast(tr(lang, 'Не удалось загрузить чек-листы филиала', "Failed to load the branch's checklists", "Filial cheklistlarini yuklab bo'lmadi"), 'error'))
      .finally(() => setLoading(false));
  }, [branchId, roleId]);

  const openPreview = (checklistId: string) => {
    checklistApi.checklists.itemsForBranch(checklistId, branchId)
      .then(setPreview)
      .catch(() => onShowToast(tr(lang, 'Не удалось загрузить чек-лист', 'Failed to load checklist', "Cheklistni yuklab bo'lmadi"), 'error'));
  };

  const copy = async () => {
    if (!preview) return;
    setCopying(true);
    try {
      await checklistApi.checklists.create({
        roleId,
        name: preview.checklist.name,
        description: preview.checklist.description,
        items: preview.items.map(i => ({ text: i.text, requiresPhoto: i.requires_photo, itemType: i.item_type, options: i.options ?? undefined })),
      });
      onShowToast(tr(lang, 'Чек-лист скопирован', 'Checklist copied', 'Cheklist nusxalandi'), 'success');
      onCopied();
    } catch {
      onShowToast(tr(lang, 'Не удалось скопировать', 'Failed to copy', "Nusxalab bo'lmadi"), 'error');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="mb-4 p-3.5 rounded-xl border border-border bg-background space-y-3">
      <div className="grid sm:grid-cols-2 gap-2">
        <select value={branchId} onChange={e => setBranchId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text">
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={roleId} onChange={e => setRoleId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-text">
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
      ) : preview ? (
        <div className="p-2.5 rounded-lg bg-card border border-border space-y-2">
          <p className="text-[13px] font-medium text-text">{preview.checklist.name}</p>
          <div className="space-y-1">
            {preview.items.map(i => (
              <p key={i.id} className="text-[12px] text-muted">• {i.text}</p>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => setPreview(null)} className="px-3 py-1.5 rounded-lg bg-background border border-border text-muted text-[12px] font-medium">
              {tr(lang, 'Назад', 'Back', 'Orqaga')}
            </button>
            <button onClick={copy} disabled={copying} className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold disabled:opacity-50">
              {copying ? tr(lang, 'Копирование...', 'Copying...', 'Nusxalanmoqda...') : tr(lang, 'Скопировать сюда', 'Copy here', 'Bu yerga nusxalash')}
            </button>
          </div>
        </div>
      ) : !sourceList || sourceList.length === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'В этом филиале нет чек-листов для этой роли', 'No checklists for this role in that branch', "Bu filialda bu rol uchun cheklist yo'q")}</p>
      ) : (
        <div className="space-y-1.5">
          {sourceList.map(c => (
            <button key={c.id} onClick={() => openPreview(c.id)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-border text-left hover:border-primary/40">
              <span className="text-[13px] text-text">{c.name}</span>
              <ChevronRight size={15} className="text-muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


interface DraftItem { text: string; requiresPhoto: boolean; itemType: ChecklistItemType; options: string[] }

export function ChecklistEditor({ lang, roles, checklistId, onDone, onShowToast, manager }: {
  lang: Language; roles: ChecklistRole[]; checklistId: string | null; onDone: () => void;
  onShowToast: (m: string, t: 'success' | 'error' | 'info') => void;
  manager?: {
    tenantSubdomain: string; token: string;
    onLoadItems: (id: string) => Promise<import('../../types').ChecklistWithItems>;
    onSave: (data: any, id: string | null) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
  };
}) {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ text: '', requiresPhoto: false, itemType: 'checkbox', options: ['', ''] }]);
  const [busy, setBusy] = useState(false);

  // `roles` often arrives async after this component's first render (e.g.
  // clicking "New" right as the roles list is still loading) — the <select>
  // below visually shows the first <option> either way, but without this the
  // underlying roleId state stayed '' forever, so Save always failed with
  // "enter a name and role" even though a role looked selected on screen.
  useEffect(() => {
    if (!roleId && roles[0]) setRoleId(roles[0].id);
  }, [roles]);
  const [loaded, setLoaded] = useState(!checklistId);

  useEffect(() => {
    if (!checklistId) return;
    const fetchItems = manager ? manager.onLoadItems : checklistApi.checklists.items;
    fetchItems(checklistId).then(({ checklist, items: existing }) => {
      setRoleId(checklist.role_id);
      setName(checklist.name);
      setDescription(checklist.description);
      setItems(existing.length ? existing.map(i => ({ text: i.text, requiresPhoto: i.requires_photo, itemType: i.item_type ?? 'checkbox', options: i.options && i.options.length ? i.options : ['', ''] })) : [{ text: '', requiresPhoto: false, itemType: 'checkbox', options: ['', ''] }]);
      setLoaded(true);
    }).catch(() => {
      onShowToast(tr(lang, 'Не удалось загрузить чек-лист', 'Failed to load checklist', "Cheklistni yuklab bo'lmadi"), 'error');
      onDone();
    });
  }, [checklistId]);

  const updateItem = (i: number, patch: Partial<DraftItem>) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addItem = () => setItems(prev => [...prev, { text: '', requiresPhoto: false, itemType: 'checkbox', options: ['', ''] }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!roleId || !name.trim()) { onShowToast(tr(lang, 'Укажите название и роль', 'Enter a name and role', 'Nomi va rolni kiriting'), 'error'); return; }
    const cleanItems = items.filter(i => i.text.trim()).map(i => ({
      text: i.text.trim(),
      requiresPhoto: i.requiresPhoto,
      itemType: i.itemType,
      options: i.itemType === 'choice' ? i.options.map(o => o.trim()).filter(Boolean) : undefined,
    }));
    setBusy(true);
    try {
      const data = { roleId, name: name.trim(), description, items: cleanItems };
      if (manager) {
        await manager.onSave(data, checklistId);
      } else if (checklistId) {
        await checklistApi.checklists.update(checklistId, data);
      } else {
        await checklistApi.checklists.create(data);
      }
      onDone();
    } catch { onShowToast(tr(lang, 'Не удалось сохранить', 'Failed to save', "Saqlab bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!checklistId) return;
    if (!confirmDelete(lang, name)) return;
    setBusy(true);
    try {
      if (manager) await manager.onDelete(checklistId);
      else await checklistApi.checklists.remove(checklistId);
      onDone();
    } catch { onShowToast(tr(lang, 'Не удалось удалить', 'Failed to delete', "O'chirib bo'lmadi"), 'error'); }
    finally { setBusy(false); }
  };

  if (!loaded) return <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>;

  return (
    <Card>
      <button onClick={onDone} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-text mb-4">
        <ArrowLeft size={15} /> {tr(lang, 'Назад', 'Back', 'Orqaga')}
      </button>

      <div className="space-y-3">
        <div>
          <label className="text-[12px] text-muted mb-1 block">{tr(lang, 'Название', 'Name', 'Nomi')}</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
        </div>
        <div>
          <label className="text-[12px] text-muted mb-1 block">{tr(lang, 'Описание', 'Description', 'Tavsif')}</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text" />
        </div>
        <div>
          <label className="text-[12px] text-muted mb-1 block">{tr(lang, 'Для кого', 'For role', 'Kim uchun')}</label>
          <select value={roleId} onChange={e => setRoleId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text">
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[12px] text-muted mb-1.5 block">{tr(lang, 'Пункты', 'Items', 'Bandlar')}</label>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="p-2.5 rounded-lg border border-border bg-background/50 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={it.text}
                    onChange={e => updateItem(i, { text: e.target.value })}
                    placeholder={tr(lang, 'Например: протереть столы', 'e.g. wipe down tables', 'masalan: stollarni artish')}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-[13px] text-text"
                  />
                  <button
                    onClick={() => updateItem(i, { requiresPhoto: !it.requiresPhoto })}
                    title={tr(lang, 'Требуется фото', 'Requires photo', 'Foto talab qilinadi')}
                    className={`shrink-0 p-2 rounded-lg ${it.requiresPhoto ? 'bg-primary text-white' : 'bg-background border border-border text-muted'}`}
                  >
                    <Camera size={15} />
                  </button>
                  <button onClick={() => removeItem(i)} className="shrink-0 text-red-500 hover:text-red-600">
                    <X size={15} />
                  </button>
                </div>
                <select
                  value={it.itemType}
                  onChange={e => updateItem(i, { itemType: e.target.value as ChecklistItemType })}
                  title={tr(lang, 'Тип пункта', 'Item type', 'Band turi')}
                  className="w-full px-2 py-2 rounded-lg border border-border bg-background text-[12px] text-text"
                >
                  <option value="checkbox">{tr(lang, 'Чекбокс', 'Checkbox', 'Chekbоks')}</option>
                  <option value="yesno">{tr(lang, 'Да / Нет', 'Yes / No', 'Ha / Yo\'q')}</option>
                  <option value="text">{tr(lang, 'Текст', 'Text', 'Matn')}</option>
                  <option value="number">{tr(lang, 'Число', 'Number', 'Raqam')}</option>
                  <option value="rating">{tr(lang, 'Оценка 1-5', 'Rating 1-5', 'Baho 1-5')}</option>
                  <option value="choice">{tr(lang, 'Выбор из 2 вариантов', 'Choice of 2', "2 variantdan tanlash")}</option>
                </select>
                {it.itemType === 'choice' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={it.options[0] ?? ''}
                      onChange={e => updateItem(i, { options: [e.target.value, it.options[1] ?? ''] })}
                      placeholder={tr(lang, 'Вариант 1, напр. Филиал А', 'Option 1, e.g. Branch A', "1-variant, masalan: Filial A")}
                      className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-border bg-background text-[12px] text-text"
                    />
                    <input
                      value={it.options[1] ?? ''}
                      onChange={e => updateItem(i, { options: [it.options[0] ?? '', e.target.value] })}
                      placeholder={tr(lang, 'Вариант 2, напр. Филиал Б', 'Option 2, e.g. Branch B', "2-variant, masalan: Filial B")}
                      className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-border bg-background text-[12px] text-text"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <button onClick={addItem} className="mt-2 flex items-center gap-1.5 text-[13px] text-primary font-medium">
            <Plus size={15} /> {tr(lang, 'Добавить пункт', 'Add item', "Band qo'shish")}
          </button>
        </div>

        <div className="flex items-center justify-between pt-2">
          {checklistId ? (
            <button onClick={remove} disabled={busy} className="text-[13px] text-red-500 font-medium">{tr(lang, 'Удалить', 'Delete', "O'chirish")}</button>
          ) : <span />}
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50">
            {tr(lang, 'Сохранить', 'Save', 'Saqlash')}
          </button>
        </div>
      </div>
    </Card>
  );
}
