"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/strings";
import { useJob } from "@/lib/useJob";
import LoadingOverlay from "./LoadingOverlay";
import ModeRadio from "./ModeRadio";
import ResultPanel from "./ResultPanel";

interface Img { id: string; file: File; url: string }
const MAX = 20;
const OK_TYPES = ["image/jpeg", "image/png"];

export default function ImagesToPdf() {
  const [imgs, setImgs] = useState<Img[]>([]);
  const [pageSize, setPageSize] = useState<"a4" | "fit">("a4");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  const job = useJob();
  const s = t.images;

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.some((f) => !OK_TYPES.includes(f.type))) return setError(s.onlyImages);
    if (imgs.length + arr.length > MAX) return setError(s.maxImages);
    const next = arr.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { id: Math.random().toString(36).slice(2), file, url };
    });
    setImgs((p) => [...p, ...next]);
    setError(null);
    job.reset();
  };
  const remove = (id: string) => setImgs((p) => p.filter((i) => i.id !== id));
  const move = (i: number, d: -1 | 1) =>
    setImgs((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const c = [...p];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const run = async () => {
    setError(null);
    try {
      const f = new FormData();
      imgs.forEach((i) => f.append("files", i.file));
      f.append("page_size", pageSize);
      await job.run("/api/pdf/images-to-pdf", f, "gambar.pdf");
    } catch (err: unknown) {
      setError(errorDetail(err) ?? t.common.retry);
    }
  };
  const reset = () => { setImgs([]); job.reset(); setError(null); };

  if (job.result) {
    return <ResultPanel result={job.result} title={s.doneTitle} onReset={reset} accent="blue" />;
  }
  return (
    <div>
      {job.busy && <LoadingOverlay phase={job.phase} percent={job.percent} />}
      <div
        role="button"
        tabIndex={0}
        className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer mb-6 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
        onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-over"); add(e.dataTransfer.files); }}
      >
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <UploadCloud size={28} className="text-blue-500" aria-hidden="true" />
        </div>
        <p className="text-slate-700 font-semibold mb-1">{s.choose}</p>
        <p className="text-slate-500 text-xs">{s.limits}</p>
        <input ref={input} id="images-file-input" type="file" multiple accept="image/jpeg,image/png" className="hidden"
          onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>

      {imgs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">{s.listTitle(imgs.length, formatBytes(imgs.reduce((n, i) => n + i.file.size, 0)))}</h3>
          <ul className="space-y-2">
            {imgs.map((im, i) => (
              <li key={im.id} className="flex items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt={s.thumbAlt(im.file.name)} className="w-12 h-12 object-cover rounded-lg border border-slate-200 bg-white flex-shrink-0" />
                  <div className="truncate">
                    <p className="text-sm font-medium text-slate-700 truncate">{im.file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(im.file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 w-6 h-6 rounded-full flex items-center justify-center mr-1" aria-hidden="true">{i + 1}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={s.moveUp(im.file.name)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30">
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === imgs.length - 1} aria-label={s.moveDown(im.file.name)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30">
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button onClick={() => remove(im.id)} aria-label={s.remove(im.file.name)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {imgs.length > 0 && (
        <ModeRadio
          legend={s.pageSizeLegend} name="img-page-size" value={pageSize} onChange={setPageSize}
          options={[{ value: "a4", ...s.a4 }, { value: "fit", ...s.fit }]}
        />
      )}

      {error && (
        <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-500">{imgs.length ? t.tool.ready : s.needOne}</p>
        <button onClick={run} disabled={!imgs.length || job.busy}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 disabled:shadow-none">
          {s.actionToPdf}
        </button>
      </div>
    </div>
  );
}
