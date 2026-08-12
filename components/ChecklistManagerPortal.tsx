import React, { useEffect, useState } from 'react';
import { LogOut, Plus, ChevronRight, Building2 } from 'lucide-react';
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
const NAME_KEY = 'trace_checklist_manager_name';
const BRANCHES_KEY = 'trace_checklist_manager_branches';
const CURRENT_BRANCH_KEY = 'trace_checklist_manager_current_branch';

interface Branch { subdomain: string; name: string }
// tenantSubdomain kept as the login-time home branch (used to re-derive the
// portal_subdomain host on reload); currentBranch is whichever branch the
// manager has switched to and drives every API call — full permission
// across every branch of the org, not just the one they logged in on.
interface Session { token: string; tenantSubdomain: string; name: string; branches: Branch[]; currentBranch: string }

function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const name = localStorage.getItem(NAME_KEY);
  const branchesRaw = localStorage.getItem(BRANCHES_KEY);
  const currentBranch = localStorage.getItem(CURRENT_BRANCH_KEY);
  if (!token || !branchesRaw || !currentBranch) return null;
  try {
    const branches = JSON.parse(branchesRaw) as Branch[];
    return { token, tenantSubdomain: currentBranch, name: name ?? '', branches, currentBranch };
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem(TOKEN_KEY, s.token);
  localStorage.setItem(NAME_KEY, s.name);
  localStorage.setItem(BRANCHES_KEY, JSON.stringify(s.branches));
  localStorage.setItem(CURRENT_BRANCH_KEY, s.currentBranch);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(BRANCHES_KEY);
  localStorage.removeItem(CURRENT_BRANCH_KEY);
}

export function ChecklistManagerPortal() {
  const lang: Language = 'ru';
  const [session, setSession] = useState<Session | null>(loadSession);

  const switchBranch = (subdomain: string) => {
    setSession(prev => {
      if (!prev) return prev;
      const next = { ...prev, currentBranch: subdomain };
      saveSession(next);
      return next;
    });
  };

  if (!session) return <LoginScreen lang={lang} onLoggedIn={setSession} />;
  return <Builder lang={lang} session={session} onSwitchBranch={switchBranch} onLogout={() => { clearSession(); setSession(null); }} />;
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
      const session: Session = {
        token: res.token, tenantSubdomain: res.tenantSubdomain, name: res.name,
        branches: res.branches, currentBranch: res.tenantSubdomain,
      };
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

function Builder({ lang, session, onSwitchBranch, onLogout }: {
  lang: Language; session: Session; onSwitchBranch: (subdomain: string) => void; onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [roles, setRoles] = useState<ChecklistRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const branch = session.currentBranch;

  const loadRoles = () => {
    setRolesLoading(true);
    checklistManagerApi.roles(branch, session.token).then(setRoles).finally(() => setRolesLoading(false));
  };
  useEffect(() => { loadRoles(); }, []); // roles are shared across branches — no need to reload on switch

  const showToast = (message: string, type: ToastType) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const employeesApi: EmployeesApi = {
    list: (roleId) => checklistManagerApi.employees.list(branch, session.token, roleId),
    create: (name, roleId, pin) => checklistManagerApi.employees.create(branch, session.token, name, roleId, pin),
    update: (id, patchBody) => checklistManagerApi.employees.update(branch, session.token, id, patchBody),
    remove: (id) => checklistManagerApi.employees.remove(branch, session.token, id),
    posPreview: () => checklistManagerApi.employees.posPreview(branch, session.token),
    import: (roleId, names) => checklistManagerApi.employees.import(branch, session.token, roleId, names),
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: tr(lang, 'Дашборд', 'Dashboard', 'Boshqaruv') },
    { id: 'checklists', label: tr(lang, 'Чек-листы', 'Checklists', 'Cheklistlar') },
    { id: 'employees', label: tr(lang, 'Сотрудники', 'Employees', 'Xodimlar') },
  ];

  const currentBranchLabel = session.branches.find(b => b.subdomain === branch)?.name ?? branch;

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

        {session.branches.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 size={14} className="text-muted shrink-0" />
            {session.branches.map(b => (
              <button
                key={b.subdomain}
                onClick={() => onSwitchBranch(b.subdomain)}
                className={`px-2.5 py-1 rounded-lg text-[12px] font-medium ${b.subdomain === branch ? 'bg-primary text-white' : 'bg-card border border-border text-muted'}`}
              >
                {b.name || b.subdomain}
              </button>
            ))}
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

        {rolesLoading ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
        ) : (
          <>
            {tab === 'dashboard' && (
              <DashboardTab
                key={branch}
                lang={lang}
                roles={roles}
                statsApi={(params) => checklistManagerApi.stats(branch, session.token, params)}
              />
            )}
            {tab === 'checklists' && (
              <ChecklistsBuilderTab key={branch} lang={lang} roles={roles} branch={branch} session={session} onShowToast={showToast} />
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

function ChecklistsBuilderTab({ lang, roles, branch, session, onShowToast }: {
  lang: Language; roles: ChecklistRole[]; branch: string; session: Session;
  onShowToast: (m: string, t: ToastType) => void;
}) {
  const [list, setList] = useState<Checklist[]>([]);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    checklistManagerApi.checklists.list(branch, session.token).then(setList).finally(() => setLoading(false));
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
          tenantSubdomain: branch,
          token: session.token,
          onLoadItems: (id) => checklistManagerApi.checklists.items(branch, session.token, id),
          onSave: async (data, id) => {
            if (id) await checklistManagerApi.checklists.update(branch, session.token, id, data);
            else await checklistManagerApi.checklists.create(branch, session.token, data);
          },
          onDelete: async (id) => { await checklistManagerApi.checklists.remove(branch, session.token, id); },
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
