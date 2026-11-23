import { filenameFromDisposition } from "./download";

export type StepId = "unlock" | "remove-pages" | "compress" | "watermark" | "page-numbers" | "scrub" | "protect";
export type StepOptions = Record<string, string>;
export interface Step { id: StepId; options: StepOptions }

export const MIN_STEPS = 2;
export const MAX_STEPS = 5;

/** "2,4-5" (1-based) → indeks 0-based untuk /remove-pages; null bila format salah. */
export function parsePages(spec: string): number[] | null {
  const parts = spec.replace(/\s+/g, "").split(",").filter(Boolean);
  if (!parts.length) return null;
  const out = new Set<number>();
  for (const p of parts) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(p);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a || b - a > 1000) return null;
    for (let n = a; n <= b; n++) out.add(n - 1);
  }
  return Array.from(out).sort((x, y) => x - y);
}

type Build = (blob: Blob, name: string, o: StepOptions) => FormData;
const base = (blob: Blob, name: string) => { const f = new FormData(); f.append("file", blob, name); return f; };
const withFields = (fields: Record<string, string>): Build => (blob, name, o) => {
  const f = base(blob, name);
  Object.entries(fields).forEach(([k, v]) => f.append(k, v));
  Object.entries(o).forEach(([k, v]) => f.append(k, v));
  return f;
};

export const STEP_DEFS: Record<StepId, { endpoint: string; build: Build }> = {
  unlock: { endpoint: "/api/pdf/unlock", build: (b, n, o) => withFields({ password: o.password ?? "" })(b, n, {}) },
  "remove-pages": {
    endpoint: "/api/pdf/remove-pages",
    build: (b, n, o) => withFields({ pages_to_remove: JSON.stringify(parsePages(o.pages ?? "") ?? []) })(b, n, {}),
  },
  compress: { endpoint: "/api/pdf/compress", build: withFields({ level: "high" }) },
  watermark: { endpoint: "/api/pdf/watermark", build: (b, n, o) => withFields({ text: o.text ?? "", position: "diagonal" })(b, n, {}) },
  "page-numbers": { endpoint: "/api/pdf/page-numbers", build: (b, n, o) => withFields({ format: o.format ?? "n" })(b, n, {}) },
  scrub: { endpoint: "/api/pdf/scrub-metadata", build: (b, n) => base(b, n) },
  protect: { endpoint: "/api/pdf/protect", build: (b, n, o) => withFields({ password: o.password ?? "" })(b, n, {}) },
};

/** Pesan kesalahan susunan langkah, atau null bila valid. Kunci hanya di akhir, buka kunci hanya di awal. */
export function validateChain(steps: Step[]): "count" | "protect-last" | "unlock-first" | null {
  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) return "count";
  if (steps.some((s, i) => s.id === "protect" && i !== steps.length - 1)) return "protect-last";
  if (steps.some((s, i) => s.id === "unlock" && i !== 0)) return "unlock-first";
  return null;
}

export class ChainError extends Error {
  constructor(public stepIndex: number, public stepId: StepId, public detail: string) {
    super(`${stepIndex + 1}:${stepId}:${detail}`);
  }
}

export type Post = (endpoint: string, form: FormData) => Promise<{ data: Blob; headers: Record<string, string> }>;

/** Jalankan langkah berurutan; keluaran tiap langkah jadi masukan berikutnya. Gagal → berhenti, hasil antara dibuang. */
export async function runChain(
  file: File, steps: Step[], post: Post, onProgress?: (index: number, total: number) => void,
  errorDetail: (e: unknown) => string = (e) => (e instanceof Error ? e.message : String(e)),
): Promise<{ blob: Blob; filename: string }> {
  let blob: Blob = file, name = file.name;
  for (let i = 0; i < steps.length; i++) {
    onProgress?.(i, steps.length);
    const def = STEP_DEFS[steps[i].id];
    try {
      const res = await post(def.endpoint, def.build(blob, name, steps[i].options));
      blob = res.data;
      name = filenameFromDisposition(res.headers["content-disposition"], name);
    } catch (e) {
      throw new ChainError(i, steps[i].id, errorDetail(e));
    }
  }
  return { blob, filename: name };
}
