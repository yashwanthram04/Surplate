import axios from 'axios';

// Same-origin requests: the login cookie travels automatically (it is httpOnly, so JavaScript never sees it).
export const api = axios.create({ baseURL: '/api' });

/** { field: message } map from a 422/409 response, or {}. */
export const fieldErrors = (err) => err.response?.data?.fields ?? {};
export const errorMessage = (err) =>
  err.response?.data?.error ?? 'We could not reach the server. Please check your connection and try again.';
