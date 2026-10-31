import React from "react";
import { serviceStatusLabel } from "@/lib/service-status-label";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Users,
  Euro,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Building2,
  HardHat,
  Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useCompanies } from "@/hooks/useCompanies";
import { useServices } from "@/hooks/useServices";
import { supabase } from "@/integrations/supabase/client";
import { computeServiceFinancials } from "@/lib/financial-rules";
import { CompanyKpiCards } from "@/modules/company/components/CompanyKpiCards";

export const CompanyDashboardPage: React.FC = () => {
  const { profile } = useAuth();
  const { companies } = useCompanies();

  // A empresa vinculada é garantida pelo CompanyLayout (sem fallback para outra empresa).
  const currentCompany = companies.find((c) => c.id === profile?.company_id) ?? {
    id: "",
    name: "",
    nif: "",
    iban: "",
    email: null,
  };

  const { services: companyServices } = useServices({ companyId: currentCompany.id });
  const [companyTechs, setCompanyTechs] = React.useState<any[]>([]);

  React.useEffect(() => {
    const fetchCompanyTechs = async () => {

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", currentCompany.id)
        .eq("user_type", "technician");

      if (error) {
        toast.error("Não foi possível carregar os dados. Verifique a conexão.");
        setCompanyTechs([]);
      } else {
        setCompanyTechs(data || []);
      }
    };

    fetchCompanyTechs();
  }, [currentCompany.id]);

  // Repasse real, pela regra da Confiança (src/lib/financial-rules.ts), não um
  // percentual fixo por empresa. Não inclui o lucro de peças (precisa dos
  // materiais de cada serviço, não carregados aqui).
  const totalReceivable = React.useMemo(() => {
    return companyServices
      .filter((s) => s.status !== "cancelled")
      .reduce((acc, s) => acc + computeServiceFinancials(s as any).partnerShare, 0);
  }, [companyServices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {currentCompany.name}
              </h1>
              <p className="text-xs text-slate-500">
                NIF: <strong>{currentCompany.nif}</strong>
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/empresa/equipe">
            <Button variant="outline" className="text-xs gap-1.5">
              <Users className="w-4 h-4 text-emerald-600" /> Gerir Nossa Equipa
            </Button>
          </Link>
          <Link to="/empresa/chamados">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-sm">
              <ClipboardList className="w-4 h-4" /> Ver Chamados Atribuídos
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Chamados Recebidos
            </CardTitle>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-lg">
              <ClipboardList className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{companyServices.length}</div>
            <p className="text-xs text-slate-500 mt-1">Encaminhados pela Confiança</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nossa Equipa Técnica
            </CardTitle>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{companyTechs.length}</div>
            <p className="text-xs text-slate-500 mt-1">Técnicos próprios cadastrados</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Regra de Repasse
            </CardTitle>
            <div className="p-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 rounded-lg">
              <Euro className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-purple-600">50% da taxa, M.O. e taxa extra</div>
            <p className="text-xs text-slate-500 mt-1">Definida pela Confiança • NIF {currentCompany.nif}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saldo a Receber
            </CardTitle>
            <div className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">€ {totalReceivable.toFixed(2)}</div>
            <p className="text-xs text-slate-500 mt-1">Lote quinzenal em processamento</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Desempenho</h2>
        <CompanyKpiCards companyId={currentCompany.id} />
      </div>

      {/* Grid: Chamados Pendentes de Atribuição Interna & Técnicos da Empresa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Chamados em Aberto da Empresa</CardTitle>
              <CardDescription className="text-xs">Ordens encaminhadas para a sua equipa atender</CardDescription>
            </div>
            <Link to="/empresa/chamados">
              <Button variant="ghost" size="sm" className="text-xs text-emerald-600 gap-1">
                Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {companyServices.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhum chamado pendente no momento. Novos serviços despachados aparecerão aqui.
              </p>
            ) : (
              companyServices.map((srv) => (
                <div key={srv.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">{srv.reference}</span>
                    <Badge variant="secondary" className="text-[10px]">{serviceStatusLabel(srv.status)}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{srv.appliance_type} • {srv.description}</p>
                  <p className="text-[11px] text-slate-500">{srv.address} • {srv.contact_name}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Técnicos da Minha Empresa</CardTitle>
              <CardDescription className="text-xs">Profissionais cadastrados no seu quadro</CardDescription>
            </div>
            <Link to="/empresa/equipe">
              <Button variant="ghost" size="sm" className="text-xs text-emerald-600 gap-1">
                + Adicionar <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {companyTechs.map((tech) => (
              <div key={tech.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 font-semibold text-xs flex items-center justify-center">
                    {tech.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{tech.full_name}</p>
                    <p className="text-[11px] text-slate-500">{tech.phone} • {tech.email}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                  Ativo em Campo
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompanyDashboardPage;
