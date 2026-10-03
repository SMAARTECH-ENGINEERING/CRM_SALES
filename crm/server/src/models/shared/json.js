// toJSON options shared by models: `id` instead of `_id`, no `__v`, internal
// fields removed, and populated references exposed under an alias while the
// reference field itself stays a plain id.
//
//   jsonOptions({ omit: ['deletedAt'], aliases: { industryId: 'industry' } })
//   -> { industryId: '<id>', industry: { id, name } }   when populated
//   -> { industryId: '<id>' }                           when not
export function jsonOptions({ omit = [], aliases = {} } = {}) {
  return {
    virtuals: true,
    versionKey: false,
    transform(doc, ret) {
      delete ret._id;
      for (const field of omit) delete ret[field];

      for (const [path, alias] of Object.entries(aliases)) {
        const originalId = doc.populated(path);
        if (originalId) {
          ret[alias] = ret[path];
          ret[path] = String(originalId);
        }
      }
      return ret;
    },
  };
}
