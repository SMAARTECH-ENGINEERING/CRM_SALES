// Fills the database with realistic demo data, so every screen has something
// to show: reference lists, a product catalogue, companies with contacts, leads
// (some converted), opportunities spread across the pipeline, activities,
// follow-ups and quotations.
//
//   npm run seed:demo                  # into the database in .env
//   npm run seed:demo -- --force       # again, even if it ran before
//   npm run seed:demo -- --orders      # only: orders from accepted quotations without one
//   npm run seed:demo -- --customers   # only: make some companies customers by hand
//   npm run seed:demo -- --projects    # only: projects for customers that have none
//   npm run seed:demo -- --tickets     # only: support tickets, if there are none yet
//   npm run seed:demo -- --contracts   # only: contracts (AMC), if there are none yet
//   npm run seed:demo -- --payments    # only: payments, if there are none yet
//   npm run seed:demo -- --documents   # only: sample documents, if there are none yet
//
// Every record goes through the same Joi schema and service as the API, so
// numbers, SKUs, totals and validation rules are exactly as if typed in the app.
// Records are owned by the first active full-access user (create one first with
// `npm run create:admin`). Nothing is emailed: all addresses are @example.com,
// which cannot receive mail, and quotations are never "sent".
//
// This is demo data, not configuration: the app works the same without it.
import { connectDB, disconnectDB } from '../src/config/db.js';
import Industry from '../src/models/Industry.js';
import CompanyType from '../src/models/CompanyType.js';
import Organization from '../src/models/Organization.js';
import Pipeline from '../src/models/Pipeline.js';
import PipelineStage from '../src/models/PipelineStage.js';
import Role from '../src/models/Role.js';
import SeedState from '../src/models/SeedState.js';
import User from '../src/models/User.js';
import { createActivity } from '../src/services/activity.service.js';
import { createCompany } from '../src/services/company.service.js';
import { createContact } from '../src/services/contact.service.js';
import { completeFollowUp, createFollowUp } from '../src/services/followUp.service.js';
import { convertLead, createLead } from '../src/services/lead.service.js';
import { createEntry as createConfigEntry, listEntries } from '../src/services/leadConfig.service.js';
import { createEntry as createMasterEntry } from '../src/services/masterData.service.js';
import { createOpportunity, moveOpportunity } from '../src/services/opportunity.service.js';
import { createProduct } from '../src/services/product.service.js';
import { changeOrderStatus, createOrderFromQuotation } from '../src/services/order.service.js';
import { createCustomer } from '../src/services/customer.service.js';
import { createMilestone, createProject, createTask, updateProject, updateMilestone } from '../src/services/project.service.js';
import Project from '../src/models/Project.js';
import Ticket from '../src/models/Ticket.js';
import Contract from '../src/models/Contract.js';
import Order from '../src/models/Order.js';
import Payment from '../src/models/Payment.js';
import Document from '../src/models/Document.js';
import { uploadDocuments } from '../src/services/document.service.js';
import { createPayment } from '../src/services/payment.service.js';
import { createContract } from '../src/services/contract.service.js';
import { addMessage, assignTicket, changeTicketStatus, createTicket } from '../src/services/ticket.service.js';
import Customer from '../src/models/Customer.js';
import Company from '../src/models/Company.js';
import Contact from '../src/models/Contact.js';
import { changeQuotationStatus, createQuotation } from '../src/services/quotation.service.js';
import Quotation from '../src/models/Quotation.js';
import QuotationStatus from '../src/models/QuotationStatus.js';
import { getCompanyProfile, updateCompanyProfile } from '../src/services/settings.service.js';
import {
  seedActivityTypes,
  seedLeadConfig,
  seedPipelines,
  seedOrderStatuses,
  seedProjectStatuses,
  seedQuotationStatuses,
  seedContractSettings,
  seedPaymentSettings,
  seedTicketSettings,
  syncRbac,
} from '../src/services/seed.service.js';
import { createActivitySchema, createFollowUpSchema } from '../src/validators/activity.validator.js';
import { createCompanySchema, masterDataSchema } from '../src/validators/company.validator.js';
import { createContactSchema } from '../src/validators/contact.validator.js';
import { convertLeadSchema, createLeadSchema } from '../src/validators/lead.validator.js';
import { createLeadConfigSchema } from '../src/validators/leadConfig.validator.js';
import { createOpportunitySchema } from '../src/validators/opportunity.validator.js';
import { createProductSchema } from '../src/validators/product.validator.js';
import { createQuotationSchema } from '../src/validators/quotation.validator.js';
import { ROLE_WITH_PERMISSIONS } from '../src/utils/permissions.js';

const SEED_KEY = 'demoData';
const force = process.argv.includes('--force');
// Only the orders step: turns accepted quotations that have no order yet into orders.
const ordersOnly = process.argv.includes('--orders');
// Only: make some companies customers by hand (those with orders already are).
const customersOnly = process.argv.includes('--customers');
// Only: projects (with milestones and tasks) for customers that have none.
const projectsOnly = process.argv.includes('--projects');
// Only: support tickets with conversations, when there are none yet.
const ticketsOnly = process.argv.includes('--tickets');
// Only: contracts for the customers, when there are none yet.
const contractsOnly = process.argv.includes('--contracts');
// Only: payments (paid, part paid, unpaid, overdue), when there are none yet.
const paymentsOnly = process.argv.includes('--payments');
// Only: a few small sample documents, when there are none yet.
const documentsOnly = process.argv.includes('--documents');

