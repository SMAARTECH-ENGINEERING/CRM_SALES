// A spreadsheet drawn onto PDF pages, the way a spreadsheet program prints it:
// column widths, row heights, fills, fonts, alignment, merged cells and
// borders kept, split across pages by rows and by columns, header rows
// repeated on every page if asked.

import { DEFAULT_COL_PX, DEFAULT_ROW_PX, sheetGrid } from './spreadsheet.js';
import { drawMarginText, loadPdfLib, MARGINS, pageSize, winAnsi } from './pdfLayout.js';

const PT_PER_PX = 0.75;
const PADDING = 2.5;

const rgbOf = (hex, fallback) => {
  const clean = typeof hex === 'string' ? hex.replace('#', '') : '';
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
  return { type: 'RGB', red: parseInt(clean.slice(0, 2), 16) / 255, green: parseInt(clean.slice(2, 4), 16) / 255, blue: parseInt(clean.slice(4, 6), 16) / 255 };
};
const BLACK = { type: 'RGB', red: 0, green: 0, blue: 0 };
const GRID = { type: 'RGB', red: 0.82, green: 0.82, blue: 0.82 };

const textOf = (v) => {
  if (!v) return '';
  if (v.m !== undefined && v.m !== null) return String(v.m);
  if (v.v === undefined || v.v === null) return '';
  return String(v.v);
};
const isNumeric = (v) => v && (v.ct?.t === 'n' || typeof v.v === 'number');

// Words that fit `width`, as lines.
function wrap(text, font, size, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Cuts text to the width, with an ellipsis.
function clip(text, font, size, width) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let end = text.length;
  while (end > 0 && font.widthOfTextAtSize(`${text.slice(0, end)}…`, size) > width) end -= 1;
  return end > 0 ? `${text.slice(0, end)}…` : '';
}

// Splits [0..count) into runs whose sizes fit `limit` (repeating `fixed` first ones).
function bands(sizes, limit, fixed = 0) {
  const fixedSize = sizes.slice(0, fixed).reduce((a, b) => a + b, 0);
  const out = [];
  let current = [];
  let used = fixedSize;
  for (let i = fixed; i < sizes.length; i++) {
    if (current.length && used + sizes[i] > limit) {
      out.push(current);
      current = [];
      used = fixedSize;
    }
    current.push(i);
    used += sizes[i];
  }
  if (current.length || !out.length) out.push(current);
  return out;
}

