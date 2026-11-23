"use client";

import { useRef, useState } from "react";
import { GitCompare, FileText, X, UploadCloud } from "lucide-react";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import type { CompareResult, CompareOp } from "@/lib/compare";
import { sideOps } from "@/lib/compare";
import api from "@/lib/api";
import { t } from "@/lib/strings";
import SecurityFooter from "./SecurityFooter";

function Picker({ label, id, file, onFile }: { label: string; id: string; file: File | null; onFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="text-sm font-semibold text-slate-700 mb-2">{label}</p>
      {file ? (
        <div className="flex items-center justify-between p-3 bg-blue-50/60 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText size={18} className="text-red-500 flex-shrink-0" aria-hidden="true" />
            <div className="truncate"><p className="text-sm font-medium text-slate-800 truncate">{file.name}</p><p className="text-xs text-slate-500">{formatBytes(file.size)}</p></div>
          </div>
          <button onClick={() => onFile(null)} aria-label={t.common.removeFile(file.name)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><X size={16} aria-hidden="true" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="w-full border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/10">
          <UploadCloud size={22} className="mx-auto mb-1 text-blue-500" aria-hidden="true" />
          <span className="text-sm text-slate-700 font-medium">{t.compare.choose}</span>
          <input ref={input} id={id} type="file" accept="application/pdf" className="hidden" aria-label={label} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </button>
      )}
    </div>
  );
}

function Side({ ops, kind }: { ops: CompareOp[]; kind: "a" | "b" }) {
  if (!ops.length) return <p className="text-xs text-slate-500 italic">{t.compare.emptyPage}</p>;
  return (
    <p className="text-sm text-slate-800 leading-relaxed break-words">
      {ops.map((o, i) =>
        o.t === "eq" ? <span key={i}>{o.text} </span>
        : o.t === "del" ? <del key={i} className="bg-red-100 text-red-900 px-0.5 rounded"><span className="sr-only">{t.compare.removed}: </span>{o.text} </del>
        : <ins key={i} className="bg-emerald-100 text-emerald-900 underline px-0.5 rounded"><span className="sr-only">{t.compare.added}: </span>{o.text} </ins>,
      )}
      <span className="sr-only">{kind === "a" ? t.compare.colA : t.compare.colB}</span>
    </p>
  );
}

export default function CompareTool() {
  const [a, setA] = useState<File | null>(null);
  const [b, setB] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const s = t.compare;

  const run = async () => {
    if (!a || !b) return;
    setBusy(true); setError(null); setResult(null);
    window.dispatchEvent(new Event("sulap:activity"));
    try {
      const f = new FormData();
      f.append("file_a", a); f.append("file_b", b);
      const res = await api.post("/api/pdf/compare", f, { responseType: "blob" });
      setResult(JSON.parse(await (res.data as Blob).text()) as CompareResult);
    } catch (err: unknown) {
      setError(errorDetail(err) ?? t.common.retry);
    } finally {
      setBusy(false);
    }
  };
  const reset = () => { setA(null); setB(null); setResult(null); setError(null); };
  const pages = result?.pages.filter((p) => !onlyChanged || p.added || p.removed) ?? [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600" aria-hidden="true"><GitCompare size={20} /></div>
          <div><h2 className="text-xl font-bold text-slate-800">{t.pages.compare.title}</h2><p className="text-sm text-slate-500">{t.pages.compare.subtitle}</p></div>
        </div>
      </div>
      <div className="p-6">
        {!result && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Picker label={s.oldLabel} id="compare-a" file={a} onFile={setA} />
              <Picker label={s.newLabel} id="compare-b" file={b} onFile={setB} />
            </div>
            <p className="text-xs text-slate-600 mb-6">{s.onlyText}</p>
          </>
        )}

        {result && (
          <section aria-label={s.summary(result.summary.changed_pages, result.summary.added, result.summary.removed)} className="mb-6">
            <p role="status" className="text-sm font-semibold text-slate-800 mb-1">
              {result.summary.changed_pages ? s.summary(result.summary.changed_pages, result.summary.added, result.summary.removed) : s.identical}
            </p>
            <p className="text-xs text-slate-600 mb-3">{s.legend}</p>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 mb-4">
              <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="accent-blue-600" />{s.onlyChanged}
            </label>
            <ul className="space-y-4">
              {pages.map((p) => (
                <li key={p.n} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-800">{s.page(p.n)}</h3>
                    <span className="text-xs text-slate-600">{s.pageStatus(p.added, p.removed)}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-slate-200">
                    <div className="p-4"><p className="text-xs font-semibold text-slate-600 mb-1">{s.colA}</p><Side ops={sideOps(p.ops, "a")} kind="a" /></div>
                    <div className="p-4"><p className="text-xs font-semibold text-slate-600 mb-1">{s.colB}</p><Side ops={sideOps(p.ops, "b")} kind="b" /></div>
                  </div>
                </li>
              ))}
            </ul>
            <button onClick={reset} className="mt-4 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors">{s.again}</button>
          </section>
        )}

        {error && (<div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl"><p className="text-sm font-semibold text-red-700">{error}</p></div>)}

        {!result && (
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">{a && b ? s.ready : s.needBoth}</p>
            <button onClick={run} disabled={!a || !b || busy}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 disabled:shadow-none">
              {busy ? t.job.processing + "…" : s.action}
            </button>
          </div>
        )}
      </div>
      <SecurityFooter />
    </div>
  );
}
