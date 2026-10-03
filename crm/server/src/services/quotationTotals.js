// The one place quotation money is calculated. Nothing a client sends for
// subtotal, discount amounts, tax or totals is ever used.
//
// For each line:
//   gross    = quantity x unitPrice
//   discount = gross x discountPercent%
//   total    = gross - discount                       (before tax)
// For the quotation:
//   subtotal = sum of line totals
//   discount = subtotal x discountPercent%
//   tax      = sum over lines of (line total less its share of the quotation
//              discount) x the line's tax rate
//   grandTotal = subtotal - discount + tax
//
// Every amount is rounded to 2 decimals as it is produced, so what is stored
// and printed always adds up.

// Half-up to 2 decimals. toPrecision(15) removes binary floating-point noise
// first, so 127.575 (held as 127.57499999999999) rounds to 127.58, not 127.57.
export const round2 = (value) => Math.round(Number((value * 100).toPrecision(15))) / 100;

// `lines`: [{ quantity, unitPrice, discountPercent, taxRate }]. Returns the
// lines with discount, tax and total filled in, and the quotation totals.
export function calculateTotals(lines, discountPercent = 0) {
  const remaining = 1 - discountPercent / 100;

  const items = lines.map((line) => {
    const gross = round2(line.quantity * line.unitPrice);
    const discount = round2((gross * (line.discountPercent ?? 0)) / 100);
    const total = round2(gross - discount);
    const tax = round2((total * remaining * (line.taxRate ?? 0)) / 100);
    return { ...line, discount, tax, total };
  });

  const subtotal = round2(items.reduce((sum, item) => sum + item.total, 0));
  const discount = round2((subtotal * discountPercent) / 100);
  const tax = round2(items.reduce((sum, item) => sum + item.tax, 0));
  const grandTotal = round2(subtotal - discount + tax);

  return { items, subtotal, discountPercent, discount, tax, grandTotal };
}
