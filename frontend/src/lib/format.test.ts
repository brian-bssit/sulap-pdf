import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 Bytes"],
    [512, "512 Bytes"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1 MB"],
    [30 * 1024 * 1024, "30 MB"],
    [5 * 1024 ** 3, "5 GB"],
    [5 * 1024 ** 4, "5120 GB"], // dikunci di GB, tidak keluar tabel satuan
  ])("%d → %s", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});
