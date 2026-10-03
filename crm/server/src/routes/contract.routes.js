import { Router } from 'express';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as contractService from '../services/contract.service.js';
import { runReminderCheck } from '../services/contractReminder.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import {
  contractPagingQuery,
  contractStatsQuery,
  contractStatusSchema,
  createContractSchema,
  listContractsQuery,
  updateContractSchema,
} from '../validators/contract.validator.js';

const router = Router();
router.use(authenticate);

const read = requirePermission('contracts.read');

router.get('/', read, validate({ query: listContractsQuery }), async (req, res) => {
  const data = await contractService.listContracts(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.CONTRACTS_LISTED, data });
});
// Counts, values and what is expiring soon. Declared before /:id.
router.get('/stats', read, validate({ query: contractStatsQuery }), async (req, res) => {
  const data = await contractService.getContractStats(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.CONTRACT_STATS, data });
});
// Runs the expiry check now instead of waiting for the next automatic run.
router.post('/reminders/run', requirePermission('contracts.manageSettings'), async (req, res) => {
  const data = await runReminderCheck();
  return sendSuccess(res, { message: MESSAGES.CONTRACT_REMINDERS_RUN, data });
});
router.post('/', requirePermission('contracts.create'), validate({ body: createContractSchema }), async (req, res) => {
  const contract = await contractService.createContract(req.body, req.user);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.CONTRACT_CREATED, data: { contract } });
});
router.get('/:id', read, validate({ params: idParam }), async (req, res) => {
  const contract = await contractService.getContract(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.CONTRACT_RETRIEVED, data: { contract } });
});
router.put('/:id', requirePermission('contracts.update'), validate({ params: idParam, body: updateContractSchema }), async (req, res) => {
  const contract = await contractService.updateContract(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.CONTRACT_UPDATED, data: { contract } });
});
router.delete('/:id', requirePermission('contracts.delete'), validate({ params: idParam }), async (req, res) => {
  await contractService.deleteContract(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.CONTRACT_DELETED });
});
router.patch(
  '/:id/status',
  requirePermission('contracts.update'),
  validate({ params: idParam, body: contractStatusSchema }),
  async (req, res) => {
    const contract = await contractService.changeContractStatus(req.validated.params.id, req.body.statusId, req.user);
    return sendSuccess(res, { message: MESSAGES.CONTRACT_STATUS_UPDATED, data: { contract } });
  }
);

// The reminders sent for this contract, newest first.
router.get('/:id/reminders', read, validate({ params: idParam }), async (req, res) => {
  const data = await contractService.listContractReminders(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.CONTRACT_REMINDERS, data });
});
router.get('/:id/timeline', read, validate({ params: idParam, query: contractPagingQuery }), async (req, res) => {
  const data = await contractService.getContractTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.CONTRACT_TIMELINE, data });
});

// Activities and follow-ups of a contract (expiry reminders are follow-ups):
//   GET /activities?contractId=<id>      GET /followups?relatedType=contract&relatedId=<id>

export default router;
