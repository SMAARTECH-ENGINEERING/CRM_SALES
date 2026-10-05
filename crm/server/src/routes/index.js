import { Router } from 'express';
import { activityRoutes, followUpRoutes } from './activity.routes.js';
import authRoutes from './auth.routes.js';
import companyRoutes from './company.routes.js';
import contactRoutes from './contact.routes.js';
import { companyTypeRoutes, industryRoutes, organizationRoutes } from './masterData.routes.js';
import healthRoutes from './health.routes.js';
import leadRoutes from './lead.routes.js';
import {
  activityTypeRoutes,
  leadPriorityRoutes,
  leadSourceRoutes,
  leadStatusRoutes,
  productCategoryRoutes,
  orderStatusRoutes,
  projectStatusRoutes,
  taskStatusRoutes,
  ticketCategoryRoutes,
  ticketPriorityRoutes,
  ticketStatusRoutes,
  billingCycleRoutes,
  contractReminderPeriodRoutes,
  contractStatusRoutes,
  contractTypeRoutes,
  documentStatusRoutes,
  documentTypeRoutes,
  paymentMethodRoutes,
  paymentStatusRoutes,
  quotationStatusRoutes,
  taxRoutes,
  unitRoutes,
} from './leadConfig.routes.js';
import opportunityRoutes from './opportunity.routes.js';
import { pipelineRoutes, pipelineStageRoutes } from './pipeline.routes.js';
import productRoutes from './product.routes.js';
import customerRoutes from './customer.routes.js';
import projectRoutes from './project.routes.js';
import ticketRoutes from './ticket.routes.js';
import contractRoutes from './contract.routes.js';
import paymentRoutes from './payment.routes.js';
import documentRoutes from './document.routes.js';
import notificationRoutes from './notification.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import reportRoutes from './report.routes.js';
import searchRoutes from './search.routes.js';
import importRoutes from './import.routes.js';
import auditRoutes from './audit.routes.js';
import orderRoutes from './order.routes.js';
import quotationRoutes from './quotation.routes.js';
import settingsRoutes from './settings.routes.js';
import { departmentRoutes } from './lookup.routes.js';
import permissionRoutes from './permission.routes.js';
import roleRoutes from './role.routes.js';
import userRoutes from './user.routes.js';

// Mounted under env.apiPrefix (/api/v1). Register each module's router here.
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/permissions', permissionRoutes);
router.use('/departments', departmentRoutes);
router.use('/companies', companyRoutes);
router.use('/contacts', contactRoutes);
router.use('/leads', leadRoutes);
router.use('/opportunities', opportunityRoutes);
router.use('/pipelines', pipelineRoutes);
router.use('/pipeline-stages', pipelineStageRoutes);
router.use('/quotations', quotationRoutes);
router.use('/quotation-statuses', quotationStatusRoutes);
router.use('/customers', customerRoutes);
router.use('/projects', projectRoutes);
router.use('/tickets', ticketRoutes);
router.use('/ticket-categories', ticketCategoryRoutes);
router.use('/ticket-priorities', ticketPriorityRoutes);
router.use('/ticket-statuses', ticketStatusRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/search', searchRoutes);
router.use('/imports', importRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/notifications', notificationRoutes);
router.use('/documents', documentRoutes);
router.use('/document-types', documentTypeRoutes);
router.use('/document-statuses', documentStatusRoutes);
router.use('/payments', paymentRoutes);
router.use('/payment-methods', paymentMethodRoutes);
router.use('/payment-statuses', paymentStatusRoutes);
router.use('/contracts', contractRoutes);
router.use('/contract-types', contractTypeRoutes);
router.use('/contract-statuses', contractStatusRoutes);
router.use('/billing-cycles', billingCycleRoutes);
router.use('/contract-reminder-periods', contractReminderPeriodRoutes);
router.use('/project-statuses', projectStatusRoutes);
router.use('/task-statuses', taskStatusRoutes);
router.use('/orders', orderRoutes);
router.use('/order-statuses', orderStatusRoutes);
router.use('/settings', settingsRoutes);
router.use('/products', productRoutes);
router.use('/product-categories', productCategoryRoutes);
router.use('/units', unitRoutes);
router.use('/taxes', taxRoutes);
router.use('/activities', activityRoutes);
router.use('/activity-types', activityTypeRoutes);
router.use('/followups', followUpRoutes);
router.use('/lead-sources', leadSourceRoutes);
router.use('/lead-statuses', leadStatusRoutes);
router.use('/lead-priorities', leadPriorityRoutes);
router.use('/industries', industryRoutes);
router.use('/company-types', companyTypeRoutes);
router.use('/organizations', organizationRoutes);

export default router;
