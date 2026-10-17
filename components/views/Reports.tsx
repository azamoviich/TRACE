// Отчёты — redesign (styles/rd/more.css): summary workbook, a link to the
// schedule in Settings, and every report template as Excel or PDF.
import React, { useEffect, useState } from 'react';
import { Language, ViewState } from '../../types';
import { TRANSLATIONS, tr } from '../../constants';
import { traceApi } from '../../services/traceApi';
import { PeriodSeg, PeriodValue, rangeLabel as rdRange } from '../rd/ui';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReportRange = 'today' | '7days' | '30days' | 'custom';
type ReportCat2 = 'all' | 'sales' | 'staff' | 'stock' | 'finance';
type ExportFormat = 'xlsx' | 'pdf';

function today() { return new Date().toISOString().slice(0, 10); }
function nowStr() {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function pct(num: number, denom: number) {
  return denom > 0 ? `${((num / denom) * 100).toFixed(1)}%` : '—';
}

function buildSheet(
  aoa: (string | number)[][][],  // array of row groups, separated by empty row
  colWidths: number[],
  freezeRow = 4,                 // freeze rows 0..freezeRow-1 (title + meta + header)
  autoFilterRow = 3,             // 0-based row index of header
): XLSX.WorkSheet {
  // Flatten groups with one empty row between
  const flat: (string | number)[][] = [];
  for (let i = 0; i < aoa.length; i++) {
    if (i > 0) flat.push([]);
    for (const row of aoa[i]) flat.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(flat);
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  if (freezeRow > 0) {
    ws['!freeze'] = { xSplit: 0, ySplit: freezeRow } as any;
  }

  const ref = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  if (autoFilterRow >= 0 && autoFilterRow <= ref.e.r) {
    ws['!autofilter'] = {
      ref: `${XLSX.utils.encode_cell({ r: autoFilterRow, c: ref.s.c })}:${XLSX.utils.encode_cell({ r: autoFilterRow, c: ref.e.c })}`
    };
  }

  return ws;
}

function meta(lang: Language, title: string, range: string, customFrom?: string, customTo?: string): (string | number)[][] {
  const rangeLabel = customFrom
    ? (customTo && customTo !== customFrom ? `${customFrom} → ${customTo}` : customFrom)
    : range === 'today' ? tr(lang, 'Сегодня', 'Today', 'Bugun')
    : range === '7days' ? tr(lang, '7 дней', '7 days', '7 kun')
    : tr(lang, '30 дней', '30 days', '30 kun');
  return [
    [`TRACE · ${title}`],
    [tr(lang, `Период: ${rangeLabel}`, `Period: ${rangeLabel}`, `Davr: ${rangeLabel}`), '', tr(lang, `Сформирован: ${nowStr()}`, `Generated: ${nowStr()}`, `Yaratildi: ${nowStr()}`)],
    [],
  ];
}

function addSheet(wb: XLSX.WorkBook, ws: XLSX.WorkSheet, name: string) {
  XLSX.utils.book_append_sheet(wb, ws, name);
}

// Generic Excel-workbook → PDF converter. Every report already builds an
// XLSX.WorkBook via buildSheet/meta (title row, period/generated-at row,
// blank row, header row, data rows, optional blank + totals row) — reading
// that structure back out means every report gets a matching PDF export
// for free, with zero duplication of the 16 report-generator functions
// above and zero risk of the two formats drifting apart.
async function workbookToPdf(wb: XLSX.WorkBook, brandTitle: string): Promise<jsPDF> {
  const { registerCyrillicFont } = await import('../../lib/pdfFonts');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  registerCyrillicFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();

  wb.SheetNames.forEach((name, idx) => {
    if (idx > 0) doc.addPage();
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' }) as (string | number)[][];

    const titleRow = (aoa[0] ?? [])[0] ?? name;
    const metaRow  = aoa[1] ?? [];
    const metaLine = metaRow.filter(c => c !== '' && c != null).join('   ·   ');

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(brandTitle, pageWidth - 40, 20, { align: 'right' });

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(20);
    doc.text(String(titleRow), 40, 30);

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(metaLine, 40, 46);

    // Rows after the blank separator (index 2) are the actual table:
    // header row first, then data rows, possibly with a trailing blank +
    // totals row (which we render as a bold last row, not a real header).
    const tableRows = aoa.slice(3).filter(r => r.some(c => c !== '' && c != null));
    const header = (tableRows[0] ?? []).map(c => String(c));
    const body = tableRows.slice(1).map(r => r.map(c => (c === '' || c == null) ? '—' : String(c)));

    autoTable(doc, {
      startY: 58,
      head: header.length ? [header] : undefined,
      body,
      styles: { font: 'Roboto', fontSize: 8, cellPadding: 4 },
      headStyles: { font: 'Roboto', fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 246, 246] },
      theme: 'striped',
      margin: { left: 40, right: 40 },
    });
  });

  return doc;
}

// ── Report generators ─────────────────────────────────────────────────────────

async function reportSalesByDish(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.sales.topDishes(range, 500);
  if (!data.length) throw new Error(tr(lang, 'Нет данных за период', 'No data for period', "Davr uchun ma'lumot yo'q"));

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalQty = data.reduce((s, d) => s + d.quantity, 0);

  const header = lang === 'ru'
    ? ['#', 'Блюдо', 'Категория', 'Кол-во', 'Доля кол-ва', 'Выручка (UZS)', 'Доля выручки', 'Ср. цена (UZS)']
    : lang === 'uz'
    ? ['#', 'Taom', 'Kategoriya', 'Soni', 'Soni ulushi', 'Tushum (UZS)', 'Tushum ulushi', "O'rt. narx (UZS)"]
    : ['#', 'Dish', 'Category', 'Qty', 'Qty share', 'Revenue (UZS)', 'Revenue share', 'Avg price (UZS)'];

  const rows: (string | number)[][] = data.map((d, i) => [
    i + 1,
    d.name,
    d.category ?? '—',
    d.quantity,
    pct(d.quantity, totalQty),
    d.revenue,
    pct(d.revenue, totalRev),
    d.quantity > 0 ? Math.round(d.revenue / d.quantity) : 0,
  ]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, '', totalQty, '100%', totalRev, '100%', totalQty > 0 ? Math.round(totalRev / totalQty) : 0];

  // Group by category sheet
  const catMap = new Map<string, { qty: number; rev: number }>();
  for (const d of data) {
    const c = d.category ?? '—';
    const prev = catMap.get(c) ?? { qty: 0, rev: 0 };
    catMap.set(c, { qty: prev.qty + d.quantity, rev: prev.rev + d.revenue });
  }
  const catRows: (string | number)[][] = Array.from(catMap.entries())
    .sort(([, a], [, b]) => b.rev - a.rev)
    .map(([name, v], i) => [i + 1, name, v.qty, pct(v.qty, totalQty), v.rev, pct(v.rev, totalRev)]);
  const catHeader = lang === 'ru'
    ? ['#', 'Категория', 'Кол-во', 'Доля кол-ва', 'Выручка (UZS)', 'Доля выручки']
    : lang === 'uz'
    ? ['#', 'Kategoriya', 'Soni', 'Soni ulushi', 'Tushum (UZS)', 'Tushum ulushi']
    : ['#', 'Category', 'Qty', 'Qty share', 'Revenue (UZS)', 'Revenue share'];

  const wb = XLSX.utils.book_new();

  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Продажи по блюдам', 'Sales by Dish', 'Taomlar boʻyicha sotuvlar'), range),
    [header, ...rows, [], totals],
  ], [4, 36, 20, 8, 12, 16, 14, 14], 4, 3), tr(lang, 'Блюда', 'Dishes', 'Taomlar'));

  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'По категориям', 'By Category', 'Kategoriyalar boʻyicha'), range),
    [catHeader, ...catRows],
  ], [4, 24, 10, 12, 16, 14], 4, 3), tr(lang, 'Категории', 'Categories', 'Kategoriyalar'));

  return wb;
}

