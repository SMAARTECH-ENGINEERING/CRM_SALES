import {
  ACTIVITY_STATUS,
  CUSTOMER_STATUS,
  OPPORTUNITY_STATUS,
  ORDER_STATUS_CATEGORY,
  PAYMENT_STATE,
  PAYMENT_STATUS_CATEGORY,
} from '../constants/index.js';
import Activity from '../models/Activity.js';
import ActivityType from '../models/ActivityType.js';
import BillingCycle from '../models/BillingCycle.js';
import Company from '../models/Company.js';
import Contract from '../models/Contract.js';
import ContractStatus from '../models/ContractStatus.js';
import ContractType from '../models/ContractType.js';
import Customer from '../models/Customer.js';
import Lead from '../models/Lead.js';
import LeadPriority from '../models/LeadPriority.js';
import LeadSource from '../models/LeadSource.js';
import LeadStatus from '../models/LeadStatus.js';
import Opportunity from '../models/Opportunity.js';
import Order from '../models/Order.js';
import OrderStatus from '../models/OrderStatus.js';
import Payment from '../models/Payment.js';
import PaymentMethod from '../models/PaymentMethod.js';
import PaymentStatus from '../models/PaymentStatus.js';
import Pipeline from '../models/Pipeline.js';
import PipelineStage from '../models/PipelineStage.js';
import Product from '../models/Product.js';
import ProductCategory from '../models/ProductCategory.js';
import Quotation from '../models/Quotation.js';
import QuotationStatus from '../models/QuotationStatus.js';
import Ticket from '../models/Ticket.js';
import TicketCategory from '../models/TicketCategory.js';
import TicketPriority from '../models/TicketPriority.js';
import TicketStatus from '../models/TicketStatus.js';
import User from '../models/User.js';
import { startOfDay } from './lineItems.service.js';

// What each report is. The engine (report.service.js) turns a definition into
// one aggregation pipeline, so a report is always computed by the database:
//
//   key, title, description
//   permission   the module permission needed, besides reports.read
//   Model        the collection the report starts from
//   scope        which organization-scope rule applies (see dashboard.service.js)
//   dateFields   the dates the range can apply to; the first is the default
//   filters      what it can be narrowed by (options come from the database)
//   base(ctx)    extra conditions on the starting documents (optional)
//   rows(ctx)    aggregation stages turning those documents into flat rows,
//                one field per column
//   columns      { key, label, type: text | number | money | date | datetime }
//   totals       the numeric columns summed over ALL matching rows
//   sort         the default order
//
// To add a report, add a definition here; nothing else changes.

// --- building blocks ---------------------------------------------------------------

const col = (key, label, type = 'text') => ({ key, label, type });

