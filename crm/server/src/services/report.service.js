import mongoose from 'mongoose';
import env from '../config/env.js';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { escapeRegex, paginationMeta } from '../utils/query.js';
import { presentScope, resolveScope, scoped } from './dashboard.service.js';
import { startOfDay } from './lineItems.service.js';
import { REPORTS } from './report.definitions.js';

// Runs the reports described in report.definitions.js. A report is ONE
// aggregation pipeline: the date range, filters, search, sorting, paging and
// totals are all done by the database. The API hands back a page of finished
// rows (or, for an export, the rows of the file) - never raw collections.
//
// Like the dashboard, a report covers what the user may see: everything with
// reports.viewAll, otherwise their organization, otherwise their own records.

const DAY_MS = 24 * 60 * 60 * 1000;
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };
const VIEW_ALL = declarePermission('reports.viewAll');
for (const report of Object.values(REPORTS)) declarePermission(report.permission);
const { ObjectId } = mongoose.Types;

const unprocessable = (field, message) => new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);
const dateText = (date) => date.toISOString().slice(0, 10);

function definitionOf(key, actor) {
  const report = REPORTS[key];
  if (!report) throw ApiError.notFound(MESSAGES.REPORT_NOT_FOUND);
  if (!hasPermission(actor, report.permission)) throw ApiError.forbidden();
  return report;
}

// --- GET /reports -------------------------------------------------------------------

// What can be run, and how: columns, date fields and filters with their
// options. The screen is built from this - it knows no report by name.
export async function listReports(actor) {
  const visible = Object.values(REPORTS).filter((report) => hasPermission(actor, report.permission));
  const reports = await Promise.all(
    visible.map(async (report) => ({
      key: report.key,
      title: report.title,
      description: report.description,
      columns: report.columns,
      dateFields: report.dateFields.map(({ key, label }) => ({ key, label })),
      filters: await Promise.all(
        report.filters.map(async (filter) => ({
          key: filter.key,
          label: filter.label,
          type: filter.type,
          required: Boolean(filter.required),
          default: filter.default ?? null,
          ...(filter.options ? { options: await filter.options() } : {}),
        }))
      ),
      totals: report.totals,
      sort: report.sort,
    }))
  );
  return { reports, exportFormats: EXPORT_FORMATS, exportMaxRows: env.reportExportMaxRows };
}
export const EXPORT_FORMATS = Object.freeze(['csv', 'xlsx', 'pdf']);

// --- building the pipeline ------------------------------------------------------------

// The filters of this request that this report understands, checked.
async function readFilters(report, query, now) {
  const values = {};
  const match = [];
  const after = [];
  for (const filter of report.filters) {
    const value = query[filter.key] || filter.default;
    if (!value) continue;
    if (filter.objectId && !ObjectId.isValid(value)) throw unprocessable(filter.key, `"${filter.key}" must be a valid id`);
    if (filter.options && !filter.objectId && !(await filter.options()).some((entry) => entry.value === value)) {
      throw unprocessable(filter.key, `"${filter.key}" must be one of the values this report offers`);
    }
    values[filter.key] = value;
    if (filter.match === false) continue;
    const cast = filter.objectId ? new ObjectId(value) : value;
    const condition = filter.apply ? await filter.apply(value, { now }) : { [filter.key]: cast };
    (filter.after ? after : match).push(condition);
  }
  return { values, match, after };
}

