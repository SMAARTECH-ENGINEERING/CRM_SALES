// Spreadsheets in and out of the in-browser editor (Fortune-sheet).
//
//  - .xlsx is read and written with ExcelJS, keeping values, formulas, number
//    formats, bold / italic / underline, font size and colour, fill, alignment,
//    borders, merged cells, column widths and row heights.
//  - .xls (the old binary format) and .csv are read with SheetJS: values and
//    merges come through; their formatting does not. Saving always writes .xlsx.

const PX_PER_CHAR = 7.5;
const PX_PER_POINT = 4 / 3;
const DEFAULT_COL_PX = 73;
const DEFAULT_ROW_PX = 20;

const argb = (hex) => (hex ? `FF${hex.replace('#', '').toUpperCase().padStart(6, '0').slice(-6)}` : undefined);
const hexOf = (color) => {
  const value = color?.argb;
  return typeof value === 'string' && value.length >= 6 ? `#${value.slice(-6)}` : undefined;
};
// Fortune-sheet: ht 0 centre, 1 left, 2 right; vt 0 middle, 1 top, 2 bottom.
const H_IN = { center: 0, left: 1, right: 2 };
const H_OUT = { 0: 'center', 1: 'left', 2: 'right' };
const V_IN = { middle: 0, top: 1, bottom: 2 };
const V_OUT = { 0: 'middle', 1: 'top', 2: 'bottom' };
const BORDER_STYLE_IN = { thin: 1, hair: 2, dotted: 3, dashed: 4, dashDot: 5, dashDotDot: 6, double: 7, medium: 8, mediumDashed: 9, mediumDashDot: 10, mediumDashDotDot: 11, slantDashDot: 12, thick: 13 };
const BORDER_STYLE_OUT = Object.fromEntries(Object.entries(BORDER_STYLE_IN).map(([k, v]) => [v, k]));

const columnLetter = (index) => {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const isDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());
const display = (value, numFmt) => {
  if (value === null || value === undefined) return '';
  if (isDate(value)) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && numFmt && /0\.00/.test(numFmt)) return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(value);
};

// --- reading -------------------------------------------------------------------------------

function cellFromExcel(cell) {
  let value = cell.value;
  const out = {};
  if (value && typeof value === 'object' && !isDate(value)) {
    if ('formula' in value || 'sharedFormula' in value) {
      out.f = `=${value.formula ?? value.sharedFormula}`;
      value = value.result ?? '';
    } else if ('richText' in value) value = value.richText.map((part) => part.text).join('');
    else if ('text' in value) value = value.text;
    else if ('error' in value) value = value.error;
  }
  if (isDate(value)) {
    out.v = value.toISOString().slice(0, 10);
    out.ct = { fa: 'yyyy-MM-dd', t: 'd' };
  } else if (typeof value === 'number') {
    out.v = value;
    out.ct = { fa: cell.numFmt || 'General', t: 'n' };
  } else if (value !== null && value !== undefined && value !== '') {
    out.v = String(value);
    out.ct = { fa: '@', t: 's' };
  }
  out.m = display(value, cell.numFmt);
  const { font = {}, alignment = {}, fill } = cell.style ?? {};
  if (font.bold) out.bl = 1;
  if (font.italic) out.it = 1;
  if (font.underline) out.un = 1;
  if (font.strike) out.cl = 1;
  if (font.size) out.fs = font.size;
  if (font.name) out.ff = font.name;
  if (hexOf(font.color)) out.fc = hexOf(font.color);
  if (fill?.type === 'pattern' && fill.pattern === 'solid' && hexOf(fill.fgColor)) out.bg = hexOf(fill.fgColor);
  if (alignment.horizontal in H_IN) out.ht = H_IN[alignment.horizontal];
  if (alignment.vertical in V_IN) out.vt = V_IN[alignment.vertical];
  if (alignment.wrapText) out.tb = '2';
  return out;
}

