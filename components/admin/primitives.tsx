import React, { useState } from 'react';

export const inputBase = 'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-text text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted/40';

export const FieldLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <label className="block text-[9px] uppercase tracking-[0.18em] text-muted mb-1.5 font-medium">
    {children}{hint && <span className="text-muted/50 normal-case font-normal ml-1">{hint}</span>}
  </label>
);

export const Field: React.FC<{
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  min?: number;
  max?: number;
  error?: string;
}> = ({ label, hint, value, onChange, placeholder, mono, type = 'text', min, max, error }) => (
  <div>
    <FieldLabel hint={hint}>{label}</FieldLabel>
    <input
      type={type}
      min={min}
      max={max}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`${inputBase} ${mono ? 'font-mono' : ''} ${error ? 'border-danger/60' : ''}`}
    />
    {error && <p className="text-[10px] text-danger mt-1">{error}</p>}
  </div>
);

export const PasswordField: React.FC<{
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, hint, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={`${inputBase} font-mono pr-12`}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors text-[10px] font-semibold px-1.5 py-1 rounded hover:bg-card-hover"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
};

export const ServerField: React.FC<{
  proto: 'http' | 'https';
  onProtoChange: (p: 'http' | 'https') => void;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}> = ({ proto, onProtoChange, value, onChange, label = 'iiko Server' }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex rounded-lg overflow-hidden border border-border">
        {(['http', 'https'] as const).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onProtoChange(p)}
            className={`px-2.5 py-1 text-[10px] font-mono font-semibold transition-colors
              ${proto === p ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
    <div className="flex items-center border border-border rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
      <span className="px-3 text-[11px] text-muted font-mono bg-card-hover border-r border-border py-2.5 flex-shrink-0">{proto}://</span>
      <input
        type="text"
        placeholder="192.168.1.1:8080"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-background px-3 py-2.5 text-text text-[12px] font-mono focus:outline-none min-w-0 placeholder:text-muted/40"
      />
    </div>
  </div>
);

export const SectionHeading: React.FC<{ icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }> = ({ icon, title, hint, action }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-primary">{icon}</span>
    <h3 className="text-[10px] uppercase tracking-[0.22em] font-semibold text-text">{title}</h3>
    {hint && <span className="text-[10px] text-muted normal-case tracking-normal">{hint}</span>}
    {action && <span className="ml-auto">{action}</span>}
  </div>
);

export const ReadRow: React.FC<{ label: string; children: React.ReactNode; mono?: boolean; stacked?: boolean }> = ({ label, children, mono, stacked }) => (
  stacked ? (
    <div>
      <span className="block text-[9px] text-muted uppercase tracking-[0.15em] mb-0.5">{label}</span>
      <span className={`text-[11px] text-text break-all ${mono ? 'font-mono' : ''}`}>{children}</span>
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">{label}</span>
      <span className={`text-[12px] text-text ${mono ? 'font-mono' : ''}`}>{children}</span>
    </div>
  )
);

export const Empty = () => <span className="text-muted italic">not set</span>;

export const PillToggle = <T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) => (
  <div className="flex rounded-lg overflow-hidden border border-border w-fit">
    {options.map(p => (
      <button
        key={p}
        type="button"
        onClick={() => onChange(p)}
        className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors
          ${value === p ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
      >
        {p}
      </button>
    ))}
  </div>
);