// Deterministic "random", so a run is reproducible.
let state = 20261002;
const random = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + Math.floor(random() * (max - min + 1));
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days) => new Date(Date.now() + days * DAY);
const isoDay = (days) => daysFromNow(days).toISOString().slice(0, 10);
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

// The same checks the API applies to a request body.
async function valid(schema, input) {
  return schema.validateAsync(input, { abortEarly: false, stripUnknown: true, convert: true });
}

const counts = {};
const count = (what) => (counts[what] = (counts[what] ?? 0) + 1);

// --- the data ---------------------------------------------------------------

const INDUSTRIES = ['Manufacturing', 'Information Technology', 'Healthcare', 'Retail', 'Construction', 'Education', 'Logistics'];
const COMPANY_TYPES = ['Customer', 'Prospect', 'Partner', 'Distributor'];
const ORGANIZATIONS = ['Head Office', 'South Region'];

const CATEGORIES = [
  { name: 'Office Furniture', skuPrefix: 'FURN' },
  { name: 'IT Hardware', skuPrefix: 'ITHW' },
  { name: 'Software Licences', skuPrefix: 'SOFT' },
  { name: 'Professional Services', skuPrefix: 'SERV' },
  { name: 'Consumables', skuPrefix: 'CONS' },
];
const UNITS = [
  { name: 'Piece', symbol: 'pc' },
  { name: 'Hour', symbol: 'hr' },
  { name: 'Licence', symbol: 'lic' },
  { name: 'Box', symbol: 'box' },
];
const TAXES = [
  { name: 'GST 18%', rate: 18 },
  { name: 'GST 12%', rate: 12 },
  { name: 'GST 5%', rate: 5 },
  { name: 'Exempt', rate: 0 },
];

// [name, category, unit, tax, basePrice, costPrice]
const PRODUCTS = [
  ['Ergonomic Office Chair', 'Office Furniture', 'pc', 'GST 18%', 8999, 6200],
  ['Executive Desk 160cm', 'Office Furniture', 'pc', 'GST 18%', 24500, 17000],
  ['Height-Adjustable Desk', 'Office Furniture', 'pc', 'GST 18%', 38900, 28000],
  ['Meeting Table 8-Seater', 'Office Furniture', 'pc', 'GST 18%', 46000, 33500],
  ['Filing Cabinet 4-Drawer', 'Office Furniture', 'pc', 'GST 12%', 12750, 9100],
  ['Visitor Chair', 'Office Furniture', 'pc', 'GST 12%', 3450, 2300],
  ['Business Laptop 14"', 'IT Hardware', 'pc', 'GST 18%', 72000, 61000],
  ['27" Monitor', 'IT Hardware', 'pc', 'GST 18%', 18500, 14800],
  ['Docking Station', 'IT Hardware', 'pc', 'GST 18%', 9800, 7400],
  ['Wireless Keyboard and Mouse', 'IT Hardware', 'pc', 'GST 18%', 2950, 1900],
  ['Network Switch 24-Port', 'IT Hardware', 'pc', 'GST 18%', 21400, 16900],
  ['Office Productivity Suite', 'Software Licences', 'lic', 'GST 18%', 8400, 6300],
  ['Endpoint Security (1 year)', 'Software Licences', 'lic', 'GST 18%', 2100, 1350],
  ['CRM User Licence (1 year)', 'Software Licences', 'lic', 'GST 18%', 14400, 9000],
  ['Backup Storage 1TB (1 year)', 'Software Licences', 'lic', 'GST 18%', 6000, 3800],
  ['Installation and Setup', 'Professional Services', 'hr', 'GST 18%', 1800, 900],
  ['Workspace Design Consultation', 'Professional Services', 'hr', 'GST 18%', 3500, 1700],
  ['On-site Training', 'Professional Services', 'hr', 'GST 18%', 2500, 1200],
  ['Annual Maintenance Visit', 'Professional Services', 'hr', 'GST 18%', 2200, 1100],
  ['A4 Paper (5 reams)', 'Consumables', 'box', 'GST 12%', 1450, 1100],
  ['Printer Toner Cartridge', 'Consumables', 'pc', 'GST 18%', 4300, 3100],
  ['Whiteboard Markers (box of 10)', 'Consumables', 'box', 'GST 12%', 380, 240],
  ['First-Aid Kit', 'Consumables', 'pc', 'GST 5%', 1250, 800],
  ['Recycled Notebooks (pack of 20)', 'Consumables', 'box', 'Exempt', 900, 560],
];

