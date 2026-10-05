import logger from '../config/logger.js';
import ActivityType from '../models/ActivityType.js';
import LeadPriority from '../models/LeadPriority.js';
import LeadSource from '../models/LeadSource.js';
import LeadStatus from '../models/LeadStatus.js';
import Permission from '../models/Permission.js';
import OrderStatus from '../models/OrderStatus.js';
import ProjectStatus from '../models/ProjectStatus.js';
import TaskStatus from '../models/TaskStatus.js';
import TicketCategory from '../models/TicketCategory.js';
import TicketPriority from '../models/TicketPriority.js';
import TicketStatus from '../models/TicketStatus.js';
import QuotationStatus from '../models/QuotationStatus.js';
import BillingCycle from '../models/BillingCycle.js';
import ContractReminderPeriod from '../models/ContractReminderPeriod.js';
import ContractStatus from '../models/ContractStatus.js';
import ContractType from '../models/ContractType.js';
import DocumentStatus from '../models/DocumentStatus.js';
import DocumentType from '../models/DocumentType.js';
import { DOCUMENT_STATUS_SEED, DOCUMENT_TYPE_SEED } from '../seeds/document.seed.js';
import PaymentMethod from '../models/PaymentMethod.js';
import PaymentStatus from '../models/PaymentStatus.js';
import { PAYMENT_METHOD_SEED, PAYMENT_STATUS_SEED } from '../seeds/payment.seed.js';
import {
  BILLING_CYCLE_SEED,
  CONTRACT_REMINDER_PERIOD_SEED,
  CONTRACT_STATUS_SEED,
  CONTRACT_TYPE_SEED,
} from '../seeds/contract.seed.js';
import Pipeline from '../models/Pipeline.js';
import PipelineStage from '../models/PipelineStage.js';
import Role from '../models/Role.js';
import SeedState from '../models/SeedState.js';
import { ACTIVITY_TYPE_SEED } from '../seeds/activity.seed.js';
import { PIPELINE_SEED } from '../seeds/pipeline.seed.js';
import { ORDER_STATUS_SEED } from '../seeds/order.seed.js';
import { PROJECT_STATUS_SEED, TASK_STATUS_SEED } from '../seeds/project.seed.js';
import { TICKET_CATEGORY_SEED, TICKET_PRIORITY_SEED, TICKET_STATUS_SEED } from '../seeds/ticket.seed.js';
import { QUOTATION_STATUS_SEED } from '../seeds/quotation.seed.js';
import {
  LEAD_PRIORITY_SEED,
  LEAD_SOURCE_SEED,
  LEAD_STATUS_SEED,
} from '../seeds/leadConfig.seed.js';
import { PERMISSION_SEED, ROLE_SEED } from '../seeds/rbac.seed.js';
import { declaredPermissions } from '../utils/permissions.js';
import { createCustomersForCompaniesWithOrders } from './customer.service.js';

// Brings the database in line with the seed. Safe to run on every start:
//  - permissions are upserted by key (descriptions refreshed, nothing deleted);
//  - a seed role is created only when no role carries its flag, so renaming or
//    re-describing a role in the UI is never undone, and role permissions that
//    were edited in the UI are never touched.
export async function syncRbac() {
  const operations = Object.entries(PERMISSION_SEED).flatMap(([module, actions]) =>
    Object.entries(actions).map(([action, description]) => ({
      updateOne: {
        filter: { key: `${module}.${action}` },
        update: { $set: { module, action, description } },
        upsert: true,
      },
    }))
  );
  const result = await Permission.bulkWrite(operations);

  let rolesCreated = 0;
  for (const seed of ROLE_SEED) {
    const flag = seed.isSuperAdmin ? { isSuperAdmin: true } : { isDefault: true };
    if (await Role.exists(flag)) continue;
    await Role.create(seed);
    rolesCreated += 1;
  }

  if (result.upsertedCount || rolesCreated) {
    logger.info(`RBAC seed: ${result.upsertedCount} permission(s) and ${rolesCreated} role(s) added`);
  }
}

const LEAD_CONFIG_SEED = 'leadConfig';
const ORDER_STEP = 10;

// Loads the initial lead sources, statuses and priorities - once. The seed is
// recorded as applied, so values an administrator later renames, deactivates or
// deletes are never brought back. Returns true when it seeded.
export async function seedLeadConfig() {
  if (await SeedState.exists({ _id: LEAD_CONFIG_SEED })) return false;

  const lists = [
    [LeadSource, LEAD_SOURCE_SEED],
    [LeadStatus, LEAD_STATUS_SEED],
    [LeadPriority, LEAD_PRIORITY_SEED],
  ];
  let created = 0;
  for (const [Model, entries] of lists) {
    // A list that already has values (entered by hand before the first seed) is left alone.
    if (await Model.exists({})) continue;
    await Model.insertMany(entries.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP })));
    created += entries.length;
  }

  await SeedState.create({ _id: LEAD_CONFIG_SEED });
  logger.info(`Lead configuration seed: ${created} initial value(s) added`);
  return true;
}

