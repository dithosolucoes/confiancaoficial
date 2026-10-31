import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
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
  partnerOrgs?: AnyObj[];
  partnerMembers?: AnyObj[];
  materials?: AnyObj[];
}

type ScopeFilter = "WO" | "SR" | "CO" | "CO_PARTNER" | "ALL";
type StatusKey = "paid" | "open" | "no_invoice";

type ColumnKey =
  | "reference"
  | "requester"
  | "date"
  | "invoiceNumber"
  | "invoiceDate"
  | "value"
  | "status"
  | "address"
  | "deslocacao"
  | "materiais"
  | "maoObra"
  | "taxaExtra"
  | "iva"
  | "valorRecebido"
  | "dataRecebimento";

const ALL_COLUMNS: { key: ColumnKey; label: string; financial?: boolean; numeric?: boolean }[] = [
  { key: "reference", label: "Referência" },
  { key: "requester", label: "Solicitante" },
  { key: "date", label: "Data" },
  { key: "invoiceNumber", label: "Nº Fatura" },
  { key: "invoiceDate", label: "Data Emissão Fatura" },
  { key: "value", label: "Valor Faturado (c/ IVA)", numeric: true },
  { key: "status", label: "Estado" },
  { key: "address", label: "Morada Completa" },
  { key: "deslocacao", label: "Deslocação", financial: true, numeric: true },
  { key: "materiais", label: "Materiais", financial: true, numeric: true },
  { key: "maoObra", label: "Mão de Obra", financial: true, numeric: true },
  { key: "taxaExtra", label: "Taxa Extra", financial: true, numeric: true },
  { key: "iva", label: "IVA", financial: true, numeric: true },
  { key: "valorRecebido", label: "Valor Recebido", numeric: true },
  { key: "dataRecebimento", label: "Data do Recebimento" },
];

const DEFAULT_COLUMNS: ColumnKey[] = [
  "reference", "requester", "date", "invoiceNumber", "invoiceDate", "value", "status",
];


