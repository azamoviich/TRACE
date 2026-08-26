import React, { useState } from 'react';
import { Building2, Plus, Check, Loader2 } from 'lucide-react';
import { traceApi, Tenant, ConnectionTestResults } from '../../services/traceApi';
import { SectionHeading } from './primitives';
import { IdentityFields, PosCredentialFields, ModalShell, TenantFormState, emptyTenantForm, tenantFormToPayload } from './TenantForm';
import { isValidSubdomain } from './helpers';

const STEPS = ['Identity', 'POS connection', 'Review'] as const;

function TestResultLine({ label, result }: { label: string; result?: { ok: boolean; error?: string } }) {
  if (!result) return null;
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted">{label}</span>
      <span className={result.ok ? 'text-success' : 'text-danger'}>{result.ok ? '✓ OK' : `✗ ${result.error ?? 'Failed'}`}</span>
    </div>
  );
}

// Replaces the old one-shot CreateModal. Three steps so the two required
// decisions (identity, whether/how to connect a POS) aren't buried in a
// 28-field wall, and so a bad credential can be caught before the tenant
// is saved rather than after. See admin redesign plan Phase 2.
export const OnboardTenant: React.FC<{
  token: string;
  existingSubdomains: string[];
  onCreated: (t: Tenant) => void;
  onClose: () => void;
}> = ({ token, existingSubdomains, onCreated, onClose }) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<TenantFormState>(emptyTenantForm());
  const [serverProto, setServerProto] = useState<'http' | 'https'>('http');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResults | null>(null);

  const subdomainTaken = form.subdomain.length > 0 && existingSubdomains.includes(form.subdomain);
  const step1Valid = form.name.trim().length > 0 && isValidSubdomain(form.subdomain) && !subdomainTaken;

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = tenantFormToPayload(form, serverProto);
      const result = await traceApi.admin.testConnectionDraft(token, payload);
      setTestResult(result);
    } catch {
      setTestResult({ server: { ok: false, error: 'Request failed' } });
    } finally {
      setTesting(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreateErr('');
    try {
      const tenant = await traceApi.admin.create(token, tenantFormToPayload(form, serverProto));
      onCreated(tenant);
    } catch (ex: any) {
      setCreateErr(ex.message);
    } finally {
      setCreating(false);
    }
  };

  // Review URLs, Telegram, loyalty, and 1C are deliberately not part of this
  // wizard (see Step 3 copy below) — always listed as still-needed so the
  // founder doesn't assume "created" means "fully configured".
  const missing: string[] = ['Review platform URLs', 'Telegram alerts', 'Hall/floor plans'];
  if (form.pos_type === 'iiko' ? !form.iiko_server_host : !form.poster_account_name) missing.unshift('POS connection');

  return (
    <ModalShell icon={<Building2 size={14} />} title="Add Restaurant" onClose={onClose} zIndex="z-[60]">
      {/* Step indicator */}
      <div className="flex items-center gap-2 px-6 pt-4">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0
              ${i < step ? 'bg-success/20 text-success' : i === step ? 'bg-primary text-white' : 'bg-card-hover text-muted'}`}>
              {i < step ? <Check size={11} /> : i + 1}
            </div>
            <span className={`text-[10px] font-medium hidden sm:inline ${i === step ? 'text-text' : 'text-muted'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        ))}
      </div>

      <div className="p-6 space-y-5">
        {step === 0 && (
          <div>
            <SectionHeading icon={<Building2 size={12} />} title="Restaurant Identity" />
            <IdentityFields form={form} setForm={setForm} nameLabel="Restaurant Name" subdomainTaken={subdomainTaken} />
            {form.subdomain && !isValidSubdomain(form.subdomain) && (
              <p className="text-[10px] text-danger mt-2">3-30 characters, lowercase letters/numbers/hyphens only.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <PosCredentialFields form={form} setForm={setForm} serverProto={serverProto} setServerProto={setServerProto} hint="optional — can be added later" />
            <div className="mt-4 pt-3 border-t border-border/50">
              <button
                type="button"
                onClick={runTest}
                disabled={testing}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              {testResult && (
                <div className="mt-3 space-y-1.5">
                  <TestResultLine label="Cloud API" result={testResult.cloud_api} />
                  <TestResultLine label="iiko Server" result={testResult.server} />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <SectionHeading icon={<Building2 size={12} />} title="Review" />
              <div className="text-[12px] text-text space-y-1.5">
                <p><span className="text-muted">Name:</span> {form.name}</p>
                <p className="font-mono"><span className="text-muted font-sans">Subdomain:</span> {form.subdomain}.trace-os.uz</p>
                <p><span className="text-muted">POS:</span> {form.pos_type === 'iiko' ? (form.iiko_server_host ? 'iiko — configured' : 'iiko — not configured') : (form.poster_account_name ? 'Poster — configured' : 'Poster — not configured')}</p>
              </div>
            </div>
            {missing.length > 0 && (
              <div className="bg-card-hover border border-border rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted mb-1.5">Still needs setup after creating</p>
                <ul className="text-[11px] text-text space-y-1 list-disc list-inside">
                  {missing.map(m => <li key={m}>{m}</li>)}
                </ul>
                <p className="text-[10px] text-muted mt-2">Reviews, Telegram, loyalty, 1C, and hall plans are all configured from the restaurant's detail panel after it's created.</p>
              </div>
            )}
          </div>
        )}

        {createErr && <p className="text-danger text-[11px]">{createErr}</p>}

        <div className="flex gap-2 pt-1">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="text-muted hover:text-text text-[13px] px-4 py-2.5 rounded-lg border border-border transition-colors"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !step1Valid}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Restaurant
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-text text-[13px] px-4 py-2.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// Adding a sibling branch to an existing organization — a smaller, single-step
// version of the same identity + POS fields (no wizard needed: the org
// already exists, review/loyalty/1C settings are per-branch and belong in
// that branch's own drawer once created, same as a fresh tenant).
export const AddBranchModal: React.FC<{
  token: string;
  parentId: string;
  existingSubdomains: string[];
  onAdded: (t: Tenant) => void;
  onClose: () => void;
}> = ({ token, parentId, existingSubdomains, onAdded, onClose }) => {
  const [form, setForm] = useState<TenantFormState>(emptyTenantForm());
  const [serverProto, setServerProto] = useState<'http' | 'https'>('http');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const subdomainTaken = form.subdomain.length > 0 && existingSubdomains.includes(form.subdomain);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subdomain || !form.name) { setErr('Subdomain and name are required'); return; }
    if (subdomainTaken) { setErr('That subdomain is already taken'); return; }
    setLoading(true);
    setErr('');
    try {
      const newBranch = await traceApi.admin.addBranch(token, parentId, tenantFormToPayload(form, serverProto));
      onAdded(newBranch);
    } catch (ex: any) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell icon={<Building2 size={14} />} title="Add Branch" onClose={onClose} zIndex="z-[70]">
      <form onSubmit={submit} className="p-6 space-y-5">
        <div>
          <SectionHeading icon={<Building2 size={12} />} title="Branch Info" />
          <IdentityFields form={form} setForm={setForm} nameLabel="Branch Name" subdomainTaken={subdomainTaken} />
        </div>
        <div className="pt-1 border-t border-border/50">
          <PosCredentialFields form={form} setForm={setForm} serverProto={serverProto} setServerProto={setServerProto} hint="optional" />
        </div>
        {err && <p className="text-danger text-[11px]">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Branch
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-text text-[13px] px-4 py-2.5 rounded-lg border border-border transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
