export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  BAD_GATEWAY: 502,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
});

export const MESSAGES = Object.freeze({
  HEALTH_OK: 'CRM API is running',
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHORIZED: 'Authentication required',
  TOKEN_INVALID: 'Invalid or expired token',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Resource not found',
  ROUTE_NOT_FOUND: 'Route not found',
  DUPLICATE: 'A record with the same value already exists',
  INVALID_ID: 'Invalid identifier',
  INVALID_JSON: 'Malformed JSON in request body',
  PAYLOAD_TOO_LARGE: 'Request body is too large',
  TOO_MANY_REQUESTS: 'Too many requests, please try again later',
  CORS_BLOCKED: 'Origin not allowed by CORS',
  INTERNAL_ERROR: 'Internal server error',
  REGISTERED: 'User registered successfully',
  LOGIN_OK: 'Login successful',
  LOGOUT_OK: 'Logged out successfully',
  TOKEN_REFRESHED: 'Token refreshed',
  PASSWORD_CHANGED: 'Password changed successfully',
  CURRENT_USER: 'Current user',
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_INACTIVE: 'This account is inactive. Contact an administrator.',
  REGISTRATION_DISABLED: 'Public registration is disabled',
  ROLE_ASSIGN_FORBIDDEN: 'You are not allowed to assign this role',
  USER_MANAGE_FORBIDDEN: 'You are not allowed to manage a user with more access than you have',
  OWN_ROLE_FORBIDDEN: 'You cannot change your own role',
  OWN_STATUS_FORBIDDEN: 'You cannot change your own status',
  OWN_DELETE_FORBIDDEN: 'You cannot delete your own account',
  OWN_RESET_FORBIDDEN: 'Use change password to update your own password',
  EMAIL_DELETED_USER: 'This email belongs to a deleted user',
  USER_NOT_FOUND: 'User not found',
  ROLE_NOT_FOUND: 'Role not found',
  DEPARTMENT_NOT_FOUND: 'Department not found',
  USERS_LISTED: 'Users retrieved',
  USER_RETRIEVED: 'User retrieved',
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  USER_STATUS_UPDATED: 'User status updated',
  USER_PASSWORD_RESET: 'Password reset successfully',
  USER_DELETED: 'User deleted successfully',
  ROLES_LISTED: 'Roles retrieved',
  ROLE_RETRIEVED: 'Role retrieved',
  ROLE_CREATED: 'Role created successfully',
  ROLE_UPDATED: 'Role updated successfully',
  ROLE_DELETED: 'Role deleted successfully',
  ROLE_PERMISSIONS_UPDATED: 'Role permissions updated',
  PERMISSIONS_LISTED: 'Permissions retrieved',
  ROLE_NAME_TAKEN: 'A role with this name already exists',
  ROLE_INACTIVE: 'This role is inactive and cannot be assigned',
  ROLE_MANAGE_FORBIDDEN: 'You are not allowed to manage a role with more access than you have',
  OWN_ROLE_MANAGE_FORBIDDEN: 'You cannot modify the role you are assigned to',
  PERMISSION_GRANT_FORBIDDEN: 'You cannot grant permissions you do not have',
  PERMISSION_UNKNOWN: 'Unknown permission',
  ROLE_SYSTEM_DELETE: 'System roles cannot be deleted',
  ROLE_SYSTEM_STATUS: 'System roles cannot be deactivated',
  ROLE_FULL_ACCESS_PERMISSIONS: 'This role has full access; its permissions cannot be edited',
  ROLE_IN_USE: 'This role is assigned to users. Reassign them before deleting it.',
  DEFAULT_ROLE_MISSING: 'No default role is configured',
  DEPARTMENTS_LISTED: 'Departments retrieved',
  PRODUCTS_LISTED: 'Products retrieved',
  PRODUCT_RETRIEVED: 'Product retrieved',
  PRODUCT_CREATED: 'Product created successfully',
  PRODUCT_UPDATED: 'Product updated successfully',
  PRODUCT_DELETED: 'Product deleted successfully',
  PRODUCT_NOT_FOUND: 'Product not found',
  PRODUCT_OPTIONS: 'Product options retrieved',
  PRODUCT_SKU_CHECKED: 'SKU checked',
  PRODUCT_SKU_TAKEN: 'This SKU is already in use',
  PRODUCT_SKU_EXHAUSTED: 'Could not generate a free SKU. Enter one manually.',
  PRODUCT_CATEGORY_NOT_FOUND: 'Product category not found or inactive',
  PRODUCT_UNIT_NOT_FOUND: 'Unit not found or inactive',
  PRODUCT_TAX_NOT_FOUND: 'Tax not found or inactive',
  PRICE_RANGE_INVALID: 'minPrice must not be greater than maxPrice',
  PIPELINES_LISTED: 'Pipelines retrieved',
  PIPELINE_RETRIEVED: 'Pipeline retrieved',
  PIPELINE_CREATED: 'Pipeline created successfully',
  PIPELINE_UPDATED: 'Pipeline updated successfully',
  PIPELINE_DELETED: 'Pipeline deleted successfully',
  PIPELINE_NOT_FOUND: 'Pipeline not found',
  PIPELINE_INACTIVE: 'This pipeline is inactive',
  PIPELINE_NAME_TAKEN: 'A pipeline with this name already exists',
  PIPELINE_DEFAULT_REQUIRED: 'There must always be a default pipeline. Make another one the default instead.',
  PIPELINE_DEFAULT_INACTIVE: 'The default pipeline cannot be inactive. Make another one the default first.',
  PIPELINE_DEFAULT_DELETE: 'The default pipeline cannot be deleted. Make another one the default first.',
  PIPELINE_IN_USE: 'This pipeline has opportunities. Deactivate it instead of deleting it.',
  PIPELINE_NONE: 'No active pipeline with an active stage is configured. Set one up under Pipelines.',
  PIPELINE_NO_STAGE: 'This pipeline has no active stage',
  STAGES_LISTED: 'Pipeline stages retrieved',
  STAGE_CREATED: 'Stage created successfully',
  STAGE_UPDATED: 'Stage updated successfully',
  STAGE_DELETED: 'Stage deleted successfully',
  STAGES_REORDERED: 'Stages reordered',
  STAGE_NOT_FOUND: 'Stage not found',
  STAGE_INACTIVE: 'This stage is inactive',
  STAGE_NAME_TAKEN: 'This pipeline already has a stage with this name',
  STAGE_IN_USE: 'This stage has opportunities. Move them or deactivate the stage instead of deleting it.',
  STAGE_WRONG_PIPELINE: 'This stage does not belong to the pipeline',
  STAGE_REORDER_MISMATCH: 'stageIds must list every stage of the pipeline exactly once',
  OPPORTUNITIES_LISTED: 'Opportunities retrieved',
  OPPORTUNITY_BOARD: 'Opportunity board retrieved',
  OPPORTUNITY_RETRIEVED: 'Opportunity retrieved',
  OPPORTUNITY_CREATED: 'Opportunity created successfully',
  OPPORTUNITY_UPDATED: 'Opportunity updated successfully',
  OPPORTUNITY_DELETED: 'Opportunity deleted successfully',
  OPPORTUNITY_STAGE_UPDATED: 'Opportunity moved',
  OPPORTUNITY_ASSIGNED: 'Opportunity assignment updated',
  OPPORTUNITY_TIMELINE: 'Opportunity timeline retrieved',
  OPPORTUNITY_NOT_FOUND: 'Opportunity not found',
  OPPORTUNITY_ASSIGN_FORBIDDEN: 'You are not allowed to assign opportunities to other users',
  QUOTATIONS_LISTED: 'Quotations retrieved',
  QUOTATION_RETRIEVED: 'Quotation retrieved',
  QUOTATION_CREATED: 'Quotation created successfully',
  QUOTATION_UPDATED: 'Quotation updated successfully',
  QUOTATION_DELETED: 'Quotation deleted successfully',
  QUOTATION_STATUS_UPDATED: 'Quotation status updated',
  QUOTATION_CALCULATED: 'Totals calculated - nothing was saved',
  QUOTATION_SENT: 'Quotation emailed',
  QUOTATION_MARKED_SENT: 'Quotation marked as sent. Email is not configured, so nothing was emailed.',
  QUOTATION_TIMELINE: 'Quotation timeline retrieved',
  QUOTATION_NOT_FOUND: 'Quotation not found',
  QUOTATION_STATUS_NOT_FOUND: 'Quotation status not found or inactive',
  QUOTATION_NO_DEFAULT_STATUS: 'No default quotation status is configured. Set one in Settings.',
  QUOTATION_LOCKED: 'An accepted or rejected quotation cannot be edited. Change its status first.',
  QUOTATION_PRODUCT_NOT_FOUND: 'Product not found',
  QUOTATION_PRODUCT_INACTIVE: 'This product is inactive',
  QUOTATION_OPPORTUNITY_NOT_FOUND: 'Opportunity not found',
  QUOTATION_OPPORTUNITY_COMPANY_MISMATCH: 'This opportunity belongs to another company',
  QUOTATION_VALID_UNTIL_BEFORE_DATE: 'validUntil must not be before quotationDate',
  QUOTATION_NO_RECIPIENT: 'No email address to send to. Enter one, or add an email to the contact or company.',
  QUOTATION_EMAIL_FAILED: 'The email could not be sent. The quotation was not marked as sent.',
  QUOTATION_HAS_ORDER: 'An order was created from this quotation. Delete the order first.',
  ORDERS_LISTED: 'Orders retrieved',
  ORDER_RETRIEVED: 'Order retrieved',
  ORDER_CREATED: 'Order created successfully',
  ORDER_UPDATED: 'Order updated successfully',
  ORDER_DELETED: 'Order deleted successfully',
  ORDER_STATUS_UPDATED: 'Order status updated',
  ORDER_TIMELINE: 'Order timeline retrieved',
  ORDER_NOT_FOUND: 'Order not found',
  ORDER_STATUS_NOT_FOUND: 'Order status not found or inactive',
  ORDER_NO_DEFAULT_STATUS: 'No default order status is configured. Set one in Settings.',
  ORDER_LOCKED: 'A completed or cancelled order cannot be edited. Change its status first.',
  ORDER_DELIVERY_BEFORE_ORDER: 'deliveryDate must not be before orderDate',
  ORDER_QUOTATION_COMPANY_MISMATCH: 'This quotation belongs to another company',
  ORDER_QUOTATION_NOT_ACCEPTED: 'Only an accepted quotation can be turned into an order',
  ORDER_ALREADY_GENERATED: 'An order has already been created from this quotation',
  CUSTOMERS_LISTED: 'Customers retrieved',
  CUSTOMER_RETRIEVED: 'Customer retrieved',
  CUSTOMER_CREATED: 'Customer created successfully',
  CUSTOMER_UPDATED: 'Customer updated successfully',
  CUSTOMER_DELETED: 'Customer removed. The company and its records are unchanged.',
  CUSTOMER_SUMMARY: 'Customer summary retrieved',
  CUSTOMER_TIMELINE: 'Customer timeline retrieved',
  CUSTOMER_NOT_FOUND: 'Customer not found',
  CUSTOMER_EXISTS: 'This company is already a customer',
  PROJECTS_LISTED: 'Projects retrieved',
  PROJECT_RETRIEVED: 'Project retrieved',
  PROJECT_CREATED: 'Project created successfully',
  PROJECT_UPDATED: 'Project updated successfully',
  PROJECT_DELETED: 'Project deleted successfully',
  PROJECT_SUMMARY: 'Project summary retrieved',
  PROJECT_TIMELINE: 'Project timeline retrieved',
  PROJECT_NOT_FOUND: 'Project not found',
  PROJECT_STATUS_NOT_FOUND: 'Project status not found or inactive',
  PROJECT_NO_DEFAULT_STATUS: 'No default project status is configured. Set one in Settings.',
  PROJECT_ORDER_COMPANY_MISMATCH: 'This order belongs to another company',
  PROJECT_ORDER_NOT_FOUND: 'Order not found',
  PROJECT_CUSTOMER_MISMATCH: 'This customer is not the project company',
  PROJECT_END_BEFORE_START: 'End dates must not be before startDate',
  PROJECT_MEMBER_NOT_FOUND: 'Team member not found or inactive',
  TASKS_LISTED: 'Tasks retrieved',
  TASK_CREATED: 'Task created successfully',
  TASK_UPDATED: 'Task updated successfully',
  TASK_DELETED: 'Task deleted successfully',
  TASK_NOT_FOUND: 'Task not found',
  TASK_STATUS_NOT_FOUND: 'Task status not found or inactive',
  TASK_NO_DEFAULT_STATUS: 'No default task status is configured. Set one in Settings.',
  TASK_ASSIGNEE_NOT_ON_TEAM: 'Tasks can only be assigned to the project manager or a team member',
  TASK_DUE_BEFORE_START: 'dueDate must not be before startDate',
  MILESTONES_LISTED: 'Milestones retrieved',
  MILESTONE_CREATED: 'Milestone created successfully',
  MILESTONE_UPDATED: 'Milestone updated successfully',
  MILESTONE_DELETED: 'Milestone deleted successfully',
  MILESTONE_NOT_FOUND: 'Milestone not found',
  MILESTONE_HAS_TASKS: 'Tasks are linked to this milestone. Move them first.',
  ORDER_OPTIONS: 'Order options retrieved',
  TICKETS_LISTED: 'Tickets retrieved',
  TICKET_STATS: 'Ticket counts retrieved',
  TICKET_RETRIEVED: 'Ticket retrieved',
  TICKET_CREATED: 'Ticket created successfully',
  TICKET_UPDATED: 'Ticket updated successfully',
  TICKET_DELETED: 'Ticket deleted successfully',
  TICKET_ASSIGNED: 'Ticket assignment updated',
  TICKET_STATUS_UPDATED: 'Ticket status updated',
  TICKET_REPLY_ADDED: 'Reply added',
  TICKET_NOTE_ADDED: 'Internal note added',
  TICKET_CONVERSATION: 'Ticket conversation retrieved',
  TICKET_NOT_FOUND: 'Ticket not found',
  TICKET_CATEGORY_NOT_FOUND: 'Ticket category not found or inactive',
  TICKET_PRIORITY_NOT_FOUND: 'Ticket priority not found or inactive',
  TICKET_STATUS_NOT_FOUND: 'Ticket status not found or inactive',
  TICKET_NO_DEFAULT_STATUS: 'No default ticket status is configured. Set one in Settings.',
  TICKET_ASSIGN_FORBIDDEN: 'You are not allowed to assign tickets to other users',
  TICKET_CLOSED: 'This ticket is closed. Reopen it (change its status) before replying.',
  TICKET_PROJECT_MISMATCH: 'This project belongs to another company',
  CONTRACTS_LISTED: 'Contracts retrieved',
  CONTRACT_STATS: 'Contract counts retrieved',
  CONTRACT_RETRIEVED: 'Contract retrieved',
  CONTRACT_CREATED: 'Contract created successfully',
  CONTRACT_UPDATED: 'Contract updated successfully',
  CONTRACT_DELETED: 'Contract deleted successfully',
  CONTRACT_STATUS_UPDATED: 'Contract status updated',
  CONTRACT_TIMELINE: 'Contract timeline retrieved',
  CONTRACT_REMINDERS: 'Contract reminders retrieved',
  CONTRACT_REMINDERS_RUN: 'Reminder check finished',
  CONTRACT_NOT_FOUND: 'Contract not found',
  CONTRACT_TYPE_NOT_FOUND: 'Contract type not found or inactive',
  CONTRACT_STATUS_NOT_FOUND: 'Contract status not found or inactive',
  CONTRACT_BILLING_CYCLE_NOT_FOUND: 'Billing cycle not found or inactive',
  CONTRACT_NO_DEFAULT_STATUS: 'No default contract status is configured. Set one in Settings.',
  CONTRACT_END_BEFORE_START: 'endDate must not be before startDate',
  CONTRACT_RENEWAL_BEFORE_START: 'renewalDate must not be before startDate',
  PAYMENTS_LISTED: 'Payments retrieved',
  PAYMENT_STATS: 'Payment totals retrieved',
  PAYMENT_RETRIEVED: 'Payment retrieved',
  PAYMENT_CREATED: 'Payment created successfully',
  PAYMENT_UPDATED: 'Payment updated successfully',
  PAYMENT_DELETED: 'Payment deleted successfully',
  PAYMENT_TIMELINE: 'Payment timeline retrieved',
  PAYMENT_NOT_FOUND: 'Payment not found',
  PAYMENT_METHOD_NOT_FOUND: 'Payment method not found or inactive',
  PAYMENT_STATUS_NOT_FOUND: 'Payment status not found or inactive',
  PAYMENT_NO_STATUS: 'No active payment status with the meaning needed is configured. Add one in Settings.',
  PAYMENT_INVOICE_TAKEN: 'This invoice number is already in use',
  PAYMENT_ORDER_NOT_FOUND: 'Order not found',
  PAYMENT_ORDER_COMPANY_MISMATCH: 'This order belongs to another company',
  PAYMENT_EXCEEDS_OUTSTANDING: 'The amount paid would be more than the amount outstanding',
  PAYMENT_EXCEEDS_ORDER: 'The invoices for this order would add up to more than the order total',
  ORDER_HAS_PAYMENTS: 'This order has payments. Delete them first.',
  DOCUMENTS_LISTED: 'Documents retrieved',
  DOCUMENT_RETRIEVED: 'Document retrieved',
  DOCUMENTS_UPLOADED: 'Document(s) uploaded successfully',
  DOCUMENT_DELETED: 'Document deleted successfully',
  DOCUMENT_CONFIG: 'Upload rules retrieved',
  DOCUMENT_NOT_FOUND: 'Document not found',
  DOCUMENT_NO_FILE: 'No file was sent. Send one or more files in the "files" field (multipart/form-data).',
  DOCUMENT_EMPTY_FILE: 'The file is empty',
  DOCUMENT_CONTENT_MISMATCH: 'The content of the file does not match its type',
  DOCUMENT_EXTENSION: 'Files with this extension cannot be uploaded',
  DOCUMENT_ENTITY_NOT_FOUND: 'The record to attach the document to was not found',
  DOCUMENT_ENTITY_FORBIDDEN: 'You do not have access to the record this document belongs to',
  DOCUMENT_DELETE_FORBIDDEN: 'You can only delete documents you uploaded yourself',
  NOTIFICATIONS_LISTED: 'Notifications retrieved',
  NOTIFICATION_READ: 'Notification marked as read',
  NOTIFICATIONS_ALL_READ: 'All notifications marked as read',
  NOTIFICATION_DELETED: 'Notification deleted',
  NOTIFICATION_NOT_FOUND: 'Notification not found',
  DASHBOARD_SUMMARY: 'Dashboard summary retrieved',
  DASHBOARD_SALES: 'Sales dashboard retrieved',
  DASHBOARD_LEADS: 'Leads dashboard retrieved',
  DASHBOARD_OPPORTUNITIES: 'Opportunities dashboard retrieved',
  DASHBOARD_ACTIVITIES: 'Activities dashboard retrieved',
  DASHBOARD_ORGANIZATION_FORBIDDEN: 'You can only see the dashboard of your own organization',
  SEARCH_RESULTS: 'Search results retrieved',
  PREFERENCES_RETRIEVED: 'Preferences retrieved',
  PREFERENCES_UPDATED: 'Preferences saved',
  REPORTS_LISTED: 'Reports retrieved',
  REPORT_RETRIEVED: 'Report retrieved',
  REPORT_NOT_FOUND: 'Report not found',
  AUDIT_LOGS_LISTED: 'Audit log retrieved',
  AUDIT_LOG_RETRIEVED: 'Audit log entry retrieved',
  AUDIT_FILTERS: 'Audit log filters retrieved',
  AUDIT_LOG_NOT_FOUND: 'Audit log entry not found',
  ATTACHMENT_NOT_FOUND: 'Attachment not found',
  ATTACHMENT_TOO_LARGE: 'A file is larger than the upload limit',
  ATTACHMENT_TOO_MANY: 'Too many files in one request',
  ATTACHMENT_TYPE: 'This type of file cannot be uploaded',
  ATTACHMENT_FIELD: 'Files must be sent in the "attachments" field',
  SETTINGS_RETRIEVED: 'Settings retrieved',
  SETTINGS_UPDATED: 'Settings updated',
  COMPANY_PROFILE_RETRIEVED: 'Company profile retrieved',
  COMPANY_PROFILE_UPDATED: 'Company profile updated',
  COMPANY_PROFILE_MISSING: 'Your company profile has no name yet. Fill it in under Company profile before generating documents.',
  OPPORTUNITY_OPTIONS: 'Opportunity options retrieved',
  LEADS_LISTED: 'Leads retrieved',
  LEAD_RETRIEVED: 'Lead retrieved',
  LEAD_EMAIL_SENT: 'Email sent to the selected leads',
  IMPORT_PREVIEW: 'Import preview: nothing has been changed yet',
  IMPORT_DONE: 'Import finished',
  IMPORT_NOT_XLSX: 'Choose an Excel file (.xlsx) - download the template if you need one',
  IMPORT_TOO_LARGE: 'The file is larger than 2 MB',
  IMPORT_UNREADABLE: 'The file could not be read as an Excel sheet',
  IMPORT_COLUMNS_MISSING: 'The sheet is missing required columns. Use the template, and do not rename its headings.',
  IMPORT_EMPTY: 'The Contacts sheet has no rows to import',
  IMPORT_TOO_MANY: 'At most 1000 rows can be imported at once',
  IMPORT_DUPLICATE_ROW: 'Same person as an earlier row in this file',
  LEAD_EMAIL_NOT_CONFIGURED: 'No mail server is configured, so nothing can be emailed. Ask an administrator to set SMTP in the server settings.',
  LEAD_EMAIL_NO_ADDRESS: 'Neither the contact nor the company has an email address',
  LEAD_EMAIL_SAME_ADDRESS: 'Same address as',
  LEAD_EMAIL_FAILED: 'The mail server refused this message',
  LEAD_CREATED: 'Lead created successfully',
  LEAD_UPDATED: 'Lead updated successfully',
  LEAD_DELETED: 'Lead deleted successfully',
  LEAD_ASSIGNED: 'Lead assignment updated',
  LEAD_STATUS_UPDATED: 'Lead status updated',
  LEAD_CONVERTED: 'Lead converted successfully',
  LEAD_CONVERSION_PREVIEW: 'Conversion preview - nothing was changed',
  LEAD_TIMELINE: 'Lead timeline retrieved',
  LEAD_NOT_FOUND: 'Lead not found',
  LEAD_CONTACT_NOT_FOUND: 'Contact not found',
  LEAD_CONTACT_COMPANY_MISMATCH: 'This contact does not belong to the selected company',
  LEAD_SOURCE_NOT_FOUND: 'Lead source not found or inactive',
  LEAD_STATUS_NOT_FOUND: 'Lead status not found or inactive',
  LEAD_PRIORITY_NOT_FOUND: 'Lead priority not found or inactive',
  LEAD_NO_DEFAULT_STATUS: 'No default lead status is configured. Set one in Lead settings.',
  LEAD_ASSIGN_FORBIDDEN: 'You are not allowed to assign leads to other users',
  LEAD_ALREADY_CONVERTED: 'This lead has already been converted',
  LEAD_CONVERT_COMPANY_REQUIRED: 'A company is required to convert this lead',
  LEAD_CONVERT_COMPANY_SET: 'This lead already has a company; company details cannot be sent',
  LEAD_CONVERT_CONTACT_SET: 'This lead already has a contact; contact details cannot be sent',
  LEAD_CONVERT_STATUS_NOT_WON: 'The status for a converted lead must be an active "won" status',
  CONTACT_HAS_RECORDS: 'This contact is still used by other records. Remove or change them first.',
  CONTACT_OPTIONS: 'Contact options retrieved',
  ACTIVITIES_LISTED: 'Activities retrieved',
  ACTIVITY_CREATED: 'Activity created successfully',
  ACTIVITY_UPDATED: 'Activity updated successfully',
  ACTIVITY_DELETED: 'Activity deleted successfully',
  ACTIVITY_NOT_FOUND: 'Activity not found',
  ACTIVITY_TYPE_NOT_FOUND: 'Activity type not found or inactive',
  ACTIVITY_RELATION_REQUIRED: 'An activity must be related to at least one record',
  RELATION_COMPANY_MISMATCH: 'The related records belong to different companies',
  RELATED_RECORD_NOT_FOUND: 'Related record not found',
  FOLLOW_UPS_LISTED: 'Follow-ups retrieved',
  FOLLOW_UP_CREATED: 'Follow-up created successfully',
  FOLLOW_UP_UPDATED: 'Follow-up updated successfully',
  FOLLOW_UP_COMPLETED: 'Follow-up completed',
  FOLLOW_UP_RESCHEDULED: 'Follow-up rescheduled',
  FOLLOW_UP_NOT_FOUND: 'Follow-up not found',
  FOLLOW_UP_NOT_PENDING: 'Only a pending follow-up can be rescheduled. Reopen it first.',
  FOLLOW_UP_REMINDER_AFTER_DUE: 'reminderDate must not be after dueDate',
  LEAD_CONFIG_LISTED: 'Records retrieved',
  LEAD_CONFIG_CREATED: 'Record created successfully',
  LEAD_CONFIG_UPDATED: 'Record updated successfully',
  LEAD_CONFIG_DELETED: 'Record deleted successfully',
  LEAD_CONFIG_NOT_FOUND: 'Record not found',
  LEAD_CONFIG_NAME_TAKEN: 'A record with this name already exists',
  LEAD_CONFIG_DEFAULT_REQUIRED: 'There must always be a default. Make another one the default instead.',
  LEAD_CONFIG_DEFAULT_INACTIVE: 'The default cannot be inactive. Make another one the default first.',
  LEAD_CONFIG_DEFAULT_DELETE: 'The default cannot be deleted. Make another one the default first.',
  LEAD_CONFIG_IN_USE: 'This value is used by existing records. Deactivate it instead of deleting it.',
  CONTACTS_LISTED: 'Contacts retrieved',
  CONTACT_RETRIEVED: 'Contact retrieved',
  CONTACT_CREATED: 'Contact created successfully',
  CONTACT_UPDATED: 'Contact updated successfully',
  CONTACT_DELETED: 'Contact deleted successfully',
  CONTACT_NOT_FOUND: 'Contact not found',
  CONTACT_COMPANY_NOT_FOUND: 'Company not found',
  CONTACT_EMAIL_TAKEN: 'This company already has a contact with this email',
  COMPANY_OPTIONS: 'Company options retrieved',
  COMPANY_HAS_RECORDS: 'This company still has related records. Remove or move them first.',
  COMPANIES_LISTED: 'Companies retrieved',
  COMPANY_RETRIEVED: 'Company retrieved',
  COMPANY_CREATED: 'Company created successfully',
  COMPANY_UPDATED: 'Company updated successfully',
  COMPANY_DELETED: 'Company deleted successfully',
  COMPANY_NOT_FOUND: 'Company not found',
  COMPANY_SECTIONS: 'Company sections retrieved',
  COMPANY_TIMELINE: 'Company timeline retrieved',
  GST_TAKEN: 'Another company already uses this GST number',
  GST_PAN_MISMATCH: 'GST number does not contain this PAN (characters 3-12 of a GSTIN are the PAN)',
  ASSIGNEE_NOT_FOUND: 'Assigned user not found or inactive',
  INDUSTRY_NOT_FOUND: 'Industry not found or inactive',
  COMPANY_TYPE_NOT_FOUND: 'Company type not found or inactive',
  ORGANIZATION_NOT_FOUND: 'Organization not found or inactive',
  MASTER_DATA_LISTED: 'Records retrieved',
  MASTER_DATA_CREATED: 'Record created successfully',
  MASTER_DATA_NAME_TAKEN: 'A record with this name already exists',
  USER_OPTIONS: 'User options retrieved',
  EMAIL_TAKEN: 'An account with this email already exists',
  CURRENT_PASSWORD_INCORRECT: 'Current password is incorrect',
  TOO_MANY_LOGIN_ATTEMPTS: 'Too many failed login attempts, please try again later',
});

