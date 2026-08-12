import React, { useEffect, useState } from 'react';
import { LogOut, Plus, ChevronRight } from 'lucide-react';
import { Card } from './ui/Card';
import { ToastContainer, ToastMessage, ToastType } from './Toast';
import { Language } from '../types';
import type { Checklist, ChecklistRole } from '../types';
import {
  checklistAuthApi, checklistManagerApi, getChecklistManagerPortalSubdomain,
} from '../services/traceApi';
import { ChecklistEditor, EmployeesTab, DashboardTab, EmployeesApi } from './views/Checklists';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

const TOKEN_KEY = 'trace_checklist_manager_token';
const TENANT_KEY = 'trace_checklist_manager_tenant';
const NAME_KEY = 'trace_checklist_manager_name';

interface Session { token: string; tenantSubdomain: string; name: string }

function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const tenantSubdomain = localStorage.getItem(TENANT_KEY);
  const name = localStorage.getItem(NAME_KEY);
  if (!token || !tenantSubdomain) return null;
  return { token, tenantSubdomain, name: name ?? '' };
}

function saveSession(s: Session) {
  localStorage.setItem(TOKEN_KEY, s.token);
  localStorage.setItem(TENANT_KEY, s.tenantSubdomain);
  localStorage.setItem(NAME_KEY, s.name);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TENANT_KEY);
  localStorage.removeItem(NAME_KEY);
}

export function ChecklistManagerPortal() {
  const lang: Language = 'ru';
  const [session, setSession] = useState<Session | null>(loadSession);

  if (!session) return <LoginScreen lang={lang} onLoggedIn={setSession} />;
  return <Builder lang={lang} session={session} onLogout={() => { clearSession(); setSession(null); }} />;
}

function LoginScreen({ lang, onLoggedIn }: { lang: Language; onLoggedIn: (s: Session) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      const portalSubdomain = getChecklistManagerPortalSubdomain();
      const res = await checklistAuthApi.managerLogin(portalSubdomain, password);
      const session = { token: res.token, tenantSubdomain: res.tenantSubdomain, name: res.name };
      saveSession(session);
      onLoggedIn(session);
    } catch {
      setError(tr(lang, 'Неверный пароль', 'Invalid password', "Parol noto'g'ri"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm" title={tr(lang, 'Вход менеджера', 'Manager login', 'Menejer kirishi')}>
        <div className="space-y-3">
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            type="password"
            placeholder={tr(lang, 'Пароль', 'Password', 'Parol')}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-[14px] text-text"
          />
          {error && <p className="text-[13px] text-red-500">{error}</p>}
          <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-white text-[14px] font-semibold disabled:opacity-50">
            {tr(lang, 'Войти', 'Log in', 'Kirish')}
          </button>
        </div>
      </Card>
    </div>
  );
}

type Tab = 'dashboard' | 'checklists' | 'employees';

function Builder({ lang, session, onLogout }: { lang: Language; session: Session; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const loadRoles = () => {
    setRolesLoading(true);
    checklistManagerApi.roles(session.tenantSubdomain, session.token).then(setRoles).finally(() => setRolesLoading(false));
  };
  useEffect(() => { loadRoles(); }, []);

  const showToast = (message: string, type: ToastType) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const employeesApi: EmployeesApi = {
    list: (roleId) => checklistManagerApi.employees.list(session.tenantSubdomain, session.token, roleId),
    create: (name, roleId, pin) => checklistManagerApi.employees.create(session.tenantSubdomain, session.token, name, roleId, pin),
    update: (id, patchBody) => checklistManagerApi.employees.update(session.tenantSubdomain, session.token, id, patchBody),
    remove: (id) => checklistManagerApi.employees.remove(session.tenantSubdomain, session.token, id),
    posPreview: () => checklistManagerApi.employees.posPreview(session.tenantSubdomain, session.token),
    import: (roleId, names) => checklistManagerApi.employees.import(session.tenantSubdomain, session.token, roleId, names),
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: tr(lang, 'Дашборд', 'Dashboard', 'Boshqaruv') },
    { id: 'checklists', label: tr(lang, 'Чек-листы', 'Checklists', 'Cheklistlar') },
    { id: 'employees', label: tr(lang, 'Сотрудники', 'Employees', 'Xodimlar') },
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-text">{tr(lang, 'Чек-листы', 'Checklists', 'Cheklistlar')}</h1>
            <p className="text-[12px] text-muted">{session.name}</p>
          </div>
          <button onClick={onLogout} className="p-2 rounded-lg bg-card text-muted hover:text-text">
            <LogOut size={18} />
          </button>
        </div>

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

        {rolesLoading ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
        ) : (
          <>
            {tab === 'dashboard' && (
              <DashboardTab
                lang={lang}
                roles={roles}
                statsApi={(params) => checklistManagerApi.stats(session.tenantSubdomain, session.token, params)}
              />
            )}
            {tab === 'checklists' && (
              <ChecklistsBuilderTab lang={lang} roles={roles} session={session} onShowToast={showToast} />
            )}
            {tab === 'employees' && (
              <EmployeesTab lang={lang} roles={roles} onShowToast={showToast} api={employeesApi} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChecklistsBuilderTab({ lang, roles, session, onShowToast }: {
  lang: Language; roles: ChecklistRole[]; session: Session;
  onShowToast: (m: string, t: ToastType) => void;
}) {
  const [list, setList] = useState<Checklist[]>([]);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    checklistManagerApi.checklists.list(session.tenantSubdomain, session.token).then(setList).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? '—';

  if (editingId) {
    return (
      <ChecklistEditor
        lang={lang}
        roles={roles}
        checklistId={editingId === 'new' ? null : editingId}
        onDone={() => { setEditingId(null); load(); }}
        onShowToast={onShowToast}
        manager={{
          tenantSubdomain: session.tenantSubdomain,
          token: session.token,
          onSave: async (data, id) => {
            if (id) await checklistManagerApi.checklists.update(session.tenantSubdomain, session.token, id, data);
            else await checklistManagerApi.checklists.create(session.tenantSubdomain, session.token, data);
          },
          onDelete: async (id) => { await checklistManagerApi.checklists.remove(session.tenantSubdomain, session.token, id); },
        }}
      />
    );
  }

  return (
    <Card
      action={
        <button onClick={() => setEditingId('new')} className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold flex items-center gap-1.5">
          <Plus size={14} /> {tr(lang, 'Новый', 'New', 'Yangi')}
        </button>
      }
    >
      {loading ? (
        <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
      ) : list.length === 0 ? (
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
