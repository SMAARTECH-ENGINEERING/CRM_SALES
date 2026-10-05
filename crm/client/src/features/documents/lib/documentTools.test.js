// @vitest-environment node
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { splitParts } from '../editor/SplitDialog.jsx';
import { boundsOf, newText, rotateAbout, textWidth, turnObject, unsupportedCharacters, wrapLines } from './editorModel.js';
import { CAN, KIND, kindOf } from './fileKinds.js';
import { blankPdf, buildEditedPdf, checkEditable, pickPages } from './pdfExport.js';
import { layoutPdf, PAPER, parseRange, winAnsi } from './pdfLayout.js';
import { groupRows, parseNumber, rowsToSheet, toColumns } from './pdfToSheet.js';
import { sheetsToPdf } from './sheetPdf.js';
import { readSpreadsheet, sheetGrid, writeXlsx } from './spreadsheet.js';

const measure = (text, size) => String(text).length * size * 0.5;

async function samplePdf(pages = 3, size = [595.28, 841.89]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage(size).drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 20, font });
  return doc.save();
}

// What PDF.js would give the exporter for a page: its rotation and the
// shown-to-PDF coordinate mapping (top-left origin, points).
function fakePdfjs(bytesPages) {
  return {
    getPage: async (n) => {
      const [width, height] = bytesPages[n - 1];
      return {
        rotate: 0,
        getViewport: ({ rotation = 0 }) => ({
          convertToPdfPoint: (x, y) => {
            if (rotation === 90) return [y, x];
            if (rotation === 180) return [width - x, y];
            if (rotation === 270) return [width - y, height - x];
            return [x, height - y];
          },
        }),
      };
    },
  };
}

describe('file kinds', () => {
  it('tells the kind from the type, or from the name when the type is generic', () => {
    expect(kindOf({ fileType: 'application/pdf', fileName: 'a.pdf' })).toBe(KIND.PDF);
    expect(kindOf({ fileType: 'application/vnd.ms-excel', fileName: 'a.csv' })).toBe(KIND.CSV);
    expect(kindOf({ fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: 'boq.xlsx' })).toBe(KIND.EXCEL);
    expect(kindOf({ fileType: 'application/octet-stream', fileName: 'scan.JPG' })).toBe(KIND.IMAGE);
    expect(kindOf({ fileType: 'application/zip', fileName: 'x.zip' })).toBe(KIND.OTHER);
    expect(CAN.editPdf(KIND.PDF) && CAN.toExcel(KIND.PDF) && !CAN.toPdf(KIND.PDF)).toBe(true);
    expect(CAN.editSheet(KIND.CSV) && CAN.toPdf(KIND.EXCEL) && !CAN.preview(KIND.OTHER)).toBe(true);
  });
});

describe('page ranges and text for built-in PDF fonts', () => {
  it('reads ranges as people type them', () => {
    expect(parseRange('1-3, 5', 6)).toEqual([0, 1, 2, 4]);
    expect(parseRange('4-', 6)).toEqual([3, 4, 5]);
    expect(() => parseRange('7', 6)).toThrow(/outside 1-6/);
    expect(() => parseRange('a-b', 6)).toThrow(/not a page/);
    expect(() => parseRange('', 6)).toThrow(/Enter the pages/);
  });

  it('spells out the rupee sign and replaces what the fonts cannot write', () => {
    expect(winAnsi('₹ 1,500 – café')).toBe('Rs. 1,500 – café');
    expect(winAnsi('ଓଡ଼ିଆ')).toMatch(/^\?+$/);
    expect(unsupportedCharacters('Total ₹ 500 ଓ')).toEqual(['ଓ']);
  });

  it('splits by every N pages or by the parts typed', () => {
    expect(splitParts('every', 2, 5)).toEqual([[0, 1], [2, 3], [4]]);
    expect(splitParts('ranges', '1-2; 3, 5', 5)).toEqual([[0, 1], [2, 4]]);
    expect(() => splitParts('ranges', '', 5)).toThrow();
  });
});

describe('print layout', () => {
  it('keeps the pages as they are when nothing about the paper changes', async () => {
    const out = await PDFDocument.load(await layoutPdf(await samplePdf(3), { pages: 'range', range: '2-3', copies: 2, collate: true }));
    expect(out.getPageCount()).toBe(4);
  });

  it('puts pages on the chosen paper, turned to fit, with header and page numbers', async () => {
    const landscape = await samplePdf(1, [842, 595]);
    const out = await PDFDocument.load(await layoutPdf(landscape, { paper: 'Letter', orientation: 'auto', margins: 'normal', scaling: 'fit', header: 'Maa Tarini FPO', pageNumbers: true }));
    const { width, height } = out.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([PAPER.Letter[1], PAPER.Letter[0]]);
  });

  it('prints copies uncollated as 1,1,2,2', async () => {
    const out = await PDFDocument.load(await layoutPdf(await samplePdf(2), { copies: 2, collate: false, paper: 'A4', margins: 'narrow' }));
    expect(out.getPageCount()).toBe(4);
  });
});

