import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, filenameFromDisposition } from "./download";

describe("filenameFromDisposition", () => {
  it("nama biasa, dengan/tanpa kutip", () => {
    expect(filenameFromDisposition('attachment; filename="merged.pdf"')).toBe("merged.pdf");
    expect(filenameFromDisposition("attachment; filename=laporan.pdf")).toBe("laporan.pdf");
  });
  it("filename* (RFC 5987) menang dan didecode (non-ASCII)", () => {
    const h = "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''Laporan%20Bulan%20Ini%20%E2%80%94%20final.pdf";
    expect(filenameFromDisposition(h)).toBe("Laporan Bulan Ini — final.pdf");
  });
  it("filename* rusak jatuh ke nama biasa", () => {
    expect(filenameFromDisposition("attachment; filename=\"ok.pdf\"; filename*=UTF-8''%E0%A4%A")).toBe("ok.pdf");
  });
  it("fallback bila header kosong / tak ada nama", () => {
    expect(filenameFromDisposition(undefined)).toBe("download.pdf");
    expect(filenameFromDisposition("attachment", "x.pdf")).toBe("x.pdf");
  });
});

describe("downloadBlob", () => {
  afterEach(() => vi.restoreAllMocks());

  it("membuat anchor dengan nama dari header, klik, lalu bersihkan URL", () => {
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadBlob(new Blob(["x"]), 'attachment; filename="hasil.pdf"');
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("hasil.pdf");
    expect(anchor.href).toBe("blob:fake");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull(); // anchor dilepas dari DOM
  });
});
