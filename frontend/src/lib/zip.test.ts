import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "./zip";

const bytes = (s: string) => new TextEncoder().encode(s);
// jsdom: Blob tanpa arrayBuffer()
const read = (b: Blob) => new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(b); });

describe("zip", () => {
  it("crc32 nilai baku", () => {
    expect(crc32(bytes("hello"))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("struktur: EOCD, direktori pusat, offset & isi berkas", async () => {
    const blob = zipStore([{ name: "a.txt", data: bytes("hello") }, { name: "bagian/ü.png", data: bytes("xyz") }]);
    const buf = new Uint8Array(await read(blob));
    const dv = new DataView(buf.buffer);
    const eocd = buf.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    expect(dv.getUint16(eocd + 10, true)).toBe(2);
    let p = dv.getUint32(eocd + 16, true); // awal direktori pusat
    const got: string[] = [];
    for (let i = 0; i < 2; i++) {
      expect(dv.getUint32(p, true)).toBe(0x02014b50);
      const size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
      expect(dv.getUint32(off, true)).toBe(0x04034b50); // header lokal tepat di offset
      const start = off + 30 + nameLen;
      expect(dv.getUint32(p + 16, true)).toBe(crc32(buf.subarray(start, start + size)));
      got.push(`${name}=${new TextDecoder().decode(buf.subarray(start, start + size))}`);
      p += 46 + nameLen;
    }
    expect(got).toEqual(["a.txt=hello", "bagian/ü.png=xyz"]);
  });
});