async function readXlsx(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = [];
  workbook.eachSheet((worksheet, index) => {
    const celldata = [];
    const borderInfo = [];
    const config = { merge: {}, columnlen: {}, rowlen: {}, borderInfo };
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (row.height) config.rowlen[rowNumber - 1] = Math.round(row.height * PX_PER_POINT);
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const r = rowNumber - 1;
        const c = colNumber - 1;
        if (cell.isMerged && cell.master !== cell) return;
        const v = cellFromExcel(cell);
        if (Object.keys(v).length > 1 || v.v !== undefined) celldata.push({ r, c, v });
        const border = cell.style?.border;
        if (border) {
          const side = (b) => (b?.style ? { style: BORDER_STYLE_IN[b.style] ?? 1, color: hexOf(b.color) ?? '#000000' } : undefined);
          const value = { row_index: r, col_index: c, l: side(border.left), r: side(border.right), t: side(border.top), b: side(border.bottom) };
          if (value.l || value.r || value.t || value.b) borderInfo.push({ rangeType: 'cell', value });
        }
      });
    });
    worksheet.columns?.forEach((column, i) => {
      if (column?.width) config.columnlen[i] = Math.round(column.width * PX_PER_CHAR);
    });
    for (const range of worksheet.model.merges ?? []) {
      const [from, to] = range.split(':');
      const decode = (ref) => {
        const [, letters, digits] = ref.match(/^([A-Z]+)(\d+)$/);
        const col = [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        return { r: Number(digits) - 1, c: col };
      };
      const a = decode(from);
      const b = decode(to);
      const merge = { r: a.r, c: a.c, rs: b.r - a.r + 1, cs: b.c - a.c + 1 };
      config.merge[`${a.r}_${a.c}`] = merge;
      const master = celldata.find((x) => x.r === a.r && x.c === a.c);
      if (master) master.v.mc = merge;
      else celldata.push({ r: a.r, c: a.c, v: { mc: merge } });
    }
    const id = `sheet-${index}`;
    // Formulas the grid recalculates when the cells they use change.
    const calcChain = celldata.filter((cell) => cell.v.f).map(({ r, c }) => ({ r, c, id }));
    sheets.push({ name: worksheet.name, id, order: sheets.length, status: sheets.length === 0 ? 1 : 0, celldata, calcChain, config, row: Math.max(60, worksheet.rowCount + 20), column: Math.max(26, worksheet.columnCount + 5) });
  });
  return sheets.length ? sheets : [emptySheet()];
}

async function readWithSheetJs(buffer, kind) {
  const XLSX = await import('xlsx');
  const workbook = kind === 'csv' ? XLSX.read(new TextDecoder().decode(buffer), { type: 'string', raw: false }) : XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  return workbook.SheetNames.map((name, index) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    const celldata = [];
    rows.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value === null || value === '') return;
        if (isDate(value)) celldata.push({ r, c, v: { v: value.toISOString().slice(0, 10), m: value.toISOString().slice(0, 10), ct: { fa: 'yyyy-MM-dd', t: 'd' } } });
        else if (typeof value === 'number') celldata.push({ r, c, v: { v: value, m: String(value), ct: { fa: 'General', t: 'n' } } });
        else celldata.push({ r, c, v: { v: String(value), m: String(value), ct: { fa: '@', t: 's' } } });
      })
    );
    const merge = {};
    for (const m of sheet['!merges'] ?? []) {
      const range = { r: m.s.r, c: m.s.c, rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 };
      merge[`${m.s.r}_${m.s.c}`] = range;
    }
    return { name, id: `sheet-${index}`, order: index, status: index === 0 ? 1 : 0, celldata, config: { merge }, row: Math.max(60, rows.length + 20), column: Math.max(26, (rows[0]?.length ?? 0) + 5) };
  });
}

export function emptySheet(name = 'Sheet1') {
  return { name, id: `sheet-${Date.now()}`, order: 0, status: 1, celldata: [], config: {}, row: 60, column: 26 };
}

// Any spreadsheet file -> Fortune-sheet sheets.
export async function readSpreadsheet(buffer, { fileName = '', fileType = '' } = {}) {
  const ext = fileName.split('.').pop().toLowerCase();
  if (ext === 'csv' || fileType === 'text/csv') return readWithSheetJs(buffer, 'csv');
  if (ext === 'xls' || fileType === 'application/vnd.ms-excel') return readWithSheetJs(buffer, 'xls');
  return readXlsx(buffer);
}

// --- the editor's sheets as a plain grid ------------------------------------------------------

// The cells of a sheet as rows of { value, text, style } - what the converters
// and the printer work from. Uses `data` (what the editor holds) or `celldata`.
export function sheetGrid(sheet) {
  const cells = [];
  if (Array.isArray(sheet.data)) {
    sheet.data.forEach((row, r) => row?.forEach((cell, c) => cell && cells.push({ r, c, v: cell })));
  } else {
    for (const item of sheet.celldata ?? []) if (item.v) cells.push(item);
  }
  let rows = 0;
  let cols = 0;
  for (const { r, c, v } of cells) {
    if (v.v === undefined && v.m === undefined && !v.mc && !v.bg) continue;
    rows = Math.max(rows, r + 1 + (v.mc?.rs ? v.mc.rs - 1 : 0));
    cols = Math.max(cols, c + 1 + (v.mc?.cs ? v.mc.cs - 1 : 0));
  }
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  for (const { r, c, v } of cells) if (r < rows && c < cols) grid[r][c] = v;
  return { grid, rows, cols, config: sheet.config ?? {} };
}

// --- writing ----------------------------------------------------------------------------------

