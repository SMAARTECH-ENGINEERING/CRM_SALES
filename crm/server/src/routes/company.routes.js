import { Router } from 'express';
import * as companyController from '../controllers/company.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import {
  companyOptionsQuery,
  createCompanySchema,
  listCompaniesQuery,
  timelineQuery,
  updateCompanySchema,
} from '../validators/company.validator.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission('companies.read'),
  validate({ query: listCompaniesQuery }),
  companyController.listCompanies
);
// Code + name for company pickers. Declared before /:id so "options" is not read as an id.
router.get(
  '/options',
  authorize(
    'companies.read',
    'contacts.read',
    'contacts.create',
    'contacts.update',
    'leads.read',
    'leads.create',
    'leads.update',
    'opportunities.read',
    'opportunities.create',
    'opportunities.update',
    'quotations.read',
    'quotations.create',
    'quotations.update',
    'orders.read',
    'orders.create',
    'orders.update',
    'customers.read',
    'customers.create',
    'projects.read',
    'projects.create',
    'projects.update',
    'tickets.read',
    'tickets.create',
    'tickets.update',
    'contracts.read',
    'contracts.create',
    'contracts.update',
    'payments.read',
    'payments.create',
    'payments.update',
    'reports.read'
  ),
  validate({ query: companyOptionsQuery }),
  companyController.listCompanyOptions
);
router.post(
  '/',
  requirePermission('companies.create'),
  validate({ body: createCompanySchema }),
  companyController.createCompany
);
router.get(
  '/:id',
  requirePermission('companies.read'),
  validate({ params: idParam }),
  companyController.getCompany
);
router.put(
  '/:id',
  requirePermission('companies.update'),
  validate({ params: idParam, body: updateCompanySchema }),
  companyController.updateCompany
);
router.delete(
  '/:id',
  requirePermission('companies.delete'),
  validate({ params: idParam }),
  companyController.deleteCompany
);

// Detail page: which sections exist and how many records each holds.
router.get(
  '/:id/sections',
  requirePermission('companies.read'),
  validate({ params: idParam }),
  companyController.getSections
);
router.get(
  '/:id/timeline',
  requirePermission('companies.read'),
  validate({ params: idParam, query: timelineQuery }),
  companyController.getTimeline
);

export default router;