async function prepare(key, query, actor, now) {
  const report = definitionOf(key, actor);
  const scope = await resolveScope(actor, query.organizationId, VIEW_ALL);

  const dateField = query.dateField || report.dateFields[0].key;
  if (!report.dateFields.some((field) => field.key === dateField)) {
    throw unprocessable('dateField', `"dateField" must be one of: ${report.dateFields.map((field) => field.key).join(', ')}`);
  }
  const sortBy = query.sortBy || report.sort.by;
  if (!report.columns.some((column) => column.key === sortBy)) {
    throw unprocessable('sortBy', `"sortBy" must be one of this report's columns: ${report.columns.map((column) => column.key).join(', ')}`);
  }
  const sortOrder = query.sortOrder || (query.sortBy ? 'asc' : report.sort.order);

  // Both days of the range are included.
  const range = {};
  if (query.from) range.$gte = startOfDay(query.from);
  if (query.to) range.$lt = new Date(startOfDay(query.to).getTime() + DAY_MS);

  const filters = await readFilters(report, query, now);
  const ctx = { filters: filters.values, now };
  const base = report.base ? await report.base(ctx) : {};
  const conditions = [scoped(scope, report.scope, base), ...(Object.keys(range).length ? [{ [dateField]: range }] : []), ...filters.match];

  // The words of a search must each appear in one of the text columns.
  const textColumns = report.columns.filter((column) => column.type === 'text').map((column) => column.key);
  const words = (query.search ?? '').split(/\s+/).filter(Boolean);
  const search = words.map((word) => ({ $or: textColumns.map((column) => ({ [column]: new RegExp(escapeRegex(word), 'i') })) }));

  const pipeline = [
    { $match: { $and: conditions } },
    ...(await report.rows(ctx)),
    ...(filters.after.length || search.length ? [{ $match: { $and: [...filters.after, ...search] } }] : []),
  ];
  return {
    report,
    scope,
    pipeline,
    sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 },
    applied: {
      dateField,
      from: query.from ? dateText(startOfDay(query.from)) : null,
      to: query.to ? dateText(startOfDay(query.to)) : null,
      search: words.join(' '),
      filters: filters.values,
      sortBy,
      sortOrder,
    },
  };
}

// Sums of the report's numeric columns over every matching row - not just the page.
const totalsStage = (report) => ({
  $group: { _id: null, rows: { $sum: 1 }, ...Object.fromEntries(report.totals.map((key) => [key, { $sum: { $ifNull: [`$${key}`, 0] } }])) },
});
function presentTotals(report, row) {
  return Object.fromEntries(report.totals.map((key) => [key, Math.round((row?.[key] ?? 0) * 100) / 100]));
}
// A row as sent: its columns only, in order.
const presentRow = (report) => (row) => ({ id: String(row._id), ...Object.fromEntries(report.columns.map((column) => [column.key, row[column.key] ?? null])) });

const describe = (report) => ({ key: report.key, title: report.title, description: report.description, columns: report.columns });

// --- GET /reports/:key ----------------------------------------------------------------

export async function runReport(key, query, actor, now = new Date()) {
  const { report, scope, pipeline, sort, applied } = await prepare(key, query, actor, now);
  const { page, limit } = query;
  const [result] = await report.Model.aggregate([
    ...pipeline,
    { $sort: sort },
    { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], totals: [totalsStage(report)] } },
  ]).collation(CASE_INSENSITIVE);

  const [totals] = result.totals;
  return {
    report: describe(report),
    applied,
    scope: await presentScope(actor, scope, VIEW_ALL),
    rows: result.rows.map(presentRow(report)),
    totals: presentTotals(report, totals),
    pagination: paginationMeta({ page, limit }, totals?.rows ?? 0),
    generatedAt: now.toISOString(),
  };
}

// --- GET /reports/:key/export ----------------------------------------------------------

// Every matching row, in order, for a file - up to REPORT_EXPORT_MAX_ROWS.
// `truncated` says there were more.
export async function collectReport(key, query, actor, now = new Date()) {
  const { report, scope, pipeline, sort, applied } = await prepare(key, query, actor, now);
  const max = env.reportExportMaxRows;
  const [rows, [totals]] = await Promise.all([
    report.Model.aggregate([...pipeline, { $sort: sort }, { $limit: max }]).collation(CASE_INSENSITIVE),
    report.Model.aggregate([...pipeline, totalsStage(report)]),
  ]);
  const total = totals?.rows ?? 0;
  return {
    report: describe(report),
    applied,
    scope: await presentScope(actor, scope, VIEW_ALL),
    rows: rows.map(presentRow(report)),
    totals: presentTotals(report, totals),
    totalRows: total,
    truncated: total > rows.length,
    generatedAt: now.toISOString(),
    generatedBy: actor.fullName,
  };
}
