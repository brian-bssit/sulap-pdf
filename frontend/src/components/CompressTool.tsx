"use client";

import { useState } from "react";
import { UploadCloud, FileText, X, Minimize2 } from "lucide-react";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/strings";
import { useJob } from "@/lib/useJob";
import LoadingOverlay from "./LoadingOverlay";
import ResultPanel from "./ResultPanel";
import SecurityFooter from "./SecurityFooter";

type Level = "low" | "balanced" | "high";
const LEVELS: Level[] = ["low", "balanced", "high"];

export default function CompressTool() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<Level>("high");
  const [error, setError] = useState<string | null>(null);
  const job = useJob();

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    job.reset();
    setError(null);
  };

  const reset = () => { setFile(null); job.reset(); setError(null); };

  const handleCompress = async () => {
    if (!file) return;
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("level", level);
      await job.run("/api/pdf/compress", form, `compressed_${file.name}`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const detail = errorDetail(err);
      setError(detail ? t.common.failedWithStatus(status, detail) : t.common.retry);
    }
  };

  const result = job.result;
  const original = file?.size ?? 0;
  const compressed = result?.blob.size ?? 0;
  const unchanged = result?.headers["x-compression"] === "unchanged";
  const pct = original ? Math.round((1 - compressed / original) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {job.busy && <LoadingOverlay phase={job.phase} percent={job.percent} />}

      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Minimize2 size={20} className="text-emerald-600" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{t.compress.title}</h2>
            <p className="text-sm text-slate-500">{t.compress.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Upload Area */}
        {!file ? (
          <div
            role="button"
            tabIndex={0}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-emerald-400 hover:bg-emerald-50/30 transition-all cursor-pointer mb-6 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            onClick={() => document.getElementById("compress-file-input")?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("compress-file-input")?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-over"); pick(e.dataTransfer.files[0]); }}
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} className="text-emerald-500" aria-hidden="true" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">{t.compress.choose}</p>
            <p className="text-slate-500 text-xs">{t.common.pdfOnlyMax(30)}</p>
            <input
              type="file"
              id="compress-file-input"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl mb-6">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                <FileText size={20} className="text-red-500" aria-hidden="true" />
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{t.common.originalSize(formatBytes(file.size))}</p>
              </div>
            </div>
            <button
              onClick={reset}
              aria-label={t.common.removeFile(file.name)}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Level */}
        {file && !result && (
          <fieldset className="mb-6">
            <legend className="text-sm font-semibold text-slate-700 mb-2">{t.compress.levelLegend}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {LEVELS.map((l) => (
                <label
                  key={l}
                  className={`flex flex-col gap-0.5 p-3 rounded-xl border cursor-pointer transition-colors focus-within:ring-4 focus-within:ring-emerald-500/20 ${
                    level === l ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="compress-level"
                      value={l}
                      checked={level === l}
                      onChange={() => setLevel(l)}
                      className="accent-emerald-600"
                    />
                    {t.compress.levels[l].label}
                  </span>
                  <span className="text-xs text-slate-600 pl-6">{t.compress.levels[l].hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* Hasil */}
        {result && (
          <ResultPanel result={result} title={unchanged ? t.compress.unchangedTitle : t.compress.reducedTitle} onReset={reset} accent="emerald">
            {unchanged ? t.compress.unchanged : t.compress.reduced(formatBytes(original), formatBytes(compressed), pct)}
          </ResultPanel>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        {/* Action Button */}
        {!result && (
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">{file ? t.compress.ready : t.common.chooseFirst}</p>
            <button
              onClick={handleCompress}
              disabled={!file}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 disabled:shadow-none"
            >
              <Minimize2 size={16} aria-hidden="true" />
              {t.compress.action}
            </button>
          </div>
        )}
      </div>
      <SecurityFooter />
    </div>
  );
}
