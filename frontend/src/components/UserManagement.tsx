"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Shield, User } from "lucide-react";
import api from "@/lib/api";
import { errorDetail } from "@/lib/error";
import { REQUESTABLE_ROLES, ROLES, canChangeDirectly, canRequestChange, type Role } from "@/lib/roles";
import { t } from "@/lib/strings";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

const BADGE: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  dca_supervisor: "bg-indigo-100 text-indigo-700",
  dca_officer: "bg-blue-100 text-blue-700",
  auditor: "bg-amber-100 text-amber-800",
  user: "bg-slate-100 text-slate-600",
};

export default function UserManagement({ me }: { me: { id: string; role: Role } }) {
  const direct = canChangeDirectly(me.role);
  const maker = canRequestChange(me.role);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set()); // user id yang punya pengajuan menunggu
  const [drafts, setDrafts] = useState<Record<string, { role: string; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([api.get("/api/admin/users"), api.get("/api/admin/role-requests?status=PENDING")]);
      setUsers(u.data.data);
      setPending(new Set<string>(p.data.data.map((r: { target_user_id: string }) => r.target_user_id)));
    } catch {
      // handled by axios
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeDirect = async (userId: string, newRole: string) => {
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/admin/users/${userId}/upgrade?role=${newRole}`);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e) {
      setError(errorDetail(e) ?? t.admin.userMgmt.failedRole);
    }
  };

  const submitRequest = async (u: UserRow) => {
    const d = drafts[u.id];
    if (!d || d.role === u.role) return;
    setError(null);
    setNotice(null);
    try {
      await api.post("/api/admin/role-requests", { user_id: u.id, role: d.role, reason: d.reason || null });
      setDrafts((prev) => { const c = { ...prev }; delete c[u.id]; return c; });
      setPending((prev) => new Set(prev).add(u.id));
      setNotice(t.admin.userMgmt.requestSent);
    } catch (e) {
      setError(errorDetail(e) ?? t.admin.userMgmt.failedRole);
    }
  };

  const setDraft = (id: string, patch: Partial<{ role: string; reason: string }>, current: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { role: prev[id]?.role ?? current, reason: prev[id]?.reason ?? "", ...patch } }));

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center">
        <div className="shimmer-bg h-6 w-48 mx-auto rounded" />
      </div>
    );
  }

  const showActions = direct || maker;
  const selectCls = "text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1.5 rounded-lg";

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t.admin.userMgmt.title}</h2>
          <p className="text-xs text-slate-500">
            {direct ? t.admin.userMgmt.directNote : maker ? t.admin.userMgmt.makerNote : t.admin.userMgmt.readOnly}{" "}
            {t.admin.userMgmt.manage}
          </p>
          {error && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}
          {notice && <p role="status" className="mt-2 text-xs font-medium text-emerald-700">{notice}</p>}
        </div>
        <button
          onClick={() => window.open("/api/admin/users/csv", "_blank")}
          className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          <Download size={16} aria-hidden="true" />
          {t.admin.exportCsv}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.userMgmt.cols.user}</th>
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.userMgmt.cols.email}</th>
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.userMgmt.cols.role}</th>
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.userMgmt.cols.lastLogin}</th>
              {showActions && <th scope="col" className="px-6 py-3 font-semibold text-right">{t.admin.userMgmt.cols.action}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const draft = drafts[u.id];
              const dirty = !!draft && draft.role !== u.role;
              const locked = u.id === me.id || u.role === "super_admin" || pending.has(u.id);
              return (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                        {u.display_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800 text-xs">{u.display_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-600">{u.email}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg ${BADGE[u.role] ?? BADGE.user}`}>
                      {u.role === "user" ? <User size={10} aria-hidden="true" /> : <Shield size={10} aria-hidden="true" />}
                      {(t.roles[u.role] ?? u.role).toUpperCase()}
                    </span>
                    {pending.has(u.id) && (
                      <span className="ml-2 text-[10px] font-semibold text-amber-700">{t.admin.userMgmt.pending}</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-500">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("id-ID") : "-"}
                  </td>
                  {showActions && (
                    <td className="px-6 py-3.5 text-right">
                      {direct ? (
                        <select
                          aria-label={t.admin.userMgmt.roleFor(u.email)}
                          value={u.role}
                          onChange={(e) => changeDirect(u.id, e.target.value)}
                          className={selectCls}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                        </select>
                      ) : locked ? null : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <select
                            aria-label={t.admin.userMgmt.roleFor(u.email)}
                            value={draft?.role ?? u.role}
                            onChange={(e) => setDraft(u.id, { role: e.target.value }, u.role)}
                            className={selectCls}
                          >
                            {[...REQUESTABLE_ROLES].map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                          </select>
                          {dirty && (
                            <>
                              <input
                                aria-label={t.admin.userMgmt.reasonLabel(u.email)}
                                placeholder={t.admin.userMgmt.reasonPlaceholder}
                                value={draft.reason}
                                maxLength={1000}
                                onChange={(e) => setDraft(u.id, { reason: e.target.value }, u.role)}
                                className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 w-40 text-slate-800 bg-white"
                              />
                              <button
                                onClick={() => submitRequest(u)}
                                className="text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                {t.admin.userMgmt.submitRequest}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 text-center text-xs text-slate-500 border-t border-slate-100 bg-slate-50/30">
        {t.admin.userMgmt.count(users.length)}
      </div>
    </div>
  );
}