// Joins one referenced document as `as` (missing references leave it empty).
const join = (Model, localField, as) => [
  { $lookup: { from: Model.collection.name, localField, foreignField: '_id', as } },
  { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
];
const personName = (as) => ({ $trim: { input: { $concat: [{ $ifNull: [`$${as}.firstName`, ''] }, ' ', { $ifNull: [`$${as}.lastName`, ''] }] } } });
const num = (path) => ({ $ifNull: [path, 0] });
const round = (expression) => ({ $round: [expression, 2] });

// Options for a filter, read from an administrator-managed list.
const listOf = (Model) => async () =>
  (await Model.find().sort({ sortOrder: 1, name: 1 }).select('name')).map((entry) => ({ value: entry.id, label: entry.name }));
const enumOf = (values) => () => Object.values(values).map((value) => ({ value, label: value.replace(/_/g, ' ') }));

const option = (key, label, options, extra = {}) => ({ key, label, type: 'option', options, ...extra });
const reference = (key, label, Model, extra = {}) => option(key, label, listOf(Model), { objectId: true, ...extra });
const user = (key, label = 'Assigned to') => ({ key, label, type: 'user', objectId: true });
const company = () => ({ key: 'companyId', label: 'Company', type: 'company', objectId: true });

const statusIds = (Model, categories) => Model.distinct('_id', { category: { $in: categories } });
// Orders that count as sales: everything except cancelled ones.
const liveOrders = async () => ({ statusId: { $nin: await statusIds(OrderStatus, [ORDER_STATUS_CATEGORY.CANCELLED]) } });

// --- the reports -------------------------------------------------------------------

const leads = {
  key: 'leads',
  title: 'Leads',
  description: 'Every lead with its source, status and owner.',
  permission: 'leads.read',
  Model: Lead,
  scope: 'leads',
  dateFields: [col('createdAt', 'Created'), col('expectedCloseDate', 'Expected close'), col('convertedAt', 'Converted')],
  filters: [reference('statusId', 'Status', LeadStatus), reference('sourceId', 'Source', LeadSource), reference('priorityId', 'Priority', LeadPriority), user('assignedTo'), company()],
  rows: () => [
    ...join(Company, 'companyId', 'company'),
    ...join(LeadSource, 'sourceId', 'source'),
    ...join(LeadStatus, 'statusId', 'status'),
    ...join(LeadPriority, 'priorityId', 'priority'),
    ...join(User, 'assignedTo', 'owner'),
    {
      $project: {
        leadNumber: 1,
        title: 1,
        company: '$company.name',
        source: '$source.name',
        status: '$status.name',
        priority: '$priority.name',
        estimatedValue: num('$estimatedValue'),
        assignedTo: personName('owner'),
        expectedCloseDate: 1,
        createdAt: 1,
      },
    },
  ],
  columns: [
    col('leadNumber', 'Number'),
    col('title', 'Title'),
    col('company', 'Company'),
    col('source', 'Source'),
    col('status', 'Status'),
    col('priority', 'Priority'),
    col('estimatedValue', 'Estimated value', 'money'),
    col('assignedTo', 'Assigned to'),
    col('expectedCloseDate', 'Expected close', 'date'),
    col('createdAt', 'Created', 'datetime'),
  ],
  totals: ['estimatedValue'],
  sort: { by: 'createdAt', order: 'desc' },
};

const opportunities = {
  key: 'opportunities',
  title: 'Opportunities',
  description: 'Deals with their stage, value and chance of closing.',
  permission: 'opportunities.read',
  Model: Opportunity,
  scope: 'opportunities',
  dateFields: [col('createdAt', 'Created'), col('closedAt', 'Closed'), col('expectedCloseDate', 'Expected close')],
  filters: [
    option('status', 'State', enumOf(OPPORTUNITY_STATUS)),
    reference('pipelineId', 'Pipeline', Pipeline, { options: async () => (await Pipeline.find().sort({ name: 1 }).select('name')).map((p) => ({ value: p.id, label: p.name })) }),
    reference('stageId', 'Stage', PipelineStage, {
      options: async () =>
        (await PipelineStage.find().sort({ pipelineId: 1, order: 1 }).select('name pipelineId').populate('pipelineId', 'name')).map((stage) => ({
          value: stage.id,
          label: `${stage.pipelineId?.name ?? ''}: ${stage.name}`,
        })),
    }),
    user('assignedTo'),
    company(),
  ],
  rows: () => [
    ...join(Company, 'companyId', 'company'),
    ...join(Pipeline, 'pipelineId', 'pipeline'),
    ...join(PipelineStage, 'stageId', 'stage'),
    ...join(User, 'assignedTo', 'owner'),
    {
      $project: {
        opportunityNumber: 1,
        name: 1,
        company: '$company.name',
        pipeline: '$pipeline.name',
        stage: '$stage.name',
        status: 1,
        estimatedValue: num('$estimatedValue'),
        probability: num('$probability'),
        weightedValue: round({ $multiply: [num('$estimatedValue'), { $divide: [num('$probability'), 100] }] }),
        assignedTo: personName('owner'),
        expectedCloseDate: 1,
        closedAt: 1,
        createdAt: 1,
      },
    },
  ],
  columns: [
    col('opportunityNumber', 'Number'),
    col('name', 'Name'),
    col('company', 'Company'),
    col('pipeline', 'Pipeline'),
    col('stage', 'Stage'),
    col('status', 'State'),
    col('estimatedValue', 'Estimated value', 'money'),
    col('probability', 'Probability %', 'number'),
    col('weightedValue', 'Weighted value', 'money'),
    col('assignedTo', 'Assigned to'),
    col('expectedCloseDate', 'Expected close', 'date'),
    col('closedAt', 'Closed', 'date'),
    col('createdAt', 'Created', 'datetime'),
  ],
  totals: ['estimatedValue', 'weightedValue'],
  sort: { by: 'createdAt', order: 'desc' },
};

const quotations = {
  key: 'quotations',
  title: 'Quotations',
  description: 'Quotations issued, with their status and value.',
  permission: 'quotations.read',
  Model: Quotation,
  scope: 'quotations',
  dateFields: [col('quotationDate', 'Quotation date'), col('validUntil', 'Valid until'), col('createdAt', 'Created')],
  filters: [reference('statusId', 'Status', QuotationStatus), user('createdBy', 'Prepared by'), company()],
  rows: () => [
    ...join(Company, 'companyId', 'company'),
    ...join(QuotationStatus, 'statusId', 'status'),
    ...join(User, 'createdBy', 'author'),
    {
      $project: {
        quotationNumber: 1,
        quotationDate: 1,
        company: '$company.name',
        status: '$status.name',
        validUntil: 1,
        lines: { $size: { $ifNull: ['$items', []] } },
        subtotal: num('$subtotal'),
        tax: num('$tax'),
        grandTotal: num('$grandTotal'),
        createdBy: personName('author'),
      },
    },
  ],
  columns: [
    col('quotationNumber', 'Number'),
    col('quotationDate', 'Date', 'date'),
    col('company', 'Company'),
    col('status', 'Status'),
    col('validUntil', 'Valid until', 'date'),
    col('lines', 'Lines', 'number'),
    col('subtotal', 'Subtotal', 'money'),
    col('tax', 'Tax', 'money'),
    col('grandTotal', 'Grand total', 'money'),
    col('createdBy', 'Prepared by'),
  ],
  totals: ['subtotal', 'tax', 'grandTotal'],
  sort: { by: 'quotationDate', order: 'desc' },
};

const orders = {
  key: 'orders',
  title: 'Orders',
  description: 'Every order, including cancelled ones, with its status and value.',
  permission: 'orders.read',
  Model: Order,
  scope: 'orders',
  dateFields: [col('orderDate', 'Order date'), col('deliveryDate', 'Delivery date'), col('createdAt', 'Created')],
  filters: [reference('statusId', 'Status', OrderStatus), user('assignedTo'), company()],
  rows: () => [
    ...join(Company, 'companyId', 'company'),
    ...join(OrderStatus, 'statusId', 'status'),
    ...join(User, 'assignedTo', 'owner'),
    {
      $project: {
        orderNumber: 1,
        orderDate: 1,
        company: '$company.name',
        status: '$status.name',
        deliveryDate: 1,
        lines: { $size: { $ifNull: ['$items', []] } },
        subtotal: num('$subtotal'),
        tax: num('$tax'),
        grandTotal: num('$grandTotal'),
        assignedTo: personName('owner'),
      },
    },
  ],
  columns: [
    col('orderNumber', 'Number'),
    col('orderDate', 'Date', 'date'),
    col('company', 'Company'),
    col('status', 'Status'),
    col('deliveryDate', 'Delivery', 'date'),
    col('lines', 'Lines', 'number'),
    col('subtotal', 'Subtotal', 'money'),
    col('tax', 'Tax', 'money'),
    col('grandTotal', 'Grand total', 'money'),
    col('assignedTo', 'Assigned to'),
  ],
  totals: ['subtotal', 'tax', 'grandTotal'],
  sort: { by: 'orderDate', order: 'desc' },
};

// How sales can be grouped: what to group by, and how to name each group.
const SALES_GROUPS = {
  month: { label: 'Month', id: { $dateToString: { format: '%Y-%m', date: '$orderDate' } }, name: () => [{ $addFields: { group: '$_id' } }] },
  salesperson: {
    label: 'Salesperson',
    id: '$assignedTo',
    name: () => [...join(User, '_id', 'person'), { $addFields: { group: { $cond: [{ $ifNull: ['$person._id', false] }, personName('person'), 'Unassigned'] } } }],
  },
  company: { label: 'Company', id: '$companyId', name: () => [...join(Company, '_id', 'company'), { $addFields: { group: { $ifNull: ['$company.name', 'Unknown'] } } }] },
};

const sales = {
  key: 'sales',
  title: 'Sales',
  description: 'Order value added up by month, salesperson or company. Cancelled orders are left out.',
  permission: 'orders.read',
  Model: Order,
  scope: 'orders',
  dateFields: [col('orderDate', 'Order date')],
  filters: [
    // Not a condition: how the rows are grouped.
    option('groupBy', 'Group by', () => Object.entries(SALES_GROUPS).map(([value, group]) => ({ value, label: group.label })), { default: 'month', required: true, match: false }),
    user('assignedTo', 'Salesperson'),
    company(),
  ],
  base: liveOrders,
  rows: ({ filters }) => {
    const group = SALES_GROUPS[filters.groupBy];
    return [
      { $group: { _id: group.id, orderCount: { $sum: 1 }, subtotal: { $sum: num('$subtotal') }, tax: { $sum: num('$tax') }, grandTotal: { $sum: num('$grandTotal') } } },
      ...group.name(),
      { $project: { group: 1, orderCount: 1, subtotal: round('$subtotal'), tax: round('$tax'), grandTotal: round('$grandTotal'), averageOrderValue: round({ $divide: ['$grandTotal', '$orderCount'] }) } },
    ];
  },
  columns: [
    col('group', 'Group'),
    col('orderCount', 'Orders', 'number'),
    col('subtotal', 'Subtotal', 'money'),
    col('tax', 'Tax', 'money'),
    col('grandTotal', 'Sales', 'money'),
    col('averageOrderValue', 'Average order', 'money'),
  ],
  totals: ['orderCount', 'subtotal', 'tax', 'grandTotal'],
  sort: { by: 'group', order: 'asc' },
};

const products = {
  key: 'products',
  title: 'Products',
  description: 'What was sold: quantity and revenue per product, from order lines. Cancelled orders are left out.',
  permission: 'orders.read',
  Model: Order,
  scope: 'orders',
  dateFields: [col('orderDate', 'Order date')],
  filters: [
    // Applies to the product, so it is checked once the rows exist.
    reference('categoryId', 'Category', ProductCategory, { after: true }),
    user('assignedTo', 'Salesperson'),
    company(),
  ],
  base: liveOrders,
  rows: () => [
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        sku: { $last: '$items.sku' },
        name: { $last: '$items.name' },
        quantity: { $sum: num('$items.quantity') },
        revenue: { $sum: num('$items.total') },
        tax: { $sum: num('$items.tax') },
        orders: { $addToSet: '$_id' },
      },
    },
    ...join(Product, '_id', 'product'),
    ...join(ProductCategory, 'product.categoryId', 'category'),
    {
      $project: {
        sku: 1,
        name: 1,
        categoryId: '$product.categoryId',
        category: '$category.name',
        quantity: round('$quantity'),
        orderCount: { $size: '$orders' },
        revenue: round('$revenue'),
        tax: round('$tax'),
        averagePrice: round({ $cond: [{ $gt: ['$quantity', 0] }, { $divide: ['$revenue', '$quantity'] }, 0] }),
      },
    },
  ],
  columns: [
    col('sku', 'SKU'),
    col('name', 'Product'),
    col('category', 'Category'),
    col('quantity', 'Quantity sold', 'number'),
    col('orderCount', 'Orders', 'number'),
    col('revenue', 'Revenue (before tax)', 'money'),
    col('tax', 'Tax', 'money'),
    col('averagePrice', 'Average price', 'money'),
  ],
  totals: ['quantity', 'revenue', 'tax'],
  sort: { by: 'revenue', order: 'desc' },
};

