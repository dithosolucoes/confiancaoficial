import React, { useState } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Package,
  Building2,
  HardHat,
  Users,
  Euro,
  Wallet,
  Truck,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Sparkles,
  Search,
  Plus,
  Compass,
  MessageCircle,
  Loader2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import GestorChatPanel from "@/components/GestorChatPanel";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "OPERAÇÃO",
    items: [
      { title: "Visão Geral", href: "/admin/dashboard", icon: LayoutDashboard },
      { title: "Ordens de Serviço", href: "/admin/servicos", icon: ClipboardList },
      { title: "Agenda de Visitas", href: "/admin/agenda", icon: Calendar },
      { title: "Orçamentos & Peças", href: "/admin/orcamentos", icon: Package },
    ],
  },
  {
    title: "REDE & EQUIPA",
    items: [
      { title: "Empresas Parceiras", href: "/admin/empresas", icon: Building2, badge: "Multi-Tenant" },
      { title: "Equipa Técnica", href: "/admin/tecnicos", icon: HardHat },
      { title: "Clientes", href: "/admin/clientes", icon: Users },
    ],
  },
  {
    title: "FINANCEIRO & FISCAL",
    items: [
      { title: "Fluxo de Caixa", href: "/admin/financeiro", icon: Euro },
      { title: "Pagamentos Técnicos", href: "/admin/payouts", icon: Wallet },
      { title: "Fornecedores", href: "/admin/fornecedores", icon: Truck },
      { title: "Quilometragem", href: "/admin/deslocamento", icon: Compass },
      { title: "Centro de Auditoria", href: "/admin/auditoria", icon: ShieldCheck },
    ],
  },
  {
    title: "SISTEMA",
    items: [
      { title: "Configurações", href: "/admin/configuracoes", icon: Settings },
    ],
  },
];

export const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, loading, signOut } = useAuth();

  // Role Guard: papel vem só do servidor (profiles.user_type).
  const isAuthorizedGestor = profile?.user_type === "gestor";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Verificando permissões de gestão...</p>
      </div>
    );
  }

  if (!isAuthorizedGestor) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Acesso Restrito ao Gestor Master</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Você não possui permissões administrativas para acessar o portal central da Confiança Repara.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Button onClick={() => navigate("/auth")} className="w-full">
              Fazer Login como Gestor
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              Voltar ao Início
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Lateral Retrátil */}
        <aside
          className={`${
            collapsed ? "w-16" : "w-64"
          } transition-all duration-300 ease-in-out bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 shadow-sm z-40`}
        >
          {/* Top Brand */}
          <div>
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              {!collapsed ? (
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
                    CR
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                      Confiança Repara
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Gestão Master
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full flex justify-center">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm">
                    CR
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                onClick={() => setCollapsed(!collapsed)}
                title={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
              >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </Button>
            </div>

            {/* Navigation Sections */}
            <nav className="p-2 space-y-4 overflow-y-auto max-h-[calc(100vh-170px)]">
              {navSections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-1">
                  {!collapsed && (
                    <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                      {section.title}
                    </div>
                  )}
                  {section.items.map((item) => {
                    const isActive = location.pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={`flex items-center ${
                          collapsed ? "justify-center px-2" : "justify-between px-3"
                        } py-2 rounded-lg text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-blue-600 text-white shadow-sm font-semibold"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        title={collapsed ? item.title : undefined}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                          {!collapsed && <span className="truncate">{item.title}</span>}
                        </div>
                        {!collapsed && item.badge && (
                          <Badge
                            variant={item.badgeVariant || "secondary"}
                            className="text-[9px] px-1.5 py-0 uppercase font-bold"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>

          {/* User Profile Footer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            {!collapsed ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold text-xs flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
                    GM
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {profile?.full_name || "Gestor Master"}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate">
                      confiancaversatilidade@gmail.com
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                  onClick={handleSignOut}
                  title="Terminar sessão"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-red-600"
                  onClick={handleSignOut}
                  title="Terminar sessão"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* Conteúdo Central Principal */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 md:p-6 lg:p-8 relative">
          <Outlet />

          {/* Botão Flutuante de Atendimento / Chat em Tempo Real */}
          <div className="fixed bottom-6 right-6 z-40">
            <Button
              onClick={() => setChatOpen(true)}
              className="rounded-full h-12 w-12 bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center relative transition-transform hover:scale-105"
              title="Atendimento & Conversas de Serviços"
            >
              <MessageCircle className="w-6 h-6" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                  {unreadChatCount}
                </span>
              )}
            </Button>
          </div>

          {/* Gaveta do Chat do Gestor */}
          <Sheet open={chatOpen} onOpenChange={setChatOpen}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-card">
              <SheetHeader className="p-4 border-b border-border">
                <SheetTitle className="text-base font-bold flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-600" />
                  Central de Atendimento Confiança
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-hidden p-2">
                <GestorChatPanel onUnreadCountChange={setUnreadChatCount} />
              </div>
            </SheetContent>
          </Sheet>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
