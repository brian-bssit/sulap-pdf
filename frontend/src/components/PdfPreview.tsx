"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { t } from "@/lib/strings";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Pratinjau halaman pertama sebuah Blob PDF (pdf.js, dirender di browser — tidak membebani server). */
export default function PdfPreview({ blob, width = 260 }: { blob: Blob; width?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    (async () => {
      try {
        doc = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / base.width });
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [blob, width]);

  if (failed) {
    return <div className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4 text-center">{t.result.previewUnavailable}</div>;
  }
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={t.result.preview}
      className="block max-w-full h-auto rounded-md border border-slate-200 shadow-sm bg-white"
    />
  );
}
