import env from '../config/env.js';
import logger from '../config/logger.js';
import { AUDIT_ACTION } from '../constants/index.js';
import User from '../models/User.js';
import { describeRequest, difference, sanitize, snapshot, trackAudit, writeAudit } from '../services/audit.service.js';

// Writes the audit trail. Mounted once, in front of every route, so no module
// has to remember to audit: any request that changes something (POST, PUT,
// PATCH, DELETE) and succeeds leaves one entry saying who did what to which
// record, from where, and what changed.
//
// Before the request runs, the record is read as it is; after the response has
// gone out it is read again, and the fields that differ become oldData and
// newData. Reading requests (GET) are not audited.
//
// Failed attempts are kept only where they matter for security: signing in
// and changing a password.

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUDIT_FAILURES = new Set([AUDIT_ACTION.LOGIN, AUDIT_ACTION.PASSWORD_CHANGE]);
const SENSITIVE = new Set([AUDIT_ACTION.LOGIN, AUDIT_ACTION.LOGOUT, AUDIT_ACTION.PASSWORD_CHANGE]);
const OBJECT_ID = /^[0-9a-f]{24}$/i;

// The id of the record a response is about: the first { id } found in its data.
function idIn(data) {
  for (const value of Object.values(data ?? {})) {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (candidate && typeof candidate === 'object' && OBJECT_ID.test(String(candidate.id ?? ''))) return String(candidate.id);
  }
  return null;
}

async function record({ req, res, target, before, payload }) {
  const success = res.statusCode < 400;
  if (!success && !AUDIT_FAILURES.has(target.action)) return;

  let actor = req.user ?? null;
  let { entityId } = target;
  let oldData;
  let newData;

  if (target.auth) {
    // Signing in: the user is whoever the response says signed in. The
    // request body holds a password and is never stored - only the email.
    if (target.auth === 'login' || target.auth === 'register') {
      const id = payload?.data?.user?.id;
      if (success && id) actor = await User.findById(id).select('organizationId');
      newData = { email: String(req.body?.email ?? '').slice(0, 254) };
    }
    entityId = actor?.id ?? null;
  } else if (SENSITIVE.has(target.action)) {
    // A password set for someone else: who and whom, never what.
    oldData = undefined;
    newData = undefined;
  } else if (success) {
    entityId ??= idIn(payload?.data);
    const after = await snapshot(target.Model, entityId);
    if (before && after) [oldData, newData] = difference(before, after);
    else if (before) oldData = before;
    else if (after) newData = after;
    // Nothing to compare (no collection behind the route, or the change was to
    // something attached to the record): keep what was sent.
    if (!before && !after) newData = sanitize(req.body);
    else if (before && after && !Object.keys(newData).length && !Object.keys(oldData).length) newData = sanitize(req.body);
  }

  await writeAudit({
    userId: actor?._id,
    organizationId: actor?.organizationId,
    action: target.action,
    entityType: target.entityType,
    entityId: entityId && OBJECT_ID.test(entityId) ? entityId : undefined,
    oldData: oldData && Object.keys(oldData).length ? oldData : undefined,
    newData: newData && Object.keys(newData).length ? newData : undefined,
    ipAddress: req.ip,
    userAgent: String(req.get('user-agent') ?? '').slice(0, 500) || undefined,
    method: req.method,
    path: req.originalUrl.split('?')[0].slice(0, 500),
    statusCode: res.statusCode,
    success,
  });
}

export default async function audit(req, res, next) {
  if (!env.auditEnabled || !MUTATING.has(req.method)) return next();
  // req.path is relative to where this is mounted (the API prefix).
  const target = describeRequest(req.method, req.path, req.body ?? {});
  if (!target) return next();

  // The record as it is before anything touches it. A failure here must not
  // stop the request: the entry is then written without the "before".
  let before = null;
  if (!target.auth && !SENSITIVE.has(target.action)) {
    before = await snapshot(target.Model, target.entityId).catch((err) => {
      logger.warn({ err }, 'Audit: could not read the record before the change');
      return null;
    });
  }

  // Keep what is sent back, to find the id of a record that was just created.
  let payload;
  const json = res.json.bind(res);
  res.json = (body) => {
    payload = body;
    return json(body);
  };

  res.on('finish', () => {
    trackAudit(record({ req, res, target, before, payload }).catch((err) => logger.error({ err, path: req.originalUrl }, 'Audit: failed to record the request')));
  });
  return next();
}
