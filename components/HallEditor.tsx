import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Save, Trash2, Square, Circle, Minus, ArrowRight, LayoutGrid, RotateCcw, RotateCw } from 'lucide-react';
import { HallElement, HallElementType, HallPlan, IikoSection } from '../services/traceApi';
import { Language } from '../types';
import { tr } from '../constants';

// ── constants ─────────────────────────────────────────────────────────────────

const W = 600;
const H = 380;
const GRID = 20;
const SNAP = (v: number) => Math.round(v / GRID) * GRID;

const DEFAULTS: Record<HallElementType, Partial<HallElement>> = {
  rect_table:  { w: 80, h: 40, label: 'T', seats: 4 },
  round_table: { r: 28, label: 'T', seats: 4 },
  stool:       { r: 10, label: 'B', seats: 1 },
  wall:        { w: 120, h: 14, label: '', seats: 0 },
  bar:         { w: 160, h: 50, label: 'BAR', seats: 0 },
  entrance:    { w: 80, h: 14, label: 'ВХОД', seats: 0 },
};

function newId() {
  return crypto.randomUUID();
}

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function occColor(o: number, isDark: boolean) {
  if (isDark) {
    if (o < 0.15) return { fill: '#181818', stroke: '#2c2c2c', text: '#555' };
    if (o < 0.40) return { fill: '#0c1e12', stroke: '#22c55e', text: '#22c55e' };
    if (o < 0.65) return { fill: '#1c1400', stroke: '#f59e0b', text: '#f59e0b' };
    if (o < 0.85) return { fill: '#1e0e04', stroke: '#ff6b35', text: '#ff6b35' };
    return         { fill: '#1e0606', stroke: '#ef4444', text: '#ef4444' };
  }
  if (o < 0.15) return { fill: '#f0ece6', stroke: '#c8c3bb', text: '#a09890' };
  if (o < 0.40) return { fill: '#f0fdf4', stroke: '#22c55e', text: '#16a34a' };
  if (o < 0.65) return { fill: '#fffbeb', stroke: '#f59e0b', text: '#d97706' };
  if (o < 0.85) return { fill: '#fff4ef', stroke: '#ff6b35', text: '#ea5520' };
  return         { fill: '#fef2f2', stroke: '#ef4444', text: '#dc2626' };
}

// ── element renderers ─────────────────────────────────────────────────────────

// Compact "42м" / "1ч05" badge — renderElement has no lang prop, so this
// stays a plain minutes→hours formatter rather than full i18n.
function shortMin(min: number): string {
  if (min < 60) return `${min}м`;
  return `${Math.floor(min / 60)}ч${String(min % 60).padStart(2, '0')}`;
}

// Compact "185k" / "1.2M" money badge, currency-agnostic (UZS shown elsewhere).
function shortMoney(sum: number): string {
  if (sum >= 1_000_000) return `${(sum / 1_000_000).toFixed(1)}M`;
  if (sum >= 1_000) return `${Math.round(sum / 1000)}k`;
  return String(Math.round(sum));
}

type LiveInfo = { kind: 'live'; min: number; sum: number };
type RevenueInfo = { kind: 'revenue'; revenue: number; orders: number };