// What a lead status means for the pipeline. Status *names* are data; this is
// the fixed classification code can rely on (e.g. "is this lead closed?").
export const LEAD_STATUS_CATEGORY = Object.freeze({
  OPEN: 'open',
  WON: 'won',
  LOST: 'lost',
});

export const PRODUCT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

// An opportunity's status is never set directly: it follows the type of the
// stage it is in (see STAGE_TYPE).
export const OPPORTUNITY_STATUS = Object.freeze({
  OPEN: 'open',
  WON: 'won',
  LOST: 'lost',
});

// What a quotation status means. Status *names* are data (see
// models/QuotationStatus.js); this is the fixed classification code relies on.
export const QUOTATION_STATUS_CATEGORY = Object.freeze({
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
});

// What an order status means. Status *names* are data (see models/OrderStatus.js).
export const ORDER_STATUS_CATEGORY = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

// What a project status / task status means. Names are data (see
// models/ProjectStatus.js and models/TaskStatus.js); these are what code relies on.
export const PROJECT_STATUS_CATEGORY = Object.freeze({
  NOT_STARTED: 'not_started',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const TASK_STATUS_CATEGORY = Object.freeze({
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled',
});

// What a ticket status means. Names are data (models/TicketStatus.js).
export const TICKET_STATUS_CATEGORY = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING: 'waiting',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
});

