// What kind of file a document is, from its type (and name, for the cases
// where browsers report something generic). Decides which viewer, editor and
// conversions are offered.

export const KIND = Object.freeze({ PDF: 'pdf', EXCEL: 'excel', CSV: 'csv', WORD: 'word', IMAGE: 'image', TEXT: 'text', OTHER: 'other' });

const EXTENSIONS = {
  pdf: KIND.PDF,
  xlsx: KIND.EXCEL,
  xls: KIND.EXCEL,
  csv: KIND.CSV,
  docx: KIND.WORD,
  doc: KIND.WORD,
  png: KIND.IMAGE,
  jpg: KIND.IMAGE,
  jpeg: KIND.IMAGE,
  gif: KIND.IMAGE,
  webp: KIND.IMAGE,
  txt: KIND.TEXT,
};

export function kindOf({ fileType = '', fileName = '' } = {}) {
  if (fileType === 'application/pdf') return KIND.PDF;
  if (/spreadsheetml|vnd\.ms-excel/.test(fileType) && !/\.csv$/i.test(fileName)) return KIND.EXCEL;
  if (fileType === 'text/csv') return KIND.CSV;
  if (/wordprocessingml|msword/.test(fileType)) return KIND.WORD;
  if (fileType.startsWith('image/')) return KIND.IMAGE;
  if (fileType === 'text/plain') return KIND.TEXT;
  return EXTENSIONS[(fileName.split('.').pop() ?? '').toLowerCase()] ?? KIND.OTHER;
}

export const extensionOf = (fileName = '') => (fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '');
export const baseName = (fileName = '') => fileName.replace(/\.[^.]+$/, '');

// What can be done with each kind, in the browser.
export const CAN = {
  editPdf: (kind) => kind === KIND.PDF,
  editSheet: (kind) => kind === KIND.EXCEL || kind === KIND.CSV,
  toExcel: (kind) => kind === KIND.PDF,
  toPdf: (kind) => kind === KIND.EXCEL || kind === KIND.CSV || kind === KIND.IMAGE,
  print: (kind) => [KIND.PDF, KIND.EXCEL, KIND.CSV, KIND.IMAGE, KIND.WORD, KIND.TEXT].includes(kind),
  preview: (kind) => kind !== KIND.OTHER,
};

export const MIME = Object.freeze({
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
