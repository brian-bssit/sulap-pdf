import { t } from "@/lib/strings";
import type { JobPhase } from "@/lib/useJob";

/** Overlay saat memproses: fase unggah menampilkan persen, fase server menampilkan status menunggu. */
export default function LoadingOverlay({ phase = "processing", percent = 0 }: { phase?: JobPhase; percent?: number }) {
  const uploading = phase === "uploading";
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/70 glass-effect animate-[fadeIn_0.3s_ease-out]">
      <div role="status" aria-live="polite" className="bg-white rounded-2xl shadow-2xl p-8 w-[min(24rem,calc(100vw-2rem))] text-center animate-[scaleIn_0.2s_ease-out] border border-slate-100">
        <div className="relative w-16 h-16 mx-auto mb-6" aria-hidden="true">
          <div className="absolute inset-0 border-4 border-blue-100 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin" />
          <div
            className="absolute inset-2 border-4 border-transparent border-t-indigo-400 rounded-full animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "0.8s" }}
          />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">{t.job.title}</h3>
        <p className="text-slate-600 text-sm leading-relaxed">
          {uploading ? t.job.uploading : t.job.processing}…
        </p>
        <div
          role="progressbar"
          aria-label={t.job.uploading}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uploading ? percent : 100}
          className="mt-4 h-2 rounded-full bg-slate-200 overflow-hidden"
        >
          <div
            className={`h-full rounded-full bg-blue-600 transition-[width] duration-200 ${uploading ? "" : "animate-pulse"}`}
            style={{ width: `${uploading ? percent : 100}%` }}
          />
        </div>
        {uploading && <p className="mt-1 text-xs text-slate-500">{t.job.uploadPercent(percent)}</p>}
        <p className="mt-4 text-sm font-semibold text-red-600">{t.job.doNotClose}</p>
      </div>
    </div>
  );
}