describe('spreadsheets', () => {
  const sheet = {
    name: 'BOQ',
    id: 's1',
    order: 0,
    status: 1,
    celldata: [
      { r: 0, c: 0, v: { v: 'Cold Storage - BOQ', m: 'Cold Storage - BOQ', bl: 1, fs: 14, fc: '#1f4e79', ht: 0, mc: { r: 0, c: 0, rs: 1, cs: 3 } } },
      { r: 1, c: 0, v: { v: 'Item', m: 'Item', bl: 1, bg: '#ddebf7' } },
      { r: 1, c: 1, v: { v: 'Qty', m: 'Qty', bl: 1 } },
      { r: 1, c: 2, v: { v: 'Amount', m: 'Amount', bl: 1 } },
      { r: 2, c: 0, v: { v: 'PUF panels', m: 'PUF panels' } },
      { r: 2, c: 1, v: { v: 420, m: '420', ct: { fa: 'General', t: 'n' } } },
      { r: 2, c: 2, v: { v: 777000, m: '777,000.00', f: '=B3*1850', ct: { fa: '#,##0.00', t: 'n' } } },
    ],
    config: { merge: { '0_0': { r: 0, c: 0, rs: 1, cs: 3 } }, columnlen: { 0: 220 }, rowlen: { 0: 30 } },
  };

  it('writes .xlsx and reads it back with values, formulas, formatting, merges and sizes', async () => {
    const [back] = await readSpreadsheet(await writeXlsx([sheet]), { fileName: 'boq.xlsx' });
    expect(back.name).toBe('BOQ');
    const at = (r, c) => back.celldata.find((x) => x.r === r && x.c === c)?.v;
    expect(at(0, 0)).toMatchObject({ v: 'Cold Storage - BOQ', bl: 1, fs: 14, fc: '#1F4E79', ht: 0 });
    expect(at(1, 0).bg).toBe('#DDEBF7');
    expect(at(2, 1)).toMatchObject({ v: 420, ct: { t: 'n' } });
    expect(at(2, 2)).toMatchObject({ f: '=B3*1850', v: 777000 });
    expect(back.calcChain).toEqual([{ r: 2, c: 2, id: back.id }]);
    expect(back.config.merge['0_0']).toEqual({ r: 0, c: 0, rs: 1, cs: 3 });
    expect(Math.abs(back.config.columnlen[0] - 220)).toBeLessThan(2);
    expect(Math.round(back.config.rowlen[0])).toBe(30);
    // ExcelJS is large: loading it the first time is slow when every test file runs at once.
  }, 90000);

  it('reads CSV', async () => {
    const [csv] = await readSpreadsheet(new TextEncoder().encode('Item,Qty\nPanels,420\n'), { fileName: 'list.csv' });
    const { grid } = sheetGrid(csv);
    expect(grid[1][0].v).toBe('Panels');
    expect(grid[1][1].v).toBe(420);
  });

  it('draws sheets onto PDF pages, splitting long ones and repeating the header rows', async () => {
    const rows = Array.from({ length: 120 }, (_, r) => ({ r: r + 1, c: 0, v: { v: `Row ${r + 1}`, m: `Row ${r + 1}` } }));
    const long = { ...sheet, celldata: [{ r: 0, c: 0, v: { v: 'Heading', m: 'Heading', bl: 1 } }, ...rows], config: {} };
    const one = await PDFDocument.load(await sheetsToPdf([sheet], { paper: 'A4', orientation: 'portrait', scaling: 'fitWidth', gridlines: true }));
    expect(one.getPageCount()).toBe(1);
    const many = await PDFDocument.load(await sheetsToPdf([long], { paper: 'A4', repeatHeaderRows: 1, pageNumbers: true, header: 'BOQ' }));
    expect(many.getPageCount()).toBeGreaterThan(2);
  });
});

