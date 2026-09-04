// Amankan pesan error API: interceptor sudah parse blob error → {detail}, JSON
// biasa tetap {detail}. 422 FastAPI bisa kirim detail array — jadikan string.
export function errorDetail(err: unknown): string | null {
  const data = (err as { response?: { data?: unknown } } | undefined)?.response?.data;
  if (!data || typeof data !== "object") return null;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail == null) return null;
  return JSON.stringify(detail);
}
