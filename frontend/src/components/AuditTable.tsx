"use client";

import { t } from "@/lib/strings";
import { useState, useEffect, useCallback } from "react";
import { Search, Filter, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import api from "@/lib/api";

interface AuditRow {
  id: number;
  user_email: string;
  action: string;
  source_files: string[];
  result_file: string | null;
  status: string;
  processing_ms: number;
  ip_address: string | null;
  executed_at: string;
}

interface AuditResponse {
  data: AuditRow[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "SUCCESS":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} aria-hidden="true" /> {t.admin.status.ok}
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
          <XCircle size={12} aria-hidden="true" /> {t.admin.status.failed}
        </span>
      );
    case "CANCELLED_BY_CLIENT":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertCircle size={12} aria-hidden="true" /> {t.admin.status.cancelled}
        </span>
      );
    default:
      return <span className="text-xs text-slate-500">{status}</span>;
  }
}

export default function AuditTable() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Search dieksekusi server-side (ILIKE) supaya kena SEMUA data, bukan cuma
  // 20 baris halaman aktif. Debounce biar tak spam request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, per_page: 20 };
      if (actionFilter) params.action = actionFilter;
      if (statusFilter) params.status = statusFilter;
      if (debouncedSearch) params.search = debouncedSearch;

      const res = await api.get("/api/admin/audit-logs", { params });
      setData(res.data);
    } catch {
      // 401/403 → interceptor redirect ke login
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, statusFilter, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows = data?.data ?? [];

  const handleExport = () => {
    const params: Record<string, string> = {};
    if (actionFilter) params.action = actionFilter;
    if (statusFilter) params.status = statusFilter;
    if (debouncedSearch) params.search = debouncedSearch;
    const qs = new URLSearchParams(params).toString();
    window.open(`/api/admin/audit-logs/csv?${qs}`, "_blank");
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t.admin.audit}</h2>
          <p className="text-xs text-slate-500">{t.admin.auditSubtitle}</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          <Download size={16} aria-hidden="true" />
          {t.admin.exportCsv}
        </button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <label htmlFor="audit-search" className="sr-only">{t.admin.searchLabel}</label>
          <input
            id="audit-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchPlaceholder}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none bg-white"
          />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <label htmlFor="action-filter" className="sr-only">{t.admin.actionFilter}</label>
          <select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none appearance-none bg-white cursor-pointer"
          >
            <option value="">{t.admin.allActions}</option>
            <option value="MERGE">MERGE</option>
            <option value="COMPRESS">COMPRESS</option>
            <option value="REARRANGE">REARRANGE</option>
            <option value="REMOVE_PAGES">REMOVE PAGES</option>
            <option value="CONVERT">CONVERT</option>
            <option value="EDIT_OVERLAY">EDIT OVERLAY</option>
            <option value="GOOGLE_LOGIN">GOOGLE LOGIN</option>
            <option value="USER_ROLE_CHANGE">USER ROLE CHANGE</option>
            <option value="RATE_LIMITED">RATE LIMITED</option>
          </select>
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <label htmlFor="status-filter" className="sr-only">{t.admin.statusFilter}</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none appearance-none bg-white cursor-pointer"
          >
            <option value="">{t.admin.allStatus}</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILED">FAILED</option>
            <option value="CANCELLED_BY_CLIENT">CANCELLED</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.cols.time}</th>
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.cols.user}</th>
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.cols.action}</th>
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.cols.source}</th>
              <th scope="col" className="px-6 py-3 font-semibold">{t.admin.cols.status}</th>
              <th scope="col" className="px-6 py-3 font-semibold text-right">{t.admin.cols.duration}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr role="status">
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="shimmer-bg h-4 w-48 mx-auto rounded" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Search size={40} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">{t.admin.empty}</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3.5 whitespace-nowrap text-slate-500 text-xs font-mono">
                    {row.executed_at ? new Date(row.executed_at).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                        {row.user_email.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800 text-xs">{row.user_email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-700">
                      {row.action}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 truncate max-w-[180px] text-slate-600 text-xs" title={row.source_files?.join(", ")}>
                    {row.source_files?.join(", ") || "-"}
                  </td>
                  <td className="px-6 py-3.5">{getStatusBadge(row.status)}</td>
                  <td className="px-6 py-3.5 text-right text-slate-500 text-xs font-mono">
                    {row.processing_ms > 1000
                      ? `${(row.processing_ms / 1000).toFixed(1)}s`
                      : `${row.processing_ms}ms`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="px-6 py-3 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 bg-slate-50/30">
          <span>
            {t.admin.pagination(data.page, data.pages, data.total)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.admin.prev}
            </button>
            <button
              onClick={() => setPage(Math.min(data.pages, page + 1))}
              disabled={page >= data.pages}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.admin.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
