import Joi from 'joi';

// The shape of a user's interface preferences. Which themes, languages and
// sizes exist is the web app's business (it ignores a value it does not know),
// so they are checked here only as short identifiers. null removes a preference.

const id = Joi.string().trim().max(60).pattern(/^[\w.:-]+$/);
const MAX_COLUMNS = 80;
const MAX_TABLES = 60;
const MAX_WIDGETS = 40;

const tableColumns = Joi.object({
  // field -> shown?
  visibility: Joi.object().pattern(id, Joi.boolean()).max(MAX_COLUMNS),
  // field -> width in pixels
  widths: Joi.object().pattern(id, Joi.number().min(30).max(2000)).max(MAX_COLUMNS),
  order: Joi.array().items(id).max(MAX_COLUMNS),
});

const widget = Joi.object({
  id: id.required(),
  // Width in twelfths of the dashboard.
  size: Joi.number().integer().min(1).max(12),
  hidden: Joi.boolean(),
});

export const updatePreferencesSchema = Joi.object({
  theme: id.allow(null),
  themeMode: Joi.string().valid('light', 'dark', 'system').allow(null),
  language: id.allow(null),
  fontSize: id.allow(null),
  sidebarWidth: Joi.number().integer().min(120).max(800).allow(null),
  sidebarCollapsed: Joi.boolean().allow(null),
  tableDensity: id.allow(null),
  dashboardLayout: Joi.array().items(widget).max(MAX_WIDGETS).allow(null),
  // table id -> its columns
  tableColumns: Joi.object().pattern(id, tableColumns).max(MAX_TABLES).allow(null),
}).min(1);
