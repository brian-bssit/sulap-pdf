"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  Type,
  Square,
  StampIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ListChecks,
  MousePointer2,
  Trash2,
  Download,
  Loader2,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import api from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { errorDetail } from "@/lib/error";
import { formatBytes } from "@/lib/format";
import LoadingOverlay from "./LoadingOverlay";
import SecurityFooter from "./SecurityFooter";

// Worker self-host (public/pdf.worker.min.mjs) — no CDN runtime dep.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// Must match whitelist in backend/pdf/edit_overlay.py (ALL_FONTS).
const BASE14_FONTS = ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Times-Roman", "Times-Bold", "Times-Italic", "Courier", "Courier-Bold"];
const OPEN_LICENSE_FONTS = ["Lato", "DejaVu Sans", "DejaVu Serif", "DejaVu Sans Mono"];
const ALL_FONTS = [...BASE14_FONTS, ...OPEN_LICENSE_FONTS];
const FONT_SET = new Set(ALL_FONTS);
// Backend whitelist menolak font tak dikenal (400). Clamp nilai basi/hantu ke
// Helvetica supaya op lama tak gagal kirim.
const clampFont = (f?: string) => (f && FONT_SET.has(f) ? f : "Helvetica");
const FONT_FAMILY: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  "Helvetica-Bold": "Helvetica, Arial, sans-serif",
  "Helvetica-Oblique": "Helvetica, Arial, sans-serif",
  "Times-Roman": "Times New Roman, serif",
  "Times-Bold": "Times New Roman, serif",
  "Times-Italic": "Times New Roman, serif",
  Courier: "Courier New, monospace",
  "Courier-Bold": "Courier New, monospace",
  // Preview stack saja — PDF output pakai TTF yang di-embed server (backend/pdf/fonts).
  Lato: "'Lato', 'DejaVu Sans', 'Trebuchet MS', sans-serif",
  "DejaVu Sans": "'DejaVu Sans', Verdana, sans-serif",
  "DejaVu Serif": "'DejaVu Serif', Georgia, serif",
  "DejaVu Sans Mono": "'DejaVu Sans Mono', 'Courier New', monospace",
};

// null = mode pilih (netral): klik halaman TIDAK menambah overlay.
type InsertType = "text" | "rectangle" | null;
type PBox = { x: number; y: number; width: number; height: number };

interface OverlayOp {
  id: string;
  type: "text" | "rectangle";
  page: number; // 0-based
  x: number; // PDF user-space (absolute MediaBox frame)
  y: number;
  width?: number; // rectangle
  height?: number;
  opacity?: number; // rectangle 0..1
  text?: string;
  color?: string;
  font?: string;
  font_size?: number;
}

