import env from '../config/env.js';
import { HTTP_STATUS, MESSAGES, PRODUCT_STATUS } from '../constants/index.js';
import Organization from '../models/Organization.js';
import Product from '../models/Product.js';
import ProductCategory from '../models/ProductCategory.js';
import Tax from '../models/Tax.js';
import Unit from '../models/Unit.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerLeadConfigUsage } from './leadConfig.service.js';
import { formatCode, nextSequence } from './sequence.service.js';
import { getSettings } from './settings.service.js';

const SEQUENCE = 'product';
// How many numbers to try when generated SKUs collide with ones entered by hand.
const MAX_SKU_ATTEMPTS = 50;

const POPULATE = [
  { path: 'categoryId', select: 'name skuPrefix isActive' },
  { path: 'unitId', select: 'name symbol isActive' },
  { path: 'taxId', select: 'name rate isActive' },
  { path: 'organizationId', select: 'name' },
  // The creator may since have been deleted; their name should still show.
  { path: 'createdBy', select: 'firstName lastName email', options: { withDeleted: true } },
];

const SEARCH_FIELDS = ['sku', 'name', 'description'];
const FILTER_FIELDS = ['categoryId', 'unitId', 'taxId', 'organizationId', 'status'];

// Optional plain fields: '' or null clears the stored value.
const OPTIONAL_FIELDS = ['description', 'costPrice', 'image'];

// Reference fields, the list each points into, and the error when unusable.
const REFERENCES = [
  { field: 'categoryId', Model: ProductCategory, message: MESSAGES.PRODUCT_CATEGORY_NOT_FOUND },
  { field: 'unitId', Model: Unit, message: MESSAGES.PRODUCT_UNIT_NOT_FOUND },
  { field: 'taxId', Model: Tax, message: MESSAGES.PRODUCT_TAX_NOT_FOUND },
  { field: 'organizationId', Model: Organization, message: MESSAGES.ORGANIZATION_NOT_FOUND },
];
const REFERENCE_FIELDS = REFERENCES.map((reference) => reference.field);

// A category, unit or tax that products use can only be deactivated, not deleted.
registerLeadConfigUsage('productCategories', (categoryId) => Product.countDocuments({ categoryId }));
registerLeadConfigUsage('units', (unitId) => Product.countDocuments({ unitId }));
registerLeadConfigUsage('taxes', (taxId) => Product.countDocuments({ taxId }));

// --- helpers -----------------------------------------------------------------

const empty = (value) => value === undefined || value === null || value === '';
const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');

async function findProduct(id) {
  const product = await Product.findById(id).populate(POPULATE);
  if (!product) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);
  return product;
}

async function assertReferencesUsable(values) {
  for (const { field, Model, message } of REFERENCES) {
    if (values[field] && !(await Model.exists({ _id: values[field], isActive: true }))) {
      throw ApiError.badRequest(message, [{ field, message }]);
    }
  }
}

// SKUs are unique for ever: one held by a deleted product is still taken.
function skuTaken(sku) {
  return Product.exists({ sku }).setOptions({ withDeleted: true });
}

// Generates the next free SKU: <prefix>-<number>, with the category's prefix
// when it has one. Numbers that collide with a hand-entered SKU are skipped.
async function generateSku(categoryId) {
  const category = categoryId ? await ProductCategory.findById(categoryId).select('skuPrefix') : null;
  const prefix = category?.skuPrefix || env.productSku.prefix;

  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt += 1) {
    const sku = formatCode(prefix, await nextSequence(SEQUENCE), env.productSku.digits);
    if (!(await skuTaken(sku))) return sku;
  }
  throw ApiError.conflict(MESSAGES.PRODUCT_SKU_EXHAUSTED);
}

function applyOptional(product, input) {
  for (const field of OPTIONAL_FIELDS) {
    if (field in input) product[field] = empty(input[field]) ? undefined : input[field];
  }
}

// --- operations --------------------------------------------------------------

