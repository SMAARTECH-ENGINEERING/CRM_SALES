import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as productService from '../services/product.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listProducts(req, res) {
  const data = await productService.listProducts(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PRODUCTS_LISTED, data });
}

export async function listProductOptions(req, res) {
  const products = await productService.listProductOptions(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PRODUCT_OPTIONS, data: { products } });
}

export async function checkSku(req, res) {
  const data = await productService.checkSku(req.validated.query.sku);
  return sendSuccess(res, { message: MESSAGES.PRODUCT_SKU_CHECKED, data });
}

export async function getProduct(req, res) {
  const product = await productService.getProduct(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.PRODUCT_RETRIEVED, data: { product } });
}

export async function createProduct(req, res) {
  const product = await productService.createProduct(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.PRODUCT_CREATED,
    data: { product },
  });
}

export async function updateProduct(req, res) {
  const product = await productService.updateProduct(req.validated.params.id, req.body);
  return sendSuccess(res, { message: MESSAGES.PRODUCT_UPDATED, data: { product } });
}

export async function deleteProduct(req, res) {
  await productService.deleteProduct(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.PRODUCT_DELETED });
}
