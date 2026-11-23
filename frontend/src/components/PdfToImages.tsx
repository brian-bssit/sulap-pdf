"use client";

import { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { UploadCloud, FileText, X, Download } from "lucide-react";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/strings";
import { zipStore } from "@/lib/zip";
import ModeRadio from "./ModeRadio";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const MAX_PAGES = 100;
const MAX_PIXELS = 25_000_000; // lindungi memori untuk halaman berukuran sangat besar
type Fmt = "png" | "jpeg";
interface Out { name: string; blob: Blob }

export default function PdfToImages() {
  const [file, setFile] = useState<File | null>(null);
  const [fmt, setFmt] = useState<Fmt>("png");
  const [dpi, setDpi] = useState<100 | 150 | 200>(150);
  const [progress, setProgress] = useState<{ n: number; total: number } | null>(null);
  const [outs, setOuts] = useState<Out[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = t.images;
  const stem = file?.name.replace(/\.pdf$/i, "") ?? "halaman";

  const reset = () => { setFile(null); setOuts([]); setError(null); setProgress(null); };

  const run = async () => {
    if (!file) return;
    setError(null); setOuts([]);
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      if (doc.numPages > MAX_PAGES) { setError(s.tooManyPages); return; }
      const result: Out[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        setProgress({ n, total: doc.numPages });
        window.dispatchEvent(new Event("sulap:activity")); // proses panjang = user aktif (IdleGuard)
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(dpi / 72, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas");
        if (fmt === "jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); } // JPG tak punya alfa
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, `image/${fmt}`, 0.92));
        canvas.width = canvas.height = 0;
        if (!blob) throw new Error("toBlob");
        result.push({ name: `${stem}_${String(n).padStart(3, "0")}.${fmt === "png" ? "png" : "jpg"}`, blob });
      }
      setOuts(result);
    } catch (err: unknown) {
      setError((err as { name?: string })?.name === "PasswordException" ? s.passwordPdf : s.unreadable);
    } finally {
      setProgress(null);
      doc?.destroy();
    }
  };

  const downloadAll = async () => {
    const files = await Promise.all(outs.map(async (o) => ({ name: o.name, data: new Uint8Array(await o.blob.arrayBuffer()) })));
    downloadBlob(zipStore(files), undefined, `${stem}_gambar.zip`);
  };

  return (
    <div>
      <p className="text-xs text-slate-600 mb-4">{s.local}</p>
      {!file ? (
        <div
          role="button" tabIndex={0}
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer mb-6 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
          onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-over"); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setOuts([]); setError(null); } }}
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <UploadCloud size={28} className="text-blue-500" aria-hidden="true" />
          </div>
          <p className="text-slate-700 font-semibold mb-1">{t.tool.choose}</p>
          <p className="text-slate-500 text-xs">{t.common.pdfOnlyMax(30)}</p>
          <input ref={input} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setOuts([]); setError(null); } }} />
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

      {file && !outs.length && (
        <>
          <ModeRadio legend={s.formatLegend} name="img-format" value={fmt} onChange={setFmt}
            options={[{ value: "png", label: "PNG", hint: "Tajam, ukuran lebih besar" }, { value: "jpeg", label: "JPG", hint: "Ukuran lebih kecil" }]} />
          <ModeRadio legend={s.qualityLegend} name="img-dpi" value={String(dpi) as "100" | "150" | "200"} onChange={(v) => setDpi(Number(v) as 100 | 150 | 200)}
            options={[{ value: "100", label: s.dpi(100), hint: "Cepat, untuk layar" }, { value: "150", label: s.dpi(150), hint: "Seimbang" }, { value: "200", label: s.dpi(200), hint: "Detail, lebih lambat" }]} />
        </>
      )}

      {progress && <p role="status" aria-live="polite" className="text-sm text-slate-700 mb-4">{s.rendering(progress.n, progress.total)}</p>}

      {error && (
        <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {outs.length > 0 && (
        <section aria-label={s.resultTitle(outs.length)} className="mb-6 p-4 rounded-xl border border-blue-200 bg-blue-50">
          <p role="status" className="text-sm font-semibold text-slate-800 mb-3">{s.resultTitle(outs.length)}</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 max-h-64 overflow-auto">
            {outs.map((o, i) => (
              <li key={o.name} className="flex items-center justify-between gap-2 p-2 bg-white border border-slate-200 rounded-lg">
                <span className="text-xs text-slate-700 truncate">{o.name} • {formatBytes(o.blob.size)}</span>
                <button onClick={() => downloadBlob(o.blob, undefined, o.name)} aria-label={s.downloadPage(i + 1)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                  <Download size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button onClick={downloadAll} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-slate-900/10 hover:brightness-110 transition">
              <Download size={16} aria-hidden="true" />{s.downloadAll}
            </button>
            <button onClick={reset} className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors">{t.common.processAnother}</button>
          </div>
        </section>
      )}

      {!outs.length && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">{file ? t.tool.ready : t.common.chooseFirst}</p>
          <button onClick={run} disabled={!file || !!progress}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 disabled:shadow-none">
            {s.actionToImages}
          </button>
        </div>
      )}
    </div>
  );
}
