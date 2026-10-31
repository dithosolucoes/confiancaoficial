import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useServices, ServiceRequestRecord } from "@/hooks/useServices";
import ServiceDetailDialog from "@/components/ServiceDetailDialog";
import MarkAsPaidButton from "@/components/MarkAsPaidButton";
import { Package, Euro, Loader2, CheckCircle, Eye } from "lucide-react";
import { toast } from "sonner";

export const AdminBudgetingPage: React.FC = () => {
  const { services, isLoading, updateService, refetch } = useServices({ pageSize: 50 });
  const [selectedDetailService, setSelectedDetailService] = useState<ServiceRequestRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const budgetedServices = services.filter(
    (s) => (s.quote_parts || 0) > 0 || ["quote_sent", "quote_accepted", "quote_rejected"].includes(s.status),
  );

  const totalPartsSale = budgetedServices.reduce((acc, s) => acc + (s.quote_parts || 0), 0);
  const totalPartsCost = budgetedServices.reduce((acc, s) => acc + (s.quote_supplier_cost || 0), 0);
  const totalMargin = totalPartsSale - totalPartsCost;

  // O gestor revisa peças, custo e IVA (o técnico não vê margem) e então
  // envia o orçamento ao cliente. Daí em diante, quem aceita ou recusa é o
  // cliente (CustomerDashboard), nunca o gestor diretamente.
  const handleSendQuote = async (srv: ServiceRequestRecord) => {
    try {
      await updateService({
        serviceId: srv.id,
        updates: { status: "quote_sent", quote_status: "sent" } as any,
      });
      toast.success(`Orçamento ${srv.reference} enviado ao cliente.`);
    } catch (err: any) {
      toast.error("Erro ao enviar orçamento: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Orçamentos, Peças & Materiais
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestão de orçamentos técnicos com custo sem IVA, margem de markup e taxa de IVA reduzida (6%) vs. normal (23%).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-slate-500 font-semibold">Orçamentos Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : budgetedServices.length}
            </div>
            <p className="text-xs text-slate-500 mt-1">Com peças e custos orçados</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-slate-500 font-semibold">Volume de Peças Orçadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              € {totalPartsSale.toFixed(2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Valor de venda ao cliente</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-slate-500 font-semibold">Margem Apurada</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              € {totalMargin.toFixed(2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Custo fornecedor: € {totalPartsCost.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Carregando orçamentos...
          </div>
        ) : budgetedServices.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8">
            <Package className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum orçamento ativo</p>
            <p className="text-xs text-slate-400">Orçamentos gerados pelos técnicos em campo aparecerão listados aqui.</p>
          </div>
        ) : (
          budgetedServices.map((srv) => (
            <Card key={srv.id} className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">{srv.reference}</span>
                    <Badge variant="outline" className="text-xs">{srv.appliance_type}</Badge>
                    <Badge variant={srv.status === "quote_accepted" ? "default" : "secondary"} className="text-xs">{srv.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Peça: {srv.quote_parts_name || "Kit de reparação e componentes"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {srv.report_text || "Diagnóstico registrado pelo técnico em campo."}
                  </p>
                </div>

                <div className="flex flex-col md:items-end justify-between gap-3 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">
                      Venda: <strong className="text-slate-900 dark:text-white">€{(srv.quote_parts || 0).toFixed(2)}</strong>
                    </div>
                    <div className="text-xs text-slate-500">
                      Custo: €{(srv.quote_supplier_cost || 0).toFixed(2)}
                    </div>
                    <div className="text-xs font-semibold text-emerald-600 mt-1">
                      Lucro Peça: €{((srv.quote_parts || 0) - (srv.quote_supplier_cost || 0)).toFixed(2)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1"
                      onClick={() => {
                        setSelectedDetailService(srv);
                        setIsDetailOpen(true);
                      }}
                    >
                      <Eye className="w-3.5 h-3.5" /> Detalhes
                    </Button>
                    {srv.status === "budgeting" && (
                      <Button
                        size="sm"
                        className="text-xs h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleSendQuote(srv)}
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Enviar ao Cliente
                      </Button>
                    )}
                  </div>

                  {["quote_sent", "quote_accepted"].includes(srv.status) && (
                    <div className="w-full md:w-72">
                      {/* Valor sugerido = mesmo total que o cliente vê no orçamento: peças + mão de obra */}
                      <MarkAsPaidButton
                        service={srv}
                        suggestedAmount={(srv.quote_parts || 0) + (srv.labor_cost || 0)}
                        onPaid={() => refetch()}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <ServiceDetailDialog
        service={selectedDetailService}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
    </div>
  );
};

export default AdminBudgetingPage;
