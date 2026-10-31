import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText, FileSpreadsheet, Download, Printer, ArrowUpDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subWeeks, subMonths, startOfDay, endOfDay,
} from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

type Status = "pendente" | "pago" | "parcialmente_pago" | "atrasado" | "cancelado" | "vencido";

interface Payable {
  id: string;
  description: string;
  category: string | null;
  total_amount: number;
  paid_amount: number | null;
  due_date: string;
  paid_at: string | null;
  status: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  salarios: "Salários", seguranca_social: "Segurança Social", combustivel: "Combustível",
  telecomunicacoes: "Telecomunicações", internet: "Internet", contabilidade: "Contabilidade",
  fornecedores: "Fornecedores", veiculos: "Veículos", seguros: "Seguros", impostos: "Impostos",
  marketing: "Marketing", software: "Software", portagem: "Portagem", alimentacao: "Alimentação",
  taxas: "Taxas", aluguel: "Aluguel", tecnicos: "Técnicos", outros: "Outros",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", pago: "Pago", parcialmente_pago: "Parcialmente Pago",
  atrasado: "Vencido", vencido: "Vencido", cancelado: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  pendente: "bg-blue-100 text-blue-700 border-blue-300",
  pago: "bg-green-100 text-green-700 border-green-300",
  parcialmente_pago: "bg-amber-100 text-amber-700 border-amber-300",
  vencido: "bg-red-100 text-red-700 border-red-300",
  cancelado: "bg-gray-100 text-gray-600 border-gray-300",
};

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtDate = (d: string | null) => (d ? format(new Date(d), "dd/MM/yyyy") : "—");

