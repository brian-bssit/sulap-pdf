"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, Trash2, GripVertical, Layers, ArrowUp, ArrowDown } from "lucide-react";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/strings";
import { useJob } from "@/lib/useJob";
import LoadingOverlay from "./LoadingOverlay";
import ResultPanel from "./ResultPanel";
import SecurityFooter from "./SecurityFooter";

interface MergeFile {
  id: string;
  name: string;
  size: number;
  file: File;
}

export default function MergeTool() {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [mergedCount, setMergedCount] = useState(0);
  const job = useJob();

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    if (files.length + arr.length > 10) {
      setError(t.merge.maxFiles);
      return;
    }
    setFiles((prev) => [
      ...prev,
      ...arr.map((f) => ({ id: Math.random().toString(36).slice(2), name: f.name, size: f.size, file: f })),
    ]);
    setError(null);
    job.reset();
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // Alternatif keyboard/pembaca layar untuk drag-and-drop.
  const move = (idx: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[to]] = [copy[to], copy[idx]];
      return copy;
    });
  };

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
    setError(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f.file));
      await job.run("/api/pdf/merge", formData, "merged.pdf");
      setMergedCount(files.length);
    } catch (err: unknown) {
      setError(errorDetail(err) ?? t.merge.failed);
    }
  };

  const reset = () => { setFiles([]); job.reset(); setError(null); };
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {job.busy && <LoadingOverlay phase={job.phase} percent={job.percent} />}

      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Layers size={20} className="text-blue-600" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{t.merge.title}</h2>
            <p className="text-sm text-slate-500">{t.merge.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {job.result ? (
          <ResultPanel result={job.result} title={t.merge.resultTitle} onReset={reset} accent="blue">
            {t.merge.resultInfo(mergedCount)}
          </ResultPanel>
        ) : (
          <>
            {/* Upload Area */}
            <div
              role="button"
              tabIndex={0}
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
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-over"); addFiles(e.dataTransfer.files); }}
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <UploadCloud size={28} className="text-blue-500" aria-hidden="true" />
              </div>
              <p className="text-slate-700 font-semibold mb-1">{t.merge.dropHint}</p>
              <p className="text-slate-500 text-xs">{t.merge.limits}</p>
              <input
                type="file" id="merge-file-input" multiple accept="application/pdf"
                className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">{t.merge.listTitle(files.length, formatBytes(totalSize))}</h3>
                <ul className="space-y-2">
                  {files.map((f, i) => (
                    <li
                      key={f.id}
                      draggable
                      onDragStart={() => onDragStart(i)}
                      onDragOver={(e) => onDragOver(e, i)}
                      onDragEnd={endDrag}
                      className={`flex items-center justify-between gap-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-move transition-all hover:border-slate-300 hover:shadow-sm ${
                        dragIdx === i ? "opacity-40 border-blue-400 border-dashed" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden flex-1">
                        <GripVertical size={16} className="text-slate-400 flex-shrink-0" aria-hidden="true" />
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                          <FileText size={16} className="text-red-500" aria-hidden="true" />
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                          <p className="text-xs text-slate-500">{formatBytes(f.size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 w-6 h-6 rounded-full flex items-center justify-center mr-1" aria-hidden="true">
                          {i + 1}
                        </span>
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          aria-label={t.merge.moveUp(f.name)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === files.length - 1}
                          aria-label={t.merge.moveDown(f.name)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => removeFile(f.id)}
                          aria-label={t.merge.remove(f.name)}
                          className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-semibold text-red-700">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">{files.length < 2 ? t.merge.needTwo : t.merge.ready(files.length)}</p>
              <button
                onClick={handleMerge}
                disabled={files.length < 2 || job.busy}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 disabled:shadow-none"
              >
                <Layers size={16} aria-hidden="true" />
                {t.merge.action}
              </button>
            </div>
          </>
        )}
      </div>
      <SecurityFooter />
    </div>
  );
}
