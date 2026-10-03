import { Router } from 'express';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import CompanyType from '../models/CompanyType.js';
import Industry from '../models/Industry.js';
import Organization from '../models/Organization.js';
import { createEntry, listActive } from '../services/masterData.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { masterDataQuery, masterDataSchema } from '../validators/company.validator.js';

// List + create for a simple named list. Anyone who can see or edit companies
// may read the list (it fills dropdowns and filters); adding to it is a
// separate permission.
function masterDataRouter(Model) {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    authorize(
      'companies.read',
      'companies.create',
      'companies.update',
      'leads.read',
      'leads.create',
      'leads.update',
      'products.read',
      'products.create',
      'products.update',
      'customers.read',
      'projects.read',
      'users.create',
      'users.update'
    ),
    validate({ query: masterDataQuery }),
    async (req, res) => {
      const items = await listActive(Model, req.validated.query);
      return sendSuccess(res, { message: MESSAGES.MASTER_DATA_LISTED, data: { items } });
    }
  );

  router.post(
    '/',
    requirePermission('companies.manageLookups'),
    validate({ body: masterDataSchema }),
    async (req, res) => {
      const item = await createEntry(Model, req.body, req.user);
      return sendSuccess(res, {
        statusCode: HTTP_STATUS.CREATED,
        message: MESSAGES.MASTER_DATA_CREATED,
        data: { item },
      });
    }
  );

  return router;
}

export const industryRoutes = masterDataRouter(Industry);
export const companyTypeRoutes = masterDataRouter(CompanyType);
export const organizationRoutes = masterDataRouter(Organization);