// Drag states: 'move' (existing overlay), 'draw' (drag-create rectangle),
// 'resize' (drag a corner of a selected rectangle), 'edge' (drag one border 1D).
type Drag =
  | { mode: "move"; id: string; lastX: number; lastY: number }
  | { mode: "draw"; page: number; color: string; opacity: number; wrapLeft: number; wrapTop: number; anchorCss: [number, number]; moved: boolean; lastX: number; lastY: number }
  | { mode: "resize"; id: string; fixedPdf: [number, number]; wrapLeft: number; wrapTop: number; minW: number; minH: number }
  | { mode: "edge"; id: string; axis: "x" | "y"; side: 1 | -1; o: { x: number; y: number; w: number; h: number }; wrapLeft: number; wrapTop: number; box: PBox; minW: number; minH: number };

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** PDF rect spanned by two opposite corners, normalized + clamped to the page box. */
function normalizeRect(a: [number, number], b: [number, number], box: PBox, minW = 8, minH = 8): PBox {
  const loX = box.x, loY = box.y, hiX = box.x + box.width, hiY = box.y + box.height;
  let x1 = Math.min(Math.max(Math.min(a[0], b[0]), loX), hiX);
  let y1 = Math.min(Math.max(Math.min(a[1], b[1]), loY), hiY);
  let x2 = Math.min(Math.max(Math.max(a[0], b[0]), loX), hiX);
  let y2 = Math.min(Math.max(Math.max(a[1], b[1]), loY), hiY);
  if (x2 - x1 < minW) {
    x2 = Math.min(x1 + minW, hiX);
    x1 = Math.max(x2 - minW, loX);
  }
  if (y2 - y1 < minH) {
    y2 = Math.min(y1 + minH, hiY);
    y1 = Math.max(y2 - minH, loY);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export default function EditOverlayTool() {
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const fileBytes = useRef<ArrayBuffer | null>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNo, setPageNo] = useState(1); // 1-based display
  const [overlays, setOverlays] = useState<OverlayOp[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insertType, setInsertType] = useState<InsertType>(null); // mulai di mode pilih
  const [textDraft, setTextDraft] = useState("");
  const [font, setFont] = useState("Helvetica");
  const [fontSize, setFontSize] = useState(24);
  const [colorText, setColorText] = useState("#111827");
  const [colorRect, setColorRect] = useState("#FFFFFF"); // default: putih, menutupi penuh
  const [alphaRect, setAlphaRect] = useState(1); // 0..1, 1 = menutupi penuh
  const [drawPreview, setDrawPreview] = useState<PBox | null>(null);
  const [panelOpen, setPanelOpen] = useState(true); // info overlay aktif
  const [editingId, setEditingId] = useState<string | null>(null); // teks yg sedang diedit inline (klik 2×)

  const [vp, setVp] = useState<pdfjsLib.PageViewport | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isRendering, setRendering] = useState(false);
  const [isProcessing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotWarn, setRotWarn] = useState<string | null>(null);

  const dragState = useRef<Drag | null>(null);
  const vpRef = useRef<pdfjsLib.PageViewport | null>(null);
  vpRef.current = vp; // latest viewport reachable from window-level pointer listeners
  const editRef = useRef<Record<string, HTMLSpanElement | null>>({}); // elemen contentEditable per overlay teks

  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  // ── pdf.js helpers ──
  const renderPage = useCallback(async (pageNo1: number, doc: pdfjsLib.PDFDocumentProxy) => {
    if (!docRef.current) return;
    setRendering(true);
    setError(null);
    setSelectedId(null);
    try {
      const page = await doc.getPage(pageNo1);
      const rot = ((page.rotate % 360) + 360) % 360;
      setRotWarn(rot % 180 === 0 ? null : `Halaman terdeteksi rotasi ${rot}° — overlay mengikuti orientasi asli dokumen (pratinjau mungkin tak sejajar).`);
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
      setError("Gagal merender halaman PDF.");
    } finally {
      setRendering(false);
    }
  }, []);

  const loadFile = useCallback(async (f: File) => {
    setFile({ name: f.name, size: f.size });
    setError(null);
    setSuccess(false);
    setOverlays([]);
    setSelectedId(null);
    setDrawPreview(null);
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
        setError("Maksimal 200 halaman");
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
      setError("Gagal membaca PDF. File mungkin korup atau ber-password.");
    }
  }, []);

  // Render the active page whenever the file loads (numPages flips 0→N) or page changes.
  useEffect(() => {
    setEditingId(null); // editor inline hanya untuk halaman aktif
    if (file && docRef.current && numPages > 0) renderPage(pageNo, docRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, pageNo, numPages]);

  // ── page box in pdf space (used for clamps) ──
  const pdfPageBox = useCallback((v: pdfjsLib.PageViewport): PBox => {
    const [[x0, y0], [x1, y1]] = [v.convertToPdfPoint(0, 0), v.convertToPdfPoint(v.width, v.height)];
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
  }, []);

  // ── create / update / delete ──
  const addOverlay = useCallback((op: Omit<OverlayOp, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const full: OverlayOp = { ...op, id };
    setOverlays((prev) => [...prev, full]);
    setSelectedId(id);
    return id;
  }, []);

  const deleteOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setEditingId((cur) => (cur === id ? null : cur));
  };

  const updateSelected = (patch: Partial<OverlayOp>) => {
    setOverlays((prev) => prev.map((o) => (o.id === selectedId ? { ...o, ...patch } : o)));
  };

  // ── inline text editing (klik 2× pada teks overlay) ──
  const commitText = useCallback((id: string) => {
    const el = editRef.current[id];
    editRef.current[id] = null;
    if (el) {
      const t = (el.textContent ?? "").trim();
      if (t) setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, text: t } : o)));
    }
    setEditingId((cur) => (cur === id ? null : cur));
  }, []);

  const cancelText = useCallback((id: string) => {
    editRef.current[id] = null;
    setEditingId((cur) => (cur === id ? null : cur));
  }, []);

  // saat mulai edit: fokus + caret di akhir teks
  useEffect(() => {
    if (!editingId) return;
    const el = editRef.current[editingId];
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }, [editingId]);

  // ── pointer interactions ──
  // pointerdown on EMPTY canvas → add text (single click) or start drawing a rectangle.
  const handleStageDown = (e: React.PointerEvent) => {
    if (!vp || !file) return;
    if (e.button !== 0) return;
    if (!insertType) {
      // mode pilih: klik area kosong hanya deselect, tidak menambah apa pun.
      setSelectedId(null);
      return;
    }
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    if (insertType === "text") {
      const [x, y] = vp.convertToPdfPoint(cssX, cssY);
      const box = pdfPageBox(vp);
      addOverlay({ type: "text", page: pageNo - 1, x: Math.min(Math.max(x, box.x), box.x + box.width), y: Math.min(Math.max(y, box.y), box.y + box.height), text: textDraft.trim() || "Teks", font: clampFont(font), font_size: fontSize, color: colorText });
      setInsertType(null); // kembali ke mode pilih setelah ditaruh
      return;
    }
    // rectangle: begin drag-draw (preview appears on first pointermove)
    dragState.current = { mode: "draw", page: pageNo - 1, color: colorRect, opacity: alphaRect, wrapLeft: rect.left, wrapTop: rect.top, anchorCss: [cssX, cssY], moved: false, lastX: e.clientX, lastY: e.clientY };
  };

  // pointerdown on an existing overlay → select + start move (unless on a resize handle).
  const handleOverlayDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
    dragState.current = { mode: "move", id, lastX: e.clientX, lastY: e.clientY };
  };

  // ── rectangle resize: corner = 2D, border = 1D (tarik tepi dengan cursor) ──
  const rectHit = (e: React.PointerEvent) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const L = e.clientX - b.left, R = b.right - e.clientX;
    const T = e.clientY - b.top, B = b.bottom - e.clientY;
    const mLR = Math.min(12, Math.max(4, b.width * 0.22));
    const mTB = Math.min(12, Math.max(4, b.height * 0.22));
    const left = L < mLR, right = R < mLR, top = T < mTB, bottom = B < mTB;
    return { corner: (left || right) && (top || bottom), left, right, top, bottom };
  };

  const handleEdgeDown = (e: React.PointerEvent, o: OverlayOp, axis: "x" | "y", side: 1 | -1) => {
    e.stopPropagation();
    e.preventDefault();
    const v = vpRef.current;
    const wr = canvasWrapRef.current?.getBoundingClientRect();
    if (!v || !wr || o.width === undefined || o.height === undefined) return;
    setSelectedId(o.id);
    dragState.current = {
      mode: "edge", id: o.id, axis, side,
      o: { x: o.x, y: o.y, w: o.width, h: o.height },
      wrapLeft: wr.left, wrapTop: wr.top, box: pdfPageBox(v), minW: 8, minH: 8,
    };
  };

  const handleRectDown = (e: React.PointerEvent, o: OverlayOp) => {
    const h = rectHit(e);
    if (h.corner) { handleResizeDown(e, o.id); return; } // dekat sudut → 2D
    if (h.left || h.right) { handleEdgeDown(e, o, "x", h.right ? 1 : -1); return; } // tepi kiri/kanan → lebar
    if (h.top || h.bottom) { handleEdgeDown(e, o, "y", h.top ? 1 : -1); return; } // tepi atas/bawah → tinggi
    handleOverlayDown(e, o.id);
  };

  const handleRectMove = (e: React.PointerEvent) => {
    const h = rectHit(e);
    const el = e.currentTarget as HTMLElement;
    const cur = h.corner ? "nwse-resize" : h.left || h.right ? "ew-resize" : h.top || h.bottom ? "ns-resize" : "move";
    if (el.style.cursor !== cur) el.style.cursor = cur;
  };

  const handleRectLeave = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).style.cursor = "move";
  };

  // pointerdown on a corner handle → resize that rectangle.
  const handleResizeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const v = vpRef.current;
    if (!v) return;
    const op = overlays.find((o) => o.id === id);
    if (!op || op.width === undefined || op.height === undefined) return;
    const wrap = canvasWrapRef.current;
    const wr = wrap?.getBoundingClientRect();
    if (!wr) return;
    // Which pdf corner the pointer is grabbing = nearest of the 4 corners.
    const corners: [number, number][] = [
      [op.x, op.y],
      [op.x + op.width, op.y],
      [op.x, op.y + op.height],
      [op.x + op.width, op.y + op.height],
    ];
    let best = 0, bestD = Infinity;
    corners.forEach((c, i) => {
      const [cx, cy] = v.convertToViewportPoint(c[0], c[1]);
      const d = (cx - (e.clientX - wr.left)) ** 2 + (cy - (e.clientY - wr.top)) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    const dragged = corners[best];
    const fixed = corners[3 - best];
    setSelectedId(id);
    dragState.current = { mode: "resize", id, fixedPdf: fixed, wrapLeft: wr.left, wrapTop: wr.top, minW: 8, minH: 8 };
    void dragged;
  };

  // ── window-level pointermove / pointerup (move, draw, resize) ──
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ds = dragState.current;
      const v = vpRef.current;
      if (!ds || !v) return;
      const box = pdfPageBox(v);

      if (ds.mode === "move") {
        const dx = e.clientX - ds.lastX;
        const dy = e.clientY - ds.lastY;
        if (dx === 0 && dy === 0) return;
        ds.lastX = e.clientX;
        ds.lastY = e.clientY;
        const [x0, y0] = v.convertToPdfPoint(0, 0);
        const [x1, y1] = v.convertToPdfPoint(dx, dy);
        const pdfDx = x1 - x0;
        const pdfDy = y1 - y0;
        setOverlays((prev) =>
          prev.map((o) =>
            o.id === ds.id
              ? { ...o, x: Math.min(Math.max(o.x + pdfDx, box.x), box.x + box.width), y: Math.min(Math.max(o.y + pdfDy, box.y), box.y + box.height) }
              : o
          )
        );
        return;
      }

      const curX = e.clientX - ds.wrapLeft;
      const curY = e.clientY - ds.wrapTop;

      if (ds.mode === "edge") {
        const [px, py] = v.convertToPdfPoint(curX, curY);
        const loX = ds.box.x, hiX = ds.box.x + ds.box.width;
        const loY = ds.box.y, hiY = ds.box.y + ds.box.height;
        if (ds.axis === "x") {
          if (ds.side === 1) {
            const w = Math.min(Math.max(px - ds.o.x, ds.minW), hiX - ds.o.x);
            setOverlays((prev) => prev.map((o) => (o.id === ds.id ? { ...o, width: w } : o)));
          } else {
            const nx = Math.min(Math.max(px, loX), ds.o.x + ds.o.w - ds.minW);
            setOverlays((prev) => prev.map((o) => (o.id === ds.id ? { ...o, x: nx, width: ds.o.x + ds.o.w - nx } : o)));
          }
        } else if (ds.side === 1) {
          const h = Math.min(Math.max(py - ds.o.y, ds.minH), hiY - ds.o.y);
          setOverlays((prev) => prev.map((o) => (o.id === ds.id ? { ...o, height: h } : o)));
        } else {
          const ny = Math.min(Math.max(py, loY), ds.o.y + ds.o.h - ds.minH);
          setOverlays((prev) => prev.map((o) => (o.id === ds.id ? { ...o, y: ny, height: ds.o.y + ds.o.h - ny } : o)));
        }
        return;
      }

      if (ds.mode === "draw") {
        if (!ds.moved && Math.hypot(curX - ds.anchorCss[0], curY - ds.anchorCss[1]) > 4) ds.moved = true;
        ds.lastX = e.clientX;
        ds.lastY = e.clientY;
        const [ax, ay] = v.convertToPdfPoint(ds.anchorCss[0], ds.anchorCss[1]);
        const [bx, by] = v.convertToPdfPoint(curX, curY);
        setDrawPreview(normalizeRect([ax, ay], [bx, by], box, ds.moved ? 2 : 0));
        return;
      }

      if (ds.mode === "resize") {
        const [mx, my] = v.convertToPdfPoint(curX, curY);
        const minW = ds.minW, minH = ds.minH;
        const loX = box.x, loY = box.y, hiX = box.x + box.width, hiY = box.y + box.height;
        let x = Math.min(Math.max(mx, loX), hiX);
        let y = Math.min(Math.max(my, loY), hiY);
        if (Math.abs(x - ds.fixedPdf[0]) < minW) x = x < ds.fixedPdf[0] ? Math.max(ds.fixedPdf[0] - minW, loX) : Math.min(ds.fixedPdf[0] + minW, hiX);
        if (Math.abs(y - ds.fixedPdf[1]) < minH) y = y < ds.fixedPdf[1] ? Math.max(ds.fixedPdf[1] - minH, loY) : Math.min(ds.fixedPdf[1] + minH, hiY);
        const rect = normalizeRect(ds.fixedPdf, [x, y], box, minW, minH);
        setOverlays((prev) => prev.map((o) => (o.id === ds.id ? { ...o, x: rect.x, y: rect.y, width: rect.width, height: rect.height } : o)));
      }
    };

    const onUp = () => {
      const ds = dragState.current;
      dragState.current = null;
      if (ds?.mode === "draw") {
        const v = vpRef.current;
        if (!v) return;
        const box = pdfPageBox(v);
        if (!ds.moved) {
          // Plain click → default-size rectangle below-right of the click.
          const [ax, ay] = v.convertToPdfPoint(ds.anchorCss[0], ds.anchorCss[1]);
          const scale = v.scale;
          const [bx, by] = v.convertToPdfPoint(ds.anchorCss[0] + 140 * scale, ds.anchorCss[1] + 48 * scale);
          setDrawPreview(null);
          addOverlay({ type: "rectangle", page: ds.page, x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay), color: ds.color, opacity: ds.opacity });
          setInsertType(null); // kembali ke mode pilih setelah ditaruh
          return;
        }
        const [ax, ay] = v.convertToPdfPoint(ds.anchorCss[0], ds.anchorCss[1]);
        const [bx, by] = v.convertToPdfPoint(ds.lastX - ds.wrapLeft, ds.lastY - ds.wrapTop);
        const rect = normalizeRect([ax, ay], [bx, by], box, 8, 8);
        setDrawPreview(null);
        addOverlay({ type: "rectangle", page: ds.page, ...rect, color: ds.color, opacity: ds.opacity });
        setInsertType(null); // kembali ke mode pilih setelah ditaruh
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── render-position helpers ──
  const rectCss = (p: PBox, v: pdfjsLib.PageViewport): { left: number; top: number; width: number; height: number } => {
    const [[x0, y0], [x1, y1]] = [v.convertToViewportPoint(p.x, p.y), v.convertToViewportPoint(p.x + p.width, p.y + p.height)];
    return { left: Math.min(x0, x1), top: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
  };

  const textCss = (op: OverlayOp, v: pdfjsLib.PageViewport): { left: number; top: number; fontSize: number } => {
    const [x, y] = v.convertToViewportPoint(op.x, op.y);
    const fontSize = (op.font_size ?? 24) * v.scale;
    return { left: x, top: y - fontSize * 0.8, fontSize };
  };

  const currentOverlays = overlays.filter((o) => o.page === pageNo - 1);

  // ── submit ──
  const handleApply = async () => {
    if (!file || !fileBytes.current) return;
    if (overlays.length === 0) {
      setError("Tambahkan dulu teks atau Block di halaman.");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const blob = new Blob([fileBytes.current], { type: "application/pdf" });
      const opsJson = JSON.stringify(
        overlays.map((o) => {
          const base = { type: o.type, page: o.page + 1, x: Number(o.x.toFixed(2)), y: Number(o.y.toFixed(2)) };
          if (o.type === "rectangle") {
            return { ...base, width: Number((o.width ?? 0).toFixed(2)), height: Number((o.height ?? 0).toFixed(2)), color: o.color, opacity: o.opacity ?? 1 };
          }
          return { ...base, text: o.text, font: clampFont(o.font), font_size: o.font_size, color: o.color };
        })
      );
      const formData = new FormData();
      formData.append("file", blob, file.name);
      formData.append("operations", opsJson);

      const response = await api.post("/api/pdf/edit-overlay", formData, { responseType: "blob" });
      const overlayCount = parseInt(response.headers["x-overlay-count"] || "0");

      const stem = file.name.replace(/\.[^/.]+$/, "");
      downloadBlob(response.data as Blob, response.headers["content-disposition"] as string, `${stem}_edited.pdf`);

      if (overlayCount !== overlays.length) {
        setError(`Perhatian: ${overlayCount}/${overlays.length} overlay diproses.`);
      }
      setSuccess(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const detail = errorDetail(err);
      setError(detail ? `[${status}] ${detail}` : "Gagal memproses. Coba lagi.");
    } finally {
      setProcessing(false);
    }
  };

  const resetAll = () => {
    if (docRef.current) docRef.current.destroy();
    docRef.current = null;
    fileBytes.current = null;
    dragState.current = null;
    setFile(null);
    setNumPages(0);
    setPageNo(1);
    setOverlays([]);
    setSelectedId(null);
    setEditingId(null);
    setDrawPreview(null);
    setSuccess(false);
    setError(null);
    setVp(null);
    setRotWarn(null);
  };

  const targetType = selected?.type ?? insertType; // "text" | "rectangle" | null
  const selectedIsText = targetType === "text";

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {isProcessing && <LoadingOverlay />}

      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-amber-50/50 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <StampIcon size={20} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Edit / Anotasi PDF</h2>
            <p className="text-sm text-slate-500">Klik utk menambah teks/Block — langsung bisa digeser & diubah ukurannya</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Pilih file PDF untuk dianotasi"
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-amber-400 hover:bg-amber-50/30 transition-all cursor-pointer focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
            onClick={() => document.getElementById("edit-file-input")?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("edit-file-input")?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) loadFile(f);
            }}
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} className="text-amber-500" />
            </div>
            <p className="text-slate-700 font-semibold mb-1">Pilih file PDF untuk dianotasi</p>
            <p className="text-slate-500 text-xs">PDF only • Maks 30MB • hingga 200 halaman</p>
            <input
              type="file"
              id="edit-file-input"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
              }}
            />
          </div>
        ) : (
          <>
            {/* file bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                  <FileText size={16} className="text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(file.size)} • {numPages} halaman • {overlays.length} overlay
                  </p>
                </div>
              </div>
              <button
                onClick={resetAll}
                className="text-xs text-amber-700 hover:text-amber-800 font-medium px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
              >
                Ganti File
              </button>
            </div>

            {/* insert-type chips */}
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white border border-slate-200 rounded-xl">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Tambah:</span>
              <button
                onClick={() => setInsertType((cur) => (cur === "text" ? null : "text"))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  insertType === "text" ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Type size={15} /> Teks
              </button>
              <button
                onClick={() => setInsertType((cur) => (cur === "rectangle" ? null : "rectangle"))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  insertType === "rectangle" ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Square size={15} /> Block
              </button>
              <span className="ml-auto text-xs text-slate-400 hidden sm:inline">Setelah dibuat, overlay langsung bisa digeser / diubah ukuran</span>
            </div>

            {/* property bar — tampil saat ada tool aktif atau overlay terpilih; netral = strip mode pilih */}
            {selected || insertType !== null ? (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              {selectedIsText ? (
                <>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Teks
                    <input
                      value={selected?.text ?? textDraft}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTextDraft(v);
                        if (selected?.type === "text") updateSelected({ text: v });
                      }}
                      placeholder="Ketik teks…"
                      className="border border-slate-300 rounded-lg px-2 py-1.5 w-48 text-slate-800"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Font
                    <select
                      value={selected?.font ?? font}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFont(v);
                        if (selected?.type === "text") updateSelected({ font: v });
                      }}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700"
                    >
                      <optgroup label="Font standar">
                        {BASE14_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </optgroup>
                      <optgroup label="Font gratis (open license)">
                        {OPEN_LICENSE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </optgroup>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Ukuran
                    <input
                      type="number"
                      min={8}
                      max={72}
                      value={selected?.font_size ?? fontSize}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setFontSize(v);
                        if (selected?.type === "text") updateSelected({ font_size: v });
                      }}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 w-16 text-slate-800"
                    />
                  </label>
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Block:</span>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Opacity (100% = menutupi teks di bawah)
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={Math.round((selected?.opacity ?? alphaRect) * 100)}
                      onChange={(e) => {
                        const v = Number(e.target.value) / 100;
                        setAlphaRect(v);
                        if (selected?.type === "rectangle") updateSelected({ opacity: v });
                      }}
                      className="w-28 accent-amber-500"
                    />
                    <span className="text-slate-700 w-9 font-semibold">{Math.round((selected?.opacity ?? alphaRect) * 100)}%</span>
                  </label>
                </>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-600 ml-1">
                Warna
                <input
                  type="color"
                  value={selected?.color ?? (selectedIsText ? colorText : colorRect)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (selectedIsText) setColorText(v); else setColorRect(v);
                    if (selected) updateSelected({ color: v });
                  }}
                  className="w-8 h-8 rounded cursor-pointer border border-slate-300"
                />
              </label>

              {selected && (
                <button
                  onClick={() => deleteOverlay(selected.id)}
                  className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 size={14} /> Hapus
                </button>
              )}
            </div>
            ) : (
              <div className="flex items-center gap-2 mb-4 p-3 bg-slate-100/60 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500">
                <MousePointer2 size={16} className="text-slate-400 flex-shrink-0" />
                <span>
                  Mode pilih — klik 2× teks utk ubah · seret teks utk pindah · arahkan ke tepi / sudut Block utk ubah ukuran. Pilih{" "}
                  <b className="text-slate-600">Teks</b> atau <b className="text-slate-600">Block</b> utk menambah.
                </span>
              </div>
            )}

            {/* panel informasi overlay aktif — di atas display dokumen, collapsible */}
            <div className="mb-3 bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setPanelOpen((o) => !o)}
                aria-expanded={panelOpen}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-amber-50/60 transition-colors"
              >
                <ListChecks size={16} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-bold text-slate-800">Overlay Aktif</span>
                <span className="text-[11px] font-bold text-white bg-amber-500 rounded-full px-2 py-0.5 min-w-5 text-center">
                  {overlays.length}
                </span>
                <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-amber-700">
                  {panelOpen ? "Tutup" : "Buka"}
                  <ChevronDown size={15} className={`transition-transform duration-200 ${panelOpen ? "rotate-180" : ""}`} />
                </span>
              </button>

              {panelOpen && (
                <div className="border-t border-amber-100 max-h-72 overflow-y-auto scrollbar-thin">
                  {overlays.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-slate-500 italic leading-relaxed">
                      Belum ada overlay. Klik pada halaman untuk menambah teks, atau tekan-drag untuk Block.
                      Semua overlay yang dibuat muncul di daftar ini dan bisa dihapus dari sini.
                    </p>
                  ) : (
                    overlays.map((o, idx) => {
                      const isRect = o.type === "rectangle";
                      const isSel = o.id === selectedId;
                      return (
                        <div
                          key={o.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedId(o.id);
                            if (o.page + 1 !== pageNo) setPageNo(o.page + 1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedId(o.id);
                              setPageNo(o.page + 1);
                            }
                          }}
                          className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-amber-50 ${
                            isSel ? "bg-amber-100/70" : ""
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 ${
                              isSel ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-600"
                            }`}
                          >
                            {isRect ? <Square size={14} /> : <Type size={14} />}
                          </span>

                          <div className="flex-1 min-w-0 leading-tight">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-bold text-slate-400 flex-shrink-0">{idx + 1}.</span>
                              <span className="font-bold text-slate-800">{isRect ? "Block" : "Teks"}</span>
                              <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-px">
                                Hal {o.page + 1}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 truncate mt-1">
                              {isRect ? (
                                <>
                                  Ukuran{" "}
                                  <b className="text-slate-700">
                                    {Number((o.width ?? 0).toFixed(1))} × {Number((o.height ?? 0).toFixed(1))} pt
                                  </b>
                                  {" · "}Opacity{" "}
                                  <b className="text-slate-700">{Math.round((o.opacity ?? 1) * 100)}%</b>
                                </>
                              ) : (
                                <>
                                  “{o.text}” · <b className="text-slate-700">{o.font}</b> {o.font_size}pt
                                </>
                              )}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 min-w-0">
                              <span
                                className="w-3 h-3 rounded-sm border border-slate-300 inline-block flex-shrink-0"
                                style={{
                                  background: isRect
                                    ? hexToRgba(o.color ?? "#FFFFFF", o.opacity ?? 1)
                                    : o.color ?? "#111827",
                                }}
                              />
                              <span className="uppercase font-mono">{o.color}</span>
                              <span className="ml-auto flex-shrink-0">
                                pos x {Math.round(o.x)} · y {Math.round(o.y)}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteOverlay(o.id);
                            }}
                            aria-label={`Hapus ${isRect ? "Block" : "teks"} nomor ${idx + 1}`}
                            className="mt-1 p-1.5 rounded-lg text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors flex-shrink-0"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {rotWarn && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg">
                {rotWarn}
              </div>
            )}

            {/* canvas + overlay */}
            <div ref={stageRef} className="bg-slate-200/70 rounded-xl border border-slate-300/60 p-4 mb-4 relative">
              {isRendering && (
                <div className="absolute inset-0 z-30 bg-white/80 flex items-center justify-center rounded-xl">
                  <Loader2 size={28} className="animate-spin text-amber-500" />
                </div>
              )}

              {/* page nav */}
              <div className="flex items-center justify-center gap-3 mb-3">
                <button
                  onClick={() => setPageNo((p) => Math.max(1, p - 1))}
                  disabled={pageNo <= 1}
                  aria-label="Halaman sebelumnya"
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-semibold text-slate-700">
                  Halaman {pageNo} / {numPages}
                </span>
                <button
                  onClick={() => setPageNo((p) => Math.min(numPages, p + 1))}
                  disabled={pageNo >= numPages}
                  aria-label="Halaman berikutnya"
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div
                ref={canvasWrapRef}
                onPointerDown={handleStageDown}
                className="relative mx-auto w-fit shadow-lg bg-white select-none touch-none"
                style={{
                  cursor: insertType === "text" ? "text" : insertType === "rectangle" ? "crosshair" : "default",
                }}
              >
                <canvas ref={canvasRef} className="block" style={{ width: vp?.width ?? 0, height: vp?.height ?? 0 }} />

                {/* in-progress rectangle draw */}
                {drawPreview && vp && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      ...rectCss(drawPreview, vp),
                      background: hexToRgba(insertType === "rectangle" ? colorRect : "#94a3b8", 0.25),
                      outline: "1.5px dashed #f59e0b",
                    }}
                  />
                )}

                {!isRendering &&
                  currentOverlays.map((o) =>
                    o.type === "rectangle" ? (
                      <div
                        key={o.id}
                        onPointerDown={(e) => handleRectDown(e, o)}
                        onPointerMove={handleRectMove}
                        onPointerLeave={handleRectLeave}
                        className="absolute"
                        style={{
                          ...rectCss({ x: o.x!, y: o.y!, width: o.width!, height: o.height! }, vp!),
                          background: hexToRgba(o.color ?? "#FFFFFF", o.opacity ?? 1),
                          outline: selectedId === o.id ? "1.5px dashed #f59e0b" : "none",
                          cursor: "move",
                        }}
                        title="Seret tepi / sudut utk ubah ukuran"
                        aria-label="Block"
                      >
                        {selectedId === o.id &&
                          [
                            [o.x, o.y],
                            [o.x + o.width!, o.y],
                            [o.x, o.y + o.height!],
                            [o.x + o.width!, o.y + o.height!],
                          ].map((c, i) => {
                            const [hx, hy] = vp!.convertToViewportPoint(c[0], c[1]);
                            return (
                              <span
                                key={i}
                                onPointerDown={(e) => handleResizeDown(e, o.id)}
                                onPointerMove={(e) => e.stopPropagation()}
                                className="absolute w-4 h-4 flex items-center justify-center cursor-nwse-resize"
                                style={{ left: hx - 8, top: hy - 8 }}
                              >
                                <span className="w-2 h-2 bg-white border-2 border-amber-500 rounded-full block shadow-md" />
                              </span>
                            );
                          })}
                      </div>
                    ) : (
                      <div
                        key={o.id}
                        onPointerDown={(e) => {
                          if (editingId === o.id) {
                            e.stopPropagation(); // sedang edit: biarkan seleksi teks, jangan geser
                            return;
                          }
                          handleOverlayDown(e, o.id);
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedId(o.id);
                          setEditingId(o.id);
                        }}
                        className="absolute whitespace-nowrap"
                        style={{
                          ...textCss(o, vp!),
                          fontFamily: FONT_FAMILY[o.font ?? "Helvetica"] ?? FONT_FAMILY.Helvetica,
                          fontWeight: selectedId === o.id ? "bold" : "normal",
                          color: o.color ?? "#111827",
                          background:
                            editingId === o.id
                              ? "rgba(255,255,255,0.92)"
                              : selectedId === o.id
                              ? "rgba(255,255,255,0.35)"
                              : "none",
                          outline: editingId === o.id ? "1.5px solid #f59e0b" : selectedId === o.id ? "1px dashed #f59e0b" : "none",
                          padding: "0 2px",
                          cursor: editingId === o.id ? "text" : "move",
                        }}
                        title="Klik 2× utk mengubah teks langsung"
                        aria-label="Teks overlay"
                      >
                        {editingId === o.id ? (
                          <span
                            ref={(el) => {
                              editRef.current[o.id] = el;
                            }}
                            contentEditable
                            suppressContentEditableWarning
                            role="textbox"
                            aria-label="Ubah teks overlay"
                            className="inline-block outline-none"
                            style={{ minWidth: 24, minHeight: 16, caretColor: "#d97706", whiteSpace: "pre-wrap" }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitText(o.id);
                              } else if (e.key === "Escape") {
                                cancelText(o.id);
                              }
                            }}
                            onBlur={() => commitText(o.id)}
                          >
                            {o.text}
                          </span>
                        ) : (
                          o.text
                        )}
                      </div>
                    )
                  )}
              </div>

              <p className="text-center text-xs text-slate-500 mt-3">
                {insertType === "text"
                  ? "👆 Klik halaman utk tambah teks — otomatis kembali mode pilih · klik 2× teks utk ubah langsung"
                  : insertType === "rectangle"
                  ? "👆 Tekan-drag utk gambar Block · klik biasa = Block default — setelah ditaruh, tarik tepi / sudutnya utk ubah ukuran"
                  : "👆 Mode pilih · klik 2× teks utk ubah · seret utk pindah · pilih Teks / Block utk menambah"}
              </p>
            </div>

            {/* action */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                {success ? "✅ Selesai — file terunduh" : overlays.length === 0 ? "⚠️ Belum ada overlay" : `✅ ${overlays.length} overlay siap`}
              </p>
              {success ? (
                <button
                  onClick={resetAll}
                  className="flex items-center gap-2 bg-white border-2 border-amber-200 text-amber-700 px-6 py-2.5 rounded-xl font-semibold hover:bg-amber-50 transition-all"
                >
                  <Download size={16} />
                  Proses Dokumen Lainnya
                </button>
              ) : (
                <button
                  onClick={handleApply}
                  disabled={overlays.length === 0 || isProcessing}
                  className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 disabled:shadow-none"
                >
                  <Download size={16} />
                  Apply & Download
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <SecurityFooter />
    </div>
  );
}
