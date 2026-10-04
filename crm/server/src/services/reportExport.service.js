import PDFDocument from 'pdfkit';
import writeExcelFile from 'write-excel-file/node';
import { getCompanyProfile } from './settings.service.js';

// Turns a collected report (see collectReport in report.service.js) into a
// file. The rows are exactly what the report API returns - the files add no
// calculation of their own.

const NUMERIC = ['number', 'money'];
const date = (value) => new Date(value).toISOString().slice(0, 10);
const dateTime = (value) => new Date(value).toISOString().slice(0, 16).replace('T', ' ');
const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

// A value as text, for CSV and PDF.
function text(value, type, { grouped = false } = {}) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'date') return date(value);
  if (type === 'datetime') return dateTime(value);
  if (type === 'money') return grouped ? money.format(value) : Number(value).toFixed(2);
  if (type === 'number') return grouped ? whole.format(value) : String(value);
  return String(value);
}

// What the file covers, in words - shown at the top of the PDF.
function subtitle(data) {
  const { applied, scope } = data;
  const parts = [];
  if (applied.from || applied.to) parts.push(`${applied.dateField}: ${applied.from ?? 'start'} to ${applied.to ?? 'today'}`);
  if (applied.search) parts.push(`search "${applied.search}"`);
  if (Object.keys(applied.filters).length) parts.push(`${Object.keys(applied.filters).length} filter(s)`);
  parts.push(scope.organization ? scope.organization.name : scope.type === 'own' ? 'own records' : 'all organizations');
  return parts.join(' · ');
}

// --- CSV ------------------------------------------------------------------------------

