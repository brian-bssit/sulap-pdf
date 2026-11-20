"use client";

import { useState, useEffect } from "react";
import { Download, Shield, User } from "lucide-react";
import api from "@/lib/api";
import { errorDetail } from "@/lib/error";
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

const ROLE_LABEL = t.admin.userMgmt.roles;

export default function UserManagement({ readOnly = false }: { readOnly?: boolean }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/api/admin/users");
      setUsers(res.data.data);
    } catch {
      // handled by axios
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleUpgrade = async (userId: string, newRole: string) => {
    setError(null);
    try {
      await api.post(`/api/admin/users/${userId}/upgrade?role=${newRole}`);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e) {
      setError(errorDetail(e) ?? t.admin.userMgmt.failedRole);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center">
        <div className="shimmer-bg h-6 w-48 mx-auto rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t.admin.userMgmt.title}</h2>
          <p className="text-xs text-slate-500">
            {readOnly ? t.admin.userMgmt.readOnly : t.admin.userMgmt.manage}
          </p>
          {error && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}
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
              {!readOnly && <th scope="col" className="px-6 py-3 font-semibold text-right">{t.admin.userMgmt.cols.action}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
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
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg ${
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : u.role === "auditor"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {u.role === "admin" ? <Shield size={10} /> : <User size={10} />}
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-xs text-slate-500">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("id-ID") : "-"}
                </td>
                {!readOnly && (
                  <td className="px-6 py-3.5 text-right">
                    <select
                      aria-label={t.admin.userMgmt.roleFor(u.email)}
                      value={u.role}
                      onChange={(e) => handleUpgrade(u.id, e.target.value)}
                      className="text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1.5 rounded-lg"
                    >
                      {Object.entries(ROLE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 text-center text-xs text-slate-400 border-t border-slate-100 bg-slate-50/30">
        {t.admin.userMgmt.count(users.length)}
      </div>
    </div>
  );
}