export async function listProducts(query) {
  const { page, limit, search, sortBy, sortOrder, minPrice, maxPrice } = query;

  if (!empty(minPrice) && !empty(maxPrice) && minPrice > maxPrice) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [
      { field: 'minPrice', message: MESSAGES.PRICE_RANGE_INVALID },
    ]);
  }

  const filter = { ...searchFilter(search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  // Price range is on the selling price, bounds included.
  if (!empty(minPrice) || !empty(maxPrice)) {
    filter.basePrice = {
      ...(empty(minPrice) ? {} : { $gte: minPrice }),
      ...(empty(maxPrice) ? {} : { $lte: maxPrice }),
    };
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Product.countDocuments(filter),
  ]);

  return { products, pagination: paginationMeta({ page, limit }, total) };
}

export function getProduct(id) {
  return findProduct(id);
}

// What a product picker needs: enough to choose a product and price a line.
// Only active products are offered unless one is asked for by id.
export async function listProductOptions({ search, id, limit }) {
  const filter = id ? { _id: id } : { status: PRODUCT_STATUS.ACTIVE, ...searchFilter(search, ['sku', 'name']) };
  const products = await Product.find(filter)
    .select('sku name basePrice unitId taxId status')
    .sort({ name: 1, _id: 1 })
    .collation({ locale: 'en', strength: 2 })
    .limit(limit)
    .populate([
      { path: 'unitId', select: 'name symbol' },
      { path: 'taxId', select: 'name rate' },
    ]);

  return products.map((product) => {
    const { id: productId, sku, name, basePrice, status, unit, tax } = product.toJSON();
    return { id: productId, sku, name, basePrice, status, unit: unit ?? null, tax: tax ?? null };
  });
}

// Says whether a SKU could be used for a new product, in its stored form.
export async function checkSku(sku) {
  return { sku, available: !(await skuTaken(sku)) };
}

export async function createProduct(sent, actor) {
  // No tax mentioned at all: the default tax (Settings -> Sales). An explicit
  // empty value means "no tax" and is respected.
  const defaultTaxId = 'taxId' in sent ? null : (await getSettings()).sales.defaultTaxId;
  const input = defaultTaxId && (await Tax.exists({ _id: defaultTaxId, isActive: true })) ? { ...sent, taxId: defaultTaxId } : sent;
  await assertReferencesUsable(input);
  if (input.sku && (await skuTaken(input.sku))) {
    throw ApiError.conflict(MESSAGES.PRODUCT_SKU_TAKEN, [{ field: 'sku', message: MESSAGES.PRODUCT_SKU_TAKEN }]);
  }

  const product = new Product({
    name: input.name,
    basePrice: input.basePrice,
    status: input.status,
    createdBy: actor.id,
  });
  for (const field of REFERENCE_FIELDS) product[field] = input[field] || undefined;
  applyOptional(product, input);

  // A number is taken last, after everything that can fail.
  product.sku = input.sku || (await generateSku(input.categoryId));

  try {
    await product.save();
  } catch (err) {
    // Two requests can race for the same hand-entered SKU; the unique index decides.
    if (err?.code === 11000) {
      throw ApiError.conflict(MESSAGES.PRODUCT_SKU_TAKEN, [{ field: 'sku', message: MESSAGES.PRODUCT_SKU_TAKEN }]);
    }
    throw err;
  }
  return findProduct(product.id);
}

export async function updateProduct(id, input) {
  const product = await findProduct(id);

  // Only references that are actually changing need to be active: a product
  // keeps a category, unit or tax that was later deactivated.
  const changed = Object.fromEntries(
    REFERENCE_FIELDS.filter((field) => input[field] && input[field] !== idOf(product[field])).map((field) => [
      field,
      input[field],
    ])
  );
  await assertReferencesUsable(changed);

  if (input.name) product.name = input.name;
  if (!empty(input.basePrice)) product.basePrice = input.basePrice;
  if (input.status) product.status = input.status;
  for (const field of REFERENCE_FIELDS) {
    if (field in input) product[field] = input[field] || undefined;
  }
  applyOptional(product, input);

  await product.save();
  return findProduct(id);
}

export async function deleteProduct(id) {
  const product = await findProduct(id);
  product.deletedAt = new Date();
  await product.save();
}
