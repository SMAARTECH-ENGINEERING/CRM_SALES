import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// One priced line of a document (quotation, order). Everything except the
// product, description, quantity, unit price and discount percentage is filled
// in by the server: the product's name, SKU, unit and tax are copied when the
// line is written, so the document keeps saying what was sold even if the
// product changes later. Amounts come from services/quotationTotals.js.
export const lineItemSchema = new mongoose.Schema(
  {
    productId: { type: ObjectId, ref: 'Product', required: true },
    sku: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 1000 },
    unit: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    // Before tax. Defaults to the product's selling price.
    unitPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    // Calculated: the discount amount on this line.
    discount: { type: Number, default: 0 },
    // From the product's tax.
    taxName: { type: String, trim: true },
    taxRate: { type: Number, default: 0 },
    // Calculated: the tax amount on this line, after the document's own discount.
    tax: { type: Number, default: 0 },
    // Calculated: quantity x unit price less the line discount (before tax).
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

// Money fields of a priced document; all calculated by the server.
export const totalsFields = {
  subtotal: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
};