async function reportSalesByCat(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.sales.categoryPerf(range);
  if (!data.length) throw new Error(tr(lang, 'Нет данных за период', 'No data for period', "Davr uchun ma'lumot yo'q"));

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrd = data.reduce((s, d) => s + d.orders, 0);

  const header = lang === 'ru'
    ? ['#', 'Категория', 'Выручка (UZS)', 'Доля выручки', 'Заказов', 'Доля заказов', 'Средний чек (UZS)']
    : lang === 'uz'
    ? ['#', 'Kategoriya', 'Tushum (UZS)', 'Tushum ulushi', 'Buyurtmalar', 'Buyurtma ulushi', "O'rt. chek (UZS)"]
    : ['#', 'Category', 'Revenue (UZS)', 'Rev. share', 'Orders', 'Order share', 'Avg Check (UZS)'];

  const rows: (string | number)[][] = data
    .sort((a, b) => b.revenue - a.revenue)
    .map((d, i) => [i + 1, d.name, d.revenue, pct(d.revenue, totalRev), d.orders, pct(d.orders, totalOrd), d.avgCheck]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, totalRev, '100%', totalOrd, '100%', totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Продажи по категориям', 'Sales by Category', 'Kategoriyalar boʻyicha sotuvlar'), range),
    [header, ...rows, [], totals],
  ], [4, 28, 16, 13, 10, 13, 16], 4, 3), tr(lang, 'Категории', 'Categories', 'Kategoriyalar'));
  return wb;
}

async function reportStaff(lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.operations.staff();
  if (!data.length) throw new Error(tr(lang, 'Нет данных по сотрудникам', 'No staff data', "Xodimlar bo'yicha ma'lumot yo'q"));

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrd = data.reduce((s, d) => s + d.orders, 0);

  const header = lang === 'ru'
    ? ['#', 'Сотрудник', 'Выручка (UZS)', 'Доля выручки', 'Заказов', 'Доля заказов', 'Средний чек (UZS)']
    : lang === 'uz'
    ? ['#', 'Xodim', 'Tushum (UZS)', 'Tushum ulushi', 'Buyurtmalar', 'Buyurtma ulushi', "O'rt. chek (UZS)"]
    : ['#', 'Staff member', 'Revenue (UZS)', 'Rev. share', 'Orders', 'Order share', 'Avg Check (UZS)'];

  const rows: (string | number)[][] = data
    .sort((a, b) => b.revenue - a.revenue)
    .map((d, i) => [i + 1, d.name, d.revenue, pct(d.revenue, totalRev), d.orders, pct(d.orders, totalOrd), d.avgCheck]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, totalRev, '100%', totalOrd, '100%', totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Эффективность персонала', 'Staff Performance', 'Xodimlar samaradorligi'), 'today'),
    [header, ...rows, [], totals],
  ], [4, 28, 16, 13, 10, 13, 16], 4, 3), tr(lang, 'Персонал', 'Staff', 'Xodimlar'));
  return wb;
}

// Расхождение threshold: flag a shift as needing a look if its cash
// discrepancy is either a meaningfully large absolute amount or a large
// share of that shift's own cash sales — a 50,000 UZS diff on a 200,000
// cash-sales shift is a much bigger deal than the same diff on 5,000,000.
const SHIFT_DIFF_ABS_THRESHOLD = 30_000;
const SHIFT_DIFF_PCT_THRESHOLD = 0.03; // 3% of that shift's cash sales

async function reportShifts(range: ReportRange, lang: Language, customFrom?: string, customTo?: string): Promise<XLSX.WorkBook> {
  const data = await traceApi.financial.cashshifts(range, customFrom, customTo);
  if (!data.length) throw new Error(tr(lang, 'Нет данных по сменам', 'No shift data', "Smenalar bo'yicha ma'lumot yo'q"));

  const totalRev  = data.reduce((s, d) => s + d.payOrders, 0);
  const totalCash = data.reduce((s, d) => s + d.salesCash, 0);
  const totalCard = data.reduce((s, d) => s + d.salesCard, 0);
  const totalDiff = data.reduce((s, d) => s + d.cashDiff, 0);

  const flagged = data.filter(s => {
    const absDiff = Math.abs(s.cashDiff);
    if (absDiff < SHIFT_DIFF_ABS_THRESHOLD) return false;
    return s.salesCash > 0 ? absDiff / s.salesCash >= SHIFT_DIFF_PCT_THRESHOLD : true;
  });

  const header = lang === 'ru'
    ? ['#', 'Смена №', 'Открыта', 'Закрыта', 'Выручка (UZS)', 'Наличные', 'Карта', 'Доля нал.', 'Расхождение', 'Статус', 'Флаг']
    : lang === 'uz'
    ? ['#', 'Smena №', 'Ochildi', 'Yopildi', 'Tushum (UZS)', 'Naqd', 'Karta', 'Naqd ulushi', 'Farq', 'Holat', 'Belgi']
    : ['#', 'Shift #', 'Opened', 'Closed', 'Revenue (UZS)', 'Cash', 'Card', 'Cash %', 'Diff', 'Status', 'Flag'];

  const flagLabel = tr(lang, '⚠ ПРОВЕРИТЬ', '⚠ REVIEW', '⚠ TEKSHIRISH');
  const rows: (string | number)[][] = data.map((s, i) => {
    const absDiff = Math.abs(s.cashDiff);
    const isFlagged = absDiff >= SHIFT_DIFF_ABS_THRESHOLD && (s.salesCash > 0 ? absDiff / s.salesCash >= SHIFT_DIFF_PCT_THRESHOLD : true);
    return [
      i + 1,
      s.sessionNumber,
      s.openDate ?? '—',
      s.closeDate ?? '—',
      s.payOrders,
      s.salesCash,
      s.salesCard,
      pct(s.salesCash, s.payOrders),
      s.cashDiff,
      s.sessionStatus,
      isFlagged ? flagLabel : '',
    ];
  });

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', '', '', totalLabel, totalRev, totalCash, totalCard, pct(totalCash, totalRev), totalDiff, '', ''];

  const insightRows: (string | number)[][] = flagged.length === 0
    ? [[tr(lang,
        `Расхождений выше ${SHIFT_DIFF_ABS_THRESHOLD.toLocaleString('ru-RU')} UZS / ${(SHIFT_DIFF_PCT_THRESHOLD * 100).toFixed(0)}% нет — кассовая дисциплина в норме.`,
        `No discrepancies above ${SHIFT_DIFF_ABS_THRESHOLD.toLocaleString('en-US')} UZS / ${(SHIFT_DIFF_PCT_THRESHOLD * 100).toFixed(0)}% — cash discipline looks clean.`,
        `${SHIFT_DIFF_ABS_THRESHOLD.toLocaleString('ru-RU')} UZS / ${(SHIFT_DIFF_PCT_THRESHOLD * 100).toFixed(0)}% dan yuqori farq yo'q — kassa intizomi yaxshi.`)]]
    : [
        [tr(lang,
          `⚠ ${flagged.length} из ${data.length} смен с расхождением ≥ ${SHIFT_DIFF_ABS_THRESHOLD.toLocaleString('ru-RU')} UZS или ≥ ${(SHIFT_DIFF_PCT_THRESHOLD * 100).toFixed(0)}% от наличной выручки смены — требуют проверки:`,
          `⚠ ${flagged.length} of ${data.length} shifts have a discrepancy ≥ ${SHIFT_DIFF_ABS_THRESHOLD.toLocaleString('en-US')} UZS or ≥ ${(SHIFT_DIFF_PCT_THRESHOLD * 100).toFixed(0)}% of that shift's cash sales — need review:`,
          `⚠ ${data.length} tadan ${flagged.length} smenada ${SHIFT_DIFF_ABS_THRESHOLD.toLocaleString('ru-RU')} UZS yoki naqd tushumning ${(SHIFT_DIFF_PCT_THRESHOLD * 100).toFixed(0)}% dan ortiq farq bor — tekshirish kerak:`)],
        ...flagged.map(s => [`  Смена №${s.sessionNumber} · ${s.openDate ?? '—'} · ${tr(lang, 'расхождение', 'diff', 'farq')}: ${s.cashDiff.toLocaleString('ru-RU')} UZS`]),
      ];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Кассовые смены', 'Cash Shifts', 'Kassa smenalari'), range, customFrom, customTo),
    [header, ...rows, [], totals],
    insightRows,
  ], [4, 10, 18, 18, 16, 16, 16, 10, 14, 14, 12], 4, 3), tr(lang, 'Смены', 'Shifts', 'Smenalar'));
  return wb;
}

