import axios from 'axios';
import { useSession } from './stores/session';

export const api = axios.create({ baseURL: '/api' });

// Stand-in auth: send the demo user's id (see server/src/middleware/auth.js).
api.interceptors.request.use((config) => {
  const { userId } = useSession();
  if (userId) config.headers['x-user-id'] = userId;
  return config;
});

/** { field: message } map from a 422 response, or {}. */
export const fieldErrors = (err) => err.response?.data?.fields ?? {};
export const errorMessage = (err) =>
  err.response?.data?.error ?? 'We could not reach the server. Please check your connection and try again.';
