import { searchKeysOf } from '../../utils/searchKeys.js';

// Makes a model findable by global search: adds the indexed `searchKeys` field
// (see utils/searchKeys.js) and keeps it in step with `fields` on every save.
// The keys are internal - never loaded by ordinary reads, never sent to clients.
export function searchable(schema, fields) {
  schema.add({ searchKeys: { type: [String], select: false } });
  schema.index({ searchKeys: 1 });

  const keysFor = (record) => searchKeysOf(fields.map((field) => record[field]));
  schema.static('searchFields', () => fields);
  schema.static('searchKeysFor', keysFor);

  schema.pre('save', function setSearchKeys() {
    if (this.isNew || fields.some((field) => this.isModified(field))) this.searchKeys = keysFor(this);
  });

  const json = schema.get('toJSON') ?? {};
  schema.set('toJSON', {
    ...json,
    transform(doc, ret, options) {
      const out = json.transform ? json.transform(doc, ret, options) : ret;
      delete out.searchKeys;
      return out;
    },
  });
}
