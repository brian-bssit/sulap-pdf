"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { redirectToLogin } from "@/lib/session";
import { t } from "@/lib/strings";

const STORAGE_KEY = "sulap:last-activity"; // dibagi antar-tab: aktif di satu tab menjaga tab lain
const PING_EVERY_MS = 20_000; // < jeda tulis server (30 dtk) + kelonggaran server (60 dtk)
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "sulap:activity"];

function sharedActivity(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Memaksa keluar setelah `timeoutSeconds` tanpa aktivitas (checklist keamanan: 10 menit). Peringatan muncul sebelum
 * waktunya; "Tetap masuk" atau aktivitas apa pun memperpanjang. Aktivitas dikirim ke server (ping) agar sesi server
 * tidak lebih dulu habis. Server tetap menolak sesi idle sebagai pengaman cadangan.
 */
export default function IdleGuard({ timeoutSeconds }: { timeoutSeconds: number }) {
  const warnBefore = Math.min(60, Math.floor(timeoutSeconds / 3));
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const loggingOut = useRef(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const dialogOpen = useRef(false);
  dialogOpen.current = remaining !== null;

  const ping = useCallback(() => {
    lastPing.current = Date.now();
    fetch("/api/auth/ping", { method: "POST", credentials: "include" })
      .then((r) => {
        if (r.status === 401) redirectToLogin(r.headers.get("x-auth-reason"));
      })
      .catch(() => {});
  }, []);

  const mark = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    try {
      localStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      /* penyimpanan diblokir: tetap jalan per-tab */
    }
    if (now - lastPing.current >= PING_EVERY_MS) ping();
  }, [ping]);

  const logout = useCallback(async (idle: boolean) => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    await fetch(`/api/auth/logout${idle ? "?reason=idle" : ""}`, { method: "POST", credentials: "include" }).catch(() => {});
    window.location.assign(idle ? "/?error=session_idle" : "/");
  }, []);

  useEffect(() => {
    mark();
    // Saat peringatan tampil, hanya tombol "Tetap masuk" (atau operasi yang sedang berjalan) yang memperpanjang sesi;
    // gerakan pointer biasa tidak, supaya dialog tidak lenyap di tengah klik dan keputusan tetap disengaja.
    const onActivity = (e: Event) => {
      if (dialogOpen.current && e.type !== "sulap:activity") return;
      mark();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    const timer = window.setInterval(() => {
      const idleMs = Date.now() - Math.max(lastActivity.current, sharedActivity());
      const left = timeoutSeconds * 1000 - idleMs;
      if (left <= 0) void logout(true);
      else if (left <= warnBefore * 1000) setRemaining(Math.ceil(left / 1000));
      else setRemaining(null);
    }, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      window.clearInterval(timer);
    };
  }, [mark, logout, timeoutSeconds, warnBefore]);

  useEffect(() => {
    if (remaining !== null) stayRef.current?.focus();
  }, [remaining === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (remaining === null) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 glass-effect p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-desc"
        className="bg-white rounded-2xl shadow-2xl p-6 w-[min(26rem,100%)] border border-slate-100"
      >
        <h2 id="idle-title" className="text-lg font-bold text-slate-800 mb-2">{t.idle.title}</h2>
        <p id="idle-desc" role="timer" className="text-sm text-slate-600 mb-5">{t.idle.body(remaining)}</p>
        <div className="flex flex-wrap gap-3 justify-end">
          <button
            onClick={() => void logout(false)}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
          >
            {t.idle.logoutNow}
          </button>
          <button
            ref={stayRef}
            onClick={() => { mark(); ping(); lastActivity.current = Date.now(); setRemaining(null); }}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/30 transition-colors"
          >
            {t.idle.stay}
          </button>
        </div>
      </div>
    </div>
  );
}
