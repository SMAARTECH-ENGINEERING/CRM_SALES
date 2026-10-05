// Writes the editor's pages and objects into a new PDF, with pdf-lib.
//
// Pages are copied from their source PDFs (their text, images and links stay
// as they were) and turned as set in the editor. Objects are drawn on top of
// the page content: they are added to the page, not merged into its text.
// Comments become real PDF comments (sticky notes) that other PDF readers show.

import { loadPdfLib, winAnsi } from './pdfLayout.js';
import { LINE_HEIGHT, rotateAbout, standardFontName, TEXT_PADDING, textWidth, wrapLines } from './editorModel.js';

const rgbOf = (hex) => {
  const clean = String(hex ?? '').replace('#', '');
  const value = /^[0-9a-f]{6}$/i.test(clean) ? clean : '000000';
  return { type: 'RGB', red: parseInt(value.slice(0, 2), 16) / 255, green: parseInt(value.slice(2, 4), 16) / 255, blue: parseInt(value.slice(4, 6), 16) / 255 };
};

async function imageBytes(src) {
  const blob = await (await fetch(src)).blob();
  if (blob.type === 'image/png' || blob.type === 'image/jpeg') return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { bytes: new Uint8Array(await png.arrayBuffer()), type: 'image/png' };
}

// pages:   [{ id, sourceKey, index, rotation }]
// objects: [{ pageId, type, ... }]  (see editorModel.js)
// sources: Map sourceKey -> { bytes, pdf }  (pdf: the PDF.js document, for coordinates)
// options: { title, author }
export async function buildEditedPdf({ pages, objects, sources }, { title, author } = {}) {
  const lib = await loadPdfLib();
  const { PDFDocument, StandardFonts, degrees, LineCapStyle, PDFString, PDFHexString, BlendMode } = lib;
  const out = await PDFDocument.create();
  const loaded = new Map();
  const sourceDoc = async (key) => {
    if (!loaded.has(key)) loaded.set(key, await PDFDocument.load(sources.get(key).bytes, { updateMetadata: false }));
    return loaded.get(key);
  };
  const fonts = new Map();
  const fontFor = async (object) => {
    const name = standardFontName(object.font, object.bold, object.italic);
    if (!fonts.has(name)) fonts.set(name, await out.embedFont(StandardFonts[name]));
    return fonts.get(name);
  };
  const images = new Map();
  const imageFor = async (src) => {
    if (!images.has(src)) {
      const { bytes, type } = await imageBytes(src);
      images.set(src, type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes));
    }
    return images.get(src);
  };

  for (const descriptor of pages) {
    const [copied] = await out.copyPages(await sourceDoc(descriptor.sourceKey), [descriptor.index]);
    const page = out.addPage(copied);
    const viewed = await sources.get(descriptor.sourceKey).pdf.getPage(descriptor.index + 1);
    const total = (((viewed.rotate + descriptor.rotation) % 360) + 360) % 360;
    page.setRotation(degrees(total));
    const viewport = viewed.getViewport({ scale: 1, rotation: total });
    const toPdf = ([x, y]) => viewport.convertToPdfPoint(x, y);
    // Upright on the page as shown = turned by the page's rotation in PDF space.
    const angle = (rotation = 0) => degrees(total - rotation);

    for (const object of objects.filter((o) => o.pageId === descriptor.id)) {
      const opacity = object.opacity ?? 1;
      if (object.type === 'text') {
        const font = await fontFor(object);
        const measure = (text, size) => font.widthOfTextAtSize(winAnsi(text), size);
        const lines = wrapLines(object, measure);
        const width = textWidth(object, measure);
        const height = lines.length * object.size * LINE_HEIGHT + TEXT_PADDING * 2;
        const center = [object.x + width / 2, object.y + height / 2];
        if (object.background) {
          const [bx, by] = toPdf(rotateAbout([object.x, object.y + height], center, object.rotation));
          page.drawRectangle({ x: bx, y: by, width, height, color: rgbOf(object.background), rotate: angle(object.rotation) });
        }
        lines.forEach((line, i) => {
          const text = winAnsi(line);
          const lineWidth = font.widthOfTextAtSize(text, object.size);
          const free = width - TEXT_PADDING * 2 - lineWidth;
          const offset = object.align === 'center' ? free / 2 : object.align === 'right' ? free : 0;
          // Baseline of line i, from the top of the box.
          const baseline = TEXT_PADDING + object.size * LINE_HEIGHT * i + object.size * 0.95;
          const start = [object.x + TEXT_PADDING + offset, object.y + baseline];
          const [x, y] = toPdf(rotateAbout(start, center, object.rotation));
          page.drawText(text, { x, y, size: object.size, font, color: rgbOf(object.color), opacity, rotate: angle(object.rotation) });
          if (object.underline && text.trim()) {
            const a = toPdf(rotateAbout([start[0], start[1] + object.size * 0.12], center, object.rotation));
            const b = toPdf(rotateAbout([start[0] + lineWidth, start[1] + object.size * 0.12], center, object.rotation));
            page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: Math.max(0.5, object.size / 16), color: rgbOf(object.color), opacity });
          }
        });
      } else if (object.type === 'image') {
        const image = await imageFor(object.src);
        const center = [object.x + object.width / 2, object.y + object.height / 2];
        const [x, y] = toPdf(rotateAbout([object.x, object.y + object.height], center, object.rotation));
        page.drawImage(image, { x, y, width: object.width, height: object.height, opacity, rotate: angle(object.rotation) });
      } else if (object.type === 'rect' || object.type === 'highlight') {
        const center = [object.x + object.width / 2, object.y + object.height / 2];
        const [x, y] = toPdf(rotateAbout([object.x, object.y + object.height], center, object.rotation));
        page.drawRectangle({
          x,
          y,
          width: object.width,
          height: object.height,
          rotate: angle(object.rotation),
          ...(object.fill ? { color: rgbOf(object.fill), opacity } : {}),
          ...(object.stroke && object.type === 'rect' ? { borderColor: rgbOf(object.stroke), borderWidth: object.strokeWidth, borderOpacity: opacity } : {}),
          ...(object.type === 'highlight' ? { blendMode: BlendMode.Multiply } : {}),
        });
      } else if (object.type === 'ellipse') {
        const [x, y] = toPdf([object.x + object.width / 2, object.y + object.height / 2]);
        const turned = total % 180 !== 0;
        page.drawEllipse({
          x,
          y,
          xScale: (turned ? object.height : object.width) / 2,
          yScale: (turned ? object.width : object.height) / 2,
          rotate: degrees(-(object.rotation ?? 0)),
          ...(object.fill ? { color: rgbOf(object.fill), opacity } : {}),
          ...(object.stroke ? { borderColor: rgbOf(object.stroke), borderWidth: object.strokeWidth, borderOpacity: opacity } : {}),
        });
      } else if (object.points) {
        const color = rgbOf(object.stroke);
        const segments = [];
        for (let i = 1; i < object.points.length; i++) segments.push([object.points[i - 1], object.points[i]]);
        if (object.type === 'arrow' && object.points.length >= 2) {
          const [from, to] = object.points.slice(-2);
          const length = Math.max(8, object.strokeWidth * 4);
          const theta = Math.atan2(to[1] - from[1], to[0] - from[0]);
          for (const side of [-1, 1]) segments.push([to, [to[0] - length * Math.cos(theta + side * 0.45), to[1] - length * Math.sin(theta + side * 0.45)]]);
        }
        for (const [a, b] of segments) {
          const [ax, ay] = toPdf(a);
          const [bx, by] = toPdf(b);
          page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: object.strokeWidth, color, opacity, lineCap: LineCapStyle.Round });
        }
      } else if (object.type === 'comment') {
        const [x, y] = toPdf([object.x, object.y + 22]);
        const [x2, y2] = toPdf([object.x + 22, object.y]);
        const annotation = out.context.obj({
          Type: 'Annot',
          Subtype: 'Text',
          Rect: [Math.min(x, x2), Math.min(y, y2), Math.max(x, x2), Math.max(y, y2)],
          Contents: PDFHexString.fromText(object.text ?? ''),
          T: PDFHexString.fromText(object.author ?? author ?? ''),
          M: PDFString.fromDate(new Date(object.createdAt ?? Date.now())),
          Name: 'Comment',
          C: [1, 0.85, 0.1],
          Open: false,
        });
        page.node.addAnnot(out.context.register(annotation));
      }
    }
  }
  if (title) out.setTitle(winAnsi(title));
  out.setModificationDate(new Date());
  return out.save();
}

// One blank page as a tiny PDF - a source like any other.
export async function blankPdf([width, height]) {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  return doc.save();
}

// Some pages of a PDF as a new PDF (extract and split).
export async function pickPages(bytes, indexes) {
  const { PDFDocument } = await loadPdfLib();
  const source = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(source, indexes)) out.addPage(page);
  return out.save();
}

// Whether pdf-lib can change this PDF: an encrypted one can be shown but not edited.
export async function checkEditable(bytes) {
  const { PDFDocument } = await loadPdfLib();
  try {
    await PDFDocument.load(bytes, { updateMetadata: false });
    return { editable: true };
  } catch (err) {
    if (/encrypt/i.test(err.message)) return { editable: false, reason: 'This PDF is protected (encrypted). It can be viewed and printed, but not edited here. Remove the protection in the program that made it, then upload it again.' };
    return { editable: false, reason: `This PDF could not be opened for editing: ${err.message}` };
  }
}
