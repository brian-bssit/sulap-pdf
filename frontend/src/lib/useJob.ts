import { useCallback, useState } from "react";
import api from "./api";
import { filenameFromDisposition } from "./download";

export type JobPhase = "idle" | "uploading" | "processing";
export interface JobResult {
  blob: Blob;
  filename: string;
  headers: Record<string, string>;
}

/**
 * Mengirim FormData ke endpoint pemrosesan dan menampung hasilnya (tanpa unduh otomatis).
 * `phase`/`percent` untuk indikator progres: uploading (0–99%) → processing (menunggu server).
 */
export function useJob() {
  const [phase, setPhase] = useState<JobPhase>("idle");
  const [percent, setPercent] = useState(0);
  const [result, setResult] = useState<JobResult | null>(null);

  const run = useCallback(async (url: string, form: FormData, fallbackName: string): Promise<JobResult> => {
    setResult(null);
    setPercent(0);
    setPhase("uploading");
    try {
      const res = await api.post(url, form, {
        responseType: "blob",
        onUploadProgress: (e) => {
          if (!e.total) return;
          const p = Math.min(100, Math.round((e.loaded / e.total) * 100));
          setPercent(p);
          if (p >= 100) setPhase("processing");
        },
      });
      const headers = res.headers as Record<string, string>;
      const out = {
        blob: res.data as Blob,
        filename: filenameFromDisposition(headers["content-disposition"], fallbackName),
        headers,
      };
      setResult(out);
      return out;
    } finally {
      setPhase("idle");
    }
  }, []);

  const reset = useCallback(() => setResult(null), []);
  return { phase, percent, busy: phase !== "idle", result, run, reset };
}
