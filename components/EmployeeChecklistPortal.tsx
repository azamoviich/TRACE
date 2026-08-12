import React, { useEffect, useRef, useState } from 'react';
import { Check, Camera, LogOut, Star } from 'lucide-react';
import { Language } from '../types';
import type { ChecklistTodayItem, ChecklistItem, ChecklistAnswerValue } from '../types';
import { checklistAuthApi, checklistEmployeeApi, uploadPhoto } from '../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

interface Props {
  roleSlug: string;
  tenantSubdomain: string;
}

const TOKEN_KEY = 'trace_checklist_employee_token';
const NAME_KEY = 'trace_checklist_employee_name';

export function EmployeeChecklistPortal({ roleSlug, tenantSubdomain }: Props) {
  const lang: Language = 'ru';
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [name, setName] = useState<string | null>(() => sessionStorage.getItem(NAME_KEY));

  const onLoggedIn = (t: string, n: string) => {
    sessionStorage.setItem(TOKEN_KEY, t);
    sessionStorage.setItem(NAME_KEY, n);
    setToken(t);
    setName(n);
  };
  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(NAME_KEY);
    setToken(null);
    setName(null);
  };

  if (!token) {
    return <PinLogin lang={lang} tenantSubdomain={tenantSubdomain} onLoggedIn={onLoggedIn} />;
  }
  return <TodayChecklist lang={lang} tenantSubdomain={tenantSubdomain} token={token} name={name ?? ''} onLogout={logout} />;
}

