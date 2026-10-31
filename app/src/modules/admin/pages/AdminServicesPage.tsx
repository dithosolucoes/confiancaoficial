import React, { useState } from "react";
import { serviceStatusLabel } from "@/lib/service-status-label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  Search,
  Plus,
  MapPin,
  Calendar,
  User,
  Building2,
  HardHat,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
} from "lucide-react";
import { useServices, ServiceRequestRecord } from "@/hooks/useServices";
import { useCompanies } from "@/hooks/useCompanies";
import { supabase } from "@/integrations/supabase/client";
import ServiceRequestForm from "@/components/ServiceRequestForm";
import ServicesReportDialog from "@/components/ServicesReportDialog";
import { toast } from "sonner";

export const AdminServicesPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceRequestRecord | null>(null);

  // Dispatch state for selected service
  const [dispatchType, setDispatchType] = useState<"direct" | "company">("direct");
  const [selectedTechId, setSelectedTechId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  const { companies } = useCompanies();
  const [directTechs, setDirectTechs] = useState<any[]>([]);

  const {
    services,
    totalCount,
    totalPages,
    currentPage,
    isLoading,
    refetch,
    updateDispatch,
    isUpdatingDispatch,
  } = useServices({
    page,
    pageSize,
    status: statusFilter,
    companyId: companyFilter === "all" || companyFilter === "direct" ? null : companyFilter,
    search: searchTerm,
  });

  React.useEffect(() => {
    const fetchDirectTechs = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, company_id")
        .eq("user_type", "technician")
        .is("company_id", null);

      if (error) {
        toast.error("Não foi possível carregar os técnicos diretos.");
        setDirectTechs([]);
      } else {
        setDirectTechs(data || []);
      }
    };

    fetchDirectTechs();
  }, []);

  const handleOpenDispatch = (srv: ServiceRequestRecord) => {
    setSelectedService(srv);
    if (srv.assigned_company_id) {
      setDispatchType("company");
      setSelectedCompanyId(srv.assigned_company_id);
      setSelectedTechId("");
    } else if (srv.technician_id) {
      setDispatchType("direct");
      setSelectedTechId(srv.technician_id);
      setSelectedCompanyId("");
    } else {
      setDispatchType("direct");
      setSelectedTechId("");
      setSelectedCompanyId("");
    }
  };

  const handleSaveDispatch = async () => {
    if (!selectedService) return;

    if (dispatchType === "direct" && !selectedTechId) {
      toast.error("Selecione um técnico direto da Confiança.");
      return;
    }

    if (dispatchType === "company" && !selectedCompanyId) {
      toast.error("Selecione uma empresa parceira terceirizada.");
      return;
    }

    try {
      await updateDispatch({
        serviceId: selectedService.id,
        assignedCompanyId: dispatchType === "company" ? selectedCompanyId : null,
        technicianId: dispatchType === "direct" ? selectedTechId : null,
        status: selectedService.status === "pending" ? "in_progress" : selectedService.status,
      });

      toast.success(
        dispatchType === "direct"
          ? "Ordem despachada e gravada no banco para o técnico direto!"
          : "Ordem transferida e gravada no banco para a empresa parceira!"
      );
      setSelectedService(null);
    } catch (err: any) {
      toast.error("Erro ao atualizar despacho: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Ordens de Serviço & Despacho
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Controle operacional com paginação server-side e despacho dual (Equipa Direta vs. Terceirizada).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowReportModal(true)}
            className="gap-1.5 shadow-sm text-xs h-9 border-slate-300 dark:border-slate-700"
          >
            <FileText className="w-4 h-4 text-blue-600" /> Relatório PDF / Excel
          </Button>
          <Button onClick={() => setShowNewModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm text-xs h-9">
            <Plus className="w-4 h-4" /> Nova Ordem de Serviço
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardContent className="p-3.5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por referência, cliente, morada ou aparelho..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-44 h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="in_progress">Em Andamento</SelectItem>
                <SelectItem value="quote_accepted">Orçamento Aceite</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={companyFilter}
              onValueChange={(val) => {
                setCompanyFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-52 h-9 text-xs">
                <SelectValue placeholder="Empresa / Execução" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Execuções</SelectItem>
                <SelectItem value="direct">Equipa Própria (Confiança)</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Services List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Carregando chamados...
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8">
            <ClipboardList className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhuma ordem encontrada</p>
            <p className="text-xs text-slate-400">Tente ajustar os filtros ou cadastre um novo chamado.</p>
          </div>
        ) : (
          services.map((srv) => {
            const isAssignedToCompany = !!srv.assigned_company_id;
            const assignedCompany = companies.find((c) => c.id === srv.assigned_company_id);
            const assignedTech = directTechs.find((p) => p.user_id === srv.technician_id);

            return (
              <Card key={srv.id} className="border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm">
                <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left Column */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {srv.reference}
                      </span>
                      <Badge variant="outline" className="text-xs font-semibold">
                        {srv.appliance_type} • {srv.equipment_brand || "Geral"}
                      </Badge>
                      <Badge
                        variant={
                          srv.status === "completed"
                            ? "outline"
                            : srv.status === "pending"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-[11px]"
                      >
                        {serviceStatusLabel(srv.status)}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {srv.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 pt-1">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {srv.contact_name} ({srv.contact_phone})
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {srv.address}, {srv.localidade || "Lisboa"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {srv.scheduled_date} ({srv.scheduled_time})
                      </span>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-row md:flex-col md:items-end justify-between md:justify-center gap-2 shrink-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800 pt-3 md:pt-0">
                    <div className="flex flex-col items-start md:items-end">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Atribuição Operacional
                      </span>
                      {isAssignedToCompany ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          <Building2 className="w-3.5 h-3.5" />
                          {assignedCompany?.name || "Empresa Terceirizada"}
                        </span>
                      ) : assignedTech ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                          <HardHat className="w-3.5 h-3.5" />
                          {assignedTech.full_name} (Direto)
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600 flex items-center gap-1 mt-0.5">
                          Não atribuído
                        </span>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 gap-1.5 border-slate-300 dark:border-slate-700"
                      onClick={() => handleOpenDispatch(srv)}
                    >
                      Despachar / Atribuir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 text-xs text-slate-500">
          <span>
            Mostrando página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({totalCount} chamados)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 text-xs gap-1"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Despacho Dual */}
      <Dialog open={!!selectedService} onOpenChange={(open) => !open && setSelectedService(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              Despachar Ordem {selectedService?.reference}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {selectedService?.appliance_type} • {selectedService?.contact_name}
              </p>
              <p className="text-slate-500">{selectedService?.address}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Escolha o Destino da Ordem:</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchType("direct")}
                  className={`p-3 rounded-lg border-2 text-xs font-medium text-left flex flex-col gap-1 transition-all ${
                    dispatchType === "direct"
                      ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100"
                      : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  <span className="font-bold flex items-center gap-1">
                    <HardHat className="w-4 h-4 text-blue-600" /> Equipa Direta
                  </span>
                  <span className="text-[10px] text-slate-500">Técnico contratado da Confiança</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchType("company")}
                  className={`p-3 rounded-lg border-2 text-xs font-medium text-left flex flex-col gap-1 transition-all ${
                    dispatchType === "company"
                      ? "border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100"
                      : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  <span className="font-bold flex items-center gap-1">
                    <Building2 className="w-4 h-4 text-emerald-600" /> Terceirizada
                  </span>
                  <span className="text-[10px] text-slate-500">Oficina ou Empresa Parceira</span>
                </button>
              </div>
            </div>

            {dispatchType === "direct" ? (
              <div className="space-y-2">
                <Label htmlFor="tech-select" className="text-xs">Selecione o Técnico da Confiança:</Label>
                <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                  <SelectTrigger id="tech-select" className="h-9 text-xs">
                    <SelectValue placeholder="Escolha o técnico..." />
                  </SelectTrigger>
                  <SelectContent>
                    {directTechs.length === 0 ? (
                      <SelectItem value="empty" disabled className="text-xs text-slate-400">
                        Nenhum técnico direto cadastrado
                      </SelectItem>
                    ) : (
                      directTechs.map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id} className="text-xs">
                          {t.full_name} • {t.phone}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="comp-select" className="text-xs">Selecione a Empresa Parceira:</Label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger id="comp-select" className="h-9 text-xs">
                    <SelectValue placeholder="Escolha a empresa terceirizada..." />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.length === 0 ? (
                      <SelectItem value="empty" disabled className="text-xs text-slate-400">
                        Nenhuma empresa parceira cadastrada
                      </SelectItem>
                    ) : (
                      companies.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name}{c.is_approved ? "" : " (pendente)"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedService(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={isUpdatingDispatch}
              onClick={handleSaveDispatch}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isUpdatingDispatch ? "Gravando..." : "Confirmar Despacho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Criar Novo Serviço */}
      {showNewModal && (
        <ServiceRequestForm
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            refetch();
            toast.success("Novo chamado registrado com sucesso no banco!");
          }}
          technicians={directTechs.map((p) => ({ user_id: p.user_id, full_name: p.full_name }))}
          isGestor={true}
        />
      )}

      {/* Diálogo Exportador de Relatórios Consolidados */}
      <ServicesReportDialog
        open={showReportModal}
        onOpenChange={setShowReportModal}
        services={services}
        profiles={directTechs}
        quotePartsItems={[]}
        partnerOrgs={companies}
      />
    </div>
  );
};

export default AdminServicesPage;
