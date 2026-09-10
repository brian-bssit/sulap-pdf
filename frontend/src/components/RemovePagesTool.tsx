"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { UploadCloud, FileText, Trash2, Download, Scissors, Loader2, X, ChevronRight } from "lucide-react";
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
  imageUrl: string | null;
}

interface QueuedFile {
  name: string;
  size: number;
  bytes: ArrayBuffer;
}

export default function RemovePagesTool() {
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const fileBytes = useRef<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isProcessing, setProcessing] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [isRendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<QueuedFile[]>([]);
  const [queueState, setQueueState] = useState({ idx: 0, total: 0 });

  const renderPages = useCallback(async (f: File) => {
    setRendering(true);
    setError(null);
    setSelected(new Set());
    try {
      const arrayBuffer = await f.arrayBuffer();
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
        pageInfos.push({ id: i - 1, originalIndex: i, imageUrl: canvas.toDataURL("image/jpeg", 0.6) });
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
    setSelected(new Set());
    const f = new File([qf.bytes], qf.name, { type: "application/pdf" });
    renderPages(f);
  }, [renderPages]);

  const dropAccRef = useRef<{ files: QueuedFile[]; timer: number | null }>({ files: [], timer: null });

  // Drag-drop native
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
          // All bytes read for this batch → push to accumulator
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

  // Global prevent — new tabs
  useEffect(() => {
    const kill = (e: DragEvent) => { e.preventDefault(); };
    document.addEventListener("dragover", kill, false);
    document.addEventListener("drop", kill, false);
    return () => { document.removeEventListener("dragover", kill, false); document.removeEventListener("drop", kill, false); };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.arrayBuffer().then(buf => {
      const q = [{ name: f.name, size: f.size, bytes: buf }];
      queueRef.current = q;
      setQueueState({ idx: 0, total: 1 });
      loadFile(q[0]);
    });
  };

  const togglePage = (idx: number) => {
    setSelected(prev => {
      const copy = new Set(prev);
      if (copy.has(idx)) copy.delete(idx); else copy.add(idx);
      return copy;
    });
  };

  const handleRemove = async () => {
    if (!file || pages.length === 0 || selected.size === 0) return;
    if (!fileBytes.current) { setError("File tidak valid. Silakan upload ulang."); return; }
    if (selected.size >= pages.length) { setError("Tidak bisa menghapus semua halaman. Setidaknya 1 halaman harus tersisa."); return; }
    setProcessing(true);
    setError(null);

    try {
      const blob = new Blob([fileBytes.current], { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", blob, file.name);
      formData.append("pages_to_remove", JSON.stringify(Array.from(selected).sort((a, b) => a - b)));

      const response = await api.post("/api/pdf/remove-pages", formData, { responseType: "blob" });
      downloadBlob(response.data as Blob, response.headers["content-disposition"] as string, `trimmed_${file.name}`);

      const nextIdx = queueState.idx + 1;
      if (nextIdx < queueState.total) {
        setQueueState(prev => ({ ...prev, idx: nextIdx }));
        loadFile(queueRef.current[nextIdx]);
      } else {
        setAllDone(true);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? (err as { response: { data?: { detail?: string } } }).response?.data?.detail || "Gagal menghapus halaman"
        : "Gagal menghapus halaman. Coba lagi.";
      setError(msg as string);
    } finally {
      setProcessing(false);
    }
  };

  const resetAll = () => {
    setFile(null); setPages([]); fileBytes.current = null; setSelected(new Set());
    setAllDone(false); setError(null);
    queueRef.current = []; setQueueState({ idx: 0, total: 0 });
  };

  const remaining = pages.length - selected.size;
  const { idx: qIdx, total: qTotal } = queueState;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {isProcessing && <LoadingOverlay />}
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-red-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <Scissors size={20} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Hapus Halaman</h2>
            <p className="text-sm text-slate-500">Pilih halaman yang ingin dihapus dari PDF</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        {!file ? (
          <div
            ref={dropRef}
            role="button" tabIndex={0} aria-label="Pilih file PDF"
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-red-400 hover:bg-red-50/30 transition-all cursor-pointer mb-6 focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} className="text-red-500" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">Pilih file PDF</p>
            <p className="text-slate-500 text-xs">Bisa pilih banyak file sekaligus</p>
            <input ref={fileInputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileSelect} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 p-3 bg-red-50/50 border border-red-100 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0">
                  <FileText size={16} className="text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(file.size)} • {pages.length} halaman
                    {qTotal > 1 && <span className="ml-2 text-red-500 font-medium">({qIdx + 1}/{qTotal})</span>}
                  </p>
                </div>
              </div>
              {qTotal <= 1 && (
                <button onClick={resetAll} className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">Ganti File</button>
              )}
            </div>

            {qTotal > 1 && (
              <div className="flex items-center gap-1.5 mb-4">
                {Array.from({ length: qTotal }, (_, i) => (
                  <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i < qIdx ? "bg-emerald-400" : i === qIdx ? "bg-red-400" : "bg-slate-200"}`} />
                ))}
              </div>
            )}

            {isRendering && (
              <div role="status" aria-live="polite" className="bg-slate-50 p-12 rounded-xl border border-slate-200 mb-6 text-center">
                <Loader2 size={32} className="animate-spin text-red-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">Merender halaman...</p>
                <p className="text-xs text-slate-500 mt-1">Mohon tunggu sebentar</p>
              </div>
            )}

            {!isRendering && pages.length > 0 && (
              <>
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 max-h-[520px] overflow-y-auto mb-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {pages.map((page, idx) => {
                      const isSel = selected.has(idx);
                      return (
                        <button key={page.id} type="button" onClick={() => togglePage(idx)}
                          className={`relative bg-white rounded-xl shadow-sm border-2 cursor-pointer group transition-all text-left ${isSel ? "border-red-400 ring-2 ring-red-200 opacity-60" : "border-slate-200 hover:border-red-300 hover:-translate-y-1 hover:shadow-md"}`}>
                          <div className="w-full overflow-hidden rounded-t-xl bg-white flex items-center justify-center">
                            {page.imageUrl ? <img src={page.imageUrl} alt={`Halaman ${page.originalIndex}`} className="w-full h-auto object-contain" draggable={false} />
                              : <div className="w-full aspect-[3/4] flex items-center justify-center text-slate-300 text-2xl font-bold">{page.originalIndex}</div>}
                          </div>
                          {isSel && <div className="absolute inset-0 bg-red-500/20 rounded-xl flex items-center justify-center"><div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-lg"><X size={18} className="text-white" /></div></div>}
                          <div className="absolute top-1.5 left-1.5 bg-slate-900/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{page.originalIndex}</div>
                          <div className="absolute top-1.5 right-1.5">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSel ? "bg-red-500 border-red-500" : "bg-white/90 border-slate-400 group-hover:border-red-400"}`}>
                              {isSel && <X size={12} className="text-white" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    {allDone ? "✅ Semua file selesai diproses"
                      : selected.size === 0
                        ? qTotal > 1 ? `📄 File ${qIdx + 1} dari ${qTotal}` : "💡 Klik halaman yang ingin dihapus"
                        : `🗑️ ${selected.size} halaman dipilih — ${remaining} halaman tersisa`}
                  </p>
                  {allDone ? (
                    <button onClick={resetAll} className="flex items-center gap-2 bg-white border-2 border-red-200 text-red-700 px-6 py-2.5 rounded-xl font-semibold hover:bg-red-50 transition-all"><Download size={16} /> Proses Dokumen Lainnya</button>
                  ) : (
                    <button onClick={handleRemove} disabled={selected.size === 0 || isProcessing}
                      className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-red-700 hover:to-rose-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-red-500/20 disabled:shadow-none">
                      {qTotal > 1 ? <ChevronRight size={16} /> : <Trash2 size={16} />}
                      {qTotal > 1 ? `Proses (${qIdx + 1}/${qTotal})` : `Hapus${selected.size > 0 ? ` (${selected.size})` : ""}`}
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
        {error && <div role="alert" className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl"><p className="text-sm font-semibold text-red-700">{error}</p></div>}
      </div>
      <SecurityFooter />
    </div>
  );
}
