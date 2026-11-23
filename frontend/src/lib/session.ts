// Alasan sesi berakhir (header `X-Auth-Reason` dari server) → parameter halaman login.
const REASON_TO_ERROR: Record<string, string> = {
  SESSION_IDLE: "session_idle",
  SESSION_REPLACED: "session_replaced",
  SESSION_INVALID: "session_invalid",
};

/** Arahkan ke halaman login (di "/"), membawa alasan bila diketahui. Tidak melakukan apa pun bila sudah di sana. */
export function redirectToLogin(reason?: string | null): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path === "/" || path.startsWith("/login")) return;
  const code = reason ? REASON_TO_ERROR[reason] : undefined;
  window.location.assign(code ? `/?error=${code}` : "/");
}
