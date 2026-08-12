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
const BRANCH_KEY = 'trace_checklist_employee_branch';

interface Session { token: string; name: string; branchSubdomain: string }

export function EmployeeChecklistPortal({ roleSlug, tenantSubdomain }: Props) {
  const lang: Language = 'ru';
  const [session, setSession] = useState<Session | null>(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const name = sessionStorage.getItem(NAME_KEY);
    const branchSubdomain = sessionStorage.getItem(BRANCH_KEY);
    return token && branchSubdomain ? { token, name: name ?? '', branchSubdomain } : null;
  });

  const onLoggedIn = (s: Session) => {
    sessionStorage.setItem(TOKEN_KEY, s.token);
    sessionStorage.setItem(NAME_KEY, s.name);
    sessionStorage.setItem(BRANCH_KEY, s.branchSubdomain);
    setSession(s);
  };
  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(NAME_KEY);
    sessionStorage.removeItem(BRANCH_KEY);
    setSession(null);
  };

  if (!session) {
    return <LoginFlow lang={lang} loginTenantSubdomain={tenantSubdomain} onLoggedIn={onLoggedIn} />;
  }
  return <TodayChecklist lang={lang} tenantSubdomain={session.branchSubdomain} token={session.token} name={session.name} onLogout={logout} />;
}

// Login is one PIN pad (tap digits, not the device keyboard — faster and
// works with gloves/wet hands behind a bar). PINs are unique across every
// active employee in the organization, so the PIN alone identifies who's
// logging in — no name-picker. If the employee's organization has more than
// one branch, a picker + confirm step follows: the token itself isn't tied
// to a branch (see backend), only which X-Tenant header gets sent from here
// on is — so switching branches later never needs a new login.
type LoginStep = 'pin' | 'branch' | 'confirm';

