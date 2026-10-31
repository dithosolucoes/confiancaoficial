import React, { useState } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Euro,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  Phone,
  FileText,
  Clock,
  Loader2,
  ShieldAlert,
} from "lucide-react";

import { useCompanies } from "@/hooks/useCompanies";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navItems: NavItem[] = [
  { title: "Painel da Empresa", href: "/empresa/dashboard", icon: LayoutDashboard },
  { title: "Chamados Atribuídos", href: "/empresa/chamados", icon: ClipboardList },
  { title: "Nossa Equipa Técnica", href: "/empresa/equipe", icon: Users },
  { title: "Repasses & Faturamento", href: "/empresa/financeiro", icon: Euro },
];

export const CompanyLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();
  const { companies } = useCompanies();

  // Role Guard: papel vem só do servidor (profiles.user_type).
  const isAuthorizedCompany =
    profile?.user_type === "company_admin" ||
    profile?.user_type === "gestor";

  // Sem fallback para companies[0]: só a empresa vinculada ao usuário.
  const currentCompany = companies.find((c) => c.id === profile?.company_id) ?? null;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Verificando credenciais da empresa...</p>
      </div>
    );
  }

  if (!currentCompany) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center space-y-3 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Empresa não encontrada</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Seu usuário não está vinculado a uma empresa. Fale com o Gestor Master.</p>
        </div>
      </div>
    );
  }

  // Dono de empresa só entra com a empresa aprovada. O gestor continua acessando
  // para dar suporte, mesmo com a empresa pendente ou suspensa.
  if (!currentCompany.is_approved && profile?.user_type === "company_admin") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Empresa aguardando aprovação</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            O cadastro de <strong>{currentCompany.name}</strong> ainda não foi aprovado pelo Gestor Master da Confiança Repara.
            Assim que aprovado, o acesso é liberado automaticamente.
          </p>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            Voltar ao Início
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthorizedCompany) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Portal Exclusivo para Empresas Parceiras</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Você precisa estar autenticado como Gestor de Empresa Parceira (B2B) credenciada pela Confiança Repara para acessar esta área.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Button onClick={() => navigate("/auth")} className="w-full bg-emerald-600 hover:bg-emerald-700">
              Fazer Login como Parceiro
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
        {/* Sidebar */}
        <aside
          className={`${
            collapsed ? "w-16" : "w-64"
          } transition-all duration-300 ease-in-out bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 shadow-sm z-40`}
        >
          <div>
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              {!collapsed ? (
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                      {currentCompany.name}
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Empresa Parceira
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full flex justify-center">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white font-bold text-sm">
                    {currentCompany.name.slice(0, 2).toUpperCase()}
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </Button>
            </div>

            <nav className="p-2 space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`flex items-center ${
                      collapsed ? "justify-center px-2" : "justify-between px-3"
                    } py-2.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-600 text-white shadow-sm font-semibold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                    }`}
                    title={collapsed ? item.title : undefined}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            {!collapsed ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {profile?.full_name || ""}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate">
                    {user?.email || ""}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-red-600"
                  onClick={handleSignOut}
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
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default CompanyLayout;
