import type { PageViewport } from "pdfjs-dist";

// Must match whitelist in backend/pdf/edit_overlay.py (ALL_FONTS).
// Satu daftar datar — semua font setara, tanpa pengelompokan "standar"/"open license".
export const ALL_FONTS = [
  "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Times-Roman", "Times-Bold",
  "Times-Italic", "Courier", "Courier-Bold", "Lato", "DejaVu Sans", "DejaVu Serif",
  "DejaVu Sans Mono",
];
const FONT_SET = new Set(ALL_FONTS);
// Backend whitelist menolak font tak dikenal (400). Clamp nilai basi/hantu ke
// Helvetica supaya op lama tak gagal kirim.
export const clampFont = (f?: string) => (f && FONT_SET.has(f) ? f : "Helvetica");
export const FONT_FAMILY: Record<string, string> = {
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
export type InsertType = "text" | "rectangle" | null;
export type PBox = { x: number; y: number; width: number; height: number };

export interface OverlayOp {
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
export type Drag =
  | { mode: "move"; id: string; lastX: number; lastY: number }
  | { mode: "draw"; page: number; color: string; opacity: number; wrapLeft: number; wrapTop: number; anchorCss: [number, number]; moved: boolean; lastX: number; lastY: number }
  | { mode: "resize"; id: string; fixedPdf: [number, number]; wrapLeft: number; wrapTop: number; minW: number; minH: number }
  | { mode: "edge"; id: string; axis: "x" | "y"; side: 1 | -1; o: { x: number; y: number; w: number; h: number }; wrapLeft: number; wrapTop: number; box: PBox; minW: number; minH: number };

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** PDF rect spanned by two opposite corners, normalized + clamped to the page box. */
export function normalizeRect(a: [number, number], b: [number, number], box: PBox, minW = 8, minH = 8): PBox {
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

/** Kotak halaman di ruang PDF (dipakai untuk clamp). */
export function pdfPageBox(v: PageViewport): PBox {
  const [[x0, y0], [x1, y1]] = [v.convertToPdfPoint(0, 0), v.convertToPdfPoint(v.width, v.height)];
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

export function rectCss(p: PBox, v: PageViewport): { left: number; top: number; width: number; height: number } {
  const [[x0, y0], [x1, y1]] = [v.convertToViewportPoint(p.x, p.y), v.convertToViewportPoint(p.x + p.width, p.y + p.height)];
  return { left: Math.min(x0, x1), top: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

export function textCss(op: OverlayOp, v: PageViewport): { left: number; top: number; fontSize: number } {
  const [x, y] = v.convertToViewportPoint(op.x, op.y);
  const fontSize = (op.font_size ?? 24) * v.scale;
  return { left: x, top: y - fontSize * 0.8, fontSize };
}

/** Bentuk yang dikirim ke POST /api/pdf/edit-overlay (page 1-based, koordinat dibulatkan 2 desimal). */
export function serializeOps(overlays: OverlayOp[]) {
  return overlays.map((o) => {
    const base = { type: o.type, page: o.page + 1, x: Number(o.x.toFixed(2)), y: Number(o.y.toFixed(2)) };
    if (o.type === "rectangle") {
      return { ...base, width: Number((o.width ?? 0).toFixed(2)), height: Number((o.height ?? 0).toFixed(2)), color: o.color, opacity: o.opacity ?? 1 };
    }
    return { ...base, text: o.text, font: clampFont(o.font), font_size: o.font_size, color: o.color };
  });
}
