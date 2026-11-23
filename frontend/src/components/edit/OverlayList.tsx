import { ChevronDown, ListChecks, Square, Trash2, Type } from "lucide-react";
import { t } from "@/lib/strings";
import { hexToRgba } from "./model";
import type { OverlayEditor } from "./useOverlayEditor";

/** Panel "Overlay Aktif": daftar semua overlay (semua halaman), collapsible, bisa dipilih/dihapus. */
export default function OverlayList({ ed, pageNo, setPageNo }: { ed: OverlayEditor; pageNo: number; setPageNo: (p: number) => void }) {
  const { overlays, selectedId, panelOpen } = ed;
  return (
    <div className="mb-3 bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => ed.setPanelOpen((o) => !o)}
        aria-expanded={panelOpen}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-amber-50/60 transition-colors"
      >
        <ListChecks size={16} className="text-amber-600 flex-shrink-0" aria-hidden="true" />
        <span className="text-sm font-bold text-slate-800">{t.edit.activeOverlays}</span>
        <span className="text-[11px] font-bold text-white bg-amber-500 rounded-full px-2 py-0.5 min-w-5 text-center">
          {overlays.length}
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-amber-700">
          {panelOpen ? t.edit.close : t.edit.open}
          <ChevronDown size={15} aria-hidden="true" className={`transition-transform duration-200 ${panelOpen ? "rotate-180" : ""}`} />
        </span>
      </button>

      {panelOpen && (
        <div className="border-t border-amber-100 max-h-72 overflow-y-auto scrollbar-thin">
          {overlays.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-500 italic leading-relaxed">
              {t.edit.noOverlays}
            </p>
          ) : (
            overlays.map((o, idx) => {
              const isRect = o.type === "rectangle";
              const isSel = o.id === selectedId;
              return (
                <div
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    ed.setSelectedId(o.id);
                    if (o.page + 1 !== pageNo) setPageNo(o.page + 1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ed.setSelectedId(o.id);
                      setPageNo(o.page + 1);
                    }
                  }}
                  className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-amber-50 ${
                    isSel ? "bg-amber-100/70" : ""
                  }`}
                >
                  <span
                    className={`mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 ${
                      isSel ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-600"
                    }`}
                  >
                    {isRect ? <Square size={14} aria-hidden="true" /> : <Type size={14} aria-hidden="true" />}
                  </span>

                  <div className="flex-1 min-w-0 leading-tight">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-slate-400 flex-shrink-0">{idx + 1}.</span>
                      <span className="font-bold text-slate-800">{isRect ? t.edit.blockName : t.edit.textName}</span>
                      <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-px">
                        {t.edit.page(o.page + 1)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 truncate mt-1">
                      {isRect ? (
                        <>
                          {t.edit.sizeWord}{" "}
                          <b className="text-slate-700">
                            {t.edit.blockSize(Number((o.width ?? 0).toFixed(1)), Number((o.height ?? 0).toFixed(1)))}
                          </b>
                          {" · "}{t.edit.opacityWord}{" "}
                          <b className="text-slate-700">{Math.round((o.opacity ?? 1) * 100)}%</b>
                        </>
                      ) : (
                        <>
                          “{o.text}” · <b className="text-slate-700">{o.font}</b> {o.font_size}pt
                        </>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 min-w-0">
                      <span
                        className="w-3 h-3 rounded-sm border border-slate-300 inline-block flex-shrink-0"
                        style={{
                          background: isRect
                            ? hexToRgba(o.color ?? "#FFFFFF", o.opacity ?? 1)
                            : o.color ?? "#111827",
                        }}
                      />
                      <span className="uppercase font-mono">{o.color}</span>
                      <span className="ml-auto flex-shrink-0">
                        {t.edit.position(Math.round(o.x), Math.round(o.y))}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      ed.deleteOverlay(o.id);
                    }}
                    aria-label={t.edit.deleteItem(isRect, idx + 1)}
                    className="mt-1 p-1.5 rounded-lg text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
