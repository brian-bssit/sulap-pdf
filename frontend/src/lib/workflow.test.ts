import { describe, expect, it, vi } from "vitest";
import { ChainError, parsePages, runChain, validateChain, type Post, type Step } from "./workflow";

const file = new File(["%PDF-asli"], "a.pdf", { type: "application/pdf" });
const step = (id: Step["id"], options = {}): Step => ({ id, options });
const ok = (content: string, name: string) => ({ data: new Blob([content]), headers: { "content-disposition": `attachment; filename="${name}"` } });

describe("parsePages", () => {
  it("1-based → 0-based, terurut tanpa duplikat", () => {
    expect(parsePages("2, 4-5,2")).toEqual([1, 3, 4]);
    expect(parsePages("1")).toEqual([0]);
  });
  it.each(["", "0", "a", "3-1", "1--2", ",", "1-99999"])("menolak %j", (s) => expect(parsePages(s)).toBeNull());
});

describe("validateChain", () => {
  it("jumlah langkah 2–5", () => {
    expect(validateChain([step("scrub")])).toBe("count");
    expect(validateChain(Array.from({ length: 6 }, () => step("scrub")))).toBe("count");
    expect(validateChain([step("scrub"), step("compress")])).toBeNull();
  });
  it("protect hanya di akhir, unlock hanya di awal", () => {
    expect(validateChain([step("protect"), step("compress")])).toBe("protect-last");
    expect(validateChain([step("compress"), step("protect")])).toBeNull();
    expect(validateChain([step("compress"), step("unlock")])).toBe("unlock-first");
    expect(validateChain([step("unlock"), step("compress")])).toBeNull();
  });
});

describe("runChain", () => {
  it("berurutan; keluaran langkah n jadi masukan langkah n+1; progres dilaporkan", async () => {
    const calls: { url: string; size: number; name: string }[] = [];
    const post: Post = vi.fn(async (url, form) => {
      const f = form.get("file") as File;
      calls.push({ url, size: f.size, name: f.name });
      return ok("x".repeat(calls.length * 100), `hasil${calls.length}.pdf`);
    });
    const prog = vi.fn();
    const out = await runChain(file, [step("scrub"), step("watermark", { text: "RAHASIA" }), step("protect", { password: "rahasia-123" })], post, prog);
    expect(calls.map((c) => c.url)).toEqual(["/api/pdf/scrub-metadata", "/api/pdf/watermark", "/api/pdf/protect"]);
    expect(calls.map((c) => c.size)).toEqual([file.size, 100, 200]); // keluaran sebelumnya → masukan berikutnya
    expect(calls.map((c) => c.name)).toEqual(["a.pdf", "hasil1.pdf", "hasil2.pdf"]);
    expect(out.filename).toBe("hasil3.pdf");
    expect(out.blob.size).toBe(300);
    expect(prog.mock.calls).toEqual([[0, 3], [1, 3], [2, 3]]);
  });

  it("opsi langkah terkirim: watermark text, remove-pages 0-based, protect password", async () => {
    const forms: Record<string, FormData> = {};
    const post: Post = async (url, form) => { forms[url] = form; return ok("x", "a.pdf"); };
    await runChain(file, [step("remove-pages", { pages: "2,4-5" }), step("watermark", { text: "DRAFT" }), step("protect", { password: "rahasia-123" })], post);
    expect(JSON.parse(forms["/api/pdf/remove-pages"].get("pages_to_remove") as string)).toEqual([1, 3, 4]);
    expect(forms["/api/pdf/watermark"].get("text")).toBe("DRAFT");
    expect(forms["/api/pdf/protect"].get("password")).toBe("rahasia-123");
  });

  it("berhenti di langkah yang gagal, langkah setelahnya tidak dipanggil, pesan menyebut langkah", async () => {
    const post = vi.fn<Post>(async (url) => {
      if (url.includes("watermark")) throw new Error("Teks watermark 1–100 karakter");
      return ok("x", "a.pdf");
    });
    const err = await runChain(file, [step("scrub"), step("watermark"), step("protect", { password: "rahasia-123" })], post).catch((e) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect(err).toMatchObject({ stepIndex: 1, stepId: "watermark", detail: "Teks watermark 1–100 karakter" });
    expect(post).toHaveBeenCalledTimes(2);
  });
});
