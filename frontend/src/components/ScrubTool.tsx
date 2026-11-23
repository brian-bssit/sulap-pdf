"use client";

import { Eraser } from "lucide-react";
import { t } from "@/lib/strings";
import PdfToolFrame from "./PdfToolFrame";

export default function ScrubTool() {
  const s = t.scrub;
  return (
    <PdfToolFrame
      title={t.pages.scrub.title}
      subtitle={t.pages.scrub.subtitle}
      icon={<Eraser size={20} />}
      endpoint="/api/pdf/scrub-metadata"
      buildForm={(file) => { const f = new FormData(); f.append("file", file); return f; }}
      fallbackName={(file) => `bersih_${file.name}`}
      canRun
      actionLabel={s.action}
      doneTitle={s.doneTitle}
      resultNote={(r) => (r.headers["x-scrubbed"] ? s.removed(r.headers["x-scrubbed"].split(",").join(", ")) : s.nothing)}
    >
      <p className="text-sm text-slate-700 p-4 bg-slate-50 border border-slate-200 rounded-xl">{s.info}</p>
    </PdfToolFrame>
  );
}
