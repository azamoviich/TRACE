import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { QrCode, Plus, Trash2, Download, FileSpreadsheet } from 'lucide-react';
import { Language } from '../../types';
import { traceApi, WaiterRow, WaiterSummaryRow } from '../../services/traceApi';
import { Card } from '../ui/Card';
import { tr } from '../../constants';

const BRANCH_LABEL: Record<string, string> = {
  'benedict': 'Mirabad',
  'benedict-nukus': 'Nukus',
};

// The QR endpoint is cross-origin in prod (VITE_API_URL points at Railway's
// raw domain), so a plain <a download> is silently ignored by the browser —
// it just navigates to the image instead of saving it. Fetch it as a blob,
// convert PNG -> JPEG on a canvas (white background, since JPEG has no
// alpha), and trigger the save from an object URL instead.
async function downloadQrAsJpg(url: string, filename: string) {
  const res = await fetch(url);
  const pngBlob = await res.blob();
  const bitmap = await createImageBitmap(pngBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  const jpgBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.95)
  );
  const blobUrl = URL.createObjectURL(jpgBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export const Waiters: React.FC<{ lang: Language }> = ({ lang }) => {
  const [waiters, setWaiters] = useState<WaiterRow[]>([]);
  const [summary, setSummary] = useState<WaiterSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [w, s] = await Promise.all([traceApi.waiters.list(), traceApi.waiters.summary()]);
      setWaiters(w);
      setSummary(s);
    } catch {
      setError(tr(lang, 'Не удалось загрузить официантов', 'Could not load waiters', "Ofitsiantlarni yuklab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await traceApi.waiters.create(name);
      setNewName('');
      await load();
    } catch {
      setError(tr(lang, 'Не удалось добавить', 'Could not add', "Qo'shib bo'lmadi"));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm(tr(lang, 'Удалить официанта?', 'Remove this waiter?', "Ofitsiantni o'chirasizmi?"))) return;
    await traceApi.waiters.remove(id);
    load();
  };

  const totalScans = (w: WaiterRow) => w.branches.reduce((sum, b) => sum + b.scan_count, 0);
  const sorted = [...waiters].sort((a, b) => totalScans(b) - totalScans(a));

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const rows = await traceApi.waiters.report();
      const header = [
        tr(lang, 'Официант', 'Waiter', 'Ofitsiant'),
        tr(lang, 'Филиал', 'Branch', 'Filial'),
        tr(lang, 'Скан в', 'Scanned at', 'Skan vaqti'),
        tr(lang, 'Отзыв в', 'Review at', 'Sharh vaqti'),
        tr(lang, 'Минут после скана', 'Minutes after scan', 'Skandan keyin daqiqa'),
        tr(lang, 'Автор', 'Author', 'Muallif'),
        tr(lang, 'Оценка', 'Rating', 'Baho'),
        tr(lang, 'Текст отзыва', 'Review text', 'Sharh matni'),
      ];
      const body = rows.map(r => [
        r.waiter_name,
        r.branch_name,
        new Date(r.scanned_at).toLocaleString(),
        new Date(r.review_date).toLocaleString(),
        Math.round(r.minutes_after_scan),
        r.author,
        r.rating ?? '',
        r.text,
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: header.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tr(lang, 'Отзывы официантов', 'Waiter reviews', 'Ofitsiant sharhlari'));
      XLSX.writeFile(wb, `waiter-reviews-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      setError(tr(lang, 'Не удалось выгрузить отчёт', 'Could not export report', "Hisobotni yuklab bo'lmadi"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <QrCode size={14} className="text-primary" />
            <p className="text-[13px] text-muted font-medium">
              {tr(lang, 'QR-коды официантов для отзывов', 'Waiter review QR codes', 'Ofitsiantlar uchun sharh QR kodlari')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="px-2.5 py-1.5 rounded-lg border border-border text-[12px] font-medium flex items-center gap-1.5 text-muted hover:text-primary hover:border-primary transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet size={13} /> {tr(lang, 'Отчёт .xlsx', 'Report .xlsx', 'Hisobot .xlsx')}
          </button>
        </div>
        <p className="text-[13px] text-muted/70 mb-4">
          {tr(lang,
            'Каждый официант получает 2 QR-кода — по одному на каждый филиал. Гость сканирует и попадает на страницу отзыва в Google Картах. Здесь видно, сколько раз отсканирован каждый код.',
            'Each waiter gets 2 QR codes — one per branch. A guest scans and lands on the Google Maps review page. Scan counts show which waiter is driving reviews.',
            "Har bir ofitsiant 2 ta QR-kod oladi — har bir filial uchun bittadan. Mehmon skanerlaydi va Google Xaritalar sharh sahifasiga tushadi.")}
        </p>

        <div className="flex gap-2 mb-4">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={tr(lang, 'Имя официанта', 'Waiter name', 'Ofitsiant ismi')}
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-white text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus size={13} /> {tr(lang, 'Добавить', 'Add', "Qo'shish")}
          </button>
        </div>

        {error && <p className="text-[13px] text-danger mb-3">{error}</p>}
        {loading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-border/40 rounded-lg animate-pulse" />)}</div>}

        {!loading && summary.length > 0 && (
          <div className="overflow-x-auto mb-4 border border-border rounded-lg">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left font-medium px-3 py-2">{tr(lang, 'Имя', 'Name', 'Ism')}</th>
                  <th className="text-right font-medium px-3 py-2">{tr(lang, 'Сканов', 'Scans', 'Skan')}</th>
                  <th className="text-right font-medium px-3 py-2">{tr(lang, 'Вчера', 'Yesterday', 'Kecha')}</th>
                  <th className="text-right font-medium px-3 py-2">{tr(lang, 'Сегодня', 'Today', 'Bugun')}</th>
                  <th className="text-right font-medium px-3 py-2">Δ</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(s => (
                  <tr key={s.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-right text-muted">{s.total_scans}</td>
                    <td className="px-3 py-2 text-right text-muted">{s.reviews_yesterday}</td>
                    <td className="px-3 py-2 text-right">{s.reviews_today}</td>
                    <td className={`px-3 py-2 text-right font-medium ${s.delta > 0 ? 'text-success' : s.delta < 0 ? 'text-danger' : 'text-muted'}`}>
                      {s.delta > 0 ? '+' : ''}{s.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="space-y-2">
            {sorted.map(w => (
              <div key={w.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-medium">{w.name}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-muted">{totalScans(w)} {tr(lang, 'сканов', 'scans', 'skan')}</span>
                    <button onClick={() => handleRemove(w.id)} className="text-muted hover:text-danger transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {w.branches.map(b => (
                    <div key={b.tenant_id} className="flex items-center gap-2 bg-bg border border-border rounded-lg px-2.5 py-1.5">
                      <img src={traceApi.waiters.qrUrl(b.code)} alt={b.subdomain} className="w-10 h-10 rounded bg-white" />
                      <div className="text-[11px]">
                        <p className="font-medium">{BRANCH_LABEL[b.subdomain] ?? b.branch_name}</p>
                        <p className="text-muted">{b.scan_count} {tr(lang, 'сканов', 'scans', 'skan')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadQrAsJpg(traceApi.waiters.qrUrl(b.code), `${w.name}-${BRANCH_LABEL[b.subdomain] ?? b.subdomain}.jpg`)}
                        className="text-muted hover:text-primary transition-colors ml-1"
                      >
                        <Download size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {sorted.length === 0 && (
              <p className="text-[13px] text-muted/50 text-center py-6">
                {tr(lang, 'Нет официантов', 'No waiters yet', "Ofitsiantlar yo'q")}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
