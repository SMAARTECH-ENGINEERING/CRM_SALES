import mongoose from 'mongoose';
import { TICKET_MESSAGE_TYPE } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// One message in a ticket's conversation: a reply (part of the conversation
// with the customer) or an internal note (staff only). Append-only.
const ticketMessageSchema = new mongoose.Schema(
  {
    ticketId: { type: ObjectId, ref: 'Ticket', required: true, immutable: true },
    type: { type: String, enum: Object.values(TICKET_MESSAGE_TYPE), required: true, immutable: true },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
    authorId: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: jsonOptions({ aliases: { authorId: 'author' } }) }
);

ticketMessageSchema.index({ ticketId: 1, createdAt: 1 });

export default mongoose.model('TicketMessage', ticketMessageSchema);
