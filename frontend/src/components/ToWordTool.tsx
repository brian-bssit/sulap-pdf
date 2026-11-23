"use client";

import { FileType2 } from "lucide-react";
import { t } from "@/lib/strings";
import PdfToolFrame from "./PdfToolFrame";

export default function ToWordTool() {
  const s = t.toWord;
  return (
    <PdfToolFrame
      title={t.pages["to-word"].title}
      subtitle={t.pages["to-word"].subtitle}
      icon={<FileType2 size={20} />}
      endpoint="/api/pdf/to-word"
      buildForm={(file) => { const f = new FormData(); f.append("file", file); return f; }}
      fallbackName={(file) => `${file.name.replace(/\.pdf$/i, "")}.docx`}
      canRun
      actionLabel={s.action}
      doneTitle={s.doneTitle}
      resultNote={() => s.check}
      preview={false}
      downloadLabel={t.result.downloadDocx}
    >
      <p role="note" className="text-sm text-amber-900 p-4 bg-amber-50 border border-amber-200 rounded-xl">{s.warning}</p>
    </PdfToolFrame>
  );
}