// What a contract status means. Names are data (models/ContractStatus.js).
// Only "active" contracts get expiry reminders, and an active contract whose
// end date has passed is moved to an "expired" status by the reminder job.
export const CONTRACT_STATUS_CATEGORY = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  RENEWED: 'renewed',
  CANCELLED: 'cancelled',
});

// What a payment status means. Names are data (models/PaymentStatus.js). The
// first three are never chosen by hand: the server works out which applies
// from the amounts. "Overdue" is not a status - it is unpaid or partially
// paid past the due date, worked out when asked.
export const PAYMENT_STATUS_CATEGORY = Object.freeze({
  UNPAID: 'unpaid',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  CANCELLED: 'cancelled',
});

// What a payment list can be narrowed to.
export const PAYMENT_STATE = Object.freeze({
  ...PAYMENT_STATUS_CATEGORY,
  OVERDUE: 'overdue',
});

// The business events that produce a notification. Who receives one is never
// written down here or anywhere else in code: it is read from the record the
// event is about (its assignee, creator, account manager, ...).
export const NOTIFICATION_TYPE = Object.freeze({
  LEAD_ASSIGNED: 'lead_assigned',
  TICKET_ASSIGNED: 'ticket_assigned',
  QUOTATION_STATUS_CHANGED: 'quotation_status_changed',
  FOLLOW_UP_DUE: 'follow_up_due',
  PAYMENT_OVERDUE: 'payment_overdue',
  CONTRACT_EXPIRING: 'contract_expiring',
});