const customers = {
  key: 'customers',
  title: 'Customers',
  description: 'Customers with their account manager and what they have ordered (cancelled orders left out).',
  permission: 'customers.read',
  Model: Customer,
  scope: 'customers',
  dateFields: [col('customerSince', 'Customer since')],
  filters: [option('status', 'Status', enumOf(CUSTOMER_STATUS)), user('accountManagerId', 'Account manager'), company()],
  rows: async () => {
    const cancelled = await statusIds(OrderStatus, [ORDER_STATUS_CATEGORY.CANCELLED]);
    return [
      ...join(Company, 'companyId', 'company'),
      ...join(User, 'accountManagerId', 'manager'),
      { $lookup: { from: Order.collection.name, localField: 'companyId', foreignField: 'companyId', as: 'orders' } },
      { $addFields: { orders: { $filter: { input: '$orders', as: 'order', cond: { $and: [{ $eq: [{ $ifNull: ['$$order.deletedAt', null] }, null] }, { $not: [{ $in: ['$$order.statusId', cancelled] }] }] } } } } },
      {
        $project: {
          customerNumber: 1,
          company: '$company.name',
          city: '$company.city',
          status: 1,
          accountManager: personName('manager'),
          customerSince: 1,
          orderCount: { $size: '$orders' },
          orderValue: round({ $sum: '$orders.grandTotal' }),
          lastOrderDate: { $max: '$orders.orderDate' },
        },
      },
    ];
  },
  columns: [
    col('customerNumber', 'Number'),
    col('company', 'Company'),
    col('city', 'City'),
    col('status', 'Status'),
    col('accountManager', 'Account manager'),
    col('customerSince', 'Customer since', 'date'),
    col('orderCount', 'Orders', 'number'),
    col('orderValue', 'Order value', 'money'),
    col('lastOrderDate', 'Last order', 'date'),
  ],
  totals: ['orderCount', 'orderValue'],
  sort: { by: 'orderValue', order: 'desc' },
};

