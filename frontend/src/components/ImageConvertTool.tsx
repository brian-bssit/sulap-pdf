"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { t } from "@/lib/strings";
import ConvertTool from "./ConvertTool";
import ImagesToPdf from "./ImagesToPdf";
import ModeRadio from "./ModeRadio";
import PdfToImages from "./PdfToImages";
import SecurityFooter from "./SecurityFooter";

export default function ImageConvertTool() {
  const [mode, setMode] = useState<"doc" | "toPdf" | "toImages">("doc");
  const s = t.images;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600" aria-hidden="true"><FileUp size={20} /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{t.pages.convert.title}</h2>
            <p className="text-sm text-slate-500">{t.pages.convert.subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <ModeRadio legend={s.modeLegend} name="img-mode" value={mode} onChange={setMode}
          options={[{ value: "doc", ...s.doc }, { value: "toPdf", ...s.toPdf }, { value: "toImages", ...s.toImages }]} />
        {mode === "doc" ? <ConvertTool /> : mode === "toPdf" ? <ImagesToPdf /> : <PdfToImages />}
      </div>
      <SecurityFooter />
    </div>
  );
}