// [name, city, state, industry, type]
const COMPANIES = [
  ['Acme Industries', 'Pune', 'Maharashtra', 'Manufacturing', 'Customer'],
  ['Bolt Traders', 'Mumbai', 'Maharashtra', 'Retail', 'Customer'],
  ['Cedar Systems', 'Bengaluru', 'Karnataka', 'Information Technology', 'Prospect'],
  ['Delta Health Clinics', 'Chennai', 'Tamil Nadu', 'Healthcare', 'Customer'],
  ['Evergreen Builders', 'Hyderabad', 'Telangana', 'Construction', 'Prospect'],
  ['Falcon Logistics', 'Ahmedabad', 'Gujarat', 'Logistics', 'Customer'],
  ['Granite Software', 'Kochi', 'Kerala', 'Information Technology', 'Partner'],
  ['Horizon Academy', 'Jaipur', 'Rajasthan', 'Education', 'Prospect'],
  ['Indigo Retail Mart', 'Kolkata', 'West Bengal', 'Retail', 'Customer'],
  ['Juniper Pharma', 'Vadodara', 'Gujarat', 'Healthcare', 'Prospect'],
  ['Kestrel Engineering', 'Coimbatore', 'Tamil Nadu', 'Manufacturing', 'Customer'],
  ['Lotus Hospitality', 'Goa', 'Goa', 'Retail', 'Prospect'],
  ['Meridian Infotech', 'Noida', 'Uttar Pradesh', 'Information Technology', 'Customer'],
  ['Nova Packaging', 'Indore', 'Madhya Pradesh', 'Manufacturing', 'Prospect'],
  ['Orchid Schools Trust', 'Lucknow', 'Uttar Pradesh', 'Education', 'Customer'],
  ['Pinnacle Realty', 'Gurugram', 'Haryana', 'Construction', 'Customer'],
  ['Quartz Electronics', 'Chandigarh', 'Punjab', 'Manufacturing', 'Distributor'],
  ['Riverline Freight', 'Visakhapatnam', 'Andhra Pradesh', 'Logistics', 'Prospect'],
  ['Saffron Foods', 'Nagpur', 'Maharashtra', 'Retail', 'Customer'],
  ['Teal Diagnostics', 'Mysuru', 'Karnataka', 'Healthcare', 'Prospect'],
];

const FIRST = ['Priya', 'Rahul', 'Ananya', 'Vikram', 'Sneha', 'Arjun', 'Meera', 'Karan', 'Divya', 'Rohan', 'Kavya', 'Aditya', 'Isha', 'Nikhil', 'Pooja', 'Sanjay', 'Neha', 'Amit', 'Ritu', 'Varun'];
const LAST = ['Nair', 'Sharma', 'Iyer', 'Patel', 'Reddy', 'Gupta', 'Menon', 'Kapoor', 'Joshi', 'Rao', 'Desai', 'Banerjee', 'Pillai', 'Verma', 'Kulkarni'];
const DESIGNATIONS = ['Purchase Manager', 'Operations Head', 'IT Manager', 'Director', 'Facilities Manager', 'Finance Controller', 'Admin Executive', 'CEO'];

const LEAD_TOPICS = [
  'Office refurbishment',
  'Laptop refresh for sales team',
  'New branch fit-out',
  'Security licence renewal',
  'Meeting room upgrade',
  'Annual maintenance contract',
  'Network upgrade',
  'Ergonomic seating rollout',
  'Training programme',
  'Consumables supply contract',
  'Remote work kits',
  'Backup and recovery setup',
];

const ACTIVITY_SUBJECTS = [
  'Introductory call',
  'Requirement discussion',
  'Site visit',
  'Product demo',
  'Sent brochure and price list',
  'Follow-up on proposal',
  'Negotiated payment terms',
  'Clarified delivery timelines',
];
const FOLLOW_UP_TITLES = ['Call back about budget', 'Send revised proposal', 'Confirm site visit date', 'Share case studies', 'Check decision status'];

// --- steps ------------------------------------------------------------------

async function findActor() {
  const fullAccess = await Role.distinct('_id', { isSuperAdmin: true });
  const user = await User.findOne({ roleId: { $in: fullAccess }, status: 'active' })
    .sort({ createdAt: 1 })
    .populate(ROLE_WITH_PERMISSIONS);
  if (!user) throw new Error('No active full-access user. Create one first: npm run create:admin -- ...');
  return user;
}

// Existing entries are reused by name, so the script also works on a database
// where some of these lists were already filled in by hand.
async function masterList(Model, names, actor) {
  const byName = new Map();
  for (const name of names) {
    const existing = await Model.findOne({ name }).collation({ locale: 'en', strength: 2 });
    byName.set(name, existing ?? (await createMasterEntry(Model, await valid(masterDataSchema, { name }), actor)));
  }
  return byName;
}

async function configList(kind, entries, actor) {
  const existing = await listEntries(kind);
  const byName = new Map(existing.map((entry) => [entry.name.toLowerCase(), entry]));
  const result = new Map();
  for (const entry of entries) {
    let item = byName.get(entry.name.toLowerCase());
    if (!item) {
      item = await createConfigEntry(kind, await valid(createLeadConfigSchema(kind), entry), actor);
      count(kind);
    }
    result.set(entry.name, item);
  }
  return result;
}

async function seedCatalogue(actor) {
  const categories = await configList('productCategories', CATEGORIES, actor);
  const units = await configList('units', UNITS, actor);
  const taxes = await configList('taxes', TAXES, actor);
  const unitBySymbol = new Map(UNITS.map((unit) => [unit.symbol, units.get(unit.name)]));

  const products = [];
  for (const [name, category, unit, tax, basePrice, costPrice] of PRODUCTS) {
    const input = await valid(createProductSchema, {
      name,
      description: `${name} - demo product`,
      categoryId: categories.get(category).id,
      unitId: unitBySymbol.get(unit).id,
      taxId: taxes.get(tax).id,
      basePrice,
      costPrice,
    });
    products.push(await createProduct(input, actor));
    count('products');
  }
  return products;
}

