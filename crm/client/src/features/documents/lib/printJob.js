// What to print, built from a file and the print options: a PDF for PDFs,
// spreadsheets and images; an HTML page for Word documents and text files
// (which the browser lays out itself).

import { KIND, kindOf } from './fileKinds.js';
import { imageToPdf, layoutPdf, MARGINS, PAPER } from './pdfLayout.js';
import { sheetsToPdf } from './sheetPdf.js';
import { readSpreadsheet } from './spreadsheet.js';

export const DEFAULT_PRINT_OPTIONS = Object.freeze({
  pages: 'all',
  range: '',
  copies: 1,
  collate: true,
  paper: 'original',
  orientation: 'auto',
  margins: 'none',
  scaling: 'fit',
  scale: 100,
  header: '',
  footer: '',
  pageNumbers: false,
  // Spreadsheets only.
  sheets: null,
  gridlines: true,
  repeatHeaderRows: 0,
});

const cssText = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// A self-contained page that cannot run scripts or load anything from elsewhere.
export function printableHtml(body, options = {}, title = '') {
  const paper = PAPER[options.paper] ? options.paper : 'A4';
  const orientation = options.orientation === 'landscape' ? 'landscape' : 'portrait';
  const margin = MARGINS[options.margins] ?? MARGINS.normal;
  const boxes = [
    options.header ? `@top-center { content: ${cssText(options.header)}; font: 9pt sans-serif; color: #555; }` : '',
    options.footer ? `@bottom-${options.pageNumbers ? 'left' : 'center'} { content: ${cssText(options.footer)}; font: 9pt sans-serif; color: #555; }` : '',
    options.pageNumbers ? `@bottom-${options.footer ? 'right' : 'center'} { content: "Page " counter(page) " of " counter(pages); font: 9pt sans-serif; color: #555; }` : '',
  ].join('\n');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${paper} ${orientation}; margin: ${Math.max(margin, options.header || options.footer || options.pageNumbers ? 30 : 0)}pt; ${boxes} }
body { font: 11pt/1.45 Calibri, Arial, sans-serif; color: #111; margin: 0; padding: 12px; }
@media print { body { padding: 0; } }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; max-width: 100%; }
td, th { border: 1px solid #bbb; padding: 3px 6px; vertical-align: top; }
pre { white-space: pre-wrap; font: 10pt/1.4 Consolas, monospace; margin: 0; }
</style></head><body>${body}</body></html>`;
}

// Word (.docx) as HTML, with mammoth: text, headings, lists, tables and
// pictures come through; page layout, headers and text boxes do not.
export async function wordToHtml(bytes) {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return { html: result.value, warnings: result.messages.filter((m) => m.type === 'warning').map((m) => m.message) };
}

// -> { type: 'pdf', bytes } or { type: 'html', html }.
// `sheets`: the spreadsheet as already read (or as being edited); read from the file otherwise.
export async function buildPrintable(file, options, { sheets } = {}) {
  const kind = kindOf(file);
  const o = { ...DEFAULT_PRINT_OPTIONS, ...options, title: file.fileName };
  if (kind === KIND.PDF) return { type: 'pdf', bytes: await layoutPdf(file.bytes, o) };
  if (kind === KIND.EXCEL || kind === KIND.CSV) {
    const data = sheets ?? (await readSpreadsheet(file.bytes, file));
    const orientation = o.orientation === 'auto' ? 'portrait' : o.orientation;
    const paper = o.paper === 'original' ? 'A4' : o.paper;
    const scaling = o.scaling === 'fit' ? 'fitWidth' : o.scaling;
    const drawn = await sheetsToPdf(data, { ...o, orientation, paper, scaling });
    // Page choice and copies, on the pages just drawn.
    return { type: 'pdf', bytes: await layoutPdf(drawn, { pages: o.pages, range: o.range, current: o.current, copies: o.copies, collate: o.collate }) };
  }
  if (kind === KIND.IMAGE) {
    const single = await imageToPdf(new Blob([file.bytes], { type: file.fileType }), { ...o, paper: o.paper === 'original' ? 'A4' : o.paper, margins: o.margins === 'none' ? 'normal' : o.margins });
    return { type: 'pdf', bytes: await layoutPdf(single, { copies: o.copies, collate: o.collate }) };
  }
  if (kind === KIND.WORD) {
    if (/\.doc$/i.test(file.fileName)) throw new Error('Old Word files (.doc) cannot be shown in the browser. Download it, or save it as .docx and upload that.');
    const { html } = await wordToHtml(file.bytes);
    return { type: 'html', html: printableHtml(html, o, file.fileName) };
  }
  if (kind === KIND.TEXT) {
    return { type: 'html', html: printableHtml(`<pre>${escapeHtml(new TextDecoder().decode(file.bytes))}</pre>`, o, file.fileName) };
  }
  throw new Error('This type of file cannot be printed from the CRM. Download it and print it from its own program.');
}
