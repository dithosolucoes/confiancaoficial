import React from "react";
import { serviceStatusLabel } from "@/lib/service-status-label";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Building2,
  Euro,
  ArrowUpRight,
  Clock,
  Plus,
  Loader2,
} from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { useCompanies } from "@/hooks/useCompanies";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ExecutiveDashboardPanel from "@/components/ExecutiveDashboardPanel";
import { BarChart3, LayoutDashboard } from "lucide-react";

export const AdminDashboardPage: React.FC = () => {
  const { services, totalCount, isLoading } = useServices({ pageSize: 5 });
  const { companies } = useCompanies();
  const [totalRevenue, setTotalRevenue] = React.useState<number>(0);
  const [dashboardView, setDashboardView] = React.useState<"operacional" | "executivo">("operacional");

  const pendingCount = services.filter((s) => s.status === "pending").length;

  React.useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const { data, error } = await supabase
          .from("service_requests")
          .select("labor_cost, quote_parts, extra_fee, status")
          .not("status", "eq", "cancelled");

        if (error) {
          toast.error("Não foi possível calcular o faturamento.");
        } else {
          const sum = (data || []).reduce((acc: number, s: any) => {
            return acc + (Number(s.labor_cost) || 0) + (Number(s.quote_parts) || 0) + (Number(s.extra_fee) || 0);
          }, 0);
          setTotalRevenue(sum);
        }
      } catch {
        toast.error("Não foi possível calcular o faturamento.");
      }
    };

    fetchRevenue();
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Painel Executivo & Operacional
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Visão consolidada da operação direta da Confiança e empresas parceiras terceirizadas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <Button
              size="sm"
              variant={dashboardView === "operacional" ? "default" : "ghost"}
              className="h-8 text-xs font-semibold gap-1.5"
              onClick={() => setDashboardView("operacional")}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Operação
            </Button>
            <Button
              size="sm"
              variant={dashboardView === "executivo" ? "default" : "ghost"}
              className="h-8 text-xs font-semibold gap-1.5"
              onClick={() => setDashboardView("executivo")}
            >
              <BarChart3 className="w-3.5 h-3.5" /> DRE Executivo & BI
            </Button>
          </div>

          <Link to="/admin/servicos">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm h-8 text-xs">
              <Plus className="w-4 h-4" /> Nova Ordem
            </Button>
          </Link>
        </div>
      </div>

      {dashboardView === "executivo" ? (
        <div className="mt-4">
          <ExecutiveDashboardPanel />
        </div>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total de Ordens
            </CardTitle>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg">
              <ClipboardList className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : totalCount}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span className="text-emerald-600 font-medium">Controle Server-side</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Aguardando Despacho
            </CardTitle>
            <div className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            <p className="text-xs text-slate-500 mt-1">Requer atribuição a técnico ou parceiro</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Empresas Parceiras
            </CardTitle>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{companies.length}</div>
            <p className="text-xs text-slate-500 mt-1">Contratos com RLS isolado</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Faturamento Estimado
            </CardTitle>
            <div className="p-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 rounded-lg">
              <Euro className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">€ {totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-slate-500 mt-1">IVA apurado (6% / 23%)</p>
          </CardContent>
        </Card>
      </div>

      {/* Grid de 2 colunas: Últimas Ordens e Empresas Credenciadas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ordens Recentes */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Ordens de Serviço em Destaque</CardTitle>
                <p className="text-xs text-slate-500">Acompanhamento operacional em tempo real</p>
              </div>
              <Link to="/admin/servicos">
                <Button variant="ghost" size="sm" className="text-xs text-blue-600 gap-1">
                  Ver todas <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {services.map((srv) => (
                  <div key={srv.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white">
                          {srv.reference}
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {srv.appliance_type} ({srv.equipment_brand || "Geral"})
                        </span>
                        <Badge
                          variant={
                            srv.status === "completed"
                              ? "outline"
                              : srv.status === "pending"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {serviceStatusLabel(srv.status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{srv.address} • {srv.contact_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white block">
                        {srv.scheduled_date}
                      </span>
                      <span className="text-[11px] text-slate-500">{srv.scheduled_time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Empresas Parceiras Terceirizadas */}
        <div className="space-y-4">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Rede Terceirizada</CardTitle>
                <p className="text-xs text-slate-500">Parceiros B2B credenciados</p>
              </div>
              <Link to="/admin/empresas">
                <Button variant="ghost" size="sm" className="text-xs text-blue-600 gap-1">
                  Gerir <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {companies.map((comp) => (
                <div
                  key={comp.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white">
                      {comp.name}
                    </span>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                      {comp.is_approved ? "Ativa" : "Pendente"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">NIF: {comp.nif} • {comp.phone}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span>{comp.email || "—"}</span>
                    <span className="text-emerald-600 font-medium">Credenciada</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )}
</div>
  );
};

export default AdminDashboardPage;