// The periods a dashboard can cover. "custom" takes from / to.
export const DASHBOARD_PERIOD = Object.freeze({
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year',
  CUSTOM: 'custom',
});

// What the audit log records.
export const AUDIT_ACTION = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  ASSIGN: 'ASSIGN',
  STATUS_CHANGE: 'STATUS_CHANGE',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
});

// The two kinds of message on a ticket.
export const TICKET_MESSAGE_TYPE = Object.freeze({
  REPLY: 'reply',
  INTERNAL_NOTE: 'internal_note',
});

export const CUSTOMER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

// What a pipeline stage means. Stage *names* are data; this is the fixed
// classification code can rely on (e.g. "is this deal closed?").
export const STAGE_TYPE = Object.freeze({
  OPEN: 'open',
  WON: 'won',
  LOST: 'lost',
});

export const PIPELINE_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

// Activity *types* (Call, Meeting, ...) are data - see models/ActivityType.js.
// These are the fixed states an activity or follow-up moves through.
export const ACTIVITY_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const FOLLOW_UP_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const WORK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

export const TIMELINE_ACTIONS = Object.freeze([
  'created',
  'updated',
  'deleted',
  'assigned',
  'status_changed',
  'stage_changed',
  'sent',
  'converted',
  'reminded',
  // An email was sent to the record's contact (e.g. from the leads list).
  'emailed',
]);

export const CONTACT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

// How a contact prefers to be reached, and which stored field that relies on.
export const CONTACT_METHODS = Object.freeze({
  email: 'email',
  phone: 'phone',
  whatsapp: 'phone',
  sms: 'phone',
});

export const COMPANY_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

// Roles and permissions are data (see models/Role.js, models/Permission.js and
// seeds/rbac.seed.js). There is deliberately no list of role names or of
// role-to-permission rules in code.
export const ROLE_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});
