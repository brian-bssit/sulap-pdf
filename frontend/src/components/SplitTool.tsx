"use client";

import { useState } from "react";
import { SquareSplitHorizontal } from "lucide-react";
import { t } from "@/lib/strings";
import ModeRadio from "./ModeRadio";
import PdfToolFrame from "./PdfToolFrame";

const INPUT = "w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none";

export default function SplitTool() {
  const [mode, setMode] = useState<"ranges" | "every_n">("ranges");
  const [ranges, setRanges] = useState("");
  const [everyN, setEveryN] = useState(1);
  const s = t.split;
  const zip = mode === "every_n";

  return (
    <PdfToolFrame
      title={t.pages.split.title}
      subtitle={t.pages.split.subtitle}
      icon={<SquareSplitHorizontal size={20} />}
      endpoint="/api/pdf/split"
      buildForm={(file) => {
        const f = new FormData();
        f.append("file", file);
        f.append("mode", mode);
        if (zip) f.append("every_n", String(everyN)); else f.append("ranges", ranges);
        return f;
      }}
      fallbackName={(file) => `${file.name.replace(/\.pdf$/i, "")}${zip ? "_bagian.zip" : "_ekstrak.pdf"}`}
      canRun={zip ? everyN >= 1 : ranges.trim() !== ""}
      actionLabel={s.action}
      doneTitle={s.doneTitle}
      preview={!zip}
      downloadLabel={zip ? t.result.downloadFile : undefined}
    >
      <ModeRadio
        legend={s.modeLegend} name="split-mode" value={mode} onChange={setMode}
        options={[{ value: "ranges", ...s.ranges }, { value: "every_n", ...s.everyN }]}
      />
      {zip ? (
        <div>
          <label htmlFor="split-n" className="block text-sm font-semibold text-slate-700 mb-1">{s.everyNLabel}</label>
          <input id="split-n" type="number" min={1} max={200} value={everyN} onChange={(e) => setEveryN(Math.max(1, Number(e.target.value) || 1))} className={`${INPUT} sm:w-40`} />
        </div>
      ) : (
        <div>
          <label htmlFor="split-ranges" className="block text-sm font-semibold text-slate-700 mb-1">{s.rangesLabel}</label>
          <input id="split-ranges" value={ranges} onChange={(e) => setRanges(e.target.value)} aria-describedby="split-ranges-help" placeholder="1-3,5,8-" className={INPUT} />
          <p id="split-ranges-help" className="text-xs text-slate-600 mt-1">{s.rangesHelp}</p>
        </div>
      )}
    </PdfToolFrame>
  );
}