// PINs are unique across every active employee in the tenant, so the PIN
// alone identifies who's logging in (and their role) — no name-picker step.
function PinLogin({ lang, tenantSubdomain, onLoggedIn }: {
  lang: Language; tenantSubdomain: string; onLoggedIn: (token: string, name: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPin = async () => {
    if (pin.length < 4) return;
    setBusy(true);
    setError('');
    try {
      const res = await checklistAuthApi.employeeLogin(tenantSubdomain, pin);
      onLoggedIn(res.token, res.name);
    } catch {
      setError(tr(lang, 'Неверный PIN', 'Wrong PIN', "PIN noto'g'ri"));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 flex flex-col items-center justify-center">
      <p className="text-[13px] text-muted mb-6">PIN</p>
      <input
        autoFocus
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={e => e.key === 'Enter' && submitPin()}
        type="password"
        inputMode="numeric"
        className="w-40 text-center text-[28px] tracking-[0.3em] py-3 rounded-xl border border-border bg-card text-text"
      />
      {error && <p className="text-[13px] text-red-500 mt-3">{error}</p>}
      <button onClick={submitPin} disabled={busy || pin.length < 4} className="mt-6 w-full max-w-xs py-2.5 rounded-lg bg-primary text-white text-[14px] font-semibold disabled:opacity-50">
        {tr(lang, 'Войти', 'Log in', 'Kirish')}
      </button>
    </div>
  );
}

function TodayChecklist({ lang, tenantSubdomain, token, name, onLogout }: {
  lang: Language; tenantSubdomain: string; token: string; name: string; onLogout: () => void;
}) {
  const [checklists, setChecklists] = useState<ChecklistTodayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingItemId = useRef<string | null>(null);

  const load = () => {
    setLoading(true);
    checklistEmployeeApi.today(tenantSubdomain, token)
      .then(res => setChecklists(res.checklists))
      .catch(() => onLogout())
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const pendingAnswerValue = useRef<ChecklistAnswerValue | undefined>(undefined);

  // For checkbox items, tapping the row toggles: value = !item.done.
  // For yesno items, each button passes its own explicit value.
  // For text/number/rating, value is always true (an answer was given) and
  // the actual content rides along in answerValue.
  const answer = async (item: ChecklistItem, value: boolean, answerValue?: ChecklistAnswerValue) => {
    if (value && item.requires_photo) {
      pendingItemId.current = item.id;
      pendingAnswerValue.current = answerValue;
      fileInputRef.current?.click();
      return;
    }
    await checklistEmployeeApi.toggle(tenantSubdomain, token, item.id, value, undefined, answerValue);
    load();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = pendingItemId.current;
    const answerValue = pendingAnswerValue.current;
    e.target.value = '';
    if (!file || !itemId) return;
    setUploadingItemId(itemId);
    try {
      const photoUrl = await uploadPhoto(tenantSubdomain, file);
      await checklistEmployeeApi.toggle(tenantSubdomain, token, itemId, true, photoUrl, answerValue);
      load();
    } finally {
      setUploadingItemId(null);
      pendingItemId.current = null;
      pendingAnswerValue.current = undefined;
    }
  };

  const totalItems = checklists.reduce((n, c) => n + c.items.length, 0);
  const doneItems = checklists.reduce((n, c) => n + c.items.filter(i => i.done).length, 0);

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      {/* capture="environment" opens the camera directly on mobile, skipping the gallery picker */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChosen} />

      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[19px] font-bold text-text">{name}</h1>
          <button onClick={onLogout} className="p-2 rounded-lg bg-card text-muted"><LogOut size={17} /></button>
        </div>
        {totalItems > 0 && (
          <p className="text-[13px] text-muted mb-5">{doneItems} / {totalItems} {tr(lang, 'выполнено', 'done', 'bajarildi')}</p>
        )}

        {loading ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
        ) : checklists.length === 0 ? (
          <p className="text-[13px] text-muted">{tr(lang, 'На сегодня чек-листов нет', 'No checklists for today', "Bugun uchun cheklist yo'q")}</p>
        ) : (
          <div className="space-y-5">
            {checklists.map(c => (
              <div key={c.id}>
                <h2 className="text-[14px] font-semibold text-text mb-2">{c.name}</h2>
                <div className="space-y-2">
                  {c.items.map(item => {
                    const uploading = uploadingItemId === item.id;
                    if (item.item_type === 'yesno') {
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-card">
                          <span className="flex-1 text-[14px] text-text">{item.text}</span>
                          {item.requires_photo && uploading && (
                            <span className="text-[11px] text-muted">{tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')}</span>
                          )}
                          <button
                            onClick={() => answer(item, true)}
                            disabled={uploading}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold ${item.done === true ? 'bg-green-500 text-white' : 'bg-background border border-border text-muted'}`}
                          >
                            {tr(lang, 'Да', 'Yes', 'Ha')}
                          </button>
                          <button
                            onClick={() => answer(item, false)}
                            disabled={uploading}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold ${item.done === false && item.completed_at ? 'bg-red-500 text-white' : 'bg-background border border-border text-muted'}`}
                          >
                            {tr(lang, 'Нет', 'No', "Yo'q")}
                          </button>
                        </div>
                      );
                    }
                    if (item.item_type === 'rating') {
                      return <RatingRow key={item.id} lang={lang} item={item} uploading={uploading} onAnswer={answer} />;
                    }
                    if (item.item_type === 'choice') {
                      return <ChoiceRow key={item.id} lang={lang} item={item} uploading={uploading} onAnswer={answer} />;
                    }
                    if (item.item_type === 'text' || item.item_type === 'number') {
                      return <TextOrNumberRow key={item.id} lang={lang} item={item} uploading={uploading} onAnswer={answer} />;
                    }
                    return (
                      <button
                        key={item.id}
                        onClick={() => answer(item, !item.done)}
                        disabled={uploading}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-colors ${item.done ? 'bg-green-500/10 border-green-500/30' : 'bg-card border-border'}`}
                      >
                        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${item.done ? 'bg-green-500 text-white' : 'border border-border'}`}>
                          {item.done && <Check size={14} />}
                        </span>
                        <span className={`flex-1 text-[14px] ${item.done ? 'text-muted line-through' : 'text-text'}`}>{item.text}</span>
                        {item.requires_photo && (
                          uploading
                            ? <span className="text-[11px] text-muted">{tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')}</span>
                            : <Camera size={16} className="text-muted shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-[13px] text-muted">{children}</div>;
}

type AnswerFn = (item: ChecklistItem, value: boolean, answerValue?: ChecklistAnswerValue) => Promise<void>;

function RatingRow({ lang, item, uploading, onAnswer }: {
  lang: Language; item: ChecklistItem; uploading: boolean; onAnswer: AnswerFn;
}) {
  const current = item.answer_value && 'rating' in item.answer_value ? item.answer_value.rating : null;
  return (
    <div className="px-4 py-3.5 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] text-text">{item.text}</span>
        {item.requires_photo && uploading && (
          <span className="text-[11px] text-muted">{tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onAnswer(item, true, { rating: n })}
            disabled={uploading}
            className="p-1"
          >
            <Star size={24} className={current != null && n <= current ? 'fill-primary text-primary' : 'text-muted'} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceRow({ lang, item, uploading, onAnswer }: {
  lang: Language; item: ChecklistItem; uploading: boolean; onAnswer: AnswerFn;
}) {
  const current = item.answer_value && 'choice' in item.answer_value ? item.answer_value.choice : null;
  const options = (item.options ?? []).filter(Boolean);
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-card">
      <span className="flex-1 text-[14px] text-text">{item.text}</span>
      {item.requires_photo && uploading && (
        <span className="text-[11px] text-muted">{tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')}</span>
      )}
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onAnswer(item, true, { choice: opt })}
          disabled={uploading}
          className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold ${current === opt ? 'bg-primary text-white' : 'bg-background border border-border text-muted'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function TextOrNumberRow({ lang, item, uploading, onAnswer }: {
  lang: Language; item: ChecklistItem; uploading: boolean; onAnswer: AnswerFn;
}) {
  const initial = item.answer_value
    ? ('text' in item.answer_value ? item.answer_value.text : 'number' in item.answer_value ? String(item.answer_value.number) : '')
    : '';
  const [value, setValue] = useState(initial);
  const isNumber = item.item_type === 'number';

  const submit = () => {
    if (!value.trim()) return;
    if (isNumber) {
      const n = Number(value);
      if (Number.isNaN(n)) return;
      onAnswer(item, true, { number: n });
    } else {
      onAnswer(item, true, { text: value.trim() });
    }
  };

  return (
    <div className="px-4 py-3.5 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] text-text">{item.text}</span>
        {item.done && <Check size={16} className="text-green-500 shrink-0" />}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          type={isNumber ? 'number' : 'text'}
          inputMode={isNumber ? 'decimal' : undefined}
          placeholder={isNumber ? tr(lang, 'Число', 'Number', 'Raqam') : tr(lang, 'Ответ', 'Answer', 'Javob')}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-[14px] text-text"
        />
        <button
          onClick={submit}
          disabled={uploading || !value.trim()}
          className="px-3 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50"
        >
          {uploading
            ? tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')
            : tr(lang, 'Сохранить', 'Save', 'Saqlash')}
        </button>
        {item.requires_photo && !uploading && <Camera size={16} className="text-muted shrink-0" />}
      </div>
    </div>
  );
}
