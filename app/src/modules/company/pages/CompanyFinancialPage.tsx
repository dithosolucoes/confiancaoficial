import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Euro, Building2, Download, CheckCircle2, Clock, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanies } from "@/hooks/useCompanies";
import { useServices } from "@/hooks/useServices";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { computeServiceFinancials } from "@/lib/financial-rules";

export const CompanyFinancialPage: React.FC = () => {
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

  const { services: companyServices, isLoading: servicesLoading, isError: servicesError } = useServices({ companyId: currentCompany.id });

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("CONFIANCA REPARA - EXTRATO DE REPASSES B2B", 14, 18);

      doc.setFontSize(10);
      doc.text(`Empresa Parceira: ${currentCompany.name}`, 14, 26);
      doc.text(`NIF: ${currentCompany.nif || "N/A"} | IBAN: ${currentCompany.iban || "Pendente"}`, 14, 32);
      doc.text(`Repasse: percentual da empresa definido pela Confianca (regra por tipo de servico)`, 14, 38);
      doc.text(`Data de Emissao: ${new Date().toLocaleDateString("pt-PT")}`, 14, 44);

      const tableData = companyServices.map((srv) => {
        const fin = computeServiceFinancials(srv as any);
        const grossAmount = fin.eligibleBase;
        const netCompanyPayout = fin.partnerShare;
        return [
          srv.reference,
          srv.appliance_type,
          srv.scheduled_date,
          `€ ${grossAmount.toFixed(2)}`,
          `€ ${netCompanyPayout.toFixed(2)}`,
          srv.status === "completed" ? "Concluido" : "Em Aberto",
        ];
      });

      const totalGross = companyServices.reduce((sum, s) => sum + computeServiceFinancials(s as any).eligibleBase, 0);
      const totalNet = companyServices.reduce((sum, s) => sum + computeServiceFinancials(s as any).partnerShare, 0);

      autoTable(doc, {
        head: [["Referencia", "Aparelho", "Data", "Valor Bruto", "Repasse à empresa", "Status"]],
        body: tableData,
        startY: 50,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129] },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 100;
      doc.setFontSize(10);
      doc.text(`Total Bruto dos Servicos: € ${totalGross.toFixed(2)}`, 14, finalY + 10);
      doc.setFont("helvetica", "bold");
      doc.text(`Total Liquido a Receber: € ${totalNet.toFixed(2)}`, 14, finalY + 16);

      doc.save(`extrato-${currentCompany.name.toLowerCase().replace(/\s+/g, "_")}.pdf`);
      toast.success("Extrato exportado em PDF com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar extrato em PDF: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Euro className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Repasses & Faturamento B2B
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Extrato comercial de repasses da Confiança Repara para <strong>{currentCompany.name}</strong>.
          </p>
        </div>
        <Button onClick={handleExportPdf} variant="outline" className="text-xs gap-1.5 border-slate-300 dark:border-slate-700">
          <Download className="w-4 h-4 text-emerald-600" /> Exportar Extrato (PDF)
        </Button>
      </div>

      {/* Corporate Billing Card */}
      <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" />
              <span className="font-bold text-sm text-slate-900 dark:text-white">
                Dados Fiscais & Bancários de Liquidação
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Razão Social: <strong>{currentCompany.name}</strong> • NIF: <strong>{currentCompany.nif}</strong>
            </p>
            <p className="text-xs text-slate-500 font-mono">
              IBAN para Transferência: <strong>{currentCompany.iban}</strong>
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Condição Comercial</span>
            <span className="text-sm font-bold text-emerald-600">50% da taxa, M.O. e taxa extra</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Regra da Confiança a partir de 01/08/2026 • serviços anteriores seguem a regra antiga • Fechamento quinzenal</span>
          </div>
        </CardContent>
      </Card>

      {/* Services Breakdown Table */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Detalhamento dos Serviços Executados</CardTitle>
          <CardDescription className="text-xs">Ordens atendidas pelos técnicos da sua empresa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Referência</th>
                  <th className="py-2.5 px-3">Aparelho</th>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Valor Bruto</th>
                  <th className="py-2.5 px-3">Repasse à empresa</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {servicesLoading ? (<tr><td colSpan={5} className="py-6 px-3 text-center text-slate-500">A carregar repasses...</td></tr>) : servicesError ? (<tr><td colSpan={5} className="py-6 px-3 text-center text-destructive">Não foi possível carregar os repasses. Verifique a conexão.</td></tr>) : companyServices.length === 0 ? (<tr><td colSpan={5} className="py-6 px-3 text-center text-slate-500">Nenhum serviço encaminhado para esta empresa ainda.</td></tr>) : companyServices.map((srv) => {
                  const fin = computeServiceFinancials(srv as any);
                  const grossAmount = fin.eligibleBase;
                  const netCompanyPayout = fin.partnerShare;

                  return (
                    <tr key={srv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{srv.reference}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{srv.appliance_type}</td>
                      <td className="py-3 px-3 text-slate-500">{srv.scheduled_date}</td>
                      <td className="py-3 px-3 font-medium">€ {grossAmount.toFixed(2)}</td>
                      <td className="py-3 px-3 font-bold text-emerald-600">€ {netCompanyPayout.toFixed(2)}</td>
                      <td className="py-3 px-3">
                        {srv.status === "completed" ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                            Concluído
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                            Em Aberto
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanyFinancialPage;
