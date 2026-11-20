import { describe, expect, it } from "vitest";
import { errorDetail } from "./error";

const err = (data: unknown) => ({ response: { data } });

describe("errorDetail", () => {
  it("detail string apa adanya", () => {
    expect(errorDetail(err({ detail: "File terlalu besar" }))).toBe("File terlalu besar");
  });
  it("detail array/objek (422 FastAPI) jadi JSON string", () => {
    expect(errorDetail(err({ detail: [{ msg: "x" }] }))).toBe('[{"msg":"x"}]');
  });
  it.each([
    ["tanpa response", undefined],
    ["data bukan objek", err("<html>")],
    ["data null", err(null)],
    ["tanpa detail", err({})],
    ["detail null", err({ detail: null })],
  ])("null untuk %s", (_n, input) => {
    expect(errorDetail(input)).toBeNull();
  });
});
