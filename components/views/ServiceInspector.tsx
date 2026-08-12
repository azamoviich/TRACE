import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '../ui/Card';
import { Language } from '../../types';
import { tr } from '../../constants';
import {
  Plus, Trash2, Loader2, Copy, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, UserPlus,
  Camera, CheckCheck, X, Flame, Trophy, Send, Clock, Building2, BarChart3,
  Pencil, RotateCcw, Eye, EyeOff, RefreshCw, Briefcase, Download, Gauge, ClipboardList,
} from 'lucide-react';
import {
  traceApi, positionsApi, employeesApi, surveysApi, ChecklistDepartment, ChecklistResultRow, ChecklistViolation, ChecklistStreak, ChecklistLeaderboardRow,
  ChecklistDayDetail, ChecklistDuePeriod, ChecklistPendingSubmission, ChecklistMonthDay, ChecklistQuestionType,
  getStaffToken, StaffPosition, StaffEmployee, EmployeePermissions, Survey, SurveyQuestionType, SurveyResponsesResult,
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

const QUESTION_TYPES: ChecklistQuestionType[] = ['boolean', 'text', 'single_choice', 'multi_choice', 'rating', 'instruction'];
function questionTypeLabel(t: ChecklistQuestionType, lang: Language): string {
  if (t === 'text') return tr(lang, 'Текст', 'Text answer', 'Matn javob');
  if (t === 'single_choice') return tr(lang, 'Один вариант', 'Single choice', 'Bitta variant');
  if (t === 'multi_choice') return tr(lang, 'Несколько вариантов', 'Multiple choice', "Bir nechta variant");
  if (t === 'rating') return tr(lang, 'Оценка 1-5', 'Rating 1-5', 'Baho 1-5');
  if (t === 'instruction') return tr(lang, 'Инструкция', 'Instruction', "Ko'rsatma");
  return tr(lang, 'Да/Нет', 'Checkbox', 'Ha/Yoq');
}

// "ВЫБЕРИТЕ ТИП ПУНКТА" — the item-type picker shown before adding a new
// checklist item. "Строка для ввода" and "Текст" are presented as two
// distinct cards (matching the reference product) but both map to the same
// existing 'text' backend type — introducing short vs. long text as a real
// schema distinction wasn't worth it for a UI-only difference.
const ITEM_TYPE_CARDS: { key: string; type: ChecklistQuestionType; title: (lang: Language) => string; desc: (lang: Language) => string }[] = [
  { key: 'boolean', type: 'boolean',
    title: l => tr(l, 'Вопрос', 'Question', 'Savol'),
    desc: l => tr(l, 'Вопрос, который требует ответа Да/Нет', 'A question that needs a Yes/No answer', "Ha/Yo'q javobini talab qiluvchi savol") },
  { key: 'rating', type: 'rating',
    title: l => tr(l, 'Слайдер (оценка)', 'Slider (rating)', "Slayder (baho)"),
    desc: l => tr(l, 'Вопрос, который требует оценки в баллах', 'A question that needs a numeric rating', "Ball bilan baholashni talab qiluvchi savol") },
  { key: 'short_text', type: 'text',
    title: l => tr(l, 'Строка для ввода', 'Input line', 'Kiritish qatori'),
    desc: l => tr(l, 'Одна строчка для ввода ответа', 'One line for the answer', "Javob uchun bitta qator") },
  { key: 'long_text', type: 'text',
    title: l => tr(l, 'Текст', 'Text', 'Matn'),
    desc: l => tr(l, 'Несколько строк для ввода, развернутый ответ', 'Multiple lines, a detailed answer', "Bir necha qator, batafsil javob") },
  { key: 'single_choice', type: 'single_choice',
    title: l => tr(l, 'Варианты ответа', 'Answer options', 'Javob variantlari'),
    desc: l => tr(l, 'Вопрос с настраиваемыми вариантами ответов', 'A question with custom answer options', "Sozlanadigan javob variantlari bilan savol") },
  { key: 'instruction', type: 'instruction',
    title: l => tr(l, 'Инструкция', 'Instruction', "Ko'rsatma"),
    desc: l => tr(l, 'Описание способа достижения желаемого результата', 'A description of how to achieve the desired result', "Kerakli natijaga erishish usulining tavsifi") },
];

function formatChecklistDate(iso: string, lang: Language): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function periodLabel(period: ChecklistDuePeriod, lang: Language): string {
  if (period === 'opening') return tr(lang, 'Открытие', 'Opening', 'Ochilish');
  if (period === 'midshift') return tr(lang, 'В течение смены', 'Midshift', 'Smena davomida');
  if (period === 'closing') return tr(lang, 'Закрытие', 'Closing', 'Yopilish');
  return tr(lang, 'Без времени', 'Any time', 'Vaqtsiz');
}

const DUE_PERIODS: ChecklistDuePeriod[] = ['any', 'opening', 'midshift', 'closing'];
const WEEKDAY_LABELS: Record<Language, string[]> = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
};