async function seedCompanies(actor, lookups) {
  const companies = [];
  for (const [index, [name, city, state, industry, type]] of COMPANIES.entries()) {
    const domain = `${slug(name)}.example.com`;
    const input = await valid(createCompanySchema, {
      name,
      legalName: `${name} Pvt Ltd`,
      industryId: lookups.industries.get(industry).id,
      companyTypeId: lookups.companyTypes.get(type).id,
      organizationId: lookups.organizations.get(pick(ORGANIZATIONS)).id,
      email: `info@${domain}`,
      phone: `+91 ${between(70000, 99999)} ${between(10000, 99999)}`,
      website: `https://www.${domain}`,
      address: `${between(1, 250)}, ${pick(['MG Road', 'Station Road', 'Industrial Estate', 'Tech Park', 'Ring Road'])}`,
      city,
      state,
      country: 'India',
      postalCode: String(between(110001, 799999)),
      assignedTo: actor.id,
      notes: 'Demo data',
    });
    const company = await createCompany(input, actor);
    count('companies');

    // Two or three people at each company.
    company.contacts = [];
    const people = between(2, 3);
    for (let n = 0; n < people; n += 1) {
      const firstName = FIRST[(index * 3 + n) % FIRST.length];
      const lastName = LAST[(index * 2 + n) % LAST.length];
      const contact = await createContact(
        await valid(createContactSchema, {
          firstName,
          lastName,
          companyId: company.id,
          email: `${slug(firstName)}.${slug(lastName)}@${domain}`,
          phone: `+91 ${between(70000, 99999)} ${between(10000, 99999)}`,
          designation: DESIGNATIONS[(index + n) % DESIGNATIONS.length],
        }),
        actor
      );
      company.contacts.push(contact);
      count('contacts');
    }
    companies.push(company);
  }
  return companies;
}

async function seedLeads(actor, companies) {
  const sources = await listEntries('sources', { isActive: true });
  const priorities = await listEntries('priorities', { isActive: true });
  const statuses = await listEntries('statuses', { isActive: true });
  const openStatuses = statuses.filter((status) => status.category === 'open');
  const lostStatus = statuses.find((status) => status.category === 'lost');

  const leads = [];
  for (let n = 0; n < 36; n += 1) {
    // Most leads already know their company; some are still anonymous enquiries.
    const company = n % 4 === 3 ? null : companies[n % companies.length];
    const contact = company ? pick(company.contacts) : null;
    const status = n % 9 === 8 && lostStatus ? lostStatus : pick(openStatuses);
    const input = await valid(createLeadSchema, {
      title: `${pick(LEAD_TOPICS)}${company ? ` - ${company.name}` : ''}`,
      description: 'Demo lead',
      companyId: company?.id,
      contactId: contact?.id,
      sourceId: pick(sources).id,
      priorityId: pick(priorities).id,
      statusId: status.id,
      estimatedValue: between(5, 120) * 5000,
      expectedCloseDate: isoDay(between(10, 120)),
      assignedTo: actor.id,
      tags: ['demo', pick(['hot', 'q3', 'enterprise', 'repeat'])],
    });
    leads.push(await createLead(input, actor));
    count('leads');
  }

  // Convert a third of the open ones that have a company: each becomes an
  // opportunity in the first stage of the default pipeline.
  const convertible = leads.filter((lead) => lead.companyId && lead.statusId?.category === 'open');
  for (const lead of convertible.slice(0, 10)) {
    await convertLead(lead.id, await valid(convertLeadSchema, {}), actor);
    count('leads converted');
  }
  // And one anonymous enquiry, creating its company and contact on the way.
  const anonymous = leads.find((lead) => !lead.companyId);
  if (anonymous) {
    await convertLead(
      anonymous.id,
      await valid(convertLeadSchema, {
        company: { name: 'Zenith Coworking', city: 'Bengaluru', country: 'India', email: 'hello@zenithcoworking.example.com' },
        contact: { firstName: 'Tara', lastName: 'Bose', email: 'tara.bose@zenithcoworking.example.com' },
      }),
      actor
    );
    count('leads converted');
  }
  return leads;
}

async function seedOpportunities(actor, companies) {
  const pipeline = await Pipeline.findOne({ isDefault: true });
  if (!pipeline) return [];
  const stages = await PipelineStage.find({ pipelineId: pipeline._id, status: 'active' }).sort({ order: 1 });
  const priorities = await listEntries('priorities', { isActive: true });

  const opportunities = [];
  for (let n = 0; n < 24; n += 1) {
    const company = companies[(n * 7) % companies.length];
    const opportunity = await createOpportunity(
      await valid(createOpportunitySchema, {
        name: `${pick(LEAD_TOPICS)} - ${company.name}`,
        companyId: company.id,
        contactId: pick(company.contacts).id,
        estimatedValue: between(4, 150) * 5000,
        expectedCloseDate: isoDay(between(5, 150)),
        priorityId: pick(priorities).id,
        assignedTo: actor.id,
        notes: 'Demo opportunity',
      }),
      actor
    );
    count('opportunities');

    // Spread them over the board, moving stage by stage as a real deal would.
    const target = stages[n % stages.length];
    for (const stage of stages.slice(1, stages.indexOf(target) + 1)) {
      if (stage.type !== 'open' && stage !== target) continue;
      await moveOpportunity(opportunity.id, stage.id, actor);
    }
    opportunity.companyRecord = company;
    opportunities.push(opportunity);
  }
  return opportunities;
}

