import { Router } from 'express';
import * as product from '../controllers/product.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import {
  createProductSchema,
  listProductsQuery,
  productOptionsQuery,
  skuCheckQuery,
  updateProductSchema,
} from '../validators/product.validator.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('products.read'), validate({ query: listProductsQuery }), product.listProducts);

// Static paths are declared before /:id so they are not read as an id.

// Products for pickers on other screens. Modules that put products on their
// records (quotations, orders, ...) add their permissions to this list.
router.get(
  '/options',
  authorize('products.read', 'quotations.create', 'quotations.update', 'orders.create', 'orders.update'),
  validate({ query: productOptionsQuery }),
  product.listProductOptions
);
// Lets the product form say whether a hand-entered SKU is free before saving.
router.get(
  '/sku-check',
  authorize('products.create', 'products.update'),
  validate({ query: skuCheckQuery }),
  product.checkSku
);

router.post('/', requirePermission('products.create'), validate({ body: createProductSchema }), product.createProduct);
router.get('/:id', requirePermission('products.read'), validate({ params: idParam }), product.getProduct);
router.put(
  '/:id',
  requirePermission('products.update'),
  validate({ params: idParam, body: updateProductSchema }),
  product.updateProduct
);
router.delete('/:id', requirePermission('products.delete'), validate({ params: idParam }), product.deleteProduct);

export default router;
