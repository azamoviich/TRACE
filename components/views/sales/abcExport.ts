// ABC export (Excel workbook with per-section sheets, landscape PDF) and the
// plain-language takeaways printed at the top of both. Moved out of the old
// Sales page unchanged so the redesigned menu table keeps the same exports.
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { tr } from '../../../constants';
import { Language } from '../../../types';
import { AbcRow } from '../../../services/traceApi';

export function makeAbcExport(filtered: AbcRow[], lang: Language, rangeLabel: string) {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  // ── Shared export helpers ─────────────────────────────────────────────────
  const GRADE_HEX: Record<'A' | 'B' | 'C', string> = { A: '22C55E', B: 'F59E0B', C: 'EF4444' };
  const GRADE_RGB: Record<'A' | 'B' | 'C', [number, number, number]> = { A: [34, 197, 94], B: [245, 158, 11], C: [239, 68, 68] };
  const BRAND_HEX = 'FF6B35';
  const BRAND_RGB: [number, number, number] = [255, 107, 53];

  const abcMeta = () => {
    const generated = new Date().toLocaleString(ru ? 'ru-RU' : isUz ? 'uz-Latn-UZ' : 'en-US');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return { rangeLabel, generated, dateStamp };
  };

  // Plain-language takeaways computed from the same numbers already on
  // screen — turns the export into something a manager acts on, not just
  // a data dump they have to re-analyze themselves.
  const buildAbcInsights = (list_?: AbcRow[]): string[] => {
    const scope = list_ ?? filtered;
    const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
    const list: string[] = [];
    const total = scope.length || 1;
    const scopeACount = scope.filter(i => i.abcRevenue === 'A').length;
    const scopeDeadWeight = scope.filter(i => i.abcRevenue === 'C' && i.velocity < 0.5).length;
    const aPct = Math.round((scopeACount / total) * 100);
    list.push(
      ru ? `${scopeACount} из ${total} позиций (${aPct}%) формируют ~80% выручки — классическое ядро Парето, держите их в наличии всегда.`
        : isUz ? `${scopeACount}/${total} taom (${aPct}%) tushumning ~80% ini beradi — doim yetkazib turing.`
        : `${scopeACount} of ${total} items (${aPct}%) drive ~80% of revenue — the Pareto core. Never let these run out.`
    );
    if (scopeDeadWeight > 0) {
      list.push(
        ru ? `${scopeDeadWeight} позиций — класс C по выручке при скорости <0.5/день: мёртвый груз, кандидаты на удаление или ребрендинг в меню.`
          : isUz ? `${scopeDeadWeight} taom — C toifa va kunlik tezlik <0.5: menyudan olib tashlash kandidati.`
          : `${scopeDeadWeight} items are grade C with velocity under 0.5/day — dead weight, candidates to cut or reposition.`
      );
    }
    const top = scope[0];
    if (top) {
      list.push(
        ru ? `Лидер — «${top.name}» (${top.cat}): ${fmt(top.revenue)} UZS, ${top.share}% всей выручки.`
          : isUz ? `Yetakchi — «${top.name}» (${top.cat}): ${fmt(top.revenue)} UZS, jami tushumning ${top.share}%.`
          : `Top performer — "${top.name}" (${top.cat}): ${fmt(top.revenue)} UZS, ${top.share}% of total revenue.`
      );
    }
    const withMargin = scope.filter(i => i.marginPct != null) as (AbcRow & { marginPct: number })[];
    if (withMargin.length) {
      const aMargin = withMargin.filter(i => i.abcRevenue === 'A');
      const cMargin = withMargin.filter(i => i.abcRevenue === 'C');
      if (aMargin.length) {
        const avgA = Math.round(aMargin.reduce((s, i) => s + i.marginPct, 0) / aMargin.length);
        list.push(
          ru ? `Средняя маржа топовых (A) позиций — ${avgA}%. Проверьте, нет ли среди хитов продаж позиций с маржой ниже этого уровня — их стоит переоценить.`
            : isUz ? `A toifa taomlarining o'rtacha marjasi — ${avgA}%. Shundan past marjali hit-taomlarni qaytadan narxlang.`
            : `Average margin on A-grade items is ${avgA}%. Any bestseller below that line is underpriced relative to its own peer group.`
        );
      }
      if (cMargin.length) {
        const highMarginC = cMargin.filter(i => i.marginPct > (withMargin.reduce((s, i2) => s + i2.marginPct, 0) / withMargin.length)).length;
        if (highMarginC > 0) {
          list.push(
            ru ? `${highMarginC} позиций класса C имеют маржу выше среднего — низкие продажи, но выгодны поштучно: стоит продвигать, а не убирать.`
              : isUz ? `${highMarginC} ta C toifa taom o'rtachadan yuqori marjaga ega — sotuvi kam, lekin foydali: targ'ib qiling, o'chirmang.`
              : `${highMarginC} grade-C items carry above-average margin — low volume but profitable per unit. Promote rather than cut these.`
          );
        }
      }
    }
    const byCat = new Map<string, number>();
    for (const it of scope) byCat.set(it.cat, (byCat.get(it.cat) ?? 0) + it.revenue);
    const totalRev = scope.reduce((s, i) => s + i.revenue, 0) || 1;
    const topCat = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCat && byCat.size > 1) {
      const catPct = Math.round((topCat[1] / totalRev) * 100);
      list.push(
        ru ? `Категория «${topCat[0]}» даёт ${catPct}% выручки — при её просадке пострадает вся выручка непропорционально.`
          : isUz ? `«${topCat[0]}» kategoriyasi tushumning ${catPct}% ini beradi — bu toifa qulasa, umumiy tushum keskin tushadi.`
          : `Category "${topCat[0]}" accounts for ${catPct}% of revenue — a dip there hits total revenue disproportionately.`
      );
    }
    return list;
  };

  const abcFooterText = () => ru ? 'Сделано с TRACE-OS · trace-os.uz' : isUz ? 'TRACE-OS bilan yaratildi · trace-os.uz' : 'Made by TRACE · trace-os.uz';

  // Section keyword matching — mirrors TRACEBACKEND's CATEGORY_ALIASES so
  // "Кухня"/"Kitchen", "Бар"/"Bar" etc. all map to the same logical section
  // regardless of which language/spelling this tenant's iiko categories use.
  const ABC_SECTIONS: { id: string; label: { ru: string; en: string; uz: string }; keywords: string[] }[] = [
    { id: 'kitchen', label: { ru: 'Кухня', en: 'Kitchen', uz: 'Oshxona' }, keywords: ['кухня', 'kitchen', 'oshxona'] },
    { id: 'bar', label: { ru: 'Бар', en: 'Bar', uz: 'Bar' }, keywords: ['бар', 'bar'] },
    { id: 'bakery', label: { ru: 'Выпечка', en: 'Bakery', uz: 'Non mahsulotlari' }, keywords: ['выпечк', 'bakery', 'пекар', 'хлеб', 'bread', 'non mahsulot', 'nonvoy'] },
    { id: 'dessert', label: { ru: 'Десерты', en: 'Desserts', uz: 'Shirinliklar' }, keywords: ['кондитер', 'десерт', 'dessert', 'shirinlik'] },
  ];
  const sectionOf = (cat: string): typeof ABC_SECTIONS[number] | null => {
    const low = cat.toLowerCase();
    return ABC_SECTIONS.find(s => s.keywords.some(k => low.includes(k))) ?? null;
  };

  // Writes one fully-styled ABC sheet (title, insights, colored table, footer)
  // into an existing workbook — shared by the overview sheet and each
  // per-section sheet (Bar/Kitchen/Bakery/Desserts) so they stay identical.
  const writeAbcSheet = (wb: ExcelJS.Workbook, sheetName: string, title: string, sheetItems: AbcRow[], sheetInsights: string[]) => {
    const { rangeLabel, generated } = abcMeta();
    const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 0 }] });

    const COLS = 14;
    ws.mergeCells(1, 1, 1, COLS);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_HEX}` } };
    ws.getRow(1).height = 26;

    ws.mergeCells(2, 1, 2, COLS);
    const metaCell = ws.getCell(2, 1);
    metaCell.value = `${ru ? 'Период' : isUz ? 'Davr' : 'Period'}: ${rangeLabel}  ·  ${ru ? 'Создано' : isUz ? 'Yaratildi' : 'Generated'}: ${generated}`;
    metaCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };

    let r = 4;
    ws.mergeCells(r, 1, r, COLS);
    ws.getCell(r, 1).value = ru ? 'Ключевые выводы' : isUz ? 'Asosiy xulosalar' : 'Key insights';
    ws.getCell(r, 1).font = { bold: true, size: 11, color: { argb: `FF${BRAND_HEX}` } };
    r++;
    for (const line of sheetInsights) {
      ws.mergeCells(r, 1, r, COLS);
      const c = ws.getCell(r, 1);
      c.value = `•  ${line}`;
      c.font = { size: 10 };
      c.alignment = { wrapText: true };
      ws.getRow(r).height = 24;
      r++;
    }
    r++;

    const headerRowIdx = r;
    const headers = [
      '#', ru ? 'Блюдо' : isUz ? 'Taom' : 'Item', ru ? 'Категория' : isUz ? 'Kategoriya' : 'Category',
      ru ? 'Выручка' : isUz ? 'Tushum' : 'Revenue', '%',
      ru ? 'Кол-во' : isUz ? 'Soni' : 'Qty', ru ? 'Ср. цена' : isUz ? "O'rt. narx" : 'Avg price',
      ru ? 'Себест.' : isUz ? 'Tannarx' : 'Cost', ru ? 'Себест/шт' : isUz ? 'Tannarx/dona' : 'Cost/unit',
      ru ? 'Фудкост %' : 'Food cost %',
      ru ? 'В день' : isUz ? 'Kuniga' : '/day',
      ru ? 'ABC Кол-во' : isUz ? 'ABC Soni' : 'ABC Qty',
      ru ? 'ABC Выручка' : isUz ? 'ABC Tushum' : 'ABC Revenue',
      ru ? 'ABC Маржа' : isUz ? 'ABC Marja' : 'ABC Margin',
    ];
    const hRow = ws.getRow(headerRowIdx);
    hRow.values = headers;
    hRow.eachCell((cell: ExcelJS.Cell) => {
      cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_HEX}` } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    hRow.height = 20;

    sheetItems.forEach((item, i) => {
      const row = ws.getRow(headerRowIdx + 1 + i);
      row.values = [
        i + 1, item.name, item.cat,
        item.revenue, item.share / 100,
        item.qty, item.avgPrice,
        (item.cost ?? 0) > 0 ? (item.cost ?? 0) : null,
        item.costPerUnit ?? null,
        item.foodCostPct != null ? item.foodCostPct / 100 : null,
        item.velocity,
        item.abcQty, item.abcRevenue, item.abcProfit,
      ];
      row.getCell(4).numFmt = '#,##0';
      row.getCell(5).numFmt = '0.0%';
      row.getCell(7).numFmt = '#,##0';
      row.getCell(8).numFmt = '#,##0';
      row.getCell(9).numFmt = '#,##0';
      row.getCell(10).numFmt = '0.0%';
      row.getCell(11).numFmt = '0.00';
      row.eachCell((c: ExcelJS.Cell) => { c.alignment = { ...c.alignment, vertical: 'middle' }; });
      if (i % 2 === 1) {
        for (let col = 1; col <= COLS; col++) {
          row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
        }
      }
      for (const col of [12, 13, 14] as const) {
        const grade = row.getCell(col).value as 'A' | 'B' | 'C';
        const cell = row.getCell(col);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GRADE_HEX[grade]}` } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });

    ws.columns = [
      { width: 4 }, { width: 30 }, { width: 16 }, { width: 13 }, { width: 8 }, { width: 8 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 10 }, { width: 8 }, { width: 11 }, { width: 12 }, { width: 11 },
    ];
    ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: COLS } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIdx }];

    const footerRow = headerRowIdx + sheetItems.length + 2;
    ws.mergeCells(footerRow, 1, footerRow, COLS);
    const footerCell = ws.getCell(footerRow, 1);
    footerCell.value = abcFooterText();
    footerCell.font = { italic: true, size: 9, color: { argb: 'FF999999' } };
  };

  const handleExcel = async () => {
    const { dateStamp } = abcMeta();
    const title = ru ? 'ABC-анализ меню' : isUz ? 'Menyu ABC tahlili' : 'Menu ABC Analysis';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TRACE-OS';
    wb.created = new Date();

    writeAbcSheet(wb, (ru ? 'Общее' : isUz ? 'Umumiy' : 'Overview'), title, filtered, buildAbcInsights(filtered));

    // One extra sheet per recognized section (Bar/Kitchen/Bakery/Desserts),
    // but only if that section actually has items in the current view —
    // a tenant without a bakery just won't get a Bakery sheet.
    for (const section of ABC_SECTIONS) {
      const sectionItems = filtered.filter(i => sectionOf(i.cat)?.id === section.id);
      if (sectionItems.length === 0) continue;
      const sectionTitle = `${title} — ${tr(lang, section.label.ru, section.label.en, section.label.uz)}`;
      writeAbcSheet(wb, tr(lang, section.label.ru, section.label.en, section.label.uz), sectionTitle, sectionItems, buildAbcInsights(sectionItems));
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TRACE-abc-analysis-${dateStamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdf = async () => {
    const { rangeLabel, generated, dateStamp } = abcMeta();
    const insights = buildAbcInsights();
    const title = ru ? 'ABC-анализ меню' : isUz ? 'Menyu ABC tahlili' : 'Menu ABC Analysis';

    const { registerCyrillicFont } = await import('../../../lib/pdfFonts');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    registerCyrillicFont(doc);
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...BRAND_RGB);
    doc.text(title, 32, 32);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`${ru ? 'Период' : isUz ? 'Davr' : 'Period'}: ${rangeLabel}  ·  ${ru ? 'Создано' : isUz ? 'Yaratildi' : 'Generated'}: ${generated}`, 32, 47);

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.text(ru ? 'Ключевые выводы' : isUz ? 'Asosiy xulosalar' : 'Key insights', 32, 68);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60);
    let y = 82;
    for (const line of insights) {
      const wrapped = doc.splitTextToSize(`•  ${line}`, pageW - 64);
      doc.text(wrapped, 32, y);
      y += wrapped.length * 11 + 4;
    }
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [[
        '#', ru ? 'Блюдо' : isUz ? 'Taom' : 'Item', ru ? 'Категория' : isUz ? 'Kategoriya' : 'Category',
        ru ? 'Выручка' : isUz ? 'Tushum' : 'Revenue', '%',
        ru ? 'Кол-во' : isUz ? 'Soni' : 'Qty', ru ? 'Ср. цена' : isUz ? "O'rt. narx" : 'Avg price',
        ru ? 'Себест.' : isUz ? 'Tannarx' : 'Cost', ru ? 'Себест/шт' : isUz ? 'Tannarx/dona' : 'Cost/unit',
        ru ? 'Фудкост %' : 'Food cost %',
        ru ? 'В день' : isUz ? 'Kuniga' : '/day',
        ru ? 'К' : isUz ? 'S' : 'Q', ru ? 'В' : isUz ? 'T' : 'R', ru ? 'М' : isUz ? 'M' : 'M',
      ]],
      body: filtered.map((item, i) => [
        i + 1, item.name, item.cat,
        item.revenue.toLocaleString('ru-RU'), `${item.share}%`,
        item.qty, item.avgPrice.toLocaleString('ru-RU'),
        (item.cost ?? 0) > 0 ? (item.cost ?? 0).toLocaleString('ru-RU') : '—',
        item.costPerUnit != null ? item.costPerUnit.toLocaleString('ru-RU') : '—',
        item.foodCostPct != null ? `${item.foodCostPct}%` : '—',
        item.velocity,
        item.abcQty, item.abcRevenue, item.abcProfit,
      ]),
      styles: { font: 'Roboto', fontSize: 7.5, cellPadding: 4 },
      headStyles: { font: 'Roboto', fillColor: BRAND_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      columnStyles: {
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' },
        11: { halign: 'center' }, 12: { halign: 'center' }, 13: { halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && [11, 12, 13].includes(data.column.index)) {
          const grade = String(data.cell.raw) as 'A' | 'B' | 'C';
          if (GRADE_RGB[grade]) {
            data.cell.styles.fillColor = GRADE_RGB[grade];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawPage: () => {
        const h = doc.internal.pageSize.getHeight();
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(abcFooterText(), 32, h - 18);
        doc.text(String(doc.getNumberOfPages()), pageW - 32, h - 18, { align: 'right' });
      },
    });

    doc.save(`TRACE-abc-analysis-${dateStamp}.pdf`);
  };

  return { handleExcel, handlePdf, buildAbcInsights, sectionOf, ABC_SECTIONS };
}