const OPEN_PAYMENT = [PAYMENT_STATUS_CATEGORY.UNPAID, PAYMENT_STATUS_CATEGORY.PARTIALLY_PAID];

const payments = {
  key: 'payments',
  title: 'Payments',
  description: 'Amounts to collect: invoiced, received, outstanding and overdue.',
  permission: 'payments.read',
  Model: Payment,
  scope: 'payments',
  dateFields: [col('createdAt', 'Recorded'), col('dueDate', 'Due date'), col('paymentDate', 'Payment date')],
  filters: [
    option('state', 'State', enumOf(PAYMENT_STATE), {
      // Overdue is not a status: not paid in full and past the due date.
      apply: async (state, { now }) =>
        state === PAYMENT_STATE.OVERDUE
          ? { statusId: { $in: await statusIds(PaymentStatus, OPEN_PAYMENT) }, dueDate: { $lt: startOfDay(now) } }
          : { statusId: { $in: await statusIds(PaymentStatus, [state]) } },
    }),
    reference('paymentMethodId', 'Method', PaymentMethod),
    company(),
  ],
  rows: ({ now }) => [
    ...join(Company, 'companyId', 'company'),
    ...join(Order, 'orderId', 'order'),
    ...join(PaymentStatus, 'statusId', 'status'),
    ...join(PaymentMethod, 'paymentMethodId', 'method'),
    {
      $project: {
        invoiceNumber: 1,
        company: '$company.name',
        order: '$order.orderNumber',
        status: '$status.name',
        amount: num('$amount'),
        paidAmount: num('$paidAmount'),
        remainingAmount: num('$remainingAmount'),
        dueDate: 1,
        paymentDate: 1,
        method: '$method.name',
        overdue: { $cond: [{ $and: [{ $in: ['$status.category', OPEN_PAYMENT] }, { $lt: [{ $ifNull: ['$dueDate', startOfDay(now)] }, startOfDay(now)] }] }, 'Yes', ''] },
        createdAt: 1,
      },
    },
  ],
  columns: [
    col('invoiceNumber', 'Invoice'),
    col('company', 'Company'),
    col('order', 'Order'),
    col('status', 'Status'),
    col('amount', 'Amount', 'money'),
    col('paidAmount', 'Paid', 'money'),
    col('remainingAmount', 'Remaining', 'money'),
    col('dueDate', 'Due', 'date'),
    col('overdue', 'Overdue'),
    col('paymentDate', 'Paid on', 'date'),
    col('method', 'Method'),
    col('createdAt', 'Recorded', 'datetime'),
  ],
  totals: ['amount', 'paidAmount', 'remainingAmount'],
  sort: { by: 'createdAt', order: 'desc' },
};

