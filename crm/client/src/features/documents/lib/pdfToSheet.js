// Tables out of a PDF, as spreadsheet rows.
//
// A PDF has no tables - only words at positions. Words are grouped into rows
// by their height on the page, into cells by the gaps between them, and cells
// into columns where they line up across rows. This works well for documents
// made by a program (quotations, statements, reports); results always need a
// look, which is why they are shown for checking before they are saved.
//
// Scanned pages have no words, only a picture: those are read with OCR
// (tesseract.js), which is slower and may misread characters - every page
// read that way is marked.

import { loadPdfjs, closePdf, openPdf, renderPage } from './pdfjs.js';

const NUMBER = /^\(?-?\s*(?:₹|Rs\.?|INR|\$|€|£)?\s*-?\d{1,3}(?:,\d{2,3})*(?:\.\d+)?\)?$|^\(?-?\s*(?:₹|Rs\.?|INR|\$|€|£)?\s*-?\d+(?:\.\d+)?\)?$/i;

export function parseNumber(text) {
  const clean = String(text).trim();
  if (!NUMBER.test(clean)) return null;
  const negative = /^\(.*\)$/.test(clean) || /^-|\(-/.test(clean.replace(/\s/g, ''));
  // The currency first: the dot of "Rs." is not a decimal point.
  const digits = clean.replace(/₹|Rs\.?|INR|\$|€|£/gi, '').replace(/[^\d.]/g, '');
  if (!digits || digits === '.') return null;
  const value = Number(digits);
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

// Words -> rows of cells: [{ text, x0, x1 }].
export function groupRows(items) {
  const sorted = [...items].filter((i) => i.text.trim()).sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x);
  const rows = [];
  for (const item of sorted) {
    const middle = item.y + item.height / 2;
    const row = rows.at(-1);
    if (row && Math.abs(middle - row.middle) <= Math.max(2, Math.min(row.size, item.height) * 0.5)) {
      row.items.push(item);
      row.middle = (row.middle * (row.items.length - 1) + middle) / row.items.length;
    } else rows.push({ middle, size: item.height, items: [item] });
  }
  return rows.map((row) => {
    const items = row.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const item of items) {
      const cell = cells.at(-1);
      const gap = cell ? item.x - cell.x1 : Infinity;
      // Words closer than about a character apart are the same cell.
      if (cell && gap < Math.max(4, item.height * 0.9)) {
        cell.text += gap > item.height * 0.15 && !cell.text.endsWith(' ') && !item.text.startsWith(' ') ? ` ${item.text}` : item.text;
        cell.x1 = Math.max(cell.x1, item.x + item.width);
      } else cells.push({ text: item.text, x0: item.x, x1: item.x + item.width });
    }
    for (const cell of cells) cell.text = cell.text.replace(/\s+/g, ' ').trim();
    return cells.filter((cell) => cell.text);
  });
}

// Column bands where cells line up across rows; then each cell's column.
export function toColumns(rows, pageWidth) {
  const intervals = rows
    .filter((cells) => cells.length > 1)
    .flat()
    .filter((cell) => cell.x1 - cell.x0 < pageWidth * 0.45)
    .map((cell) => [cell.x0, cell.x1])
    .sort((a, b) => a[0] - b[0]);
  const bands = [];
  for (const [x0, x1] of intervals) {
    const band = bands.at(-1);
    if (band && x0 <= band[1] + 2) band[1] = Math.max(band[1], x1);
    else bands.push([x0, x1]);
  }
  if (!bands.length) return rows.map((cells) => [cells.map((c) => c.text).join(' ')]);
  const columnOf = (cell) => {
    let best = 0;
    let bestOverlap = -Infinity;
    bands.forEach(([b0, b1], i) => {
      const overlap = Math.min(b1, cell.x1) - Math.max(b0, cell.x0);
      const score = overlap > 0 ? overlap : -Math.abs(cell.x0 - b0);
      if (score > bestOverlap) {
        bestOverlap = score;
        best = i;
      }
    });
    return best;
  };
  return rows.map((cells) => {
    const out = Array(bands.length).fill('');
    for (const cell of cells) {
      const c = columnOf(cell);
      out[c] = out[c] ? `${out[c]} ${cell.text}` : cell.text;
    }
    return out;
  });
}

