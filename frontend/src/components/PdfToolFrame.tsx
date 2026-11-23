"use client";

import { useRef, useState, type ReactNode } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/strings";
import { useJob, type JobResult } from "@/lib/useJob";
import LoadingOverlay from "./LoadingOverlay";
import ResultPanel from "./ResultPanel";
import SecurityFooter from "./SecurityFooter";

/** Kerangka tool satu-PDF: pilih file → opsi (children) → proses → hasil. Tool hanya menyediakan opsi & FormData. */
export default function PdfToolFrame({
  title, subtitle, icon, endpoint, buildForm, fallbackName, canRun, actionLabel, doneTitle,
  resultNote, downloadLabel, preview = true, onReset, children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  endpoint: string;
  buildForm: (file: File) => FormData;
  fallbackName: (file: File) => string;
  canRun: boolean;
  actionLabel: string;
  doneTitle: string;
  resultNote?: (r: JobResult) => ReactNode;
  downloadLabel?: string;
  preview?: boolean;
  onReset?: () => void; // dipanggil saat file dibuang / proses ulang (mis. kosongkan password)
  children?: ReactNode;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const job = useJob();

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f); job.reset(); setError(null);
  };
  const reset = () => { setFile(null); job.reset(); setError(null); onReset?.(); };

  const run = async () => {
    if (!file) return;
    setError(null);
    try {
      await job.run(endpoint, buildForm(file), fallbackName(file));
      onReset?.();
    } catch (err: unknown) {
      setError(errorDetail(err) ?? t.common.retry);
    }
  };

  const result = job.result;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {job.busy && <LoadingOverlay phase={job.phase} percent={job.percent} />}

      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600" aria-hidden="true">{icon}</div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {!file ? (
          <div
            role="button"
            tabIndex={0}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer mb-6 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-over"); pick(e.dataTransfer.files[0]); }}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} className="text-blue-500" aria-hidden="true" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">{t.tool.choose}</p>
            <p className="text-slate-500 text-xs">{t.common.pdfOnlyMax(30)}</p>
            <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-blue-50/60 border border-blue-200 rounded-xl mb-6">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                <FileText size={20} className="text-red-500" aria-hidden="true" />
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{t.common.originalSize(formatBytes(file.size))}</p>
              </div>
            </div>
            <button onClick={reset} aria-label={t.common.removeFile(file.name)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {file && !result && <div className="mb-6">{children}</div>}

        {result && (
          <ResultPanel result={result} title={doneTitle} onReset={reset} accent="blue" preview={preview} downloadLabel={downloadLabel}>
            {resultNote?.(result)}
          </ResultPanel>
        )}

        {error && (
          <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        {!result && (
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">{file ? t.tool.ready : t.common.chooseFirst}</p>
            <button
              onClick={run}
              disabled={!file || !canRun}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 disabled:shadow-none"
            >
              {actionLabel}
            </button>
          </div>
        )}
      </div>
      <SecurityFooter />
    </div>
  );
}
