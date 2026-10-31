import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cleanServiceReference } from "@/lib/serviceLabel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, TrendingUp,
  Plus, Pencil, Trash2, Download, Settings, Clock, CheckCircle2,
  SlidersHorizontal, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import {
  format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subDays,
} from "date-fns";
import { pt } from "date-fns/locale";

const ORIGIN_OPTIONS = ["Worten", "Fixo", "Particular", "Serviços", "Contas a Receber", "Outros"];
const PAYMENT_METHODS = ["Transferência", "Multibanco", "MB Way", "Dinheiro", "Cartão", "Outro"];
const CATEGORIES = ["Técnicos", "Combustível", "Ferramentas", "Materiais", "Fornecedores", "Renda", "Telecomunicações", "Marketing", "Impostos", "Portagem", "Alimentação", "Taxas", "Aluguel", "Outros"];
const PIE_COLORS = ["#3b82f6", "#f97316", "#10b981", "#ef4444", "#8b5cf6", "#eab308", "#06b6d4", "#ec4899", "#84cc16", "#64748b"];

type EntryKind = "in" | "out";
type EntryStatus = "recebido" | "pago" | "pendente";
type EntrySource = "manual" | "service" | "payable";

type Entry = {
  id: string;
  entry_date: string;          // ISO date used for period filtering
  kind: EntryKind;
  description: string;
  origin: string | null;
  category: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  payment_method: string | null;
  amount: number;
  status: EntryStatus;
  is_forecast: boolean;        // true = previsto, false = real
  source: EntrySource;
  // metadata for filtering
  customer_id?: string | null;
  customer_name?: string | null;
  technician_id?: string | null;
  technician_name?: string | null;
  reference?: string | null;
  invoice_number?: string | null;
  notes: string | null;
  is_auto?: boolean;
  service_id?: string | null;
  payable_id?: string | null;
};

type Settings = { id: string; initial_balance: number; initial_balance_date: string };

const fmt = (n: number) => `€${n.toFixed(2)}`;

type PeriodType = "today" | "yesterday" | "week" | "month" | "year" | "custom";

