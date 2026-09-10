"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { UploadCloud, FileText, RotateCw, Download, Grid3x3, Loader2, ChevronRight } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import api from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import LoadingOverlay from "./LoadingOverlay";
import SecurityFooter from "./SecurityFooter";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PageInfo {
  id: number;
  originalIndex: number;
  rotation: number;
  imageUrl: string | null;
}

interface QueuedFile {
  name: string;
  size: number;
  bytes: ArrayBuffer;
}

export default function RearrangeTool() {
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const fileBytes = useRef<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [isProcessing, setProcessing] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [isRendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<QueuedFile[]>([]);
  const [queueState, setQueueState] = useState({ idx: 0, total: 0 });

  const renderPages = useCallback(async (file: File) => {
    setRendering(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      if (totalPages > 200) {
        setError("Maksimal 200 halaman");
        setRendering(false);
        return;
      }

      const pageInfos: PageInfo[] = [];
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageInfos.push({
          id: i - 1,
          originalIndex: i,
          rotation: 0,
          imageUrl: canvas.toDataURL("image/jpeg", 0.6),
        });
      }
      setPages(pageInfos);
    } catch (err) {
      console.error("PDF render error:", err);
      setError("Gagal membaca halaman PDF. Pastikan file tidak rusak.");
    } finally {
      setRendering(false);
    }
  }, []);

  const loadFile = useCallback((qf: QueuedFile) => {
    setFile({ name: qf.name, size: qf.size });
    fileBytes.current = qf.bytes;
    setError(null);
    setAllDone(false);
    const f = new File([qf.bytes], qf.name, { type: "application/pdf" });
    renderPages(f);
  }, [renderPages]);

  const dropAccRef = useRef<{ files: QueuedFile[]; timer: number | null }>({ files: [], timer: null });

  // Drag-drop via native event listeners
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => { e.preventDefault(); el.classList.add("drag-over"); };
    const onDragLeave = () => el.classList.remove("drag-over");
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const raw = e.dataTransfer?.files;
      if (!raw || !raw.length) return;
      // Browser fires separate drop events per file from Finder → accumulate + debounce
      const batch: QueuedFile[] = [];
      let pending = 0;
      let done = 0;
      for (let i = 0; i < raw.length; i++) {
        const f = raw[i];
        if (f.type !== "application/pdf") continue;
        pending++;
        const idx = batch.length;
        batch.push({ name: f.name, size: f.size, bytes: new ArrayBuffer(0) });
        f.arrayBuffer().then(buf => {
          batch[idx] = { name: f.name, size: f.size, bytes: buf };
          done++;
          if (done !== pending) return;
          dropAccRef.current.files.push(...batch);
          if (dropAccRef.current.timer) clearTimeout(dropAccRef.current.timer);
          dropAccRef.current.timer = window.setTimeout(() => {
            const all = dropAccRef.current.files;
            dropAccRef.current.files = [];
            dropAccRef.current.timer = null;
            queueRef.current = all;
            setQueueState({ idx: 0, total: all.length });
            loadFile(all[0]);
          }, 150);
        });
      }
    };
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
      if (dropAccRef.current.timer) clearTimeout(dropAccRef.current.timer);
    };
  }, [loadFile]);

  // Global prevent — browser open file di tab baru saat drop multiple files
  useEffect(() => {
    const kill = (e: DragEvent) => { e.preventDefault(); };
    document.addEventListener("dragover", kill, false);
    document.addEventListener("drop", kill, false);
    return () => { document.removeEventListener("dragover", kill, false); document.removeEventListener("drop", kill, false); };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.arrayBuffer().then((buf) => {
      const q = [{ name: f.name, size: f.size, bytes: buf }];
      queueRef.current = q;
      setQueueState({ idx: 0, total: 1 });
      loadFile(q[0]);
    });
  };

  const rotatePage = (idx: number) => {
    setPages((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], rotation: (copy[idx].rotation + 90) % 360 };
      return copy;
    });
  };

  const onDragStart = (idx: number) => {
    dragIdx.current = idx;
    setDragOverIdx(idx);
  };

  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const fromIdx = dragIdx.current;
    setPages((prev) => {
      const copy = [...prev];
      const item = copy[fromIdx];
      copy.splice(fromIdx, 1);
      copy.splice(idx, 0, item);
      return copy;
    });
    dragIdx.current = idx;
    setDragOverIdx(idx);
  };

  const handleRearrange = async () => {
    if (!file || pages.length === 0) return;
    if (!fileBytes.current) {
      setError("File tidak valid. Silakan upload ulang.");
      return;
    }
    setProcessing(true);
    setError(null);

    try {
      const blob = new Blob([fileBytes.current], { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", blob, file.name);

      const order = pages.map((p) => p.originalIndex - 1);
      formData.append(
        "operations",
        JSON.stringify([
          { action: "reorder", order },
          ...pages.filter((p) => p.rotation > 0).map((p) => ({
            action: "rotate",
            page: order.indexOf(p.originalIndex - 1),
            angle: p.rotation,
          })),
        ])
      );

      const response = await api.post("/api/pdf/rearrange", formData, {
        responseType: "blob",
      });

      downloadBlob(response.data as Blob, response.headers["content-disposition"] as string, `rearranged_${file.name}`);

      // Auto-advance to next file in queue
      const nextIdx = queueState.idx + 1;
      if (nextIdx < queueState.total) {
        setQueueState(prev => ({ ...prev, idx: nextIdx }));
        loadFile(queueRef.current[nextIdx]);
      } else {
        setAllDone(true);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response: { data?: { detail?: string } } }).response?.data?.detail || "Gagal mengatur ulang"
          : "Gagal mengatur ulang. Coba lagi.";
      setError(msg as string);
    } finally {
      setProcessing(false);
    }
  };

  const resetAll = () => {
    setFile(null); setPages([]); fileBytes.current = null;
    setAllDone(false); setError(null);
    queueRef.current = []; setQueueState({ idx: 0, total: 0 });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {isProcessing && <LoadingOverlay />}

      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-purple-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Grid3x3 size={20} className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Atur Ulang PDF</h2>
            <p className="text-sm text-slate-500">Ubah urutan atau putar halaman PDF</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {!file ? (
          <div
            ref={dropRef}
            role="button"
            tabIndex={0}
            aria-label="Pilih file PDF untuk diatur"
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-purple-400 hover:bg-purple-50/30 transition-all cursor-pointer mb-6 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} className="text-purple-500" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">Pilih file PDF untuk diatur</p>
            <p className="text-slate-500 text-xs">Bisa pilih banyak file sekaligus</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0">
                  <FileText size={16} className="text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(file.size)} • {pages.length} halaman
                    {queueState.total > 1 && <span className="ml-2 text-purple-500 font-medium">({queueState.idx + 1}/{queueState.total})</span>}
                  </p>
                </div>
              </div>
              {queueState.total <= 1 && (
                <button onClick={resetAll} className="text-xs text-purple-600 hover:text-purple-700 font-medium px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors">
                  Ganti File
                </button>
              )}
            </div>

            {queueState.total > 1 && (
              <div className="flex items-center gap-1.5 mb-4">
                {Array.from({ length: queueState.total }, (_, i) => (
                  <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${
                    i < queueState.idx ? "bg-emerald-400" : i === queueState.idx ? "bg-purple-400" : "bg-slate-200"
                  }`} />
                ))}
              </div>
            )}

            {isRendering && (
              <div role="status" aria-live="polite" className="bg-slate-50 p-12 rounded-xl border border-slate-200 mb-6 text-center">
                <Loader2 size={32} className="animate-spin text-purple-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">Merender halaman...</p>
                <p className="text-xs text-slate-500 mt-1">Mohon tunggu sebentar</p>
              </div>
            )}

            {!isRendering && pages.length > 0 && (
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 max-h-[520px] overflow-y-auto mb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {pages.map((page, idx) => (
                    <div
                      key={`${page.id}-${idx}`}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDragEnd={() => { dragIdx.current = null; setDragOverIdx(null); }}
                      className={`relative bg-white rounded-xl shadow-sm border-2 cursor-move group transition-all ${
                        dragOverIdx === idx
                          ? "opacity-30 border-purple-400 border-dashed"
                          : "border-slate-200 hover:border-purple-300 hover:-translate-y-1 hover:shadow-md"
                      }`}
                    >
                      <div
                        className="w-full overflow-hidden rounded-t-xl bg-white flex items-center justify-center"
                        style={{ transform: `rotate(${page.rotation}deg)`, transition: "transform 0.3s" }}
                      >
                        {page.imageUrl ? (
                          <img src={page.imageUrl} alt={`Halaman ${page.originalIndex}`} className="w-full h-auto object-contain" draggable={false} />
                        ) : (
                          <div className="w-full aspect-[3/4] flex items-center justify-center text-slate-300 text-2xl font-bold">
                            {page.originalIndex}
                          </div>
                        )}
                      </div>

                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-slate-900/70 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex justify-center gap-1.5 rounded-b-xl">
                        <button
                          onClick={(e) => { e.stopPropagation(); rotatePage(idx); }}
                          aria-label={`Putar halaman ${idx + 1} 90 derajat`}
                          className="p-1.5 bg-white/95 text-slate-700 rounded-lg hover:bg-purple-100 hover:text-purple-700 transition-colors shadow-sm"
                          title="Putar 90°"
                        >
                          <RotateCw size={14} />
                        </button>
                      </div>

                      <div className="absolute top-1.5 left-1.5 bg-slate-900/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                        {idx + 1}
                      </div>

                      {page.rotation > 0 && (
                        <div className="absolute top-1.5 right-1.5 bg-purple-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                          {page.rotation}°
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isRendering && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  {allDone
                    ? "✅ Semua file selesai diproses"
                    : queueState.total > 1
                      ? `📄 File ${queueState.idx + 1} dari ${queueState.total} — atur urutan lalu simpan`
                      : "💡 Tarik thumbnail untuk mengubah urutan"
                  }
                </p>
                {allDone ? (
                  <button onClick={resetAll} className="flex items-center gap-2 bg-white border-2 border-purple-200 text-purple-700 px-6 py-2.5 rounded-xl font-semibold hover:bg-purple-50 transition-all">
                    <Download size={16} />
                    Proses Dokumen Lainnya
                  </button>
                ) : (
                  <button
                    onClick={handleRearrange}
                    disabled={pages.length === 0 || isProcessing}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20 disabled:shadow-none"
                  >
                    {queueState.total > 1 ? <ChevronRight size={16} /> : <Download size={16} />}
                    {queueState.total > 1 ? `Proses (${queueState.idx + 1}/${queueState.total})` : "Simpan & Download"}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <div role="alert" className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}
      </div>
      <SecurityFooter />
    </div>
  );
}
