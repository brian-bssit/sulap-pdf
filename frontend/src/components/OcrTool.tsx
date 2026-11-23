"use client";

import { useState } from "react";
import { ScanText } from "lucide-react";
import { t } from "@/lib/strings";
import ModeRadio from "./ModeRadio";
import PdfToolFrame from "./PdfToolFrame";

export default function OcrTool() {
  const [lang, setLang] = useState<"ind+eng" | "ind" | "eng">("ind+eng");
  const s = t.ocr;
  return (
    <PdfToolFrame
      title={t.pages.ocr.title}
      subtitle={t.pages.ocr.subtitle}
      icon={<ScanText size={20} />}
      endpoint="/api/pdf/ocr"
      buildForm={(file) => { const f = new FormData(); f.append("file", file); f.append("lang", lang); return f; }}
      fallbackName={(file) => `ocr_${file.name}`}
      canRun
      actionLabel={s.action}
      doneTitle={s.doneTitle}
      resultNote={(r) => (Number(r.headers["x-pages-ocr"]) > 0 ? `${s.pages(Number(r.headers["x-pages-ocr"]))}. ${s.check}` : s.nothing)}
    >
      <ModeRadio legend={s.langLegend} name="ocr-lang" value={lang} onChange={setLang}
        options={[{ value: "ind+eng", ...s.langs["ind+eng"] }, { value: "ind", ...s.langs.ind }, { value: "eng", ...s.langs.eng }]} />
      <p className="text-xs text-slate-600">{s.info}</p>
    </PdfToolFrame>
  );
}
