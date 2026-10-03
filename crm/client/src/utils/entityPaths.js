// Where each kind of record lives in the app. Used to turn an
// { entityType, entityId } pair from the API into a link.
const ENTITY_PATHS = Object.freeze({
  company: 'companies',
  contact: 'contacts',
  lead: 'leads',
  opportunity: 'opportunities',
  quotation: 'quotations',
  order: 'orders',
  customer: 'customers',
  project: 'projects',
  ticket: 'tickets',
  contract: 'contracts',
  payment: 'payments',
  product: 'products',
  user: 'users',
  role: 'roles',
});

// "/quotations/<id>", or null for a kind of record that has no page.
export function entityPath(entityType, entityId) {
  const base = ENTITY_PATHS[entityType];
  return base && entityId ? `/${base}/${entityId}` : null;
}
