import axiosClient from './axiosClient.js';

// Global search. `params`: { q, limit }. The response holds one list per
// category - companies, contacts, leads, ... - of { id, type, title, subtitle }.
export const searchAll = (params, { signal } = {}) => axiosClient.get('/search', { params, signal });
