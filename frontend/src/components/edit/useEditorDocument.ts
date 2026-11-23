import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { t } from "@/lib/strings";

// Worker self-host (public/pdf.worker.min.mjs) — no CDN runtime dep.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Siklus hidup dokumen pdf.js: muat berkas, render halaman aktif ke kanvas, navigasi halaman. */
export function useEditorDocument() {
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const fileBytes = useRef<ArrayBuffer | null>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNo, setPageNo] = useState(1); // 1-based display
  const [vp, setVp] = useState<pdfjsLib.PageViewport | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isRendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotWarn, setRotWarn] = useState<string | null>(null);
  const vpRef = useRef<pdfjsLib.PageViewport | null>(null);
  vpRef.current = vp; // latest viewport reachable from window-level pointer listeners

  const renderPage = useCallback(async (pageNo1: number, doc: pdfjsLib.PDFDocumentProxy) => {
    if (!docRef.current) return;
    setRendering(true);
    setError(null);
    try {
      const page = await doc.getPage(pageNo1);
      const rot = ((page.rotate % 360) + 360) % 360;
      setRotWarn(rot % 180 === 0 ? null : t.edit.rotationWarn(rot));
      const raw = page.getViewport({ scale: 1 });
      const stageW = stageRef.current?.clientWidth ?? 720;
      const scale = Math.min(3, Math.max(0.5, (stageW - 32) / raw.width));
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      setVp(viewport);
    } catch (err) {
      console.error("render err", err);
      setError(t.edit.errRender);
    } finally {
      setRendering(false);
    }
  }, []);

  const loadFile = useCallback(async (f: File) => {
    setFile({ name: f.name, size: f.size });
    setError(null);
    setPageNo(1);
    setNumPages(0);
    setVp(null);
    setRotWarn(null);
    try {
      const buf = await f.arrayBuffer();
      fileBytes.current = buf; // byte asli utk upload saat Apply — JANGAN dipakai pdf.js
      // pdf.js me-transfer (detach) ArrayBuffer ke worker → beri salinan terpisah.
      const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      if (doc.numPages > 200) {
        setError(t.edit.errMaxPages);
        setFile(null);
        doc.destroy();
        return;
      }
      if (docRef.current) docRef.current.destroy();
      docRef.current = doc;
      setNumPages(doc.numPages);
    } catch (err) {
      console.error("load err", err);
      setFile(null);
      setError(t.edit.errRead);
    }
  }, []);

  // Render the active page whenever the file loads (numPages flips 0→N) or page changes.
  useEffect(() => {
    if (file && docRef.current && numPages > 0) renderPage(pageNo, docRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, pageNo, numPages]);

  const reset = useCallback(() => {
    if (docRef.current) docRef.current.destroy();
    docRef.current = null;
    fileBytes.current = null;
    setFile(null);
    setNumPages(0);
    setPageNo(1);
    setError(null);
    setVp(null);
    setRotWarn(null);
  }, []);

  return { file, fileBytes, numPages, pageNo, setPageNo, vp, vpRef, canvasRef, stageRef, isRendering, error, setError, rotWarn, loadFile, reset };
}

export type EditorDocument = ReturnType<typeof useEditorDocument>;
