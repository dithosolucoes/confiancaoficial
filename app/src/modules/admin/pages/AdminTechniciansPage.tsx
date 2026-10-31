import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HardHat,
  Phone,
  MapPin,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Building2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useCompanies } from "@/hooks/useCompanies";
import { supabase } from "@/integrations/supabase/client";

interface TechProfile {
  id: string;
  user_id: string;
  full_name: string;
  surname?: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  iban: string | null;
  company_id: string | null;
  user_type: string;
  is_approved?: boolean;
}

export const AdminTechniciansPage: React.FC = () => {
  const { companies } = useCompanies();
  const [technicians, setTechnicians] = useState<TechProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<"all" | "active" | "pending">("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadTechs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_type", "technician")
        .order("full_name", { ascending: true });
      if (error) throw error;
      setTechnicians((data || []) as TechProfile[]);
    } catch (err) {
      console.error("Erro ao carregar técnicos:", err);
      toast.error("Não foi possível carregar os técnicos. Verifique a conexão.");
      setTechnicians([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTechs();
  }, [loadTechs]);

  // Grava no servidor primeiro. Só atualiza a tela se a gravação foi aceita.
  const setTechnicianApproval = async (tech: TechProfile, approved: boolean) => {
    setActionLoadingId(tech.id);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ is_approved: approved } as any)
        .eq("id", tech.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Sem permissão para alterar este técnico.");

      setTechnicians((prev) =>
        prev.map((t) => (t.id === tech.id ? { ...t, is_approved: approved } : t))
      );
      if (approved) {
        toast.success(`Técnico ${tech.full_name} aprovado com sucesso! Acesso ao painel liberado.`);
      } else {
        toast.warning(`Credenciamento de ${tech.full_name} foi suspenso/recusado.`);
      }
    } catch (e: any) {
      toast.error("Erro ao atualizar status: " + (e?.message ?? "tente novamente"));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveTechnician = (tech: TechProfile) => setTechnicianApproval(tech, true);
  const handleRejectTechnician = (tech: TechProfile) => setTechnicianApproval(tech, false);

  const pendingCount = technicians.filter((t) => t.is_approved === false).length;
  const activeCount = technicians.filter((t) => t.is_approved !== false).length;

  const filteredTechnicians = technicians.filter((tech) => {
    if (filterTab === "pending") return tech.is_approved === false;
    if (filterTab === "active") return tech.is_approved !== false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <HardHat className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Equipa Técnica & Quadros
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestão unificada de técnicos diretos da Confiança, terceirizados e aprovação de novos cadastros de campo.
          </p>
        </div>

        {/* Abas / Filtro de Status de Aprovação */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <Button
            size="sm"
            variant={filterTab === "all" ? "default" : "ghost"}
            className="h-8 text-xs font-medium"
            onClick={() => setFilterTab("all")}
          >
            Todos ({technicians.length})
          </Button>
          <Button
            size="sm"
            variant={filterTab === "active" ? "default" : "ghost"}
            className="h-8 text-xs font-medium"
            onClick={() => setFilterTab("active")}
          >
            Credenciados ({activeCount})
          </Button>
          <Button
            size="sm"
            variant={filterTab === "pending" ? "default" : "ghost"}
            className={`h-8 text-xs font-medium ${
              pendingCount > 0 ? "text-amber-600 dark:text-amber-400 font-bold" : ""
            }`}
            onClick={() => setFilterTab("pending")}
          >
            Aguardando Aprovação ({pendingCount})
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Carregando equipa técnica...
        </div>
      ) : filteredTechnicians.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8">
          <HardHat className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {filterTab === "pending"
              ? "Nenhum técnico aguardando aprovação no momento."
              : "Nenhum técnico encontrado nesta categoria."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredTechnicians.map((tech) => {
            const isDirect = !tech.company_id;
            const company = companies.find((c) => c.id === tech.company_id);
            const isPending = tech.is_approved === false;
            const isProcessing = actionLoadingId === tech.id;

            return (
              <Card
                key={tech.id}
                className={`border shadow-sm transition-all ${
                  isPending
                    ? "border-amber-300 dark:border-amber-800/60 bg-amber-50/20 dark:bg-amber-950/10"
                    : "border-slate-200 dark:border-slate-800 bg-card"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2.5 rounded-full font-bold text-sm shrink-0 ${
                          isPending
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60"
                            : isDirect
                            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700"
                            : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700"
                        }`}
                      >
                        {tech.full_name ? tech.full_name.slice(0, 2).toUpperCase() : "TC"}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white truncate">
                          {tech.full_name}
                        </CardTitle>
                        <CardDescription className="text-xs truncate">
                          {tech.email || "Sem e-mail cadastrado"}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        variant={isDirect ? "default" : "outline"}
                        className={
                          isDirect
                            ? "bg-blue-600 text-white text-[11px]"
                            : "border-emerald-500 text-emerald-600 text-[11px] font-semibold"
                        }
                      >
                        {isDirect ? "Técnico Direto" : `Terceirizado (${company?.name || "Empresa"})`}
                      </Badge>

                      {isPending ? (
                        <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950 text-[10px] font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Aguardando Aprovação
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-[10px] font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Credenciado Ativo
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-1 text-xs text-slate-600 dark:text-slate-300">
                  <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{tech.phone || "Telefone não informado"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{tech.address || "Lisboa & Área Metropolitana"}</span>
                    </div>
                    {isDirect && (
                      <div className="font-mono text-[11px] text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800">
                        IBAN Pessoal: {tech.iban || "Pendente de registo"}
                      </div>
                    )}
                    {!isDirect && (
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 pt-1 border-t border-slate-200 dark:border-slate-800 font-medium">
                        Liquidação via NIF corporativo da {company?.name}
                      </div>
                    )}
                  </div>

                  {/* Ações de Gestão de Credenciamento */}
                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                    {isPending ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                          disabled={isProcessing}
                          onClick={() => handleRejectTechnician(tech)}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Recusar
                        </Button>
                        <Button
                          size="sm"
                          className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                          disabled={isProcessing}
                          onClick={() => handleApproveTechnician(tech)}
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          )}
                          Aprovar Credenciamento
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 text-slate-500 hover:text-red-600"
                        disabled={isProcessing}
                        onClick={() => handleRejectTechnician(tech)}
                        title="Suspender acesso temporariamente"
                      >
                        Suspender Acesso
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminTechniciansPage;