const tickets = {
  key: 'tickets',
  title: 'Tickets',
  description: 'Support tickets with their status, priority and owner.',
  permission: 'tickets.read',
  Model: Ticket,
  scope: 'tickets',
  dateFields: [col('createdAt', 'Opened'), col('resolvedAt', 'Resolved'), col('closedAt', 'Closed')],
  filters: [reference('statusId', 'Status', TicketStatus), reference('priorityId', 'Priority', TicketPriority), reference('categoryId', 'Category', TicketCategory), user('assignedTo'), company()],
  rows: () => [
    ...join(Company, 'companyId', 'company'),
    ...join(TicketCategory, 'categoryId', 'category'),
    ...join(TicketPriority, 'priorityId', 'priority'),
    ...join(TicketStatus, 'statusId', 'status'),
    ...join(User, 'assignedTo', 'owner'),
    {
      $project: {
        ticketNumber: 1,
        subject: 1,
        company: '$company.name',
        category: '$category.name',
        priority: '$priority.name',
        status: '$status.name',
        assignedTo: personName('owner'),
        replyCount: num('$replyCount'),
        createdAt: 1,
        resolvedAt: 1,
        closedAt: 1,
      },
    },
  ],
  columns: [
    col('ticketNumber', 'Number'),
    col('subject', 'Subject'),
    col('company', 'Company'),
    col('category', 'Category'),
    col('priority', 'Priority'),
    col('status', 'Status'),
    col('assignedTo', 'Assigned to'),
    col('replyCount', 'Replies', 'number'),
    col('createdAt', 'Opened', 'datetime'),
    col('resolvedAt', 'Resolved', 'datetime'),
    col('closedAt', 'Closed', 'datetime'),
  ],
  totals: [],
  sort: { by: 'createdAt', order: 'desc' },
};