const QUALIFIED_FLAG_KEY = 'leadStatusQualifiedFlag';

// Once, for databases seeded before lead statuses had the "counts as
// qualified" flag: the statuses that still carry a seed name get the seed
// value. Statuses an administrator renamed are left for them to mark.
export async function flagQualifiedLeadStatuses() {
  if (await SeedState.exists({ _id: QUALIFIED_FLAG_KEY })) return false;
  let flagged = 0;
  if (!(await LeadStatus.exists({ isQualified: true }))) {
    const names = LEAD_STATUS_SEED.filter((entry) => entry.isQualified).map((entry) => entry.name);
    flagged = (await LeadStatus.updateMany({ name: { $in: names } }, { $set: { isQualified: true } })).modifiedCount;
  }
  await SeedState.create({ _id: QUALIFIED_FLAG_KEY });
  logger.info(`Lead statuses marked as qualified: ${flagged}`);
  return true;
}

const ACTIVITY_TYPE_SEED_KEY = 'activityTypes';

// Loads the initial activity types - once, on the same terms as the lead configuration.
export async function seedActivityTypes() {
  if (await SeedState.exists({ _id: ACTIVITY_TYPE_SEED_KEY })) return false;

  let created = 0;
  if (!(await ActivityType.exists({}))) {
    await ActivityType.insertMany(
      ACTIVITY_TYPE_SEED.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP }))
    );
    created = ACTIVITY_TYPE_SEED.length;
  }

  await SeedState.create({ _id: ACTIVITY_TYPE_SEED_KEY });
  logger.info(`Activity type seed: ${created} initial value(s) added`);
  return true;
}

const PIPELINE_SEED_KEY = 'pipelines';

// Loads the initial sales pipeline and its stages - once, on the same terms as
// the lead configuration.
export async function seedPipelines() {
  if (await SeedState.exists({ _id: PIPELINE_SEED_KEY })) return false;

  let created = 0;
  if (!(await Pipeline.exists({}))) {
    const { stages, ...details } = PIPELINE_SEED;
    const pipeline = await Pipeline.create({ ...details, isDefault: true });
    await PipelineStage.insertMany(
      stages.map((stage, index) => ({ ...stage, pipelineId: pipeline._id, order: index + 1 }))
    );
    created = stages.length;
  }

  await SeedState.create({ _id: PIPELINE_SEED_KEY });
  logger.info(`Pipeline seed: ${created ? `1 pipeline with ${created} stage(s) added` : 'nothing added'}`);
  return true;
}

const QUOTATION_STATUS_SEED_KEY = 'quotationStatuses';

// Loads the initial quotation statuses - once, on the same terms as the lead configuration.
export async function seedQuotationStatuses() {
  if (await SeedState.exists({ _id: QUOTATION_STATUS_SEED_KEY })) return false;

  let created = 0;
  if (!(await QuotationStatus.exists({}))) {
    await QuotationStatus.insertMany(
      QUOTATION_STATUS_SEED.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP }))
    );
    created = QUOTATION_STATUS_SEED.length;
  }

  await SeedState.create({ _id: QUOTATION_STATUS_SEED_KEY });
  logger.info(`Quotation status seed: ${created} initial value(s) added`);
  return true;
}

const ORDER_STATUS_SEED_KEY = 'orderStatuses';

// Loads the initial order statuses - once, on the same terms as the lead configuration.
export async function seedOrderStatuses() {
  if (await SeedState.exists({ _id: ORDER_STATUS_SEED_KEY })) return false;

  let created = 0;
  if (!(await OrderStatus.exists({}))) {
    await OrderStatus.insertMany(ORDER_STATUS_SEED.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP })));
    created = ORDER_STATUS_SEED.length;
  }

  await SeedState.create({ _id: ORDER_STATUS_SEED_KEY });
  logger.info(`Order status seed: ${created} initial value(s) added`);
  return true;
}

// Loads the initial project and task statuses - once each, on the same terms
// as the lead configuration.
export async function seedProjectStatuses() {
  let seeded = false;
  for (const [key, Model, entries] of [
    ['projectStatuses', ProjectStatus, PROJECT_STATUS_SEED],
    ['taskStatuses', TaskStatus, TASK_STATUS_SEED],
  ]) {
    if (await SeedState.exists({ _id: key })) continue;
    let created = 0;
    if (!(await Model.exists({}))) {
      await Model.insertMany(entries.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP })));
      created = entries.length;
    }
    await SeedState.create({ _id: key });
    logger.info(`${Model.modelName} seed: ${created} initial value(s) added`);
    seeded = true;
  }
  return seeded;
}

