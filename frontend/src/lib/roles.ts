// Peran dan hak akses (cermin backend/auth/roles.py — dijaga sama oleh backend/tests/test_roles_parity.py).
export const ROLES = ["user", "auditor", "dca_officer", "dca_supervisor", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

export const VIEW_ROLES: readonly Role[] = ["auditor", "dca_officer", "dca_supervisor", "super_admin"];
export const REQUESTABLE_ROLES: readonly Role[] = ["user", "auditor", "dca_officer", "dca_supervisor"]; // super_admin hanya langsung

export const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);
export const canViewAdmin = (r: Role) => VIEW_ROLES.includes(r);
export const canChangeDirectly = (r: Role) => r === "super_admin";
export const canRequestChange = (r: Role) => r === "dca_officer";
export const canDecide = (r: Role) => r === "dca_supervisor" || r === "super_admin";
