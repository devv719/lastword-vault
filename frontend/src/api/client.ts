import axios from "axios";

/**
 * Pre-configured Axios instance for LastWord API v1 calls.
 * Base URL routes to /api/v1 so backend endpoints (e.g. /auth/register) resolve to /api/v1/auth/register.
 * Nginx and Vite proxy /api/* seamlessly to the FastAPI backend.
 */
const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach bearer token if available in storage
api.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem("lastword_access_token") ||
      sessionStorage.getItem("lastword_access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: pass through errors for localized or auth context handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If token was revoked or expired, let AuthContext or callers react
    return Promise.reject(error);
  },
);

export default api;
