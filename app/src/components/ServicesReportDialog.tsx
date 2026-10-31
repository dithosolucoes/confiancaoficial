import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, FileSpreadsheet, Download } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatServiceReference } from "@/lib/serviceLabel";

type AnyObj = Record<string, any>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: AnyObj[];
  profiles: AnyObj[];
  quotePartsItems: AnyObj[];
  materials?: AnyObj[];
  partnerOrgs?: AnyObj[];
  partnerMembers?: AnyObj[];
  statusMap?: Record<string, { label: string; variant?: string }>;
}

type PeriodKey = "week" | "month" | "year" | "custom";
type TypeKey = "ALL" | "CO" | "SR" | "WO" | "CO_PARTNER" | "PARTNER";

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceite",
  in_progress: "Em andamento",
  budgeting: "Em orçamento",
  payment_pending: "Pendente de pagamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  deleted: "Eliminado",
};

export default function ServicesReportDialog({
  open,
  onOpenChange,
  services,
  profiles,
  quotePartsItems,
  materials = [],
  partnerOrgs = [],
  partnerMembers = [],
  statusMap = {},
}: Props) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [customStart, setCustomStart] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState<string>(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [typeKey, setTypeKey] = useState<TypeKey>("ALL");
  const [partnerOrgId, setPartnerOrgId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const profileById = useMemo(() => {
    const m = new Map<string, AnyObj>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const userToOrg = useMemo(() => {
    const m = new Map<string, string>();
    partnerMembers.forEach((pm) => m.set(pm.user_id, pm.organization_id));
    return m;
  }, [partnerMembers]);

  const orgById = useMemo(() => {
    const m = new Map<string, AnyObj>();
    partnerOrgs.forEach((o) => m.set(o.id, o));
    return m;
  }, [partnerOrgs]);

  const orgsSorted = useMemo(
    () => [...partnerOrgs].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [partnerOrgs]
  );

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    const now = new Date();
    let s: Date, e: Date, lbl: string;
    if (periodKey === "week") {
      s = startOfWeek(now, { weekStartsOn: 1 });
      e = endOfWeek(now, { weekStartsOn: 1 });
      lbl = `Semana ${format(s, "dd/MM/yyyy")} – ${format(e, "dd/MM/yyyy")}`;
    } else if (periodKey === "month") {
      s = startOfMonth(now);
      e = endOfMonth(now);
      lbl = `Mês ${format(s, "MM/yyyy")}`;
    } else if (periodKey === "year") {
      s = startOfYear(now);
      e = endOfYear(now);
      lbl = `Ano ${format(s, "yyyy")}`;
    } else {
      s = new Date(customStart + "T00:00:00");
      e = new Date(customEnd + "T23:59:59");
      lbl = `${format(s, "dd/MM/yyyy")} – ${format(e, "dd/MM/yyyy")}`;
    }
    return { rangeStart: s, rangeEnd: e, rangeLabel: lbl };
  }, [periodKey, customStart, customEnd]);

  const classify = (s: AnyObj): TypeKey => {
    const ref = (s.reference || "").toUpperCase();
    const prof = profileById.get(s.customer_id);
    const isPartner = !!prof?.is_partner;
    if (ref.startsWith("CO")) return isPartner ? "CO_PARTNER" : "CO";
    if (ref.startsWith("SR")) return "SR";
    if (ref.startsWith("WO")) return "WO";
    if (isPartner) return "PARTNER";
    return "CO";
  };

  const rows = useMemo(() => {
    const filtered = services.filter((s) => {
      const d = s.scheduled_date ? new Date(s.scheduled_date) : null;
      if (!d) return false;
      if (d < rangeStart || d > rangeEnd) return false;
      const cat = classify(s);
      if (typeKey !== "ALL" && cat !== typeKey) return false;
      if (statusFilter !== "ALL" && (s.status || "") !== statusFilter) return false;
      if ((typeKey === "CO_PARTNER" || typeKey === "PARTNER") && partnerOrgId !== "ALL") {
        if (userToOrg.get(s.customer_id) !== partnerOrgId) return false;
      }
      return true;
    });

    return filtered.map((s) => {
      const cat = classify(s);
      const orgId = userToOrg.get(s.customer_id);
      const partnerName = orgId ? orgById.get(orgId)?.name : null;

      const desloc = Number(s.deslocacao_fee || 0);
      const extra = Number(s.extra_fee || 0);
      const labor = Number(s.labor_cost || 0);
      const additional = Number(s.quote_additional_value || 0);
      const partsSum = quotePartsItems
        .filter((p) => p.service_request_id === s.id)
        .reduce((a, p) => a + Number(p.sale_value || 0), 0);
      const materialsSum = materials
        .filter((m) => m.service_request_id === s.id && m.status !== "rejected")
        .reduce((a, m) => a + Number(m.material_cost || 0) * Number(m.quantity || 1), 0);

      const quoteTotal = partsSum + materialsSum + additional + labor;
      const invoiceNumber = (s.invoice_number || "").trim();
      const status = s.status || "";
      const statusLabel =
        statusMap[status]?.label || DEFAULT_STATUS_LABELS[status] || status || "—";

      const billed = invoiceNumber ? quoteTotal + desloc + extra : 0;

      return {
        id: s.id,
        reference: formatServiceReference(s as any),
        partnerName: cat === "CO_PARTNER" || cat === "PARTNER" ? partnerName || "—" : "Não aplicável",
        status: statusLabel,
        statusKey: status,
        date: s.scheduled_date,
        desloc,
        extra,
        quoteTotal,
        labor,
        invoiceNumber: invoiceNumber || "Sem fatura",
        hasInvoice: !!invoiceNumber,
        billed,
        category: cat,
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [services, rangeStart, rangeEnd, typeKey, partnerOrgId, statusFilter, userToOrg, orgById, profileById, quotePartsItems, materials, statusMap]);

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => { if (s.status) set.add(s.status); });
    return Array.from(set).sort();
  }, [services]);

  const totals = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let desloc = 0, extra = 0, quote = 0, labor = 0, billed = 0;
    rows.forEach((r) => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      desloc += r.desloc;
      extra += r.extra;
      quote += r.quoteTotal;
      labor += r.labor;
      billed += r.billed;
    });
    return { count: rows.length, byStatus, desloc, extra, quote, labor, billed };
  }, [rows]);

  const typeLabel: Record<TypeKey, string> = {
    ALL: "Todos os tipos",
    CO: "CO",
    SR: "SR",
    WO: "WO",
    CO_PARTNER: "CO Parceiro",
    PARTNER: "Parceiro",
  };

  const exportExcel = () => {
    const header = [
      "Identificação",
      "Parceiro",
      "Estado",
      "Data",
      "Deslocação (€)",
      "Taxa Extra (€)",
      "Orçamento (€)",
      "Mão de Obra (€)",
      "Nº Fatura",
      "Faturado (€)",
    ];
    const data = rows.map((r) => [
      r.reference,
      r.partnerName,
      r.status,
      format(new Date(r.date), "dd/MM/yyyy"),
      Number(r.desloc.toFixed(2)),
      Number(r.extra.toFixed(2)),
      Number(r.quoteTotal.toFixed(2)),
      Number(r.labor.toFixed(2)),
      r.invoiceNumber,
      Number(r.billed.toFixed(2)),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([
      [`Relatório de Serviços — ${typeLabel[typeKey]}`],
      [rangeLabel],
      [],
      header,
      ...data,
      [],
      ["Resumo"],
      ["Total de Serviços", totals.count],
      ...Object.entries(totals.byStatus).map(([k, v]) => [`  ${k}`, v]),
      ["Total Deslocações (€)", Number(totals.desloc.toFixed(2))],
      ["Total Taxas Extra (€)", Number(totals.extra.toFixed(2))],
      ["Total Orçamentos (€)", Number(totals.quote.toFixed(2))],
      ["Total Mão de Obra (€)", Number(totals.labor.toFixed(2))],
      ["Total Faturado (€)", Number(totals.billed.toFixed(2))],
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Serviços");
    XLSX.writeFile(wb, `relatorio_servicos_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`Relatório de Serviços — ${typeLabel[typeKey]}`, 14, 14);
    doc.setFontSize(9);
    doc.text(rangeLabel, 14, 20);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 25);

    autoTable(doc, {
      startY: 30,
      head: [["Identificação", "Parceiro", "Estado", "Data", "Desloc.", "Taxa", "Orçamento", "M.Obra", "Nº Fatura", "Faturado"]],
      body: rows.map((r) => [
        r.reference,
        r.partnerName,
        r.status,
        format(new Date(r.date), "dd/MM/yyyy"),
        `€${r.desloc.toFixed(2)}`,
        `€${r.extra.toFixed(2)}`,
        `€${r.quoteTotal.toFixed(2)}`,
        `€${r.labor.toFixed(2)}`,
        r.invoiceNumber,
        `€${r.billed.toFixed(2)}`,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 40;
    doc.setFontSize(10);
    doc.text("Resumo", 14, finalY + 8);
    autoTable(doc, {
      startY: finalY + 11,
      styles: { fontSize: 8 },
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de Serviços", String(totals.count)],
        ...Object.entries(totals.byStatus).map(([k, v]) => [`Estado: ${k}`, String(v)]),
        ["Total Deslocações", `€${totals.desloc.toFixed(2)}`],
        ["Total Taxas Extra", `€${totals.extra.toFixed(2)}`],
        ["Total Orçamentos", `€${totals.quote.toFixed(2)}`],
        ["Total Mão de Obra", `€${totals.labor.toFixed(2)}`],
        ["Total Faturado", `€${totals.billed.toFixed(2)}`],
      ],
    });

    doc.save(`relatorio_servicos_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
  };

  const showPartnerFilter = typeKey === "CO_PARTNER" || typeKey === "PARTNER";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Relatórios de Serviços
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <Label className="text-xs">Período</Label>
            <Select value={periodKey} onValueChange={(v) => setPeriodKey(v as PeriodKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="year">Ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodKey === "custom" && (
            <>
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <Label className="text-xs">Tipo de Serviço</Label>
            <Select value={typeKey} onValueChange={(v) => { setTypeKey(v as TypeKey); setPartnerOrgId("ALL"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="CO">CO</SelectItem>
                <SelectItem value="SR">SR</SelectItem>
                <SelectItem value="WO">WO</SelectItem>
                <SelectItem value="CO_PARTNER">CO Parceiro</SelectItem>
                <SelectItem value="PARTNER">Parceiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Estado do Serviço</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {availableStatuses.map((st) => (
                  <SelectItem key={st} value={st}>
                    {statusMap[st]?.label || DEFAULT_STATUS_LABELS[st] || st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showPartnerFilter && (
            <div>
              <Label className="text-xs">Parceiro</Label>
              <Select value={partnerOrgId} onValueChange={setPartnerOrgId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {orgsSorted.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <Button onClick={exportExcel} size="sm" className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
          </Button>
          <Button onClick={exportPDF} size="sm" variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
          <div className="ml-auto text-xs text-muted-foreground self-center">{rangeLabel}</div>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-muted-foreground">
                <th className="py-2 px-3">Identificação</th>
                <th className="py-2 px-3">Parceiro</th>
                <th className="py-2 px-3">Estado</th>
                <th className="py-2 px-3">Data</th>
                <th className="py-2 px-3 text-right">Desloc.</th>
                <th className="py-2 px-3 text-right">Taxa</th>
                <th className="py-2 px-3 text-right">Orçamento</th>
                <th className="py-2 px-3 text-right">M. Obra</th>
                <th className="py-2 px-3">Nº Fatura</th>
                <th className="py-2 px-3 text-right">Faturado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="py-2 px-3 font-mono text-xs font-semibold">{r.reference}</td>
                  <td className="py-2 px-3">{r.partnerName}</td>
                  <td className="py-2 px-3"><Badge variant="outline">{r.status}</Badge></td>
                  <td className="py-2 px-3 whitespace-nowrap">{format(new Date(r.date), "dd/MM/yyyy")}</td>
                  <td className="py-2 px-3 text-right tabular-nums">€{r.desloc.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">€{r.extra.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">€{r.quoteTotal.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">€{r.labor.toFixed(2)}</td>
                  <td className="py-2 px-3">
                    {r.hasInvoice ? r.invoiceNumber : <span className="italic text-muted-foreground">Sem fatura</span>}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">€{r.billed.toFixed(2)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-muted-foreground">
                    Sem serviços para os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Total de Serviços</p>
            <p className="text-lg font-semibold">{totals.count}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Total Deslocações</p>
            <p className="text-lg font-bold">€{totals.desloc.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Total Taxas Extra</p>
            <p className="text-lg font-bold">€{totals.extra.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Total Orçamentos</p>
            <p className="text-lg font-bold">€{totals.quote.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Total Mão de Obra</p>
            <p className="text-lg font-bold">€{totals.labor.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <p className="text-xs text-muted-foreground">Total Faturado</p>
            <p className="text-lg font-bold text-emerald-700">€{totals.billed.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 col-span-2 md:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">Serviços por Estado</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(totals.byStatus).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-[11px]">{k}: {v}</Badge>
              ))}
              {Object.keys(totals.byStatus).length === 0 && <span className="text-xs italic text-muted-foreground">—</span>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