async function reportStock(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.financial.inventory(range === 'custom' ? '30days' : range);
  if (!data || !data.length) throw new Error(tr(lang, 'Нет данных инвентаризации за период', 'No inventory data for period', "Davr uchun inventarizatsiya ma'lumoti yo'q"));

  // Poster gives a live stock-balance snapshot (per-item), not stocktaking
  // documents like iiko — 'unit' only exists on the Poster shape.
  const isPoster = 'unit' in data[0];

  const header = isPoster
    ? (lang === 'ru'
      ? ['#', 'Позиция', 'Остаток', 'Ед.', 'Себест. за ед. (UZS)', 'Стоимость (UZS)']
      : lang === 'uz'
      ? ['#', 'Pozitsiya', 'Qoldiq', 'Birlik', 'Birlik tannarxi (UZS)', 'Qiymat (UZS)']
      : ['#', 'Item', 'Qty', 'Unit', 'Unit cost (UZS)', 'Total value (UZS)'])
    : (lang === 'ru'
      ? ['#', '№ документа', 'Дата', 'Склад', 'Сумма (UZS)', 'Статус', 'Комментарий']
      : lang === 'uz'
      ? ['#', 'Hujjat №', 'Sana', 'Ombor', 'Summa (UZS)', 'Holat', 'Izoh']
      : ['#', 'Doc #', 'Date', 'Store', 'Amount (UZS)', 'Status', 'Comment']);

  const totalSum = isPoster
    ? data.reduce((s, d: any) => s + (d.totalValue ?? 0), 0)
    : data.reduce((s, d: any) => s + (d.sum ?? 0), 0);

  const rows: (string | number)[][] = isPoster
    ? data.map((d: any, i) => [i + 1, d.name, d.qty, d.unit, d.unitCost, d.totalValue])
    : data.map((d: any, i) => [i + 1, d.documentNumber, d.date, d.storeCode ?? '—', d.sum ?? 0, d.status, d.comment ?? '']);
  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = isPoster ? ['', '', '', totalLabel, '', totalSum] : ['', '', '', totalLabel, totalSum, '', ''];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Инвентаризации', 'Inventory', 'Inventarizatsiya'), range),
    [header, ...rows, [], totals],
  ], [4, 18, 12, 18, 16, 14, 28], 4, 3), tr(lang, 'Инвентаризация', 'Inventory', 'Inventarizatsiya'));
  return wb;
}

async function reportWriteoffs(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const [data, catData] = await Promise.all([
    traceApi.financial.writeoffs(range),
    traceApi.sales.categoryPerf(range),
  ]);
  if (!data.length) throw new Error(tr(lang, 'Списаний нет за период', 'No write-offs for period', "Davr uchun chiqindilar yo'q"));

  const totalCost = data.reduce((s, w) => s + w.cost, 0);
  const totalRev  = catData.reduce((s, c) => s + c.revenue, 0);
  const totalQty  = data.reduce((s, w) => s + w.qty, 0);

  const header = lang === 'ru'
    ? ['#', 'Позиция', 'Акт №', 'Дата', 'Кол-во', 'Себест. (UZS)', 'Доля от выручки']
    : lang === 'uz'
    ? ['#', 'Mahsulot', 'Akt №', 'Sana', 'Soni', 'Tannarx (UZS)', 'Tushumdan ulush']
    : ['#', 'Item', 'Doc #', 'Date', 'Qty', 'Cost (UZS)', 'Pct of revenue'];

  const rows: (string | number)[][] = data
    .sort((a, b) => b.cost - a.cost)
    .map((w, i) => [i + 1, w.name, w.docNumber ?? '—', w.date, w.qty, w.cost, pct(w.cost, totalRev)]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, '', '', totalQty, totalCost, pct(totalCost, totalRev)];

  // Group by item name
  const grouped = new Map<string, { qty: number; cost: number }>();
  for (const w of data) {
    const prev = grouped.get(w.name) ?? { qty: 0, cost: 0 };
    grouped.set(w.name, { qty: prev.qty + w.qty, cost: prev.cost + w.cost });
  }
  const grpHeader = lang === 'ru'
    ? ['#', 'Позиция', 'Кол-во всего', 'Себест. всего (UZS)', 'Доля от выручки']
    : lang === 'uz'
    ? ['#', 'Mahsulot', 'Jami soni', 'Jami tannarx (UZS)', 'Tushumdan ulush']
    : ['#', 'Item', 'Total qty', 'Total cost (UZS)', 'Pct of revenue'];
  const grpRows: (string | number)[][] = Array.from(grouped.entries())
    .sort(([, a], [, b]) => b.cost - a.cost)
    .map(([name, v], i) => [i + 1, name, v.qty, v.cost, pct(v.cost, totalRev)]);

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Акты списания', 'Write-offs', 'Chiqindi aktlari'), range),
    [header, ...rows, [], totals],
  ], [4, 32, 14, 12, 8, 16, 15], 4, 3), tr(lang, 'Все списания', 'All Write-offs', 'Barcha chiqindilar'));

  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Топ списаний по позиции', 'Write-offs by Item', 'Mahsulot boʻyicha chiqindilar'), range),
    [grpHeader, ...grpRows],
  ], [4, 32, 12, 18, 15], 4, 3), tr(lang, 'По позиции', 'By Item', 'Mahsulot boʻyicha'));

  return wb;
}

