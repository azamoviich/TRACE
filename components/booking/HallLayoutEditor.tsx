import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Square, Circle, Save, Trash2, Copy, RotateCcw, RotateCw, Image as ImageIcon, X, Magnet,
  ZoomIn, ZoomOut, Settings2, Upload, Loader2, Download,
} from 'lucide-react';
import { Language } from '../../types';
import {
  bookingApi, BookingApiError, BookingHall, BookingTable, BookingTableDraft, BookingTableTag, BOOKING_TABLE_TAGS, PosTable,
  uploadPhoto, getSubdomain,
} from '../../services/traceApi';
import { FloorMap, FloorTable } from './FloorMap';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

type Toast = (message: string, type: 'success' | 'error' | 'info') => void;

// Editor-side table: a draft keyed by id (saved) or a client key (new).
type Draft = BookingTableDraft & { key: string };

const GRID = 10;
const MIN_SIZE = 20;
const MAX_PHOTOS = 5;

export const TAG_LABELS: Record<BookingTableTag, [string, string, string]> = {
  window:  ['У окна', 'Window', 'Deraza yonida'],
  terrace: ['Терраса', 'Terrace', 'Terrasa'],
  sofa:    ['Диван', 'Sofa', 'Divan'],
  smoking: ['Для курящих', 'Smoking', 'Chekish mumkin'],
  kids:    ['Детский', 'Kids', 'Bolalar uchun'],
};

function toDraft(t: BookingTable): Draft {
  const { hall_id: _h, is_active: _a, ...rest } = t;
  return { ...rest, key: t.id };
}

function snap(v: number, on: boolean): number {
  return on ? Math.round(v / GRID) * GRID : Math.round(v);
}

// Client-side key for a table that has no database id yet. Deliberately not
// crypto.randomUUID — that only exists on HTTPS/localhost pages.
let keySeq = 0;
function newKey(): string {
  return `new-${Date.now().toString(36)}-${(keySeq++).toString(36)}`;
}

function normAngle(a: number): number {
  return ((Math.round(a) % 360) + 360) % 360;
}

// Next free numeric name: "1", "2", ... skipping ones already used anywhere.
function nextName(used: Set<string>): string {
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}

interface Props {
  lang: Language;
  onShowToast: Toast;
  readOnly?: boolean;         // hostess: sees the floor, can't change it
}

