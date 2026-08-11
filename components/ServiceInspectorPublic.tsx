import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, Circle, RefreshCw, AlertCircle, Delete, LogOut, Camera, TriangleAlert, X, KeyRound, Send, ChevronLeft, ChevronRight, Archive, Star, ChevronDown, Users } from 'lucide-react';
import {
  fetchChecklistPublicToday, toggleChecklistPublicItem, ChecklistPublicData,
  fetchChecklistHasRoster, loginChecklistEmployee,
  getChecklistEmployeeToken, clearChecklistEmployeeToken, uploadChecklistPhoto,
  reportChecklistViolation, submitChecklistPublic,
  ChecklistDuePeriod, ChecklistAnswerValue,
  fetchChecklistTeam, ChecklistTeamReport,
} from '../services/traceApi';

const PERIOD_ORDER: ChecklistDuePeriod[] = ['any', 'opening', 'midshift', 'closing'];
const PERIOD_LABELS: Record<ChecklistDuePeriod, string> = {
  any: 'Общие', opening: 'Открытие', midshift: 'В течение смены', closing: 'Закрытие',
};

// Employee-facing page reached at "{department}-{restaurant}.trace-os.uz".
// The department itself is still identified purely by subdomain (no login
// needed to know which checklist this is), but each employee on that
// department now has their own PIN: type it in, and the PIN alone
// identifies who's logging in — no name-picking step, since a shared phone
// gets passed around and the PIN is unique per person anyway. Departments
// with no roster configured yet fall back to the old shared/anonymous flow.
export const ServiceInspectorPublic: React.FC = () => {
  const [phase, setPhase] = useState<'loading' | 'pin' | 'checklist' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [data, setData] = useState<ChecklistPublicData | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [photoError, setPhotoError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraItemId = useRef<string | null>(null);

  const violationCameraInputRef = useRef<HTMLInputElement>(null);
  const violationItemId = useRef<string | null>(null);
  const [violationDraft, setViolationDraft] = useState<{ itemId: string; photoUrl: string } | null>(null);
  const [violationNote, setViolationNote] = useState('');
  const [violationBusy, setViolationBusy] = useState(false);
  const [violationSent, setViolationSent] = useState<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // "My team" — only non-empty for a PIN-only supervisor (e.g. a sous-chef
  // watching cooks): their direct reports' progress on today's shared
  // checklist. Refetched whenever the checklist itself reloads (toggling
  // an item can change a report's tally), only while looking at today.
  const [teamReports, setTeamReports] = useState<ChecklistTeamReport[]>([]);

  // Non-boolean items (text/choice/rating) expand an inline answer editor
  // in place of the plain tap-to-toggle circle. Only one open at a time.
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [multiDrafts, setMultiDrafts] = useState<Record<string, Set<string>>>({});
  // A photo-required non-boolean item needs the camera round-trip before
  // the answer itself can be saved — stash the drafted value here so
  // onCameraFile can attach it once the upload comes back.
  const pendingAnswerRef = useRef<ChecklistAnswerValue | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle(
      'dark',
      localStorage.getItem('trace_theme') === 'dark' ||
      (!localStorage.getItem('trace_theme') && window.matchMedia?.('(prefers-color-scheme: dark)').matches),
    );
  }, []);

  const loadChecklist = useCallback((forDate?: string) => {
    setPhase('loading');
    setError(null);
    fetchChecklistPublicToday(forDate)
      .then(d => { setData(d); setPhase('checklist'); })
      .catch((e: Error) => { setError(e.message); setPhase('error'); });
  }, []);

  // Browsing a past day. Uses a lighter inline spinner instead of the
  // full-page loading phase so flipping through days doesn't flash the
  // whole screen each time.
  const [dateSwitching, setDateSwitching] = useState(false);
  const goToDate = (dateStr: string | undefined) => {
    setDateSwitching(true);
    setError(null);
    fetchChecklistPublicToday(dateStr)
      .then(d => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setDateSwitching(false));
  };

  useEffect(() => {
    if (phase !== 'checklist' || !data?.employee || !data.isToday) { setTeamReports([]); return; }
    fetchChecklistTeam().then(setTeamReports).catch(() => setTeamReports([]));
  }, [phase, data]);

  const shiftDate = (isoDate: string, days: number): string => {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // Entry point: if a department has any employees with PINs set, that's a
  // login-gated department — show the PIN pad unless we already have a
  // valid token. Otherwise load the checklist straight away.
  useEffect(() => {
    setPhase('loading');
    setError(null);
    fetchChecklistHasRoster()
      .then(hasRoster => {
        if (hasRoster && !getChecklistEmployeeToken()) {
          setPin('');
          setPinError(null);
          setPhase('pin');
          return;
        }
        loadChecklist();
      })
      .catch((e: Error) => { setError(e.message); setPhase('error'); });
  }, [loadChecklist]);

  const submitPin = useCallback(async (candidatePin: string) => {
    if (loggingIn) return;
    setLoggingIn(true);
    setPinError(null);
    try {
      await loginChecklistEmployee(candidatePin);
      loadChecklist();
    } catch (e: any) {
      setPinError(e.message === 'Wrong PIN' ? 'Неверный PIN' : 'Ошибка входа');
      setPin('');
    } finally {
      setLoggingIn(false);
    }
  }, [loggingIn, loadChecklist]);

  const pressDigit = (d: string) => {
    if (loggingIn) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) submitPin(next);
  };
  const pressBackspace = () => { if (!loggingIn) setPin(p => p.slice(0, -1)); };

  const logout = () => {
    clearChecklistEmployeeToken();
    setData(null);
    setPin('');
    setPinError(null);
    setPhase('pin');
  };

  const toggle = async (itemId: string, next: boolean, photoUrl?: string, answerValue?: ChecklistAnswerValue) => {
    if (!data) return;
    setPending(p => new Set(p).add(itemId));
    setData(d => d ? { ...d, items: d.items.map(i => i.id === itemId ? { ...i, completed: next, photoUrl: photoUrl ?? i.photoUrl, answerValue: next ? (answerValue ?? i.answerValue) : null } : i) } : d);
    try {
      await toggleChecklistPublicItem(itemId, next, photoUrl, answerValue);
      if (next) setExpandedItemId(id => id === itemId ? null : id);
    } catch (e: any) {
      setData(d => d ? { ...d, items: d.items.map(i => i.id === itemId ? { ...i, completed: !next } : i) } : d);
      if (e.message === 'Login required') logout();
    } finally {
      setPending(p => { const n = new Set(p); n.delete(itemId); return n; });
    }
  };

  // Photo-required items don't toggle directly — tapping one opens the
  // device camera (capture="environment" on the hidden input below blocks
  // picking an old photo from the gallery). The item only checks off once
  // the upload succeeds. For non-boolean items, the drafted answer (text/
  // choice/rating) rides along in pendingAnswerRef and gets attached once
  // the photo upload resolves.
  const openCamera = (itemId: string, answerValue?: ChecklistAnswerValue) => {
    setPhotoError(null);
    cameraItemId.current = itemId;
    pendingAnswerRef.current = answerValue ?? null;
    cameraInputRef.current?.click();
  };

  const onCameraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = cameraItemId.current;
    const answerValue = pendingAnswerRef.current ?? undefined;
    pendingAnswerRef.current = null;
    e.target.value = '';
    if (!file || !itemId) return;
    setPending(p => new Set(p).add(itemId));
    setPhotoError(null);
    try {
      const url = await uploadChecklistPhoto(file);
      await toggle(itemId, true, url, answerValue);
    } catch (err: any) {
      setPhotoError(err.message ?? 'Не удалось загрузить фото');
      setPending(p => { const n = new Set(p); n.delete(itemId); return n; });
    }
  };

  // Submits a drafted answer for a non-boolean item — routes through the
  // camera first if this item also requires photo proof, same rule as the
  // plain boolean flow.
  const submitAnswer = (item: ChecklistPublicData['items'][number], value: ChecklistAnswerValue) => {
    if (item.photoRequired && !item.photoUrl) { openCamera(item.id, value); return; }
    toggle(item.id, true, undefined, value);
  };

  // Flagging a problem always needs its own fresh camera photo (same
  // gallery-lock as photo-required completions) — the note comes after,
  // in a small modal, since typing while still holding the camera up is
  // awkward on a phone.
  const openViolationCamera = (itemId: string) => {
    setPhotoError(null);
    violationItemId.current = itemId;
    violationCameraInputRef.current?.click();
  };

  const onViolationCameraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = violationItemId.current;
    e.target.value = '';
    if (!file || !itemId) return;
    setPending(p => new Set(p).add(`v-${itemId}`));
    setPhotoError(null);
    try {
      const url = await uploadChecklistPhoto(file);
      setViolationNote('');
      setViolationDraft({ itemId, photoUrl: url });
    } catch (err: any) {
      setPhotoError(err.message ?? 'Не удалось загрузить фото');
    } finally {
      setPending(p => { const n = new Set(p); n.delete(`v-${itemId}`); return n; });
    }
  };

  const submitViolation = async () => {
    if (!violationDraft) return;
    setViolationBusy(true);
    try {
      await reportChecklistViolation(violationDraft.itemId, violationDraft.photoUrl, violationNote.trim() || undefined);
      setViolationSent(s => new Set(s).add(violationDraft.itemId));
      setViolationDraft(null);
    } catch (e: any) {
      setPhotoError(e.message ?? 'Не удалось отправить');
    } finally {
      setViolationBusy(false);
    }
  };

  const submitChecklist = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitChecklistPublic();
      setData(d => d ? { ...d, submitted: true } : d);
    } catch (e: any) {
      setSubmitError(e.message ?? 'Не удалось отправить');
      if (e.message === 'Login required') logout();
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw size={22} className="animate-spin text-muted" />
      </div>
    );
  }

  if (phase === 'error' || (!data && phase === 'checklist')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="glass rounded-3xl p-8 max-w-[340px] w-full text-center animate-fade-in">
          <div className="w-11 h-11 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={20} />
          </div>
          <p className="text-text text-[14px] font-semibold mb-1">Чек-лист не найден</p>
          <p className="text-muted text-[11px] mb-5">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-primary text-white text-[12px] font-semibold rounded-xl hover:bg-primary-hover transition-colors"
          >
            Обновить
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'pin') {
    const dots = [0, 1, 2, 3];
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-[300px] w-full animate-fade-in text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <KeyRound size={22} />
          </div>
          <h1 className="font-display text-[20px] font-bold text-text tracking-tight mb-1">PIN-код</h1>
          <p className="text-muted text-[12px] mb-6">{loggingIn ? 'Проверка...' : 'Введи свой PIN, чтобы открыть чек-лист'}</p>

          <div className="flex items-center justify-center gap-3 mb-8">
            {dots.map(i => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full transition-colors ${
                  i < pin.length ? (pinError ? 'bg-danger' : 'bg-primary') : 'bg-card-hover'
                }`}
              />
            ))}
          </div>
          {pinError && <p className="text-danger text-[12px] font-medium mb-4 -mt-4">{pinError}</p>}

          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
              <button
                key={d}
                onClick={() => pressDigit(d)}
                disabled={loggingIn}
                className="glass glass-hover rounded-2xl py-4 text-[18px] font-semibold text-text touch-manipulation disabled:opacity-50"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              onClick={() => pressDigit('0')}
              disabled={loggingIn}
              className="glass glass-hover rounded-2xl py-4 text-[18px] font-semibold text-text touch-manipulation disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={pressBackspace}
              disabled={loggingIn}
              className="rounded-2xl py-4 flex items-center justify-center text-muted touch-manipulation disabled:opacity-50"
            >
              <Delete size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }


  // phase === 'checklist'
  const done = data!.items.filter(i => i.completed).length;
  const total = data!.items.length;
  const allDone = total > 0 && done === total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const periodGroups = PERIOD_ORDER
    .map(period => ({ period, items: data!.items.filter(i => i.duePeriod === period) }))
    .filter(g => g.items.length > 0);
  const showSectionHeaders = periodGroups.length > 1;

  // Short preview of a recorded non-boolean answer, shown inline once
  // answered (in place of the plain checkmark boolean items get).
  const answerPreview = (item: ChecklistPublicData['items'][number]): string | null => {
    if (!item.completed || item.answerValue == null) return null;
    if (item.questionType === 'rating') return '★'.repeat(Number(item.answerValue));
    if (Array.isArray(item.answerValue)) return item.answerValue.join(', ');
    return String(item.answerValue);
  };

  const renderItem = (item: ChecklistPublicData['items'][number], i: number) => {
    const busy = pending.has(item.id);
    const violationBusyForItem = pending.has(`v-${item.id}`);
    const needsPhoto = item.photoRequired && !item.completed;
    const flagged = violationSent.has(item.id);
    const readOnly = !data!.isToday;
    const isBoolean = item.questionType === 'boolean';
    const expanded = expandedItemId === item.id;
    const preview = answerPreview(item);

    const handleMainClick = () => {
      if (readOnly) return;
      if (isBoolean) { needsPhoto ? openCamera(item.id) : toggle(item.id, !item.completed); return; }
      setExpandedItemId(id => id === item.id ? null : item.id);
    };

    return (
      <div
        key={item.id}
        style={{ animationDelay: `${Math.min(i, 20) * 22}ms` }}
        className={`stagger-item rounded-2xl glass transition-colors ${
          item.completed ? 'bg-success/8 border-success/20' : readOnly ? 'opacity-70' : 'glass-hover'
        }`}
      >
        <div className="flex items-stretch gap-1">
          <button
            disabled={busy || readOnly}
            onClick={handleMainClick}
            className="flex-1 min-w-0 text-left flex items-start gap-3 px-4 py-3.5 touch-manipulation disabled:opacity-100"
          >
            {busy
              ? <RefreshCw size={21} className="text-muted flex-shrink-0 mt-0.5 animate-spin" />
              : item.completed
                ? <CheckCircle2 size={21} className="text-success flex-shrink-0 mt-0.5" />
                : <Circle size={21} className="text-muted flex-shrink-0 mt-0.5" />}
            <span className="flex-1 min-w-0">
              <span className={`block text-[14px] leading-snug ${item.completed && isBoolean ? 'text-muted line-through' : 'text-text'}`}>
                {item.text}
              </span>
              {preview && <span className="block text-[12px] text-success mt-0.5 truncate">{preview}</span>}
            </span>
            {item.photoUrl && (
              <img src={item.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
            )}
            {needsPhoto && !item.photoUrl && !readOnly && isBoolean && (
              <Camera size={17} className="text-primary flex-shrink-0 mt-0.5" />
            )}
            {!isBoolean && !readOnly && (
              <ChevronDown size={16} className={`text-muted flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            )}
          </button>
          {!readOnly && (
            <button
              onClick={() => openViolationCamera(item.id)}
              disabled={violationBusyForItem}
              title="Сообщить о проблеме"
              className={`px-3 flex items-center justify-center flex-shrink-0 touch-manipulation disabled:opacity-50 ${flagged ? 'text-amber-500' : 'text-muted hover:text-amber-500'}`}
            >
              {violationBusyForItem ? <RefreshCw size={16} className="animate-spin" /> : <TriangleAlert size={16} />}
            </button>
          )}
        </div>

        {expanded && !readOnly && (
          <div className="px-4 pb-3.5 pt-0.5" onClick={e => e.stopPropagation()}>
            {item.questionType === 'text' && (
              <div className="flex items-start gap-2">
                <textarea
                  value={textDrafts[item.id] ?? (typeof item.answerValue === 'string' ? item.answerValue : '')}
                  onChange={e => setTextDrafts(p => ({ ...p, [item.id]: e.target.value }))}
                  rows={2}
                  placeholder="Ответ..."
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-[13px] text-text focus:outline-none focus:border-primary resize-none"
                />
                <button
                  disabled={busy || !(textDrafts[item.id] ?? item.answerValue ?? '').toString().trim()}
                  onClick={() => submitAnswer(item, (textDrafts[item.id] ?? String(item.answerValue ?? '')).trim())}
                  className="p-2.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl flex-shrink-0 transition-colors disabled:opacity-40"
                >
                  {busy ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            )}

            {item.questionType === 'single_choice' && (
              <div className="flex flex-wrap gap-1.5">
                {(item.options ?? []).map(opt => (
                  <button
                    key={opt}
                    disabled={busy}
                    onClick={() => submitAnswer(item, opt)}
                    className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
                      item.answerValue === opt ? 'bg-primary text-white border-primary' : 'bg-background border-border text-text hover:border-primary/50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {item.questionType === 'multi_choice' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(item.options ?? []).map(opt => {
                    const staged = multiDrafts[item.id] ?? new Set(Array.isArray(item.answerValue) ? item.answerValue : []);
                    const checked = staged.has(opt);
                    return (
                      <button
                        key={opt}
                        disabled={busy}
                        onClick={() => setMultiDrafts(p => {
                          const current = p[item.id] ?? new Set(Array.isArray(item.answerValue) ? item.answerValue : []);
                          const next = new Set(current);
                          checked ? next.delete(opt) : next.add(opt);
                          return { ...p, [item.id]: next };
                        })}
                        className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
                          checked ? 'bg-primary text-white border-primary' : 'bg-background border-border text-text hover:border-primary/50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <button
                  disabled={busy || (multiDrafts[item.id]?.size ?? 0) === 0}
                  onClick={() => submitAnswer(item, Array.from(multiDrafts[item.id] ?? []))}
                  className="w-full py-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {busy ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                  Сохранить
                </button>
              </div>
            )}

            {item.questionType === 'rating' && (
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    disabled={busy}
                    onClick={() => submitAnswer(item, n)}
                    className="p-1 disabled:opacity-40"
                  >
                    <Star
                      size={22}
                      className={typeof item.answerValue === 'number' && item.answerValue >= n ? 'text-amber-500 fill-amber-500' : 'text-muted'}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pt-8 pb-16 px-4">
      <div className="max-w-[480px] mx-auto animate-fade-in">
        <div className="flex items-start justify-between mb-2">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted font-semibold">{data!.tenantName}</div>
          {data!.employee && (
            <button onClick={logout} className="flex items-center gap-1 text-muted text-[11px] font-medium hover:text-text transition-colors">
              {data!.employee.name} <LogOut size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <h1 className="font-display text-[26px] font-bold text-text tracking-tight leading-tight">{data!.department.name}</h1>
        </div>

        <div className="flex items-center gap-1 bg-card-hover rounded-xl px-2 py-1.5 mb-4">
          <button
            onClick={() => goToDate(shiftDate(data!.date, -1))}
            disabled={dateSwitching}
            className="p-1 text-muted hover:text-text disabled:opacity-40 flex-shrink-0 rounded-lg"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-text text-[12px] font-medium flex-shrink-0">{data!.date}</span>
          <button
            onClick={() => goToDate(shiftDate(data!.date, 1))}
            disabled={dateSwitching || data!.isToday}
            className="p-1 text-muted hover:text-text disabled:opacity-30 flex-shrink-0 rounded-lg"
          >
            <ChevronRight size={14} />
          </button>
          {dateSwitching && <RefreshCw size={12} className="text-muted animate-spin flex-shrink-0" />}
          <div className="flex-1" />
          {!data!.isToday && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-muted flex-shrink-0">
              <Archive size={11} /> архив
            </span>
          )}
        </div>

        <div className={`glass rounded-2xl px-4 py-4 mb-5 flex items-center gap-4 transition-colors ${allDone ? 'bg-success/10 border-success/25' : ''}`}>
          <span className={`font-display text-[28px] font-bold metric-number leading-none flex-shrink-0 ${allDone ? 'text-success' : 'text-text'}`}>
            {pct}%
          </span>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold mb-1.5 ${allDone ? 'text-success' : 'text-text'}`}>
              {allDone ? 'Всё выполнено' : `${done} из ${total} выполнено`}
            </div>
            <div className="h-1.5 rounded-full bg-card-hover overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-success' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {teamReports.length > 0 && (
          <div className="glass rounded-2xl px-4 py-3.5 mb-5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted mb-2.5">
              <Users size={13} /> Моя команда
            </div>
            <div className="space-y-1.5">
              {teamReports.map(r => {
                const rPct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
                return (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="text-[13px] text-text flex-1 min-w-0 truncate">{r.name}</span>
                    <div className="w-16 h-1.5 rounded-full bg-card-hover overflow-hidden flex-shrink-0">
                      <div
                        className={`h-full rounded-full ${rPct === 100 ? 'bg-success' : 'bg-primary'}`}
                        style={{ width: `${rPct}%` }}
                      />
                    </div>
                    <span className={`text-[11px] font-medium flex-shrink-0 w-10 text-right ${rPct === 100 ? 'text-success' : 'text-muted'}`}>
                      {r.done}/{r.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {photoError && (
          <p className="text-danger text-[12px] font-medium mb-3 px-1">{photoError}</p>
        )}

        {periodGroups.map(group => (
          <div key={group.period} className="mb-4 last:mb-0">
            {showSectionHeaders && (
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2 px-1">
                {PERIOD_LABELS[group.period]}
              </div>
            )}
            <div className="space-y-2">
              {group.items.map((item, i) => renderItem(item, i))}
            </div>
          </div>
        ))}
        {data!.items.length === 0 && (
          <p className="text-muted text-[13px] text-center py-10">Пункты чек-листа ещё не добавлены</p>
        )}

        {submitError && (
          <p className="text-danger text-[12px] font-medium mt-3 px-1">{submitError}</p>
        )}

        {data!.isToday && (
        <button
          onClick={submitChecklist}
          disabled={submitting || data!.submitted}
          className={`w-full mt-5 py-3.5 rounded-2xl text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors touch-manipulation disabled:opacity-70 ${
            data!.submitted ? 'bg-success/10 text-success' : 'bg-primary text-white hover:bg-primary-hover'
          }`}
        >
          {submitting
            ? <RefreshCw size={16} className="animate-spin" />
            : data!.submitted
              ? <CheckCircle2 size={16} />
              : <Send size={16} />}
          {data!.submitted ? 'Отправлено менеджеру ✓' : 'Отправить чек-лист менеджеру'}
        </button>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onCameraFile}
        />
        <input
          ref={violationCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onViolationCameraFile}
        />
      </div>

      {violationDraft && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => !violationBusy && setViolationDraft(null)}>
          <div className="glass rounded-3xl p-5 max-w-[380px] w-full animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-amber-500">
                <TriangleAlert size={18} />
                <span className="text-[14px] font-semibold">Что не так?</span>
              </div>
              <button onClick={() => !violationBusy && setViolationDraft(null)} className="text-muted hover:text-text">
                <X size={18} />
              </button>
            </div>
            <img src={violationDraft.photoUrl} alt="" className="w-full h-36 object-cover rounded-xl mb-3" />
            <textarea
              value={violationNote}
              onChange={e => setViolationNote(e.target.value)}
              placeholder="Опиши проблему (необязательно)"
              rows={3}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-[13px] text-text focus:outline-none focus:border-primary resize-none mb-3"
            />
            <button
              onClick={submitViolation}
              disabled={violationBusy}
              className="w-full py-2.5 bg-amber-500 text-white text-[13px] font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {violationBusy ? <RefreshCw size={14} className="animate-spin" /> : <TriangleAlert size={14} />}
              Отправить менеджеру
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
