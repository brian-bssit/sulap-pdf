"use client";

import { redirectToLogin } from "@/lib/session";
import { t } from "@/lib/strings";
import IdleGuard from "@/components/IdleGuard";
import RoleRequests from "@/components/RoleRequests";
import { ROLES, VIEW_ROLES, isRole, type Role } from "@/lib/roles";
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
  SquareSplitHorizontal,
  Lock,
  Eraser,
  Stamp,
  Image as ImageIcon,
  FileType2,
  ScanText,
  GitCompare,
  Workflow,
  GitPullRequest,
} from "lucide-react";
import CompressTool from "@/components/CompressTool";
import MergeTool from "@/components/MergeTool";
import RearrangeTool from "@/components/RearrangeTool";
import RemovePagesTool from "@/components/RemovePagesTool";
import SplitTool from "@/components/SplitTool";
import SecurityTool from "@/components/SecurityTool";
import ScrubTool from "@/components/ScrubTool";
import WatermarkTool from "@/components/WatermarkTool";
import ImageConvertTool from "@/components/ImageConvertTool";
import ToWordTool from "@/components/ToWordTool";
import OcrTool from "@/components/OcrTool";
import CompareTool from "@/components/CompareTool";
import WorkflowTool from "@/components/WorkflowTool";
import ConvertTool from "@/components/ConvertTool";
import EditOverlayTool from "@/components/EditOverlayTool";
import AuditTable from "@/components/AuditTable";
import UserManagement from "@/components/UserManagement";

const LOGO_URL = "/bss-logo.jpg";

type Tab = "merge" | "compress" | "rearrange" | "remove-pages" | "split" | "security" | "scrub" | "watermark" | "images" | "to-word" | "ocr" | "compare" | "workflow" | "convert" | "edit" | "admin";

interface User {
  name: string;
  email: string;
  id: string;
  role: Role;
}

const DEMO_USER: User = { id: "", name: t.shell.loading, email: "", role: "user" };

const navItems: { id: Tab; label: string; icon: React.ReactNode; roles: readonly string[] }[] = [
  { id: "compress", label: t.nav.compress, icon: <Minimize2 size={20} />, roles: ROLES },
  { id: "merge", label: t.nav.merge, icon: <Layers size={20} />, roles: ROLES },
  { id: "rearrange", label: t.nav.rearrange, icon: <Grid3x3 size={20} />, roles: ROLES },
  { id: "remove-pages", label: t.nav.removePages, icon: <Scissors size={20} />, roles: ROLES },
  { id: "split", label: t.nav.split, icon: <SquareSplitHorizontal size={20} />, roles: ROLES },
  { id: "watermark", label: t.nav.watermark, icon: <Stamp size={20} />, roles: ROLES },
  { id: "security", label: t.nav.security, icon: <Lock size={20} />, roles: ROLES },
  { id: "scrub", label: t.nav.scrub, icon: <Eraser size={20} />, roles: ROLES },
  { id: "images", label: t.nav.images, icon: <ImageIcon size={20} />, roles: ROLES },
  { id: "to-word", label: t.nav.toWord, icon: <FileType2 size={20} />, roles: ROLES },
  { id: "ocr", label: t.nav.ocr, icon: <ScanText size={20} />, roles: ROLES },
  { id: "compare", label: t.nav.compare, icon: <GitCompare size={20} />, roles: ROLES },
  { id: "workflow", label: t.nav.workflow, icon: <Workflow size={20} />, roles: ROLES },
  { id: "convert", label: t.nav.convert, icon: <FileUp size={20} />, roles: ROLES },
  { id: "edit", label: t.nav.edit, icon: <PenTool size={20} />, roles: ROLES },
  { id: "admin", label: t.nav.admin, icon: <ShieldAlert size={20} />, roles: VIEW_ROLES },
];

