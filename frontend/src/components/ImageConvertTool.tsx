"use client";

import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { t } from "@/lib/strings";
import ImagesToPdf from "./ImagesToPdf";
import ModeRadio from "./ModeRadio";
import PdfToImages from "./PdfToImages";
import SecurityFooter from "./SecurityFooter";

export default function ImageConvertTool() {
  const [mode, setMode] = useState<"toPdf" | "toImages">("toPdf");
  const s = t.images;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600" aria-hidden="true"><ImageIcon size={20} /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{t.pages.images.title}</h2>
            <p className="text-sm text-slate-500">{t.pages.images.subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <ModeRadio legend={s.modeLegend} name="img-mode" value={mode} onChange={setMode}
          options={[{ value: "toPdf", ...s.toPdf }, { value: "toImages", ...s.toImages }]} />
        {mode === "toPdf" ? <ImagesToPdf /> : <PdfToImages />}
      </div>
      <SecurityFooter />
    </div>
  );
}
