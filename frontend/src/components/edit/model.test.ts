import { describe, expect, it } from "vitest";
import { clampFont, hexToRgba, normalizeRect, serializeOps, ALL_FONTS, type OverlayOp } from "./model";

const BOX = { x: 0, y: 0, width: 595, height: 842 };

describe("serializeOps (kontrak ke backend)", () => {
  const text: OverlayOp = { id: "a", type: "text", page: 0, x: 72.126, y: 600.999, text: "Halo", font: "Lato", font_size: 18, color: "#111827" };
  const rect: OverlayOp = { id: "b", type: "rectangle", page: 2, x: 10, y: 20, width: 100.456, height: 50, color: "#FFFFFF", opacity: 0.5 };

  it("teks: page 1-based, koordinat 2 desimal, tanpa field id", () => {
    expect(serializeOps([text])).toEqual([
      { type: "text", page: 1, x: 72.13, y: 601, text: "Halo", font: "Lato", font_size: 18, color: "#111827" },
    ]);
  });
  it("rectangle: width/height dibulatkan, opacity default 1", () => {
    expect(serializeOps([rect])[0]).toEqual({ type: "rectangle", page: 3, x: 10, y: 20, width: 100.46, height: 50, color: "#FFFFFF", opacity: 0.5 });
    expect(serializeOps([{ ...rect, opacity: undefined }])[0]).toMatchObject({ opacity: 1 });
  });
  it("font tak dikenal di-clamp ke Helvetica (backend menolak 400)", () => {
    expect(serializeOps([{ ...text, font: "Comic Sans" }])[0]).toMatchObject({ font: "Helvetica" });
    expect(serializeOps([{ ...text, font: undefined }])[0]).toMatchObject({ font: "Helvetica" });
  });
  it("urutan input dipertahankan", () => {
    expect(serializeOps([rect, text]).map((o) => o.type)).toEqual(["rectangle", "text"]);
  });
});

describe("clampFont", () => {
  it.each(ALL_FONTS)("%s lolos", (f) => expect(clampFont(f)).toBe(f));
  it("hantu → Helvetica", () => expect(clampFont("???")).toBe("Helvetica"));
});

describe("normalizeRect", () => {
  it("dua sudut berlawanan, urutan bebas", () => {
    expect(normalizeRect([100, 200], [50, 120], BOX)).toEqual({ x: 50, y: 120, width: 50, height: 80 });
  });
  it("di-clamp ke kotak halaman", () => {
    expect(normalizeRect([-50, -50], [700, 900], BOX)).toEqual({ x: 0, y: 0, width: 595, height: 842 });
  });
  it("ukuran minimum 8 dipaksakan, tetap di dalam halaman", () => {
    expect(normalizeRect([10, 10], [11, 11], BOX)).toEqual({ x: 10, y: 10, width: 8, height: 8 });
    const edge = normalizeRect([594, 841], [595, 842], BOX);
    expect(edge.x + edge.width).toBeLessThanOrEqual(595);
    expect(edge.width).toBe(8);
  });
});

describe("hexToRgba", () => {
  it("6 digit dan 3 digit", () => {
    expect(hexToRgba("#ff8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(hexToRgba("#f80", 1)).toBe("rgba(255, 136, 0, 1)");
  });
});