// Loads the initial ticket categories, priorities and statuses - once each.
export async function seedTicketSettings() {
  let seeded = false;
  for (const [key, Model, entries] of [
    ['ticketCategories', TicketCategory, TICKET_CATEGORY_SEED],
    ['ticketPriorities', TicketPriority, TICKET_PRIORITY_SEED],
    ['ticketStatuses', TicketStatus, TICKET_STATUS_SEED],
  ]) {
    if (await SeedState.exists({ _id: key })) continue;
    let created = 0;
    if (!(await Model.exists({}))) {
      await Model.insertMany(entries.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP })));
      created = entries.length;
    }
    await SeedState.create({ _id: key });
    logger.info(`${Model.modelName} seed: ${created} initial value(s) added`);
    seeded = true;
  }
  return seeded;
}

// Loads the initial document types and statuses - once each.
export async function seedDocumentSettings() {
  let seeded = false;
  for (const [key, Model, entries] of [
    ['documentTypes', DocumentType, DOCUMENT_TYPE_SEED],
    ['documentStatuses', DocumentStatus, DOCUMENT_STATUS_SEED],
  ]) {
    if (await SeedState.exists({ _id: key })) continue;
    let created = 0;
    if (!(await Model.exists({}))) {
      await Model.insertMany(entries.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP })));
      created = entries.length;
    }
    await SeedState.create({ _id: key });
    logger.info(`${Model.modelName} seed: ${created} initial value(s) added`);
    seeded = true;
  }
  return seeded;
}

// Loads the initial contract types, statuses, billing cycles and reminder
// periods - once each.
export async function seedContractSettings() {
  let seeded = false;
  for (const [key, Model, entries] of [
    ['contractTypes', ContractType, CONTRACT_TYPE_SEED],
    ['contractStatuses', ContractStatus, CONTRACT_STATUS_SEED],
    ['billingCycles', BillingCycle, BILLING_CYCLE_SEED],
    ['contractReminderPeriods', ContractReminderPeriod, CONTRACT_REMINDER_PERIOD_SEED],
  ]) {
    if (await SeedState.exists({ _id: key })) continue;
    let created = 0;
    if (!(await Model.exists({}))) {
      await Model.insertMany(entries.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP })));
      created = entries.length;
    }
    await SeedState.create({ _id: key });
    logger.info(`${Model.modelName} seed: ${created} initial value(s) added`);
    seeded = true;
  }
  return seeded;
}

// Loads the initial payment methods and statuses - once each.
export async function seedPaymentSettings() {
  let seeded = false;
  for (const [key, Model, entries] of [
    ['paymentMethods', PaymentMethod, PAYMENT_METHOD_SEED],
    ['paymentStatuses', PaymentStatus, PAYMENT_STATUS_SEED],
  ]) {
    if (await SeedState.exists({ _id: key })) continue;
    let created = 0;
    if (!(await Model.exists({}))) {
      await Model.insertMany(entries.map((entry, index) => ({ ...entry, sortOrder: (index + 1) * ORDER_STEP })));
      created = entries.length;
    }
    await SeedState.create({ _id: key });
    logger.info(`${Model.modelName} seed: ${created} initial value(s) added`);
    seeded = true;
  }
  return seeded;
}

const CUSTOMER_BACKFILL_KEY = 'customersFromOrders';

// Once: every company that already had orders before the Customers module
// becomes a customer, referencing its first order. Afterwards new orders do
// this themselves, and a customer an administrator removes is not brought back.
export async function backfillCustomers() {
  if (await SeedState.exists({ _id: CUSTOMER_BACKFILL_KEY })) return false;
  const created = await createCustomersForCompaniesWithOrders();
  await SeedState.create({ _id: CUSTOMER_BACKFILL_KEY });
  logger.info(`Customer backfill: ${created} customer(s) created from existing orders`);
  return true;
}

// Reports permission keys that routes ask for but the database does not have.
// Such a route would be reachable only by full-access roles.
export async function verifyDeclaredPermissions() {
  const known = new Set(await Permission.distinct('key'));
  const missing = declaredPermissions().filter((key) => !known.has(key));
  if (missing.length) {
    logger.warn(
      `Permissions used in code but missing from the database: ${missing.join(', ')}. ` +
        'Add them to src/seeds/rbac.seed.js.'
    );
  }
  return missing;
}
