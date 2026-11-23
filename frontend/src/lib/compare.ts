export interface CompareOp { t: "eq" | "add" | "del"; text: string }
export interface ComparePage { n: number; ops: CompareOp[]; added: number; removed: number }
export interface CompareResult {
  pages: ComparePage[];
  summary: { pages_a: number; pages_b: number; added: number; removed: number; changed_pages: number };
}

/** Sisi kiri (dokumen lama) = eq + del; sisi kanan (dokumen baru) = eq + add. */
export function sideOps(ops: CompareOp[], side: "a" | "b"): CompareOp[] {
  const drop = side === "a" ? "add" : "del";
  return ops.filter((o) => o.t !== drop);
}
