import { MESSAGES, PRODUCT_STATUS } from '../constants/index.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import { calculateTotals } from './quotationTotals.js';

// Pricing shared by every document with product lines (quotations, orders).

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const empty = (value) => value === undefined || value === null || value === '';

// Calendar dates are stored as UTC midnight.
export const startOfDay = (date) => new Date(new Date(date).toISOString().slice(0, 10));

// Turns the lines a client sends ({ productId, description, quantity,
// unitPrice?, discountPercent? }) into priced lines. The product's name, SKU,
// unit and tax are read from the database - a client cannot supply them - and
// the unit price defaults to the product's selling price.
//
// `keptProductIds`: products already on the document, which stay allowed even
// if they have since been deactivated.
export async function priceLines(inputItems, keptProductIds = new Set()) {
  const ids = [...new Set(inputItems.map((item) => item.productId))];
  const products = await Product.find({ _id: { $in: ids } }).populate([
    { path: 'unitId', select: 'symbol' },
    { path: 'taxId', select: 'name rate' },
  ]);
  const byId = new Map(products.map((product) => [product.id, product]));

  return inputItems.map((item, index) => {
    const field = `items.${index}.productId`;
    const product = byId.get(item.productId);
    if (!product) throw badReference(field, MESSAGES.QUOTATION_PRODUCT_NOT_FOUND);
    if (product.status !== PRODUCT_STATUS.ACTIVE && !keptProductIds.has(product.id)) {
      throw badReference(field, MESSAGES.QUOTATION_PRODUCT_INACTIVE);
    }

    return {
      productId: product._id,
      sku: product.sku,
      name: product.name,
      description: item.description || undefined,
      unit: product.unitId?.symbol,
      quantity: item.quantity,
      unitPrice: empty(item.unitPrice) ? product.basePrice : item.unitPrice,
      discountPercent: item.discountPercent ?? 0,
      taxName: product.taxId?.name,
      taxRate: product.taxId?.rate ?? 0,
    };
  });
}

// Writes calculated lines and totals onto a document.
export function applyTotals(document, lines, discountPercent) {
  const totals = calculateTotals(lines, discountPercent);
  document.items = totals.items;
  document.subtotal = totals.subtotal;
  document.discountPercent = totals.discountPercent;
  document.discount = totals.discount;
  document.tax = totals.tax;
  document.grandTotal = totals.grandTotal;
}

// The products already on a document.
export const productIdsOf = (document) => new Set(document.items.map((item) => String(item.productId)));