function styleCell(cell, v) {
  const font = {};
  if (v.bl) font.bold = true;
  if (v.it) font.italic = true;
  if (v.un) font.underline = true;
  if (v.cl) font.strike = true;
  if (v.fs) font.size = Number(v.fs);
  if (v.fc) font.color = { argb: argb(v.fc) };
  if (typeof v.ff === 'string') font.name = v.ff;
  if (Object.keys(font).length) cell.font = font;
  if (v.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(v.bg) } };
  const alignment = {};
  if (v.ht !== undefined && H_OUT[v.ht]) alignment.horizontal = H_OUT[v.ht];
  if (v.vt !== undefined && V_OUT[v.vt]) alignment.vertical = V_OUT[v.vt];
  if (String(v.tb) === '2') alignment.wrapText = true;
  if (Object.keys(alignment).length) cell.alignment = alignment;
  if (v.ct?.fa && v.ct.fa !== 'General' && v.ct.fa !== '@') cell.numFmt = v.ct.fa;
}

function valueOf(v) {
  if (v.f) return { formula: String(v.f).replace(/^=/, ''), result: v.v };
  if (v.ct?.t === 'n' || typeof v.v === 'number') {
    const n = typeof v.v === 'number' ? v.v : Number(String(v.v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : v.v;
  }
  if (v.ct?.t === 'd' && v.v) {
    const d = new Date(v.v);
    return Number.isNaN(d.getTime()) ? v.v : d;
  }
  return v.v ?? v.m ?? null;
}

// Fortune-sheet sheets -> .xlsx bytes.
export async function writeXlsx(sheets) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CRM';
  const ordered = [...sheets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const sheet of ordered) {
    const worksheet = workbook.addWorksheet(String(sheet.name || 'Sheet').slice(0, 31));
    const { grid, config } = sheetGrid(sheet);
    grid.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return;
        const cell = worksheet.getCell(`${columnLetter(c)}${r + 1}`);
        const value = valueOf(v);
        if (value !== null && value !== undefined && value !== '') cell.value = value;
        styleCell(cell, v);
      })
    );
    for (const [key, merge] of Object.entries(config.merge ?? {})) {
      void key;
      worksheet.mergeCells(merge.r + 1, merge.c + 1, merge.r + merge.rs, merge.c + merge.cs);
    }
    for (const [c, px] of Object.entries(config.columnlen ?? {})) worksheet.getColumn(Number(c) + 1).width = Math.max(2, px / PX_PER_CHAR);
    for (const [r, px] of Object.entries(config.rowlen ?? {})) worksheet.getRow(Number(r) + 1).height = px / PX_PER_POINT;
    for (const info of config.borderInfo ?? []) {
      if (info.rangeType !== 'cell' || !info.value) continue;
      const { row_index: r, col_index: c } = info.value;
      const side = (s) => (s ? { style: BORDER_STYLE_OUT[s.style] ?? 'thin', color: { argb: argb(s.color ?? '#000000') } } : undefined);
      worksheet.getCell(`${columnLetter(c)}${r + 1}`).border = { left: side(info.value.l), right: side(info.value.r), top: side(info.value.t), bottom: side(info.value.b) };
    }
    // Whole ranges given one border style from the toolbar.
    for (const info of config.borderInfo ?? []) {
      if (info.rangeType !== 'range' || !info.range) continue;
      const style = { style: BORDER_STYLE_OUT[info.style] ?? 'thin', color: { argb: argb(info.color ?? '#000000') } };
      for (const range of info.range) {
        for (let r = range.row[0]; r <= range.row[1]; r++) {
          for (let c = range.column[0]; c <= range.column[1]; c++) {
            const cell = worksheet.getCell(`${columnLetter(c)}${r + 1}`);
            const all = info.borderType === 'border-all' || info.borderType === 'border-inside';
            const edge = {
              left: all || (info.borderType === 'border-left' && c === range.column[0]) || (info.borderType === 'border-outside' && c === range.column[0]),
              right: all || (info.borderType === 'border-right' && c === range.column[1]) || (info.borderType === 'border-outside' && c === range.column[1]),
              top: all || (info.borderType === 'border-top' && r === range.row[0]) || (info.borderType === 'border-outside' && r === range.row[0]),
              bottom: all || (info.borderType === 'border-bottom' && r === range.row[1]) || (info.borderType === 'border-outside' && r === range.row[1]),
            };
            if (info.borderType === 'border-none') {
              cell.border = {};
              continue;
            }
            cell.border = { ...cell.border, ...Object.fromEntries(Object.entries(edge).filter(([, on]) => on).map(([k]) => [k, style])) };
          }
        }
      }
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export { columnLetter, DEFAULT_COL_PX, DEFAULT_ROW_PX, PX_PER_POINT };