export default function CashFlowPanel() {
  const [realEntries, setRealEntries] = useState<Entry[]>([]);
  const [forecastEntries, setForecastEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [periodFrom, setPeriodFrom] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [periodTo, setPeriodTo] = useState<string>(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [fOrigin, setFOrigin] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fKind, setFKind] = useState<string>("all");
  const [fCategory, setFCategory] = useState<string>("all");
  const [fCustomer, setFCustomer] = useState<string>("all");
  const [fSupplier, setFSupplier] = useState<string>("all");
  const [fTechnician, setFTechnician] = useState<string>("all");
  const [fReference, setFReference] = useState<string>("");
  const [fSearch, setFSearch] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Dialogs
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry: Partial<Entry> | null }>({ open: false, entry: null });
  const [settingsDialog, setSettingsDialog] = useState(false);

  // Update period dates when periodType changes
  useEffect(() => {
    const now = new Date();
    if (periodType === "today") {
      setPeriodFrom(format(now, "yyyy-MM-dd"));
      setPeriodTo(format(now, "yyyy-MM-dd"));
    } else if (periodType === "yesterday") {
      const y = subDays(now, 1);
      setPeriodFrom(format(y, "yyyy-MM-dd"));
      setPeriodTo(format(y, "yyyy-MM-dd"));
    } else if (periodType === "week") {
      setPeriodFrom(format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setPeriodTo(format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else if (periodType === "month") {
      setPeriodFrom(format(startOfMonth(now), "yyyy-MM-dd"));
      setPeriodTo(format(endOfMonth(now), "yyyy-MM-dd"));
    } else if (periodType === "year") {
      setPeriodFrom(format(startOfYear(now), "yyyy-MM-dd"));
      setPeriodTo(format(endOfYear(now), "yyyy-MM-dd"));
    }
  }, [periodType]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cfRes, settingsRes, srRes, partsRes, matsRes, payRes, suppRes, profRes, payLedgerRes] = await Promise.all([
        supabase.from("cash_flow_entries" as any).select("*").order("entry_date", { ascending: false }),
        supabase.from("cash_flow_settings" as any).select("*").limit(1).maybeSingle(),
        supabase.from("service_requests").select(
          "id, reference, status, received_at, is_invoiced, invoice_number, invoice_issued_at, scheduled_date, deslocacao_fee, extra_fee, labor_cost, quote_additional_value, quote_status, customer_id, technician_id"
        ),
        supabase.from("quote_parts_items").select("service_request_id, sale_value"),
        supabase.from("service_materials").select("service_request_id, material_cost, quantity, status"),
        supabase.from("accounts_payable" as any).select("*"),
        supabase.from("suppliers" as any).select("id, name").order("name"),
        supabase.from("profiles").select("user_id, full_name, user_type"),
        supabase.from("service_payments" as any).select("id, service_request_id, payment_type, amount, method, created_at, reversal_of"),
      ]);

      // Settings
      let s = settingsRes.data as any;
      if (!s) {
        const ins = await supabase.from("cash_flow_settings" as any).insert({ initial_balance: 0 }).select().single();
        s = ins.data;
      }

      // Profile maps
      const profiles = (profRes.data as any[]) || [];
      const profileMap = new Map<string, { name: string; type: string }>();
      profiles.forEach(p => profileMap.set(p.user_id, { name: p.full_name || "—", type: p.user_type }));
      setCustomers(profiles.filter(p => p.user_type === "customer").map(p => ({ id: p.user_id, name: p.full_name || "—" })));
      setTechnicians(profiles.filter(p => p.user_type === "technician").map(p => ({ id: p.user_id, name: p.full_name || "—" })));
      setSuppliers((suppRes.data as any[]) || []);

      // Service totals
      const partsByService = new Map<string, number>();
      ((partsRes.data as any[]) || []).forEach(p => {
        partsByService.set(p.service_request_id, (partsByService.get(p.service_request_id) || 0) + Number(p.sale_value || 0));
      });
      const matsByService = new Map<string, number>();
      ((matsRes.data as any[]) || []).forEach(m => {
        if ((m.status || "") === "rejected") return;
        const v = Number(m.material_cost || 0) * Number(m.quantity || 1);
        matsByService.set(m.service_request_id, (matsByService.get(m.service_request_id) || 0) + v);
      });
      const services = ((srRes.data as any[]) || []);
      const serviceById = new Map<string, any>();
      services.forEach(sv => serviceById.set(sv.id, sv));
      const billable = (sv: any) =>
        Number(sv.deslocacao_fee || 0)
        + Number(sv.extra_fee || 0)
        + Number(sv.labor_cost || 0)
        + Number(sv.quote_additional_value || 0)
        + (partsByService.get(sv.id) || 0)
        + (matsByService.get(sv.id) || 0);

      // Payables
      const payables = ((payRes.data as any[]) || []);
      const payableById = new Map<string, any>();
      payables.forEach(p => payableById.set(p.id, p));

      // === REAL entries (persisted) ===
      const realRows = ((cfRes.data as any[]) || []);
      const realList: Entry[] = realRows.map(e => {
        const isForecast = e.status === "pendente";
        let src: EntrySource = "manual";
        let svcMeta: any = null;
        let payMeta: any = null;
        if (e.source_service_id) { src = "service"; svcMeta = serviceById.get(e.source_service_id); }
        else if (e.source_payable_id) { src = "payable"; payMeta = payableById.get(e.source_payable_id); }
        return {
          id: e.id,
          entry_date: String(e.entry_date).slice(0, 10),
          kind: e.kind,
          description: e.description,
          origin: e.origin,
          category: e.category,
          supplier_id: e.supplier_id,
          supplier_name: payMeta?.supplier_name || (suppRes.data as any[])?.find((s: any) => s.id === e.supplier_id)?.name || null,
          payment_method: e.payment_method,
          amount: Number(e.amount || 0),
          status: e.status,
          is_forecast: isForecast,
          source: src,
          notes: e.notes,
          customer_id: svcMeta?.customer_id || null,
          customer_name: svcMeta ? profileMap.get(svcMeta.customer_id)?.name : null,
          technician_id: svcMeta?.technician_id || null,
          technician_name: svcMeta ? profileMap.get(svcMeta.technician_id)?.name : null,
          reference: svcMeta?.reference || null,
          invoice_number: svcMeta?.invoice_number || null,
          is_auto: !!(e.source_service_id || e.source_payable_id),
          service_id: e.source_service_id || null,
          payable_id: e.source_payable_id || null,
        };
      });

      // Service ids already represented in real (avoid duplicate forecast)
      const realServiceIds = new Set(realRows.filter(r => r.source_service_id).map(r => r.source_service_id));
      const realPayableIds = new Set(realRows.filter(r => r.source_payable_id).map(r => r.source_payable_id));

      // === REAL money from the payment ledger (service_payments: pagamentos feitos pelo sistema) ===
      // Serviço que já tem entrada automática (recebido) não é contado de novo.
      const paymentTypeLabel: Record<string, string> = {
        booking: "Agendamento", quote: "Orçamento", labor: "Mão de obra", materials: "Peças", additional: "Adicional",
      };
      const ledgerRows = ((payLedgerRes.data as any[]) || []);
      const paidByService = new Map<string, number>();
      ledgerRows.forEach(p => paidByService.set(p.service_request_id, (paidByService.get(p.service_request_id) || 0) + Number(p.amount || 0)));
      const remainingOf = (sv: any) => Math.max(0, billable(sv) - (paidByService.get(sv.id) || 0));
      const ledgerIn: Entry[] = ledgerRows
        .filter(p => !realServiceIds.has(p.service_request_id))
        .map(p => {
          const sv = serviceById.get(p.service_request_id);
          const tipo = paymentTypeLabel[p.payment_type] || p.payment_type;
          return {
            id: `pg-${p.id}`,
            entry_date: String(p.created_at).slice(0, 10),
            kind: "in" as EntryKind,
            description: `Pagamento ${tipo} • Serviço ${sv?.reference || String(p.service_request_id).slice(0, 6)}${Number(p.amount) < 0 ? " (estorno)" : ""}`,
            origin: "Pagamento do sistema",
            category: null,
            supplier_id: null,
            supplier_name: null,
            payment_method: p.method || null,
            amount: Number(p.amount || 0),
            status: "recebido" as EntryStatus,
            is_forecast: false,
            source: "service" as EntrySource,
            notes: null,
            customer_id: sv?.customer_id || null,
            customer_name: sv?.customer_id ? profileMap.get(sv.customer_id)?.name || null : null,
            technician_id: sv?.technician_id || null,
            technician_name: sv?.technician_id ? profileMap.get(sv.technician_id)?.name || null : null,
            reference: sv?.reference || null,
            invoice_number: sv?.invoice_number || null,
            is_auto: true,
            service_id: p.service_request_id,
          };
        });
      setRealEntries([...realList, ...ledgerIn]);

      // === FORECAST inflows: services FATURADOS and NOT received (só o saldo que falta) ===

      const fcIn: Entry[] = services
        .filter(sv =>
          sv.is_invoiced === true
          && !sv.received_at
          && sv.status !== "cancelled"
          && sv.quote_status !== "rejected"
          && !realServiceIds.has(sv.id)
          && remainingOf(sv) > 0.005
        )
        .map(sv => ({
          id: `fc-svc-${sv.id}`,
          entry_date: String(sv.invoice_issued_at || sv.scheduled_date || new Date().toISOString()).slice(0, 10),
          kind: "in" as EntryKind,
          description: `Fatura ${sv.invoice_number || "—"} • Serviço ${sv.reference || sv.id.slice(0, 6)}`,
          origin: "Contas a Receber",
          category: null,
          supplier_id: null,
          supplier_name: null,
          payment_method: null,
          amount: remainingOf(sv),
          status: "pendente" as EntryStatus,
          is_forecast: true,
          source: "service" as EntrySource,
          notes: null,
          customer_id: sv.customer_id || null,
          customer_name: sv.customer_id ? profileMap.get(sv.customer_id)?.name || null : null,
          technician_id: sv.technician_id || null,
          technician_name: sv.technician_id ? profileMap.get(sv.technician_id)?.name || null : null,
          reference: sv.reference || null,
          invoice_number: sv.invoice_number || null,
          is_auto: true,
          service_id: sv.id,
        }));

      // === FORECAST outflows: payables not paid ===
      const fcOut: Entry[] = payables
        .filter(p => p.status !== "pago" && !realPayableIds.has(p.id))
        .map(p => {
          const remaining = Math.max(0, Number(p.total_amount || 0) - Number(p.paid_amount || 0));
          return {
            id: `fc-pay-${p.id}`,
            entry_date: String(p.due_date).slice(0, 10),
            kind: "out" as EntryKind,
            description: p.description,
            origin: null,
            category: p.category || null,
            supplier_id: p.supplier_id || null,
            supplier_name: p.supplier_name || null,
            payment_method: p.payment_method || null,
            amount: remaining,
            status: "pendente" as EntryStatus,
            is_forecast: true,
            source: "payable" as EntrySource,
            notes: p.notes || null,
            is_auto: true,
            payable_id: p.id,
          };
        });

      setForecastEntries([...fcIn, ...fcOut]);
      setSettings(s);
    } catch (err: any) {
      toast({ title: "Erro ao carregar Fluxo de Caixa", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // All entries combined
  const allEntries = useMemo(() => [...realEntries, ...forecastEntries], [realEntries, forecastEntries]);

  // Period helper
  const inPeriod = (d: string) => d >= periodFrom && d <= periodTo;

  // Filter application
  const filterEntry = (e: Entry) => {
    if (fKind !== "all" && e.kind !== fKind) return false;
    if (fStatus !== "all" && e.status !== fStatus) return false;
    if (fOrigin !== "all" && (e.origin || "") !== fOrigin) return false;
    if (fCategory !== "all" && (e.category || "") !== fCategory) return false;
    if (fCustomer !== "all" && (e.customer_id || "") !== fCustomer) return false;
    if (fSupplier !== "all" && (e.supplier_id || "") !== fSupplier) return false;
    if (fTechnician !== "all" && (e.technician_id || "") !== fTechnician) return false;
    if (fReference && !(e.reference || "").toLowerCase().includes(fReference.toLowerCase())) return false;
    if (fSearch) {
      const hay = `${e.description} ${e.notes || ""} ${e.supplier_name || ""} ${e.customer_name || ""} ${e.technician_name || ""} ${e.reference || ""} ${e.invoice_number || ""}`.toLowerCase();
      if (!hay.includes(fSearch.toLowerCase())) return false;
    }
    return true;
  };

  const filteredAll = useMemo(() => allEntries.filter(filterEntry), [
    allEntries, fKind, fStatus, fOrigin, fCategory, fCustomer, fSupplier, fTechnician, fReference, fSearch,
  ]);
  const filteredPeriod = useMemo(() => filteredAll.filter(e => inPeriod(e.entry_date)), [filteredAll, periodFrom, periodTo]);

  // === KPIs ===
  const initialBalance = Number(settings?.initial_balance || 0);

  // Saldo Atual = dinheiro real (entradas recebidas - saídas pagas) — ALL time, but respects filters except period
  const totalRecebidoAll = filteredAll.filter(e => e.kind === "in" && e.status === "recebido").reduce((s, e) => s + e.amount, 0);
  const totalPagoAll = filteredAll.filter(e => e.kind === "out" && e.status === "pago").reduce((s, e) => s + e.amount, 0);
  const saldoAtual = initialBalance + totalRecebidoAll - totalPagoAll;

  // Resultado do Mês (use period filter as "mês selecionado")
  const entradasPeriodo = filteredPeriod.filter(e => e.kind === "in" && e.status === "recebido").reduce((s, e) => s + e.amount, 0);
  const saidasPeriodo = filteredPeriod.filter(e => e.kind === "out" && e.status === "pago").reduce((s, e) => s + e.amount, 0);
  const resultadoMes = entradasPeriodo - saidasPeriodo;

  // Contas a Receber = forecast in (faturado não recebido) — global
  const contasAReceber = filteredAll.filter(e => e.kind === "in" && e.is_forecast).reduce((s, e) => s + e.amount, 0);
  // Contas a Pagar = forecast out — global
  const contasAPagar = filteredAll.filter(e => e.kind === "out" && e.is_forecast).reduce((s, e) => s + e.amount, 0);

  const saldoPrevisto = saldoAtual + contasAReceber - contasAPagar;
  const caixaDisponivel = saldoAtual; // dinheiro efetivamente disponível

  // 6-month chart (uses real entries only, ignores period filter)
  const months = useMemo(() => {
    const arr: { key: string; label: string; in: number; out: number; saldo: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      arr.push({ key, label: format(d, "MMM/yy", { locale: pt }), in: 0, out: 0, saldo: 0 });
    }
    realEntries.forEach(e => {
      const key = e.entry_date.slice(0, 7);
      const m = arr.find(a => a.key === key);
      if (!m) return;
      if (e.kind === "in" && e.status === "recebido") m.in += e.amount;
      if (e.kind === "out" && e.status === "pago") m.out += e.amount;
    });
    let running = initialBalance;
    arr.forEach(m => { running += m.in - m.out; m.saldo = running; });
    return arr;
  }, [realEntries, initialBalance]);

  const mediaEntradas = months.reduce((s, m) => s + m.in, 0) / 6;
  const mediaSaidas = months.reduce((s, m) => s + m.out, 0) / 6;

  // Despesas por categoria (period + filters)
  const despPorCat = useMemo(() => {
    const map = new Map<string, number>();
    filteredPeriod.filter(e => e.kind === "out").forEach(e => {
      const k = e.category || "Outros";
      map.set(k, (map.get(k) || 0) + e.amount);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredPeriod]);

  // Alert
  const alert = saldoAtual < 0
    ? { color: "bg-red-500", label: "🔴 Caixa Negativo" }
    : saldoPrevisto < 0
      ? { color: "bg-orange-500", label: "🟠 Saldo Previsto Insuficiente" }
      : contasAPagar > contasAReceber
        ? { color: "bg-yellow-500", label: "🟡 Contas a Pagar superiores a Contas a Receber" }
        : { color: "bg-emerald-500", label: "🟢 Caixa Saudável" };

  // === CRUD (manual entries only) ===
  const saveEntry = async () => {
    const e = entryDialog.entry;
    if (!e || !e.description || !e.amount || !e.entry_date || !e.kind) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    const payload: any = {
      entry_date: e.entry_date,
      kind: e.kind,
      description: e.description,
      origin: e.origin || null,
      category: e.category || null,
      supplier_id: e.supplier_id || null,
      payment_method: e.payment_method || null,
      amount: Number(e.amount),
      status: e.status || "pendente",
      notes: e.notes || null,
    };
    try {
      if (e.id && !e.id.startsWith("fc-")) {
        await supabase.from("cash_flow_entries" as any).update(payload).eq("id", e.id);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        payload.created_by = user?.id;
        await supabase.from("cash_flow_entries" as any).insert(payload);
      }
      toast({ title: "Lançamento guardado" });
      setEntryDialog({ open: false, entry: null });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const deleteEntry = async (id: string) => {
    if (id.startsWith("fc-")) return;
    if (!confirm("Eliminar lançamento?")) return;
    await supabase.from("cash_flow_entries" as any).delete().eq("id", id);
    toast({ title: "Eliminado" });
    fetchAll();
  };

  const saveSettings = async () => {
    if (!settings) return;
    await supabase.from("cash_flow_settings" as any)
      .update({ initial_balance: settings.initial_balance, initial_balance_date: settings.initial_balance_date })
      .eq("id", settings.id);
    toast({ title: "Saldo inicial atualizado" });
    setSettingsDialog(false);
    fetchAll();
  };

  const exportCSV = () => {
    const rows = [["Data", "Tipo", "Tipo Lançamento", "Descrição", "Origem", "Categoria", "Cliente", "Fornecedor", "Técnico", "Referência", "Fatura", "Valor", "Estado"]];
    filteredAll.forEach(e => rows.push([
      e.entry_date,
      e.kind === "in" ? "Entrada" : "Saída",
      e.is_forecast ? "Previsto" : "Real",
      e.description,
      e.origin || "",
      e.category || "",
      e.customer_name || "",
      e.supplier_name || "",
      e.technician_name || "",
      e.reference || "",
      e.invoice_number || "",
      e.amount.toFixed(2),
      e.status,
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fluxo-caixa-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Caixa mostra só o que entrou e saiu de verdade. Previsões ficam em abas próprias.
  const byDateDesc = (a: Entry, b: Entry) => b.entry_date.localeCompare(a.entry_date);
  const entradasList = filteredAll.filter(e => e.kind === "in" && !e.is_forecast).sort(byDateDesc);
  const saidasList = filteredAll.filter(e => e.kind === "out" && !e.is_forecast).sort(byDateDesc);
  const aReceberList = filteredAll.filter(e => e.kind === "in" && e.is_forecast).sort(byDateDesc);
  const aPagarList = filteredAll.filter(e => e.kind === "out" && e.is_forecast).sort(byDateDesc);

  return (
    <div className="space-y-4">
      {/* PAINEL CFO — fixo no topo */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b pb-3 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Wallet className="w-5 h-5" /> Painel CFO</h2>
          <Badge className={`${alert.color} text-white`}>{alert.label}</Badge>
        </div>

        {/* BLOCO 1 — Situação Financeira da Empresa */}
        <div>
          <div className="mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Situação Financeira da Empresa</h3>
            <p className="text-xs text-muted-foreground">Representa a posição financeira global da empresa. Estes indicadores não dependem do período selecionado.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <CFOCard label="Saldo Atual" value={fmt(saldoAtual)} tone={saldoAtual >= 0 ? "good" : "bad"} hint="Dinheiro real (recebido − pago)" />
            <CFOCard label="Contas a Receber" value={fmt(contasAReceber)} tone="info" hint="Faturados não recebidos (previsão)" />
            <CFOCard label="Contas a Pagar" value={fmt(contasAPagar)} tone="warn" hint="Pendentes (previsão)" />
            <CFOCard label="Saldo Previsto" value={fmt(saldoPrevisto)} tone={saldoPrevisto >= 0 ? "good" : "bad"} hint="Atual + A Receber − A Pagar" />
          </div>
        </div>

        {/* BLOCO 2 — Movimento do Período */}
        <div>
          <div className="mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Movimento do Período</h3>
            <p className="text-xs text-muted-foreground">Estes indicadores respeitam todos os filtros selecionados.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <CFOCard label="Entradas do Período" value={fmt(entradasPeriodo)} tone="good" hint="Entradas recebidas no período filtrado" />
            <CFOCard label="Saídas do Período" value={fmt(saidasPeriodo)} tone="bad" hint="Saídas pagas no período filtrado" />
            <CFOCard label="Resultado do Período" value={fmt(resultadoMes)} tone={resultadoMes >= 0 ? "good" : "bad"} hint="Entradas recebidas − Saídas pagas (período)" />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {/* Filtros essenciais (sempre visíveis) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={periodType} onValueChange={(v: PeriodType) => setPeriodType(v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="yesterday">Ontem</SelectItem>
                  <SelectItem value="week">Esta Semana</SelectItem>
                  <SelectItem value="month">Este Mês</SelectItem>
                  <SelectItem value="year">Este Ano</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodType === "custom" && (
              <>
                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={periodFrom} onChange={(e) => { setPeriodType("custom"); setPeriodFrom(e.target.value); }} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={periodTo} onChange={(e) => { setPeriodType("custom"); setPeriodTo(e.target.value); }} className="h-9" />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Referência</Label>
              <Input value={fReference} onChange={(e) => setFReference(e.target.value)} placeholder="WO00001" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Pesquisa</Label>
              <Input value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Descrição, fatura…" className="h-9" />
            </div>
          </div>

          {/* Filtros avançados (ocultos por padrão, estrutura pronta) */}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvancedFilters(v => !v)}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
              Filtros Avançados
              {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
            </Button>
          </div>
          {showAdvancedFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-1 border-t">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={fKind} onValueChange={setFKind}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="in">Entradas</SelectItem>
                    <SelectItem value="out">Saídas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Estado</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="recebido">Recebido</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="pendente">Pendente (Previsto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Origem</Label>
                <Select value={fOrigin} onValueChange={setFOrigin}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {ORIGIN_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={fCategory} onValueChange={setFCategory}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <Select value={fCustomer} onValueChange={setFCustomer}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Fornecedor</Label>
                <Select value={fSupplier} onValueChange={setFSupplier}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Técnico</Label>
                <Select value={fTechnician} onValueChange={setFTechnician}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              setFKind("all"); setFStatus("all"); setFOrigin("all"); setFCategory("all");
              setFCustomer("all"); setFSupplier("all"); setFTechnician("all");
              setFReference(""); setFSearch(""); setPeriodType("month");
            }}>Limpar</Button>
            <Button variant="outline" size="sm" onClick={() => setSettingsDialog(true)}><Settings className="w-4 h-4 mr-1" /> Saldo Inicial</Button>
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" /> Exportar CSV</Button>
            <Button size="sm" onClick={() => setEntryDialog({ open: true, entry: { kind: "in", status: "recebido", entry_date: format(new Date(), "yyyy-MM-dd") } })}>
              <ArrowDownCircle className="w-4 h-4 mr-1" /> Nova Entrada
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEntryDialog({ open: true, entry: { kind: "out", status: "pago", entry_date: format(new Date(), "yyyy-MM-dd") } })}>
              <ArrowUpCircle className="w-4 h-4 mr-1" /> Nova Saída
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Referências auxiliares (não duplicam os blocos do topo) */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Referências</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Mini label="Saldo Inicial" value={fmt(initialBalance)} />
          <Mini label="Média Entradas (6m)" value={fmt(mediaEntradas)} />
          <Mini label="Média Saídas (6m)" value={fmt(mediaSaidas)} />
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Entradas x Saídas por Mês (Reais)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={months}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" /><YAxis /><RTooltip /><Legend />
                <Bar dataKey="in" name="Entradas" fill="#10b981" />
                <Bar dataKey="out" name="Saídas" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Evolução do Saldo</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <LineChart data={months}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" /><YAxis /><RTooltip />
                <Line type="monotone" dataKey="saldo" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Distribuição das Despesas por Categoria (Período + Filtros)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {despPorCat.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center mt-20">Sem despesas no período</p>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={despPorCat} dataKey="value" nameKey="name" outerRadius={90} label={(d) => `${d.name}: €${d.value.toFixed(0)}`}>
                    {despPorCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabelas Entradas / Saídas */}
      <Tabs defaultValue="in">
        <p className="text-xs text-muted-foreground mb-2">
          Entradas e saídas reais são o dinheiro que de fato entrou ou saiu. Valores ainda não recebidos ou não pagos ficam em "A receber" e "A pagar".
        </p>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="in"><ArrowDownCircle className="w-4 h-4 mr-1" /> Entradas reais ({entradasList.length})</TabsTrigger>
          <TabsTrigger value="out"><ArrowUpCircle className="w-4 h-4 mr-1" /> Saídas reais ({saidasList.length})</TabsTrigger>
          <TabsTrigger value="receber"><ArrowDownCircle className="w-4 h-4 mr-1" /> A receber ({aReceberList.length})</TabsTrigger>
          <TabsTrigger value="pagar"><ArrowUpCircle className="w-4 h-4 mr-1" /> A pagar ({aPagarList.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="in">
          <EntryTable rows={entradasList} kind="in" onEdit={(e) => setEntryDialog({ open: true, entry: e })} onDelete={deleteEntry} />
        </TabsContent>
        <TabsContent value="out">
          <EntryTable rows={saidasList} kind="out" onEdit={(e) => setEntryDialog({ open: true, entry: e })} onDelete={deleteEntry} />
        </TabsContent>
        <TabsContent value="receber">
          <EntryTable rows={aReceberList} kind="in" onEdit={(e) => setEntryDialog({ open: true, entry: e })} onDelete={deleteEntry} />
        </TabsContent>
        <TabsContent value="pagar">
          <EntryTable rows={aPagarList} kind="out" onEdit={(e) => setEntryDialog({ open: true, entry: e })} onDelete={deleteEntry} />
        </TabsContent>
      </Tabs>

      {/* Dialog: Entry */}
      <Dialog open={entryDialog.open} onOpenChange={(o) => !o && setEntryDialog({ open: false, entry: null })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{entryDialog.entry?.id && !entryDialog.entry.id.startsWith("fc-") ? "Editar" : "Novo"} {entryDialog.entry?.kind === "in" ? "Entrada" : "Saída"}</DialogTitle>
          </DialogHeader>
          {entryDialog.entry && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data *</Label>
                  <Input type="date" value={entryDialog.entry.entry_date || ""}
                    onChange={(e) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, entry_date: e.target.value } })} />
                </div>
                <div>
                  <Label>Valor (€) *</Label>
                  <Input type="number" step="0.01" value={entryDialog.entry.amount ?? ""}
                    onChange={(e) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, amount: parseFloat(e.target.value) } })} />
                </div>
              </div>
              <div>
                <Label>Descrição *</Label>
                <Input value={entryDialog.entry.description || ""}
                  onChange={(e) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, description: e.target.value } })} />
              </div>
              {entryDialog.entry.kind === "in" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Origem</Label>
                    <Select value={entryDialog.entry.origin || ""} onValueChange={(v) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, origin: v } })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>{ORIGIN_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Forma de Pagamento</Label>
                    <Select value={entryDialog.entry.payment_method || ""} onValueChange={(v) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, payment_method: v } })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={entryDialog.entry.category || ""} onValueChange={(v) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, category: v } })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fornecedor</Label>
                    <Select value={entryDialog.entry.supplier_id || ""} onValueChange={(v) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, supplier_id: v } })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div>
                <Label>Estado *</Label>
                <Select value={entryDialog.entry.status || "pendente"} onValueChange={(v: any) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, status: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {entryDialog.entry.kind === "in" ? (
                      <><SelectItem value="recebido">Recebido</SelectItem><SelectItem value="pendente">Pendente</SelectItem></>
                    ) : (
                      <><SelectItem value="pago">Pago</SelectItem><SelectItem value="pendente">Pendente</SelectItem></>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea value={entryDialog.entry.notes || ""}
                  onChange={(e) => setEntryDialog({ ...entryDialog, entry: { ...entryDialog.entry!, notes: e.target.value } })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialog({ open: false, entry: null })}>Cancelar</Button>
            <Button onClick={saveEntry}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Settings */}
      <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Saldo Inicial</DialogTitle></DialogHeader>
          {settings && (
            <div className="space-y-3">
              <div>
                <Label>Saldo Inicial (€)</Label>
                <Input type="number" step="0.01" value={settings.initial_balance}
                  onChange={(e) => setSettings({ ...settings, initial_balance: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Data de Referência</Label>
                <Input type="date" value={settings.initial_balance_date}
                  onChange={(e) => setSettings({ ...settings, initial_balance_date: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialog(false)}>Cancelar</Button>
            <Button onClick={saveSettings}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CFOCard({ label, value, tone, hint }: { label: string; value: string; tone: "good" | "bad" | "warn" | "info"; hint?: string }) {
  const colors = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800",
    bad: "border-red-200 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100 dark:border-red-800",
    warn: "border-orange-200 bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100 dark:border-orange-800",
    info: "border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100 dark:border-blue-800",
  };
  return (
    <div className={`border rounded-lg p-2 ${colors[tone]}`} title={hint}>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[9px] opacity-60 mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
}

function SummaryCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{icon}{label}</div>
        <p className={`text-2xl font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value, tone, bold }: { label: string; value: string; tone?: "good" | "bad"; bold?: boolean }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "";
  return (
    <div className="border rounded-md p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm tabular-nums ${color} ${bold ? "font-bold" : "font-medium"}`}>{value}</p>
    </div>
  );
}

function EntryTable({ rows, kind, onEdit, onDelete }: {
  rows: Entry[]; kind: "in" | "out";
  onEdit: (e: Entry) => void; onDelete: (id: string) => void;
}) {
  const statusBadge = (e: Entry) => {
    if (e.is_forecast) {
      return <Badge variant="outline" className="bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-100 border-blue-300">
        <Clock className="w-3 h-3 mr-1" /> Previsto
      </Badge>;
    }
    return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">
      <CheckCircle2 className="w-3 h-3 mr-1" /> {e.status === "recebido" ? "Recebido" : "Pago"}
    </Badge>;
  };
  return (
    <Card>
      <CardContent className="pt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left py-2 px-2">Data</th>
              <th className="text-left py-2 px-2">Descrição</th>
              <th className="text-left py-2 px-2">{kind === "in" ? "Origem / Cliente" : "Categoria / Fornecedor"}</th>
              <th className="text-left py-2 px-2">{kind === "in" ? "Referência" : "Pagamento"}</th>
              <th className="text-right py-2 px-2">Valor</th>
              <th className="text-center py-2 px-2">Estado</th>
              <th className="text-right py-2 px-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Sem lançamentos</td></tr>}
            {rows.map(e => (
              <tr key={e.id} className={`border-b hover:bg-muted/30 ${e.is_forecast ? "bg-blue-50/40 dark:bg-blue-950/10" : ""}`}>
                <td className="py-2 px-2 whitespace-nowrap">{format(parseISO(e.entry_date), "dd/MM/yyyy")}</td>
                <td className="py-2 px-2">
                  {e.description}
                  {e.is_auto && <Badge variant="secondary" className="ml-2 text-[10px]">auto</Badge>}
                </td>
                <td className="py-2 px-2">
                  <div>{(kind === "in" ? (e.origin || "—") : (e.category || "—"))}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {kind === "in" ? (e.customer_name || "") : (e.supplier_name || "")}
                  </div>
                </td>
                <td className="py-2 px-2">
                  {kind === "in" ? (cleanServiceReference(e.reference) || e.invoice_number || "—") : (e.payment_method || "—")}
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-medium">{fmt(e.amount)}</td>
                <td className="py-2 px-2 text-center">{statusBadge(e)}</td>
                <td className="py-2 px-2 text-right">
                  {!e.is_auto && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(e)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => onDelete(e.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                    </div>
                  )}
                  {e.is_auto && (
                    <span className="text-[10px] text-muted-foreground">via {e.source === "service" ? "Serviços" : "Contas a Pagar"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
