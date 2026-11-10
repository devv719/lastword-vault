import axios from "axios";
import toast from "react-hot-toast";

/** Pre-configured Axios instance for LastWord API calls. */
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Response interceptor: surface errors via toast
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail || error.message || "An error occurred";

    // Don't toast on 401 — the auth context handles those
    if (error.response?.status !== 401) {
      toast.error(message);
    }

    return Promise.reject(error);
  },
);

export default api;

