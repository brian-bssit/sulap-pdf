"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  Minimize2,
  Grid3x3,
  ShieldAlert,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  FileUp,
  PenTool,
  Scissors,
} from "lucide-react";
import CompressTool from "@/components/CompressTool";
import MergeTool from "@/components/MergeTool";
import RearrangeTool from "@/components/RearrangeTool";
import RemovePagesTool from "@/components/RemovePagesTool";
import ConvertTool from "@/components/ConvertTool";
import EditOverlayTool from "@/components/EditOverlayTool";
import AuditTable from "@/components/AuditTable";
import UserManagement from "@/components/UserManagement";

const LOGO_URL = "/bss-logo.jpg";

type Tab = "merge" | "compress" | "rearrange" | "remove-pages" | "convert" | "edit" | "admin";

interface User {
  name: string;
  email: string;
  role: "user" | "admin";
}

const DEMO_USER: User = { name: "Loading...", email: "", role: "user" };

const navItems: { id: Tab; label: string; icon: React.ReactNode; roles: string[] }[] = [
  { id: "compress", label: "Compress PDF", icon: <Minimize2 size={20} />, roles: ["user", "admin"] },
  { id: "merge", label: "Merge PDF", icon: <Layers size={20} />, roles: ["user", "admin"] },
  { id: "rearrange", label: "Rearrange PDF", icon: <Grid3x3 size={20} />, roles: ["user", "admin"] },
  { id: "remove-pages", label: "Remove Pages", icon: <Scissors size={20} />, roles: ["user", "admin"] },
  { id: "convert", label: "Convert to PDF", icon: <FileUp size={20} />, roles: ["user", "admin"] },
  { id: "edit", label: "Edit PDF", icon: <PenTool size={20} />, roles: ["user", "admin"] },
  { id: "admin", label: "Admin Panel", icon: <ShieldAlert size={20} />, roles: ["admin"] },
];

const pageTitles: Record<Tab, { title: string; subtitle: string }> = {
  merge: { title: "Gabung PDF", subtitle: "Gabungkan 2 hingga 10 file PDF menjadi satu" },
  compress: { title: "Kompres PDF", subtitle: "Kurangi ukuran file PDF tanpa kehilangan kualitas" },
  rearrange: { title: "Atur Ulang PDF", subtitle: "Ubah urutan atau putar halaman PDF" },
  "remove-pages": { title: "Hapus Halaman", subtitle: "Pilih dan hapus halaman tertentu dari PDF" },
  convert: { title: "Konversi ke PDF", subtitle: "Ubah dokumen apapun menjadi PDF — DOCX, XLSX, PPTX, dan lainnya" },
  edit: { title: "Edit PDF", subtitle: "Tambah teks, stempel, dan highlight di atas halaman PDF" },
  admin: { title: "Admin Panel", subtitle: "User management & audit logs" },
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User>(DEMO_USER);
  const [activeTab, setActiveTab] = useState<Tab>("compress");
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        if (res.status === 401) router.push("/");
        throw new Error("Auth failed");
      })
      .then((data) => setUser({ name: data.display_name, email: data.email, role: data.role }))
      .catch(() => router.push("/"));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/");
  };

  // Pindahkan fokus ke judul setelah ganti tab → user keyboard/SR tahu konten berubah.
  const focusPageTitle = () => {
    requestAnimationFrame(() => {
      document.getElementById("page-title")?.focus({ preventScroll: true });
    });
  };

  const filteredNav = navItems.filter((item) => item.roles.includes(user.role));
  const { title, subtitle } = pageTitles[activeTab];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        id="dashboard-sidebar"
        aria-label="Menu navigasi"
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200/80 transform transition-transform duration-300 ease-in-out flex flex-col shadow-xl md:shadow-none ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="py-6 px-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="BSS Logo" className="h-14 object-contain" />
            <div>
              <span className="text-lg font-bold text-slate-800 tracking-tight">SULAP PDF</span>
              <span className="block text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                SULAP PDF v1.0
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-thin">
          {filteredNav.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={activeTab === item.id ? "page" : undefined}
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
                focusPageTitle();
              }}
              className={`w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === item.id
                  ? "sidebar-active text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className={activeTab === item.id ? "text-blue-600" : "text-slate-400"}>
                {item.icon}
              </span>
              <span className="ml-3">{item.label}</span>
              {item.id === "admin" && (
                <span className="ml-auto text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                  ADMIN
                </span>
              )}
            </button>
          ))}
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center px-3 py-2.5 mb-2 bg-gradient-to-r from-slate-50 to-blue-50/50 rounded-xl border border-slate-100">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm mr-3 shadow-md shadow-blue-500/20">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={16} className="mr-3" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="h-16 bg-white/80 glass-effect border-b border-slate-200/80 flex items-center px-4 md:px-8 justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="dashboard-sidebar"
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 id="page-title" tabIndex={-1} className="text-lg font-bold text-slate-800">{title}</h2>
              <p className="text-xs text-slate-500 hidden sm:block">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-700">Stateless Secure</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin">
          <div className="max-w-5xl mx-auto w-full animate-[fadeIn_0.3s_ease-out]">
            <DashboardContent tab={activeTab} />
          </div>
        </div>

        {/* Footer */}
        <footer className="flex-shrink-0 border-t border-slate-200/80 bg-white/60 glass-effect px-4 md:px-8 py-3">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>© 2026 Bank Sahabat Sampoerna. Internal use only.</span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-500" />
              Stateless Processing — No File Storage
            </span>
          </div>
        </footer>

        {/* Mobile backdrop */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-slate-900/50 z-30 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </main>
    </div>
  );
}

function DashboardContent({ tab }: { tab: Tab }) {
  switch (tab) {
    case "merge":
      return <MergeTool />;
    case "compress":
      return <CompressTool />;
    case "rearrange":
      return <RearrangeTool />;
    case "remove-pages":
      return <RemovePagesTool />;
    case "convert":
      return <ConvertTool />;
    case "edit":
      return <EditOverlayTool />;
    case "admin":
      return <AdminPanel />;
  }
}

function AdminPanel() {
  const [subTab, setSubTab] = useState<"users" | "audit">("users");
  return (
    <div>
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setSubTab("users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            subTab === "users"
              ? "bg-blue-100 text-blue-700 shadow-sm"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Users size={16} /> User Management
        </button>
        <button
          onClick={() => setSubTab("audit")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            subTab === "audit"
              ? "bg-blue-100 text-blue-700 shadow-sm"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <ShieldAlert size={16} /> Audit Logs
        </button>
      </div>
      {subTab === "users" ? <UserManagement /> : <AuditTable />}
    </div>
  );
}


