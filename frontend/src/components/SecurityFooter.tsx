import { ShieldCheck } from "lucide-react";
import { t } from "@/lib/strings";

export default function SecurityFooter() {
  return (
    <div className="mt-8 bg-white rounded-xl border border-slate-200/80 p-6 text-center">
      <div className="flex items-center justify-center gap-2 mb-3">
        <ShieldCheck size={20} className="text-emerald-600" aria-hidden="true" />
        <h4 className="font-bold text-slate-800 text-sm tracking-wide">{t.security.title}</h4>
      </div>
      <p className="text-slate-600 text-sm leading-relaxed max-w-3xl mx-auto">{t.security.body}</p>
      <p className="text-red-600 font-bold text-base tracking-wide mt-4">{t.security.slogan}</p>
    </div>
  );
}
