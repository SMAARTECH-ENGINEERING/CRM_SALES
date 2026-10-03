// The sections shown on a company's detail page, and how many records each
// holds for a given company.
//
// A section becomes "available" when the module that owns it registers a
// provider here. Until then the API reports it as unavailable with no count,
// so the UI can say so instead of showing an invented number.
//
//   registerCompanySection('contacts', {
//     count: (companyId) => Contact.countDocuments({ companyId }),
//     blocksDelete: true,   // the company cannot be deleted while count > 0
//   });

const SECTIONS = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'leads', label: 'Leads' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'orders', label: 'Orders' },
  { key: 'projects', label: 'Projects' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'payments', label: 'Payments' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'documents', label: 'Documents' },
  { key: 'activities', label: 'Activities' },
  { key: 'timeline', label: 'Timeline' },
];

const providers = new Map();

// Records that are not a section of the page but still stop a company being
// deleted:  registerCompanyDeleteGuard('Customer', (companyId) => Customer.countDocuments({ companyId }))
const deleteGuards = [];

export function registerCompanyDeleteGuard(label, count) {
  deleteGuards.push({ label, count });
}

export function registerCompanySection(key, provider) {
  if (!SECTIONS.some((section) => section.key === key)) {
    throw new Error(`Unknown company section: ${key}`);
  }
  providers.set(key, provider);
}

export function getCompanySections(companyId) {
  return Promise.all(
    SECTIONS.map(async ({ key, label }) => {
      const provider = providers.get(key);
      if (!provider) return { key, label, available: false, count: null };
      return { key, label, available: true, count: await provider.count(companyId) };
    })
  );
}

// Records that would be orphaned if the company were deleted: [{ label, count }].
export async function getDeleteBlockers(companyId) {
  const blockers = await Promise.all([
    ...SECTIONS.filter(({ key }) => providers.get(key)?.blocksDelete).map(async ({ key, label }) => ({
      label,
      count: await providers.get(key).count(companyId),
    })),
    ...deleteGuards.map(async ({ label, count }) => ({ label, count: await count(companyId) })),
  ]);
  return blockers.filter((blocker) => blocker.count > 0);
}
