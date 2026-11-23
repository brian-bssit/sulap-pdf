import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { t } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${t.app.name} — ${t.app.tagline}`,
  description: `${t.app.name} — ${t.app.tagline}. ${t.app.internal}.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-slate-50">{children}</body>
    </html>
  );
}