// options:
//   sheets: indexes of the sheets to include (default: the active one or the first)
//   paper, orientation ('portrait' | 'landscape'), margins (key of MARGINS)
//   scaling: 'actual' | 'fitWidth' | 'fitPage' | 'custom';  scale: percent
//   gridlines: boolean;  repeatHeaderRows: number of top rows on every page
//   header, footer: text;  pageNumbers: boolean;  title
export async function sheetsToPdf(sheets, options = {}) {
  const { PDFDocument, StandardFonts } = await loadPdfLib();
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const fontOf = (v) => (v?.bl && v?.it ? fonts.boldItalic : v?.bl ? fonts.bold : v?.it ? fonts.italic : fonts.regular);

  const [pageW, pageH] = pageSize(options.paper ?? 'A4', options.orientation ?? 'portrait');
  const margin = MARGINS[options.margins] ?? MARGINS.normal;
  const reserved = options.header || options.footer || options.pageNumbers ? 14 : 0;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2 - reserved * 2;

  const chosen = options.sheets?.length ? options.sheets.map((i) => sheets[i]).filter(Boolean) : [sheets.find((s) => s.status === 1) ?? sheets[0]];
  for (const sheet of chosen) {
    const { grid, rows, cols, config } = sheetGrid(sheet);
    if (!rows || !cols) {
      const page = pdf.addPage([pageW, pageH]);
      page.drawText(winAnsi(`${sheet.name}: no data`), { x: margin, y: pageH - margin - 12, size: 10, font: fonts.regular });
      continue;
    }
    const colW = Array.from({ length: cols }, (_, c) => (config.columnlen?.[c] ?? DEFAULT_COL_PX) * PT_PER_PX);
    const rowH = Array.from({ length: rows }, (_, r) => (config.rowlen?.[r] ?? DEFAULT_ROW_PX) * PT_PER_PX);
    // Rows with wrapped text grow to fit it (unless their height was set).
    grid.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v || String(v.tb) !== '2' || config.rowlen?.[r] !== undefined || v.mc) return;
        const size = Number(v.fs) || 10;
        const lines = wrap(winAnsi(textOf(v)), fontOf(v), size, colW[c] - PADDING * 2).length;
        rowH[r] = Math.max(rowH[r], lines * size * 1.2 + PADDING * 2);
      })
    );
    const totalW = colW.reduce((a, b) => a + b, 0);
    const totalH = rowH.reduce((a, b) => a + b, 0);
    let scale = 1;
    if (options.scaling === 'fitWidth') scale = Math.min(1, availW / totalW);
    else if (options.scaling === 'fitPage') scale = Math.min(1, availW / totalW, availH / totalH);
    else if (options.scaling === 'custom') scale = (Number(options.scale) || 100) / 100;

    const repeat = Math.min(Number(options.repeatHeaderRows) || 0, rows - 1);
    const colBands = bands(colW.map((w) => w * scale), availW);
    const rowBands = bands(rowH.map((h) => h * scale), availH, repeat);

    // Which cells a merge covers (drawn once, from its top-left cell).
    const covered = new Set();
    const merges = Object.values(config.merge ?? {});
    for (const m of merges) for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) covered.add(`${r}_${c}`);
    const mergeAt = new Map(merges.map((m) => [`${m.r}_${m.c}`, m]));

    // Borders set on single cells, and on ranges from the toolbar.
    const borders = new Map();
    const setBorder = (r, c, side, value) => {
      const key = `${r}_${c}`;
      borders.set(key, { ...(borders.get(key) ?? {}), [side]: value });
    };
    for (const info of config.borderInfo ?? []) {
      if (info.rangeType === 'cell' && info.value) {
        const { row_index: r, col_index: c } = info.value;
        for (const side of ['l', 'r', 't', 'b']) if (info.value[side]) setBorder(r, c, side, info.value[side]);
      } else if (info.rangeType === 'range' && info.range && info.borderType !== 'border-none') {
        const style = { style: info.style, color: info.color };
        for (const range of info.range) {
          for (let r = range.row[0]; r <= range.row[1]; r++) {
            for (let c = range.column[0]; c <= range.column[1]; c++) {
              const all = info.borderType === 'border-all';
              const outside = info.borderType === 'border-outside';
              if (all || ((outside || info.borderType === 'border-left') && c === range.column[0])) setBorder(r, c, 'l', style);
              if (all || ((outside || info.borderType === 'border-right') && c === range.column[1])) setBorder(r, c, 'r', style);
              if (all || ((outside || info.borderType === 'border-top') && r === range.row[0])) setBorder(r, c, 't', style);
              if (all || ((outside || info.borderType === 'border-bottom') && r === range.row[1])) setBorder(r, c, 'b', style);
              if (info.borderType === 'border-inside') {
                if (c > range.column[0]) setBorder(r, c, 'l', style);
                if (r > range.row[0]) setBorder(r, c, 't', style);
              }
            }
          }
        }
      }
    }

    for (const rowBand of rowBands) {
      const rowList = [...Array(repeat).keys(), ...rowBand];
      for (const colBand of colBands) {
        const page = pdf.addPage([pageW, pageH]);
        const top = pageH - margin - reserved;
        const xs = new Map();
        let x = margin;
        for (const c of colBand) {
          xs.set(c, x);
          x += colW[c] * scale;
        }
        const ys = new Map();
        let y = top;
        for (const r of rowList) {
          ys.set(r, y);
          y -= rowH[r] * scale;
        }
        const bandRight = x;
        const bandBottom = y;

        for (const r of rowList) {
          for (const c of colBand) {
            if (covered.has(`${r}_${c}`)) continue;
            const v = grid[r][c];
            const merge = mergeAt.get(`${r}_${c}`);
            let w = colW[c] * scale;
            let h = rowH[r] * scale;
            if (merge) {
              w = 0;
              for (let cc = c; cc < c + merge.cs; cc++) if (xs.has(cc)) w += colW[cc] * scale;
              h = 0;
              for (let rr = r; rr < r + merge.rs; rr++) if (ys.has(rr)) h += rowH[rr] * scale;
            }
            const cx = xs.get(c);
            const cy = ys.get(r) - h;
            if (options.gridlines) page.drawRectangle({ x: cx, y: cy, width: w, height: h, borderColor: GRID, borderWidth: 0.4 });
            if (v?.bg) page.drawRectangle({ x: cx, y: cy, width: w, height: h, color: rgbOf(v.bg, undefined) });
            const text = winAnsi(textOf(v));
            if (text) {
              const font = fontOf(v);
              const size = (Number(v.fs) || 10) * scale;
              const pad = PADDING * scale;
              const lines = String(v.tb) === '2' ? wrap(text, font, size, w - pad * 2) : [clip(text.replace(/\n/g, ' '), font, size, w - pad * 2)];
              const lineH = size * 1.2;
              const blockH = lines.length * lineH;
              const vt = v.vt ?? 2;
              let ty = vt === 1 ? cy + h - pad - size : vt === 0 ? cy + (h + blockH) / 2 - size : cy + pad + blockH - size;
              const ht = v.ht ?? (isNumeric(v) ? 2 : 1);
              for (const line of lines) {
                const lw = font.widthOfTextAtSize(line, size);
                const tx = ht === 0 ? cx + (w - lw) / 2 : ht === 2 ? cx + w - pad - lw : cx + pad;
                page.drawText(line, { x: tx, y: ty + size * 0.2, size, font, color: rgbOf(v.fc, BLACK) });
                if (v.un) page.drawLine({ start: { x: tx, y: ty + size * 0.1 }, end: { x: tx + lw, y: ty + size * 0.1 }, thickness: 0.5, color: rgbOf(v.fc, BLACK) });
                ty -= lineH;
              }
            }
            const border = borders.get(`${r}_${c}`);
            if (border) {
              const line = (b, start, end) => b && page.drawLine({ start, end, thickness: [8, 9, 10, 11].includes(Number(b.style)) || b.style === 'medium' ? 1.2 : [13].includes(Number(b.style)) || b.style === 'thick' ? 1.8 : 0.6, color: rgbOf(b.color, BLACK) });
              line(border.l, { x: cx, y: cy }, { x: cx, y: cy + h });
              line(border.r, { x: cx + w, y: cy }, { x: cx + w, y: cy + h });
              line(border.t, { x: cx, y: cy + h }, { x: cx + w, y: cy + h });
              line(border.b, { x: cx, y: cy }, { x: cx + w, y: cy });
            }
          }
        }
        if (options.gridlines) page.drawRectangle({ x: margin, y: bandBottom, width: bandRight - margin, height: top - bandBottom, borderColor: GRID, borderWidth: 0.6 });
      }
    }
  }

  if (options.header || options.footer || options.pageNumbers) {
    const pages = pdf.getPages();
    pages.forEach((page, i) => drawMarginText(page, fonts.regular, { ...options, margin, number: i + 1, total: pages.length }));
  }
  if (options.title) pdf.setTitle(winAnsi(options.title));
  return pdf.save();
}
