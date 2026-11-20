import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/strings";
import { clampFont, normalizeRect, pdfPageBox, type Drag, type InsertType, type OverlayOp, type PBox } from "./model";
import type { EditorDocument } from "./useEditorDocument";

/** Status overlay + interaksi pointer (tambah, geser, ubah ukuran, edit teks inline) di atas dokumen aktif. */
export function useOverlayEditor(doc: EditorDocument) {
  const { vp, vpRef, file, pageNo } = doc;
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
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<Drag | null>(null);
  const editRef = useRef<Record<string, HTMLSpanElement | null>>({}); // elemen contentEditable per overlay teks

  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  // Ganti halaman / muat berkas: seleksi & editor inline hanya berlaku untuk halaman aktif.
  useEffect(() => {
    setEditingId(null);
  }, [doc.file, doc.pageNo, doc.numPages]);
  useEffect(() => {
    if (doc.isRendering) setSelectedId(null); // renderPage dulu mengosongkan seleksi di awal render
  }, [doc.isRendering]);

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

  /** Kosongkan semua overlay & status interaksi (berkas baru / ganti berkas). */
  const clear = useCallback(() => {
    dragState.current = null;
    setOverlays([]);
    setSelectedId(null);
    setEditingId(null);
    setDrawPreview(null);
  }, []);

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
      addOverlay({ type: "text", page: pageNo - 1, x: Math.min(Math.max(x, box.x), box.x + box.width), y: Math.min(Math.max(y, box.y), box.y + box.height), text: textDraft.trim() || t.edit.defaultText, font: clampFont(font), font_size: fontSize, color: colorText });
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
    const fixed = corners[3 - best];
    setSelectedId(id);
    dragState.current = { mode: "resize", id, fixedPdf: fixed, wrapLeft: wr.left, wrapTop: wr.top, minW: 8, minH: 8 };
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

  const currentOverlays = overlays.filter((o) => o.page === pageNo - 1);
  const targetType = selected?.type ?? insertType; // "text" | "rectangle" | null

  return {
    overlays, selectedId, setSelectedId, selected, currentOverlays,
    insertType, setInsertType, targetType, selectedIsText: targetType === "text",
    textDraft, setTextDraft, font, setFont, fontSize, setFontSize,
    colorText, setColorText, colorRect, setColorRect, alphaRect, setAlphaRect,
    drawPreview, panelOpen, setPanelOpen, editingId, setEditingId, editRef, canvasWrapRef,
    deleteOverlay, updateSelected, clear, commitText, cancelText,
    handleStageDown, handleOverlayDown, handleRectDown, handleRectMove, handleRectLeave, handleResizeDown,
  };
}

export type OverlayEditor = ReturnType<typeof useOverlayEditor>;