async function seedActivities(actor, companies, opportunities) {
  const types = await listEntries('activityTypes', { isActive: true });
  if (!types.length) return;

  for (const [index, company] of companies.entries()) {
    // Done in the past...
    for (let n = 0; n < 2; n += 1) {
      await createActivity(
        await valid(createActivitySchema, {
          typeId: pick(types).id,
          subject: pick(ACTIVITY_SUBJECTS),
          description: 'Demo activity',
          contactId: pick(company.contacts).id,
          status: 'completed',
          completedAt: daysFromNow(-between(1, 40)).toISOString(),
          priority: pick(['low', 'medium', 'high']),
        }),
        actor
      );
      count('activities');
    }
    // ...and planned, some already overdue.
    await createActivity(
      await valid(createActivitySchema, {
        typeId: pick(types).id,
        subject: pick(ACTIVITY_SUBJECTS),
        companyId: company.id,
        dueDate: daysFromNow(index % 5 === 0 ? -between(1, 5) : between(1, 20)).toISOString(),
        priority: pick(['low', 'medium', 'high']),
      }),
      actor
    );
    count('activities');
  }

  for (const [index, opportunity] of opportunities.entries()) {
    if (index % 2) continue;
    await createActivity(
      await valid(createActivitySchema, {
        typeId: pick(types).id,
        subject: pick(ACTIVITY_SUBJECTS),
        opportunityId: opportunity.id,
        status: 'completed',
        completedAt: daysFromNow(-between(1, 15)).toISOString(),
      }),
      actor
    );
    count('activities');
  }

  for (const [index, opportunity] of opportunities.entries()) {
    if (index % 3) continue;
    const due = index % 4 === 0 ? -between(1, 6) : between(1, 25);
    const followUp = await createFollowUp(
      await valid(createFollowUpSchema, {
        title: pick(FOLLOW_UP_TITLES),
        relatedType: 'opportunity',
        relatedId: opportunity.id,
        dueDate: daysFromNow(due).toISOString(),
        priority: pick(['low', 'medium', 'high']),
      }),
      actor
    );
    count('follow-ups');
    if (index % 9 === 0) await completeFollowUp(followUp.id, actor);
  }
  for (const company of companies.slice(0, 8)) {
    await createFollowUp(
      await valid(createFollowUpSchema, {
        title: pick(FOLLOW_UP_TITLES),
        relatedType: 'company',
        relatedId: company.id,
        dueDate: daysFromNow(between(-3, 30)).toISOString(),
        priority: pick(['low', 'medium', 'high']),
      }),
      actor
    );
    count('follow-ups');
  }
}

async function seedQuotations(actor, products, opportunities) {
  const statuses = await listEntries('quotationStatuses', { isActive: true });
  const byCategory = (category) => statuses.find((status) => status.category === category);
  // Most stay drafts; the rest move on as quotations do.
  const journey = [null, 'accepted', 'sent', 'sent', 'accepted', 'rejected', 'expired', 'accepted'];

  for (let n = 0; n < 18; n += 1) {
    const opportunity = opportunities[(n * 5) % opportunities.length];
    const company = opportunity.companyRecord;
    const lines = Array.from({ length: between(1, 4) }, () => {
      const product = pick(products);
      const line = { productId: product.id, quantity: between(1, 25) };
      if (random() < 0.3) line.discountPercent = pick([5, 10, 12.5]);
      return line;
    });
    const quotation = await createQuotation(
      await valid(createQuotationSchema, {
        companyId: company.id,
        contactId: String(opportunity.contactId?._id ?? opportunity.contactId),
        opportunityId: opportunity.id,
        quotationDate: isoDay(-between(0, 45)),
        items: lines,
        discountPercent: random() < 0.25 ? 5 : 0,
        notes: 'Demo quotation',
      }),
      actor
    );
    count('quotations');

    const category = journey[n % journey.length];
    if (category && byCategory(category)) {
      // Statuses are changed directly; nothing is emailed.
      if (category !== 'sent' && byCategory('sent')) await changeQuotationStatus(quotation.id, byCategory('sent').id, actor);
      await changeQuotationStatus(quotation.id, byCategory(category).id, actor);
    }
  }
}

// Every accepted quotation without an order becomes one, through the same
// checks as POST /orders/from-quotation; some then move along.
async function seedOrders(actor) {
  const accepted = await QuotationStatus.distinct('_id', { category: 'accepted' });
  const quotations = await Quotation.find({ statusId: { $in: accepted }, orderId: null });
  const statuses = await listEntries('orderStatuses', { isActive: true });
  const later = statuses.filter((status) => status.category !== 'open');
  for (const [index, quotation] of quotations.entries()) {
    const order = await createOrderFromQuotation(
      quotation.id,
      { deliveryDate: isoDay(between(7, 45)), assignedTo: actor.id },
      actor
    );
    count('orders');
    if (later.length && index % 3 !== 2) await changeOrderStatus(order.id, later[index % later.length].id, actor);
  }
}