async function reportQuickSummary(range: ReportRange, lang: Language, customFrom?: string, customTo?: string): Promise<XLSX.WorkBook> {
  const [cats, dishes, shifts, writeoffs] = await Promise.all([
    traceApi.sales.categoryPerf(range, customFrom, customTo),
    traceApi.sales.topDishes(range, 50, customFrom, customTo),
    traceApi.financial.cashshifts(range, customFrom, customTo),
    traceApi.financial.writeoffs(range, customFrom, customTo),
  ]);

  const totalRev   = cats.reduce((s, c) => s + c.revenue, 0);
  const totalOrd   = cats.reduce((s, c) => s + c.orders, 0);
  const totalWaste = writeoffs.reduce((s, w) => s + w.cost, 0);
  const totalCash  = shifts.reduce((s, s2) => s + s2.salesCash, 0);
  const totalCard  = shifts.reduce((s, s2) => s + s2.salesCard, 0);

  const wb = XLSX.utils.book_new();

  // Sheet 1: Executive summary
  const sumRows: (string | number)[][] = [
    [tr(lang, 'Показатель', 'Metric', "Ko'rsatkich"), tr(lang, 'Значение', 'Value', 'Qiymat'), tr(lang, 'Примечание', 'Note', 'Izoh')],
    [tr(lang, 'Выручка (UZS)', 'Revenue (UZS)', 'Tushum (UZS)'), totalRev, ''],
    [tr(lang, 'Заказов', 'Orders', 'Buyurtmalar'), totalOrd, ''],
    [tr(lang, 'Средний чек (UZS)', 'Avg Check (UZS)', "O'rt. chek (UZS)"), totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0, ''],
    [tr(lang, 'Наличные (UZS)', 'Cash (UZS)', 'Naqd (UZS)'), totalCash, pct(totalCash, totalRev)],
    [tr(lang, 'Карта (UZS)', 'Card (UZS)', 'Karta (UZS)'), totalCard, pct(totalCard, totalRev)],
    ['', '', ''],
    [tr(lang, 'Списания (UZS)', 'Write-offs (UZS)', 'Chiqindilar (UZS)'), totalWaste, pct(totalWaste, totalRev)],
    [tr(lang, 'Фуд-кост (UZS)', 'COGS (UZS)', 'Fud-kost (UZS)'), '', tr(lang, 'см. P&L', 'see P&L', "P&L ga qarang")],
    ['', '', ''],
    [tr(lang, 'Смен', 'Shifts', 'Smenalar'), shifts.length, ''],
    [tr(lang, 'Категорий', 'Categories', 'Kategoriyalar'), cats.length, ''],
    [tr(lang, 'Позиций в меню', 'Menu items', 'Menyu pozitsiyalari'), dishes.length, ''],
    ['', '', ''],
    [tr(lang, 'Период', 'Period', 'Davr'), range, ''],
    [tr(lang, 'Дата отчёта', 'Report date', 'Hisobot sanasi'), nowStr(), ''],
  ];
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Сводка', 'Summary', 'Xulosa'), range),
    [sumRows[0], ...sumRows.slice(1)],
  ], [30, 18, 20], 4, -1), tr(lang, 'Сводка', 'Summary', 'Xulosa'));

  // Sheet 2: Revenue by category
  if (cats.length) {
    const catH = lang === 'ru'
      ? ['#', 'Категория', 'Выручка (UZS)', 'Доля %', 'Заказов', 'Ср. чек (UZS)']
      : lang === 'uz'
      ? ['#', 'Kategoriya', 'Tushum (UZS)', 'Ulush %', 'Buyurtmalar', "O'rt. chek (UZS)"]
      : ['#', 'Category', 'Revenue (UZS)', 'Share %', 'Orders', 'Avg Check (UZS)'];
    const catR: (string | number)[][] = cats.sort((a, b) => b.revenue - a.revenue)
      .map((c, i) => [i + 1, c.name, c.revenue, pct(c.revenue, totalRev), c.orders, c.avgCheck]);
    const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'По категориям', 'By Category', 'Kategoriyalar boʻyicha'), range),
      [catH, ...catR, [], ['', totalLabel, totalRev, '100%', totalOrd, totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0]],
    ], [4, 26, 16, 10, 10, 14], 4, 3), tr(lang, 'Категории', 'Categories', 'Kategoriyalar'));
  }

  // Sheet 3: Top dishes
  if (dishes.length) {
    const totalDishQty = dishes.reduce((s, d) => s + d.quantity, 0);
    const dishH = lang === 'ru'
      ? ['#', 'Блюдо', 'Категория', 'Кол-во', 'Доля кол-ва', 'Выручка (UZS)', 'Доля выручки', 'Ср. цена (UZS)']
      : lang === 'uz'
      ? ['#', 'Taom', 'Kategoriya', 'Soni', 'Soni ulushi', 'Tushum (UZS)', 'Tushum ulushi', "O'rt. narx (UZS)"]
      : ['#', 'Dish', 'Category', 'Qty', 'Qty share', 'Revenue (UZS)', 'Rev. share', 'Avg price (UZS)'];
    const dishR: (string | number)[][] = dishes.map((d, i) => [
      i + 1, d.name, d.category ?? '—', d.quantity, pct(d.quantity, totalDishQty),
      d.revenue, pct(d.revenue, totalRev), d.quantity > 0 ? Math.round(d.revenue / d.quantity) : 0,
    ]);
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'Топ блюд', 'Top Dishes', 'Top taomlar'), range),
      [dishH, ...dishR],
    ], [4, 34, 20, 8, 11, 16, 12, 14], 4, 3), tr(lang, 'Блюда', 'Dishes', 'Taomlar'));
  }

  // Sheet 4: Cash shifts
  if (shifts.length) {
    const shH = lang === 'ru'
      ? ['#', 'Смена №', 'Открыта', 'Закрыта', 'Выручка (UZS)', 'Наличные', 'Карта', 'Нал. %', 'Расхождение', 'Статус']
      : lang === 'uz'
      ? ['#', 'Smena №', 'Ochildi', 'Yopildi', 'Tushum (UZS)', 'Naqd', 'Karta', 'Naqd %', 'Farq', 'Holat']
      : ['#', 'Shift #', 'Opened', 'Closed', 'Revenue (UZS)', 'Cash', 'Card', 'Cash %', 'Diff', 'Status'];
    const shR: (string | number)[][] = shifts.map((s, i) => [
      i + 1, s.sessionNumber, s.openDate ?? '—', s.closeDate ?? '—',
      s.payOrders, s.salesCash, s.salesCard, pct(s.salesCash, s.payOrders),
      s.cashDiff, s.sessionStatus,
    ]);
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'Кассовые смены', 'Cash Shifts', 'Kassa smenalari'), range),
      [shH, ...shR],
    ], [4, 10, 18, 18, 16, 14, 14, 9, 13, 14], 4, 3), tr(lang, 'Смены', 'Shifts', 'Smenalar'));
  }

  // Sheet 5: Write-offs
  if (writeoffs.length) {
    const woH = lang === 'ru'
      ? ['#', 'Позиция', 'Дата', 'Кол-во', 'Себест. (UZS)', 'Доля выручки']
      : lang === 'uz'
      ? ['#', 'Mahsulot', 'Sana', 'Soni', 'Tannarx (UZS)', 'Tushum ulushi']
      : ['#', 'Item', 'Date', 'Qty', 'Cost (UZS)', 'Pct of revenue'];
    const totalWasteQty = writeoffs.reduce((s, w) => s + w.qty, 0);
    const woR: (string | number)[][] = writeoffs
      .sort((a, b) => b.cost - a.cost)
      .map((w, i) => [i + 1, w.name, w.date, w.qty, w.cost, pct(w.cost, totalRev)]);
    const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'Списания', 'Write-offs', 'Chiqindilar'), range),
      [woH, ...woR, [], ['', totalLabel, '', totalWasteQty, totalWaste, pct(totalWaste, totalRev)]],
    ], [4, 32, 12, 8, 16, 14], 4, 3), tr(lang, 'Списания', 'Write-offs', 'Chiqindilar'));
  }

  return wb;
}

async function reportPL(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.financial.pl(range);
  if (!data) throw new Error(tr(lang, 'Нет данных P&L за период', 'No P&L data for period', "Davr uchun P&L ma'lumoti yo'q"));

  const sumRows: (string | number)[][] = [
    [tr(lang, 'Показатель', 'Metric', "Ko'rsatkich"), tr(lang, 'Значение (UZS)', 'Value (UZS)', 'Qiymat (UZS)'), tr(lang, 'Доля', 'Share', 'Ulush')],
    [tr(lang, 'Выручка', 'Revenue', 'Tushum'), data.revenue, '100%'],
    [tr(lang, 'Себестоимость (COGS)', 'COGS', 'Tannarx (COGS)'), data.cogs, pct(data.cogs, data.revenue)],
    [tr(lang, 'Валовая прибыль', 'Gross Profit', 'Yalpi foyda'), data.grossProfit, pct(data.grossProfit, data.revenue)],
    [tr(lang, 'Фуд-кост %', 'Food Cost %', 'Fud-kost %'), data.foodCostPct ?? '—', ''],
    [tr(lang, 'ФОТ (labor)', 'Labor Cost', 'Ish haqi'), data.laborCost, pct(data.laborCost, data.revenue)],
    [tr(lang, 'ФОТ %', 'Labor Cost %', 'Ish haqi %'), data.laborCostPct ?? '—', ''],
    [tr(lang, 'Аренда', 'Rent', 'Ijara'), data.rent, pct(data.rent, data.revenue)],
    [tr(lang, 'Коммунальные', 'Utilities', 'Kommunal'), data.utilities, pct(data.utilities, data.revenue)],
    [tr(lang, 'Прочие расходы', 'Other Opex', 'Boshqa xarajatlar'), data.otherOpex, pct(data.otherOpex, data.revenue)],
    ['', '', ''],
    [tr(lang, 'Чистая прибыль', 'Net Profit', 'Sof foyda'), data.netProfit, pct(data.netProfit, data.revenue)],
    [tr(lang, 'Чистая прибыль %', 'Net Profit %', 'Sof foyda %'), data.netProfitPct ?? '—', ''],
  ];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Отчёт P&L', 'P&L Report', 'P&L hisoboti'), range),
    sumRows,
  ], [26, 20, 12], 4, -1), tr(lang, 'P&L', 'P&L', 'P&L'));

  if (data.categories.length) {
    const catH = lang === 'ru'
      ? ['#', 'Категория', 'Выручка (UZS)', 'COGS (UZS)', 'Фуд-кост %']
      : lang === 'uz'
      ? ['#', 'Kategoriya', 'Tushum (UZS)', 'COGS (UZS)', 'Fud-kost %']
      : ['#', 'Category', 'Revenue (UZS)', 'COGS (UZS)', 'Food cost %'];
    const catR = data.categories
      .sort((a, b) => b.revenue - a.revenue)
      .map((c, i) => [i + 1, c.name, c.revenue, c.cogs, c.foodCostPct ?? '—']);
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'По категориям', 'By Category', 'Kategoriyalar boʻyicha'), range),
      [catH, ...catR],
    ], [4, 26, 16, 14, 12], 4, 3), tr(lang, 'Категории', 'Categories', 'Kategoriyalar'));
  }

  if (data.monthly.length) {
    const monH = lang === 'ru' ? ['Месяц', 'Выручка (UZS)'] : lang === 'uz' ? ['Oy', 'Tushum (UZS)'] : ['Month', 'Revenue (UZS)'];
    const monR = data.monthly.map(m => [m.label, m.revenue]);
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'Динамика по месяцам', 'Monthly Trend', 'Oylik dinamika'), range),
      [monH, ...monR],
    ], [16, 18], 4, 3), tr(lang, 'По месяцам', 'Monthly', 'Oylik'));
  }

  return wb;
}

