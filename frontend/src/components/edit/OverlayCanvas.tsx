import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { t } from "@/lib/strings";
import { FONT_FAMILY, hexToRgba, rectCss, textCss } from "./model";
import type { OverlayEditor } from "./useOverlayEditor";
import type { EditorDocument } from "./useEditorDocument";

/** Panggung: kanvas pdf.js + lapisan overlay (teks/Block) + navigasi halaman + petunjuk mode. */
export default function OverlayCanvas({ doc, ed }: { doc: EditorDocument; ed: OverlayEditor }) {
  const { vp, pageNo, numPages, isRendering } = doc;
  const { insertType, selectedId, editingId, drawPreview, colorRect } = ed;

  return (
    <div ref={doc.stageRef} className="bg-slate-200/70 rounded-xl border border-slate-300/60 p-4 mb-4 relative">
      {isRendering && (
        <div className="absolute inset-0 z-30 bg-white/80 flex items-center justify-center rounded-xl">
          <Loader2 size={28} className="animate-spin text-amber-500" />
        </div>
      )}

      {/* page nav */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <button
          onClick={() => doc.setPageNo((p) => Math.max(1, p - 1))}
          disabled={pageNo <= 1}
          aria-label={t.edit.prevPage}
          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="text-xs font-semibold text-slate-700">
          {t.edit.pageOf(pageNo, numPages)}
        </span>
        <button
          onClick={() => doc.setPageNo((p) => Math.min(numPages, p + 1))}
          disabled={pageNo >= numPages}
          aria-label={t.edit.nextPage}
          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div
        ref={ed.canvasWrapRef}
        onPointerDown={ed.handleStageDown}
        className="relative mx-auto w-fit shadow-lg bg-white select-none touch-none"
        style={{
          cursor: insertType === "text" ? "text" : insertType === "rectangle" ? "crosshair" : "default",
        }}
      >
        <canvas ref={doc.canvasRef} className="block" style={{ width: vp?.width ?? 0, height: vp?.height ?? 0 }} />

        {/* in-progress rectangle draw */}
        {drawPreview && vp && (
          <div
            className="absolute pointer-events-none"
            style={{
              ...rectCss(drawPreview, vp),
              background: hexToRgba(insertType === "rectangle" ? colorRect : "#94a3b8", 0.25),
              outline: "1.5px dashed #f59e0b",
            }}
          />
        )}

        {!isRendering &&
          ed.currentOverlays.map((o) =>
            o.type === "rectangle" ? (
              <div
                key={o.id}
                onPointerDown={(e) => ed.handleRectDown(e, o)}
                onPointerMove={ed.handleRectMove}
                onPointerLeave={ed.handleRectLeave}
                className="absolute"
                style={{
                  ...rectCss({ x: o.x!, y: o.y!, width: o.width!, height: o.height! }, vp!),
                  background: hexToRgba(o.color ?? "#FFFFFF", o.opacity ?? 1),
                  outline: selectedId === o.id ? "1.5px dashed #f59e0b" : "none",
                  cursor: "move",
                }}
                title={t.edit.resizeTitle}
                aria-label={t.edit.blockName}
              >
                {selectedId === o.id &&
                  [
                    [o.x, o.y],
                    [o.x + o.width!, o.y],
                    [o.x, o.y + o.height!],
                    [o.x + o.width!, o.y + o.height!],
                  ].map((c, i) => {
                    const [hx, hy] = vp!.convertToViewportPoint(c[0], c[1]);
                    return (
                      <span
                        key={i}
                        onPointerDown={(e) => ed.handleResizeDown(e, o.id)}
                        onPointerMove={(e) => e.stopPropagation()}
                        className="absolute w-4 h-4 flex items-center justify-center cursor-nwse-resize"
                        style={{ left: hx - 8, top: hy - 8 }}
                      >
                        <span className="w-2 h-2 bg-white border-2 border-amber-500 rounded-full block shadow-md" />
                      </span>
                    );
                  })}
              </div>
            ) : (
              <div
                key={o.id}
                onPointerDown={(e) => {
                  if (editingId === o.id) {
                    e.stopPropagation(); // sedang edit: biarkan seleksi teks, jangan geser
                    return;
                  }
                  ed.handleOverlayDown(e, o.id);
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  ed.setSelectedId(o.id);
                  ed.setEditingId(o.id);
                }}
                className="absolute whitespace-nowrap"
                style={{
                  ...textCss(o, vp!),
                  fontFamily: FONT_FAMILY[o.font ?? "Helvetica"] ?? FONT_FAMILY.Helvetica,
                  fontWeight: selectedId === o.id ? "bold" : "normal",
                  color: o.color ?? "#111827",
                  background:
                    editingId === o.id
                      ? "rgba(255,255,255,0.92)"
                      : selectedId === o.id
                      ? "rgba(255,255,255,0.35)"
                      : "none",
                  outline: editingId === o.id ? "1.5px solid #f59e0b" : selectedId === o.id ? "1px dashed #f59e0b" : "none",
                  padding: "0 2px",
                  cursor: editingId === o.id ? "text" : "move",
                }}
                title={t.edit.textTitle}
                aria-label={t.edit.textOverlayLabel}
              >
                {editingId === o.id ? (
                  <span
                    ref={(el) => {
                      ed.editRef.current[o.id] = el;
                    }}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-label={t.edit.editTextLabel}
                    className="inline-block outline-none"
                    style={{ minWidth: 24, minHeight: 16, caretColor: "#d97706", whiteSpace: "pre-wrap" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        ed.commitText(o.id);
                      } else if (e.key === "Escape") {
                        ed.cancelText(o.id);
                      }
                    }}
                    onBlur={() => ed.commitText(o.id)}
                  >
                    {o.text}
                  </span>
                ) : (
                  o.text
                )}
              </div>
            )
          )}
      </div>

      <p className="text-center text-xs text-slate-500 mt-3">
        {insertType === "text"
          ? t.edit.hintText
          : insertType === "rectangle"
          ? t.edit.hintRect
          : t.edit.hintSelect}
      </p>
    </div>
  );
}
