import axiosClient from './axiosClient.js';

export function listProducts(params, { signal } = {}) {
  return axiosClient.get('/products', { params, signal });
}

// Active products for pickers: { search, limit }, or { id } for one product.
export function listProductOptions(params, { signal } = {}) {
  return axiosClient.get('/products/options', { params, signal });
}

// -> { sku (as it would be stored), available }
export function checkSku(sku, { signal } = {}) {
  return axiosClient.get('/products/sku-check', { params: { sku }, signal });
}

export function getProduct(id, { signal } = {}) {
  return axiosClient.get(`/products/${id}`, { signal });
}

export function createProduct(data) {
  return axiosClient.post('/products', data);
}

export function updateProduct(id, data) {
  return axiosClient.put(`/products/${id}`, data);
}

export function deleteProduct(id) {
  return axiosClient.delete(`/products/${id}`);
}
