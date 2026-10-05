import { Router } from 'express';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as leadConfigService from '../services/leadConfig.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import {
  createLeadConfigSchema,
  listLeadConfigQuery,
  updateLeadConfigSchema,
} from '../validators/leadConfig.validator.js';

// One router per administrator-managed list.
//  - `manage`: the permission needed to change the list;
//  - `readers`: other permissions that may read it, because their forms need the values.
function leadConfigRouter(kind, { manage, readers }) {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    authorize(manage, ...readers),
    validate({ query: listLeadConfigQuery }),
    async (req, res) => {
      const items = await leadConfigService.listEntries(kind, req.validated.query);
      return sendSuccess(res, { message: MESSAGES.LEAD_CONFIG_LISTED, data: { items } });
    }
  );

  router.post(
    '/',
    requirePermission(manage),
    validate({ body: createLeadConfigSchema(kind) }),
    async (req, res) => {
      const item = await leadConfigService.createEntry(kind, req.body, req.user);
      return sendSuccess(res, {
        statusCode: HTTP_STATUS.CREATED,
        message: MESSAGES.LEAD_CONFIG_CREATED,
        data: { item },
      });
    }
  );

  router.put(
    '/:id',
    requirePermission(manage),
    validate({ params: idParam, body: updateLeadConfigSchema(kind) }),
    async (req, res) => {
      const item = await leadConfigService.updateEntry(kind, req.validated.params.id, req.body);
      return sendSuccess(res, { message: MESSAGES.LEAD_CONFIG_UPDATED, data: { item } });
    }
  );

  router.delete(
    '/:id',
    requirePermission(manage),
    validate({ params: idParam }),
    async (req, res) => {
      await leadConfigService.deleteEntry(kind, req.validated.params.id);
      return sendSuccess(res, { message: MESSAGES.LEAD_CONFIG_DELETED });
    }
  );

  return router;
}

// Lead lists: readable by anyone who works with leads.
const LEADS = { manage: 'leadConfig.manage', readers: ['leads.read', 'leads.create', 'leads.update'] };
export const leadSourceRoutes = leadConfigRouter('sources', LEADS);
export const leadStatusRoutes = leadConfigRouter('statuses', LEADS);
// Priorities are shared with opportunities.
export const leadPriorityRoutes = leadConfigRouter('priorities', {
  manage: LEADS.manage,
  readers: [
    ...LEADS.readers,
    'opportunities.read',
    'opportunities.create',
    'opportunities.update',
    'projects.read',
    'projects.create',
    'projects.update',
    'projects.manageTasks',
  ],
});

// Product catalogue lists: readable by anyone who works with products.
const CATALOG = { manage: 'products.manageCatalog', readers: ['products.read', 'products.create', 'products.update'] };
export const productCategoryRoutes = leadConfigRouter('productCategories', CATALOG);
export const unitRoutes = leadConfigRouter('units', CATALOG);
export const taxRoutes = leadConfigRouter('taxes', CATALOG);

// Quotation statuses: readable by anyone who works with quotations.
export const quotationStatusRoutes = leadConfigRouter('quotationStatuses', {
  manage: 'quotations.manageStatuses',
  readers: ['quotations.read', 'quotations.create', 'quotations.update'],
});

// Order statuses: readable by anyone who works with orders.
export const orderStatusRoutes = leadConfigRouter('orderStatuses', {
  manage: 'orders.manageStatuses',
  readers: ['orders.read', 'orders.create', 'orders.update'],
});

// Project and task statuses: readable by anyone who works with projects.
const PROJECTS = { manage: 'projects.manageStatuses', readers: ['projects.read', 'projects.create', 'projects.update', 'projects.manageTasks'] };
export const projectStatusRoutes = leadConfigRouter('projectStatuses', PROJECTS);
export const taskStatusRoutes = leadConfigRouter('taskStatuses', PROJECTS);

// Ticket categories, priorities and statuses: readable by anyone who works with tickets.
const TICKETS = { manage: 'tickets.manageSettings', readers: ['tickets.read', 'tickets.create', 'tickets.update'] };
export const ticketCategoryRoutes = leadConfigRouter('ticketCategories', TICKETS);
export const ticketPriorityRoutes = leadConfigRouter('ticketPriorities', TICKETS);
export const ticketStatusRoutes = leadConfigRouter('ticketStatuses', TICKETS);

// Contract types, statuses, billing cycles and reminder periods: readable by
// anyone who works with contracts.
const CONTRACTS = { manage: 'contracts.manageSettings', readers: ['contracts.read', 'contracts.create', 'contracts.update'] };
export const contractTypeRoutes = leadConfigRouter('contractTypes', CONTRACTS);
export const contractStatusRoutes = leadConfigRouter('contractStatuses', CONTRACTS);
export const billingCycleRoutes = leadConfigRouter('billingCycles', CONTRACTS);
export const contractReminderPeriodRoutes = leadConfigRouter('contractReminderPeriods', CONTRACTS);

// Document types and statuses: readable by anyone who works with documents.
const DOCUMENTS = { manage: 'documents.manageSettings', readers: ['documents.read', 'documents.create', 'documents.update'] };
export const documentTypeRoutes = leadConfigRouter('documentTypes', DOCUMENTS);
export const documentStatusRoutes = leadConfigRouter('documentStatuses', DOCUMENTS);

// Payment methods and statuses: readable by anyone who works with payments.
const PAYMENTS = { manage: 'payments.manageSettings', readers: ['payments.read', 'payments.create', 'payments.update'] };
export const paymentMethodRoutes = leadConfigRouter('paymentMethods', PAYMENTS);
export const paymentStatusRoutes = leadConfigRouter('paymentStatuses', PAYMENTS);

// Activity types: readable by anyone who works with activities.
export const activityTypeRoutes = leadConfigRouter('activityTypes', {
  manage: 'activities.manageTypes',
  readers: ['activities.read', 'activities.create', 'activities.update'],
});
