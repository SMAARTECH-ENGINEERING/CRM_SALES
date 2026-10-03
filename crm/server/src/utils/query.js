// Helpers shared by list endpoints.

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive search across several fields. Every word must match at least
// one field, so "acme pune" finds the Acme company in Pune. User input is
// escaped: it is matched literally, never interpreted as a pattern.
export function searchFilter(search, fields) {
  const terms = (search ?? '').split(/\s+/).filter(Boolean);
  if (!terms.length) return {};

  return {
    $and: terms.map((term) => {
      const pattern = new RegExp(escapeRegex(term), 'i');
      return { $or: fields.map((field) => ({ [field]: pattern })) };
    }),
  };
}

export function paginationMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
