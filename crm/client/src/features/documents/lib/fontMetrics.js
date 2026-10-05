// Widths of text in the built-in PDF fonts, for laying text out in the editor
// exactly as it will be written. Loaded once.

import { loadPdfLib, winAnsi } from './pdfLayout.js';
import { standardFontName } from './editorModel.js';

let loading = null;

export function loadFontMetrics() {
  loading ??= (async () => {
    const { PDFDocument, StandardFonts } = await loadPdfLib();
    const scratch = await PDFDocument.create();
    const fonts = {};
    for (const name of Object.keys(StandardFonts)) {
      if (/Symbol|ZapfDingbats/.test(name)) continue;
      fonts[name] = await scratch.embedFont(StandardFonts[name]);
    }
    // measureFor(object)(text, size) -> width in points
    return {
      measureFor: (object) => {
        const font = fonts[standardFontName(object.font, object.bold, object.italic)] ?? fonts.Helvetica;
        return (text, size) => font.widthOfTextAtSize(winAnsi(text), size);
      },
    };
  })();
  return loading;
}

// Until the fonts are loaded: a fair estimate, so nothing waits on them.
export const roughMeasure = () => (text, size) => String(text).length * size * 0.5;
