import React, { useEffect, useRef, useState } from 'react';
import { Check, Camera, LogOut } from 'lucide-react';
import { Language } from '../types';
import type { ChecklistTodayItem, ChecklistItem } from '../types';
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
    return <NameAndPinLogin lang={lang} roleSlug={roleSlug} tenantSubdomain={tenantSubdomain} onLoggedIn={onLoggedIn} />;
  }
  return <TodayChecklist lang={lang} tenantSubdomain={tenantSubdomain} token={token} name={name ?? ''} onLogout={logout} />;
}

function NameAndPinLogin({ lang, roleSlug, tenantSubdomain, onLoggedIn }: {
  lang: Language; roleSlug: string; tenantSubdomain: string; onLoggedIn: (token: string, name: string) => void;
}) {
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [roleName, setRoleName] = useState('');
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checklistAuthApi.employeeRoster(tenantSubdomain, roleSlug)
      .then(res => { setEmployees(res.employees); setRoleName(res.roleName); })
      .catch(() => setError(tr(lang, 'Страница не найдена', 'Page not found', 'Sahifa topilmadi')))
      .finally(() => setLoading(false));
  }, []);

  const submitPin = async () => {
    if (!selected || pin.length < 4) return;
    setBusy(true);
    setError('');
    try {
      const res = await checklistAuthApi.employeeLogin(tenantSubdomain, selected.id, pin);
      onLoggedIn(res.token, res.name);
    } catch {
      setError(tr(lang, 'Неверный PIN', 'Wrong PIN', "PIN noto'g'ri"));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <CenteredMessage>{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</CenteredMessage>;

  if (!selected) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-sm mx-auto">
          <h1 className="text-[20px] font-bold text-text text-center mb-1">{roleName}</h1>
          <p className="text-[13px] text-muted text-center mb-6">{tr(lang, 'Выберите своё имя', 'Pick your name', "Ismingizni tanlang")}</p>
          {error && <p className="text-[13px] text-red-500 text-center mb-4">{error}</p>}
          <div className="space-y-2">
            {employees.map(e => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className="w-full py-3.5 rounded-xl bg-card border border-border text-[15px] font-medium text-text hover:border-primary/40"
              >
                {e.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 flex flex-col items-center">
      <h1 className="text-[20px] font-bold text-text mb-1">{selected.name}</h1>
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
      <div className="flex gap-2 mt-6 w-full max-w-xs">
        <button onClick={() => { setSelected(null); setPin(''); setError(''); }} className="flex-1 py-2.5 rounded-lg bg-card text-muted text-[14px] font-medium">
          {tr(lang, 'Назад', 'Back', 'Orqaga')}
        </button>
        <button onClick={submitPin} disabled={busy || pin.length < 4} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-[14px] font-semibold disabled:opacity-50">
          {tr(lang, 'Войти', 'Log in', 'Kirish')}
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

  // For checkbox items, tapping the row toggles: value = !item.done.
  // For yesno items, each button passes its own explicit value.
  const answer = async (item: ChecklistItem, value: boolean) => {
    if (value && item.requires_photo) {
      pendingItemId.current = item.id;
      fileInputRef.current?.click();
      return;
    }
    await checklistEmployeeApi.toggle(tenantSubdomain, token, item.id, value);
    load();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = pendingItemId.current;
    e.target.value = '';
    if (!file || !itemId) return;
    setUploadingItemId(itemId);
    try {
      const photoUrl = await uploadPhoto(tenantSubdomain, file);
      await checklistEmployeeApi.toggle(tenantSubdomain, token, itemId, true, photoUrl);
      load();
    } finally {
      setUploadingItemId(null);
      pendingItemId.current = null;
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
                  {c.items.map(item => (
                    item.item_type === 'yesno' ? (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-card">
                        <span className="flex-1 text-[14px] text-text">{item.text}</span>
                        {item.requires_photo && uploadingItemId === item.id && (
                          <span className="text-[11px] text-muted">{tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')}</span>
                        )}
                        <button
                          onClick={() => answer(item, true)}
                          disabled={uploadingItemId === item.id}
                          className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold ${item.done === true ? 'bg-green-500 text-white' : 'bg-background border border-border text-muted'}`}
                        >
                          {tr(lang, 'Да', 'Yes', 'Ha')}
                        </button>
                        <button
                          onClick={() => answer(item, false)}
                          disabled={uploadingItemId === item.id}
                          className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold ${item.done === false && item.completed_at ? 'bg-red-500 text-white' : 'bg-background border border-border text-muted'}`}
                        >
                          {tr(lang, 'Нет', 'No', "Yo'q")}
                        </button>
                      </div>
                    ) : (
                      <button
                        key={item.id}
                        onClick={() => answer(item, !item.done)}
                        disabled={uploadingItemId === item.id}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-colors ${item.done ? 'bg-green-500/10 border-green-500/30' : 'bg-card border-border'}`}
                      >
                        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${item.done ? 'bg-green-500 text-white' : 'border border-border'}`}>
                          {item.done && <Check size={14} />}
                        </span>
                        <span className={`flex-1 text-[14px] ${item.done ? 'text-muted line-through' : 'text-text'}`}>{item.text}</span>
                        {item.requires_photo && (
                          uploadingItemId === item.id
                            ? <span className="text-[11px] text-muted">{tr(lang, 'Загрузка...', 'Uploading...', 'Yuklanmoqda...')}</span>
                            : <Camera size={16} className="text-muted shrink-0" />
                        )}
                      </button>
                    )
                  ))}
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