async function reportGL(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.financial.glSummary(range);
  if (!data) throw new Error(tr(lang, 'Нет данных GL за период', 'No GL data for period', "Davr uchun GL ma'lumoti yo'q"));

  const wb = XLSX.utils.book_new();

  const laborH = lang === 'ru' ? ['Статья', 'Сумма (UZS)'] : lang === 'uz' ? ['Modda', 'Summa (UZS)'] : ['Line', 'Amount (UZS)'];
  const lb = data.laborBreakdown;
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'ФОТ (по видам)', 'Labor Breakdown', 'Ish haqi (turlari)'), range),
    [laborH,
      [tr(lang, 'Тариф', 'Tariff', 'Tarif'), lb.tariff],
      [tr(lang, 'Премия', 'Incentive', 'Rag\'batlantirish'), lb.incentive],
      [tr(lang, 'Бонус', 'Bonus', 'Bonus'), lb.bonus],
      [tr(lang, 'Штраф', 'Penalty', 'Jarima'), lb.penalty],
      [], [tr(lang, 'ИТОГО', 'TOTAL', 'JAMI'), lb.total],
    ],
  ], [22, 18], 4, -1), tr(lang, 'ФОТ', 'Labor', 'Ish haqi'));

  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Расчёты с поставщиками', 'Payables', 'Yetkazib beruvchilar bilan hisob'), range),
    [laborH,
      [tr(lang, 'Выставлено', 'Invoiced', 'Hisob-faktura'), data.payables.invoiced],
      [tr(lang, 'Оплачено', 'Paid', "To'langan"), data.payables.paid],
      [tr(lang, 'Изменение задолженности', 'Net Change', "Qarz o'zgarishi"), data.payables.netChange],
    ],
  ], [26, 18], 4, -1), tr(lang, 'Поставщики', 'Payables', 'Yetkazib beruvchilar'));

  if (data.taxes.lines.length) {
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'Налоги', 'Taxes', 'Soliqlar'), range),
      [laborH, ...data.taxes.lines.map(l => [l.name, l.amount]), [], [tr(lang, 'ИТОГО', 'TOTAL', 'JAMI'), data.taxes.total]],
    ], [26, 18], 4, -1), tr(lang, 'Налоги', 'Taxes', 'Soliqlar'));
  }

  if (data.cashPositions.length) {
    const cpH = lang === 'ru' ? ['Счёт', 'Приход', 'Расход', 'Нетто'] : lang === 'uz' ? ['Hisob', 'Kirim', 'Chiqim', 'Neto'] : ['Account', 'Incoming', 'Outgoing', 'Net'];
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'Движение по счетам', 'Cash Positions', 'Hisoblar boʻyicha harakat'), range),
      [cpH, ...data.cashPositions.map(c => [c.account, c.incoming, c.outgoing, c.net])],
    ], [24, 16, 16, 16], 4, 3), tr(lang, 'Счета', 'Cash Positions', 'Hisoblar'));
  }

  if (data.income.lines.length) {
    addSheet(wb, buildSheet([
      meta(lang, tr(lang, 'Доходы', 'Income', 'Daromadlar'), range),
      [laborH, ...data.income.lines.map(l => [l.name, l.amount]),
        [tr(lang, 'Скидки', 'Discounts', 'Chegirmalar'), data.income.discounts],
        [], [tr(lang, 'ИТОГО', 'TOTAL', 'JAMI'), data.income.total]],
    ], [26, 18], 4, -1), tr(lang, 'Доходы', 'Income', 'Daromadlar'));
  }

  return wb;
}

async function reportInvoices(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.financial.invoices(range as 'today' | '7days' | '30days');
  if (!data.length) throw new Error(tr(lang, 'Нет накладных за период', 'No invoices for period', "Davr uchun hisob-fakturalar yo'q"));

  const totalAmount = data.reduce((s, d) => s + d.amount, 0);

  const header = lang === 'ru'
    ? ['#', 'Поставщик', 'Дата', 'Сумма (UZS)', 'Статус']
    : lang === 'uz'
    ? ['#', 'Yetkazib beruvchi', 'Sana', 'Summa (UZS)', 'Holat']
    : ['#', 'Supplier', 'Date', 'Amount (UZS)', 'Status'];

  const rows: (string | number)[][] = data
    .sort((a, b) => b.amount - a.amount)
    .map((d, i) => [i + 1, d.supplier, d.date, d.amount, d.status]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, '', totalAmount, ''];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Накладные поставщиков', 'Supplier Invoices', "Yetkazib beruvchi hisob-fakturalari"), range),
    [header, ...rows, [], totals],
  ], [4, 28, 14, 16, 14], 4, 3), tr(lang, 'Накладные', 'Invoices', 'Hisob-fakturalar'));
  return wb;
}

async function reportAbc(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.sales.abc(range);
  if (!data.length) throw new Error(tr(lang, 'Нет данных за период', 'No data for period', "Davr uchun ma'lumot yo'q"));

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);

  const header = lang === 'ru'
    ? ['#', 'Блюдо', 'Категория', 'Выручка (UZS)', 'Доля', 'Кол-во', 'Ср. цена (UZS)', 'ABC (выручка)', 'ABC (кол-во)', 'ABC (маржа)']
    : lang === 'uz'
    ? ['#', 'Taom', 'Kategoriya', 'Tushum (UZS)', 'Ulush', 'Soni', "O'rt. narx (UZS)", 'ABC (tushum)', 'ABC (soni)', 'ABC (marja)']
    : ['#', 'Dish', 'Category', 'Revenue (UZS)', 'Share', 'Qty', 'Avg price (UZS)', 'ABC (revenue)', 'ABC (qty)', 'ABC (margin)'];

  const rows: (string | number)[][] = data
    .sort((a, b) => b.revenue - a.revenue)
    .map((d, i) => [i + 1, d.name, d.cat, d.revenue, pct(d.revenue, totalRev), d.qty, d.avgPrice, d.abcRevenue, d.abcQty, d.abcProfit]);

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'ABC-анализ меню', 'Menu ABC Analysis', 'Menyu ABC-tahlili'), range),
    [header, ...rows],
  ], [4, 32, 18, 16, 10, 8, 14, 12, 12, 12], 4, 3), tr(lang, 'ABC', 'ABC', 'ABC'));
  return wb;
}

// Hourly is inherently a single-day breakdown (iiko's HourClose dimension
// isn't averaged across days server-side) — when a custom range is picked
// we use its start date as the day to inspect, same as picking a single
// past day from the calendar.
async function reportHourly(_range: ReportRange, lang: Language, customFrom?: string): Promise<XLSX.WorkBook> {
  const data = await traceApi.sales.hourly(customFrom);
  if (!data.length) throw new Error(tr(lang, 'Нет данных за сегодня', 'No data for today', "Bugun uchun ma'lumot yo'q"));

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrd = data.reduce((s, d) => s + d.orders, 0);
  const sorted = [...data].sort((a, b) => a.hour - b.hour);
  const avgRevPerHour = totalRev / Math.max(1, sorted.length);

  const peak = [...data].sort((a, b) => b.revenue - a.revenue).slice(0, 3);
  // "Quiet but open" hours: below half the average, excluding near-zero
  // hours that are almost certainly outside opening hours (no orders at
  // all) — those aren't a staffing problem, they're just closed.
  const quiet = sorted.filter(d => d.orders > 0 && d.revenue < avgRevPerHour * 0.5);

  const header = lang === 'ru'
    ? ['Час', 'Выручка (UZS)', 'Доля выручки', 'Заказов', 'Доля заказов', 'Инсайт']
    : lang === 'uz'
    ? ['Soat', 'Tushum (UZS)', 'Tushum ulushi', 'Buyurtmalar', 'Buyurtma ulushi', 'Tahlil']
    : ['Hour', 'Revenue (UZS)', 'Rev. share', 'Orders', 'Order share', 'Insight'];

  const peakSet = new Set(peak.map(d => d.h));
  const quietSet = new Set(quiet.map(d => d.h));
  const peakLabel = tr(lang, '🔥 Пик', '🔥 Peak', '🔥 Cho\'qqi');
  const quietLabel = tr(lang, '💤 Затишье', '💤 Slow', '💤 Sokin');

  const rows: (string | number)[][] = sorted.map(d => [
    d.h, d.revenue, pct(d.revenue, totalRev), d.orders, pct(d.orders, totalOrd),
    peakSet.has(d.h) ? peakLabel : quietSet.has(d.h) ? quietLabel : '',
  ]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = [totalLabel, totalRev, '100%', totalOrd, '100%', ''];

  const peakHoursStr = peak.map(d => `${d.h}:00`).join(', ');
  const quietHoursStr = quiet.length ? quiet.map(d => `${d.h}:00`).join(', ') : tr(lang, 'нет', 'none', 'yo\'q');

  const insightRows: (string | number)[][] = [
    [tr(lang,
      `🔥 Пиковые часы (${peakHoursStr}) дают ${pct(peak.reduce((s, d) => s + d.revenue, 0), totalRev)} выручки — держите полный состав смены на эти часы.`,
      `🔥 Peak hours (${peakHoursStr}) drive ${pct(peak.reduce((s, d) => s + d.revenue, 0), totalRev)} of revenue — keep full staffing through these hours.`,
      `🔥 Cho'qqi soatlar (${peakHoursStr}) tushumning ${pct(peak.reduce((s, d) => s + d.revenue, 0), totalRev)} beradi — shu soatlarda to'liq xodim tarkibini saqlang.`)],
    [tr(lang,
      `💤 Затишье: ${quietHoursStr} — открыто, но выручка < 50% от среднечасовой. Кандидат на сокращение смены или промо в эти часы.`,
      `💤 Slow hours: ${quietHoursStr} — open but revenue < 50% of hourly average. Candidate for a shorter shift or a promo in this window.`,
      `💤 Sokin soatlar: ${quietHoursStr} — ochiq, lekin tushum soatlik o'rtachaning 50% dan kam. Smenani qisqartirish yoki promo uchun nomzod.`)],
  ];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Продажи по часам', 'Hourly Sales', 'Soatlik sotuvlar'), 'today', customFrom),
    [header, ...rows, [], totals],
    insightRows,
  ], [10, 16, 13, 10, 13, 16], 4, 3), tr(lang, 'По часам', 'Hourly', 'Soatlik'));
  return wb;
}

