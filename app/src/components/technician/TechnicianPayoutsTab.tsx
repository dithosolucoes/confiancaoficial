import React, { useEffect, useState } from "react";
import { Wallet, Euro, Download, Calendar, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import TechnicianPayoutHistory from "@/components/TechnicianPayoutHistory";
import { computePayoutBreakdown } from "@/lib/financial-rules";
import { supabase } from "@/integrations/supabase/client";

interface TechnicianPayoutsTabProps {
  completedJobs: any[];
  technicianName?: string;
  technicianIban?: string;
}

export const TechnicianPayoutsTab: React.FC<TechnicianPayoutsTabProps> = ({
  completedJobs = [],
  technicianName,
  technicianIban,
}) => {
  const { t } = useTranslation();
  const resolvedTechnicianName = technicianName || t("tech_payouts_fallback_name");

  // Repasse: SEMPRE via computePayoutBreakdown (financial-rules.ts), a única
  // fonte de verdade — aplica a data de corte de 01/08/2026 (50% novo / 70%
  // legado) e, na regra nova, zera a fatia de peças. Corrigido em 29/10/2026:
  // este componente antes usava 50% fixo para qualquer data e lia colunas
  // (quote_parts/quote_supplier_cost) que não existem em service_requests —
  // a "comissão de peças" sempre deu zero por engano, não por regra.
  const [materialsByJob, setMaterialsByJob] = useState<Record<string, any[]>>({});
  const [quotePartsByJob, setQuotePartsByJob] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const ids = completedJobs.map((j) => j.id).filter(Boolean);
    if (ids.length === 0) {
      setMaterialsByJob({});
      setQuotePartsByJob({});
      return;
    }
    (async () => {
      const [mRes, qRes] = await Promise.all([
        supabase
          .from("service_materials")
          .select("service_request_id, material_cost, supplier_cost, quantity, status")
          .in("service_request_id", ids),
        supabase
          .from("quote_parts_items")
          .select("service_request_id, sale_value, cost_without_vat")
          .in("service_request_id", ids),
      ]);
      const mMap: Record<string, any[]> = {};
      (mRes.data || []).forEach((m: any) => {
        (mMap[m.service_request_id] ||= []).push(m);
      });
      const qMap: Record<string, any[]> = {};
      (qRes.data || []).forEach((q: any) => {
        (qMap[q.service_request_id] ||= []).push(q);
      });
      setMaterialsByJob(mMap);
      setQuotePartsByJob(qMap);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(completedJobs.map((j) => j.id))]);

  const breakdowns = completedJobs.map((job) =>
    computePayoutBreakdown(
      job,
      materialsByJob[job.id] || [],
      quotePartsByJob[job.id] || [],
      job.technician_payout,
    ),
  );

  const totalLaborPayout = breakdowns.reduce((acc, b) => acc + b.laborShare, 0);
  const totalPartsProfit = breakdowns.reduce((acc, b) => acc + b.materialsShare, 0);
  const grandTotalPayout = breakdowns.reduce((acc, b) => acc + b.total, 0);

  const handleExportStatement = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("CONFIANCA REPARA - EXTRATO DE REPASSES DO TECNICO", 14, 18);

      doc.setFontSize(10);
      doc.text(`Profissional: ${resolvedTechnicianName}`, 14, 26);
      doc.text(`IBAN Registado: ${technicianIban || "Nao configurado"}`, 14, 32);
      doc.text(`Data de Emissao: ${new Date().toLocaleDateString("pt-PT")}`, 14, 38);

      const tableData = completedJobs.map((j, idx) => {
        const b = breakdowns[idx];
        return [
          j.reference || "OS",
          j.appliance_type,
          j.scheduled_date || "N/A",
          `€ ${b.laborShare.toFixed(2)}`,
          `€ ${b.materialsShare.toFixed(2)}`,
          `€ ${b.total.toFixed(2)}`,
        ];
      });

      autoTable(doc, {
        head: [["OS", "Aparelho", "Data", "Repasse M.O.", "Comissao Pecas", "Total Liquido"]],
        body: tableData,
        startY: 46,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42] },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 100;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`TOTAL LIQUIDO ACUMULADO: € ${grandTotalPayout.toFixed(2)}`, 14, finalY + 12);

      doc.save(`extrato-repasses-${resolvedTechnicianName.toLowerCase().replace(/\s+/g, "_")}.pdf`);
      toast.success(t("tech_payouts_export_success"));
    } catch (err: any) {
      toast.error(t("tech_payouts_export_error") + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Export Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t("tech_payouts_heading")}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {t("tech_payouts_settlement_note")} <strong>{technicianIban || t("tech_payouts_iban_missing")}</strong>
          </p>
        </div>

        <Button
          onClick={handleExportStatement}
          variant="outline"
          className="text-xs gap-1.5 border-slate-300 dark:border-slate-700 self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-emerald-600" /> {t("tech_payouts_export_button")}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              {t("tech_payouts_total_net")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              € {grandTotalPayout.toFixed(2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">{t("tech_payouts_total_net_desc")}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              {t("tech_payouts_labor_share")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              € {totalLaborPayout.toFixed(2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {t("tech_payouts_labor_share_desc")}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              {t("tech_payouts_parts_commission")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              € {totalPartsProfit.toFixed(2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">{t("tech_payouts_parts_commission_desc")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Histórico Consolidado */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {t("tech_payouts_history_heading")}
        </h3>
        <TechnicianPayoutHistory />
      </div>
    </div>
  );
};

export default TechnicianPayoutsTab;
