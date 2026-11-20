import { MousePointer2, Trash2 } from "lucide-react";
import { t } from "@/lib/strings";
import { ALL_FONTS } from "./model";
import type { OverlayEditor } from "./useOverlayEditor";

/** Bar properti: muncul saat ada tool aktif / overlay terpilih; netral = strip mode pilih. */
export default function PropertyBar({ ed }: { ed: OverlayEditor }) {
  const { selected, insertType, selectedIsText, textDraft, font, fontSize, colorText, colorRect, alphaRect } = ed;

  if (!selected && insertType === null) {
    return (
      <div className="flex items-center gap-2 mb-4 p-3 bg-slate-100/60 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500">
        <MousePointer2 size={16} className="text-slate-400 flex-shrink-0" aria-hidden="true" />
        <span>{t.edit.selectMode}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
      {selectedIsText ? (
        <>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            {t.edit.textLabel}
            <input
              value={selected?.text ?? textDraft}
              onChange={(e) => {
                const v = e.target.value;
                ed.setTextDraft(v);
                if (selected?.type === "text") ed.updateSelected({ text: v });
              }}
              placeholder={t.edit.textPlaceholder}
              className="border border-slate-300 rounded-lg px-2 py-1.5 w-48 text-slate-800"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            {t.edit.font}
            <select
              value={selected?.font ?? font}
              onChange={(e) => {
                const v = e.target.value;
                ed.setFont(v);
                if (selected?.type === "text") ed.updateSelected({ font: v });
              }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700"
            >
              {ALL_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            {t.edit.size}
            <input
              type="number"
              min={8}
              max={72}
              value={selected?.font_size ?? fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                ed.setFontSize(v);
                if (selected?.type === "text") ed.updateSelected({ font_size: v });
              }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 w-16 text-slate-800"
            />
          </label>
        </>
      ) : (
        <>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">{t.edit.blockLabel}</span>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            {t.edit.opacity}
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round((selected?.opacity ?? alphaRect) * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                ed.setAlphaRect(v);
                if (selected?.type === "rectangle") ed.updateSelected({ opacity: v });
              }}
              className="w-28 accent-amber-500"
            />
            <span className="text-slate-700 w-9 font-semibold">{Math.round((selected?.opacity ?? alphaRect) * 100)}%</span>
          </label>
        </>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-600 ml-1">
        {t.edit.color}
        <input
          type="color"
          value={selected?.color ?? (selectedIsText ? colorText : colorRect)}
          onChange={(e) => {
            const v = e.target.value;
            if (selectedIsText) ed.setColorText(v); else ed.setColorRect(v);
            if (selected) ed.updateSelected({ color: v });
          }}
          className="w-8 h-8 rounded cursor-pointer border border-slate-300"
        />
      </label>

      {selected && (
        <button
          onClick={() => ed.deleteOverlay(selected.id)}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 size={14} aria-hidden="true" /> {t.edit.delete}
        </button>
      )}
    </div>
  );
}
