import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 300_000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === "object" && "success" in res.data && "data" in res.data) {
      res.data = res.data.data;
    }
    return res;
  },
  (err) => {
    console.error("[API]", err?.response?.status, err?.config?.url);
    return Promise.reject(err);
  }
);

export default api;
