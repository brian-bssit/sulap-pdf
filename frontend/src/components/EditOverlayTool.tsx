"use client";

import { useState } from "react";
import { UploadCloud, FileText, Type, Square, StampIcon, Download } from "lucide-react";
import { downloadBlob } from "@/lib/download";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/strings";
import { useJob } from "@/lib/useJob";
import LoadingOverlay from "./LoadingOverlay";
import SecurityFooter from "./SecurityFooter";
import OverlayCanvas from "./edit/OverlayCanvas";
import OverlayList from "./edit/OverlayList";
import PropertyBar from "./edit/PropertyBar";
import { serializeOps } from "./edit/model";
import { useEditorDocument } from "./edit/useEditorDocument";
import { useOverlayEditor } from "./edit/useOverlayEditor";

export default function EditOverlayTool() {
  const doc = useEditorDocument();
  const ed = useOverlayEditor(doc);
  const { file, numPages, error, setError } = doc;
  const job = useJob();
  const [success, setSuccess] = useState(false);

  const handleLoad = (f: File) => {
    ed.clear();
    setSuccess(false);
    doc.loadFile(f);
  };

  const resetAll = () => {
    doc.reset();
    ed.clear();
    setSuccess(false);
  };

  // ── submit ──
  const handleApply = async () => {
    if (!file || !doc.fileBytes.current) return;
    if (ed.overlays.length === 0) {
      setError(t.edit.errNeedOverlay);
      return;
    }
    setError(null);
    try {
      const blob = new Blob([doc.fileBytes.current], { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", blob, file.name);
      formData.append("operations", JSON.stringify(serializeOps(ed.overlays)));

      const stem = file.name.replace(/\.[^/.]+$/, "");
      const res = await job.run("/api/pdf/edit-overlay", formData, `${stem}_edited.pdf`);
      downloadBlob(res.blob, undefined, res.filename);

      const overlayCount = parseInt(res.headers["x-overlay-count"] || "0");
      if (overlayCount !== ed.overlays.length) {
        setError(t.edit.errPartial(overlayCount, ed.overlays.length));
      }
      setSuccess(true);
    } catch (err: unknown) {
      const detail = errorDetail(err);
      setError(detail ?? t.edit.errFailed);
    }
  };

  const { insertType, overlays } = ed;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {job.busy && <LoadingOverlay phase={job.phase} percent={job.percent} />}

      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-amber-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <StampIcon size={20} className="text-amber-600" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{t.edit.title}</h2>
            <p className="text-sm text-slate-500">{t.edit.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-amber-400 hover:bg-amber-50/30 transition-all cursor-pointer focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
            onClick={() => document.getElementById("edit-file-input")?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("edit-file-input")?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleLoad(f);
            }}
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} className="text-amber-500" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">{t.edit.choose}</p>
            <p className="text-slate-500 text-xs">{t.edit.limits}</p>
            <input
              type="file"
              id="edit-file-input"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLoad(f);
              }}
            />
          </div>
        ) : (
          <>
            {/* file bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                  <FileText size={16} className="text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.edit.fileInfo(formatBytes(file.size), numPages, overlays.length)}
                  </p>
                </div>
              </div>
              <button
                onClick={resetAll}
                className="text-xs text-amber-700 hover:text-amber-800 font-medium px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
              >
                {t.edit.changeFile}
              </button>
            </div>

            {/* insert-type chips */}
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white border border-slate-200 rounded-xl">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">{t.edit.add}</span>
              <button
                onClick={() => ed.setInsertType((cur) => (cur === "text" ? null : "text"))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  insertType === "text" ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Type size={15} aria-hidden="true" /> {t.edit.text}
              </button>
              <button
                onClick={() => ed.setInsertType((cur) => (cur === "rectangle" ? null : "rectangle"))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  insertType === "rectangle" ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Square size={15} aria-hidden="true" /> {t.edit.block}
              </button>
              <span className="ml-auto text-xs text-slate-400 hidden sm:inline">{t.edit.afterCreate}</span>
            </div>

            <PropertyBar ed={ed} />
            <OverlayList ed={ed} pageNo={doc.pageNo} setPageNo={doc.setPageNo} />

            {doc.rotWarn && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg">
                {doc.rotWarn}
              </div>
            )}

            <OverlayCanvas doc={doc} ed={ed} />

            {/* action */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                {success ? t.edit.done : overlays.length === 0 ? t.edit.noneYet : t.edit.ready(overlays.length)}
              </p>
              {success ? (
                <button
                  onClick={resetAll}
                  className="flex items-center gap-2 bg-white border-2 border-amber-200 text-amber-700 px-6 py-2.5 rounded-xl font-semibold hover:bg-amber-50 transition-all"
                >
                  <Download size={16} aria-hidden="true" />
                  {t.common.processAnother}
                </button>
              ) : (
                <button
                  onClick={handleApply}
                  disabled={overlays.length === 0 || job.busy}
                  className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 disabled:shadow-none"
                >
                  <Download size={16} aria-hidden="true" />
                  {t.edit.apply}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <SecurityFooter />
    </div>
  );
}
