"use client";

import { useState } from "react";
import { UploadCloud, FileText, X, Minimize2 } from "lucide-react";
import api from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import LoadingOverlay from "./LoadingOverlay";
import SecurityFooter from "./SecurityFooter";

export default function CompressTool() {
  const [file, setFile] = useState<{ name: string; size: number; raw: File } | null>(null);
  const [isProcessing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ original: number; compressed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile({ name: f.name, size: f.size, raw: f });
      setResult(null);
      setError(null);
    }
  };

  const handleCompress = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);

    try {
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file.raw);

      const response = await api.post("/api/pdf/compress", formData, {
        responseType: "blob",
      });

      const originalSize = parseInt(response.headers["x-original-size"] || "0");
      const compressedSize = parseInt(response.headers["x-compressed-size"] || "0");
      setResult({ original: originalSize, compressed: compressedSize });

      // Trigger download
      downloadBlob(response.data as Blob, response.headers["content-disposition"] as string, `compressed_${file.name}`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const detail = errorDetail(err);
      setError(detail ? `[${status}] ${detail}` : "Gagal memproses. Coba lagi.");
    } finally {
      setProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile({ name: f.name, size: f.size, raw: f });
      setResult(null);
      setError(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {isProcessing && <LoadingOverlay />}

      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Minimize2 size={20} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Kompres PDF</h2>
            <p className="text-sm text-slate-500">Kurangi ukuran file untuk sistem dengan batasan ketat</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Upload Area */}
        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Pilih file PDF"
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
            onDrop={(e) => { e.currentTarget.classList.remove("drag-over"); handleDrop(e); }}
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} className="text-emerald-500" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">Pilih file PDF</p>
            <p className="text-slate-500 text-xs">PDF only • Maks 30MB</p>
            <input
              type="file"
              id="compress-file-input"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl mb-6">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <FileText size={20} className="text-red-500" />
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">Ukuran asli: {formatBytes(file.size)}</p>
              </div>
            </div>
            <button
              onClick={() => { setFile(null); setResult(null); setError(null); }}
              aria-label={`Hapus file ${file.name}`}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Result notification */}
        {result && (
          <div role="status" aria-live="polite" className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-800">Berhasil dikompresi!</p>
              <p className="text-xs text-emerald-600">
                {formatBytes(result.original)} → {formatBytes(result.compressed)} (hemat{" "}
                {Math.round((1 - result.compressed / result.original) * 100)}%)
              </p>
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {Math.round((1 - result.compressed / result.original) * 100)}%
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        {/* Action Button */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            {!file ? "⚠️ Pilih file terlebih dahulu" : result ? "✅ Selesai" : "✅ File siap dikompresi"}
          </p>
          {result ? (
            <button
              onClick={() => { setFile(null); setResult(null); setError(null); }}
              className="flex items-center gap-2 bg-white border-2 border-emerald-200 text-emerald-700 px-6 py-2.5 rounded-xl font-semibold hover:bg-emerald-50 transition-all"
            >
              <Minimize2 size={16} />
              Proses Dokumen Lainnya
            </button>
          ) : (
            <button
              onClick={handleCompress}
              disabled={!file}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 disabled:shadow-none"
            >
              <Minimize2 size={16} />
              Kompres & Download
            </button>
          )}
        </div>
      </div>
      <SecurityFooter />
    </div>
  );
}