// Companies with orders became customers automatically. A few others are made
// customers by hand, as an account manager would, with a primary contact.
async function seedCustomers(actor) {
  const companies = await Company.find().sort({ createdAt: 1 }).limit(12).select('_id');
  for (const [index, company] of companies.entries()) {
    if (index % 2 || (await Customer.exists({ companyId: company._id }))) continue;
    const contact = await Contact.findOne({ companyId: company._id }).select('_id');
    await createCustomer(
      { companyId: company.id, primaryContactId: contact?.id, accountManagerId: actor.id, status: 'active', customerSince: isoDay(-between(30, 700)) },
      actor
    );
    count('customers');
  }
}

const PROJECT_PLANS = [
  ['Office fit-out', ['Site survey', 'Floor plan', 'Furniture order', 'Installation', 'Handover']],
  ['IT rollout', ['Inventory', 'Imaging', 'Network setup', 'User training']],
  ['Annual maintenance', ['Schedule visits', 'First visit', 'Second visit']],
];

// A project for each customer that has none, through the same service the API
// uses: milestones, tasks for the team, and statuses spread across the board.
async function seedProjects(actor) {
  const projectStatuses = await listEntries('projectStatuses', { isActive: true });
  const taskStatuses = await listEntries('taskStatuses', { isActive: true });
  const byCategory = (list, category) => list.find((status) => status.category === category);
  const customers = await Customer.find().sort({ createdAt: 1 }).limit(6);
  for (const [index, customer] of customers.entries()) {
    if (await Project.exists({ companyId: customer.companyId })) continue;
    const [name, taskNames] = PROJECT_PLANS[index % PROJECT_PLANS.length];
    const firstOrder = customer.firstOrderId ? String(customer.firstOrderId) : undefined;
    const start = between(-60, 10);
    const project = await createProject(
      {
        name,
        companyId: String(customer.companyId),
        orderId: firstOrder,
        description: 'Demo project',
        startDate: isoDay(start),
        expectedEndDate: isoDay(start + between(30, 120)),
        projectManagerId: actor.id,
        teamMembers: [actor.id],
        budget: between(5, 60) * 10000,
      },
      actor
    );
    count('projects');
    const milestone = await createMilestone(project.id, { name: 'Phase 1 complete', dueDate: isoDay(start + 20) }, actor);
    await createMilestone(project.id, { name: 'Handover', dueDate: isoDay(start + 60) }, actor);
    // Earlier tasks are further along.
    const doneCount = between(0, taskNames.length - 1);
    for (const [n, title] of taskNames.entries()) {
      const category = n < doneCount ? 'done' : n === doneCount ? 'in_progress' : 'todo';
      await createTask(
        project.id,
        {
          title,
          statusId: (byCategory(taskStatuses, category) ?? taskStatuses[0]).id,
          assignedTo: actor.id,
          milestoneId: n < 2 ? milestone.id : undefined,
          dueDate: isoDay(start + 7 * (n + 1)),
          estimatedHours: between(2, 24),
        },
        actor
      );
      count('tasks');
    }
    if (doneCount >= 2) await updateMilestone(project.id, milestone.id, { completed: true }, actor);
    const category = ['active', 'active', 'not_started', 'on_hold', 'active', 'completed'][index % 6];
    const status = byCategory(projectStatuses, category);
    if (status && status.category !== project.status?.category) await updateProject(project.id, { statusId: status.id }, actor);
  }
}

const TICKET_STORIES = [
  ['Printer not connecting to the network', 'It stopped working after the router was replaced.', 'Could you share the printer model and a photo of its network settings page?', 'Customer is on the old firmware - known issue.'],
  ['Invoice amount does not match the quotation', 'The invoice shows tax at 18% but the quotation had 12%.', 'Thanks - we are checking the tax setup on that product and will send a corrected invoice.', 'Product tax was changed after quoting; reissue invoice.'],
  ['Delivery delayed', 'The chairs were due last Friday and have not arrived.', 'Apologies - the shipment left our warehouse today. Tracking details to follow.', null],
  ['Training session request', 'We would like a refresher session for new staff next month.', 'Happy to help. Which dates work best for your team?', null],
  ['Laptop battery drains quickly', 'Two laptops from the last order lose charge within an hour.', 'Please run the battery report and attach it here so we can check the health.', 'Possibly a bad batch - check serial numbers.'],
  ['Access to the support portal', 'Our new IT manager needs a login.', 'Done - an invitation has been sent to the address you gave.', null],
  ['Desk height adjustment stuck', 'One standing desk no longer goes up.', 'We will send a technician. Is Thursday morning convenient?', 'Motor replacement covered by warranty.'],
  ['Request for a quotation revision', 'Could you add 10 more monitors to the quotation?', 'Of course - a revised quotation will follow today.', null],
];

