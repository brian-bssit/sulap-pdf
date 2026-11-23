"use client";

import { useRef, useState } from "react";
import { Workflow, UploadCloud, FileText, X, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/strings";
import type { JobResult } from "@/lib/useJob";
import { ChainError, MAX_STEPS, parsePages, runChain, validateChain, type Step, type StepId } from "@/lib/workflow";
import ResultPanel from "./ResultPanel";
import SecurityFooter from "./SecurityFooter";

const INPUT = "w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none";
const IDS: StepId[] = ["unlock", "remove-pages", "compress", "watermark", "page-numbers", "scrub", "protect"];
type Row = Step & { key: string };

function complete(s: Step): boolean {
  switch (s.id) {
    case "unlock": return !!s.options.password;
    case "protect": return (s.options.password ?? "").length >= 8;
    case "watermark": return !!s.options.text?.trim();
    case "remove-pages": return parsePages(s.options.pages ?? "") !== null;
    default: return true;
  }
}

export default function WorkflowTool() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<(JobResult & { steps: number }) | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = t.workflow;
  const name = (id: StepId) => s.steps[id];
  const busy = status !== null;

  const setOpt = (key: string, k: string, v: string) => setRows((r) => r.map((x) => (x.key === key ? { ...x, options: { ...x.options, [k]: v } } : x)));
  const add = (id: StepId) => setRows((r) => (r.length >= MAX_STEPS ? r : [...r, { key: Math.random().toString(36).slice(2), id, options: id === "page-numbers" ? { format: "n" } : {} }]));
  const move = (i: number, d: -1 | 1) => setRows((r) => { const j = i + d; if (j < 0 || j >= r.length) return r; const c = [...r]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const check = (): string | null => {
    const v = validateChain(rows);
    if (v) return s.errors[v];
    return rows.every(complete) ? null : s.errors.incomplete;
  };
  const problem = rows.length ? check() : s.errors.count;

  const run = async () => {
    if (!file || problem) return;
    setError(null); setResult(null);
    try {
      const out = await runChain(
        file, rows, (url, form) => api.post(url, form, { responseType: "blob" }) as Promise<{ data: Blob; headers: Record<string, string> }>,
        (i, total) => { setStatus(s.running(i + 1, total, name(rows[i].id))); window.dispatchEvent(new Event("sulap:activity")); },
        (e) => errorDetail(e) ?? t.common.retry,
      );
      setResult({ blob: out.blob, filename: out.filename, headers: {}, steps: rows.length });
    } catch (err: unknown) {
      setError(err instanceof ChainError ? s.failedAt(err.stepIndex + 1, name(err.stepId), err.detail) : t.common.retry);
    } finally {
      setStatus(null);
    }
  };
  const reset = () => { setFile(null); setRows([]); setResult(null); setError(null); };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600" aria-hidden="true"><Workflow size={20} /></div>
          <div><h2 className="text-xl font-bold text-slate-800">{t.pages.workflow.title}</h2><p className="text-sm text-slate-500">{t.pages.workflow.subtitle}</p></div>
        </div>
      </div>
      <div className="p-6">
        {result ? (
          <ResultPanel result={result} title={s.doneTitle} onReset={reset} accent="blue">{s.doneInfo(result.steps)}</ResultPanel>
        ) : (
          <>
            <p className="text-xs text-slate-600 mb-4">{s.info}</p>
            {!file ? (
              <button type="button" onClick={() => input.current?.click()} className="w-full border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all mb-6 focus:outline-none focus:ring-4 focus:ring-blue-500/10">
                <UploadCloud size={28} className="mx-auto mb-2 text-blue-500" aria-hidden="true" />
                <span className="block text-slate-700 font-semibold">{t.tool.choose}</span>
                <span className="block text-slate-500 text-xs">{t.common.pdfOnlyMax(30)}</span>
                <input ref={input} type="file" accept="application/pdf" className="hidden" aria-label={t.tool.choose} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
              </button>
            ) : (
              <div className="flex items-center justify-between p-4 bg-blue-50/60 border border-blue-200 rounded-xl mb-6">
                <div className="flex items-center gap-3 overflow-hidden"><FileText size={20} className="text-red-500 flex-shrink-0" aria-hidden="true" />
                  <div className="truncate"><p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p><p className="text-xs text-slate-500">{formatBytes(file.size)}</p></div></div>
                <button onClick={reset} aria-label={t.common.removeFile(file.name)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><X size={16} aria-hidden="true" /></button>
              </div>
            )}

            {file && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">{s.stepsTitle}</h3>
                <ol className="space-y-3 mb-3">
                  {rows.map((r, i) => (
                    <li key={r.key} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800"><span className="text-slate-500 mr-2">{i + 1}.</span>{name(r.id)}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label={s.moveUp(name(r.id))} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30"><ArrowUp size={16} aria-hidden="true" /></button>
                          <button onClick={() => move(i, 1)} disabled={i === rows.length - 1 || busy} aria-label={s.moveDown(name(r.id))} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30"><ArrowDown size={16} aria-hidden="true" /></button>
                          <button onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} disabled={busy} aria-label={s.remove(name(r.id))} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} aria-hidden="true" /></button>
                        </div>
                      </div>
                      {(r.id === "unlock" || r.id === "protect") && (
                        <div className="mt-2"><label htmlFor={`pw-${r.key}`} className="block text-xs font-semibold text-slate-700 mb-1">{s.passwordLabel}</label>
                          <input id={`pw-${r.key}`} type="password" autoComplete="new-password" maxLength={128} value={r.options.password ?? ""} onChange={(e) => setOpt(r.key, "password", e.target.value)} className={INPUT} /></div>
                      )}
                      {r.id === "watermark" && (
                        <div className="mt-2"><label htmlFor={`wm-${r.key}`} className="block text-xs font-semibold text-slate-700 mb-1">{s.textLabel}</label>
                          <input id={`wm-${r.key}`} maxLength={100} value={r.options.text ?? ""} onChange={(e) => setOpt(r.key, "text", e.target.value)} placeholder="RAHASIA" className={INPUT} /></div>
                      )}
                      {r.id === "remove-pages" && (
                        <div className="mt-2"><label htmlFor={`rp-${r.key}`} className="block text-xs font-semibold text-slate-700 mb-1">{s.pagesLabel}</label>
                          <input id={`rp-${r.key}`} value={r.options.pages ?? ""} onChange={(e) => setOpt(r.key, "pages", e.target.value)} placeholder="2,4-5" className={INPUT} /></div>
                      )}
                      {r.id === "page-numbers" && (
                        <div className="mt-2"><label htmlFor={`pn-${r.key}`} className="block text-xs font-semibold text-slate-700 mb-1">{s.formatLabel}</label>
                          <select id={`pn-${r.key}`} value={r.options.format ?? "n"} onChange={(e) => setOpt(r.key, "format", e.target.value)} className={INPUT}>
                            <option value="n">{s.formatN}</option><option value="n_of_total">{s.formatNOfTotal}</option></select></div>
                      )}
                    </li>
                  ))}
                </ol>
                {rows.length < MAX_STEPS && (
                  <div>
                    <label htmlFor="wf-add" className="sr-only">{s.add}</label>
                    <select id="wf-add" value="" disabled={busy} onChange={(e) => e.target.value && add(e.target.value as StepId)} className={`${INPUT} sm:w-72`}>
                      <option value="">{s.addPlaceholder}</option>
                      {IDS.map((id) => <option key={id} value={id}>{name(id)}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {status && <p role="status" aria-live="polite" className="text-sm text-slate-700 mb-4">{status}…</p>}
            {error && (<div role="alert" className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl"><p className="text-sm font-semibold text-red-700">{error}</p></div>)}

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">{!file ? t.common.chooseFirst : problem ?? t.tool.ready}</p>
              <button onClick={run} disabled={!file || !!problem || busy}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 disabled:shadow-none">
                {s.action}
              </button>
            </div>
          </>
        )}
      </div>
      <SecurityFooter />
    </div>
  );
}
