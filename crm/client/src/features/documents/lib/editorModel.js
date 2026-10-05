// The PDF editor's model.
//
// A document being edited is a list of pages and a list of objects placed on
// them. Each page is a page of a source PDF (the document itself, a merged-in
// PDF, or a blank page) plus an extra rotation. Objects - text, images,
// shapes, drawings, markups, comments - are kept in the page's coordinates as
// shown: points (1/72 inch) from the top-left corner of the page as it appears
// with its rotation. They are written into the PDF only when it is saved
// (see pdfExport.js), so until then every change can be undone.

let counter = 0;
export const uid = (prefix = 'o') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export const FONTS = Object.freeze({
  Helvetica: { label: 'Helvetica (Arial)', css: 'Helvetica, Arial, sans-serif' },
  Times: { label: 'Times', css: '"Times New Roman", Times, serif' },
  Courier: { label: 'Courier', css: '"Courier New", Courier, monospace' },
});

// pdf-lib's names for the built-in fonts.
export function standardFontName(family, bold, italic) {
  if (family === 'Times') return `TimesRoman${bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : ''}`;
  const base = family === 'Courier' ? 'Courier' : 'Helvetica';
  return `${base}${bold && italic ? 'BoldOblique' : bold ? 'Bold' : italic ? 'Oblique' : ''}`;
}

export const TOOLS = Object.freeze({
  SELECT: 'select',
  TEXT: 'text',
  EDIT_TEXT: 'editText',
  IMAGE: 'image',
  RECT: 'rect',
  ELLIPSE: 'ellipse',
  LINE: 'line',
  ARROW: 'arrow',
  DRAW: 'draw',
  HIGHLIGHT: 'highlight',
  UNDERLINE: 'underline',
  STRIKE: 'strike',
  COMMENT: 'comment',
});

export const LINE_HEIGHT = 1.2;
export const TEXT_PADDING = 2;

export function newText(pageId, x, y, overrides = {}) {
  return {
    id: uid(),
    pageId,
    type: 'text',
    x,
    y,
    width: 160,
    rotation: 0,
    text: 'Text',
    font: 'Helvetica',
    size: 12,
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    color: '#000000',
    opacity: 1,
    // A filled box behind the text - used to cover text already on the page.
    background: null,
    // The box grows with the text (no wrapping) until it is given a width.
    autoWidth: true,
    ...overrides,
  };
}

export const newShape = (pageId, type, x, y, width, height, overrides = {}) => ({
  id: uid(),
  pageId,
  type,
  x,
  y,
  width,
  height,
  rotation: 0,
  stroke: '#d32f2f',
  fill: null,
  strokeWidth: 2,
  opacity: 1,
  ...overrides,
});

export const newLine = (pageId, type, points, overrides = {}) => ({ id: uid(), pageId, type, points, stroke: '#d32f2f', strokeWidth: 2, opacity: 1, ...overrides });

export const MARKUP_STYLE = Object.freeze({
  highlight: { fill: '#ffeb3b', opacity: 0.4 },
  underline: { stroke: '#1565c0', strokeWidth: 1.5, opacity: 1 },
  strike: { stroke: '#d32f2f', strokeWidth: 1.5, opacity: 1 },
});

// Lines of a text object as they will be written: explicit line breaks, and
// words wrapped to the box width using the PDF font's own widths, so what is
// shown is what is saved. `measure(text, size)` gives a width in points.
export function wrapLines(object, measure) {
  if (object.autoWidth) return String(object.text ?? '').split('\n');
  const available = Math.max(1, object.width - TEXT_PADDING * 2);
  const lines = [];
  for (const paragraph of String(object.text ?? '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (!line || measure(next, object.size) <= available) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export const textHeight = (object, lineCount) => lineCount * object.size * LINE_HEIGHT + TEXT_PADDING * 2;

// The width of a text box: as set, or (autoWidth) as wide as its longest line.
export function textWidth(object, measure) {
  if (!object.autoWidth) return object.width;
  const widest = Math.max(0, ...String(object.text ?? '').split('\n').map((line) => measure(line, object.size)));
  return Math.max(object.size * 2, widest + TEXT_PADDING * 2 + 1);
}

// The box an object occupies (before its own rotation), for selection frames.
export function boundsOf(object, measure) {
  if (object.type === 'text') {
    return { x: object.x, y: object.y, width: textWidth(object, measure), height: textHeight(object, wrapLines(object, measure).length) };
  }
  if (object.points) {
    const xs = object.points.map((p) => p[0]);
    const ys = object.points.map((p) => p[1]);
    const pad = (object.strokeWidth ?? 2) / 2 + 2;
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }
  if (object.type === 'comment') return { x: object.x, y: object.y, width: 22, height: 22 };
  return { x: object.x, y: object.y, width: object.width, height: object.height };
}

export function moveObject(object, dx, dy) {
  if (object.points) return { ...object, points: object.points.map(([x, y]) => [x + dx, y + dy]) };
  return { ...object, x: object.x + dx, y: object.y + dy };
}

// Objects follow their page when it is turned a quarter clockwise (or back):
// positions turn with the page and each object's own rotation follows.
// `size` is the page's displayed [width, height] before turning.
export function turnObject(object, clockwise, [width, height], measure) {
  const turnPoint = ([x, y]) => (clockwise ? [height - y, x] : [y, width - x]);
  if (object.points) return { ...object, points: object.points.map(turnPoint) };
  const box = boundsOf(object, measure);
  const [cx, cy] = turnPoint([box.x + box.width / 2, box.y + box.height / 2]);
  const rotation = object.rotation === undefined ? undefined : (((object.rotation ?? 0) + (clockwise ? 90 : -90)) % 360 + 360) % 360;
  return { ...object, x: cx - box.width / 2, y: cy - box.height / 2, ...(rotation === undefined ? {} : { rotation }) };
}

// A point of a box, turned with the box about its centre (clockwise degrees, y down).
export function rotateAbout([x, y], [cx, cy], degrees) {
  if (!degrees) return [x, y];
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
}

// Characters the built-in PDF fonts cannot write (anything beyond Western European).
export function unsupportedCharacters(text = '') {
  const found = new Set();
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ₹'.includes(ch)) continue;
    found.add(ch);
  }
  return [...found];
}
