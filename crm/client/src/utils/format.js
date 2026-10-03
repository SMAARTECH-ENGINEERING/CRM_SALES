// The language dates and numbers are written in: '' is the browser's own. It
// follows the language the user chose (see i18n/index.js), while the data
// itself stays language-neutral.
let locale = '';
let formatters = {};

export function configureLocale(value) {
  locale = value || '';
  formatters = {};
}

// One Intl formatter per kind, rebuilt when the language changes.
function formatter(name, create) {
  formatters[name] ??= create(locale || undefined);
  return formatters[name];
}
const dateTime = () => formatter('dateTime', (l) => new Intl.DateTimeFormat(l, { dateStyle: 'medium', timeStyle: 'short' }));
// Calendar dates are stored as UTC midnight; show them without shifting the day.
const dateOnly = () => formatter('dateOnly', (l) => new Intl.DateTimeFormat(l, { dateStyle: 'medium', timeZone: 'UTC' }));
const amount = () => formatter('amount', (l) => new Intl.NumberFormat(l, { maximumFractionDigits: 2 }));
const compact = () => formatter('compact', (l) => new Intl.NumberFormat(l, { notation: 'compact', maximumFractionDigits: 1 }));
const monthYear = () => formatter('monthYear', (l) => new Intl.DateTimeFormat(l, { month: 'short', year: '2-digit', timeZone: 'UTC' }));
const relative = () => formatter('relative', (l) => new Intl.RelativeTimeFormat(l, { numeric: 'auto' }));

export const EMPTY = '—';

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// How dates read and which currency amounts are in. These are application
// settings, fetched from the API and applied here once (see useSettings.js);
// until then - and in tests - the viewer's own browser conventions are used.
let config = { timezone: '', dateFormat: 'locale', currency: '' };

export function configureFormat({ timezone, dateFormat, currency } = {}) {
  config = { timezone: timezone || '', dateFormat: dateFormat || 'locale', currency: currency || '' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The parts of a date as seen in a time zone ('' = the viewer's own).
function partsOf(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

// A date written in one of the configured patterns, e.g. DD/MM/YYYY.
function patterned(date, timeZone) {
  const { year, month, day } = partsOf(date, timeZone);
  return config.dateFormat.replace('YYYY', year).replace('MMM', MONTHS[Number(month) - 1]).replace('MM', month).replace('DD', day);
}

// A moment in time, in the configured time zone and date format.
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return EMPTY;
  if (config.dateFormat === 'locale') {
    return config.timezone ? new Intl.DateTimeFormat(locale || undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: config.timezone }).format(date) : dateTime().format(date);
  }
  const { hour, minute } = partsOf(date, config.timezone);
  return `${patterned(date, config.timezone)} ${hour}:${minute}`;
}

// A calendar date (stored as UTC midnight), in the configured date format.
export function formatDate(value) {
  const date = toDate(value);
  if (!date) return EMPTY;
  return config.dateFormat === 'locale' ? dateOnly().format(date) : patterned(date, 'UTC');
}

// An amount with the configured currency code, e.g. "INR 1,250.50".
export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return EMPTY;
  return config.currency ? `${config.currency} ${amount().format(value)}` : amount().format(value);
}

// A monetary amount with digit grouping. No currency symbol: amounts are stored
// as plain numbers in one implied currency.
export function formatAmount(value) {
  return value === null || value === undefined || value === '' ? EMPTY : amount().format(value);
}


// A large amount in short form, for charts and tiles: 12,900 -> "12.9K".
export function formatCompact(value) {
  return value === null || value === undefined ? EMPTY : compact().format(value);
}

// "2031-05" -> "May 31" (in the viewer's language).
export function formatMonth(key) {
  const date = toDate(`${key}-01T00:00:00.000Z`);
  return date ? monthYear().format(date) : key;
}

const RELATIVE_STEPS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

// "3 hours ago", "in 2 days" - in the user's language.
export function formatRelative(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return EMPTY;
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(seconds) >= size) return relative().format(Math.round(seconds / size), unit);
  }
  return relative().format(0, 'minute');
}

// yyyy-mm-dd for <input type="date">.
export function toDateInput(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

// yyyy-mm-ddThh:mm in the viewer's own time zone, for <input type="datetime-local">.
export function toDateTimeInput(value) {
  const date = toDate(value);
  if (!date) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// The reverse: what a datetime-local input holds, as an ISO instant ('' stays '').
export function fromDateTimeInput(value) {
  return value ? new Date(value).toISOString() : '';
}

// 512 -> "512 B", 20480 -> "20 KB", 3145728 -> "3.0 MB"
export function formatBytes(bytes) {
  if (bytes == null) return EMPTY;
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function initials(user) {
  return [user?.firstName, user?.lastName]
    .map((part) => part?.[0] ?? '')
    .join('')
    .toUpperCase();
}
