import axiosClient from './axiosClient.js';

// The signed-in user's own interface preferences, kept in their account.
export const getPreferences = ({ signal } = {}) => axiosClient.get('/auth/preferences', { signal });

// Merges: only the keys sent change; null puts one back to its default.
export const updatePreferences = (changes) => axiosClient.put('/auth/preferences', changes);
