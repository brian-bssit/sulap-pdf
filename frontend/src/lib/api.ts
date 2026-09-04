import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
  timeout: 600_000, // 10 menit
  withCredentials: true,
});

// Force-delete Content-Type for FormData — browser must set multipart boundary
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

// Response interceptor:
//  1. Redirect ke /login saat sesi mati (401), kecuali request login itu sendiri.
//  2. Blob error response (responseType:"blob") punya data Blob, bukan JSON —
//     parse ke object {detail} supaya pemanggil bisa baca pesan error backend.
api.interceptors.response.use(
  (response) => response,
  async (error: { config?: { url?: string; responseType?: string }; response?: { status?: number; data?: unknown } }) => {
    const { config, response } = error;
    if (response) {
      const url = config?.url ?? "";
      if (response.status === 401 && !url.includes("/api/auth/")) {
        const path = typeof window !== "undefined" ? window.location.pathname : "";
        if (!path.startsWith("/login")) {
          window.location.assign("/login");
        }
      }
      if (config?.responseType === "blob" && response.data instanceof Blob) {
        try {
          response.data = JSON.parse(await response.data.text());
        } catch {
          // Bukan JSON (mis. error proxy HTML) — biarkan Blob.
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
