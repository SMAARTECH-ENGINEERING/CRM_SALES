// PDF.js, loaded only when a PDF is shown (it is large), with its worker.

let loading = null;

export function loadPdfjs() {
  loading ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return loading;
}

// Opens PDF bytes for showing. A copy is passed, so the caller's bytes stay usable
// (PDF.js takes ownership of what it is given).
export async function openPdf(bytes) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(bytes).slice(), isEvalSupported: false }).promise;
}

// Starts drawing one page into a canvas at `scale` (1 = 72 dpi points).
// Returns { promise (resolves to the viewport), cancel }. A canvas can only be
// drawn by one render at a time: cancel the previous one first.
export function startRender(page, canvas, scale, { rotation } = {}) {
  const viewport = page.getViewport({ scale, ...(rotation !== undefined ? { rotation } : {}) });
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const task = page.render({ canvas, canvasContext: context, viewport });
  return { promise: task.promise.then(() => viewport), cancel: () => task.cancel() };
}

export function renderPage(page, canvas, scale, options) {
  return startRender(page, canvas, scale, options).promise;
}

// Frees a document opened with openPdf (its worker data and pages).
export function closePdf(pdf) {
  pdf?.loadingTask?.destroy().catch(() => {});
}