type Range = 'today' | '7days' | '30days';
type Tab = 'overview' | 'departments' | 'results' | 'positions' | 'employees' | 'surveys';

export const ServiceInspector: React.FC<{
  lang: Language;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}> = ({ lang, onShowToast }) => {
  // Staff (delegated manager) sessions never carry the owner token
  // Должности needs, and their checklist writes are already scoped
  // server-side to their departments (see staffAuth.ts / checklist.ts) —
  // hiding org-structure controls here is just UX polish on top of that,
  // not the enforcement boundary itself.
  const isStaff = !!getStaffToken();
  const [tab, setTab] = useState<Tab>('overview');

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

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveysLoading, setSurveysLoading] = useState(true);
  const [expandedSurveys, setExpandedSurveys] = useState<Set<string>>(new Set());
  const [newSurveyName, setNewSurveyName] = useState('');
  const [creatingSurvey, setCreatingSurvey] = useState(false);
  const [newSurveyQText, setNewSurveyQText] = useState<Record<string, string>>({});
  const [newSurveyQType, setNewSurveyQType] = useState<Record<string, SurveyQuestionType>>({});
  const [newSurveyQOptionsRaw, setNewSurveyQOptionsRaw] = useState<Record<string, string>>({});
  const [surveyResults, setSurveyResults] = useState<SurveyResponsesResult | null>(null);
  const [surveyResultsLoading, setSurveyResultsLoading] = useState(false);

  const [departments, setDepartments] = useState<ChecklistDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDeptSlug, setNewDeptSlug] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [creatingDept, setCreatingDept] = useState(false);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [newItemType, setNewItemType] = useState<Record<string, ChecklistQuestionType>>({});
  const [newItemOptionsRaw, setNewItemOptionsRaw] = useState<Record<string, string>>({});
  const [copyFromChoice, setCopyFromChoice] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Чек-листы detail editor (modal) — opened from the table's edit pencil.
  const [detailDeptId, setDetailDeptId] = useState<string | null>(null);
  const [deptNameDraft, setDeptNameDraft] = useState('');
  const [deptDescDraft, setDeptDescDraft] = useState('');
  const [deptPositionIds, setDeptPositionIds] = useState<Set<string>>(new Set());
  const [deptActiveDraft, setDeptActiveDraft] = useState(true);
  const [savingDeptDetail, setSavingDeptDetail] = useState(false);
  // "Добавить пункт" — show the type-picker before revealing the actual
  // add-item input row for that department.
  const [pickingTypeForDept, setPickingTypeForDept] = useState<string | null>(null);
  const [addItemRowOpenFor, setAddItemRowOpenFor] = useState<Record<string, boolean>>({});

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
    setMonthLoading(true);
    traceApi.checklist.month(calendarMonth, calendarDept || undefined).then(setMonthDays).finally(() => setMonthLoading(false));
  }, [calendarMonth, calendarDept]);

  const loadViolations = useCallback(() => {
    setViolationsLoading(true);
    traceApi.checklist.violations(violationFilter).then(setViolations).finally(() => setViolationsLoading(false));
  }, [violationFilter]);

  useEffect(() => { loadViolations(); }, [loadViolations]);

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

  const handleToggleEmployeeActive2 = (e: StaffEmployee) => withBusy(`emp-${e.id}`, async () => {
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
      const r = await traceApi.checklist.importFromPos();
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

  const loadSurveys = useCallback(() => {
    setSurveysLoading(true);
    surveysApi.list().then(setSurveys).catch(() => {}).finally(() => setSurveysLoading(false));
  }, []);

  useEffect(() => { loadSurveys(); }, [loadSurveys]);

  const handleCreateSurvey = async () => {
    if (!newSurveyName.trim()) return;
    setCreatingSurvey(true);
    try {
      await surveysApi.create(newSurveyName.trim());
      setNewSurveyName('');
      loadSurveys();
    } catch (e: any) {
      onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error');
    } finally {
      setCreatingSurvey(false);
    }
  };

  const handleToggleSurveyActive = (s: Survey) => withBusy(`survey-${s.id}`, async () => {
    await surveysApi.update(s.id, { active: !s.active });
    loadSurveys();
  });

  const handleDeleteSurvey = (s: Survey) => withBusy(`survey-del-${s.id}`, async () => {
    if (!confirm(tr(lang, `Удалить опрос «${s.name}»?`, `Delete survey "${s.name}"?`, `"${s.name}" so'rovnomasini o'chirasizmi?`))) return;
    await surveysApi.remove(s.id);
    loadSurveys();
  });

  const handleAddSurveyQuestion = (s: Survey) => withBusy(`survey-q-add-${s.id}`, async () => {
    const text = (newSurveyQText[s.id] ?? '').trim();
    if (!text) return;
    const question_type = newSurveyQType[s.id] ?? 'text';
    const options = (question_type === 'single_choice' || question_type === 'multi_choice')
      ? (newSurveyQOptionsRaw[s.id] ?? '').split(',').map(v => v.trim()).filter(Boolean)
      : undefined;
    await surveysApi.addQuestion(s.id, text, { question_type, options });
    setNewSurveyQText(p => ({ ...p, [s.id]: '' }));
    setNewSurveyQOptionsRaw(p => ({ ...p, [s.id]: '' }));
    loadSurveys();
  });

  const handleDeleteSurveyQuestion = (id: string) => withBusy(`survey-q-${id}`, async () => {
    await surveysApi.deleteQuestion(id);
    loadSurveys();
  });

  const openSurveyResults = (s: Survey) => {
    setSurveyResults(null);
    setSurveyResultsLoading(true);
    surveysApi.responses(s.id)
      .then(setSurveyResults)
      .catch((e: Error) => onShowToast?.(e.message, 'error'))
      .finally(() => setSurveyResultsLoading(false));
  };

  const surveyLink = (s: Survey) => `https://${window.location.host}/survey/${s.slug}`;

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

  const openDeptDetail = (dept: ChecklistDepartment) => {
    setDetailDeptId(dept.id);
    setDeptNameDraft(dept.name);
    setDeptDescDraft(dept.description ?? '');
    setDeptPositionIds(new Set(dept.position_ids ?? []));
    setDeptActiveDraft(dept.active);
    setPickingTypeForDept(null);
    setAddItemRowOpenFor({});
  };

  const closeDeptDetail = () => setDetailDeptId(null);

  const handleSaveDeptDetail = async () => {
    if (!detailDeptId || !deptNameDraft.trim()) return;
    setSavingDeptDetail(true);
    try {
      await traceApi.checklist.updateDepartment(detailDeptId, {
        name: deptNameDraft.trim(),
        description: deptDescDraft.trim(),
        position_ids: Array.from(deptPositionIds),
        active: deptActiveDraft,
      });
      refresh();
      closeDeptDetail();
    } catch (e: any) {
      onShowToast?.(e.message ?? tr(lang, 'Ошибка', 'Error', 'Xatolik'), 'error');
    } finally {
      setSavingDeptDetail(false);
    }
  };

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

  // Copies every active item from another department into this one — a
  // one-time copy (not a live link), the same "reusable list" job a
  // separate Шаблоны tab used to do before departments absorbed it.
  const handleCopyItemsFrom = (dept: ChecklistDepartment) => withBusy(`copy-${dept.id}`, async () => {
    const sourceId = copyFromChoice[dept.id];
    if (!sourceId) return;
    const r = await traceApi.checklist.copyItemsFrom(dept.id, sourceId);
    onShowToast?.(
      tr(lang, `Скопировано ${r.copied} пунктов`, `${r.copied} items copied`, `${r.copied} band nusxalandi`),
      'success',
    );
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
    { key: 'overview', label: tr(lang, 'Дашборд', 'Dashboard', 'Boshqaruv paneli'), icon: <Gauge size={13} />, badge: (violationFilter === 'open' ? openViolationsCount : 0) + pendingCount || undefined },
    { key: 'surveys', label: tr(lang, 'Онлайн-опросы', 'Surveys', "So'rovnomalar"), icon: <ClipboardList size={13} /> },
    { key: 'departments', label: tr(lang, 'Чек-листы', 'Checklists', "Chek-listlar"), icon: <Building2 size={13} /> },
    { key: 'results', label: tr(lang, 'Пройденные чек-листы', 'Completed checklists', "O'tilgan chek-listlar"), icon: <BarChart3 size={13} /> },
    { key: 'employees', label: tr(lang, 'Сотрудники', 'Employees', 'Xodimlar'), icon: <UserPlus size={13} /> },
    { key: 'positions', label: tr(lang, 'Должности', 'Positions', 'Lavozimlar'), icon: <Briefcase size={13} /> },
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
                    key={p.department_id}
                    onClick={() => openDayDetail(p.department_id, todayIso)}
                    className="flex items-center gap-1.5 text-[11px] font-medium bg-amber-500/10 text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/15 transition-colors"
                  >
                    {p.department_name}
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

      {tab === 'surveys' && (
        <div className="space-y-4 animate-fade-in">
          <Card title={tr(lang, 'Новый опрос', 'New survey', "Yangi so'rovnoma")}>
            <div className="flex gap-2">
              <input
                value={newSurveyName}
                onChange={e => setNewSurveyName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateSurvey(); }}
                placeholder={tr(lang, 'Название опроса', 'Survey name', "So'rovnoma nomi")}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
              />
              <button
                onClick={handleCreateSurvey}
                disabled={creatingSurvey || !newSurveyName.trim()}
                className="px-4 py-2 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {creatingSurvey ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {tr(lang, 'Создать', 'Create', 'Yaratish')}
              </button>
            </div>
          </Card>

          {surveysLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted" /></div>
          ) : surveys.length === 0 ? (
            <Card><p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Опросов пока нет', 'No surveys yet', "Hozircha so'rovnomalar yo'q")}</p></Card>
          ) : (
            <div className="space-y-3">
              {surveys.map(s => {
                const isOpen = expandedSurveys.has(s.id);
                return (
                  <Card key={s.id} className={!s.active ? 'opacity-70' : ''}>
                    <button
                      onClick={() => setExpandedSurveys(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[14px] font-semibold text-text truncate">{s.name}</h3>
                          {!s.active && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/15 text-muted uppercase tracking-wide">{tr(lang, 'скрыт', 'hidden', 'yashirin')}</span>}
                        </div>
                        <p className="text-[11px] text-muted mt-0.5">
                          {s.questions.length} {tr(lang, 'вопросов', 'questions', 'savol')} · {s.responseCount} {tr(lang, 'ответов', 'responses', 'javob')}
                        </p>
                      </div>
                      <span className="p-1.5 text-muted flex-shrink-0">
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="mt-4 pt-4 border-t border-border space-y-4">
                        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background border border-border">
                          <code className="text-[10px] text-muted truncate flex-1">{surveyLink(s)}</code>
                          <span
                            role="button"
                            onClick={() => { navigator.clipboard?.writeText(surveyLink(s)); setCopiedId(s.id); setTimeout(() => setCopiedId(null), 1500); }}
                            className="text-muted hover:text-primary flex-shrink-0"
                          >
                            {copiedId === s.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {s.questions.map(q => (
                            <div key={q.id} className="flex items-center gap-2 rounded-xl bg-background border border-border p-2.5">
                              <span className="flex-1 text-[12px] text-text">{q.text}</span>
                              <span className="text-[9px] px-2 py-1 rounded-full bg-card text-muted border border-border flex-shrink-0">
                                {q.question_type === 'text' ? tr(lang, 'Текст', 'Text', 'Matn')
                                  : q.question_type === 'single_choice' ? tr(lang, 'Один вариант', 'Single choice', 'Bitta variant')
                                  : q.question_type === 'multi_choice' ? tr(lang, 'Несколько вариантов', 'Multiple choice', "Bir nechta variant")
                                  : tr(lang, 'Оценка 1-5', 'Rating 1-5', 'Baho 1-5')}
                              </span>
                              <button onClick={() => handleDeleteSurveyQuestion(q.id)} className="p-1.5 text-muted hover:text-danger flex-shrink-0">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                          {s.questions.length === 0 && (
                            <p className="text-[11px] text-muted py-1">{tr(lang, 'Вопросов пока нет', 'No questions yet', "Hozircha savollar yo'q")}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            value={newSurveyQText[s.id] ?? ''}
                            onChange={e => setNewSurveyQText(p => ({ ...p, [s.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter' && (newSurveyQType[s.id] ?? 'text') === 'text') handleAddSurveyQuestion(s); }}
                            placeholder={tr(lang, 'Новый вопрос...', 'New question...', 'Yangi savol...')}
                            className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                          />
                          <select
                            value={newSurveyQType[s.id] ?? 'text'}
                            onChange={e => setNewSurveyQType(p => ({ ...p, [s.id]: e.target.value as SurveyQuestionType }))}
                            className="bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary flex-shrink-0"
                          >
                            <option value="text">{tr(lang, 'Текст', 'Text', 'Matn')}</option>
                            <option value="single_choice">{tr(lang, 'Один вариант', 'Single choice', 'Bitta variant')}</option>
                            <option value="multi_choice">{tr(lang, 'Несколько вариантов', 'Multiple choice', "Bir nechta variant")}</option>
                            <option value="rating">{tr(lang, 'Оценка 1-5', 'Rating 1-5', 'Baho 1-5')}</option>
                          </select>
                          <button
                            onClick={() => handleAddSurveyQuestion(s)}
                            disabled={busyIds.has(`survey-q-add-${s.id}`) || !(newSurveyQText[s.id] ?? '').trim()}
                            className="p-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg flex-shrink-0 transition-colors disabled:opacity-40"
                          >
                            {busyIds.has(`survey-q-add-${s.id}`) ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                          </button>
                        </div>
                        {(newSurveyQType[s.id] === 'single_choice' || newSurveyQType[s.id] === 'multi_choice') && (
                          <input
                            value={newSurveyQOptionsRaw[s.id] ?? ''}
                            onChange={e => setNewSurveyQOptionsRaw(p => ({ ...p, [s.id]: e.target.value }))}
                            placeholder={tr(lang, 'Варианты через запятую', 'Options, comma-separated', 'Variantlar, vergul bilan')}
                            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary"
                          />
                        )}

                        <div className="flex items-center justify-between pt-3 border-t border-border gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openSurveyResults(s)}
                              className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              <BarChart3 size={12} /> {tr(lang, 'Результаты', 'Results', 'Natijalar')}
                            </button>
                            <button
                              onClick={() => handleToggleSurveyActive(s)}
                              disabled={busyIds.has(`survey-${s.id}`)}
                              className="text-[11px] font-medium text-muted hover:text-text px-2 py-1.5"
                            >
                              {s.active ? tr(lang, 'скрыть', 'hide', 'yashirish') : tr(lang, 'показать', 'show', "ko'rsatish")}
                            </button>
                          </div>
                          <button
                            onClick={() => handleDeleteSurvey(s)}
                            disabled={busyIds.has(`survey-del-${s.id}`)}
                            className="text-[11px] font-semibold text-danger hover:bg-danger/8 px-2 py-1 rounded-lg flex items-center gap-1.5"
                          >
                            {busyIds.has(`survey-del-${s.id}`) ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                            {tr(lang, 'Удалить', 'Delete', "O'chirish")}
                          </button>
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

      {(surveyResultsLoading || surveyResults) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setSurveyResults(null)}>
          <div className="glass rounded-3xl p-5 max-w-[480px] w-full max-h-[80vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-text">
                {surveyResults ? surveyResults.survey.name : tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}
              </h3>
              <button onClick={() => setSurveyResults(null)} className="text-muted hover:text-text flex-shrink-0"><X size={18} /></button>
            </div>
            {surveyResultsLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted" /></div>
            ) : surveyResults && (
              <div className="space-y-4">
                <p className="text-[12px] text-muted">{surveyResults.responses.length} {tr(lang, 'ответов', 'responses', 'javob')}</p>
                {surveyResults.survey.questions.map(q => (
                  <div key={q.id}>
                    <p className="text-[12px] font-semibold text-text mb-1.5">{q.text}</p>
                    {q.question_type === 'text' ? (
                      <div className="space-y-1">
                        {surveyResults.responses.map(r => r.answers[q.id] != null && (
                          <p key={r.id} className="text-[11px] text-muted bg-background border border-border rounded-lg px-2.5 py-1.5">{String(r.answers[q.id])}</p>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(surveyResults.summary[q.id] ?? {}).map(([value, count]) => (
                          <div key={value} className="flex items-center gap-2 text-[11px]">
                            <span className="flex-1 text-text">{value}</span>
                            <span className="text-muted font-semibold">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'departments' && (
        <div className="space-y-4 animate-fade-in">
          {!isStaff && (
          <Card title={tr(lang, 'Новый чек-лист', 'New checklist', "Yangi chek-list")}>
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
            <Card><p className="text-[12px] text-muted text-center py-6">{tr(lang, 'Чек-листов пока нет', 'No checklists yet', "Hozircha chek-listlar yo'q")}</p></Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wide text-muted">
                      <th className="px-3 py-2.5">{tr(lang, 'Название', 'Name', 'Nomi')}</th>
                      <th className="px-3 py-2.5">{tr(lang, 'Доступен для должности', 'Available for position', "Lavozim uchun mavjud")}</th>
                      <th className="px-3 py-2.5 text-center">{tr(lang, 'Пунктов', 'Items', 'Bandlar')}</th>
                      <th className="px-3 py-2.5 text-center">{tr(lang, 'Активность', 'Active', 'Faollik')}</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map(dept => {
                      const posNames = (dept.position_ids ?? [])
                        .map(id => positions.find(p => p.id === id)?.name)
                        .filter(Boolean) as string[];
                      return (
                        <tr key={dept.id} className={`border-b border-border last:border-0 hover:bg-background/60 transition-colors ${!dept.active ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-2.5">
                            <button onClick={() => openDeptDetail(dept)} className="font-semibold text-text hover:text-primary text-left">
                              {dept.name}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-muted">
                            {posNames.length > 0 ? posNames.join(', ') : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center text-text">{dept.items.length}</td>
                          <td className="px-3 py-2.5 text-center">
                            {dept.active ? <Check size={14} className="inline text-success" /> : <X size={14} className="inline text-muted" />}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              onClick={() => openDeptDetail(dept)}
                              title={tr(lang, 'Редактировать', 'Edit', 'Tahrirlash')}
                              className="p-1.5 text-muted hover:text-primary rounded-lg transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Чек-лист detail editor — modal opened from the table's edit pencil */}
      {detailDeptId && (() => {
        const dept = departments.find(d => d.id === detailDeptId);
        if (!dept) return null;
        const busy = busyIds.has(dept.id);
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={closeDeptDetail}>
            <div className="glass rounded-3xl p-5 max-w-[640px] w-full max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-semibold text-text">{tr(lang, 'Чек-лист', 'Checklist', 'Chek-list')}</h3>
                <button onClick={closeDeptDetail} className="text-muted hover:text-text flex-shrink-0"><X size={18} /></button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">
                    {tr(lang, 'Название', 'Name', 'Nomi')}
                  </label>
                  <input
                    value={deptNameDraft}
                    onChange={e => setDeptNameDraft(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">
                    {tr(lang, 'Описание', 'Description', 'Tavsif')}
                  </label>
                  <textarea
                    value={deptDescDraft}
                    onChange={e => setDeptDescDraft(e.target.value)}
                    rows={2}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">
                    {tr(lang, 'Доступен для должности', 'Available for position', "Lavozim uchun mavjud")}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {positions.filter(p => p.active).map(p => {
                      const checked = deptPositionIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setDeptPositionIds(prev => { const n = new Set(prev); checked ? n.delete(p.id) : n.add(p.id); return n; })}
                          className={`text-[11px] font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
                            checked ? 'bg-primary text-white border-primary' : 'bg-background border-border text-text hover:border-primary/50'
                          }`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                    {positions.length === 0 && <span className="text-[11px] text-muted">{tr(lang, 'Должностей пока нет', 'No positions yet', "Hozircha lavozimlar yo'q")}</span>}
                  </div>
                  <p className="text-[10px] text-muted mt-1.5 leading-relaxed">
                    {tr(lang,
                      'Если не выбрано ни одной роли, то чек-лист будет доступен для всех ролей',
                      'If no role is selected, the checklist will be available to all roles',
                      "Agar birorta rol tanlanmasa, chek-list barcha rollar uchun mavjud bo'ladi")}
                  </p>
                </div>

                <label className="flex items-center gap-2 text-[12px] font-medium text-text">
                  <input type="checkbox" checked={deptActiveDraft} onChange={e => setDeptActiveDraft(e.target.checked)} className="rounded border-border" />
                  {tr(lang, 'Активность', 'Active', 'Faollik')}
                </label>

                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background border border-border">
                  <code className="text-[10px] text-muted truncate flex-1">{dept.subdomainPreview}</code>
                  <span
                    role="button"
                    onClick={() => copySubdomain(dept)}
                    className="text-muted hover:text-primary flex-shrink-0"
                  >
                    {copiedId === dept.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  </span>
                </div>

                <div className="pt-2 border-t border-border">
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
                          {item.question_type !== 'instruction' && (
                            <button
                              onClick={() => handleTogglePhotoRequired(item.id, !item.photo_required)}
                              disabled={busyIds.has(`photo-${item.id}`)}
                              title={tr(lang, 'Требовать фото', 'Require photo', 'Foto talab qilish')}
                              className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${item.photo_required ? 'bg-primary/10 text-primary' : 'text-muted hover:text-text'}`}
                            >
                              <Camera size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            disabled={busyIds.has(item.id)}
                            className="p-1.5 text-muted hover:text-danger flex-shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.question_type !== 'instruction' && (
                            <button
                              onClick={() => handleCycleDuePeriod(item.id, item.due_period)}
                              disabled={busyIds.has(`period-${item.id}`)}
                              title={tr(lang, 'Когда выполнять', 'When to do it', 'Qachon bajarish')}
                              className={`text-[9px] px-2 py-1 rounded-full font-medium transition-colors ${item.due_period !== 'any' ? 'bg-primary/10 text-primary' : 'bg-card text-muted hover:text-text border border-border'}`}
                            >
                              {periodLabel(item.due_period, lang)}
                            </button>
                          )}
                          <span className="text-[9px] px-2 py-1 rounded-full font-medium bg-card text-muted border border-border">
                            {questionTypeLabel(item.question_type, lang)}
                          </span>
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

                  {addItemRowOpenFor[dept.id] ? (
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={newItemText[dept.id] ?? ''}
                          onChange={e => setNewItemText(p => ({ ...p, [dept.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddItem(dept); }}
                          placeholder={tr(lang, 'Текст пункта...', 'Item text...', 'Band matni...')}
                          className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-text focus:outline-none focus:border-primary"
                        />
                        <span className="text-[9px] px-2 py-1 rounded-full font-medium bg-card text-muted border border-border flex-shrink-0">
                          {questionTypeLabel(newItemType[dept.id] ?? 'boolean', lang)}
                        </span>
                        <button
                          onClick={() => { handleAddItem(dept); setAddItemRowOpenFor(p => ({ ...p, [dept.id]: false })); }}
                          disabled={busyIds.has(`add-${dept.id}`) || !(newItemText[dept.id] ?? '').trim()}
                          className="p-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg flex-shrink-0 transition-colors disabled:opacity-40"
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          onClick={() => setAddItemRowOpenFor(p => ({ ...p, [dept.id]: false }))}
                          className="p-1.5 text-muted hover:text-text flex-shrink-0"
                        >
                          <X size={13} />
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
                  ) : (
                    <button
                      onClick={() => setPickingTypeForDept(dept.id)}
                      className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:bg-primary/8 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus size={13} /> {tr(lang, 'Добавить пункт', 'Add item', 'Band qo\'shish')}
                    </button>
                  )}

                  {departments.length > 1 && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                      <select
                        value={copyFromChoice[dept.id] ?? ''}
                        onChange={e => setCopyFromChoice(p => ({ ...p, [dept.id]: e.target.value }))}
                        className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary"
                      >
                        <option value="">{tr(lang, 'Скопировать пункты из...', 'Copy items from...', 'Bandlarni nusxalash...')}</option>
                        {departments.filter(d => d.id !== dept.id).map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleCopyItemsFrom(dept)}
                        disabled={busyIds.has(`copy-${dept.id}`) || !copyFromChoice[dept.id]}
                        className="px-3 py-1.5 bg-background border border-border text-text text-[11px] font-semibold rounded-lg hover:border-primary/40 transition-colors disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {busyIds.has(`copy-${dept.id}`) ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                        {tr(lang, 'Копировать', 'Copy', 'Nusxalash')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <button onClick={closeDeptDetail} className="text-[12px] font-medium text-muted hover:text-text px-2 py-1.5">
                      {tr(lang, 'Назад', 'Back', 'Orqaga')}
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
                  <button
                    onClick={handleSaveDeptDetail}
                    disabled={savingDeptDetail || !deptNameDraft.trim()}
                    className="px-4 py-2 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {savingDeptDetail ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {tr(lang, 'Сохранить', 'Save', 'Saqlash')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* "ВЫБЕРИТЕ ТИП ПУНКТА" — item type picker shown before "Добавить пункт" */}
      {pickingTypeForDept && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setPickingTypeForDept(null)}>
          <div className="glass rounded-3xl p-5 max-w-[480px] w-full max-h-[85vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-text">
                {tr(lang, 'Выберите тип пункта', 'Choose item type', 'Band turini tanlang')}
              </h3>
              <button onClick={() => setPickingTypeForDept(null)} className="text-muted hover:text-text flex-shrink-0"><X size={18} /></button>
            </div>
            <div className="space-y-2">
              {ITEM_TYPE_CARDS.map(card => (
                <button
                  key={card.key}
                  onClick={() => {
                    const deptId = pickingTypeForDept;
                    setNewItemType(p => ({ ...p, [deptId]: card.type }));
                    setPickingTypeForDept(null);
                    setAddItemRowOpenFor(p => ({ ...p, [deptId]: true }));
                  }}
                  className="w-full text-left rounded-xl bg-background border border-border hover:border-primary/50 p-3 transition-colors"
                >
                  <div className="text-[13px] font-semibold text-text">{card.title(lang)}</div>
                  <div className="text-[11px] text-muted mt-0.5">{card.desc(lang)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-4 animate-fade-in">
          <Card
            title={tr(lang, 'Календарь', 'Calendar', 'Taqvim')}
            action={
              departments.length > 0 ? (
                <select
                  value={calendarDept}
                  onChange={e => setCalendarDept(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary"
                >
                  <option value="">{tr(lang, 'Все подразделения', 'All departments', "Barcha bo'limlar")}</option>
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
                <button
                  onClick={handleImportFromPos}
                  disabled={importingFromPos || departments.length === 0}
                  title={tr(lang, 'Выгрузка сотрудников, ролей и подразделений из POS', 'Pull employees, roles and departments from POS', "POS'dan xodimlar, lavozimlar va bo'limlarni yuklash")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-background border border-border text-text text-[12px] font-semibold rounded-lg hover:border-primary/40 transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {importingFromPos ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {tr(lang, 'Выгрузка из POS', 'Import from POS', "POS'dan yuklash")}
                </button>
                <button
                  onClick={() => setEditingEmployee({ isNew: true })}
                  disabled={departments.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 whitespace-nowrap"
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
                      <th className="pb-2 font-medium">{tr(lang, 'Место работы', 'Departments', "Ish joyi")}</th>
                      <th className="pb-2 font-medium">{tr(lang, 'Должность', 'Position', 'Lavozim')}</th>
                      <th className="pb-2 font-medium text-center">{tr(lang, 'Инспектор', 'Inspector', 'Inspektor')}</th>
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
                          <td className="py-2 text-muted">
                            {e.department_ids.length === 0
                              ? tr(lang, 'Работает везде', 'Works everywhere', 'Hamma joyda ishlaydi')
                              : e.department_ids.map(id => departments.find(d => d.id === id)?.name).filter(Boolean).join(', ')}
                          </td>
                          <td className="py-2 text-muted">{e.position_name ?? tr(lang, 'Не задана', 'Not set', 'Belgilanmagan')}</td>
                          <td className="py-2 text-center">
                            {e.permissions?.take_checklists ? <Check size={14} className="text-success mx-auto" /> : <span className="text-muted">—</span>}
                          </td>
                          <td className="py-2 text-center">
                            <button onClick={() => handleToggleEmployeeActive2(e)} disabled={busyIds.has(`emp-${e.id}`)}>
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
          departments={departments}
          positions={positions}
          employees={employees}
          initial={editingEmployee.isNew ? null : editingEmployee.employee ?? null}
          onClose={() => setEditingEmployee(null)}
          onSaved={() => { setEditingEmployee(null); loadEmployees(); }}
          onError={(msg: string) => onShowToast?.(msg, 'error')}
        />
      )}

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

// Full-screen edit form for one Сотрудник — matches the reference product's
// employee edit fields: ФИО, Должность, Место работы (multi-select, empty
// = "Работает везде"), Telegram Id, MAX Id, Активен, Логин/Пароль, and the
// flat Права checkbox list. Handles both create (initial=null) and edit.
const EmployeeEditModal: React.FC<{
  lang: Language;
  departments: ChecklistDepartment[];
  positions: StaffPosition[];
  employees: StaffEmployee[];
  initial: StaffEmployee | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}> = ({ lang, departments, positions, employees, initial, onClose, onSaved, onError }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [positionId, setPositionId] = useState(initial?.position_id ?? '');
  const [homeDepartmentId, setHomeDepartmentId] = useState(initial?.department_id ?? departments[0]?.id ?? '');
  const [departmentIds, setDepartmentIds] = useState<Set<string>>(new Set(initial?.department_ids ?? []));
  const [telegramId, setTelegramId] = useState(initial?.telegram_id ?? '');
  const [maxId, setMaxId] = useState(initial?.max_id ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<EmployeePermissions>(initial?.permissions ?? {});
  const [supervisorId, setSupervisorId] = useState(initial?.supervisor_employee_id ?? '');
  const [saving, setSaving] = useState(false);

  const regeneratePassword = () => {
    setPassword(Math.random().toString(36).slice(2, 10));
    setShowPassword(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!initial && !homeDepartmentId) return;
    if (password && password.length < 6) { onError(tr(lang, 'Пароль минимум 6 символов', 'Password must be at least 6 characters', 'Parol kamida 6 belgi')); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        position_id: positionId || null,
        department_ids: Array.from(departmentIds),
        telegram_id: telegramId.trim() || undefined,
        max_id: maxId.trim() || undefined,
        active,
        username: username.trim() || undefined,
        password: password || undefined,
        permissions,
        supervisor_employee_id: supervisorId || null,
      };
      if (initial) {
        await employeesApi.update(initial.id, data);
      } else {
        await employeesApi.create(homeDepartmentId, data);
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

          {!initial && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Основное подразделение (PIN-вход)', 'Home department (PIN login)', "Asosiy bo'lim (PIN kirish)")}</label>
              <select value={homeDepartmentId} onChange={e => setHomeDepartmentId(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary">
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Место работы', 'Departments', "Ish joyi")}</label>
            <p className="text-[10px] text-muted mb-1.5">{tr(lang, 'Если не выбрано ни одного, сотрудник работает везде', 'If none selected, the employee works everywhere', "Hech biri tanlanmasa, xodim hamma joyda ishlaydi")}</p>
            <div className="flex flex-wrap gap-1.5">
              {departments.map(d => {
                const checked = departmentIds.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDepartmentIds(p => { const n = new Set(p); checked ? n.delete(d.id) : n.add(d.id); return n; })}
                    className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${checked ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-background border-border text-muted hover:text-text'}`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>

          {employees.filter(e => e.id !== initial?.id).length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{tr(lang, 'Старший сотрудник', 'Supervisor', 'Katta xodim')}</label>
              <select value={supervisorId} onChange={e => setSupervisorId(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary">
                <option value="">{tr(lang, 'без старшего', 'no supervisor', 'katta xodimsiz')}</option>
                {employees.filter(e => e.id !== initial?.id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}

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
              disabled={saving || !name.trim() || (!initial && !homeDepartmentId)}
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