const contracts = {
  key: 'contracts',
  title: 'Contracts',
  description: 'Contracts (AMC) with their term, value and status.',
  permission: 'contracts.read',
  Model: Contract,
  scope: 'contracts',
  dateFields: [col('endDate', 'End date'), col('startDate', 'Start date'), col('renewalDate', 'Renewal date')],
  filters: [reference('statusId', 'Status', ContractStatus), reference('contractTypeId', 'Type', ContractType), reference('billingCycleId', 'Billing cycle', BillingCycle), user('assignedTo'), company()],
  rows: () => [
    ...join(Company, 'companyId', 'company'),
    ...join(ContractType, 'contractTypeId', 'kind'),
    ...join(ContractStatus, 'statusId', 'status'),
    ...join(BillingCycle, 'billingCycleId', 'cycle'),
    ...join(User, 'assignedTo', 'owner'),
    {
      $project: {
        contractNumber: 1,
        company: '$company.name',
        type: '$kind.name',
        status: '$status.name',
        startDate: 1,
        endDate: 1,
        renewalDate: 1,
        amount: num('$amount'),
        billingCycle: '$cycle.name',
        assignedTo: personName('owner'),
      },
    },
  ],
  columns: [
    col('contractNumber', 'Number'),
    col('company', 'Company'),
    col('type', 'Type'),
    col('status', 'Status'),
    col('startDate', 'Start', 'date'),
    col('endDate', 'End', 'date'),
    col('renewalDate', 'Renewal', 'date'),
    col('amount', 'Amount', 'money'),
    col('billingCycle', 'Billing'),
    col('assignedTo', 'Assigned to'),
  ],
  totals: ['amount'],
  sort: { by: 'endDate', order: 'asc' },
};

const activities = {
  key: 'activities',
  title: 'Activities',
  description: 'Calls, meetings and other activities, with who did them and when.',
  permission: 'activities.read',
  Model: Activity,
  scope: 'activities',
  dateFields: [col('createdAt', 'Logged'), col('dueDate', 'Due'), col('completedAt', 'Completed')],
  filters: [reference('typeId', 'Type', ActivityType), option('status', 'Status', enumOf(ACTIVITY_STATUS)), user('assignedTo'), company()],
  rows: () => [
    ...join(ActivityType, 'typeId', 'kind'),
    ...join(Company, 'companyId', 'company'),
    ...join(User, 'assignedTo', 'owner'),
    {
      $project: {
        subject: 1,
        type: '$kind.name',
        status: 1,
        priority: 1,
        company: '$company.name',
        assignedTo: personName('owner'),
        dueDate: 1,
        completedAt: 1,
        createdAt: 1,
      },
    },
  ],
  columns: [
    col('subject', 'Subject'),
    col('type', 'Type'),
    col('status', 'Status'),
    col('priority', 'Priority'),
    col('company', 'Company'),
    col('assignedTo', 'Assigned to'),
    col('dueDate', 'Due', 'datetime'),
    col('completedAt', 'Completed', 'datetime'),
    col('createdAt', 'Logged', 'datetime'),
  ],
  totals: [],
  sort: { by: 'createdAt', order: 'desc' },
};

// In the order they are listed.
export const REPORTS = Object.freeze(
  Object.fromEntries([leads, sales, opportunities, customers, products, quotations, orders, payments, tickets, contracts, activities].map((report) => [report.key, report]))
);
export const REPORT_KEYS = Object.freeze(Object.keys(REPORTS));
// Every filter key any report understands (query validation needs to know them).
export const REPORT_FILTER_KEYS = Object.freeze([...new Set(Object.values(REPORTS).flatMap((report) => report.filters.map((filter) => filter.key)))]);