export default function CompanyReportDialog({
  open,
  onOpenChange,
  services,
  profiles,
  quotePartsItems,
  partnerOrgs = [],
  partnerMembers = [],
  materials = [],
}: Props) {
  const [scope, setScope] = useState<ScopeFilter>("ALL");
  const [orgId, setOrgId] = useState<string>("ALL_PARTNERS");
  const [statusSel, setStatusSel] = useState<Set<StatusKey>>(new Set(["paid", "open", "no_invoice"]));
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedCols, setSelectedCols] = useState<Set<ColumnKey>>(new Set(DEFAULT_COLUMNS));
  const [periodBy, setPeriodBy] = useState<"service" | "invoice" | "received">("service");

  const toggleStatus = (k: StatusKey) => {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
  };

  const toggleCol = (k: ColumnKey) => {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
  };

  const userToOrg = useMemo(() => {
    const m = new Map<string, string>();
    partnerMembers.forEach((pm) => m.set(pm.user_id, pm.organization_id));
    return m;
  }, [partnerMembers]);

  const orgsSorted = useMemo(
    () => [...partnerOrgs].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [partnerOrgs]
  );

  const selectedOrg = orgsSorted.find((o) => o.id === orgId);

  const profileById = useMemo(() => {
    const m = new Map<string, AnyObj>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const partnerUserIds = useMemo(() => new Set(partnerMembers.map((pm) => pm.user_id)), [partnerMembers]);

  const rows = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;

    const list = services.filter((s) => {
      if (s.status !== "completed") return false;
      const ref = (s.reference || "").toUpperCase();
      const isPartner = partnerUserIds.has(s.customer_id);

      if (scope === "WO") {
        if (!ref.startsWith("WO")) return false;
      } else if (scope === "SR") {
        if (!ref.startsWith("SR")) return false;
      } else if (scope === "CO") {
        if (!ref.startsWith("CO") || isPartner) return false;
      } else if (scope === "CO_PARTNER") {
        if (!isPartner) return false;
        if (orgId !== "ALL_PARTNERS" && userToOrg.get(s.customer_id) !== orgId) return false;
      }

      // Period filter
      const periodDate =
        periodBy === "invoice" ? s.invoice_issued_at
        : periodBy === "received" ? s.received_at
        : s.scheduled_date;
      if (periodDate) {
        const t = new Date(periodDate).getTime();
        if (fromTs !== null && t < fromTs) return false;
        if (toTs !== null && t > toTs) return false;
      }

      const hasInvoice = !!(s.invoice_number || "").trim();
      const hasReceived = !!s.received_at;
      const key: StatusKey = hasInvoice ? (hasReceived ? "paid" : "open") : "no_invoice";
      if (!statusSel.has(key)) return false;

      return true;
    });

    const stripSuffix = (ref: string) =>
      ref.replace(/\s*[-–]\s*(em\s+garantia|retorno.*)$/i, "").trim().toUpperCase();

    const computeOwnValue = (s: any) => {
      const isPartnerCustomer = partnerUserIds.has(s.customer_id);
      const qpiSum = quotePartsItems
        .filter((p) => p.service_request_id === s.id)
        .reduce((acc, p) => acc + Number(p.sale_value || 0), 0);
      const approvedMatsSum = materials
        .filter((m) => m.service_request_id === s.id && m.status === "approved")
        .reduce((acc, m) => acc + Number(m.material_cost || 0), 0);
      if (isPartnerCustomer) {
        return 55 + approvedMatsSum + qpiSum;
      }
      const desloc = Number(s.deslocacao_fee || 0);
      const extra = Number(s.extra_fee || 0);
      const labor = Number(s.labor_cost || 0);
      const additional = Number(s.quote_additional_value || 0);
      return desloc + extra + labor + qpiSum + additional;
    };

    const siblingTotals = new Map<string, number>();
    services.forEach((s) => {
      if (s.status !== "completed") return;
      const key = `${s.customer_id}::${stripSuffix(s.reference || "")}`;
      siblingTotals.set(key, (siblingTotals.get(key) || 0) + computeOwnValue(s));
    });

    return list.map((s) => {
      const ownValue = computeOwnValue(s);
      const key = `${s.customer_id}::${stripSuffix(s.reference || "")}`;
      const hasInvoice = !!(s.invoice_number || "").trim();
      const groupTotal = siblingTotals.get(key) || 0;
      const totalWithVat = ownValue > 0 ? ownValue : (hasInvoice ? groupTotal : 0);
      const isPaid = hasInvoice && !!s.received_at;
      const requester = profileById.get(s.customer_id)?.full_name || "—";
      const address =
        [s.address, s.address_complement].filter(Boolean).join(", ") +
        (s.postal_code || s.localidade ? `\n${[s.postal_code, s.localidade].filter(Boolean).join(" ")}` : "");

      const isPartnerCustomer = partnerUserIds.has(s.customer_id);
      const qpiSum = quotePartsItems
        .filter((p) => p.service_request_id === s.id)
        .reduce((acc, p) => acc + Number(p.sale_value || 0), 0);
      const approvedMatsSum = materials
        .filter((m) => m.service_request_id === s.id && m.status === "approved")
        .reduce((acc, m) => acc + Number(m.material_cost || 0), 0);

      const deslocacao = isPartnerCustomer ? 55 : Number(s.deslocacao_fee || 0);
      const materiais = qpiSum + (isPartnerCustomer ? approvedMatsSum : 0);
      const maoObra = isPartnerCustomer ? 0 : Number(s.labor_cost || 0);
      const taxaExtra = isPartnerCustomer ? 0 : Number(s.extra_fee || 0);
      const iva = totalWithVat > 0 ? totalWithVat - totalWithVat / 1.23 : 0;
      const valorRecebido = isPaid ? totalWithVat : 0;

      return {
        id: s.id,
        reference: s.reference || "—",
        requester,
        date: s.scheduled_date,
        invoiceNumber: (s.invoice_number || "").trim(),
        invoiceDate: s.invoice_issued_at || null,
        value: totalWithVat,
        status: hasInvoice ? (isPaid ? "Pago" : "Pendente") : "Sem Fatura",
        isPaid,
        hasInvoice,
        address,
        deslocacao,
        materiais,
        maoObra,
        taxaExtra,
        iva,
        valorRecebido,
        dataRecebimento: s.received_at || null,
        _ref: s as any,
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [services, scope, orgId, statusSel, dateFrom, dateTo, periodBy, quotePartsItems, materials, profileById, partnerUserIds, userToOrg]);

  const summary = useMemo(() => {
    const totalServices = rows.length;
    const invoicesIssued = rows.filter((r) => r.hasInvoice).length;
    const paid = rows.filter((r) => r.isPaid).length;
    const pending = rows.filter((r) => r.hasInvoice && !r.isPaid).length;
    const totalBilled = rows.filter((r) => r.hasInvoice).reduce((s, r) => s + r.value, 0);
    const totalReceived = rows.filter((r) => r.isPaid).reduce((s, r) => s + r.value, 0);
    const totalOpen = rows.filter((r) => r.hasInvoice && !r.isPaid).reduce((s, r) => s + r.value, 0);
    const totalDeslocacao = rows.reduce((s, r) => s + r.deslocacao, 0);
    const totalMateriais = rows.reduce((s, r) => s + r.materiais, 0);
    const totalMaoObra = rows.reduce((s, r) => s + r.maoObra, 0);
    const totalTaxaExtra = rows.reduce((s, r) => s + r.taxaExtra, 0);
    const totalIVA = rows.reduce((s, r) => s + r.iva, 0);
    return { totalServices, invoicesIssued, paid, pending, totalBilled, totalReceived, totalOpen,
      totalDeslocacao, totalMateriais, totalMaoObra, totalTaxaExtra, totalIVA };
  }, [rows]);

  const scopeLabel =
    scope === "WO" ? "Serviços WO"
    : scope === "SR" ? "Serviços SR"
    : scope === "CO" ? "Serviços CO (Particulares)"
    : scope === "CO_PARTNER"
      ? (orgId === "ALL_PARTNERS" ? "Todos os CO Parceiros" : selectedOrg?.name || "CO Parceiro")
    : "Todos os Serviços";

  const orderedCols = ALL_COLUMNS.filter((c) => selectedCols.has(c.key));
  const showFin = (k: ColumnKey) => selectedCols.has(k);

  const cellValue = (r: typeof rows[number], k: ColumnKey): any => {
    switch (k) {
      case "reference": return formatServiceReference(r as any);
      case "requester": return r.requester;
      case "date": return format(new Date(r.date), "dd/MM/yyyy");
      case "invoiceNumber": return r.invoiceNumber || "—";
      case "invoiceDate": return r.invoiceDate ? format(new Date(r.invoiceDate), "dd/MM/yyyy") : "—";
      case "value": return r.value;
      case "status": return r.status;
      case "address": return r.address.replace(/\n/g, " — ");
      case "deslocacao": return r.deslocacao;
      case "materiais": return r.materiais;
      case "maoObra": return r.maoObra;
      case "taxaExtra": return r.taxaExtra;
      case "iva": return r.iva;
      case "valorRecebido": return r.valorRecebido;
      case "dataRecebimento": return r.dataRecebimento ? format(new Date(r.dataRecebimento), "dd/MM/yyyy") : "—";
    }
  };

  const exportExcel = () => {
    const header = orderedCols.map((c) => c.label);
    const data = rows.map((r) =>
      orderedCols.map((c) => {
        const v = cellValue(r, c.key);
        return c.numeric ? Number((v as number).toFixed(2)) : v;
      })
    );

    const ws = XLSX.utils.aoa_to_sheet([[scopeLabel], [], header, ...data]);

    const summaryRows: any[][] = [
      [],
      ["Resumo"],
      ["Quantidade de Serviços", summary.totalServices],
      ["Faturas Emitidas", summary.invoicesIssued],
      ["Faturas Pagas", summary.paid],
      ["Faturas Pendentes", summary.pending],
      ["Valor Total Faturado (€)", Number(summary.totalBilled.toFixed(2))],
      ["Valor Total Recebido (€)", Number(summary.totalReceived.toFixed(2))],
      ["Valor Total em Aberto (€)", Number(summary.totalOpen.toFixed(2))],
    ];
    if (showFin("deslocacao")) summaryRows.push(["Total Deslocação (€)", Number(summary.totalDeslocacao.toFixed(2))]);
    if (showFin("materiais")) summaryRows.push(["Total Materiais (€)", Number(summary.totalMateriais.toFixed(2))]);
    if (showFin("maoObra")) summaryRows.push(["Total Mão de Obra (€)", Number(summary.totalMaoObra.toFixed(2))]);
    if (showFin("taxaExtra")) summaryRows.push(["Total Taxa Extra (€)", Number(summary.totalTaxaExtra.toFixed(2))]);
    if (showFin("iva")) summaryRows.push(["Total IVA (€)", Number(summary.totalIVA.toFixed(2))]);

    XLSX.utils.sheet_add_aoa(ws, summaryRows, { origin: -1 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    XLSX.writeFile(wb, `relatorio_${scopeLabel.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const exportPDF = () => {
    const landscape = orderedCols.length > 6;
    const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait" });
    doc.setFontSize(14);
    doc.text(`Relatório Financeiro — ${scopeLabel}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);
    const periodLabel = periodBy === "invoice" ? "Emissão da Fatura" : periodBy === "received" ? "Recebimento" : "Serviço";
    if (dateFrom || dateTo) doc.text(`Período (${periodLabel}): ${dateFrom || "—"} → ${dateTo || "—"}`, 14, 27);

    const head = [orderedCols.map((c) => c.label)];
    const body = rows.map((r) =>
      orderedCols.map((c) => {
        const v = cellValue(r, c.key);
        return c.numeric ? `€${(v as number).toFixed(2)}` : String(v ?? "—");
      })
    );

    autoTable(doc, {
      head, body, startY: 32,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 40;
    const sumBody: any[] = [
      ["Quantidade de Serviços", String(summary.totalServices)],
      ["Faturas Emitidas", String(summary.invoicesIssued)],
      ["Faturas Pagas", String(summary.paid)],
      ["Faturas Pendentes", String(summary.pending)],
      ["Valor Total Faturado", `€${summary.totalBilled.toFixed(2)}`],
      ["Valor Total Recebido", `€${summary.totalReceived.toFixed(2)}`],
      ["Valor Total em Aberto", `€${summary.totalOpen.toFixed(2)}`],
    ];
    if (showFin("deslocacao")) sumBody.push(["Total Deslocação", `€${summary.totalDeslocacao.toFixed(2)}`]);
    if (showFin("materiais")) sumBody.push(["Total Materiais", `€${summary.totalMateriais.toFixed(2)}`]);
    if (showFin("maoObra")) sumBody.push(["Total Mão de Obra", `€${summary.totalMaoObra.toFixed(2)}`]);
    if (showFin("taxaExtra")) sumBody.push(["Total Taxa Extra", `€${summary.totalTaxaExtra.toFixed(2)}`]);
    if (showFin("iva")) sumBody.push(["Total IVA", `€${summary.totalIVA.toFixed(2)}`]);

    doc.setFontSize(10);
    doc.text("Resumo", 14, finalY + 10);
    autoTable(doc, {
      startY: finalY + 13,
      styles: { fontSize: 9 },
      head: [["Indicador", "Valor"]],
      body: sumBody,
    });

    doc.save(`relatorio_${scopeLabel.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Relatório por Empresa
          </DialogTitle>
        </DialogHeader>

        <div className="mb-3">
          <Label className="text-xs">Filtrar período por</Label>
          <Select value={periodBy} onValueChange={(v) => setPeriodBy(v as "service" | "invoice" | "received")}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="service">Data do Serviço</SelectItem>
              <SelectItem value="invoice">Data da Emissão da Fatura</SelectItem>
              <SelectItem value="received">Data do Recebimento</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope(v as ScopeFilter);
                if (v !== "CO_PARTNER") setOrgId("ALL_PARTNERS");
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="WO">WO</SelectItem>
                <SelectItem value="SR">SR</SelectItem>
                <SelectItem value="CO">CO (Particulares)</SelectItem>
                <SelectItem value="CO_PARTNER">CO Parceiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "CO_PARTNER" && (
            <div>
              <Label className="text-xs">Empresa Parceira</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_PARTNERS">Todos os parceiros</SelectItem>
                  {orgsSorted.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Data Inicial</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Data Final</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="mb-4">
          <Label className="text-xs">Situação (múltipla seleção)</Label>
          <div className="flex flex-wrap gap-3 mt-1">
            {([
              ["paid", "Faturas Pagas"],
              ["open", "Faturas em Aberto"],
              ["no_invoice", "Sem Fatura"],
            ] as [StatusKey, string][]).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={statusSel.has(k)} onCheckedChange={() => toggleStatus(k)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4 p-3 border rounded-lg bg-muted/30">
          <Label className="text-xs font-semibold">Colunas do Relatório</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            {ALL_COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={selectedCols.has(c.key)} onCheckedChange={() => toggleCol(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <Button onClick={exportExcel} className="gap-2" size="sm" disabled={orderedCols.length === 0}>
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
          </Button>
          <Button onClick={exportPDF} variant="outline" className="gap-2" size="sm" disabled={orderedCols.length === 0}>
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
          <div className="ml-auto text-xs text-muted-foreground self-center">{scopeLabel}</div>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-muted-foreground">
                {orderedCols.map((c) => (
                  <th key={c.key} className={`py-2 px-3 ${c.numeric ? "text-right" : ""}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  {orderedCols.map((c) => {
                    const v = cellValue(r, c.key);
                    if (c.key === "status") {
                      return (
                        <td key={c.key} className="py-2 px-3 text-center">
                          <Badge variant="outline" className={
                            r.status === "Pago" ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : r.status === "Pendente" ? "bg-amber-100 text-amber-800 border-amber-300"
                            : "bg-muted text-muted-foreground"
                          }>{r.status}</Badge>
                        </td>
                      );
                    }
                    if (c.key === "reference") {
                      return <td key={c.key} className="py-2 px-3 font-mono text-xs font-semibold">{v}</td>;
                    }
                    if (c.numeric) {
                      return <td key={c.key} className="py-2 px-3 text-right tabular-nums">€{(v as number).toFixed(2)}</td>;
                    }
                    if (c.key === "address") {
                      return <td key={c.key} className="py-2 px-3 text-xs whitespace-pre-line">{r.address || "—"}</td>;
                    }
                    return <td key={c.key} className="py-2 px-3">{v ?? "—"}</td>;
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={orderedCols.length || 1} className="py-6 text-center text-muted-foreground">
                    Sem registos para os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Serviços</p>
            <p className="text-lg font-semibold">{summary.totalServices}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Faturas Emitidas</p>
            <p className="text-lg font-semibold">{summary.invoicesIssued}</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <p className="text-xs text-muted-foreground">Faturas Pagas</p>
            <p className="text-lg font-semibold text-emerald-700">{summary.paid}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs text-muted-foreground">Faturas Pendentes</p>
            <p className="text-lg font-semibold text-amber-700">{summary.pending}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Total Faturado</p>
            <p className="text-lg font-bold">€{summary.totalBilled.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <p className="text-xs text-muted-foreground">Total Recebido</p>
            <p className="text-lg font-bold text-emerald-700">€{summary.totalReceived.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs text-muted-foreground">Total em Aberto</p>
            <p className="text-lg font-bold text-amber-700">€{summary.totalOpen.toFixed(2)}</p>
          </div>
          {showFin("deslocacao") && (
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-xs text-muted-foreground">Total Deslocação</p>
              <p className="text-lg font-bold">€{summary.totalDeslocacao.toFixed(2)}</p>
            </div>
          )}
          {showFin("materiais") && (
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-xs text-muted-foreground">Total Materiais</p>
              <p className="text-lg font-bold">€{summary.totalMateriais.toFixed(2)}</p>
            </div>
          )}
          {showFin("maoObra") && (
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-xs text-muted-foreground">Total Mão de Obra</p>
              <p className="text-lg font-bold">€{summary.totalMaoObra.toFixed(2)}</p>
            </div>
          )}
          {showFin("taxaExtra") && (
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-xs text-muted-foreground">Total Taxa Extra</p>
              <p className="text-lg font-bold">€{summary.totalTaxaExtra.toFixed(2)}</p>
            </div>
          )}
          {showFin("iva") && (
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-xs text-muted-foreground">Total IVA</p>
              <p className="text-lg font-bold">€{summary.totalIVA.toFixed(2)}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
