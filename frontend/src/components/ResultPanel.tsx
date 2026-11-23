"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/strings";
import type { JobResult } from "@/lib/useJob";
import PdfPreview from "./PdfPreview";

/** Hasil pemrosesan: pratinjau halaman pertama + tombol Unduh. Unduhan baru terjadi saat user menekan tombol. */
export default function ResultPanel({
  result, title, children, onReset, accent = "emerald",
}: {
  result: JobResult;
  title: string;
  children?: ReactNode;
  onReset: () => void;
  accent?: "emerald" | "blue" | "amber" | "purple" | "indigo" | "violet";
}) {
  const ring = { emerald: "border-emerald-200 bg-emerald-50", blue: "border-blue-200 bg-blue-50", amber: "border-amber-200 bg-amber-50", purple: "border-purple-200 bg-purple-50", indigo: "border-indigo-200 bg-indigo-50", violet: "border-violet-200 bg-violet-50" }[accent];
  const btn = { emerald: "from-emerald-600 to-teal-600", blue: "from-blue-600 to-indigo-600", amber: "from-amber-600 to-orange-700", purple: "from-purple-600 to-indigo-600", indigo: "from-indigo-600 to-blue-600", violet: "from-violet-600 to-purple-600" }[accent];
  return (
    <section aria-label={t.result.ready} className={`mb-6 p-4 rounded-xl border ${ring}`}>
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="sm:w-[260px] flex-shrink-0">
          <PdfPreview blob={result.blob} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div role="status" aria-live="polite" className="flex items-start gap-2">
            <CheckCircle2 size={20} className="text-emerald-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{title}</p>
              <p className="text-xs text-slate-600 break-all">{result.filename} • {formatBytes(result.blob.size)}</p>
              {children && <div className="text-xs text-slate-600 mt-1">{children}</div>}
            </div>
          </div>
          <div className="mt-4 sm:mt-auto flex flex-wrap items-center gap-3">
            <button
              onClick={() => downloadBlob(result.blob, undefined, result.filename)}
              className={`flex items-center gap-2 bg-gradient-to-r ${btn} text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-slate-900/10 hover:brightness-110 transition`}
            >
              <Download size={16} aria-hidden="true" />
              {t.result.download}
            </button>
            <button onClick={onReset} className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors">
              {t.common.processAnother}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
