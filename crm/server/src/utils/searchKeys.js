// Global search works on "search keys": the lower-cased words of a record's
// number, name, email and so on, stored on the record and indexed. A search
// word matches when a key starts with it, which the index answers directly -
// unlike a "contains" pattern, which reads every record.

const WORD = /[\p{L}\p{N}]+/gu;
const PHONE = /^\+?[\d\s().-]{6,}$/;
const MAX_KEY_LENGTH = 40;
const MAX_KEYS = 80;
const NATIONAL_DIGITS = 10;

// "Société Générale, LD-000012" -> ['societe', 'generale', 'ld', '000012']
export function searchWords(text) {
  const plain = String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return (plain.match(WORD) ?? []).map((word) => word.slice(0, MAX_KEY_LENGTH));
}

// The keys for a record, from the values of its searchable fields.
export function searchKeysOf(values) {
  const keys = new Set();
  for (const value of values.flat()) {
    if (value === null || value === undefined || value === '') continue;
    for (const word of searchWords(value)) {
      keys.add(word);
      // A running number is also found without its leading zeros: 000012 as 12.
      if (/^0+\d+$/.test(word)) keys.add(word.replace(/^0+(?=\d)/, ''));
    }
    // A phone number is also found typed in one go, with or without its country code.
    if (PHONE.test(String(value))) {
      const digits = String(value).replace(/\D/g, '');
      keys.add(digits);
      if (digits.length > NATIONAL_DIGITS) keys.add(digits.slice(-NATIONAL_DIGITS));
    }
  }
  return [...keys].slice(0, MAX_KEYS);
}
