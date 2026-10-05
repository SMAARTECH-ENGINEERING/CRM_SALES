// Building PDFs for printing and exporting, with pdf-lib, in the browser.
//
// PDF's built-in fonts (Helvetica, Times, Courier) only cover Western
// characters (WinAnsi). Text written onto a page with them goes through
// `winAnsi`, which spells out the rupee sign and replaces anything else it
// cannot show; the original document's own text is never changed by this.

export const PAPER = Object.freeze({
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  Letter: [612, 792],
  Legal: [612, 1008],
});
// In points (1/72 inch).
export const MARGINS = Object.freeze({ none: 0, narrow: 18, normal: 36, wide: 72 });

let pdfLib = null;
export const loadPdfLib = () => (pdfLib ??= import('pdf-lib'));

const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function winAnsi(text = '') {
  return String(text)
    .replace(/₹/g, 'Rs.')
    .replace(/[−]/g, '-')
    .replace(/[\t]/g, '    ')
    .replace(/[^\n]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch) ? ch : '?';
    });
}

export function pageSize(paper, orientation) {
  const [w, h] = PAPER[paper] ?? PAPER.A4;
  return orientation === 'landscape' ? [h, w] : [w, h];
}

// "1-3, 5, 8-" -> [0, 1, 2, 4, 7, 8, ...] (0-based, in the order given).
// Throws a readable message for anything it cannot use.
export function parseRange(text, count) {
  const out = [];
  for (const part of String(text).split(',').map((p) => p.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)?\s*(-)?\s*(\d+)?$/);
    if (!match || (!match[1] && !match[3])) throw new Error(`"${part}" is not a page or a range like 2-5`);
    const from = match[1] ? Number(match[1]) : 1;
    const to = match[2] ? (match[3] ? Number(match[3]) : count) : from;
    if (from < 1 || to > count || from > to) throw new Error(`Pages ${part} are outside 1-${count}`);
    for (let p = from; p <= to; p++) out.push(p - 1);
  }
  if (!out.length) throw new Error('Enter the pages to include, e.g. 1-3, 5');
  return out;
}

// Header, footer and "Page n of N" onto a finished page.
export function drawMarginText(page, font, { header, footer, pageNumbers, number, total, margin }) {
  const { width, height } = page.getSize();
  const size = 9;
  const edge = Math.max(14, margin / 2);
  const color = { type: 'RGB', red: 0.3, green: 0.3, blue: 0.3 };
  const write = (text, y, align) => {
    const clean = winAnsi(text).replace(/\n/g, ' ');
    const textWidth = font.widthOfTextAtSize(clean, size);
    const x = align === 'right' ? width - Math.max(edge, margin) - textWidth : align === 'center' ? (width - textWidth) / 2 : Math.max(edge, margin);
    page.drawText(clean, { x, y, size, font, color });
  };
  if (header) write(header, height - edge - size + 2, 'center');
  if (footer) write(footer, edge - 2, pageNumbers ? 'left' : 'center');
  if (pageNumbers) write(`Page ${number} of ${total}`, edge - 2, footer ? 'right' : 'center');
}

// Draws `embedded` (a page of another PDF) into the box, keeping its proportions,
// honouring the page's own rotation (/Rotate, clockwise).
// mode: 'fit' (fill the box), 'actual' (100%) or 'custom' (scalePercent).
function drawFitted(target, embedded, rotation, box, mode, scalePercent, degrees) {
  const turned = rotation % 180 !== 0;
  const w = turned ? embedded.height : embedded.width;
  const h = turned ? embedded.width : embedded.height;
  const s = mode === 'fit' ? Math.min(box.width / w, box.height / h) : mode === 'custom' ? (scalePercent || 100) / 100 : 1;
  const x0 = box.x + (box.width - w * s) / 2;
  const y0 = box.y + (box.height - h * s) / 2;
  const at = {
    0: [x0, y0],
    90: [x0, y0 + embedded.width * s],
    180: [x0 + embedded.width * s, y0 + embedded.height * s],
    270: [x0 + embedded.height * s, y0],
  }[rotation] ?? [x0, y0];
  target.drawPage(embedded, { x: at[0], y: at[1], xScale: s, yScale: s, rotate: degrees(-rotation) });
}