// Tickets with a conversation, through the same service as the API: raised
// by a contact, replies and internal notes, and statuses across the board.
async function seedTickets(actor) {
  if (await Ticket.exists({})) return;
  const statuses = await listEntries('ticketStatuses', { isActive: true });
  const categories = await listEntries('ticketCategories', { isActive: true });
  const priorities = await listEntries('ticketPriorities', { isActive: true });
  const byCategory = (category) => statuses.find((status) => status.category === category);
  const journey = ['open', 'in_progress', 'waiting', 'resolved', 'closed', 'in_progress', 'open', 'resolved'];
  const companies = await Company.find().sort({ createdAt: 1 }).limit(8).select('_id');
  for (const [index, [subject, description, reply, note]] of TICKET_STORIES.entries()) {
    const company = companies[index % companies.length];
    const contact = await Contact.findOne({ companyId: company._id }).select('_id');
    const ticket = await createTicket(
      {
        companyId: company.id,
        contactId: contact?.id,
        subject,
        description,
        categoryId: categories[index % categories.length]?.id,
        priorityId: priorities[index % priorities.length]?.id,
      },
      [],
      actor
    );
    count('tickets');
    const target = journey[index % journey.length];
    if (target === 'open') continue;
    await assignTicket(ticket.id, actor.id, actor);
    await changeTicketStatus(ticket.id, (byCategory('in_progress') ?? statuses[0]).id, actor);
    await addMessage(ticket.id, 'reply', reply, [], actor);
    if (note) await addMessage(ticket.id, 'internal_note', note, [], actor);
    if (target !== 'in_progress' && byCategory(target)) await changeTicketStatus(ticket.id, byCategory(target).id, actor);
  }
}

// [days until the end from today, status category, amount, description]
const CONTRACT_STORIES = [
  [5, 'active', 48000, 'AMC for office printers and scanners'],
  [12, 'active', 120000, 'Comprehensive maintenance for laptops'],
  [28, 'active', 75000, 'Help desk support plan'],
  [60, 'active', 36000, 'Furniture maintenance visits, twice a year'],
  [200, 'active', 210000, 'Network equipment AMC'],
  [-10, 'active', 54000, 'Projector maintenance - ended, awaiting the automatic expiry'],
  [150, 'draft', 90000, 'Proposed AMC for the new branch'],
];

// Contracts for the customers, through the same service as the API. End dates
// are relative to today so the reminder check has something to find.
async function seedContracts(actor) {
  if (await Contract.exists({})) return;
  const statuses = await listEntries('contractStatuses', { isActive: true });
  const types = await listEntries('contractTypes', { isActive: true });
  const cycles = await listEntries('billingCycles', { isActive: true });
  const customers = await Customer.find().sort({ createdAt: 1 }).select('companyId');
  if (!customers.length) return;
  const DAY = 24 * 60 * 60 * 1000;
  const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  for (const [index, [endsIn, category, amount, description]] of CONTRACT_STORIES.entries()) {
    await createContract(
      {
        companyId: String(customers[index % customers.length].companyId),
        contractTypeId: types[index % types.length]?.id,
        billingCycleId: cycles[index % cycles.length]?.id,
        statusId: statuses.find((status) => status.category === category)?.id,
        startDate: day(endsIn - 364),
        endDate: day(endsIn),
        renewalDate: endsIn > 15 ? day(endsIn - 15) : undefined,
        amount,
        assignedTo: actor.id,
        description,
      },
      actor
    );
    count('contracts');
  }
}

// [amount, share paid, due in days from today, notes]
const PAYMENT_STORIES = [
  [45000, 1, -40, 'Advance for the annual maintenance contract'],
  [128000, 0.5, -12, 'Second instalment - customer asked for two more weeks'],
  [36500, 0, -6, 'Reminder sent twice'],
  [82000, 0, 14, 'Invoice raised on delivery'],
  [15750.5, 0.4, 21, 'Balance on consumables'],
  [240000, 1, -75, 'Paid in full by bank transfer'],
  [9800, 0, 45, 'Training session'],
  [61000, 0.25, -2, 'Part payment received by cheque'],
];

// Payments through the same service as the API, so remaining amounts and
// statuses are worked out exactly as they would be for a request. Each order
// gets a half-paid invoice for half of it; the rest are company-level.
async function seedPayments(actor) {
  if (await Payment.exists({})) return;
  const methods = await listEntries('paymentMethods', { isActive: true });
  const DAY = 24 * 60 * 60 * 1000;
  const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  const orders = await Order.find().sort({ createdAt: 1 }).limit(5).select('companyId grandTotal');
  for (const [index, order] of orders.entries()) {
    const amount = Math.round(order.grandTotal * 50) / 100;
    if (amount <= 0) continue;
    await createPayment(
      { companyId: String(order.companyId), orderId: order.id, amount, paidAmount: Math.round(amount * 50) / 100, dueDate: day(10), paymentMethodId: methods[index % methods.length]?.id, notes: 'First half of the order' },
      actor
    );
    count('payments');
  }
  const customers = await Customer.find().sort({ createdAt: 1 }).select('companyId');
  if (!customers.length) return;
  for (const [index, [amount, share, dueIn, notes]] of PAYMENT_STORIES.entries()) {
    const paidAmount = Math.round(amount * share * 100) / 100;
    await createPayment(
      {
        companyId: String(customers[index % customers.length].companyId),
        amount,
        paidAmount,
        dueDate: day(dueIn),
        paymentDate: paidAmount ? day(Math.min(dueIn, 0) - 1) : undefined,
        paymentMethodId: paidAmount ? methods[index % methods.length]?.id : undefined,
        notes,
      },
      actor
    );
    count('payments');
  }
}