async function reportStaffProfitability(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const result = await traceApi.operations.staffProfitability(range as 'today' | '7days' | '30days');
  if (!result.rows.length) throw new Error(tr(lang, 'Нет данных по персоналу', 'No staff data', "Xodimlar bo'yicha ma'lumot yo'q"));

  const totalRev = result.rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = result.rows.reduce((s, r) => s + (r.profit ?? 0), 0);

  const header = lang === 'ru'
    ? ['#', 'Сотрудник', 'Выручка (UZS)', 'Заказов', 'Ср. чек (UZS)', 'ЗП (UZS)', 'Прибыль (UZS)', 'Рентабельность %', 'ROI %']
    : lang === 'uz'
    ? ['#', 'Xodim', 'Tushum (UZS)', 'Buyurtmalar', "O'rt. chek (UZS)", 'Maosh (UZS)', 'Foyda (UZS)', 'Rentabellik %', 'ROI %']
    : ['#', 'Staff member', 'Revenue (UZS)', 'Orders', 'Avg Check (UZS)', 'Salary (UZS)', 'Profit (UZS)', 'Profitability %', 'ROI %'];

  const rows: (string | number)[][] = result.rows
    .sort((a, b) => b.revenue - a.revenue)
    .map((r, i) => [i + 1, r.name, r.revenue, r.orders, r.avgCheck, r.salaryCost ?? '—', r.profit ?? '—', r.profitabilityPct ?? '—', r.roi ?? '—']);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, totalRev, '', '', '', totalProfit, '', ''];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Рентабельность персонала', 'Staff Profitability', 'Xodimlar rentabelligi'), range),
    [header, ...rows, [], totals],
  ], [4, 26, 16, 10, 14, 14, 14, 15, 8], 4, 3), tr(lang, 'Персонал', 'Staff', 'Xodimlar'));
  return wb;
}

async function reportStaffAbc(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const result = await traceApi.operations.staffAbc(range as 'today' | '7days' | '30days');
  if (!result.rows.length) throw new Error(tr(lang, 'Нет данных по персоналу', 'No staff data', "Xodimlar bo'yicha ma'lumot yo'q"));

  const header = lang === 'ru'
    ? ['#', 'Официант', 'Выручка (UZS)', 'Заказов', 'Ср. чек (UZS)', 'Ср/день (UZS)', 'Доля', 'Накопит. доля', 'ABC']
    : lang === 'uz'
    ? ['#', 'Ofitsiant', 'Tushum (UZS)', 'Buyurtmalar', "O'rt. chek (UZS)", "O'rt/kun (UZS)", 'Ulush', 'Jamlanma ulush', 'ABC']
    : ['#', 'Waiter', 'Revenue (UZS)', 'Orders', 'Avg Check (UZS)', 'Avg/day (UZS)', 'Share', 'Cum. share', 'ABC'];

  const rows: (string | number)[][] = result.rows
    .sort((a, b) => b.revenue - a.revenue)
    .map((r, i) => [i + 1, r.name, r.revenue, r.orders, r.avgCheck, r.avgPerDay, `${(r.share * 100).toFixed(1)}%`, `${(r.cumShare * 100).toFixed(1)}%`, r.abc]);

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'ABC-анализ официантов', 'Staff ABC Analysis', 'Ofitsiantlar ABC-tahlili'), range),
    [header, ...rows],
  ], [4, 26, 16, 10, 14, 14, 10, 14, 6], 4, 3), tr(lang, 'ABC официантов', 'Staff ABC', 'Ofitsiantlar ABC'));
  return wb;
}

// A waiter is flagged when their void count clears both a floor (so one
// waiter with 2 voids on a slow day doesn't get flagged) and a multiple of
// the team's own average — the average is the fraud/error signal, a fixed
// number isn't (a 10-waiter fine-dining floor and a 2-waiter kiosk don't
// share one sane threshold).
const VOID_COUNT_FLOOR = 3;
const VOID_AVG_MULTIPLIER = 2;

async function reportVoidTracker(range: ReportRange, lang: Language, customFrom?: string, customTo?: string): Promise<XLSX.WorkBook> {
  const data = await traceApi.operations.voidTracker(range, customFrom, customTo);
  if (!data.length) throw new Error(tr(lang, 'Отмен не зафиксировано', 'No voids recorded', "Bekor qilishlar qayd etilmagan"));

  const totalVoids = data.reduce((s, d) => s + d.voidCount, 0);
  const avgVoids = totalVoids / data.length;
  const flagged = data.filter(d => d.voidCount >= VOID_COUNT_FLOOR && d.voidCount >= avgVoids * VOID_AVG_MULTIPLIER);

  const header = lang === 'ru'
    ? ['#', 'Официант', 'Кол-во отмен/удалений', 'Первая отмена', 'Флаг']
    : lang === 'uz'
    ? ['#', 'Ofitsiant', "Bekor qilish/o'chirish soni", 'Birinchi bekor qilish', 'Belgi']
    : ['#', 'Waiter', 'Void/delete count', 'First void', 'Flag'];

  const flagLabel = tr(lang, '⚠ ВЫШЕ НОРМЫ', '⚠ ABOVE NORM', '⚠ ME\'YORDAN YUQORI');
  const rows: (string | number)[][] = data
    .sort((a, b) => b.voidCount - a.voidCount)
    .map((d, i) => [
      i + 1, d.waiter, d.voidCount, d.firstVoidAt,
      (d.voidCount >= VOID_COUNT_FLOOR && d.voidCount >= avgVoids * VOID_AVG_MULTIPLIER) ? flagLabel : '',
    ]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, totalVoids, '', ''];

  const insightRows: (string | number)[][] = flagged.length === 0
    ? [[tr(lang,
        `Средний показатель отмен — ${avgVoids.toFixed(1)} на сотрудника. Аномалий не выявлено.`,
        `Average void count is ${avgVoids.toFixed(1)} per staff member. No anomalies detected.`,
        `O'rtacha bekor qilish — xodimga ${avgVoids.toFixed(1)}. Anomaliya aniqlanmadi.`)]]
    : [
        [tr(lang,
          `⚠ ${flagged.length} сотрудник(ов) отменяют в ${VOID_AVG_MULTIPLIER}× больше среднего (${avgVoids.toFixed(1)}) — стоит выяснить причину (обучение, ошибки ввода или злоупотребление):`,
          `⚠ ${flagged.length} staff member(s) void at ${VOID_AVG_MULTIPLIER}× the average (${avgVoids.toFixed(1)}) — worth a conversation (training gap, input errors, or misuse):`,
          `⚠ ${flagged.length} xodim o'rtachadan (${avgVoids.toFixed(1)}) ${VOID_AVG_MULTIPLIER}× ko'p bekor qilmoqda — sababini aniqlash kerak:`)],
        ...flagged.map(d => [`  ${d.waiter}: ${d.voidCount} (${tr(lang, 'в', 'vs', 'vs')} ${avgVoids.toFixed(1)} ${tr(lang, 'средних', 'avg', 'o\'rtacha')})`]),
      ];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Отмены и удаления', 'Voids & Cancellations', "Bekor qilishlar va o'chirishlar"), range ?? 'today', customFrom, customTo),
    [header, ...rows, [], totals],
    insightRows,
  ], [4, 26, 20, 20, 16], 4, 3), tr(lang, 'Отмены', 'Voids', 'Bekor qilishlar'));
  return wb;
}