// The pages of a PDF re-laid out for printing or exporting.
//
// options:
//   pages: 'all' | 'range' | 'current';  range: '1-3, 5';  current: 0-based
//   copies: 1..; collate: true (1,2,3,1,2,3) or false (1,1,2,2,3,3)
//   paper: 'original' | 'A4' | 'A3' | 'Letter' | 'Legal'
//   orientation: 'auto' | 'portrait' | 'landscape'
//   margins: key of MARGINS;  scaling: 'fit' | 'actual' | 'custom';  scale: percent
//   header, footer: text;  pageNumbers: boolean
export async function layoutPdf(bytes, options = {}) {
  const { PDFDocument, StandardFonts, degrees } = await loadPdfLib();
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const count = source.getPageCount();
  let order = [...Array(count).keys()];
  if (options.pages === 'range') order = parseRange(options.range, count);
  if (options.pages === 'current') order = [Math.min(Math.max(0, options.current ?? 0), count - 1)];
  const copies = Math.max(1, Math.min(50, Number(options.copies) || 1));
  const sequence = options.collate === false ? order.flatMap((p) => Array(copies).fill(p)) : Array.from({ length: copies }, () => order).flat();

  const out = await PDFDocument.create();
  const margin = MARGINS[options.margins] ?? 0;
  const untouched = (options.paper ?? 'original') === 'original' && !margin && (options.scaling ?? 'actual') !== 'custom' && (options.orientation ?? 'auto') === 'auto';

  if (untouched) {
    // Pages copied as they are: text stays selectable and links keep working.
    const copied = await out.copyPages(source, sequence);
    copied.forEach((page) => out.addPage(page));
  } else {
    const unique = [...new Set(sequence)];
    const embedded = await out.embedPages(unique.map((i) => source.getPage(i)));
    const byIndex = new Map(unique.map((i, n) => [i, embedded[n]]));
    for (const index of sequence) {
      const sourcePage = source.getPage(index);
      const rotation = ((sourcePage.getRotation().angle % 360) + 360) % 360;
      const piece = byIndex.get(index);
      const turned = rotation % 180 !== 0;
      const natural = turned ? [piece.height, piece.width] : [piece.width, piece.height];
      let size;
      if ((options.paper ?? 'original') === 'original') size = natural;
      else {
        const orientation = options.orientation === 'auto' || !options.orientation ? (natural[0] > natural[1] ? 'landscape' : 'portrait') : options.orientation;
        size = pageSize(options.paper, orientation);
      }
      if (options.paper === 'original' && options.orientation && options.orientation !== 'auto') {
        const wantLandscape = options.orientation === 'landscape';
        if (wantLandscape !== size[0] > size[1]) size = [size[1], size[0]];
      }
      const page = out.addPage(size);
      const box = { x: margin, y: margin, width: size[0] - margin * 2, height: size[1] - margin * 2 };
      drawFitted(page, piece, rotation, box, options.scaling ?? 'fit', options.scale, degrees);
    }
  }

  if (options.header || options.footer || options.pageNumbers) {
    const font = await out.embedFont(StandardFonts.Helvetica);
    const pages = out.getPages();
    pages.forEach((page, i) => drawMarginText(page, font, { ...options, margin, number: i + 1, total: pages.length }));
  }
  if (options.title) out.setTitle(winAnsi(options.title));
  return out.save();
}

// One image, centred on a page.
export async function imageToPdf(blob, { paper = 'A4', orientation = 'auto', margins = 'normal', header, footer, pageNumbers, title } = {}) {
  const lib = await loadPdfLib();
  const { PDFDocument, StandardFonts } = lib;
  const out = await PDFDocument.create();
  let bytes = new Uint8Array(await blob.arrayBuffer());
  let type = blob.type;
  if (!['image/png', 'image/jpeg'].includes(type)) {
    // Anything else the browser can show is turned into PNG first.
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bytes = new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))).arrayBuffer());
    type = 'image/png';
  }
  const image = type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const landscape = orientation === 'auto' ? image.width > image.height : orientation === 'landscape';
  const size = pageSize(paper, landscape ? 'landscape' : 'portrait');
  const margin = MARGINS[margins] ?? 36;
  const page = out.addPage(size);
  const s = Math.min((size[0] - margin * 2) / image.width, (size[1] - margin * 2) / image.height, 1);
  page.drawImage(image, { x: (size[0] - image.width * s) / 2, y: (size[1] - image.height * s) / 2, width: image.width * s, height: image.height * s });
  if (header || footer || pageNumbers) drawMarginText(page, await out.embedFont(StandardFonts.Helvetica), { header, footer, pageNumbers, margin, number: 1, total: 1 });
  if (title) out.setTitle(winAnsi(title));
  return out.save();
}

// Opens the browser's print dialog for a PDF, from a hidden frame. The browser
// does the printing (printer, duplex, colour): what is chosen here decides
// what is printed.
export function printPdf(bytes) {
  return printUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
}

// Same for an HTML page (Word documents and text files).
export function printHtml(html) {
  return printUrl(URL.createObjectURL(new Blob([html], { type: 'text/html' })));
}

function printUrl(url) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
    frame.src = url;
    frame.onload = () => {
      // PDFs need a moment for the browser's viewer to finish loading in the frame.
      setTimeout(() => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          resolve();
        } catch (err) {
          reject(err);
        }
        // Long enough for the print dialog to take what it needs.
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60 * 1000);
      }, 300);
    };
    document.body.appendChild(frame);
  });
}
