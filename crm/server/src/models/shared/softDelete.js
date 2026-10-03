// Soft delete for a schema: adds `deletedAt` and hides deleted documents from
// every read unless a query opts in with .setOptions({ withDeleted: true }).
// The record is kept so references from other records stay valid.
export function softDelete(schema) {
  schema.add({ deletedAt: { type: Date, default: null } });

  function excludeDeleted() {
    if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
  }
  schema.pre(/^find/, excludeDeleted);
  schema.pre('countDocuments', excludeDeleted);
}