function LoginFlow({ lang, loginTenantSubdomain, onLoggedIn }: {
  lang: Language; loginTenantSubdomain: string; onLoggedIn: (s: Session) => void;
}) {
  const [step, setStep] = useState<LoginStep>('pin');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [branches, setBranches] = useState<{ subdomain: string; name: string }[]>([]);
  const [chosenBranch, setChosenBranch] = useState<{ subdomain: string; name: string } | null>(null);

  const tapDigit = (d: string) => setPin(prev => (prev.length < 6 ? prev + d : prev));
  const backspace = () => setPin(prev => prev.slice(0, -1));

  const submitPin = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await checklistAuthApi.employeeLogin(loginTenantSubdomain, pin);
      setName(res.name);
      setToken(res.token);
      setBranches(res.branches);
      if (res.branches.length <= 1) {
        const branch = res.branches[0] ?? { subdomain: loginTenantSubdomain, name: '' };
        onLoggedIn({ token: res.token, name: res.name, branchSubdomain: branch.subdomain });
      } else {
        setStep('branch');
      }
    } catch {
      setError(tr(lang, 'Неверный PIN', 'Wrong PIN', "PIN noto'g'ri"));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (pin.length >= 4 && step === 'pin') {
      // Small delay so the last digit's dot is visible before it submits.
      const t = setTimeout(submitPin, 150);
      return () => clearTimeout(t);
    }
  }, [pin]);

  if (step === 'branch') {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-sm mx-auto">
          <h1 className="text-[19px] font-bold text-text text-center mb-1">{name}</h1>
          <p className="text-[13px] text-muted text-center mb-6">{tr(lang, 'В каком вы филиале?', 'Which branch are you at?', 'Qaysi filialdasiz?')}</p>
          <div className="space-y-2">
            {branches.map(b => (
              <button
                key={b.subdomain}
                onClick={() => { setChosenBranch(b); setStep('confirm'); }}
                className="w-full py-3.5 rounded-xl bg-card border border-border text-[15px] font-medium text-text hover:border-primary/40"
              >
                {b.name || b.subdomain}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'confirm' && chosenBranch) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 flex flex-col items-center justify-center text-center">
        <p className="text-[13px] text-muted mb-1">{name}</p>
        <h1 className="text-[20px] font-bold text-text mb-8">{chosenBranch.name || chosenBranch.subdomain}</h1>
        <div className="flex gap-2 w-full max-w-xs">
          <button onClick={() => setStep('branch')} className="flex-1 py-2.5 rounded-lg bg-card text-muted text-[14px] font-medium">
            {tr(lang, 'Назад', 'Back', 'Orqaga')}
          </button>
          <button
            onClick={() => onLoggedIn({ token, name, branchSubdomain: chosenBranch.subdomain })}
            className="flex-1 py-2.5 rounded-lg bg-primary text-white text-[14px] font-semibold"
          >
            {tr(lang, 'Подтвердить', 'Confirm', 'Tasdiqlash')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 flex flex-col items-center justify-center">
      <p className="text-[13px] text-muted mb-6">PIN</p>
      <div className="flex gap-3 mb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full ${i < pin.length ? 'bg-primary' : 'bg-card border border-border'}`} />
        ))}
      </div>
      {error && <p className="text-[13px] text-red-500 mt-2">{error}</p>}
      <div className="grid grid-cols-3 gap-3 mt-6 w-full max-w-[280px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button
            key={d}
            onClick={() => tapDigit(d)}
            disabled={busy}
            className="py-4 rounded-xl bg-card border border-border text-[22px] font-semibold text-text active:bg-primary/20 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          onClick={() => tapDigit('0')}
          disabled={busy}
          className="py-4 rounded-xl bg-card border border-border text-[22px] font-semibold text-text active:bg-primary/20 disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={backspace}
          disabled={busy || pin.length === 0}
          className="py-4 rounded-xl bg-card border border-border text-[15px] font-semibold text-muted active:bg-primary/20 disabled:opacity-30"
        >
          ←
        </button>
      </div>
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
                        <div key={item.id} className="px-4 py-3.5 rounded-xl border border-border bg-card">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[14px] text-text break-words">{item.text}</span>
                            {item.requires_photo && uploading && (
                              <span className="text-[11px] text-muted shrink-0">{tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => answer(item, true)}
                              disabled={uploading}
                              className={`px-4 py-2 rounded-lg text-[13px] font-semibold ${item.done === true ? 'bg-green-500 text-white' : 'bg-background border border-border text-muted'}`}
                            >
                              {tr(lang, 'Да', 'Yes', 'Ha')}
                            </button>
                            <button
                              onClick={() => answer(item, false)}
                              disabled={uploading}
                              className={`px-4 py-2 rounded-lg text-[13px] font-semibold ${item.done === false && item.completed_at ? 'bg-red-500 text-white' : 'bg-background border border-border text-muted'}`}
                            >
                              {tr(lang, 'Нет', 'No', "Yo'q")}
                            </button>
                          </div>
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
    <div className="px-4 py-3.5 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[14px] text-text break-words">{item.text}</span>
        {item.requires_photo && uploading && (
          <span className="text-[11px] text-muted shrink-0">{tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')}</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onAnswer(item, true, { choice: opt })}
            disabled={uploading}
            className={`px-3 py-2 rounded-lg text-[13px] font-semibold ${current === opt ? 'bg-primary text-white' : 'bg-background border border-border text-muted'}`}
          >
            {opt}
          </button>
        ))}
      </div>
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
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          type={isNumber ? 'number' : 'text'}
          inputMode={isNumber ? 'decimal' : undefined}
          placeholder={isNumber ? tr(lang, 'Число', 'Number', 'Raqam') : tr(lang, 'Ответ', 'Answer', 'Javob')}
          className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-border bg-background text-[14px] text-text"
        />
        <button
          onClick={submit}
          disabled={uploading || !value.trim()}
          className="px-3 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50 shrink-0"
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