async function textItems(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const pdfjs = await loadPdfjs();
  return {
    width: viewport.width,
    items: content.items
      .filter((item) => item.str)
      .map((item) => {
        const [, , c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform);
        const size = Math.hypot(c, d) || 10;
        return { text: item.str, x: e, y: f - size, width: Math.abs(item.width), height: size };
      }),
  };
}

async function ocrItems(page, worker) {
  const scale = 2.5;
  const canvas = document.createElement('canvas');
  await renderPage(page, canvas, scale);
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const ratio = canvas.width / (page.getViewport({ scale: 1 }).width);
  const items = [];
  let confidence = 0;
  let count = 0;
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          if (!word.text.trim()) continue;
          const { x0, y0, x1, y1 } = word.bbox;
          items.push({ text: word.text, x: x0 / ratio, y: y0 / ratio, width: (x1 - x0) / ratio, height: (y1 - y0) / ratio });
          confidence += word.confidence;
          count += 1;
        }
      }
    }
  }
  return { width: page.getViewport({ scale: 1 }).width, items, confidence: count ? Math.round(confidence / count) : 0 };
}

// -> [{ number, method: 'text' | 'ocr' | 'empty', confidence?, rows: string[][] }]
// options: ocr: 'auto' (scanned pages only) | 'always' | 'off';  language: tesseract code(s), e.g. 'eng' or 'eng+hin'
//          onProgress({ page, pages, status })
export async function extractTables(bytes, { ocr = 'auto', language = 'eng', onProgress, pages: only } = {}) {
  const pdf = await openPdf(bytes);
  const out = [];
  let worker = null;
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      if (only && !only.includes(number)) continue;
      onProgress?.({ page: number, pages: pdf.numPages, status: 'Reading' });
      const page = await pdf.getPage(number);
      let read = ocr === 'always' ? null : await textItems(page);
      let method = 'text';
      const letters = read ? read.items.reduce((n, i) => n + i.text.trim().length, 0) : 0;
      if (ocr === 'always' || (ocr === 'auto' && letters < 10)) {
        onProgress?.({ page: number, pages: pdf.numPages, status: 'Reading the scanned page (OCR)' });
        if (!worker) {
          const { createWorker } = await import('tesseract.js');
          worker = await createWorker(language);
        }
        read = await ocrItems(page, worker);
        method = 'ocr';
      }
      const rows = toColumns(groupRows(read.items), read.width);
      out.push({ number, method: rows.length ? method : 'empty', confidence: read.confidence, rows });
    }
  } finally {
    await worker?.terminate();
    closePdf(pdf);
  }
  return out;
}

// Rows -> a Fortune-sheet sheet. Numbers become numbers (so they add up in Excel).
export function rowsToSheet(name, rows, index = 0) {
  const celldata = [];
  rows.forEach((row, r) =>
    row.forEach((text, c) => {
      if (!text) return;
      const value = parseNumber(text);
      if (value !== null) celldata.push({ r, c, v: { v: value, m: text, ct: { fa: /\.\d{2}\b/.test(text) ? '#,##0.00' : 'General', t: 'n' } } });
      else celldata.push({ r, c, v: { v: text, m: text, ct: { fa: '@', t: 's' } } });
    })
  );
  const widths = {};
  rows.forEach((row) => row.forEach((text, c) => (widths[c] = Math.max(widths[c] ?? 60, Math.min(320, String(text).length * 7.5 + 12)))));
  return { name: name.slice(0, 31), id: `sheet-${index}-${Date.now()}`, order: index, status: index === 0 ? 1 : 0, celldata, config: { columnlen: widths }, row: Math.max(60, rows.length + 20), column: Math.max(26, (rows[0]?.length ?? 0) + 5) };
}