async function reportTableRevenue(range: ReportRange, lang: Language): Promise<XLSX.WorkBook> {
  const days = range === 'today' ? 1 : range === '7days' ? 7 : 30;
  const data = await traceApi.operations.tableRevenue(days);
  if (!data.length) throw new Error(tr(lang, 'Нет данных по столам', 'No table data', "Stollar bo'yicha ma'lumot yo'q"));

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrd = data.reduce((s, d) => s + d.orders, 0);

  const header = lang === 'ru'
    ? ['#', 'Стол №', 'Выручка (UZS)', 'Доля выручки', 'Заказов', 'Ср. чек (UZS)']
    : lang === 'uz'
    ? ['#', 'Stol №', 'Tushum (UZS)', 'Tushum ulushi', 'Buyurtmalar', "O'rt. chek (UZS)"]
    : ['#', 'Table #', 'Revenue (UZS)', 'Rev. share', 'Orders', 'Avg Check (UZS)'];

  const rows: (string | number)[][] = data
    .sort((a, b) => b.revenue - a.revenue)
    .map((d, i) => [i + 1, d.table, d.revenue, pct(d.revenue, totalRev), d.orders, d.orders > 0 ? Math.round(d.revenue / d.orders) : 0]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, totalRev, '100%', totalOrd, totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Выручка по столам', 'Revenue by Table', 'Stollar boʻyicha tushum'), range),
    [header, ...rows, [], totals],
  ], [4, 10, 16, 13, 10, 14], 4, 3), tr(lang, 'Столы', 'Tables', 'Stollar'));
  return wb;
}

async function reportDelivery(lang: Language): Promise<XLSX.WorkBook> {
  const data = await traceApi.operations.delivery();
  if (!data.length) throw new Error(tr(lang, 'Нет заказов на доставку', 'No delivery orders', "Yetkazib berish buyurtmalari yo'q"));

  const totalSum = data.reduce((s, d) => s + d.sum, 0);

  const header = lang === 'ru'
    ? ['#', '№ заказа', 'Статус', 'Сумма (UZS)', 'Обновлён']
    : lang === 'uz'
    ? ['#', 'Buyurtma №', 'Holat', 'Summa (UZS)', 'Yangilangan']
    : ['#', 'Order #', 'Status', 'Amount (UZS)', 'Updated'];

  const rows: (string | number)[][] = data
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((d, i) => [i + 1, d.number ?? d.id, d.status, d.sum, d.updatedAt]);

  const totalLabel = tr(lang, 'ИТОГО', 'TOTAL', 'JAMI');
  const totals = ['', totalLabel, '', totalSum, ''];

  const wb = XLSX.utils.book_new();
  addSheet(wb, buildSheet([
    meta(lang, tr(lang, 'Заказы на доставку', 'Delivery Orders', "Yetkazib berish buyurtmalari"), 'today'),
    [header, ...rows, [], totals],
  ], [4, 14, 14, 16, 20], 4, 3), tr(lang, 'Доставка', 'Delivery', 'Yetkazib berish'));
  return wb;
}

// ── Template definitions ──────────────────────────────────────────────────────

