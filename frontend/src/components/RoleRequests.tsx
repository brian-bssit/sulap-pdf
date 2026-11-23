"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { errorDetail } from "@/lib/error";
import { canDecide, type Role } from "@/lib/roles";
import { t } from "@/lib/strings";

interface Req {
  id: string;
  target_email: string | null;
  from_role: string;
  to_role: string;
  reason: string | null;
  requested_by: string;
  requested_by_email: string | null;
  status: string;
  decided_by_email: string | null;
  decision_note: string | null;
  created_at: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

/** Daftar pengajuan perubahan role. Keputusan oleh IT DCA Supervisor / Super Admin (bukan pengaju). */
export default function RoleRequests({ me }: { me: { id: string; role: Role } }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [status, setStatus] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/admin/role-requests", { params: status ? { status } : {} });
      setRows(res.data.data);
    } catch {
      // handled by axios
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: "approve" | "reject" | "cancel") => {
    setError(null);
    try {
      await api.post(`/api/admin/role-requests/${id}/${action}`, {});
    } catch (e) {
      setError(errorDetail(e) ?? t.admin.reqFailed);
    }
    await load();
  };

  const label = (r: string) => t.roles[r] ?? r;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t.admin.requests}</h2>
          <p className="text-xs text-slate-500">{t.admin.requestsSubtitle}</p>
          {error && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}
        </div>
        <div>
          <label htmlFor="req-status" className="sr-only">{t.admin.reqFilterLabel}</label>
          <select
            id="req-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-700"
          >
            <option value="">{t.admin.reqAll}</option>
            {Object.entries(t.admin.reqStatus).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t.admin.requests}</caption>
          <thead>
            <tr className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
              {Object.values(t.admin.reqCols).map((c) => <th key={c} scope="col" className="px-6 py-3 font-semibold">{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr role="status"><td colSpan={7} className="px-6 py-10 text-center"><div className="shimmer-bg h-4 w-48 mx-auto rounded" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">{t.admin.reqEmpty}</td></tr>
            ) : rows.map((r) => {
              const mine = r.requested_by === me.id;
              const email = r.target_email ?? "";
              return (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3.5 text-xs font-mono text-slate-500 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString("id-ID") : "-"}</td>
                  <td className="px-6 py-3.5 text-xs font-medium text-slate-800">{email}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-700 whitespace-nowrap">{label(r.from_role)} → <b>{label(r.to_role)}</b></td>
                  <td className="px-6 py-3.5 text-xs text-slate-600">{r.requested_by_email}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-600 max-w-[220px] truncate" title={r.reason ?? ""}>{r.reason ?? "-"}</td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2 py-1 text-[10px] font-bold rounded-lg ${STATUS_STYLE[r.status] ?? STATUS_STYLE.CANCELLED}`}>
                      {t.admin.reqStatus[r.status] ?? r.status}
                    </span>
                    {r.decided_by_email && <div className="text-[10px] text-slate-500 mt-1">{r.decided_by_email}</div>}
                  </td>
                  <td className="px-6 py-3.5">
                    {r.status === "PENDING" && (
                      <div className="flex flex-wrap gap-2">
                        {canDecide(me.role) && !mine && (
                          <>
                            <button aria-label={t.admin.approveFor(email)} onClick={() => act(r.id, "approve")}
                              className="text-xs font-semibold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors">{t.admin.approve}</button>
                            <button aria-label={t.admin.rejectFor(email)} onClick={() => act(r.id, "reject")}
                              className="text-xs font-semibold bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">{t.admin.reject}</button>
                          </>
                        )}
                        {(mine || me.role === "super_admin") && (
                          <button aria-label={t.admin.cancelFor(email)} onClick={() => act(r.id, "cancel")}
                            className="text-xs font-medium text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">{t.admin.cancelReq}</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
