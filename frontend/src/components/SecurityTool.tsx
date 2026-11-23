"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { t } from "@/lib/strings";
import ModeRadio from "./ModeRadio";
import PdfToolFrame from "./PdfToolFrame";

const INPUT = "w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none";

export default function SecurityTool() {
  const [mode, setMode] = useState<"protect" | "unlock">("protect");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(true);
  const s = t.lock;
  const protect = mode === "protect";

  return (
    <PdfToolFrame
      title={t.pages.security.title}
      subtitle={t.pages.security.subtitle}
      icon={<Lock size={20} />}
      endpoint={`/api/pdf/${mode}`}
      buildForm={(file) => {
        const f = new FormData();
        f.append("file", file);
        f.append("password", password);
        if (protect) { f.append("allow_print", String(allowPrint)); f.append("allow_copy", String(allowCopy)); }
        return f;
      }}
      fallbackName={(file) => `${protect ? "protected" : "unlocked"}_${file.name}`}
      canRun={protect ? password.length >= 8 : password.length > 0}
      actionLabel={protect ? s.actionProtect : s.actionUnlock}
      doneTitle={protect ? s.protectedTitle : s.unlockedTitle}
      preview={!protect} // PDF terenkripsi tak bisa dipratinjau tanpa password
      onReset={() => setPassword("")}
    >
      <ModeRadio
        legend={s.modeLegend} name="security-mode" value={mode} onChange={(m) => { setMode(m); setPassword(""); }}
        options={[{ value: "protect", ...s.protect }, { value: "unlock", ...s.unlock }]}
      />
      <div className="mb-3">
        <label htmlFor="sec-pw" className="block text-sm font-semibold text-slate-700 mb-1">{s.passwordLabel}</label>
        <input
          id="sec-pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password" maxLength={128} aria-describedby="sec-pw-help" className={INPUT}
        />
        <p id="sec-pw-help" className="text-xs text-slate-600 mt-1">{protect ? s.passwordHelp : s.unlockPasswordHelp}</p>
        <label className="inline-flex items-center gap-2 text-xs text-slate-700 mt-2">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-blue-600" />
          {s.show}
        </label>
      </div>
      {protect && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allowPrint} onChange={(e) => setAllowPrint(e.target.checked)} className="accent-blue-600" />{s.allowPrint}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allowCopy} onChange={(e) => setAllowCopy(e.target.checked)} className="accent-blue-600" />{s.allowCopy}
          </label>
        </div>
      )}
    </PdfToolFrame>
  );
}