type L3 = [string, string, string];
const REPORT_TEMPLATES: { id: string; key: string; icon: string; cat: ReportCat2; source: string; fn: Function; needsRange: boolean; desc: L3 }[] = [
  { id: 'r1',  key: 'report_sales_by_dish',  icon: 'ph-trend-up',      cat: 'sales',   source: 'OLAP',   fn: reportSalesByDish,        needsRange: true,  desc: ['Количество, выручка, доли и средняя цена по каждому блюду', 'Quantity, revenue, shares and average price per dish', "Har bir taom bo'yicha soni, tushum, ulush va o'rtacha narx"] },
  { id: 'r2',  key: 'report_sales_by_cat',   icon: 'ph-chart-bar',     cat: 'sales',   source: 'OLAP',   fn: reportSalesByCat,         needsRange: true,  desc: ['Выручка и чек по категориям меню', 'Revenue and check by menu category', "Menyu toifalari bo'yicha tushum va chek"] },
  { id: 'r3',  key: 'report_employees',      icon: 'ph-users',         cat: 'staff',   source: 'Server', fn: reportStaff,              needsRange: false, desc: ['Список сотрудников и их роли', 'Staff list and roles', "Xodimlar ro'yxati va rollari"] },
  { id: 'r4',  key: 'report_shifts',         icon: 'ph-cash-register', cat: 'finance', source: 'Server', fn: reportShifts,             needsRange: true,  desc: ['Кассовые смены, наличные и расхождения', 'Till shifts, cash and discrepancies', 'Kassa smenalari, naqd pul va farqlar'] },
  { id: 'r5',  key: 'report_stock',          icon: 'ph-package',       cat: 'stock',   source: 'Server', fn: reportStock,              needsRange: true,  desc: ['Остатки и движение товаров на складе', 'Stock levels and movement', "Ombordagi qoldiq va harakat"] },
  { id: 'r6',  key: 'report_writeoffs',      icon: 'ph-trash',         cat: 'stock',   source: 'OLAP',   fn: reportWriteoffs,          needsRange: true,  desc: ['Акты списания по товарам и причинам', 'Write-offs by item and reason', "Mahsulot va sabab bo'yicha hisobdan chiqarish"] },
  { id: 'r7',  key: 'report_pl',             icon: 'ph-wallet',        cat: 'finance', source: 'Server', fn: reportPL,                 needsRange: true,  desc: ['Выручка, себестоимость, расходы и прибыль', 'Revenue, cost, expenses and profit', 'Tushum, tannarx, xarajat va foyda'] },
  { id: 'r8',  key: 'report_gl',             icon: 'ph-book-open',     cat: 'finance', source: 'Server', fn: reportGL,                 needsRange: true,  desc: ['Обороты по счетам учёта', 'Turnover by ledger account', "Hisob raqamlari bo'yicha aylanma"] },
  { id: 'r9',  key: 'report_invoices',       icon: 'ph-receipt',       cat: 'finance', source: 'Server', fn: reportInvoices,           needsRange: true,  desc: ['Приходные накладные от поставщиков', 'Supplier invoices', "Yetkazib beruvchilar yuk xatlari"] },
  { id: 'r10', key: 'report_abc',            icon: 'ph-chart-pie',     cat: 'sales',   source: 'OLAP',   fn: reportAbc,                needsRange: true,  desc: ['Классы A, B, C по выручке и количеству', 'A, B, C classes by revenue and quantity', "Tushum va soni bo'yicha A, B, C sinflar"] },
  { id: 'r11', key: 'report_hourly',         icon: 'ph-clock',         cat: 'sales',   source: 'OLAP',   fn: reportHourly,             needsRange: true,  desc: ['Выручка и заказы по часам дня', 'Revenue and orders by hour', "Soatlar bo'yicha tushum va buyurtmalar"] },
  { id: 'r12', key: 'report_staff_profit',   icon: 'ph-user-check',    cat: 'staff',   source: 'Server', fn: reportStaffProfitability, needsRange: true,  desc: ['Сколько выручки приносит каждый сотрудник', 'Revenue each employee brings in', 'Har bir xodim keltiradigan tushum'] },
  { id: 'r13', key: 'report_staff_abc',      icon: 'ph-medal',         cat: 'staff',   source: 'OLAP',   fn: reportStaffAbc,           needsRange: true,  desc: ['Официанты по классам A, B, C', 'Waiters by A, B, C class', "A, B, C sinflar bo'yicha ofitsiantlar"] },
  { id: 'r14', key: 'report_voids',          icon: 'ph-x-circle',      cat: 'staff',   source: 'Server', fn: reportVoidTracker,        needsRange: true,  desc: ['Отмены и удаления, кто разрешил', 'Voids and deletions, who approved', "Bekor qilish va o'chirishlar, kim ruxsat bergan"] },
  { id: 'r15', key: 'report_table_revenue',  icon: 'ph-squares-four',  cat: 'sales',   source: 'OLAP',   fn: reportTableRevenue,       needsRange: true,  desc: ['Выручка и чек по каждому столу', 'Revenue and check per table', "Har bir stol bo'yicha tushum va chek"] },
  { id: 'r16', key: 'report_delivery',       icon: 'ph-truck',         cat: 'sales',   source: 'Server', fn: reportDelivery,           needsRange: false, desc: ['Заказы на доставку за сегодня', "Today's delivery orders", 'Bugungi yetkazib berish buyurtmalari'] },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const Reports: React.FC<{
  lang: Language;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onNavigate?: (view: ViewState) => void;
}> = ({ lang, onShowToast, onNavigate }) => {
  const t = TRANSLATIONS[lang];
  const T = (ru: string, en: string, uz: string) => tr(lang, ru, en, uz);
  const [cat, setCat] = useState<ReportCat2>('all');
  const [period, setPeriod] = useState<PeriodValue>({ range: '7days', custom: null });
  const range = period.range as ReportRange;
  const customRange = period.custom;
  const [loading, setLoading] = useState<string | null>(null);
  // Void/deletion report is sourced from realtime_events (TRACEPLUGIN-only) —
  // always empty for Poster, which threw a misleading "no voids recorded"
  // instead of "not available for your POS". Hidden below instead.
  const [isPoster, setIsPoster] = useState(false);
  useEffect(() => { traceApi.sales.status().then(s => setIsPoster(!!s.poster)).catch(() => {}); }, []);

  const CATS: { key: ReportCat2; label: string }[] = [
    { key: 'all',     label: T('Все', 'All', 'Barchasi') },
    { key: 'sales',   label: T('Продажи', 'Sales', 'Sotuvlar') },
    { key: 'staff',   label: T('Персонал', 'Staff', 'Xodimlar') },
    { key: 'stock',   label: T('Склад', 'Stock', 'Ombor') },
    { key: 'finance', label: T('Финансы', 'Finance', 'Moliya') },
  ];

  const periodText = range === 'custom' && customRange ? rdRange(customRange.from, customRange.to, lang)
    : range === 'today' ? T('сегодня', 'today', 'bugun') : range === '7days' ? T('7 дней', '7 days', '7 kun') : T('30 дней', '30 days', '30 kun');

  // r7 (P&L) and r8 (GL) both call /financial/pl and /financial/gl-summary,
  // which are 100% iiko-only with no Poster branch — same gap as the
  // Financial page's P&L tab. r14 (voids) is realtime_events/plugin-only.
  const templates = isPoster ? REPORT_TEMPLATES.filter(r => !['r7', 'r8', 'r14'].includes(r.id)) : REPORT_TEMPLATES;
  const filtered = cat === 'all' ? templates : templates.filter(r => r.cat === cat);
  const count = (k: ReportCat2) => k === 'all' ? templates.length : templates.filter(r => r.cat === k).length;

  const BRAND = T('TRACE · Отчёты', 'TRACE · Reports', 'TRACE · Hisobotlar');

  const downloadWorkbook = async (wb: XLSX.WorkBook, format: ExportFormat, filenameBase: string) => {
    if (format === 'xlsx') {
      XLSX.writeFile(wb, `${filenameBase}.xlsx`);
    } else {
      (await workbookToPdf(wb, BRAND)).save(`${filenameBase}.pdf`);
    }
  };

  const generate = async (id: string, fn: Function, needsRange: boolean, label: string, format: ExportFormat) => {
    if (loading) return;
    setLoading(`${id}:${format}`);
    try {
      const wb: XLSX.WorkBook = needsRange
        ? await fn(range, lang, customRange?.from, customRange?.to)
        : await fn(lang);
      await downloadWorkbook(wb, format, `trace-${id}-${range}-${today()}`);
      onShowToast?.(T(`${label} — скачан`, `${label} — downloaded`, `${label} — yuklab olindi`), 'success');
    } catch (e: any) {
      onShowToast?.(e?.message && e.message.length < 80 ? e.message : T('Не получилось сформировать отчёт', "Couldn't build the report", "Hisobotni tuzib bo'lmadi"), 'error');
    } finally {
      setLoading(null);
    }
  };

  const quick = async (format: ExportFormat) => {
    if (loading) return;
    setLoading(`quick:${format}`);
    try {
      const wb = await reportQuickSummary(range, lang, customRange?.from, customRange?.to);
      await downloadWorkbook(wb, format, `trace-summary-${range}-${today()}`);
      onShowToast?.(T('Сводный отчёт скачан', 'Summary report downloaded', 'Umumiy hisobot yuklab olindi'), 'success');
    } catch {
      onShowToast?.(T('Не получилось сформировать отчёт', "Couldn't build the report", "Hisobotni tuzib bo'lmadi"), 'error');
    } finally {
      setLoading(null);
    }
  };

  const Btn: React.FC<{ id: string; format: ExportFormat; solid?: boolean; onClick: () => void }> = ({ id, format, solid, onClick }) => {
    const busy = loading === `${id}:${format}`;
    return (
      <button type="button" className={`btn${solid ? ' solid' : ''}${busy ? ' busy' : ''}`} disabled={!!loading && !busy} onClick={onClick}>
        <i className={`ph ${busy ? 'ph-circle-notch spin' : format === 'xlsx' ? 'ph-file-xls' : 'ph-file-pdf'}`} aria-hidden="true" />{format === 'xlsx' ? 'Excel' : 'PDF'}
      </button>
    );
  };

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>{T('Отчёты', 'Reports', 'Hisobotlar')}</h1>
          <div className="sub">{isPoster
            ? T('Реальные данные. Excel с долями, итогами и автофильтром или готовый PDF.', 'Real data. Excel with shares, totals and auto-filter, or a ready PDF.', "Haqiqiy ma'lumotlar. Ulush, jami va avtofiltrli Excel yoki tayyor PDF.")
            : T('Реальные данные из iiko. Excel с долями, итогами и автофильтром или готовый PDF.', 'Real iiko data. Excel with shares, totals and auto-filter, or a ready PDF.', "iiko'dan haqiqiy ma'lumotlar. Ulush, jami va avtofiltrli Excel yoki tayyor PDF.")}</div>
        </div>
        <PeriodSeg lang={lang} value={period} onChange={setPeriod} />
      </div>

      <div className="rep-hero rise">
        <section className="card" aria-labelledby="h-sum">
          <h2 id="h-sum">{T('Сводный отчёт', 'Summary report', 'Umumiy hisobot')}</h2>
          <p>{T(`Пять листов: сводка, категории, блюда, смены, списания. Период: ${periodText}.`, `Five sheets: summary, categories, dishes, shifts, write-offs. Period: ${periodText}.`, `Besh varaq: xulosa, toifalar, taomlar, smenalar, hisobdan chiqarish. Davr: ${periodText}.`)}</p>
          <div className="rep-acts"><Btn id="quick" format="xlsx" solid onClick={() => quick('xlsx')} /><Btn id="quick" format="pdf" onClick={() => quick('pdf')} /></div>
        </section>
        <section className="card" aria-labelledby="h-sch">
          <h2 id="h-sch">{T('По расписанию', 'On a schedule', "Jadval bo'yicha")}</h2>
          <p>{T('Сводка каждый вечер или неделя по понедельникам, в Telegram или на почту.', 'A summary every evening or the week on Mondays, to Telegram or email.', "Har kech xulosa yoki dushanba kuni hafta, Telegram yoki pochtaga.")}</p>
          <button type="button" className="btn" onClick={() => onNavigate?.('settings')}><i className="ph ph-calendar-check" aria-hidden="true" />{T('Настроить рассылку', 'Set up delivery', "Yuborishni sozlash")}</button>
        </section>
      </div>

      <section className="band" aria-labelledby="h-tpl">
        <div className="rep-tools">
          <h2 id="h-tpl">{T('Шаблоны отчётов', 'Report templates', 'Hisobot shablonlari')}</h2>
          <span className="spacer" />
          <div className="seg-scroll"><div className="seg small" role="group" aria-label={T('Раздел', 'Section', "Bo'lim")}>
            {CATS.filter(c => count(c.key) > 0).map(c => <button key={c.key} type="button" aria-pressed={cat === c.key} onClick={() => setCat(c.key)}>{c.label}<span className="faint" style={{ marginLeft: 5 }}>{count(c.key)}</span></button>)}
          </div></div>
        </div>
        <div>
          {filtered.map(r => {
            const label = t[r.key as keyof typeof t] as string;
            return (
              <div className="rep" key={r.id}>
                <span className="rep-ico"><i className={`ph ${r.icon}`} aria-hidden="true" /></span>
                <div style={{ minWidth: 0 }}>
                  <b>{label}</b>
                  <span className="rep-d">{tr(lang, ...r.desc)} · {r.needsRange ? periodText : T('сегодня', 'today', 'bugun')}</span>
                </div>
                <div className="rep-acts">
                  <Btn id={r.id} format="xlsx" onClick={() => generate(r.id, r.fn, r.needsRange, label, 'xlsx')} />
                  <Btn id={r.id} format="pdf" onClick={() => generate(r.id, r.fn, r.needsRange, label, 'pdf')} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
};