export function HallLayoutEditor({ lang, onShowToast, readOnly = false }: Props) {
  const [halls, setHalls] = useState<BookingHall[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activeHallId, setActiveHallId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [hallSettingsOpen, setHallSettingsOpen] = useState(false);
  // The POS's dining tables for linking (iiko); stays null when the API refuses (other POS) or has no hall list yet.
  const [posTables, setPosTables] = useState<PosTable[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    if (readOnly) return;
    bookingApi.posTables.list().then(setPosTables).catch(() => setPosTables(null));
  }, [readOnly]);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<null | {
    mode: 'move' | 'resize' | 'rotate';
    key: string;
    pointerId: number;
    start: { x: number; y: number };
    orig: Draft;
    moved: boolean;
  }>(null);

  const activeHall = halls?.find(h => h.id === activeHallId) ?? null;
  const selected = drafts.find(d => d.key === selectedKey) ?? null;

  // ── loading ───────────────────────────────────────────────────────────────

  const load = useCallback(async (keepHallId?: string | null) => {
    try {
      const list = await bookingApi.halls.list();
      setHalls(list);
      const id = keepHallId && list.some(h => h.id === keepHallId) ? keepHallId : list[0]?.id ?? null;
      setActiveHallId(id);
      setDrafts((list.find(h => h.id === id)?.tables ?? []).map(toDraft));
      setDeletedIds([]);
      setDirty(false);
      setSelectedKey(null);
      setLoadError('');
    } catch (e) {
      const err = e as BookingApiError;
      setLoadError(err.status === 400 && err.message
        ? err.message
        : tr(lang, 'Не удалось загрузить залы', 'Failed to load halls', "Zallarni yuklab bo'lmadi"));
      setHalls([]);
    }
  }, [lang]);

  useEffect(() => { load(); }, []);

  // Unsaved layout must not be lost to a stray tab close.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const confirmDiscard = () => !dirty || window.confirm(tr(lang,
    'Есть несохранённые изменения. Выйти без сохранения?',
    'You have unsaved changes. Leave without saving?',
    "Saqlanmagan o'zgarishlar bor. Saqlamasdan chiqilsinmi?"));

  const switchHall = (id: string) => {
    if (id === activeHallId || !confirmDiscard()) return;
    setActiveHallId(id);
    setDrafts((halls?.find(h => h.id === id)?.tables ?? []).map(toDraft));
    setDeletedIds([]);
    setDirty(false);
    setSelectedKey(null);
  };

  // ── draft edits ───────────────────────────────────────────────────────────

  const updateDraft = useCallback((key: string, patch: Partial<Draft>) => {
    setDrafts(prev => prev.map(d => d.key === key ? { ...d, ...patch } : d));
    setDirty(true);
  }, []);

  const usedNames = useMemo(() => {
    const s = new Set<string>();
    for (const h of halls ?? []) if (h.id !== activeHallId) h.tables.forEach(t => s.add(t.name));
    drafts.forEach(d => s.add(d.name));
    return s;
  }, [halls, drafts, activeHallId]);

  // New tables land on the first free grid spot, scanning from the top-left.
  const freeSpot = (w: number, h: number): { x: number; y: number } => {
    const hall = activeHall!;
    const step = 20;
    // Start 50 down so the rotate handle above the table stays on the canvas.
    for (let y = 50; y + h < hall.height - 10; y += step) {
      for (let x = 30; x + w < hall.width - 10; x += step) {
        const clash = drafts.some(d => x < d.x + d.w + 25 && d.x < x + w + 25 && y < d.y + d.h + 25 && d.y < y + h + 25);
        if (!clash) return { x, y };
      }
    }
    return { x: hall.width / 2 - w / 2, y: hall.height / 2 - h / 2 };
  };

  const addTable = (shape: 'rect' | 'circle') => {
    if (!activeHall) return;
    const w = shape === 'circle' ? 70 : 90;
    const h = shape === 'circle' ? 70 : 60;
    const { x, y } = freeSpot(w, h);
    const key = newKey();
    const d: Draft = {
      key, client_id: key, name: nextName(usedNames), seats: 4, min_guests: 1, shape,
      x, y, w, h, rotation: 0, photos: [], tags: [], is_bookable: true, pos_table_id: null,
    };
    setDrafts(prev => [...prev, d]);
    setSelectedKey(key);
    setDirty(true);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const key = newKey();
    const { id: _id, ...rest } = selected;
    const d: Draft = {
      ...rest, key, client_id: key, name: nextName(usedNames),
      x: Math.min(selected.x + 30, activeHall!.width - selected.w), y: Math.min(selected.y + 30, activeHall!.height - selected.h),
      photos: [...selected.photos], tags: [...selected.tags],
    };
    setDrafts(prev => [...prev, d]);
    setSelectedKey(key);
    setDirty(true);
  };

  const deleteSelected = () => {
    if (!selected) return;
    if (selected.id) setDeletedIds(prev => [...prev, selected.id!]);
    setDrafts(prev => prev.filter(d => d.key !== selected.key));
    setSelectedKey(null);
    setDirty(true);
  };

  // ── pointer interaction (mouse + touch) ───────────────────────────────────

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const beginDrag = (mode: 'move' | 'resize' | 'rotate', key: string, e: React.PointerEvent) => {
    if (readOnly) { setSelectedKey(key); return; }
    e.stopPropagation();
    e.preventDefault();
    const d = drafts.find(x => x.key === key);
    if (!d) return;
    setSelectedKey(key);
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { mode, key, pointerId: e.pointerId, start: toSvg(e), orig: { ...d }, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !activeHall) return;
    const p = toSvg(e);
    const o = drag.orig;
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return; // a tap, not a drag
    drag.moved = true;

    if (drag.mode === 'move') {
      const x = Math.min(Math.max(snap(o.x + dx, snapOn), -o.w / 2), activeHall.width - o.w / 2);
      const y = Math.min(Math.max(snap(o.y + dy, snapOn), -o.h / 2), activeHall.height - o.h / 2);
      updateDraft(drag.key, { x, y });
    } else if (drag.mode === 'rotate') {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      let angle = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
      if (snapOn) angle = Math.round(angle / 15) * 15;
      updateDraft(drag.key, { rotation: normAngle(angle) });
    } else {
      // Resize from the bottom-right handle in the table's own rotated frame,
      // keeping its top-left corner (in that frame) fixed.
      const rad = o.rotation * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const cx0 = o.x + o.w / 2, cy0 = o.y + o.h / 2;
      const lx = (p.x - cx0) * cos + (p.y - cy0) * sin;   // pointer in local frame
      const ly = -(p.x - cx0) * sin + (p.y - cy0) * cos;
      let w = Math.max(MIN_SIZE, snap(lx + o.w / 2, snapOn));
      let h = Math.max(MIN_SIZE, snap(ly + o.h / 2, snapOn));
      if (o.shape === 'circle') { const s = Math.max(w, h); w = s; h = s; }
      // New centre in local frame, rotated back to hall coordinates.
      const lcx = -o.w / 2 + w / 2, lcy = -o.h / 2 + h / 2;
      const ncx = cx0 + lcx * cos - lcy * sin;
      const ncy = cy0 + lcx * sin + lcy * cos;
      updateDraft(drag.key, { w, h, x: Math.round(ncx - w / 2), y: Math.round(ncy - h / 2) });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  };

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') { setSelectedKey(null); return; }
      if (!selected) return;
      const step = e.altKey ? 1 : GRID;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); updateDraft(selected.key, { x: selected.x - step }); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); updateDraft(selected.key, { x: selected.x + step }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); updateDraft(selected.key, { y: selected.y - step }); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); updateDraft(selected.key, { y: selected.y + step }); }
      else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        updateDraft(selected.key, { rotation: normAngle(selected.rotation + (e.shiftKey ? -15 : 15)) });
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'в')) { e.preventDefault(); duplicateSelected(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── save ──────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!activeHall) return;
    // Hostess/guest refer to tables by name — it must be unique restaurant-wide.
    const seen = new Map<string, number>();
    for (const h of halls ?? []) if (h.id !== activeHall.id) h.tables.forEach(t => seen.set(t.name.trim().toLowerCase(), 1));
    for (const d of drafts) {
      const n = d.name.trim().toLowerCase();
      if (!n) { setSelectedKey(d.key); onShowToast(tr(lang, 'У стола нет номера', 'A table has no name', 'Stol raqami yo‘q'), 'error'); return; }
      if (seen.has(n)) { setSelectedKey(d.key); onShowToast(tr(lang, `Номер «${d.name}» уже используется`, `Name "${d.name}" is already used`, `«${d.name}» raqami band`), 'error'); return; }
      seen.set(n, 1);
      if (d.min_guests > d.seats) { setSelectedKey(d.key); onShowToast(tr(lang, `Стол «${d.name}»: минимум гостей больше числа мест`, `Table "${d.name}": min guests exceeds seats`, `«${d.name}» stoli: minimal mehmonlar o'rindiqlardan ko'p`), 'error'); return; }
    }

    setSaving(true);
    try {
      const payload: BookingTableDraft[] = drafts.map(({ key: _k, ...d }) => ({
        ...d, x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h), name: d.name.trim(),
      }));
      const res = await bookingApi.halls.saveLayout(activeHall.id, payload, deletedIds);
      // Keep the selection on the same table after new ones get real ids.
      const newSelected = selectedKey && res.created[selectedKey] ? res.created[selectedKey] : selectedKey;
      setHalls(prev => prev?.map(h => h.id === activeHall.id ? { ...h, tables: res.tables } : h) ?? prev);
      setDrafts(res.tables.map(toDraft));
      setDeletedIds([]);
      setDirty(false);
      setSelectedKey(newSelected);
      onShowToast(tr(lang, 'Схема зала сохранена', 'Floor plan saved', 'Zal sxemasi saqlandi'), 'success');
    } catch (e) {
      onShowToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── halls ─────────────────────────────────────────────────────────────────

  const createHall = async () => {
    if (!confirmDiscard()) return;
    const name = window.prompt(tr(lang, 'Название зала', 'Hall name', 'Zal nomi'), halls?.length ? '' : tr(lang, 'Основной зал', 'Main hall', 'Asosiy zal'));
    if (!name?.trim()) return;
    try {
      const hall = await bookingApi.halls.create({ name: name.trim(), sort_order: halls?.length ?? 0 });
      setHalls(prev => [...(prev ?? []), hall]);
      setActiveHallId(hall.id);
      setDrafts([]);
      setDeletedIds([]);
      setDirty(false);
      setSelectedKey(null);
    } catch (e) {
      onShowToast((e as Error).message, 'error');
    }
  };

  const updateHall = async (patch: Partial<Pick<BookingHall, 'name' | 'width' | 'height' | 'background_image'>>) => {
    if (!activeHall) return;
    try {
      const updated = await bookingApi.halls.update(activeHall.id, patch);
      setHalls(prev => prev?.map(h => h.id === activeHall.id ? { ...h, ...updated, tables: h.tables } : h) ?? prev);
    } catch (e) {
      onShowToast((e as Error).message, 'error');
    }
  };

  const deleteHall = async () => {
    if (!activeHall) return;
    if (!window.confirm(tr(lang, `Удалить зал «${activeHall.name}» со всеми столами?`, `Delete hall "${activeHall.name}" with all its tables?`, `«${activeHall.name}» zali barcha stollari bilan o'chirilsinmi?`))) return;
    try {
      await bookingApi.halls.remove(activeHall.id);
      setHallSettingsOpen(false);
      await load(null);
    } catch (e) {
      const err = e as BookingApiError;
      onShowToast(err.code === 'in_use'
        ? tr(lang, 'У столов этого зала есть брони — удалить нельзя. Отключите столы вместо удаления.', 'Tables in this hall have reservations — cannot delete. Disable the tables instead.', "Bu zal stollarida bronlar bor — o'chirib bo'lmaydi.")
        : err.message, 'error');
    }
  };

  const importPlans = () => { if (confirmDiscard()) setImportOpen(true); };
  const importDialog = importOpen && (
    <ImportPlansDialog lang={lang} onShowToast={onShowToast} onClose={() => setImportOpen(false)}
      onDone={() => { setImportOpen(false); load(activeHallId); }} />
  );

  // ── render ────────────────────────────────────────────────────────────────

  if (halls === null) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted" size={22} /></div>;
  }

  if (loadError) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-[13px] text-muted">{loadError}</div>;
  }

  if (halls.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center max-w-[520px] mx-auto">
        <h3 className="text-[16px] font-semibold text-text mb-2">{tr(lang, 'Схема зала ещё не создана', 'No floor plan yet', 'Zal sxemasi hali yaratilmagan')}</h3>
        {readOnly ? (
          <p className="text-[13px] text-muted">{tr(lang, 'Схему зала настраивает владелец или менеджер.', 'The owner or manager sets up the floor plan.', 'Zal sxemasini egasi yoki menejer sozlaydi.')}</p>
        ) : (
          <>
            <p className="text-[13px] text-muted mb-5">{tr(lang,
              'Расставьте столы один раз — эта схема будет у гостей на странице бронирования и у хостес.',
              'Place your tables once — this plan is used on the guest booking page and by the hostess.',
              "Stollarni bir marta joylashtiring — bu sxema mehmonlar sahifasida va xostesda ishlatiladi.")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={createHall} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-semibold hover:bg-primary-hover transition-colors">
                <Plus size={14} /> {tr(lang, 'Создать зал', 'Create hall', 'Zal yaratish')}
              </button>
              <button onClick={importPlans} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-background text-text text-[13px] font-semibold hover:border-primary/50 transition-colors">
                <Download size={14} /> {tr(lang, 'Импортировать из текущей схемы', 'Import existing floor plan', 'Mavjud sxemadan import')}
              </button>
            </div>
          </>
        )}
        {importDialog}
      </div>
    );
  }

  const floorTables: FloorTable[] = drafts;

  return (
    <div className="space-y-3">
      {/* Halls row */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {halls.map(h => (
          <button key={h.id} onClick={() => switchHall(h.id)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${h.id === activeHallId ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'}`}>
            {h.name}
          </button>
        ))}
        {!readOnly && (
          <button onClick={createHall} title={tr(lang, 'Добавить зал', 'Add hall', "Zal qo'shish")}
            className="px-3 py-2 rounded-xl text-[13px] font-semibold bg-card text-muted hover:text-text flex items-center gap-1">
            <Plus size={14} /> {tr(lang, 'Зал', 'Hall', 'Zal')}
          </button>
        )}
        {!readOnly && (
          <button onClick={importPlans} title={tr(lang, 'Импорт залов из схемы iiko', 'Import halls from the iiko plan', 'iiko sxemasidan zallarni import')}
            className="px-3 py-2 rounded-xl text-[13px] font-semibold bg-card text-muted hover:text-text flex items-center gap-1">
            <Download size={14} /> {tr(lang, 'Импорт', 'Import', 'Import')}
          </button>
        )}
      </div>
      {importDialog}

      {/* Toolbar */}
      {!readOnly && activeHall && (
        <div className="flex flex-wrap items-center gap-2">
          <ToolButton onClick={() => addTable('rect')} icon={<Square size={14} />} label={tr(lang, 'Прямоугольный', 'Rectangle', "To'rtburchak")} />
          <ToolButton onClick={() => addTable('circle')} icon={<Circle size={14} />} label={tr(lang, 'Круглый', 'Round', 'Dumaloq')} />
          <div className="w-px h-6 bg-border mx-1" />
          <ToolButton onClick={() => setSnapOn(v => !v)} active={snapOn} icon={<Magnet size={14} />} label={tr(lang, 'Сетка', 'Snap', "To'r")} />
          <ToolButton onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} icon={<ZoomOut size={14} />} />
          <span className="text-[12px] text-muted w-10 text-center">{Math.round(zoom * 100)}%</span>
          <ToolButton onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} icon={<ZoomIn size={14} />} />
          <ToolButton onClick={() => setHallSettingsOpen(v => !v)} active={hallSettingsOpen} icon={<Settings2 size={14} />} label={tr(lang, 'Зал', 'Hall', 'Zal')} />
          <div className="flex-1" />
          {dirty && <span className="text-[12px] text-amber-500 font-medium">{tr(lang, 'Не сохранено', 'Unsaved', 'Saqlanmagan')}</span>}
          <button onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-semibold disabled:opacity-40 hover:bg-primary-hover transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {tr(lang, 'Сохранить', 'Save', 'Saqlash')}
          </button>
        </div>
      )}

      {hallSettingsOpen && activeHall && !readOnly && (
        <HallSettings lang={lang} hall={activeHall} onChange={updateHall} onDelete={deleteHall} onShowToast={onShowToast} onClose={() => setHallSettingsOpen(false)} />
      )}

      {activeHall && (
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 min-w-0 rounded-2xl border border-border bg-card overflow-auto" style={{ maxHeight: '75vh' }}>
            <div style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? undefined : '100%' }}>
              <FloorMap
                svgRef={svgRef}
                hall={activeHall}
                tables={floorTables}
                selectedKey={selectedKey}
                grid={!readOnly && snapOn ? GRID * 2 : false}
                onTablePointerDown={(key, e) => beginDrag('move', key, e)}
                onBackgroundPointerDown={() => setSelectedKey(null)}
                onPointerMove={readOnly ? undefined : onPointerMove}
                onPointerUp={readOnly ? undefined : onPointerUp}
                renderSelection={readOnly ? undefined : t => <SelectionHandles table={t} onBegin={(mode, e) => beginDrag(mode, t.key, e)} />}
              />
            </div>
          </div>

          {selected && (
            <TablePanel
              lang={lang}
              table={selected}
              readOnly={readOnly}
              posTables={posTables}
              onChange={patch => updateDraft(selected.key, patch)}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              onClose={() => setSelectedKey(null)}
              onShowToast={onShowToast}
            />
          )}
        </div>
      )}

      {!readOnly && (
        <p className="text-[11px] text-muted">
          {tr(lang,
            'Перетаскивайте столы · угол — размер · кружок сверху — поворот · R — поворот на 15° · стрелки — сдвиг · Del — удалить · Ctrl+D — копия. Пунктир — стол не доступен для онлайн-брони.',
            'Drag tables · corner resizes · top dot rotates · R rotates 15° · arrows nudge · Del deletes · Ctrl+D duplicates. Dashed outline — not bookable online.',
            "Stollarni suring · burchak — o'lcham · tepadagi nuqta — burish · R — 15° · strelkalar — siljitish · Del — o'chirish · Ctrl+D — nusxa. Punktir — onlayn band qilib bo'lmaydi.")}
        </p>
      )}
    </div>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────

