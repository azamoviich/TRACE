import React, { useState, useEffect } from 'react';
import { QrCode, Plus, Trash2, Download } from 'lucide-react';
import { Language } from '../../types';
import { traceApi, WaiterRow } from '../../services/traceApi';
import { Card } from '../ui/Card';
import { tr } from '../../constants';

const BRANCH_LABEL: Record<string, string> = {
  'benedict': 'Mirabad',
  'benedict-nukus': 'Nukus',
};

export const Waiters: React.FC<{ lang: Language }> = ({ lang }) => {
  const [waiters, setWaiters] = useState<WaiterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setWaiters(await traceApi.waiters.list());
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

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <QrCode size={14} className="text-primary" />
          <p className="text-[13px] text-muted font-medium">
            {tr(lang, 'QR-коды официантов для отзывов', 'Waiter review QR codes', 'Ofitsiantlar uchun sharh QR kodlari')}
          </p>
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
                      <a
                        href={traceApi.waiters.qrUrl(b.code)}
                        download={`${w.name}-${b.subdomain}.png`}
                        className="text-muted hover:text-primary transition-colors ml-1"
                      >
                        <Download size={13} />
                      </a>
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