describe('tables out of PDFs', () => {
  const word = (text, x, y, width = text.length * 5) => ({ text, x, y, width, height: 10 });

  it('groups words into rows and cells, and cells into columns', () => {
    const items = [
      word('Item', 50, 100), word('Qty', 300, 100), word('Amount', 450, 100),
      word('PUF', 50, 120), word('panels', 72, 120), word('420', 305, 120), word('7,77,000.00', 440, 120),
      word('Installation', 50, 140), word('1', 310, 140), word('1,20,000.00', 440, 140),
    ];
    const rows = toColumns(groupRows(items), 595);
    expect(rows).toEqual([
      ['Item', 'Qty', 'Amount'],
      ['PUF panels', '420', '7,77,000.00'],
      ['Installation', '1', '1,20,000.00'],
    ]);
  });

  it('turns written amounts into numbers', () => {
    expect(parseNumber('7,77,000.00')).toBe(777000);
    expect(parseNumber('₹ 1,500')).toBe(1500);
    expect(parseNumber('(250.50)')).toBe(-250.5);
    expect(parseNumber('Rs. 99')).toBe(99);
    expect(parseNumber('QUO-000018')).toBeNull();
    const sheet = rowsToSheet('Page 1', [['Qty', 'Amount'], ['420', '7,77,000.00']]);
    expect(sheet.celldata.find((c) => c.r === 1 && c.c === 1).v).toMatchObject({ v: 777000, ct: { t: 'n' } });
  });
});

describe('the PDF editor model', () => {
  it('wraps text to its box, or grows the box with the text', () => {
    const fixed = newText('p1', 0, 0, { text: 'one two three four', width: 60, size: 10, autoWidth: false });
    expect(wrapLines(fixed, measure)).toEqual(['one two', 'three four']);
    const auto = newText('p1', 0, 0, { text: 'one two three four', size: 10 });
    expect(wrapLines(auto, measure)).toEqual(['one two three four']);
    expect(textWidth(auto, measure)).toBeGreaterThan(measure('one two three four', 10));
  });

  it('keeps objects in place on a page turned four times', () => {
    const text = newText('p1', 100, 200, { text: 'Hello', size: 12 });
    let turned = text;
    let size = [595, 842];
    for (let i = 0; i < 4; i++) {
      turned = turnObject(turned, true, size, measure);
      size = [size[1], size[0]];
    }
    expect(turned.x).toBeCloseTo(text.x);
    expect(turned.y).toBeCloseTo(text.y);
    expect(turned.rotation).toBe(0);
    const line = { id: 'l', pageId: 'p1', type: 'line', points: [[10, 20], [110, 20]] };
    expect(turnObject(line, true, [595, 842], measure).points).toEqual([[822, 10], [822, 110]]);
    expect(rotateAbout([10, 0], [0, 0], 90).map((v) => Math.round(v))).toEqual([0, 10]);
    expect(boundsOf(line, measure).width).toBeGreaterThan(100);
  });

  it('saves pages and objects as a new PDF: order, rotation, drawings and comments', async () => {
    const bytes = await samplePdf(2);
    const sources = new Map([['main', { bytes, pdf: fakePdfjs([[595.28, 841.89], [595.28, 841.89]]) }]]);
    const pages = [
      { id: 'b', sourceKey: 'main', index: 1, rotation: 90 },
      { id: 'a', sourceKey: 'main', index: 0, rotation: 0 },
    ];
    const objects = [
      newText('a', 50, 50, { text: 'Revised offer ₹ 15 lakh', background: '#ffffff' }),
      { id: 'r', pageId: 'a', type: 'rect', x: 40, y: 40, width: 100, height: 30, rotation: 15, stroke: '#ff0000', fill: null, strokeWidth: 2, opacity: 1 },
      { id: 'h', pageId: 'a', type: 'highlight', x: 40, y: 100, width: 200, height: 14, fill: '#ffeb3b', opacity: 0.4 },
      { id: 'd', pageId: 'b', type: 'draw', points: [[10, 10], [20, 30], [40, 35]], stroke: '#000000', strokeWidth: 2, opacity: 1 },
      { id: 'c', pageId: 'a', type: 'comment', x: 300, y: 300, text: 'Check the rate', author: 'Priya' },
    ];
    const out = await PDFDocument.load(await buildEditedPdf({ pages, objects, sources }, { title: 'QUO-000018' }));
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getRotation().angle).toBe(90);
    expect(out.getPage(1).getRotation().angle).toBe(0);
    const annots = out.getPage(1).node.lookup(PDFName.of('Annots'));
    expect(annots.size()).toBe(1);
    expect(out.getTitle()).toBe('QUO-000018');
  });

  it('extracts pages, makes blank pages and refuses encrypted PDFs for editing', async () => {
    const extracted = await PDFDocument.load(await pickPages(await samplePdf(4), [3, 0]));
    expect(extracted.getPageCount()).toBe(2);
    const blank = await PDFDocument.load(await blankPdf([300, 400]));
    expect(blank.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
    expect((await checkEditable(await samplePdf(1))).editable).toBe(true);
    expect((await checkEditable(new TextEncoder().encode('not a pdf'))).editable).toBe(false);
  });
});
