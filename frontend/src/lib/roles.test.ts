import { describe, expect, it } from "vitest";
import { ROLES, canChangeDirectly, canDecide, canRequestChange, canViewAdmin, isRole, REQUESTABLE_ROLES } from "./roles";

describe("hak per peran", () => {
  it.each([
    ["user", false, false, false, false],
    ["auditor", true, false, false, false],
    ["dca_officer", true, false, true, false],
    ["dca_supervisor", true, false, false, true],
    ["super_admin", true, true, false, true],
  ] as const)("%s → lihat:%s langsung:%s ajukan:%s putuskan:%s", (r, view, direct, request, decide) => {
    expect(canViewAdmin(r)).toBe(view);
    expect(canChangeDirectly(r)).toBe(direct);
    expect(canRequestChange(r)).toBe(request);
    expect(canDecide(r)).toBe(decide);
  });
  it("super_admin tidak bisa diminta lewat pengajuan", () => {
    expect(REQUESTABLE_ROLES).not.toContain("super_admin");
    expect(REQUESTABLE_ROLES.every((r) => ROLES.includes(r))).toBe(true);
  });
  it("isRole menolak nilai lama/asing", () => {
    expect(isRole("admin")).toBe(false);
    expect(isRole("dca_officer")).toBe(true);
  });
});
