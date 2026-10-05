// Seed data for access control. This is the ONLY place role names and the
// permission catalogue are written down; it is loaded into MongoDB by
// services/seed.service.js. Application logic never refers to these names - it
// reads roles and permissions from the database.
//
// To add a permission: add it here, then guard a route with
// requirePermission('<module>.<action>'). It is inserted on the next start (or
// `npm run seed`) and can then be granted to roles from the Roles screen.

// module -> { action: description }
export const PERMISSION_SEED = {
  users: {
    read: 'View users',
    create: 'Create users',
    update: 'Edit user profiles',
    changeStatus: 'Activate and deactivate users',
    resetPassword: "Set another user's password",
    delete: 'Delete users',
    assignRole: 'Choose the role of a user',
  },
  roles: {
    read: 'View roles',
    create: 'Create roles',
    update: 'Edit role name, description and status',
    delete: 'Delete roles',
    assignPermissions: 'Change which permissions a role has',
  },
  permissions: {
    read: 'View the permission catalogue',
  },
  companies: {
    read: 'View companies',
    create: 'Create companies',
    update: 'Edit companies',
    delete: 'Delete companies',
    manageLookups: 'Add industries, company types and organizations',
  },
  contacts: {
    read: 'View contacts',
    create: 'Create contacts',
    update: 'Edit contacts',
    delete: 'Delete contacts',
  },
  activities: {
    read: 'View activities',
    create: 'Log and plan activities',
    update: 'Edit and complete activities',
    delete: 'Delete activities',
    manageTypes: 'Manage activity types',
  },
  followups: {
    read: 'View follow-ups',
    create: 'Create follow-ups',
    update: 'Edit, complete and reschedule follow-ups',
  },
  products: {
    read: 'View products and services',
    create: 'Create products and services',
    update: 'Edit products and services',
    delete: 'Delete products and services',
    manageCatalog: 'Manage product categories, units and taxes',
  },
  leadConfig: {
    manage: 'Manage lead sources, statuses and priorities',
  },
  leads: {
    create: 'Create leads',
    read: 'View leads',
    update: 'Edit leads and change their status',
    delete: 'Delete leads',
    assign: 'Assign leads to users',
    convert: 'Convert leads into a company, contact and opportunity',
    email: 'Email the contacts of several leads at once',
  },
  opportunities: {
    read: 'View opportunities',
    create: 'Create opportunities',
    update: 'Edit opportunities and move them between stages',
    delete: 'Delete opportunities',
    assign: 'Assign opportunities to users',
  },
  quotations: {
    read: 'View quotations and download their PDF',
    create: 'Create quotations',
    update: 'Edit quotations and change their status',
    delete: 'Delete quotations',
    send: 'Send quotations to customers',
    manageStatuses: 'Manage quotation statuses',
  },
  customers: {
    read: 'View customers and their 360-degree view',
    create: 'Make a company a customer',
    update: 'Edit customer details',
    delete: 'Remove customer status from a company',
  },
  projects: {
    read: 'View projects, their tasks and milestones',
    create: 'Create projects',
    update: 'Edit projects and their team',
    delete: 'Delete projects',
    manageTasks: 'Add, edit and delete project tasks and milestones',
    manageStatuses: 'Manage project and task statuses',
  },
  tickets: {
    read: 'View tickets, their conversation and attachments',
    create: 'Open tickets',
    update: 'Edit tickets and change their status',
    delete: 'Delete tickets',
    assign: 'Assign tickets to other users',
    reply: 'Reply on tickets',
    addInternalNote: 'Add internal notes to tickets',
    manageSettings: 'Manage ticket categories, priorities and statuses',
  },
  audit: {
    read: 'View the audit log',
    viewAll: 'View audit log entries of every organization and every user',
  },
  reports: {
    read: 'Run reports (each report also needs the permission to read that module)',
    export: 'Export reports to CSV, Excel and PDF',
    viewAll: 'Run reports across every organization and every user',
  },
  search: {
    viewAll: 'Find records of every organization and every user in global search',
  },
  dashboard: {
    read: 'View the dashboard (each figure also needs the permission to read that module)',
    viewAll: 'See dashboard figures for every organization and every user',
  },
  documents: {
    read: 'View and download documents of records you can see',
    create: 'Upload documents, and delete your own',
    delete: 'Delete any document',
  },
  payments: {
    read: 'View payments and what is outstanding',
    create: 'Create payment records (invoices to collect)',
    update: 'Edit payments, record money received and cancel them',
    delete: 'Delete payments',
    manageSettings: 'Manage payment methods and statuses',
  },
  contracts: {
    read: 'View contracts (AMC) and their reminders',
    create: 'Create contracts',
    update: 'Edit contracts and change their status',
    delete: 'Delete contracts',
    manageSettings: 'Manage contract types, statuses, billing cycles and reminder periods, and run the reminder check',
  },
  orders: {
    read: 'View orders',
    create: 'Create orders, including from accepted quotations',
    update: 'Edit orders and change their status',
    delete: 'Delete orders',
    manageStatuses: 'Manage order statuses',
  },
  settings: {
    manage: 'Edit the company profile printed on documents',
  },
  pipelines: {
    manage: 'Manage sales pipelines and their stages',
  },
};

// Created only when no role with the same flag exists. After that they are
// ordinary documents: rename them freely, the flags are what the code relies on.
export const ROLE_SEED = [
  {
    name: 'Administrator',
    description: 'Full access to every part of the system',
    isSystem: true,
    // Holds every permission, including ones added later.
    isSuperAdmin: true,
  },
  {
    name: 'User',
    description: 'Default role for new accounts',
    isSystem: true,
    // Given to users created without an explicit role.
    isDefault: true,
  },
];
