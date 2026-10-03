import { Router } from 'express';
import * as contactController from '../controllers/contact.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import {
  contactOptionsQuery,
  createContactSchema,
  listContactsQuery,
  updateContactSchema,
} from '../validators/contact.validator.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission('contacts.read'),
  validate({ query: listContactsQuery }),
  contactController.listContacts
);
// Names for contact pickers. Declared before /:id so "options" is not read as an id.
router.get(
  '/options',
  authorize(
    'contacts.read',
    'leads.read',
    'leads.create',
    'leads.update',
    'opportunities.create',
    'opportunities.update',
    'quotations.create',
    'quotations.update',
    'orders.create',
    'orders.update',
    'customers.create',
    'customers.update',
    'tickets.create',
    'tickets.update'
  ),
  validate({ query: contactOptionsQuery }),
  contactController.listContactOptions
);
router.post(
  '/',
  requirePermission('contacts.create'),
  validate({ body: createContactSchema }),
  contactController.createContact
);
router.get(
  '/:id',
  requirePermission('contacts.read'),
  validate({ params: idParam }),
  contactController.getContact
);
router.put(
  '/:id',
  requirePermission('contacts.update'),
  validate({ params: idParam, body: updateContactSchema }),
  contactController.updateContact
);
router.delete(
  '/:id',
  requirePermission('contacts.delete'),
  validate({ params: idParam }),
  contactController.deleteContact
);

export default router;
