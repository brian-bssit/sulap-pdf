"use client";

import { t } from "@/lib/strings";
import { useCallback, useEffect, useState } from "react";

const GOOGLE_CLIENT_SCRIPT = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const [authError, setAuthError] = useState<string | null>(null);

  const handleCredential = useCallback(async (credential: string) => {
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credential }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setAuthError(data?.detail || t.login.failed);
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setAuthError(t.login.network);
    }
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setAuthError(t.login.errors[code] ?? t.login.failed);
  }, []);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = GOOGLE_CLIENT_SCRIPT;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    const init = () => {
      const gsi = window.google?.accounts?.id;
      if (!gsi) {
        setTimeout(init, 400);
        return;
      }
      fetch("/api/auth/google/config")
        .then((r) => r.json())
        .then((cfg) => {
          if (!cfg.client_id) return;
          gsi.initialize({
            client_id: cfg.client_id,
            callback: (resp) => {
              if (resp?.credential) handleCredential(resp.credential);
            },
            auto_select: false,
            cancel_on_tap_outside: false,
          });
          const el = document.getElementById("google-button");
          if (el) {
            gsi.renderButton(el, {
              type: "standard",
              shape: "rectangular",
              theme: "outline",
              text: "sign_in_with",
              size: "large",
              logo_alignment: "left",
            });
          }
        })
        .catch(() => {});
    };
    init();
  }, [handleCredential]);

  return (
    <div
      className="min-h-screen flex justify-center items-center p-6"
      style={{ background: "linear-gradient(135deg, #0F1F4B, #183A82)" }}
    >
      <div
        className="w-full rounded-3xl shadow-2xl"
        style={{ maxWidth: 440, background: "#FBFBFA", boxShadow: "0 25px 60px rgba(0,0,0,.25)" }}
      >
        <div className="px-8 py-6 sm:px-10 sm:py-8">
          {/* Logo + SULAP */}
          <main className="flex flex-col items-center justify-center mb-6">
            <img src="/bss-logo.png" alt={t.login.bank} className="h-36 w-auto mb-1" />
            <h1 className="text-[36px] font-bold text-[#0F2D6C]">{t.app.name}</h1>
            <p className="text-sm text-[#5E6980] mt-2 text-center">{t.app.tagline}</p>
          </main>

          {/* Google Sign-In (GIS-rendered button) */}
          <div id="google-button" className="flex justify-center" />

          {authError && (
            <p role="alert" className="mt-3 text-center text-sm font-semibold text-[#D63031]">
              {authError}
            </p>
          )}

          {/* Security Notice */}
          <div
            className="mt-8 rounded-2xl p-6 text-center"
            style={{ background: "#F7FAFF", border: "1px solid #DCE5F5" }}
          >
            <h3 className="text-[#17397D] mb-3 text-base font-bold">
              {t.login.noticeTitle}
            </h3>
            <p className="text-[#5E6980] leading-relaxed text-sm">{t.security.body}</p>
            <strong className="block mt-4 text-[#D63031] text-base">{t.security.slogan}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
