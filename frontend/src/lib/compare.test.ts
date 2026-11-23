import { describe, expect, it } from "vitest";
import { sideOps } from "./compare";

const ops = [
  { t: "eq", text: "Saldo" }, { t: "del", text: "100" }, { t: "add", text: "250" }, { t: "eq", text: "juta" },
] as const;

describe("sideOps", () => {
  it("kiri tanpa tambahan, kanan tanpa penghapusan", () => {
    expect(sideOps([...ops], "a").map((o) => o.text).join(" ")).toBe("Saldo 100 juta");
    expect(sideOps([...ops], "b").map((o) => o.text).join(" ")).toBe("Saldo 250 juta");
  });
  it("kosong", () => expect(sideOps([], "a")).toEqual([]));
});