// Quoted where needed. A cell that a spreadsheet would run as a formula
// (starting with = + - @) is prefixed so it stays text; numbers are left alone.
function csvCell(value, numeric) {
  let cell = value;
  if (!numeric && /^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function toCsv(data) {
  const { columns } = data.report;
  const lines = [columns.map((column) => csvCell(column.label, false)).join(',')];
  for (const row of data.rows) {
    lines.push(columns.map((column) => csvCell(text(row[column.key], column.type), NUMERIC.includes(column.type))).join(','));
  }
  // The byte-order mark makes Excel read the file as UTF-8.
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

// --- Excel ----------------------------------------------------------------------------

const WIDTHS = { text: 26, number: 12, money: 16, date: 13, datetime: 18 };

function excelCell(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'money') return { value: Number(value), type: Number, format: '#,##0.00' };
  if (type === 'number') return { value: Number(value), type: Number };
  if (type === 'date') return { value: new Date(value), type: Date, format: 'yyyy-mm-dd' };
  if (type === 'datetime') return { value: new Date(value), type: Date, format: 'yyyy-mm-dd hh:mm' };
  // Typed as text, so nothing in it is ever evaluated as a formula.
  return { value: String(value), type: String };
}

export function toXlsx(data) {
  const { columns } = data.report;
  const header = columns.map((column) => ({ value: column.label, fontWeight: 'bold' }));
  const rows = data.rows.map((row) => columns.map((column) => excelCell(row[column.key], column.type)));
  const totals = Object.keys(data.totals).length
    ? [columns.map((column, index) => (column.key in data.totals ? { ...excelCell(data.totals[column.key], column.type), fontWeight: 'bold' } : index === 0 ? { value: 'Total', fontWeight: 'bold' } : null))]
    : [];
  return writeExcelFile([header, ...rows, ...totals], {
    columns: columns.map((column) => ({ width: WIDTHS[column.type] ?? WIDTHS.text })),
    sheet: data.report.title.slice(0, 31),
    stickyRowsCount: 1,
  }).toBuffer();
}

// --- PDF ------------------------------------------------------------------------------

const PAGE = { size: 'A4', layout: 'landscape', margin: 28 };
const FONT = 7.5;
const ROW = 15;
const CELL_PADDING = 8;
const MAX_NATURAL = 240;

// Each column as wide as its widest content (header included). If that is
// more than the page, the text columns give way in proportion - numbers and
// dates are never cut; if it is less, the text columns share the spare room.
function columnWidths(doc, columns, cells, available) {
  const measure = (value, bold) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT).widthOfString(value);
  const natural = columns.map((column, index) => {
    const widest = cells.reduce((max, row) => Math.max(max, measure(row[index], false)), measure(column.label, true));
    return Math.min(MAX_NATURAL, widest) + CELL_PADDING;
  });
  const isText = columns.map((column) => !NUMERIC.includes(column.type) && column.type !== 'date' && column.type !== 'datetime');
  const fixed = natural.reduce((sum, value, index) => sum + (isText[index] ? 0 : value), 0);
  const flexible = natural.reduce((sum, value, index) => sum + (isText[index] ? value : 0), 0);
  // With no text column at all, every column scales.
  if (!flexible) return natural.map((value) => (value * available) / fixed);
  const factor = Math.max(0.2, (available - fixed) / flexible);
  return natural.map((value, index) => (isText[index] ? value * factor : value));
}

export async function toPdf(data) {
  const profile = await getCompanyProfile();
  const { columns } = data.report;
  const doc = new PDFDocument({ ...PAGE, bufferPages: true });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = PAGE.margin;
  const width = doc.page.width - PAGE.margin * 2;
  const bottom = doc.page.height - PAGE.margin - 14;
  const cells = data.rows.map((row) => columns.map((column) => text(row[column.key], column.type, { grouped: true })));
  const widths = columnWidths(doc, columns, cells, width);
  const hasTotals = Object.keys(data.totals).length > 0;

  // One table line; a cell that does not fit is cut with an ellipsis, never wrapped.
  function line(cells, y, { bold = false } = {}) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT).fillColor('#111111');
    let x = left;
    cells.forEach((cell, index) => {
      const numeric = NUMERIC.includes(columns[index].type);
      doc.text(cell, x + 2, y + 4, { width: widths[index] - 4, height: ROW - 4, align: numeric ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += widths[index];
    });
  }
  function rule(y, color = '#bbbbbb') {
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor(color).stroke();
  }
  function tableHeader(y) {
    doc.rect(left, y, width, ROW).fill('#eeeeee');
    line(columns.map((column) => column.label), y, { bold: true });
    return y + ROW;
  }

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(`${data.report.title} report`, left, PAGE.margin);
  doc.font('Helvetica').fontSize(8.5).fillColor('#555555');
  if (profile.name) doc.text(profile.name);
  doc.text(subtitle(data));
  doc.text(`${data.rows.length} of ${data.totalRows} row(s) · generated ${dateTime(data.generatedAt)} UTC by ${data.generatedBy}`);
  if (data.truncated) doc.fillColor('#b00020').text(`Only the first ${data.rows.length} rows are in this file. Narrow the report to export the rest.`);

  let y = tableHeader(doc.y + 8);
  cells.forEach((row, index) => {
    // The last row leaves room for the total line, so that never sits alone on a page.
    const needed = index === cells.length - 1 && hasTotals ? ROW * 2 : ROW;
    if (y + needed > bottom) {
      doc.addPage();
      y = tableHeader(PAGE.margin);
    }
    line(row, y);
    y += ROW;
    rule(y, '#e5e5e5');
  });
  if (hasTotals) {
    rule(y, '#555555');
    line(columns.map((column, index) => (column.key in data.totals ? text(data.totals[column.key], column.type, { grouped: true }) : index === 0 ? 'Total' : '')), y, { bold: true });
  }
  if (!data.rows.length) doc.font('Helvetica').fontSize(9).fillColor('#555555').text('No rows match.', left, y + 6);

  // Page numbers, once the number of pages is known.
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(index);
    // No bottom margin while writing the footer, or pdfkit starts a new page for it.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor('#777777').text(`Page ${index + 1} of ${pages.count}`, left, doc.page.height - PAGE.margin - 4, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return finished;
}

// --- one entry point --------------------------------------------------------------------

const FORMATS = {
  csv: { build: toCsv, type: 'text/csv; charset=utf-8' },
  xlsx: { build: toXlsx, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pdf: { build: toPdf, type: 'application/pdf' },
};

// { buffer, contentType, fileName } for a collected report.
export async function buildExport(data, format) {
  const { build, type } = FORMATS[format];
  return { buffer: await build(data), contentType: type, fileName: `${data.report.key}-report-${date(data.generatedAt)}.${format}` };
}
