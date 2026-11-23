"use client";

import { useState } from "react";
import { Stamp } from "lucide-react";
import { t } from "@/lib/strings";
import ModeRadio from "./ModeRadio";
import PdfToolFrame from "./PdfToolFrame";

const INPUT = "w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none";
const POSITIONS = ["bottom-center", "bottom-right", "bottom-left", "top-center", "top-right", "top-left"] as const;

export default function WatermarkTool() {
  const [mode, setMode] = useState<"watermark" | "page-numbers">("watermark");
  const [text, setText] = useState("");
  const [layout, setLayout] = useState<"diagonal" | "center">("diagonal");
  const [opacity, setOpacity] = useState(0.2);
  const [color, setColor] = useState("#888888");
  const [size, setSize] = useState(48);
  const [pages, setPages] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("bottom-center");
  const [format, setFormat] = useState<"n" | "n_of_total">("n");
  const [startAt, setStartAt] = useState(1);
  const s = t.watermark;
  const wm = mode === "watermark";

  return (
    <PdfToolFrame
      title={t.pages.watermark.title}
      subtitle={t.pages.watermark.subtitle}
      icon={<Stamp size={20} />}
      endpoint={`/api/pdf/${mode}`}
      buildForm={(file) => {
        const f = new FormData();
        f.append("file", file);
        if (wm) {
          f.append("text", text.trim()); f.append("position", layout); f.append("opacity", String(opacity));
          f.append("color", color); f.append("font_size", String(size)); f.append("pages", pages);
        } else {
          f.append("position", position); f.append("format", format); f.append("start_at", String(startAt));
        }
        return f;
      }}
      fallbackName={(file) => `${wm ? "watermark" : "nomor"}_${file.name}`}
      canRun={wm ? text.trim() !== "" : startAt >= 1}
      actionLabel={wm ? s.actionWatermark : s.actionNumbers}
      doneTitle={s.doneTitle}
    >
      <ModeRadio
        legend={s.modeLegend} name="wm-mode" value={mode} onChange={setMode}
        options={[{ value: "watermark", ...s.watermark }, { value: "page-numbers", ...s.numbers }]}
      />
      {wm ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="wm-text" className="block text-sm font-semibold text-slate-700 mb-1">{s.textLabel}</label>
            <input id="wm-text" value={text} maxLength={100} onChange={(e) => setText(e.target.value)} placeholder="RAHASIA" className={INPUT} />
          </div>
          <div>
            <label htmlFor="wm-layout" className="block text-sm font-semibold text-slate-700 mb-1">{s.layoutLabel}</label>
            <select id="wm-layout" value={layout} onChange={(e) => setLayout(e.target.value as "diagonal" | "center")} className={INPUT}>
              <option value="diagonal">{s.diagonal}</option>
              <option value="center">{s.center}</option>
            </select>
          </div>
          <div>
            <label htmlFor="wm-opacity" className="block text-sm font-semibold text-slate-700 mb-1">{s.opacityLabel}: {Math.round(opacity * 100)}%</label>
            <input id="wm-opacity" type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-blue-600" />
          </div>
          <div>
            <label htmlFor="wm-color" className="block text-sm font-semibold text-slate-700 mb-1">{s.colorLabel}</label>
            <input id="wm-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 rounded-lg border border-slate-300 bg-white p-1" />
          </div>
          <div>
            <label htmlFor="wm-size" className="block text-sm font-semibold text-slate-700 mb-1">{s.sizeLabel}</label>
            <input id="wm-size" type="number" min={12} max={200} value={size} onChange={(e) => setSize(Math.min(200, Math.max(12, Number(e.target.value) || 12)))} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="wm-pages" className="block text-sm font-semibold text-slate-700 mb-1">{s.pagesLabel} <span className="font-normal text-slate-500">({t.tool.optional})</span></label>
            <input id="wm-pages" value={pages} onChange={(e) => setPages(e.target.value)} aria-describedby="wm-pages-help" placeholder="1-3,5" className={INPUT} />
            <p id="wm-pages-help" className="text-xs text-slate-600 mt-1">{s.pagesHelp}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="pn-pos" className="block text-sm font-semibold text-slate-700 mb-1">{s.positionLabel}</label>
            <select id="pn-pos" value={position} onChange={(e) => setPosition(e.target.value as (typeof POSITIONS)[number])} className={INPUT}>
              {POSITIONS.map((p) => <option key={p} value={p}>{s.positions[p]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pn-fmt" className="block text-sm font-semibold text-slate-700 mb-1">{s.formatLabel}</label>
            <select id="pn-fmt" value={format} onChange={(e) => setFormat(e.target.value as "n" | "n_of_total")} className={INPUT}>
              <option value="n">{s.formatN}</option>
              <option value="n_of_total">{s.formatNOfTotal}</option>
            </select>
          </div>
          <div>
            <label htmlFor="pn-start" className="block text-sm font-semibold text-slate-700 mb-1">{s.startLabel}</label>
            <input id="pn-start" type="number" min={1} max={9999} value={startAt} onChange={(e) => setStartAt(Math.min(9999, Math.max(1, Number(e.target.value) || 1)))} className={INPUT} />
          </div>
        </div>
      )}
    </PdfToolFrame>
  );
}