const pageTitles: Record<Tab, { title: string; subtitle: string }> = t.pages;

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User>(DEMO_USER);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("compress");
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          redirectToLogin(res.headers.get("x-auth-reason")); // membawa alasan (idle / login di tempat lain)
          return null;
        }
        if (!res.ok) throw new Error("Auth failed");
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setUser({ id: data.id, name: data.display_name, email: data.email, role: isRole(data.role) ? data.role : "user" });
        setIdleSeconds(data.idle_timeout_seconds ?? 0);
      })
      .catch(() => router.push("/"));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    // Muat ulang penuh (bukan router.push): seluruh state/blob di memori halaman ikut terbuang.
    window.location.assign("/");
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
      {idleSeconds > 0 && <IdleGuard timeoutSeconds={idleSeconds} />}
      {/* Sidebar */}
      <aside
        id="dashboard-sidebar"
        aria-label={t.nav.label}
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200/80 transform transition-transform duration-300 ease-in-out flex flex-col shadow-xl md:shadow-none ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="py-6 px-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt={t.shell.logoAlt} className="h-14 object-contain" />
            <div>
              <span className="text-lg font-bold text-slate-800 tracking-tight">SULAP PDF</span>
              <span className="block text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                {t.shell.version}
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
                  {(t.roles[user.role] ?? user.role).toUpperCase()}
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
            <LogOut size={16} className="mr-3" aria-hidden="true" />
            {t.nav.logout}
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
              aria-label={isMobileMenuOpen ? t.nav.close : t.nav.open}
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
              <span className="text-xs font-medium text-emerald-700">{t.shell.badge}</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin">
          <div className="max-w-5xl mx-auto w-full animate-[fadeIn_0.3s_ease-out]">
            <DashboardContent tab={activeTab} me={{ id: user.id, role: user.role }} />
          </div>
        </div>

        {/* Footer */}
        <footer className="flex-shrink-0 border-t border-slate-200/80 bg-white/60 glass-effect px-4 md:px-8 py-3">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>{t.app.footer}</span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-500" />
              {t.app.stateless}
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

function DashboardContent({ tab, me }: { tab: Tab; me: { id: string; role: Role } }) {
  switch (tab) {
    case "merge":
      return <MergeTool />;
    case "compress":
      return <CompressTool />;
    case "rearrange":
      return <RearrangeTool />;
    case "remove-pages":
      return <RemovePagesTool />;
    case "split":
      return <SplitTool />;
    case "watermark":
      return <WatermarkTool />;
    case "security":
      return <SecurityTool />;
    case "scrub":
      return <ScrubTool />;
    case "images":
      return <ImageConvertTool />;
    case "to-word":
      return <ToWordTool />;
    case "ocr":
      return <OcrTool />;
    case "compare":
      return <CompareTool />;
    case "workflow":
      return <WorkflowTool />;
    case "convert":
      return <ConvertTool />;
    case "edit":
      return <EditOverlayTool />;
    case "admin":
      return <AdminPanel me={me} />;
  }
}

function AdminPanel({ me }: { me: { id: string; role: Role } }) {
  const [subTab, setSubTab] = useState<"users" | "requests" | "audit">("users");
  const tabCls = (on: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
      on ? "bg-blue-100 text-blue-700 shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
    }`;
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => setSubTab("users")} className={tabCls(subTab === "users")}>
          <Users size={16} aria-hidden="true" /> {t.admin.users}
        </button>
        <button onClick={() => setSubTab("requests")} className={tabCls(subTab === "requests")}>
          <GitPullRequest size={16} aria-hidden="true" /> {t.admin.requests}
        </button>
        <button onClick={() => setSubTab("audit")} className={tabCls(subTab === "audit")}>
          <ShieldAlert size={16} aria-hidden="true" /> {t.admin.audit}
        </button>
      </div>
      {subTab === "users" ? <UserManagement me={me} /> : subTab === "requests" ? <RoleRequests me={me} /> : <AuditTable />}
    </div>
  );
}
