"use client";

import { useState } from "react";
import { UploadCloud, FileText, X, FileUp } from "lucide-react";
import api from "@/lib/api";
import LoadingOverlay from "./LoadingOverlay";
import SecurityFooter from "./SecurityFooter";

const ACCEPT_TYPES = [
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".odt", ".ods", ".odp", ".rtf", ".txt", ".html", ".htm", ".csv", ".xml",
].join(",");

function formatBytes(bytes: number): string {
  if (!bytes) return "0 Bytes";
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

function getFileIcon(ext: string): string {
  const map: Record<string, string> = {
    ".doc": "📝", ".docx": "📝", ".xls": "📊", ".xlsx": "📊",
    ".ppt": "📽️", ".pptx": "📽️", ".odt": "📝", ".ods": "📊", ".odp": "📽️",
    ".rtf": "📄", ".txt": "📄", ".html": "🌐", ".htm": "🌐", ".csv": "📊", ".xml": "📄",
  };
  return map[ext] || "📄";
}

export default function ConvertTool() {
  const [file, setFile] = useState<{ name: string; size: number; ext: string; raw: File } | null>(null);
  const [isProcessing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ original: number; converted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      setFile({ name: f.name, size: f.size, ext, raw: f });
      setResult(null);
      setError(null);
    }
  };

  const handleConvert = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file.raw);

      const response = await api.post("/api/pdf/convert", formData, {
        responseType: "blob",
      });

      const originalSize = parseInt(response.headers["x-original-size"] || "0");
      const convertedSize = parseInt(response.headers["x-converted-size"] || "0");
      setResult({ original: originalSize, converted: convertedSize });

      const stem = file.name.replace(/\.[^/.]+$/, "");
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${stem}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      let msg = "Gagal memproses. Coba lagi.";
      if (err && typeof err === "object" && "response" in err) {
        const r = (err as { response: { status: number; data: Blob } }).response;
        try {
          const txt = await r.data.text();
          msg = `[${r.status}] ${txt}`;
        } catch {
          msg = `[${r.status}] Gagal membaca error`;
        }
      }
      setError(msg);
    } finally {
      setProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      setFile({ name: f.name, size: f.size, ext, raw: f });
      setResult(null);
      setError(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {isProcessing && <LoadingOverlay />}

      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-violet-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <FileUp size={20} className="text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Konversi ke PDF</h2>
            <p className="text-sm text-slate-500">Ubah dokumen apapun menjadi PDF — DOCX, XLSX, PPTX, ODT, dan lainnya</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Upload Area */}
        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Pilih file dokumen"
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-violet-400 hover:bg-violet-50/30 transition-all cursor-pointer mb-6 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
            onClick={() => document.getElementById("convert-file-input")?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("convert-file-input")?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
            onDrop={(e) => { e.currentTarget.classList.remove("drag-over"); handleDrop(e); }}
          >
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} className="text-violet-500" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">Pilih file dokumen</p>
            <p className="text-slate-500 text-xs">
              DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP, RTF, TXT, HTML, CSV, XML • Maks 30MB
            </p>
            <input
              type="file"
              id="convert-file-input"
              accept={ACCEPT_TYPES}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl mb-6">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-lg">
                {getFileIcon(file.ext)}
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {file.ext.toUpperCase().replace(".", "")} • {formatBytes(file.size)}
                </p>
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
          <div role="status" aria-live="polite" className="mb-4 p-4 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-violet-800">Berhasil dikonversi!</p>
              <p className="text-xs text-violet-600">
                {formatBytes(result.original)} → {formatBytes(result.converted)}
              </p>
            </div>
            <FileText size={24} className="text-violet-500" />
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
            {!file ? "⚠️ Pilih file terlebih dahulu" : result ? "✅ Selesai" : "✅ File siap dikonversi"}
          </p>
          {result ? (
            <button
              onClick={() => { setFile(null); setResult(null); setError(null); }}
              className="flex items-center gap-2 bg-white border-2 border-violet-200 text-violet-700 px-6 py-2.5 rounded-xl font-semibold hover:bg-violet-50 transition-all"
            >
              <FileUp size={16} />
              Proses Dokumen Lainnya
            </button>
          ) : (
            <button
              onClick={handleConvert}
              disabled={!file}
              className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20 disabled:shadow-none"
            >
              <FileUp size={16} />
              Konversi & Download
            </button>
          )}
        </div>
      </div>
      <SecurityFooter />
    </div>
  );
}
