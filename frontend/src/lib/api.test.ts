import type { InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "./api";

const assign = vi.fn();

// jsdom (versi ini) belum punya Blob.prototype.text; browser sungguhan punya.
if (!Blob.prototype.text) {
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.readAsText(this);
    });
  };
}

function setPath(pathname: string) {
  Object.defineProperty(window, "location", { value: { pathname, assign }, writable: true });
}

// Adapter palsu: menolak dengan bentuk error axios (config + response).
function failWith(status: number, data: unknown, responseType?: "blob", headers: Record<string, string> = {}) {
  api.defaults.adapter = (config: InternalAxiosRequestConfig) =>
    Promise.reject({ config: { ...config, responseType }, response: { status, data, headers, config } });
}

describe("interceptor respons", () => {
  beforeEach(() => {
    assign.mockReset();
    setPath("/dashboard");
  });

  it("401 pada endpoint non-auth → redirect ke halaman login (/)", async () => {
    failWith(401, {});
    await expect(api.get("/api/pdf/compress")).rejects.toBeTruthy();
    expect(assign).toHaveBeenCalledWith("/");
  });

  it.each([
    ["SESSION_IDLE", "/?error=session_idle"],
    ["SESSION_REPLACED", "/?error=session_replaced"],
    ["SESSION_INVALID", "/?error=session_invalid"],
    ["ALASAN_ASING", "/"],
  ])("401 dengan X-Auth-Reason %s → %s", async (reason, target) => {
    failWith(401, {}, undefined, { "x-auth-reason": reason });
    await expect(api.get("/api/pdf/compress")).rejects.toBeTruthy();
    expect(assign).toHaveBeenCalledWith(target);
  });

  it("401 pada /api/auth/* tidak redirect (mis. cek /me di halaman login)", async () => {
    failWith(401, {});
    await expect(api.get("/api/auth/me")).rejects.toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["/login", "/"])("401 saat sudah di %s tidak redirect berulang", async (p) => {
    setPath(p);
    failWith(401, {});
    await expect(api.get("/api/pdf/compress")).rejects.toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it("error berbentuk Blob JSON di-parse jadi {detail}", async () => {
    failWith(422, new Blob([JSON.stringify({ detail: "PDF terkunci" })]), "blob");
    const e = await api.post("/api/pdf/compress", {}, { responseType: "blob" }).catch((x) => x);
    expect(e.response.data).toEqual({ detail: "PDF terkunci" });
  });

  it("Blob non-JSON (mis. HTML proxy) dibiarkan Blob", async () => {
    failWith(502, new Blob(["<html>bad gateway</html>"]), "blob");
    const e = await api.post("/api/pdf/compress", {}, { responseType: "blob" }).catch((x) => x);
    expect(e.response.data).toBeInstanceOf(Blob);
  });
});

describe("request", () => {
  it("FormData dikirim apa adanya (bukan di-serialize jadi JSON/urlencoded)", async () => {
    let body: unknown;
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      body = config.data;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "a.pdf");
    await api.post("/api/pdf/merge", fd);
    expect(body).toBeInstanceOf(FormData);
  });
});
