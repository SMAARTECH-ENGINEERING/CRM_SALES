import Counter from '../models/Counter.js';

// Returns the next number in a named series. The increment is a single atomic
// database operation, so concurrent callers always get different numbers.
// Numbers are never reused, even if the record that took one is later deleted.
export async function nextSequence(name) {
  const increment = () =>
    Counter.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

  try {
    return (await increment()).seq;
  } catch (err) {
    // Two callers can race to create the counter document; the loser retries
    // and increments the one that now exists.
    if (err?.code === 11000) return (await increment()).seq;
    throw err;
  }
}

export function formatCode(prefix, number, digits) {
  return `${prefix}-${String(number).padStart(digits, '0')}`;
}
