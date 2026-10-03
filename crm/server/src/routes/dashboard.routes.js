import { Router } from 'express';
import { MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as dashboardService from '../services/dashboard.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { dashboardQuery, opportunityDashboardQuery } from '../validators/dashboard.validator.js';

// Every route takes ?period= (today | week | month | quarter | year | custom
// with from & to) and, for users who see everything, ?organizationId=.
//
// dashboard.read opens the dashboard; each section also needs the permission
// to read the module it reports on. What the figures cover - everything, one
// organization, or the user's own records - is decided in the service.
const router = Router();
router.use(authenticate);

const section = (path, permissions, query, handler, message) =>
  router.get(path, requirePermission('dashboard.read', ...permissions), validate({ query }), async (req, res) =>
    sendSuccess(res, { message, data: await handler(req.user, req.validated.query) })
  );

// The headline figures; each one is marked unavailable if its module may not be read.
section('/summary', [], dashboardQuery, dashboardService.getSummary, MESSAGES.DASHBOARD_SUMMARY);
section('/sales', ['orders.read'], dashboardQuery, dashboardService.getSales, MESSAGES.DASHBOARD_SALES);
section('/leads', ['leads.read'], dashboardQuery, dashboardService.getLeads, MESSAGES.DASHBOARD_LEADS);
section('/opportunities', ['opportunities.read'], opportunityDashboardQuery, dashboardService.getOpportunities, MESSAGES.DASHBOARD_OPPORTUNITIES);
section('/activities', ['activities.read'], dashboardQuery, dashboardService.getActivities, MESSAGES.DASHBOARD_ACTIVITIES);

export default router;
