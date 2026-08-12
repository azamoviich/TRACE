import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
import { DateRangePicker } from '../ui/DateRangePicker';
import { Language } from '../../types';
import { tr } from '../../constants';
import {
  Plus, Trash2, Loader2, Check, X, UserPlus,
  Pencil, RotateCcw, Eye, EyeOff, RefreshCw, Briefcase, Download,
  Gauge, ClipboardList, Camera, Trophy, History, ImageOff, Calendar, AlertTriangle,
} from 'lucide-react';
import {
  positionsApi, employeesApi, checklistStatsApi, getStaffToken,
  StaffPosition, StaffEmployee, EmployeePermissions, ChecklistStats,
} from '../../services/traceApi';

// Flat permission bag — no role templates, no hierarchy. Matches the
// reference product's 6 checkboxes on the employee edit form.
const EMPLOYEE_PERMISSION_KEYS: (keyof EmployeePermissions)[] = [
  'mobile_admin', 'take_checklists', 'admin_panel', 'view_reports', 'manage_objects', 'gallery_upload',
];

function employeePermissionLabel(key: keyof EmployeePermissions, lang: Language): string {
  switch (key) {
    case 'mobile_admin': return tr(lang, 'Администрирование в мобильном приложении', 'Mobile app administration', 'Mobil ilovada boshqaruv');
    case 'take_checklists': return tr(lang, 'Прохождение чек-листов', 'Take checklists', "Chek-listlarni bajarish");
    case 'admin_panel': return tr(lang, 'Управление административной панелью', 'Admin panel access', 'Boshqaruv panelidan foydalanish');
    case 'view_reports': return tr(lang, 'Просмотр отчётов', 'View reports', "Hisobotlarni ko'rish");
    case 'manage_objects': return tr(lang, 'Управление объектами', 'Manage objects', "Obyektlarni boshqarish");
    case 'gallery_upload': return tr(lang, 'Добавление фото/видео из галереи', 'Add photo/video from gallery', "Galereyadan foto/video qo'shish");
  }
}

type Tab = 'overview' | 'positions' | 'employees';

function auditActionLabel(action: string, lang: Language): string {
  switch (action) {
    case 'checklist_created': return tr(lang, 'создал чек-лист', 'created checklist', "chek-list yaratdi");
    case 'checklist_updated': return tr(lang, 'изменил чек-лист', 'updated checklist', "chek-listni o'zgartirdi");
    case 'checklist_deleted': return tr(lang, 'удалил чек-лист', 'deleted checklist', "chek-listni o'chirdi");
    case 'item_added': return tr(lang, 'добавил пункт в', 'added item to', "bandni qo'shdi");
    case 'item_updated': return tr(lang, 'изменил пункт в', 'updated item in', "bandni o'zgartirdi");
    case 'item_deleted': return tr(lang, 'удалил пункт из', 'deleted item from', "bandni o'chirdi");
    default: return action;
  }
}

