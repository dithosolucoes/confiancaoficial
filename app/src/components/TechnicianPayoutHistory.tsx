import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatServiceReference } from "@/lib/serviceLabel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Download,
  FileDown,
  CheckCircle,
  Wrench,
  Calculator,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { ptBR, enUS, es } from "date-fns/locale";
import { computePayoutBreakdown } from "@/lib/financial-rules";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

type Period = "today" | "week" | "month" | "year" | "custom" | "all";

const fmtEUR = (n: number) =>
  `€${Number(n || 0).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const startOf = (period: Period, customFrom?: string): Date | null => {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    case "custom":
      return customFrom ? new Date(customFrom + "T00:00:00") : null;
    default:
      return null;
  }
};
const endOf = (period: Period, customTo?: string): Date | null => {
  if (period === "custom" && customTo) {
    return new Date(customTo + "T23:59:59");
  }
  return null;
};

// Repasse ao técnico: SEMPRE via computePayoutBreakdown (financial-rules.ts), a
// única fonte de verdade — aplica a data de corte de 01/08/2026 (50% novo /
// 70% legado) e, na regra nova, zera a fatia de peças (o técnico não participa
// mais do lucro de materiais). Corrigido em 29/10/2026: este componente antes
// duplicava a conta com 70% fixo para qualquer data e dava ao técnico uma
// fatia de peças que a regra nova não prevê.
interface ComputedRow {
  service: any;
  reference: string;
  date: string; // yyyy-mm-dd
  travel: number;
  parts: number;
  labor: number;
  extra: number;
  total: number;
  status: "pago" | "liberado" | "pendente";
}

const computeRow = (
  service: any,
  materials: any[],
  quoteItems: any[],
): ComputedRow => {
  const ref = (service.reference || "").toString();

  const serviceMats = materials.filter((m) => m.service_request_id === service.id);
  const serviceItems = quoteItems.filter((p) => p.service_request_id === service.id);

  const breakdown = computePayoutBreakdown(service, serviceMats, serviceItems, service.technician_payout);

  const status: ComputedRow["status"] = service.baixa_received_at
    ? "pago"
    : service.received_at
      ? "liberado"
      : "pendente";

  return {
    service,
    reference: formatServiceReference(service) || ref,
    date: service.scheduled_date,
    travel: breakdown.serviceFeeShare,
    parts: breakdown.materialsShare,
    labor: breakdown.laborShare,
    extra: breakdown.extraShare,
    total: breakdown.total,
    status,
  };
};

const statusBadge = (s: ComputedRow["status"], t: (k: string) => string) => {
  if (s === "pago")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">
        {t("tech_payout_status_paid")}
      </Badge>
    );
  if (s === "liberado")
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
        {t("tech_payout_status_released")}
      </Badge>
    );
  return (
    <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100">
      {t("tech_payout_status_pending")}
    </Badge>
  );
};

const TechnicianPayoutHistory = () => {
  const { t, i18n } = useTranslation();
  const dateFnsLocales: Record<string, typeof ptBR> = { pt: ptBR, en: enUS, es };
  const dateLocaleTag = i18n.language === "pt" ? "pt-PT" : i18n.language === "es" ? "es-ES" : "en-US";
  const { user } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [quoteItems, setQuoteItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: svcs } = await supabase
      .from("service_requests")
      .select("*")
      .eq("technician_id", user.id)
      .order("scheduled_date", { ascending: false });
    const list = (svcs as any[]) || [];
    setServices(list);
    const ids = list.map((s) => s.id);
    if (ids.length) {
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
      setMaterials((mRes.data as any[]) || []);
      setQuoteItems((qRes.data as any[]) || []);
    } else {
      setMaterials([]);
      setQuoteItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  // Realtime — refresh when any of the technician's services change.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tech-payouts-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `technician_id=eq.${user.id}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_materials" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quote_parts_items" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Completed services drive the financial table.
  const completedRows: ComputedRow[] = useMemo(() => {
    return services
      .filter((s) => s.status === "completed")
      .map((s) => computeRow(s, materials, quoteItems));
  }, [services, materials, quoteItems]);

  // Apply period filter to financial rows.
  const filteredRows: ComputedRow[] = useMemo(() => {
    const from = startOf(period, customFrom);
    const to = endOf(period, customTo);
    return completedRows.filter((r) => {
      if (!r.date) return false;
      const d = new Date(r.date + "T00:00:00");
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [completedRows, period, customFrom, customTo]);

  // Summaries
  const totals = useMemo(() => {
    const recebido = filteredRows
      .filter((r) => r.status === "pago")
      .reduce((s, r) => s + r.total, 0);
    const pendente = filteredRows
      .filter((r) => r.status !== "pago")
      .reduce((s, r) => s + r.total, 0);
    const geral = filteredRows.reduce((s, r) => s + r.total, 0);
    return { recebido, pendente, geral };
  }, [filteredRows]);

  // Operational (independent of period filter — overall counts)
  const ops = useMemo(() => {
    const completed = services.filter((s) => s.status === "completed").length;
    const inProgress = services.filter((s) => s.status === "in_progress").length;
    const budgeting = services.filter((s) => s.status === "budgeting").length;
    return { completed, inProgress, budgeting };
  }, [services]);

  const exportExcel = () => {
    const data = filteredRows.map((r) => ({
      Referência: r.reference || "—",
      Data: r.date
        ? new Date(r.date + "T00:00:00").toLocaleDateString(dateLocaleTag)
        : "—",
      Deslocação: Number(r.travel.toFixed(2)),
      Materiais: Number(r.parts.toFixed(2)),
      "M.O": Number(r.labor.toFixed(2)),
      "Taxa Extra": Number(r.extra.toFixed(2)),
      Total: Number(r.total.toFixed(2)),
      Status:
        r.status === "pago"
          ? t("tech_payout_status_paid")
          : r.status === "liberado"
            ? t("tech_payout_status_released")
            : t("tech_payout_status_pending"),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Pagamentos");
    XLSX.writeFile(
      wb,
      `pagamentos-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(t("tech_payout_pdf_title"), 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Gerado: ${new Date().toLocaleString(dateLocaleTag)}`,
      14,
      22,
    );
    autoTable(doc, {
      startY: 28,
      head: [[
        t("tech_payout_col_reference"),
        t("tech_payout_col_date"),
        t("tech_payout_col_travel"),
        t("tech_payout_col_materials"),
        t("tech_payout_col_labor"),
        t("tech_payout_col_extra_fee"),
        t("tech_payout_col_total"),
        t("tech_payout_col_status"),
      ]],
      body: filteredRows.map((r) => [
        r.reference || "—",
        r.date ? new Date(r.date + "T00:00:00").toLocaleDateString(dateLocaleTag) : "—",
        fmtEUR(r.travel),
        fmtEUR(r.parts),
        fmtEUR(r.labor),
        fmtEUR(r.extra),
        fmtEUR(r.total),
        r.status === "pago"
          ? t("tech_payout_status_paid")
          : r.status === "liberado"
            ? t("tech_payout_status_released")
            : t("tech_payout_status_pending"),
      ]),
      foot: [[
        t("tech_payout_totals"),
        "",
        fmtEUR(filteredRows.reduce((s, r) => s + r.travel, 0)),
        fmtEUR(filteredRows.reduce((s, r) => s + r.parts, 0)),
        fmtEUR(filteredRows.reduce((s, r) => s + r.labor, 0)),
        fmtEUR(filteredRows.reduce((s, r) => s + r.extra, 0)),
        fmtEUR(totals.geral),
        "",
      ]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [241, 245, 249], textColor: 20 },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    });
    doc.save(`pagamentos-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Resumo Financeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-emerald-300/60 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("tech_payout_total_received")}</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {fmtEUR(totals.recebido)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("tech_payout_total_pending")}</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
              {fmtEUR(totals.pendente)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("tech_payout_total_overall")}</p>
            <p className="text-2xl font-bold text-primary">
              {fmtEUR(totals.geral)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo Operacional */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
            <div>
              <p className="text-xs text-muted-foreground">{t("tech_payout_services_completed")}</p>
              <p className="text-xl font-bold">{ops.completed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wrench className="w-6 h-6 text-warning" />
            <div>
              <p className="text-xs text-muted-foreground">{t("tech_payout_services_in_progress")}</p>
              <p className="text-xl font-bold">{ops.inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calculator className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">{t("tech_payout_services_budgeting")}</p>
              <p className="text-xl font-bold">{ops.budgeting}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros + Exportações */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t("tech_payout_period_label")}</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t("tech_payout_period_today")}</SelectItem>
                <SelectItem value="week">{t("tech_payout_period_week")}</SelectItem>
                <SelectItem value="month">{t("tech_payout_period_month")}</SelectItem>
                <SelectItem value="year">{t("tech_payout_period_year")}</SelectItem>
                <SelectItem value="custom">{t("tech_payout_period_custom")}</SelectItem>
                <SelectItem value="all">{t("tech_payout_period_all")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">{t("tech_payout_from_label")}</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("tech_payout_to_label")}</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              disabled={filteredRows.length === 0}
              className="gap-1"
            >
              <FileDown className="w-4 h-4" /> {t("tech_payout_export_excel")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportPDF}
              disabled={filteredRows.length === 0}
              className="gap-1"
            >
              <Download className="w-4 h-4" /> {t("tech_payout_export_pdf")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Pagamentos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-4 h-4" /> {t("tech_payout_table_title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("tech_payout_loading")}</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("tech_payout_empty_period")}
            </p>
          ) : (
            <div className="overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 px-3 whitespace-nowrap">{t("tech_payout_col_reference")}</th>
                    <th className="py-2 px-3 whitespace-nowrap">{t("tech_payout_col_date")}</th>
                    <th className="py-2 px-3 text-right whitespace-nowrap">
                      {t("tech_payout_col_travel")}
                    </th>
                    <th className="py-2 px-3 text-right whitespace-nowrap">
                      {t("tech_payout_col_materials")}
                    </th>
                    <th className="py-2 px-3 text-right whitespace-nowrap">{t("tech_payout_col_labor")}</th>
                    <th className="py-2 px-3 text-right whitespace-nowrap">
                      {t("tech_payout_col_extra_fee")}
                    </th>
                    <th className="py-2 px-3 text-right whitespace-nowrap border-l border-border bg-primary/5">
                      {t("tech_payout_col_total")}
                    </th>
                    <th className="py-2 px-3 text-center whitespace-nowrap">
                      {t("tech_payout_col_status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr
                      key={r.service.id}
                      className="border-t border-border/50 hover:bg-muted/30"
                    >
                      <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                        {r.reference || "—"}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {r.date
                          ? new Date(r.date + "T00:00:00").toLocaleDateString(dateLocaleTag)
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                        {fmtEUR(r.travel)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                        {fmtEUR(r.parts)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                        {fmtEUR(r.labor)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                        {fmtEUR(r.extra)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-primary whitespace-nowrap border-l border-border bg-primary/5">
                        {fmtEUR(r.total)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {statusBadge(r.status, t)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40 font-semibold">
                  <tr>
                    <td className="py-2 px-3" colSpan={2}>
                      {t("tech_payout_totals")}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {fmtEUR(filteredRows.reduce((s, r) => s + r.travel, 0))}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {fmtEUR(filteredRows.reduce((s, r) => s + r.parts, 0))}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {fmtEUR(filteredRows.reduce((s, r) => s + r.labor, 0))}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {fmtEUR(filteredRows.reduce((s, r) => s + r.extra, 0))}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-primary border-l border-border bg-primary/5">
                      {fmtEUR(totals.geral)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TechnicianPayoutHistory;
