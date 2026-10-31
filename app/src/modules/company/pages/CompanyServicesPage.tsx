import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ClipboardList, MapPin, Calendar, User, HardHat, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useServices, ServiceRequestRecord } from "@/hooks/useServices";
import { useCompanies } from "@/hooks/useCompanies";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const CompanyServicesPage: React.FC = () => {
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

  const { services, isLoading, updateDispatch, isUpdatingDispatch, refetch } = useServices({
    companyId: currentCompany.id,
  });

  const [selectedService, setSelectedService] = useState<ServiceRequestRecord | null>(null);
  const [assignedTechId, setAssignedTechId] = useState("");
  const [companyTechs, setCompanyTechs] = useState<any[]>([]);

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

  const handleSaveInternalDispatch = async () => {
    if (!selectedService || !assignedTechId) {
      toast.error("Selecione um técnico da sua equipa.");
      return;
    }

    const tech = companyTechs.find((t) => t.user_id === assignedTechId);

    try {
      await updateDispatch({
        serviceId: selectedService.id,
        assignedCompanyId: currentCompany.id,
        technicianId: assignedTechId,
        status: "in_progress",
      });

      toast.success(`Ordem atribuída com sucesso ao técnico ${tech?.full_name}!`);
      setSelectedService(null);
      refetch();
    } catch (err: any) {
      toast.error("Erro ao escalar técnico: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Chamados Recebidos da Confiança
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Gerencie e distribua as ordens de serviço encaminhadas para a <strong>{currentCompany.name}</strong> entre os seus técnicos.
        </p>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" /> Carregando chamados da empresa...
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8">
            <ClipboardList className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum chamado atribuído à sua empresa</p>
            <p className="text-xs text-slate-400">Novos chamados encaminhados pelo Gestor Master da Confiança aparecerão automaticamente aqui.</p>
          </div>
        ) : (
          services.map((srv) => {
            const assignedTech = companyTechs.find((t) => t.user_id === srv.technician_id);

            return (
              <Card key={srv.id} className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{srv.reference}</span>
                      <Badge variant="outline" className="text-xs">{srv.appliance_type} • {srv.equipment_brand || "Geral"}</Badge>
                      <Badge variant={srv.status === "completed" ? "outline" : "secondary"} className="text-xs">
                        {srv.status === "completed" ? "Concluído" : "Aguardando Atendimento"}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{srv.description}</p>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 pt-1">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {srv.contact_name} ({srv.contact_phone})
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {srv.address}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {srv.scheduled_date} ({srv.scheduled_time})
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-start md:items-end justify-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Técnico Encarregado</span>
                      {assignedTech ? (
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                          <HardHat className="w-3.5 h-3.5" /> {assignedTech.full_name}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600">Pendente de atribuição</span>
                      )}
                    </div>

                    <Button
                      size="sm"
                      className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => {
                        setSelectedService(srv);
                        setAssignedTechId(srv.technician_id || "");
                      }}
                    >
                      {assignedTech ? "Alterar Técnico" : "Atribuir Técnico Interno"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal para atribuir técnico interno */}
      <Dialog open={!!selectedService} onOpenChange={(open) => !open && setSelectedService(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escalar Técnico da Empresa</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {selectedService?.reference} — {selectedService?.appliance_type}
              </p>
              <p className="text-slate-500">{selectedService?.address}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Técnico da {currentCompany.name}:</Label>
              <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Escolha um técnico da equipa..." />
                </SelectTrigger>
                <SelectContent>
                  {companyTechs.length === 0 ? (
                    <SelectItem value="empty" disabled className="text-xs text-slate-400">
                      Nenhum técnico cadastrado na equipa
                    </SelectItem>
                  ) : (
                    companyTechs.map((t) => (
                      <SelectItem key={t.user_id} value={t.user_id} className="text-xs">
                        {t.full_name} ({t.phone})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedService(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={isUpdatingDispatch}
              onClick={handleSaveInternalDispatch}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isUpdatingDispatch ? "Gravando..." : "Salvar Escala"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompanyServicesPage;