type PeriodKey = "today" | "week" | "last_week" | "month" | "last_month" | "custom" | "all";
type SortKey = "description" | "total_amount" | "due_date" | "category" | "status";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function AccountsPayableReportDialog({ open, onOpenChange }: Props) {
  const [rowsRaw, setRowsRaw] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(false);
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("id, description, category, total_amount, paid_amount, due_date, paid_at, status")
        .order("due_date", { ascending: false });
      if (!error && data) setRowsRaw(data as any);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("ap-report-" + Math.random())
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts_payable" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open]);

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    const now = new Date();
    let s: Date | null = null, e: Date | null = null, lbl = "Todos os períodos";
    if (periodKey === "today") { s = startOfDay(now); e = endOfDay(now); lbl = `Hoje — ${format(now, "dd/MM/yyyy")}`; }
    else if (periodKey === "week") { s = startOfWeek(now, { weekStartsOn: 1 }); e = endOfWeek(now, { weekStartsOn: 1 }); lbl = `Esta Semana (${format(s, "dd/MM")} – ${format(e, "dd/MM/yyyy")})`; }
    else if (periodKey === "last_week") { const lw = subWeeks(now, 1); s = startOfWeek(lw, { weekStartsOn: 1 }); e = endOfWeek(lw, { weekStartsOn: 1 }); lbl = `Semana Anterior (${format(s, "dd/MM")} – ${format(e, "dd/MM/yyyy")})`; }
    else if (periodKey === "month") { s = startOfMonth(now); e = endOfMonth(now); lbl = `Este Mês — ${format(s, "MM/yyyy")}`; }
    else if (periodKey === "last_month") { const lm = subMonths(now, 1); s = startOfMonth(lm); e = endOfMonth(lm); lbl = `Mês Anterior — ${format(s, "MM/yyyy")}`; }
    else if (periodKey === "custom") { s = new Date(customStart + "T00:00:00"); e = new Date(customEnd + "T23:59:59"); lbl = `${format(s, "dd/MM/yyyy")} – ${format(e, "dd/MM/yyyy")}`; }
    return { rangeStart: s, rangeEnd: e, rangeLabel: lbl };
  }, [periodKey, customStart, customEnd]);

  const todayISO = format(new Date(), "yyyy-MM-dd");
  const normStatus = (p: Payable): Status => {
    if (p.status === "pago") return "pago";
    if (p.status === "cancelado") return "cancelado";
    if (p.status === "parcialmente_pago") return "parcialmente_pago";
    if (p.due_date < todayISO) return "vencido";
    return "pendente";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rowsRaw.filter((p) => {
      if (rangeStart && rangeEnd) {
        const d = new Date(p.due_date);
        if (d < rangeStart || d > rangeEnd) return false;
      }
      if (filterCategory !== "all" && (p.category || "") !== filterCategory) return false;
      const st = normStatus(p);
      if (filterStatus !== "all" && st !== filterStatus) return false;
      if (q && !(p.description || "").toLowerCase().includes(q)) return false;
      return true;
    }).map((p) => ({ ...p, _status: normStatus(p) }));
  }, [rowsRaw, rangeStart, rangeEnd, filterCategory, filterStatus, search, todayISO]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "description": av = a.description || ""; bv = b.description || ""; break;
        case "total_amount": av = Number(a.total_amount || 0); bv = Number(b.total_amount || 0); break;
        case "due_date": av = a.due_date; bv = b.due_date; break;
        case "category": av = CATEGORY_LABELS[a.category || ""] || ""; bv = CATEGORY_LABELS[b.category || ""] || ""; break;
        case "status": av = a._status; bv = b._status; break;
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  useEffect(() => { setPage(1); }, [periodKey, customStart, customEnd, filterCategory, filterStatus, search, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  const summary = useMemo(() => {
    let total = 0, pago = 0, pendente = 0, vencido = 0;
    filtered.forEach((p) => {
      const amt = Number(p.total_amount || 0);
      total += amt;
      if (p._status === "pago") pago += amt;
      else if (p._status === "vencido") vencido += amt;
      else if (p._status === "pendente" || p._status === "parcialmente_pago") pendente += amt;
    });
    return { count: filtered.length, total, pago, pendente, vencido };
  }, [filtered]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(true); }
  };

  const availableCategories = useMemo(() => {
    const s = new Set<string>();
    rowsRaw.forEach((r) => { if (r.category) s.add(r.category); });
    return Array.from(s).sort();
  }, [rowsRaw]);

  const exportExcel = () => {
    const header = ["Descrição", "Valor (€)", "Data de Vencimento", "Categoria", "Estado"];
    const data = sorted.map((r) => [
      r.description,
      Number((Number(r.total_amount) || 0).toFixed(2)),
      fmtDate(r.due_date),
      CATEGORY_LABELS[r.category || ""] || r.category || "—",
      STATUS_LABELS[r._status] || r._status,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      ["Relatório de Contas a Pagar"],
      [rangeLabel],
      [`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`],
      [],
      header,
      ...data,
      [],
      ["Resumo"],
      ["Total de contas", summary.count],
      ["Valor total a pagar (€)", Number(summary.total.toFixed(2))],
      ["Valor total pago (€)", Number(summary.pago.toFixed(2))],
      ["Valor total pendente (€)", Number(summary.pendente.toFixed(2))],
      ["Valor total vencido (€)", Number(summary.vencido.toFixed(2))],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
    XLSX.writeFile(wb, `contas_a_pagar_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Relatório de Contas a Pagar", 14, 14);
    doc.setFontSize(9);
    doc.text(rangeLabel, 14, 20);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 25);
    autoTable(doc, {
      startY: 30,
      head: [["Descrição", "Valor", "Vencimento", "Categoria", "Estado"]],
      body: sorted.map((r) => [
        r.description,
        fmtEUR(Number(r.total_amount || 0)),
        fmtDate(r.due_date),
        CATEGORY_LABELS[r.category || ""] || r.category || "—",
        STATUS_LABELS[r._status] || r._status,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    const finalY = (doc as any).lastAutoTable.finalY || 40;
    doc.setFontSize(10);
    doc.text("Resumo", 14, finalY + 8);
    autoTable(doc, {
      startY: finalY + 11,
      styles: { fontSize: 9 },
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de contas", String(summary.count)],
        ["Valor total a pagar", fmtEUR(summary.total)],
        ["Valor total pago", fmtEUR(summary.pago)],
        ["Valor total pendente", fmtEUR(summary.pendente)],
        ["Valor total vencido", fmtEUR(summary.vencido)],
      ],
    });
    doc.save(`contas_a_pagar_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) return;
    const rowsHtml = sorted.map((r) => `
      <tr>
        <td>${escapeHtml(r.description || "")}</td>
        <td style="text-align:right">${fmtEUR(Number(r.total_amount || 0))}</td>
        <td>${fmtDate(r.due_date)}</td>
        <td>${escapeHtml(CATEGORY_LABELS[r.category || ""] || r.category || "—")}</td>
        <td>${escapeHtml(STATUS_LABELS[r._status] || r._status)}</td>
      </tr>`).join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Contas a Pagar</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        .meta{color:#555;font-size:12px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f3f4f6}
        .sum{margin-top:16px;font-size:12px}
        .sum div{margin:2px 0}
      </style></head><body>
      <h1>Relatório de Contas a Pagar</h1>
      <div class="meta">${escapeHtml(rangeLabel)} — Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</div>
      <table><thead><tr>
        <th>Descrição</th><th style="text-align:right">Valor</th><th>Vencimento</th><th>Categoria</th><th>Estado</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="sum">
        <div><b>Total de contas:</b> ${summary.count}</div>
        <div><b>Valor total a pagar:</b> ${fmtEUR(summary.total)}</div>
        <div><b>Valor total pago:</b> ${fmtEUR(summary.pago)}</div>
        <div><b>Valor total pendente:</b> ${fmtEUR(summary.pendente)}</div>
        <div><b>Valor total vencido:</b> ${fmtEUR(summary.vencido)}</div>
      </div>
      <script>window.onload=()=>{window.print();};</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Relatório de Contas a Pagar
          </DialogTitle>
        </DialogHeader>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <Label className="text-xs">Período</Label>
            <Select value={periodKey} onValueChange={(v) => setPeriodKey(v as PeriodKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="last_week">Semana Anterior</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="last_month">Mês Anterior</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
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
            <Label className="text-xs">Categoria</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
                <SelectItem value="parcialmente_pago">Parcialmente Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Pesquisar descrição</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite parte da descrição..." />
          </div>
        </div>

        {/* Cartões */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
          <SummaryCard label="Total de contas" value={String(summary.count)} tone="slate" />
          <SummaryCard label="Total a pagar" value={fmtEUR(summary.total)} tone="blue" />
          <SummaryCard label="Total pago" value={fmtEUR(summary.pago)} tone="green" />
          <SummaryCard label="Total pendente" value={fmtEUR(summary.pendente)} tone="amber" />
          <SummaryCard label="Total vencido" value={fmtEUR(summary.vencido)} tone="red" />
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Button onClick={exportExcel} size="sm" className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
          </Button>
          <Button onClick={exportPDF} size="sm" variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
          <Button onClick={handlePrint} size="sm" variant="outline" className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
          <div className="ml-auto text-xs text-muted-foreground self-center">
            {loading ? "A carregar..." : `${sorted.length} registo(s) — ${rangeLabel}`}
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-muted-foreground">
                <Th onClick={() => toggleSort("description")} active={sortKey === "description"} asc={sortAsc}>Descrição</Th>
                <Th onClick={() => toggleSort("total_amount")} active={sortKey === "total_amount"} asc={sortAsc} align="right">Valor</Th>
                <Th onClick={() => toggleSort("due_date")} active={sortKey === "due_date"} asc={sortAsc}>Vencimento</Th>
                <Th onClick={() => toggleSort("category")} active={sortKey === "category"} asc={sortAsc}>Categoria</Th>
                <Th onClick={() => toggleSort("status")} active={sortKey === "status"} asc={sortAsc}>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="py-2 px-3">{r.description}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmtEUR(Number(r.total_amount || 0))}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{fmtDate(r.due_date)}</td>
                  <td className="py-2 px-3">{CATEGORY_LABELS[r.category || ""] || r.category || "—"}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className={STATUS_STYLES[r._status] || ""}>
                      {STATUS_LABELS[r._status] || r._status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Sem registos para os filtros selecionados
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {sorted.length > pageSize && (
          <div className="flex items-center justify-end gap-2 mt-3 text-sm">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-muted-foreground">Página {page} de {totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Th({ children, onClick, active, asc, align }: { children: any; onClick: () => void; active: boolean; asc: boolean; align?: "right" }) {
  return (
    <th className={`py-2 px-3 select-none ${align === "right" ? "text-right" : ""}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground font-medium" : ""}`}>
        {children}
        <ArrowUpDown className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
        {active && <span className="text-[10px]">{asc ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "slate" | "blue" | "green" | "amber" | "red" }) {
  const styles: Record<string, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div className={`p-3 rounded-lg border ${styles[tone]}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
