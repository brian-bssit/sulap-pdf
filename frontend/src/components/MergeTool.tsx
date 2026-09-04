"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, Trash2, GripVertical, Layers } from "lucide-react";
import api from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import LoadingOverlay from "./LoadingOverlay";
import SecurityFooter from "./SecurityFooter";

interface MergeFile {
  id: string;
  name: string;
  size: number;
  file: File;
}

export default function MergeTool() {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isProcessing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    if (files.length + arr.length > 10) {
      setError("Maksimal 10 file");
      return;
    }
    setFiles((prev) => [
      ...prev,
      ...arr.map((f) => ({ id: Math.random().toString(36).slice(2), name: f.name, size: f.size, file: f })),
    ]);
    setError(null);
    setSuccess(false);
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // dragIdx via ref: banyak event dragover bisa menumpuk dlm satu frame — state
  // closure basi bikin urutan salah. Ref baca nilai terkini, state hanya utk styling.
  const dragIdxRef = useRef<number | null>(null);

  const onDragStart = (idx: number) => {
    dragIdxRef.current = idx;
    setDragIdx(idx);
  };

  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragIdxRef.current;
    if (from === null || from === idx) return;
    setFiles((prev) => {
      const copy = [...prev];
      const item = copy[from];
      copy.splice(from, 1);
      copy.splice(idx, 0, item);
      return copy;
    });
    dragIdxRef.current = idx;
    setDragIdx(idx);
  };

  const endDrag = () => {
    dragIdxRef.current = null;
    setDragIdx(null);
  };

  const handleMerge = async () => {
    if (files.length < 2) return;
    setProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f.file));

      const response = await api.post("/api/pdf/merge", formData, {
        responseType: "blob",
      });

      downloadBlob(response.data as Blob, response.headers["content-disposition"] as string, "merged.pdf");
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response: { data?: { detail?: string } } }).response?.data?.detail || "Gagal menggabungkan"
          : "Gagal menggabungkan. Coba lagi.";
      setError(msg as string);
    } finally {
      setProcessing(false);
    }
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {isProcessing && <LoadingOverlay />}

      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Layers size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Gabung PDF</h2>
            <p className="text-sm text-slate-500">Gabungkan 2-10 file PDF. Tarik untuk mengubah urutan.</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Upload Area */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Pilih file PDF"
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer mb-6 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          onClick={() => document.getElementById("merge-file-input")?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              document.getElementById("merge-file-input")?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
          onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
          onDrop={(e) => { e.currentTarget.classList.remove("drag-over"); addFiles(e.dataTransfer.files); }}
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <UploadCloud size={28} className="text-blue-500" />
          </div>
          <p className="text-slate-700 font-semibold mb-1">Klik atau tarik file ke sini</p>
          <p className="text-slate-500 text-xs">PDF only • Maks 30MB total • Maks 10 file</p>
          <input
            type="file" id="merge-file-input" multiple accept="application/pdf"
            className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">
                Urutan Dokumen ({files.length}/10) — Total: {formatBytes(totalSize)}
              </h3>
            </div>
            <div className="space-y-2">
              {files.map((f, i) => (
                <div
                  key={f.id}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDragEnd={endDrag}
                  className={`flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-move transition-all hover:border-slate-300 hover:shadow-sm ${
                    dragIdx === i ? "opacity-40 border-blue-400 border-dashed" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <GripVertical size={16} className="text-slate-400 flex-shrink-0" />
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                      <FileText size={16} className="text-red-500" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                      <p className="text-xs text-slate-500">{formatBytes(f.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 w-6 h-6 rounded-full flex items-center justify-center">
                      {i + 1}
                    </span>
                    <button
                      onClick={() => removeFile(f.id)}
                      aria-label={`Hapus ${f.name}`}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            {success
              ? "✅ Selesai"
              : files.length < 2
                ? "⚠️ Pilih minimal 2 file untuk digabungkan"
                : `✅ ${files.length} file siap digabungkan`}
          </p>
          {success ? (
            <button
              onClick={() => { setFiles([]); setSuccess(false); setError(null); }}
              className="flex items-center gap-2 bg-white border-2 border-blue-200 text-blue-700 px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-50 transition-all"
            >
              <Layers size={16} />
              Proses Dokumen Lainnya
            </button>
          ) : (
            <button
              onClick={handleMerge}
              disabled={files.length < 2 || isProcessing}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 disabled:shadow-none"
            >
              <Layers size={16} />
              Gabungkan & Download
            </button>
          )}
        </div>
      </div>
      <SecurityFooter />
    </div>
  );
}