// A few small sample files, through the same service as the API (so they are
// checked and put in storage exactly as an upload would be).
async function seedDocuments(actor) {
  if (await Document.exists({})) return;
  const file = (name, type, text) => ({ originalname: name, mimetype: type, buffer: Buffer.from(text), size: Buffer.byteLength(text) });
  const pdf = (name, title) => file(name, 'application/pdf', `%PDF-1.4\n% Sample document: ${title}\n%%EOF\n`);
  const companies = await Company.find().sort({ createdAt: 1 }).limit(3).select('_id name');
  for (const company of companies) {
    await uploadDocuments({ entityType: 'company', entityId: company.id }, [pdf('Company registration.pdf', company.name), file('Meeting notes.txt', 'text/plain', `Notes from the introduction call with ${company.name}.\n`)], actor);
    count('documents');
    count('documents');
  }
  const quotation = await Quotation.findOne().sort({ createdAt: 1 }).select('_id quotationNumber');
  if (quotation) {
    await uploadDocuments({ entityType: 'quotation', entityId: quotation.id }, [pdf('Customer purchase order.pdf', quotation.quotationNumber)], actor);
    count('documents');
  }
}

// Only when the profile has never been filled in: a placeholder, clearly
// labelled, so PDFs can be tried. Replace it on the Company profile screen.
async function seedProfileIfEmpty(actor) {
  const profile = await getCompanyProfile();
  if (profile.name) return false;
  await updateCompanyProfile(
    {
      name: 'Your Company (edit in Company profile)',
      address: 'Edit this address in Company profile',
      country: 'India',
      email: 'sales@yourcompany.example.com',
      currency: 'INR',
      quotationValidityDays: 30,
      quotationTerms:
        '1. Prices are valid until the date shown above.\n2. 50% advance with the order, balance on delivery.\n3. Delivery within 2-3 weeks of the purchase order.',
    },
    actor
  );
  return true;
}

// --- run ----------------------------------------------------------------------

let exitCode = 0;
try {
  await connectDB();
  if (documentsOnly) {
    await seedDocuments(await findActor());
    console.log(`Documents: ${counts.documents ?? 0} created.`);
  } else if (paymentsOnly) {
    await seedPaymentSettings();
    await seedPayments(await findActor());
    console.log(`Payments: ${counts.payments ?? 0} created.`);
  } else if (contractsOnly) {
    await seedContractSettings();
    await seedContracts(await findActor());
    console.log(`Contracts: ${counts.contracts ?? 0} created.`);
  } else if (ticketsOnly) {
    await seedTicketSettings();
    await seedTickets(await findActor());
    console.log(`Tickets: ${counts.tickets ?? 0} created.`);
  } else if (projectsOnly) {
    await seedProjectStatuses();
    await seedProjects(await findActor());
    console.log(`Projects: ${counts.projects ?? 0} created, with ${counts.tasks ?? 0} task(s).`);
  } else if (customersOnly) {
    await seedCustomers(await findActor());
    console.log(`Customers: ${counts.customers ?? 0} added by hand.`);
  } else if (ordersOnly) {
    await seedOrderStatuses();
    await seedOrders(await findActor());
    console.log(`Orders: ${counts.orders ?? 0} created from accepted quotations that had none.`);
  } else if (!force && (await SeedState.exists({ _id: SEED_KEY }))) {
    console.log('Demo data was already loaded. Run again with --force to add another set, or --orders to add orders only.');
  } else {
    // The reference lists the demo relies on.
    await syncRbac();
    await seedLeadConfig();
    await seedActivityTypes();
    await seedPipelines();
    await seedQuotationStatuses();
    await seedOrderStatuses();

    const actor = await findActor();
    console.log(`Adding demo data as ${actor.email}...`);

    const lookups = {
      industries: await masterList(Industry, INDUSTRIES, actor),
      companyTypes: await masterList(CompanyType, COMPANY_TYPES, actor),
      organizations: await masterList(Organization, ORGANIZATIONS, actor),
    };
    const products = await seedCatalogue(actor);
    const companies = await seedCompanies(actor, lookups);
    await seedLeads(actor, companies);
    const opportunities = await seedOpportunities(actor, companies);
    await seedActivities(actor, companies, opportunities);
    const profileFilled = await seedProfileIfEmpty(actor);
    await seedQuotations(actor, products, opportunities);
    await seedOrders(actor);
    await seedCustomers(actor);
    await seedProjectStatuses();
    await seedProjects(actor);
    await seedTicketSettings();
    await seedTickets(actor);
    await seedContractSettings();
    await seedContracts(actor);
    await seedPaymentSettings();
    await seedPayments(actor);
    await seedDocuments(actor);

    await SeedState.updateOne({ _id: SEED_KEY }, { $set: { _id: SEED_KEY } }, { upsert: true });
    console.log('Done:');
    for (const [what, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(4)} ${what}`);
    if (profileFilled) console.log('  Company profile had no name: a placeholder was saved. Edit it under Company profile.');
  }
} catch (err) {
  console.error(`Demo seed failed: ${err.message}`);
  if (err.errors?.length) console.error(JSON.stringify(err.errors, null, 2));
  if (err.details) console.error(err.details.map((d) => d.message).join('\n'));
  exitCode = 1;
} finally {
  await disconnectDB();
}
process.exit(exitCode);