function renderElement(
  el: HallElement,
  selected: boolean,
  occ: number,
  isDark: boolean,
  onMouseDown: (e: React.MouseEvent) => void,
  onContextMenu: (e: React.MouseEvent) => void,
  info?: LiveInfo | RevenueInfo | null,
) {
  const isTable = el.type === 'rect_table' || el.type === 'round_table' || el.type === 'stool';
  const structFill   = isDark ? '#1a1a1e' : '#e8e4de';
  const structStroke = isDark ? '#2a2a30' : '#c5c0b8';
  const structText   = isDark ? '#444' : '#aaa7a0';
  const c = isTable ? occColor(occ, isDark) : { fill: structFill, stroke: structStroke, text: structText };
  const selStroke = selected ? '#6366f1' : c.stroke;
  const selStrokeW = selected ? 2 : 1;
  const rot = el.rotation ?? 0;

  function cx() {
    if (el.type === 'round_table' || el.type === 'stool') return el.cx ?? 0;
    return (el.x ?? 0) + (el.w ?? 80) / 2;
  }
  function cy() {
    if (el.type === 'round_table' || el.type === 'stool') return el.cy ?? 0;
    return (el.y ?? 0) + (el.h ?? 40) / 2;
  }
  const transform = rot !== 0 ? `rotate(${rot}, ${cx()}, ${cy()})` : undefined;

  const infoTitle = info == null ? undefined
    : info.kind === 'live' ? `${el.label}: ${shortMin(info.min)} · ${shortMoney(info.sum)} UZS`
    : `${el.label}: ${shortMoney(info.revenue)} UZS · ${info.orders} ${info.orders === 1 ? 'order' : 'orders'}`;
  const infoBadge = info == null ? undefined
    : info.kind === 'live' ? shortMin(info.min)
    : `${shortMoney(info.revenue)}${info.orders ? ` · ${info.orders}` : ''}`;

  if (el.type === 'rect_table') {
    const { x = 0, y = 0, w = 80, h = 40, label } = el;
    return (
      <g key={el.id} transform={transform} onMouseDown={onMouseDown} onContextMenu={onContextMenu} style={{ cursor: 'move' }}>
        <rect x={x} y={y} width={w} height={h} rx={3} fill={c.fill} stroke={selStroke} strokeWidth={selStrokeW}>
          {infoTitle && <title>{infoTitle}</title>}
        </rect>
        <text x={x + w / 2} y={y + h / 2 + (info ? -1 : 4)} textAnchor="middle" fill={c.text} fontSize={10} fontFamily="Onest" fontWeight={600}>{label}</text>
        {infoBadge && (
          <text x={x + w / 2} y={y + h / 2 + 10} textAnchor="middle" fill={c.text} fontSize={7} fontFamily="Onest" opacity={0.8}>
            {infoBadge}
          </text>
        )}
        {selected && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={5} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />}
      </g>
    );
  }

  if (el.type === 'round_table') {
    const { cx = 0, cy = 0, r = 28, label } = el;
    return (
      <g key={el.id} transform={transform} onMouseDown={onMouseDown} onContextMenu={onContextMenu} style={{ cursor: 'move' }}>
        <circle cx={cx} cy={cy} r={r} fill={c.fill} stroke={selStroke} strokeWidth={selStrokeW}>
          {infoTitle && <title>{infoTitle}</title>}
        </circle>
        <text x={cx} y={cy + (info ? -1 : 4)} textAnchor="middle" fill={c.text} fontSize={10} fontFamily="Onest" fontWeight={600}>{label}</text>
        {infoBadge && (
          <text x={cx} y={cy + 10} textAnchor="middle" fill={c.text} fontSize={7} fontFamily="Onest" opacity={0.8}>
            {infoBadge}
          </text>
        )}
        {selected && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />}
      </g>
    );
  }

  if (el.type === 'stool') {
    const { cx = 0, cy = 0, r = 10, label } = el;
    return (
      <g key={el.id} transform={transform} onMouseDown={onMouseDown} onContextMenu={onContextMenu} style={{ cursor: 'move' }}>
        <circle cx={cx} cy={cy} r={r} fill={c.fill} stroke={selStroke} strokeWidth={selStrokeW} />
        <text x={cx} y={cy + 3} textAnchor="middle" fill={c.text} fontSize={7} fontFamily="Onest" fontWeight={600}>{label}</text>
        {selected && <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.6} />}
      </g>
    );
  }

  if (el.type === 'wall') {
    const { x = 0, y = 0, w = 120, h = 14 } = el;
    return (
      <g key={el.id} transform={transform} onMouseDown={onMouseDown} onContextMenu={onContextMenu} style={{ cursor: 'move' }}>
        <rect x={x} y={y} width={w} height={h} rx={2} fill={structFill} stroke={selStroke} strokeWidth={selStrokeW} />
        {selected && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={4} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />}
      </g>
    );
  }

  if (el.type === 'bar') {
    const { x = 0, y = 0, w = 160, h = 50, label } = el;
    const barTop = isDark ? '#222228' : '#d8d3cc';
    return (
      <g key={el.id} transform={transform} onMouseDown={onMouseDown} onContextMenu={onContextMenu} style={{ cursor: 'move' }}>
        <rect x={x} y={y} width={w} height={h} rx={3} fill={structFill} stroke={selStroke} strokeWidth={selStrokeW} />
        <rect x={x} y={y} width={w} height={6} rx={2} fill={barTop} />
        <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fill={structText} fontSize={10} fontFamily="Onest" fontWeight={600} letterSpacing={3}>{label}</text>
        {selected && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={5} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />}
      </g>
    );
  }

  if (el.type === 'entrance') {
    const { x = 0, y = 0, w = 80, label } = el;
    return (
      <g key={el.id} transform={transform} onMouseDown={onMouseDown} onContextMenu={onContextMenu} style={{ cursor: 'move' }}>
        <line x1={x} y1={y} x2={x + (w ?? 80)} y2={y} stroke={selStroke} strokeWidth={2} strokeDasharray="6 3" />
        <text x={x + (w ?? 80) / 2} y={y + 14} textAnchor="middle" fill={c.text} fontSize={8} fontFamily="Onest" letterSpacing={2}>{label}</text>
        {selected && <rect x={x - 3} y={y - 8} width={(w ?? 80) + 6} height={26} rx={3} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />}
      </g>
    );
  }

  return null;
}