// Pick which of the old analytics floor plans become booking halls. iiko also
// keeps takeaway / delivery / staff "halls" — those start unchecked.
function ImportPlansDialog({ lang, onShowToast, onClose, onDone }: {
  lang: Language; onShowToast: Toast; onClose: () => void; onDone: () => void;
}) {
  const [plans, setPlans] = useState<Array<{ id: string; name: string; tables: number; virtual: boolean; imported: boolean }> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bookingApi.importHallPlans.list()
      .then(list => { setPlans(list); setPicked(new Set(list.filter(p => !p.virtual && !p.imported && p.tables > 0).map(p => p.id))); })
      .catch(e => { onShowToast((e as Error).message, 'error'); onClose(); });
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const r = await bookingApi.importHallPlans.run([...picked]);
      onShowToast(tr(lang,
        `Импортировано: залов ${r.halls}, столов ${r.tables} (связано с iiko: ${r.linked})`,
        `Imported ${r.halls} halls, ${r.tables} tables (linked to iiko: ${r.linked})`,
        `Import qilindi: ${r.halls} zal, ${r.tables} stol (iiko bilan bog‘landi: ${r.linked})`), 'success');
      onDone();
    } catch (e) {
      onShowToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onPointerDown={onClose}>
      <div onPointerDown={e => e.stopPropagation()} className="w-full sm:max-w-[460px] max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-card p-4 space-y-3 text-left">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold text-text">{tr(lang, 'Какие залы перенести в бронирование?', 'Which halls go to booking?', 'Qaysi zallarni bronga o‘tkazamiz?')}</span>
          <button onClick={onClose} className="p-1 text-muted hover:text-text"><X size={16} /></button>
        </div>
        <p className="text-[12px] text-muted">{tr(lang,
          'Вынос, доставку, агрегаторы и стафф-стол переносить не нужно — гости их не бронируют.',
          'Takeaway, delivery, aggregators and staff tables are not needed — guests don’t book them.',
          'Olib ketish, yetkazib berish, agregatorlar va xodimlar stoli kerak emas — mehmonlar ularni band qilmaydi.')}</p>
        {!plans ? <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-muted" /></div>
          : plans.length === 0 ? <p className="text-[13px] text-muted py-3">{tr(lang, 'Старых схем зала не найдено — создайте зал вручную.', 'No existing floor plans — create a hall manually.', 'Eski sxemalar topilmadi — zalni qo‘lda yarating.')}</p>
          : (
            <div className="space-y-1">
              {plans.map(p => (
                <label key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${p.imported ? 'opacity-50' : 'cursor-pointer hover:bg-background'}`}>
                  <input type="checkbox" className="w-4 h-4 accent-primary" disabled={p.imported} checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="flex-1 text-[13px] text-text">{p.name}</span>
                  <span className="text-[12px] text-muted">
                    {p.imported ? tr(lang, 'уже есть', 'already added', 'allaqachon bor')
                      : p.virtual ? tr(lang, 'вынос/доставка', 'takeaway/delivery', 'olib ketish/yetkazish')
                      : `${p.tables} ${tr(lang, 'стол.', 'tables', 'stol')}`}
                  </span>
                </label>
              ))}
            </div>
          )}
        <button onClick={run} disabled={busy || picked.size === 0}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-[13px] font-semibold disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {tr(lang, `Перенести (${picked.size})`, `Import (${picked.size})`, `O‘tkazish (${picked.size})`)}
        </button>
      </div>
    </div>
  );
}

function ToolButton({ onClick, icon, label, active }: { onClick: () => void; icon: React.ReactNode; label?: string; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium border transition-colors ${active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-text hover:border-primary/40'}`}>
      {icon}{label && <span>{label}</span>}
    </button>
  );
}

// Resize (bottom-right) and rotate (above the top edge) handles, drawn in the
// table's own rotated frame by FloorMap.
function SelectionHandles({ table, onBegin }: { table: FloorTable; onBegin: (mode: 'resize' | 'rotate', e: React.PointerEvent) => void }) {
  const hw = table.w / 2, hh = table.h / 2;
  const handle = { fill: '#fff', style: { stroke: 'rgb(var(--color-primary))' }, strokeWidth: 2 };
  return (
    <g>
      <line x1={0} y1={-hh} x2={0} y2={-hh - 22} strokeWidth={1.5} style={{ stroke: 'rgb(var(--color-primary))' }} />
      <circle cx={0} cy={-hh - 26} r={8} {...handle} style={{ ...handle.style, cursor: 'grab' }}
        onPointerDown={e => { e.stopPropagation(); onBegin('rotate', e); }} />
      <rect x={hw - 8} y={hh - 8} width={16} height={16} rx={3} {...handle} style={{ ...handle.style, cursor: 'nwse-resize' }}
        onPointerDown={e => { e.stopPropagation(); onBegin('resize', e); }} />
    </g>
  );
}

const inputCls = 'w-full bg-background border border-border rounded-lg px-2.5 py-2 text-text text-[13px] focus:border-primary focus:outline-none';
const labelCls = 'block text-[10px] uppercase tracking-[0.12em] text-muted mb-1 font-medium';

function NumberField({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  // Local text state so a half-typed value ("" or "1") isn't clamped mid-typing.
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="number" inputMode="numeric" min={min} max={max} value={text} disabled={disabled}
        onChange={e => {
          setText(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setText(String(value))}
        className={inputCls} />
    </div>
  );
}

function TablePanel({ lang, table, readOnly, posTables, onChange, onDelete, onDuplicate, onClose, onShowToast }: {
  lang: Language;
  table: Draft;
  readOnly: boolean;
  posTables: PosTable[] | null;   // iiko tenants; null = no POS table list
  onChange: (patch: Partial<Draft>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  onShowToast: Toast;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - table.photos.length;
    const list = Array.from(files).slice(0, room);
    if (list.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of list) urls.push(await uploadPhoto(getSubdomain(), f, 'booking-table'));
      onChange({ photos: [...table.photos, ...urls].slice(0, MAX_PHOTOS) });
    } catch {
      onShowToast(tr(lang, 'Не удалось загрузить фото', 'Photo upload failed', "Rasmni yuklab bo'lmadi"), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleTag = (tag: BookingTableTag) =>
    onChange({ tags: table.tags.includes(tag) ? table.tags.filter(t => t !== tag) : [...table.tags, tag] });

  return (
    <div className="lg:w-72 flex-shrink-0 rounded-2xl border border-border bg-card p-4 space-y-3 self-start">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-text">{tr(lang, 'Стол', 'Table', 'Stol')} {table.name}</span>
        <button onClick={onClose} className="text-muted hover:text-text"><X size={15} /></button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className={labelCls}>{tr(lang, 'Номер / название', 'Number / name', 'Raqam / nom')}</label>
          <input value={table.name} maxLength={50} disabled={readOnly} onChange={e => onChange({ name: e.target.value })} className={inputCls} />
        </div>
        <NumberField label={tr(lang, 'Мест', 'Seats', "O'rindiq")} value={table.seats} min={1} max={100} disabled={readOnly}
          onChange={n => onChange({ seats: n, min_guests: Math.min(table.min_guests, n) })} />
        <NumberField label={tr(lang, 'Мин. гостей', 'Min guests', 'Min. mehmon')} value={table.min_guests} min={1} max={table.seats} disabled={readOnly}
          onChange={n => onChange({ min_guests: n })} />
      </div>

      {!readOnly && posTables && (
        <div>
          <label className={labelCls}>{tr(lang, 'Стол в iiko', 'iiko table', 'iiko’dagi stol')}</label>
          <select value={table.pos_table_id ?? ''} onChange={e => onChange({ pos_table_id: e.target.value || null })} className={inputCls}>
            <option value="">{tr(lang, '— не связан —', '— not linked —', '— bog‘lanmagan —')}</option>
            {[...new Set(posTables.map(p => p.hall))].map(hall => (
              <optgroup key={hall} label={hall}>
                {posTables.filter(p => p.hall === hall).map(p => (
                  <option key={p.id} value={p.id}>
                    №{p.number}{p.title && p.title !== p.number ? ` · ${p.title}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
            {table.pos_table_id && !posTables.some(p => p.id === table.pos_table_id) && (
              <option value={table.pos_table_id}>{tr(lang, 'нет в iiko', 'missing in iiko', 'iiko’da yo‘q')} (id {table.pos_table_id})</option>
            )}
          </select>
        </div>
      )}

      {!readOnly && (
        <>
          <div>
            <label className={labelCls}>{tr(lang, 'Форма', 'Shape', 'Shakl')}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['rect', 'circle'] as const).map(s => (
                <button key={s} onClick={() => onChange(s === 'circle'
                  ? { shape: s, w: Math.max(table.w, table.h), h: Math.max(table.w, table.h) }
                  : { shape: s })}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[12px] font-medium ${table.shape === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:text-text'}`}>
                  {s === 'rect' ? <Square size={13} /> : <Circle size={13} />}
                  {s === 'rect' ? tr(lang, 'Прямоуг.', 'Rect', "To'rtb.") : tr(lang, 'Круглый', 'Round', 'Dumaloq')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label={tr(lang, 'Ширина', 'Width', 'Eni')} value={Math.round(table.w)} min={MIN_SIZE} max={2000}
              onChange={n => onChange(table.shape === 'circle' ? { w: n, h: n } : { w: n })} />
            <NumberField label={tr(lang, 'Высота', 'Height', "Bo'yi")} value={Math.round(table.h)} min={MIN_SIZE} max={2000}
              onChange={n => onChange(table.shape === 'circle' ? { w: n, h: n } : { h: n })} />
          </div>

          <div>
            <label className={labelCls}>{tr(lang, 'Поворот', 'Rotation', 'Burish')}</label>
            <div className="flex items-center gap-1.5">
              <button onClick={() => onChange({ rotation: normAngle(table.rotation - 15) })} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-text"><RotateCcw size={13} /></button>
              <input type="number" value={table.rotation} min={0} max={359}
                onChange={e => onChange({ rotation: normAngle(parseInt(e.target.value, 10) || 0) })}
                className={`${inputCls} text-center`} />
              <button onClick={() => onChange({ rotation: normAngle(table.rotation + 15) })} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-text"><RotateCw size={13} /></button>
            </div>
          </div>
        </>
      )}

      <div>
        <label className={labelCls}>{tr(lang, 'Особенности', 'Features', 'Xususiyatlar')}</label>
        <div className="flex flex-wrap gap-1.5">
          {BOOKING_TABLE_TAGS.map(tag => {
            const on = table.tags.includes(tag);
            const [ru, en, uz] = TAG_LABELS[tag];
            return (
              <button key={tag} disabled={readOnly} onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-full border text-[12px] ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:text-text'}`}>
                {tr(lang, ru, en, uz)}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center justify-between gap-2 cursor-pointer">
        <span className="text-[13px] text-text">{tr(lang, 'Доступен для онлайн-брони', 'Bookable online', 'Onlayn band qilish mumkin')}</span>
        <input type="checkbox" checked={table.is_bookable} disabled={readOnly} onChange={e => onChange({ is_bookable: e.target.checked })} className="w-4 h-4 accent-primary" />
      </label>

      {/* Free-text fallback when the POS table list is unavailable. */}
      {!readOnly && !posTables && (
        <div>
          <label className={labelCls}>{tr(lang, 'Номер стола в кассе', 'POS table number', 'Kassadagi stol raqami')}</label>
          <input value={table.pos_table_id ?? ''} maxLength={100} placeholder={tr(lang, 'необязательно', 'optional', 'ixtiyoriy')}
            onChange={e => onChange({ pos_table_id: e.target.value.trim() || null })} className={inputCls} />
        </div>
      )}

      <div>
        <label className={labelCls}>{tr(lang, 'Фото', 'Photos', 'Rasmlar')} ({table.photos.length}/{MAX_PHOTOS})</label>
        <div className="grid grid-cols-3 gap-1.5">
          {table.photos.map((url, i) => (
            <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-border">
              <img src={url} alt="" className="w-full h-full object-cover" />
              {!readOnly && (
                <button onClick={() => onChange({ photos: table.photos.filter((_, j) => j !== i) })}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={11} /></button>
              )}
            </div>
          ))}
          {!readOnly && table.photos.length < MAX_PHOTOS && (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="aspect-square rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-muted hover:text-text hover:border-primary/50 text-[11px] gap-1">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
              {tr(lang, 'Добавить', 'Add', "Qo'shish")}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => addPhotos(e.target.files)} />
      </div>

      {!readOnly && (
        <div className="flex gap-2 pt-1">
          <button onClick={onDuplicate} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-[12px] text-text hover:border-primary/40">
            <Copy size={13} /> {tr(lang, 'Копия', 'Duplicate', 'Nusxa')}
          </button>
          <button onClick={onDelete} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-[12px] text-red-500 hover:border-red-400">
            <Trash2 size={13} /> {tr(lang, 'Удалить', 'Delete', "O'chirish")}
          </button>
        </div>
      )}
      {!readOnly && (
        <p className="text-[11px] text-muted">{tr(lang, 'Изменения вступят в силу после «Сохранить».', 'Changes apply after "Save".', "O'zgarishlar «Saqlash»dan keyin kuchga kiradi.")}</p>
      )}
    </div>
  );
}

function HallSettings({ lang, hall, onChange, onDelete, onShowToast, onClose }: {
  lang: Language;
  hall: BookingHall;
  onChange: (patch: Partial<Pick<BookingHall, 'name' | 'width' | 'height' | 'background_image'>>) => Promise<void>;
  onDelete: () => void;
  onShowToast: Toast;
  onClose: () => void;
}) {
  const [name, setName] = useState(hall.name);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(hall.name); }, [hall.id, hall.name]);

  const uploadPlan = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(getSubdomain(), file, 'booking-plan');
      // Match the canvas to the plan's proportions so it isn't letterboxed.
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode().catch(() => {});
      const patch: Partial<BookingHall> = { background_image: url };
      if (img.naturalWidth && img.naturalHeight) {
        patch.height = Math.max(100, Math.min(10000, Math.round(hall.width * img.naturalHeight / img.naturalWidth)));
      }
      URL.revokeObjectURL(img.src);
      await onChange(patch);
    } catch {
      onShowToast(tr(lang, 'Не удалось загрузить план', 'Plan upload failed', "Rejani yuklab bo'lmadi"), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
      <div>
        <label className={labelCls}>{tr(lang, 'Название зала', 'Hall name', 'Zal nomi')}</label>
        <input value={name} maxLength={255} onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== hall.name) onChange({ name: name.trim() }); }}
          className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:w-56">
        <NumberField label={tr(lang, 'Ширина', 'Width', 'Eni')} value={hall.width} min={100} max={10000} onChange={n => onChange({ width: n })} />
        <NumberField label={tr(lang, 'Высота', 'Height', "Bo'yi")} value={hall.height} min={100} max={10000} onChange={n => onChange({ height: n })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[12px] text-text hover:border-primary/40">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {hall.background_image ? tr(lang, 'Заменить план', 'Replace plan', 'Rejani almashtirish') : tr(lang, 'Фон-план', 'Plan image', 'Reja rasmi')}
        </button>
        {hall.background_image && (
          <button onClick={() => onChange({ background_image: null })} className="px-3 py-2 rounded-lg border border-border text-[12px] text-muted hover:text-text">
            {tr(lang, 'Убрать фон', 'Remove image', 'Fonni olib tashlash')}
          </button>
        )}
        <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[12px] text-red-500 hover:border-red-400">
          <Trash2 size={13} /> {tr(lang, 'Удалить зал', 'Delete hall', "Zalni o'chirish")}
        </button>
        <button onClick={onClose} className="px-2 py-2 text-muted hover:text-text"><X size={15} /></button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => uploadPlan(e.target.files?.[0])} />
    </div>
  );
}