function formatDateTime(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// Checklist is being rebuilt from scratch on a new access model
// (checklists scoped by Должность, secondary admins granted a set of
// Должности they can manage). Должности + Сотрудники + a real Дашборд
// are in; the checklist create/edit screen and employee fill-out flow are
// a later phase — the dashboard just reads whatever's there, honestly
// zero until that phase ships.
export const Checklist: React.FC<{
  lang: Language;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}> = ({ lang, onShowToast }) => {
  const isStaff = !!getStaffToken();
  const [tab, setTab] = useState<Tab>('overview');

  const [stats, setStats] = useState<ChecklistStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsRange, setStatsRange] = useState<'today' | '7days' | '30days' | 'custom'>('7days');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);

  const [positions, setPositions] = useState<StaffPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [showDeletedPositions, setShowDeletedPositions] = useState(false);
  const [positionSearch, setPositionSearch] = useState('');
  const [addingPosition, setAddingPosition] = useState(false);
  const [newPositionName, setNewPositionName] = useState('');
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [selectedPositionIds, setSelectedPositionIds] = useState<Set<string>>(new Set());
  const [bulkDeletingPositions, setBulkDeletingPositions] = useState(false);

  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<{ isNew: boolean; employee?: StaffEmployee } | null>(null);
  const [importingFromPos, setImportingFromPos] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [bulkDeletingEmployees, setBulkDeletingEmployees] = useState(false);

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyIds(p => new Set(p).add(id));
    try { await fn(); } catch (e: any) { onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error'); }
    finally { setBusyIds(p => { const n = new Set(p); n.delete(id); return n; }); }
  };

  const loadStats = useCallback(() => {
    if (isStaff) return;
    setStatsLoading(true);
    setStatsError(null);
    const opts = statsRange === 'custom' && customRange
      ? { from: customRange.from, to: customRange.to }
      : statsRange === 'today'
      ? { from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }
      : { range: statsRange as '7days' | '30days' };
    checklistStatsApi.get(opts)
      .then(setStats)
      .catch((e: Error) => setStatsError(e.message ?? tr(lang, 'Ошибка загрузки', 'Failed to load', 'Yuklashda xatolik')))
      .finally(() => setStatsLoading(false));
  }, [statsRange, customRange, isStaff, lang]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const loadPositions = useCallback(() => {
    setPositionsLoading(true);
    positionsApi.list(showDeletedPositions).then(setPositions).catch(() => {}).finally(() => setPositionsLoading(false));
  }, [showDeletedPositions]);

  useEffect(() => { loadPositions(); }, [loadPositions]);

  const handleCreatePosition = async () => {
    if (!newPositionName.trim()) return;
    try {
      await positionsApi.create(newPositionName.trim());
      setNewPositionName(''); setAddingPosition(false);
      loadPositions();
    } catch (e: any) {
      onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error');
    }
  };

  const handleRenamePosition = (id: string, name: string) => {
    setEditingPositionId(null);
    if (!name.trim()) return;
    withBusy(`pos-${id}`, async () => {
      await positionsApi.update(id, { name: name.trim() });
      loadPositions();
    });
  };

  const handleTogglePositionActive = (p: StaffPosition) => withBusy(`pos-${p.id}`, async () => {
    await positionsApi.update(p.id, { active: !p.active });
    loadPositions();
  });

  const handleDeletePosition = (id: string) => withBusy(`pos-del-${id}`, async () => {
    await positionsApi.update(id, { deleted: true });
    loadPositions();
  });

  const handleRestorePosition = (id: string) => withBusy(`pos-del-${id}`, async () => {
    await positionsApi.update(id, { deleted: false });
    loadPositions();
  });

  const handleBulkDeletePositions = async () => {
    if (selectedPositionIds.size === 0) return;
    if (!confirm(tr(lang,
      `Удалить выбранные должности (${selectedPositionIds.size})?`,
      `Delete ${selectedPositionIds.size} selected positions?`,
      `Tanlangan lavozimlarni (${selectedPositionIds.size}) o'chirasizmi?`))) return;
    setBulkDeletingPositions(true);
    try {
      await Promise.all(Array.from(selectedPositionIds).map(id => positionsApi.update(id, { deleted: true })));
      setSelectedPositionIds(new Set());
      loadPositions();
    } catch (e: any) {
      onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error');
    } finally {
      setBulkDeletingPositions(false);
    }
  };

  const loadEmployees = useCallback(() => {
    setEmployeesLoading(true);
    employeesApi.list().then(setEmployees).catch(() => {}).finally(() => setEmployeesLoading(false));
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const handleToggleEmployeeActive = (e: StaffEmployee) => withBusy(`emp-${e.id}`, async () => {
    await employeesApi.update(e.id, { active: !e.active });
    loadEmployees();
  });

  const handleBulkDeleteEmployees = async () => {
    if (selectedEmployeeIds.size === 0) return;
    if (!confirm(tr(lang,
      `Удалить выбранных сотрудников (${selectedEmployeeIds.size})?`,
      `Delete ${selectedEmployeeIds.size} selected employees?`,
      `Tanlangan xodimlarni (${selectedEmployeeIds.size}) o'chirasizmi?`))) return;
    setBulkDeletingEmployees(true);
    try {
      await Promise.all(Array.from(selectedEmployeeIds).map(id => employeesApi.remove(id)));
      setSelectedEmployeeIds(new Set());
      loadEmployees();
    } catch (e: any) {
      onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error');
    } finally {
      setBulkDeletingEmployees(false);
    }
  };

  const handleImportFromPos = async () => {
    setImportingFromPos(true);
    try {
      const r = await employeesApi.importFromPos();
      onShowToast?.(
        tr(lang,
          `${r.newEmployees} новых сотрудников, ${r.updatedEmployees} обновлено, ${r.newPositions} новых должностей`,
          `${r.newEmployees} new employees, ${r.updatedEmployees} updated, ${r.newPositions} new positions`,
          `${r.newEmployees} yangi xodim, ${r.updatedEmployees} yangilandi, ${r.newPositions} yangi lavozim`),
        'success',
      );
      loadEmployees();
      loadPositions();
    } catch (e: any) {
      onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error');
    } finally {
      setImportingFromPos(false);
    }
  };

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = isStaff ? [
    { key: 'employees', label: tr(lang, 'Сотрудники', 'Employees', 'Xodimlar'), icon: <UserPlus size={13} /> },
    { key: 'positions', label: tr(lang, 'Должности', 'Positions', 'Lavozimlar'), icon: <Briefcase size={13} /> },
  ] : [
    { key: 'overview', label: tr(lang, 'Дашборд', 'Dashboard', 'Boshqaruv paneli'), icon: <Gauge size={13} /> },
    { key: 'employees', label: tr(lang, 'Сотрудники', 'Employees', 'Xodimlar'), icon: <UserPlus size={13} /> },
    { key: 'positions', label: tr(lang, 'Должности', 'Positions', 'Lavozimlar'), icon: <Briefcase size={13} /> },
  ];

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-[22px] font-bold text-text tracking-tight">Checklist</h1>
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
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-1 w-fit">
              {(['today', '7days', '30days'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => { setStatsRange(r); setCustomRange(null); }}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${statsRange === r ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'}`}
                >
                  {r === 'today' ? tr(lang, 'Сегодня', 'Today', 'Bugun') : r === '7days' ? tr(lang, '7 дней', '7 days', '7 kun') : tr(lang, '30 дней', '30 days', '30 kun')}
                </button>
              ))}
            </div>
            <div className="relative">
              <button
                ref={calendarBtnRef}
                onClick={() => setPickerOpen(o => !o)}
                title={tr(lang, 'Свой период', 'Custom range', "O'z davri")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                  statsRange === 'custom' ? 'bg-primary text-white border-primary' : 'bg-background border-border text-muted hover:text-text'
                }`}
              >
                <Calendar size={13} />
                {statsRange === 'custom' && customRange ? `${customRange.from} → ${customRange.to}` : tr(lang, 'Свой период', 'Custom range', "O'z davri")}
              </button>
              <DateRangePicker
                lang={lang}
                value={customRange}
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                anchorRef={calendarBtnRef}
                onApply={(r) => { setCustomRange(r); setStatsRange('custom'); setPickerOpen(false); }}
                onClear={() => { setCustomRange(null); setStatsRange('7days'); }}
              />
            </div>
          </div>

          {statsError ? (
            <Card>
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <AlertTriangle size={20} className="text-danger" />
                <p className="text-[12px] text-danger">{statsError}</p>
                <button
                  onClick={loadStats}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  {tr(lang, 'Повторить', 'Retry', "Qayta urinish")}
                </button>
              </div>
            </Card>
          ) : statsLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted" /></div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Чек-листы', 'Checklists', 'Chek-listlar')}</p>
                  <p className="text-[22px] font-bold text-text">{stats.overview.activeChecklists}<span className="text-[13px] text-muted font-medium"> / {stats.overview.totalChecklists}</span></p>
                  <p className="text-[10px] text-muted mt-0.5">{tr(lang, 'активны из всех', 'active of total', 'faol / jami')}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Сегодня выполнено', "Today's completion", 'Bugun bajarildi')}</p>
                  <p className="text-[22px] font-bold text-text">{stats.today.done}<span className="text-[13px] text-muted font-medium"> / {stats.today.total}</span></p>
                  <p className="text-[10px] text-muted mt-0.5">{stats.today.employeesActive} {tr(lang, 'сотрудников активны', 'employees active', 'xodim faol')}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Охват сотрудников', 'Employee coverage', 'Xodimlar qamrovi')}</p>
                  <p className="text-[22px] font-bold text-text">{stats.overview.employeesCovered}<span className="text-[13px] text-muted font-medium"> / {stats.overview.totalEmployees}</span></p>
                  <p className="text-[10px] text-muted mt-0.5">{tr(lang, 'под чек-листами', 'covered by a checklist', "chek-list ostida")}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Не пользуются', 'Never used', "Foydalanmaydi")}</p>
                  <p className="text-[22px] font-bold text-text">{stats.neverUsedCount}</p>
                  <p className="text-[10px] text-muted mt-0.5">{tr(lang, `за период ${stats.since} → ${stats.until}`, `in period ${stats.since} → ${stats.until}`, `${stats.since} → ${stats.until} davrida`)}</p>
                </Card>
              </div>

              {stats.trend.length > 0 && (
                <Card title={tr(lang, 'Активность по дням', 'Daily activity', 'Kunlik faollik')}>
                  <div className="flex items-end gap-1.5 h-28 pt-2">
                    {(() => {
                      const max = Math.max(1, ...stats.trend.map(t => t.done));
                      return stats.trend.map(t => (
                        <div key={t.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                          <div className="w-full bg-primary/15 hover:bg-primary/25 rounded-t transition-colors relative" style={{ height: `${Math.max(4, (t.done / max) * 100)}%` }} title={`${t.date}: ${t.done}`} />
                          <span className="text-[8px] text-muted truncate">{t.date.slice(5)}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </Card>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <Card title={tr(lang, 'Лидеры по выполнению', 'Top performers', 'Yetakchilar')}>
                  {stats.leaderboard.length === 0 ? (
                    <p className="text-[12px] text-muted text-center py-6 flex flex-col items-center gap-2">
                      <Trophy size={20} className="text-muted/50" />
                      {tr(lang, 'Пока нет данных', 'No data yet', "Hozircha ma'lumot yo'q")}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {stats.leaderboard.map((row, i) => (
                        <div key={row.employee_id} className="flex items-center gap-2.5 py-1.5">
                          <span className="text-[11px] font-bold text-muted w-4 flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-text truncate">{row.employee_name}</p>
                            <p className="text-[10px] text-muted truncate">{row.position_name ?? tr(lang, 'Без должности', 'No position', 'Lavozimsiz')}</p>
                          </div>
                          <span className="text-[12px] font-semibold text-primary flex-shrink-0">{row.completed_count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title={tr(lang, 'По должностям', 'By position', 'Lavozimlar bo\'yicha')}>
                  {stats.byPosition.length === 0 ? (
                    <p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Пока нет данных', 'No data yet', "Hozircha ma'lumot yo'q")}</p>
                  ) : (
                    <div className="space-y-2">
                      {stats.byPosition.map(row => (
                        <div key={row.position_name} className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-text truncate">{row.position_name}</span>
                          <span className="text-[11px] text-muted flex-shrink-0">{row.completed_count} · {row.employee_count} {tr(lang, 'чел.', 'ppl', 'kishi')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card title={<span className="flex items-center gap-1.5"><Camera size={14} />{tr(lang, 'Фото-подтверждения', 'Photo proof', 'Foto tasdiq')}</span>}>
                {stats.recentPhotos.length === 0 ? (
                  <p className="text-[12px] text-muted text-center py-6 flex flex-col items-center gap-2">
                    <ImageOff size={20} className="text-muted/50" />
                    {tr(lang, 'Фото ещё не загружали', 'No photos submitted yet', "Hali foto yuklanmagan")}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {stats.recentPhotos.map((p, i) => (
                      <a key={i} href={p.photo_url} target="_blank" rel="noreferrer" className="group relative rounded-lg overflow-hidden border border-border aspect-square">
                        <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5">
                          <p className="text-[8px] text-white truncate">{p.employee_name}</p>
                          <p className="text-[7px] text-white/70 truncate">{p.item_text}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </Card>

              <Card title={<span className="flex items-center gap-1.5"><History size={14} />{tr(lang, 'Активность менеджеров', 'Manager activity', 'Menejerlar faolligi')}</span>}>
                {stats.managerActivity.length === 0 ? (
                  <p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Никто ещё не создавал и не менял чек-листы', 'No one has created or changed a checklist yet', "Hech kim hali chek-list yaratmagan yoki o'zgartirmagan")}</p>
                ) : (
                  <div className="space-y-2">
                    {stats.managerActivity.map(a => (
                      <div key={a.id} className="flex items-start gap-2 text-[12px]">
                        <ClipboardList size={13} className="text-muted mt-0.5 flex-shrink-0" />
                        <p className="text-text flex-1 min-w-0">
                          <span className="font-semibold">{a.actor_name ?? tr(lang, 'Владелец', 'Owner', 'Egasi')}</span>{' '}
                          {auditActionLabel(a.action, lang)}{' '}
                          <span className="font-medium">«{a.checklist_name}»</span>
                          {a.detail && <span className="text-muted"> — {a.detail}</span>}
                        </p>
                        <span className="text-[10px] text-muted flex-shrink-0">{formatDateTime(a.created_at, lang)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </div>
      )}

      {tab === 'positions' && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <label className="flex items-center gap-2 text-[12px] text-muted">
                <input type="checkbox" checked={showDeletedPositions} onChange={e => setShowDeletedPositions(e.target.checked)} />
                {tr(lang, 'Показать удалённые', 'Show deleted', "O'chirilganlarni ko'rsatish")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  value={positionSearch}
                  onChange={e => setPositionSearch(e.target.value)}
                  placeholder={tr(lang, 'Поиск', 'Search', 'Qidirish')}
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => setAddingPosition(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                  <Plus size={13} /> {tr(lang, 'Добавить', 'Add', "Qo'shish")}
                </button>
              </div>
            </div>

            {addingPosition && (
              <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-background border border-border">
                <input
                  autoFocus
                  value={newPositionName}
                  onChange={e => setNewPositionName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreatePosition(); if (e.key === 'Escape') setAddingPosition(false); }}
                  placeholder={tr(lang, 'Название должности', 'Position name', 'Lavozim nomi')}
                  className="flex-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                />
                <button onClick={handleCreatePosition} disabled={!newPositionName.trim()} className="p-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg disabled:opacity-40">
                  <Check size={13} />
                </button>
                <button onClick={() => { setAddingPosition(false); setNewPositionName(''); }} className="p-1.5 text-muted hover:text-danger rounded-lg">
                  <X size={13} />
                </button>
              </div>
            )}

            {positionsLoading ? (
              <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted" /></div>
            ) : (
              <div className="overflow-x-auto">
                {selectedPositionIds.size > 0 && (
                  <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-2 rounded-lg bg-danger/8 border border-danger/20">
                    <span className="text-[11px] font-medium text-text">
                      {tr(lang, `Выбрано: ${selectedPositionIds.size}`, `${selectedPositionIds.size} selected`, `Tanlandi: ${selectedPositionIds.size}`)}
                    </span>
                    <button
                      onClick={handleBulkDeletePositions}
                      disabled={bulkDeletingPositions}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-danger/10 text-danger hover:bg-danger hover:text-white text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {bulkDeletingPositions ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      {tr(lang, 'Удалить выбранные', 'Delete selected', "Tanlanganlarni o'chirish")}
                    </button>
                  </div>
                )}
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border">
                      <th className="pb-2 font-medium w-8">
                        {(() => {
                          const visible = positions.filter(p => p.name.toLowerCase().includes(positionSearch.toLowerCase()));
                          const allSelected = visible.length > 0 && visible.every(p => selectedPositionIds.has(p.id));
                          return (
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={e => setSelectedPositionIds(e.target.checked ? new Set(visible.map(p => p.id)) : new Set())}
                            />
                          );
                        })()}
                      </th>
                      <th className="pb-2 font-medium">{tr(lang, 'Название', 'Name', 'Nomi')}</th>
                      <th className="pb-2 font-medium text-center">{tr(lang, 'Активность', 'Active', 'Faollik')}</th>
                      <th className="pb-2 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions
                      .filter(p => p.name.toLowerCase().includes(positionSearch.toLowerCase()))
                      .map(p => (
                        <tr key={p.id} className={`border-b border-border/50 ${p.deleted_at ? 'opacity-50' : ''}`}>
                          <td className="py-2">
                            <input
                              type="checkbox"
                              checked={selectedPositionIds.has(p.id)}
                              onChange={e => setSelectedPositionIds(prev => { const n = new Set(prev); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })}
                            />
                          </td>
                          <td className="py-2 text-text">
                            {editingPositionId === p.id ? (
                              <input
                                autoFocus
                                defaultValue={p.name}
                                onBlur={e => handleRenamePosition(p.id, e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className="bg-background border border-border rounded-lg px-2 py-1 text-[12px] text-text focus:outline-none focus:border-primary"
                              />
                            ) : p.name}
                          </td>
                          <td className="py-2 text-center">
                            <button onClick={() => handleTogglePositionActive(p)} disabled={busyIds.has(`pos-${p.id}`)}>
                              {p.active ? <Check size={14} className="text-success mx-auto" /> : <X size={14} className="text-muted mx-auto" />}
                            </button>
                          </td>
                          <td className="py-2 text-right">
                            <button onClick={() => setEditingPositionId(p.id)} className="p-1.5 text-muted hover:text-primary" title={tr(lang, 'Переименовать', 'Rename', "Qayta nomlash")}>
                              <Pencil size={13} />
                            </button>
                            {p.deleted_at ? (
                              <button onClick={() => handleRestorePosition(p.id)} disabled={busyIds.has(`pos-del-${p.id}`)} className="p-1.5 text-muted hover:text-success" title={tr(lang, 'Восстановить', 'Restore', 'Tiklash')}>
                                <RotateCcw size={13} />
                              </button>
                            ) : (
                              <button onClick={() => handleDeletePosition(p.id)} disabled={busyIds.has(`pos-del-${p.id}`)} className="p-1.5 text-muted hover:text-danger" title={tr(lang, 'Удалить', 'Delete', "O'chirish")}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {positions.length === 0 && (
                  <p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Должностей пока нет', 'No positions yet', "Hozircha lavozimlar yo'q")}</p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'employees' && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <label className="flex items-center gap-2 text-[12px] text-muted">
                <input type="checkbox" checked={showInactiveEmployees} onChange={e => setShowInactiveEmployees(e.target.checked)} />
                {tr(lang, 'Показать неактивных', 'Show inactive', 'Nofaollarni ko\'rsatish')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  placeholder={tr(lang, 'Поиск', 'Search', 'Qidirish')}
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                />
                {!isStaff && (
                <button
                  onClick={handleImportFromPos}
                  disabled={importingFromPos}
                  title={tr(lang, 'Выгрузка сотрудников и должностей из POS', 'Pull employees and positions from POS', "POS'dan xodimlar va lavozimlarni yuklash")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-background border border-border text-text text-[12px] font-semibold rounded-lg hover:border-primary/40 transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {importingFromPos ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {tr(lang, 'Выгрузка из POS', 'Import from POS', "POS'dan yuklash")}
                </button>
                )}
                <button
                  onClick={() => setEditingEmployee({ isNew: true })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                  <Plus size={13} /> {tr(lang, 'Добавить', 'Add', "Qo'shish")}
                </button>
              </div>
            </div>

            {employeesLoading ? (
              <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted" /></div>
            ) : (
              <div className="overflow-x-auto">
                {selectedEmployeeIds.size > 0 && (
                  <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-2 rounded-lg bg-danger/8 border border-danger/20">
                    <span className="text-[11px] font-medium text-text">
                      {tr(lang, `Выбрано: ${selectedEmployeeIds.size}`, `${selectedEmployeeIds.size} selected`, `Tanlandi: ${selectedEmployeeIds.size}`)}
                    </span>
                    <button
                      onClick={handleBulkDeleteEmployees}
                      disabled={bulkDeletingEmployees}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-danger/10 text-danger hover:bg-danger hover:text-white text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {bulkDeletingEmployees ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      {tr(lang, 'Удалить выбранных', 'Delete selected', "Tanlanganlarni o'chirish")}
                    </button>
                  </div>
                )}
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border">
                      <th className="pb-2 font-medium w-8">
                        {(() => {
                          const visible = employees.filter(e => showInactiveEmployees || e.active).filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase()));
                          const allSelected = visible.length > 0 && visible.every(e => selectedEmployeeIds.has(e.id));
                          return (
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={e => setSelectedEmployeeIds(e.target.checked ? new Set(visible.map(v => v.id)) : new Set())}
                            />
                          );
                        })()}
                      </th>
                      <th className="pb-2 font-medium">{tr(lang, 'Имя', 'Name', 'Ism')}</th>
                      <th className="pb-2 font-medium">{tr(lang, 'Должность', 'Position', 'Lavozim')}</th>
                      <th className="pb-2 font-medium text-center">{tr(lang, 'Активность', 'Active', 'Faollik')}</th>
                      <th className="pb-2 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees
                      .filter(e => showInactiveEmployees || e.active)
                      .filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase()))
                      .map(e => (
                        <tr key={e.id} className={`border-b border-border/50 ${!e.active ? 'opacity-50' : ''}`}>
                          <td className="py-2">
                            <input
                              type="checkbox"
                              checked={selectedEmployeeIds.has(e.id)}
                              onChange={ev => setSelectedEmployeeIds(prev => { const n = new Set(prev); ev.target.checked ? n.add(e.id) : n.delete(e.id); return n; })}
                            />
                          </td>
                          <td className="py-2 text-text font-medium">{e.name}</td>
                          <td className="py-2 text-muted">{e.position_name ?? tr(lang, 'Не задана', 'Not set', 'Belgilanmagan')}</td>
                          <td className="py-2 text-center">
                            <button onClick={() => handleToggleEmployeeActive(e)} disabled={busyIds.has(`emp-${e.id}`)}>
                              {e.active ? <Check size={14} className="text-success mx-auto" /> : <X size={14} className="text-muted mx-auto" />}
                            </button>
                          </td>
                          <td className="py-2 text-right">
                            <button onClick={() => setEditingEmployee({ isNew: false, employee: e })} className="p-1.5 text-muted hover:text-primary">
                              <Pencil size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {employees.length === 0 && (
                  <p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Сотрудников пока нет', 'No employees yet', "Hozircha xodimlar yo'q")}</p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {editingEmployee && (
        <EmployeeEditModal
          lang={lang}
          positions={positions}
          initial={editingEmployee.isNew ? null : editingEmployee.employee ?? null}
          onClose={() => setEditingEmployee(null)}
          onSaved={() => { setEditingEmployee(null); loadEmployees(); }}
          onError={(msg: string) => onShowToast?.(msg, 'error')}
        />
      )}
    </div>
  );
};

// Full-screen edit form for one Сотрудник — ФИО, Должность, Telegram Id,
// MAX Id, Активен, Логин/Пароль, and the flat Права checkbox list. Handles
// both create (initial=null) and edit.
const EmployeeEditModal: React.FC<{
  lang: Language;
  positions: StaffPosition[];
  initial: StaffEmployee | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}> = ({ lang, positions, initial, onClose, onSaved, onError }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [positionId, setPositionId] = useState(initial?.position_id ?? '');
  const [telegramId, setTelegramId] = useState(initial?.telegram_id ?? '');
  const [maxId, setMaxId] = useState(initial?.max_id ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<EmployeePermissions>(initial?.permissions ?? {});
  const [saving, setSaving] = useState(false);

  const regeneratePassword = () => {
    setPassword(Math.random().toString(36).slice(2, 10));
    setShowPassword(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (password && password.length < 6) { onError(tr(lang, 'Пароль минимум 6 символов', 'Password must be at least 6 characters', 'Parol kamida 6 belgi')); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        position_id: positionId || null,
        telegram_id: telegramId.trim() || undefined,
        max_id: maxId.trim() || undefined,
        active,
        username: username.trim() || undefined,
        password: password || undefined,
        permissions,
      };
      if (initial) {
        await employeesApi.update(initial.id, data);
      } else {
        await employeesApi.create(data);
      }
      onSaved();
    } catch (e: any) {
      onError(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (!confirm(tr(lang, `Удалить сотрудника «${initial.name}»?`, `Delete employee "${initial.name}"?`, `"${initial.name}" xodimini o'chirasizmi?`))) return;
    setSaving(true);
    try {
      await employeesApi.remove(initial.id);
      onSaved();
    } catch (e: any) {
      onError(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-3xl p-5 max-w-[480px] w-full max-h-[85vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-text">
            {initial ? tr(lang, 'Редактирование сотрудника', 'Edit employee', 'Xodimni tahrirlash') : tr(lang, 'Новый сотрудник', 'New employee', 'Yangi xodim')}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-text flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'ФИО', 'Full name', 'F.I.Sh.')}</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary" />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Должность', 'Position', 'Lavozim')}</label>
            <select value={positionId} onChange={e => setPositionId(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary">
              <option value="">{tr(lang, 'Не задана', 'Not set', 'Belgilanmagan')}</option>
              {positions.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">Telegram Id</label>
              <input value={telegramId} onChange={e => setTelegramId(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">MAX Id</label>
              <input value={maxId} onChange={e => setMaxId(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12px] text-text">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> {tr(lang, 'Активен', 'Active', 'Faol')}
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Логин', 'Username', 'Login')}</label>
              <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Пароль', 'Password', 'Parol')}</label>
              <div className="flex items-center gap-1">
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={initial?.has_login ? tr(lang, '••••••', '••••••', '••••••') : ''}
                  className="flex-1 min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} className="p-2 text-muted hover:text-text flex-shrink-0">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button type="button" onClick={regeneratePassword} className="p-2 text-muted hover:text-text flex-shrink-0" title={tr(lang, 'Сгенерировать', 'Generate', "Yaratish")}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">{tr(lang, 'Права', 'Permissions', 'Ruxsatlar')}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {EMPLOYEE_PERMISSION_KEYS.map(key => (
                <label key={key} className="flex items-center gap-1.5 text-[11px] text-text">
                  <input
                    type="checkbox"
                    checked={permissions[key] === true}
                    onChange={e => setPermissions(p => ({ ...p, [key]: e.target.checked }))}
                  />
                  {employeePermissionLabel(key, lang)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-border">
          {initial ? (
            <button onClick={handleDelete} disabled={saving} className="text-[12px] font-semibold text-danger hover:bg-danger/8 px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Trash2 size={13} /> {tr(lang, 'Удалить', 'Delete', "O'chirish")}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold text-muted hover:text-text rounded-lg">
              {tr(lang, 'Отменить', 'Cancel', 'Bekor qilish')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {tr(lang, 'Сохранить', 'Save', 'Saqlash')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
