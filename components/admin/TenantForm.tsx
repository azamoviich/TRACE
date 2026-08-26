import React from 'react';
import { Building2, Server, X } from 'lucide-react';
import { Field, FieldLabel, PasswordField, ServerField, SectionHeading, PillToggle, inputBase } from './primitives';
import { DOMAIN, subdomainSlug } from './helpers';

export interface TenantFormState {
  subdomain: string;
  name: string;
  pos_type: 'iiko' | 'poster';
  poster_account_name: string;
  poster_access_token: string;
  poster_spot_id: string;
  iiko_login: string;
  iiko_password: string;
  iiko_server_host: string;
  iiko_cloud_api: string;
}

export const emptyTenantForm = (): TenantFormState => ({
  subdomain: '', name: '', pos_type: 'iiko',
  poster_account_name: '', poster_access_token: '', poster_spot_id: '',
  iiko_login: '', iiko_password: '', iiko_server_host: '', iiko_cloud_api: '',
});

export function tenantFormToPayload(form: TenantFormState, serverProto: 'http' | 'https') {
  const iiko_server = form.iiko_server_host ? `${serverProto}://${form.iiko_server_host}` : null;
  return {
    subdomain: form.subdomain,
    name: form.name,
    pos_type: form.pos_type,
    iiko_login: form.pos_type === 'iiko' ? (form.iiko_login || null) : null,
    iiko_password: form.pos_type === 'iiko' ? (form.iiko_password || null) : null,
    iiko_server: form.pos_type === 'iiko' ? iiko_server : null,
    iiko_cloud_api: form.pos_type === 'iiko' ? (form.iiko_cloud_api || null) : null,
    poster_account_name: form.pos_type === 'poster' ? (form.poster_account_name || null) : null,
    poster_access_token: form.pos_type === 'poster' ? (form.poster_access_token || null) : null,
    poster_spot_id: form.pos_type === 'poster' ? (form.poster_spot_id || null) : null,
  };
}

// Name + subdomain. Shared by the onboarding wizard's Step 1 and AddBranch.
export const IdentityFields: React.FC<{
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
  nameLabel: string;
  subdomainTaken?: boolean;
}> = ({ form, setForm, nameLabel, subdomainTaken }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <Field label={nameLabel} value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
    <div>
      <div className="flex items-end justify-between mb-1.5">
        <FieldLabel>Subdomain</FieldLabel>
        {form.subdomain && (
          <span className={`text-[9px] font-mono ${subdomainTaken ? 'text-danger' : 'text-primary/70'}`}>
            {subdomainTaken ? 'already taken' : `${form.subdomain}.${DOMAIN}`}
          </span>
        )}
      </div>
      <input
        value={form.subdomain}
        onChange={e => setForm(f => ({ ...f, subdomain: subdomainSlug(e.target.value) }))}
        className={`${inputBase} font-mono ${subdomainTaken ? 'border-danger/60' : ''}`}
      />
    </div>
  </div>
);

// POS type + the matching credential block. Shared by the onboarding
// wizard's Step 2, AddBranch, and the drawer's General settings — this
// exact block used to be copy-pasted in all three places.
export const PosCredentialFields: React.FC<{
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
  serverProto: 'http' | 'https';
  setServerProto: (p: 'http' | 'https') => void;
  hint?: string;
}> = ({ form, setForm, serverProto, setServerProto, hint }) => (
  <div>
    <SectionHeading icon={<Server size={12} />} title="POS Connection" hint={hint} />
    <div className="mb-3">
      <PillToggle options={['iiko', 'poster'] as const} value={form.pos_type} onChange={p => setForm(f => ({ ...f, pos_type: p }))} />
    </div>
    {form.pos_type === 'iiko' && (
      <div className="space-y-3">
        <ServerField proto={serverProto} onProtoChange={setServerProto} value={form.iiko_server_host} onChange={v => setForm(f => ({ ...f, iiko_server_host: v }))} />
        <Field label="Login" mono value={form.iiko_login} onChange={v => setForm(f => ({ ...f, iiko_login: v }))} />
        <PasswordField label="Password" value={form.iiko_password} onChange={v => setForm(f => ({ ...f, iiko_password: v }))} />
        <Field label="Cloud API Key" mono placeholder="b5e2300c-a7b9-4613-..." value={form.iiko_cloud_api} onChange={v => setForm(f => ({ ...f, iiko_cloud_api: v }))} />
      </div>
    )}
    {form.pos_type === 'poster' && (
      <div className="space-y-3">
        <Field label="Account Name" mono placeholder="demo" value={form.poster_account_name} onChange={v => setForm(f => ({ ...f, poster_account_name: v }))} />
        <PasswordField label="Access Token" value={form.poster_access_token} onChange={v => setForm(f => ({ ...f, poster_access_token: v }))} />
        <Field label="Spot ID" mono placeholder="leave blank if account has only one spot" value={form.poster_spot_id} onChange={v => setForm(f => ({ ...f, poster_spot_id: v }))} />
      </div>
    )}
  </div>
);

export const ModalShell: React.FC<{
  icon: React.ReactNode;
  title: string;
  onClose: () => void;
  zIndex: string;
  children: React.ReactNode;
}> = ({ icon, title, onClose, zIndex, children }) => (
  <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4`}>
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
    <div className="relative z-10 w-full max-w-[460px] bg-surface border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 text-primary">
            {icon}
          </span>
          <h2 className="text-[14px] font-semibold text-text">{title}</h2>
        </div>
        <button onClick={onClose} className="text-muted hover:text-text transition-colors p-1 rounded-lg hover:bg-card-hover">
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export { Building2 };
