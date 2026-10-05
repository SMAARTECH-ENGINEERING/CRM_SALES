// Loads seed data into MongoDB:
//   - the permission catalogue and the two starting roles (kept in sync every run);
//   - the initial lead sources, statuses and priorities, activity types and the
//     first sales pipeline with its stages, and quotation and order statuses
//     (once only - values that were later changed or deleted in the app are
//     never re-created).
// The server does the same on every start; run this by hand to seed without
// starting the API (for example in a deployment step).
//
//   npm run seed
import { connectDB, disconnectDB } from '../src/config/db.js';
import LeadPriority from '../src/models/LeadPriority.js';
import LeadSource from '../src/models/LeadSource.js';
import LeadStatus from '../src/models/LeadStatus.js';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import ActivityType from '../src/models/ActivityType.js';
import Pipeline from '../src/models/Pipeline.js';
import PipelineStage from '../src/models/PipelineStage.js';
import OrderStatus from '../src/models/OrderStatus.js';
import QuotationStatus from '../src/models/QuotationStatus.js';
import Customer from '../src/models/Customer.js';
import ProjectStatus from '../src/models/ProjectStatus.js';
import TaskStatus from '../src/models/TaskStatus.js';
import TicketCategory from '../src/models/TicketCategory.js';
import TicketPriority from '../src/models/TicketPriority.js';
import TicketStatus from '../src/models/TicketStatus.js';
import ContractReminderPeriod from '../src/models/ContractReminderPeriod.js';
import ContractStatus from '../src/models/ContractStatus.js';
import ContractType from '../src/models/ContractType.js';
import BillingCycle from '../src/models/BillingCycle.js';
import PaymentMethod from '../src/models/PaymentMethod.js';
import PaymentStatus from '../src/models/PaymentStatus.js';
import {
  backfillCustomers,
  seedActivityTypes,
  flagQualifiedLeadStatuses,
  seedLeadConfig,
  seedPipelines,
  seedProjectStatuses,
  seedOrderStatuses,
  seedQuotationStatuses,
  seedContractSettings,
  seedPaymentSettings,
  seedDocumentSettings,
  seedTicketSettings,
  syncRbac,
} from '../src/services/seed.service.js';

let exitCode = 0;
try {
  await connectDB();
  await syncRbac();
  const seeded = await seedLeadConfig();
  await flagQualifiedLeadStatuses();
  const typesSeeded = await seedActivityTypes();
  const pipelinesSeeded = await seedPipelines();
  const quotationStatusesSeeded = await seedQuotationStatuses();
  const orderStatusesSeeded = await seedOrderStatuses();
  const customersBackfilled = await backfillCustomers();
  const projectStatusesSeeded = await seedProjectStatuses();
  const ticketSettingsSeeded = await seedTicketSettings();
  const contractSettingsSeeded = await seedContractSettings();
  const paymentSettingsSeeded = await seedPaymentSettings();
  const documentSettingsSeeded = await seedDocumentSettings();
  console.log(`Document types and statuses: ${documentSettingsSeeded ? 'initial values added' : 'already seeded, left unchanged'}`);

  console.log(
    `Database now has ${await Permission.countDocuments()} permission(s) and ${await Role.countDocuments()} role(s)`
  );
  console.log(
    `Lead configuration: ${seeded ? 'initial values added' : 'already seeded, left unchanged'} - ` +
      `${await LeadSource.countDocuments()} source(s), ${await LeadStatus.countDocuments()} status(es), ` +
      `${await LeadPriority.countDocuments()} priority(ies)`
  );
  console.log(
    `Activity types: ${typesSeeded ? 'initial values added' : 'already seeded, left unchanged'} - ` +
      `${await ActivityType.countDocuments()} type(s)`
  );
  console.log(
    `Pipelines: ${pipelinesSeeded ? 'initial pipeline added' : 'already seeded, left unchanged'} - ` +
      `${await Pipeline.countDocuments()} pipeline(s), ${await PipelineStage.countDocuments()} stage(s)`
  );
  console.log(
    `Quotation statuses: ${quotationStatusesSeeded ? 'initial values added' : 'already seeded, left unchanged'} - ` +
      `${await QuotationStatus.countDocuments()} status(es)`
  );
  console.log(
    `Order statuses: ${orderStatusesSeeded ? 'initial values added' : 'already seeded, left unchanged'} - ` +
      `${await OrderStatus.countDocuments()} status(es)`
  );
  console.log(
    `Customers: ${customersBackfilled ? 'companies with orders made customers' : 'already done, left unchanged'} - ` +
      `${await Customer.countDocuments()} customer(s)`
  );
  console.log(
    `Project and task statuses: ${projectStatusesSeeded ? 'initial values added' : 'already seeded, left unchanged'} - ` +
      `${await ProjectStatus.countDocuments()} project status(es), ${await TaskStatus.countDocuments()} task status(es)`
  );
  console.log(
    `Ticket settings: ${ticketSettingsSeeded ? 'initial values added' : 'already seeded, left unchanged'} - ` +
      `${await TicketCategory.countDocuments()} categor(ies), ${await TicketPriority.countDocuments()} priorit(ies), ` +
      `${await TicketStatus.countDocuments()} status(es)`
  );
  console.log(
    `Contract settings: ${contractSettingsSeeded ? 'initial values added' : 'already seeded, left unchanged'} - ` +
      `${await ContractType.countDocuments()} type(s), ${await ContractStatus.countDocuments()} status(es), ` +
      `${await BillingCycle.countDocuments()} billing cycle(s), ${await ContractReminderPeriod.countDocuments()} reminder period(s)`
  );
  console.log(
    `Payment settings: ${paymentSettingsSeeded ? 'initial values added' : 'already seeded, left unchanged'} - ` +
      `${await PaymentMethod.countDocuments()} method(s), ${await PaymentStatus.countDocuments()} status(es)`
  );
} catch (err) {
  console.error(`Seed failed: ${err.message}`);
  exitCode = 1;
} finally {
  await disconnectDB();
}
process.exit(exitCode);