// ── props panel ───────────────────────────────────────────────────────────────

function PropsPanel({ el, section, onChange, onDelete }: {
  el: HallElement;
  section?: IikoSection;
  onChange: (updated: HallElement) => void;
  onDelete: () => void;
}) {
  const isTable = el.type === 'rect_table' || el.type === 'round_table' || el.type === 'stool';

  return (
    <div className="w-52 flex-shrink-0 border-l border-border bg-surface p-4 space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted font-semibold">Properties</span>
        <button onClick={onDelete} className="text-muted hover:text-red-400 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      <div>
        <label className="block text-[9px] uppercase tracking-[0.15em] text-muted mb-1">Label</label>
        <input
          value={el.label}
          onChange={e => onChange({ ...el, label: e.target.value })}
          className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-text text-[12px] focus:border-primary focus:outline-none"
        />
      </div>

      {isTable && (
        <div>
          <label className="block text-[9px] uppercase tracking-[0.15em] text-muted mb-1">Seats</label>
          <input
            type="number"
            min={1}
            max={20}
            value={el.seats}
            onChange={e => onChange({ ...el, seats: parseInt(e.target.value) || 1 })}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-text text-[12px] focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {isTable && (
        <div>
          <label className="block text-[9px] uppercase tracking-[0.15em] text-muted mb-1">iiko Table #</label>
          {section ? (
            <select
              value={el.iiko_table_number ?? ''}
              onChange={e => onChange({ ...el, iiko_table_number: e.target.value ? parseInt(e.target.value) : undefined })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-text text-[12px] focus:border-primary focus:outline-none"
            >
              <option value="">— unlinked —</option>
              {section.tables.map(t => (
                <option key={t.id} value={t.number}>#{t.number} {t.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              placeholder="iiko table number"
              value={el.iiko_table_number ?? ''}
              onChange={e => onChange({ ...el, iiko_table_number: e.target.value ? parseInt(e.target.value) : undefined })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-text text-[12px] focus:border-primary focus:outline-none"
            />
          )}
        </div>
      )}

      {(el.type === 'rect_table' || el.type === 'wall' || el.type === 'bar' || el.type === 'entrance') && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-muted mb-1">W</label>
            <input type="number" value={el.w ?? 80} onChange={e => onChange({ ...el, w: parseInt(e.target.value) || 80 })}
              className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-text text-[11px] focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="block text-[9px] text-muted mb-1">H</label>
            {el.type !== 'entrance' && (
              <input type="number" value={el.h ?? 40} onChange={e => onChange({ ...el, h: parseInt(e.target.value) || 14 })}
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-text text-[11px] focus:border-primary focus:outline-none" />
            )}
          </div>
        </div>
      )}

      {(el.type === 'round_table' || el.type === 'stool') && (
        <div>
          <label className="block text-[9px] text-muted mb-1">Radius</label>
          <input type="number" value={el.r ?? 28} min={8} onChange={e => onChange({ ...el, r: parseInt(e.target.value) || 8 })}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-text text-[12px] focus:border-primary focus:outline-none" />
        </div>
      )}

      {/* Rotation */}
      <div>
        <label className="block text-[9px] uppercase tracking-[0.15em] text-muted mb-1">Rotation</label>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onChange({ ...el, rotation: ((el.rotation ?? 0) - 45 + 360) % 360 })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors"
            title="-45°"
          >
            <RotateCcw size={12} />
          </button>
          <input
            type="number"
            min={0}
            max={359}
            value={el.rotation ?? 0}
            onChange={e => onChange({ ...el, rotation: parseInt(e.target.value) || 0 })}
            className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-text text-[11px] text-center focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => onChange({ ...el, rotation: ((el.rotation ?? 0) + 45) % 360 })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors"
            title="+45°"
          >
            <RotateCw size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main editor ───────────────────────────────────────────────────────────────

interface HallEditorProps {
  plan: HallPlan;
  section?: IikoSection;
  occupiedTableNumbers?: Set<number>;
  /** 0..1 per table number — when set, tables are colored by this heat instead of binary occupancy */
  tableHeat?: Map<number, number>;
  /** live info per occupied table number: minutes open + current sum */
  tableInfo?: Map<number, { min: number; sum: number }>;
  /** period revenue per table number — mutually exclusive with tableInfo, drives the badge + tooltip in revenue mode */
  revenueInfo?: Map<number, { revenue: number; orders: number }>;
  /** swaps the legend copy from occupancy language ("Free/Busy") to revenue language ("Low/Top") */
  legendMode?: 'occupancy' | 'revenue';
  onSave: (updated: HallPlan) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
  inline?: boolean;
  lang?: Language;
}

export function HallEditor({ plan, section, occupiedTableNumbers, tableHeat, tableInfo, revenueInfo, legendMode = 'occupancy', onSave, onClose, readOnly = false, inline = false, lang = 'ru' }: HallEditorProps) {
  const isDark = useIsDark();
  const [elements, setElements] = useState<HallElement[]>(plan.elements);
  const [planName, setPlanName] = useState(plan.name);
  const [tool, setTool] = useState<HallElementType | 'select'>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const selectedEl = elements.find(e => e.id === selectedId) ?? null;

  const getSvgPoint = useCallback((e: React.MouseEvent | MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === 'select' || readOnly) return;
    const { x, y } = getSvgPoint(e);
    const sx = SNAP(x);
    const sy = SNAP(y);

    const def = DEFAULTS[tool as HallElementType];
    const el: HallElement = {
      id: newId(),
      type: tool as HallElementType,
      label: def.label ?? '',
      seats: def.seats ?? 0,
      ...def,
    };

    const isCircle = tool === 'round_table' || tool === 'stool';
    if (isCircle) {
      el.cx = sx;
      el.cy = sy;
      delete el.x; delete el.y; delete el.w; delete el.h;
    } else {
      el.x = sx - (el.w ?? 80) / 2;
      el.y = sy - (el.h ?? 40) / 2;
      delete el.cx; delete el.cy; delete el.r;
    }

    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
    setTool('select');
    setDirty(true);
  }, [tool, getSvgPoint, readOnly]);

  const handleElementMouseDown = useCallback((elId: string, e: React.MouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    setSelectedId(elId);
    if (tool !== 'select') return;

    const { x, y } = getSvgPoint(e);
    const el = elements.find(el => el.id === elId);
    if (!el) return;

    const elX = el.type === 'round_table' || el.type === 'stool' ? (el.cx ?? 0) : (el.x ?? 0);
    const elY = el.type === 'round_table' || el.type === 'stool' ? (el.cy ?? 0) : (el.y ?? 0);
    dragRef.current = { id: elId, offX: x - elX, offY: y - elY };
  }, [tool, elements, getSvgPoint, readOnly]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const { x, y } = getSvgPoint(e);
    const sx = SNAP(x - dragRef.current.offX);
    const sy = SNAP(y - dragRef.current.offY);

    setElements(prev => prev.map(el => {
      if (el.id !== dragRef.current!.id) return el;
      if (el.type === 'round_table' || el.type === 'stool') {
        return { ...el, cx: sx, cy: sy };
      }
      return { ...el, x: sx, y: sy };
    }));
    setDirty(true);
  }, [getSvgPoint]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleContextMenu = useCallback((elId: string, e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setElements(prev => prev.filter(el => el.id !== elId));
    setSelectedId(null);
    setDirty(true);
  }, [readOnly]);

  const updateElement = useCallback((updated: HallElement) => {
    setElements(prev => prev.map(el => el.id === updated.id ? updated : el));
    setDirty(true);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setElements(prev => prev.filter(el => el.id !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        deleteSelected();
      }
      if (e.key === 'Escape') { setSelectedId(null); setTool('select'); }
      if ((e.key === 'r' || e.key === 'R') && selectedId) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        const delta = e.shiftKey ? -45 : 45;
        setElements(prev => prev.map(el =>
          el.id === selectedId ? { ...el, rotation: ((el.rotation ?? 0) + delta + 360) % 360 } : el
        ));
        setDirty(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, deleteSelected]);

  const handleSave = async () => {
    setSaving(true);
    setSaveErr('');
    try {
      await onSave({ ...plan, name: planName, elements });
      setDirty(false);
    } catch (e: any) {
      setSaveErr(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const TOOLS: Array<{ id: HallElementType | 'select'; icon: React.ReactNode; label: string }> = [
    { id: 'select',      icon: <LayoutGrid size={14} />,  label: 'Select' },
    { id: 'rect_table',  icon: <Square size={14} />,      label: 'Rect Table' },
    { id: 'round_table', icon: <Circle size={14} />,      label: 'Round Table' },
    { id: 'stool',       icon: <Circle size={11} />,      label: 'Bar Stool' },
    { id: 'wall',        icon: <Minus size={14} />,       label: 'Wall' },
    { id: 'bar',         icon: <Square size={14} />,      label: 'Bar Counter' },
    { id: 'entrance',    icon: <ArrowRight size={14} />,  label: 'Entrance' },
  ];

  // Read-only inline view: crop the canvas to the elements' bounding box so a
  // sparse plan (e.g. freshly auto-synced tables) doesn't render as a huge
  // empty field. The editor keeps the full fixed canvas.
  const fitViewBox = (() => {
    if (!(readOnly && inline) || elements.length === 0) return `0 0 ${W} ${H}`;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      if (el.type === 'round_table' || el.type === 'stool') {
        const r = el.r ?? 28;
        minX = Math.min(minX, (el.cx ?? 0) - r); maxX = Math.max(maxX, (el.cx ?? 0) + r);
        minY = Math.min(minY, (el.cy ?? 0) - r); maxY = Math.max(maxY, (el.cy ?? 0) + r);
      } else {
        minX = Math.min(minX, el.x ?? 0); maxX = Math.max(maxX, (el.x ?? 0) + (el.w ?? 80));
        minY = Math.min(minY, el.y ?? 0); maxY = Math.max(maxY, (el.y ?? 0) + (el.h ?? 40));
      }
    }
    const pad = 24;
    const bw = Math.max(maxX - minX + pad * 2, 240);
    const bh = Math.max(maxY - minY + pad * 2, 140);
    return `${minX - pad} ${minY - pad} ${bw} ${bh}`;
  })();
  const [fbX, fbY, fbW, fbH] = fitViewBox.split(' ').map(Number);

  const canvas = (
    <svg
      ref={svgRef}
      viewBox={fitViewBox}
      className="w-full h-auto"
      style={{ cursor: inline ? 'default' : tool === 'select' ? 'default' : 'crosshair', ...(readOnly && inline ? { maxHeight: 420 } : {}) }}
      onClick={handleSvgClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <rect x={fbX} y={fbY} width={fbW} height={fbH} fill={isDark ? '#0e0e12' : '#f7f5f2'} />
      {!inline && Array.from({ length: W / GRID - 1 }, (_, i) => (
        <line key={`gv${i}`} x1={(i + 1) * GRID} y1={0} x2={(i + 1) * GRID} y2={H} stroke={isDark ? '#1a1a1e' : '#e5e1db'} strokeWidth={0.5} />
      ))}
      {!inline && Array.from({ length: H / GRID - 1 }, (_, i) => (
        <line key={`gh${i}`} x1={0} y1={(i + 1) * GRID} x2={W} y2={(i + 1) * GRID} stroke={isDark ? '#1a1a1e' : '#e5e1db'} strokeWidth={0.5} />
      ))}
      <rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke={isDark ? '#222228' : '#d4cfc8'} strokeWidth={2} rx={2} />
      {elements.map(el => {
        const occ = el.iiko_table_number == null ? 0
          : tableHeat != null ? (tableHeat.get(el.iiko_table_number) ?? 0)
          : occupiedTableNumbers?.has(el.iiko_table_number) ? 0.9
          : 0;
        return renderElement(
          el,
          el.id === selectedId,
          occ,
          isDark,
          (e) => handleElementMouseDown(el.id, e),
          (e) => handleContextMenu(el.id, e),
          el.iiko_table_number == null ? null
            : revenueInfo ? (revenueInfo.get(el.iiko_table_number) ? { kind: 'revenue' as const, ...revenueInfo.get(el.iiko_table_number)! } : null)
            : tableInfo ? (tableInfo.get(el.iiko_table_number) ? { kind: 'live' as const, ...tableInfo.get(el.iiko_table_number)! } : null)
            : null,
        );
      })}
      {!inline && tool !== 'select' && (
        <text x={W / 2} y={H - 12} textAnchor="middle" fill={isDark ? '#333' : '#c5c0b8'} fontSize={9} fontFamily="Onest" letterSpacing={2}>
          CLICK TO PLACE · RIGHT-CLICK TO DELETE
        </text>
      )}
    </svg>
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 border-t border-border flex-shrink-0">
      {(legendMode === 'revenue' ? [
        { label: tr(lang, 'Нет данных', 'No data', "Ma'lumot yo'q"), color: isDark ? '#555' : '#c8c3bb' },
        { label: tr(lang, 'Низкая выручка', 'Low revenue', 'Past tushum'), color: '#22c55e' },
        { label: tr(lang, 'Средняя', 'Average', "O'rtacha"), color: '#f59e0b' },
        { label: tr(lang, 'Выше среднего', 'Above avg', "O'rtachadan yuqori"), color: '#ff6b35' },
        { label: tr(lang, 'Топ-стол', 'Top table', 'Eng yaxshi stol'), color: '#ef4444' },
      ] : [
        { label: tr(lang, 'Своб.', 'Free', "Bo'sh"), color: isDark ? '#555' : '#c8c3bb' },
        { label: tr(lang, 'Низкая', 'Low', 'Past'), color: '#22c55e' },
        { label: tr(lang, 'Средняя', 'Medium', "O'rta"), color: '#f59e0b' },
        { label: tr(lang, 'Занято', 'Busy', 'Band'), color: '#ff6b35' },
        { label: tr(lang, 'Полно', 'Full', "To'la"), color: '#ef4444' },
      ]).map(({ label, color }) => (
        <div key={label} className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[9px] text-muted uppercase tracking-[0.1em] whitespace-nowrap">{label}</span>
        </div>
      ))}
      {!readOnly && !inline && (
        <div className="flex-1" />
      )}
      {!readOnly && !inline && (
        <span className="text-[9px] text-muted">Drag to move · R to rotate 45° · Shift+R reverse · Del to delete</span>
      )}
    </div>
  );

  // ── Inline mode (read-only viewer for Operations) ─────────────────────────
  if (inline) {
    return (
      <div className="w-full">
        {canvas}
        {legend}
      </div>
    );
  }

  // ── Fullscreen editor mode ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-muted hover:text-text transition-colors">
            <X size={16} />
          </button>
          <input
            value={planName}
            readOnly={readOnly}
            onChange={e => { setPlanName(e.target.value); setDirty(true); }}
            className="text-[13px] font-semibold text-text bg-transparent focus:outline-none focus:bg-card-hover focus:px-2 rounded transition-all min-w-0 max-w-[200px]"
          />
          {dirty && !saveErr && <span className="text-[10px] text-amber-400 font-mono">unsaved</span>}
          {saveErr && <span className="text-[10px] text-red-400 font-mono">{saveErr}</span>}
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-[11px] font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              <Save size={12} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Toolbar */}
        {!readOnly && (
          <div className="w-14 border-r border-border flex flex-col items-center pt-3 gap-1.5 bg-surface flex-shrink-0">
            {TOOLS.map(t => (
              <button
                key={t.id}
                title={t.label}
                onClick={() => setTool(t.id)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors
                  ${tool === t.id ? 'bg-primary/20 text-primary' : 'text-muted hover:text-text hover:bg-card-hover'}`}
              >
                {t.icon}
              </button>
            ))}
            <div className="flex-1" />
            {selectedId && (
              <button
                title="Delete selected (Del)"
                onClick={deleteSelected}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors mb-2"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center bg-background overflow-auto p-4">
          <div style={{ width: '100%', maxWidth: W * 1.8 }}>
            {canvas}
          </div>
        </div>

        {/* Properties panel */}
        {selectedEl && !readOnly && (
          <PropsPanel
            el={selectedEl}
            section={section}
            onChange={updateElement}
            onDelete={deleteSelected}
          />
        )}
      </div>

      {legend}
    </div>
  );
}

