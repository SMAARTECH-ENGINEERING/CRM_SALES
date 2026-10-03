import mongoose from 'mongoose';
import { jsonOptions } from './shared/json.js';
import { softDelete } from './shared/softDelete.js';

const { ObjectId } = mongoose.Schema.Types;

// An amount to collect from a company (an invoice) and how much of it has been
// received. The company's details stay on the company; this references it,
// its customer record and, optionally, the order being paid for.
const paymentSchema = new mongoose.Schema(
  {
    // Entered (the number from the accounting system) or generated; fixed afterwards.
    invoiceNumber: { type: String, required: true, unique: true, immutable: true, trim: true, maxlength: 40 },
    companyId: { type: ObjectId, ref: 'Company', required: true, index: true },
    // The company's customer record, filled in by the server when there is one.
    customerId: { type: ObjectId, ref: 'Customer', index: true },
    orderId: { type: ObjectId, ref: 'Order', index: true },
    // What is to be collected.
    amount: { type: Number, required: true, min: 0 },
    // What has been received so far.
    paidAmount: { type: Number, required: true, min: 0, default: 0 },
    // ALWAYS worked out by the server: amount - paidAmount, never below 0.
    remainingAmount: { type: Number, required: true, min: 0, index: true },
    dueDate: { type: Date, index: true },
    // When money was (last) received.
    paymentDate: { type: Date },
    paymentMethodId: { type: ObjectId, ref: 'PaymentMethod', index: true },
    // Follows the amounts (unpaid / partially paid / paid) unless cancelled.
    statusId: { type: ObjectId, ref: 'PaymentStatus', required: true, index: true },
    notes: { type: String, trim: true, maxlength: 5000 },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({
      omit: ['deletedAt'],
      aliases: {
        companyId: 'company',
        customerId: 'customer',
        orderId: 'order',
        paymentMethodId: 'paymentMethod',
        statusId: 'status',
        createdBy: 'createdByUser',
      },
    }),
  }
);

softDelete(paymentSchema);

export default mongoose.model('Payment', paymentSchema);
