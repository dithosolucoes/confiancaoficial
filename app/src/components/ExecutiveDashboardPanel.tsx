import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, Euro, AlertTriangle, CheckCircle2,
  Briefcase, Users, Wrench, Gem, Activity, ArrowDownCircle, ArrowUpCircle, CalendarRange,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, parseISO, isWithinInterval, differenceInCalendarMonths } from "date-fns";
import { pt } from "date-fns/locale";
import { safeStorage } from "@/lib/safeStorage";
import { buildServiceStatement } from "@/lib/service-statement";

const fmt = (n: number) => `€${(n || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n || 0).toFixed(1)}%`;
const PIE_COLORS = ["#3b82f6", "#f97316", "#10b981", "#ef4444", "#8b5cf6", "#eab308", "#06b6d4", "#ec4899", "#84cc16", "#64748b"];

type PeriodPreset = "current_month" | "previous_month" | "last_3_months" | "last_6_months" | "current_year" | "custom";
const STORAGE_KEY = "exec_dashboard_period_v1";
const STORAGE_CUSTOM_KEY = "exec_dashboard_period_custom_v1";

function resolvePeriod(preset: PeriodPreset, customFrom?: string, customTo?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  switch (preset) {
    case "previous_month": {
      const d = subMonths(now, 1);
      return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMMM 'de' yyyy", { locale: pt }) };
    }
    case "last_3_months":
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now), label: "Últimos 3 meses" };
    case "last_6_months":
      return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now), label: "Últimos 6 meses" };
    case "current_year":
      return { start: startOfYear(now), end: endOfMonth(now), label: `Ano ${now.getFullYear()}` };
    case "custom": {
      const s = customFrom ? parseISO(customFrom) : startOfMonth(now);
      const e = customTo ? parseISO(customTo) : endOfMonth(now);
      return { start: s, end: e, label: `${format(s, "dd/MM/yyyy")} → ${format(e, "dd/MM/yyyy")}` };
    }
    case "current_month":
    default:
      return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, "MMMM 'de' yyyy", { locale: pt }) };
  }
}


type SR = any;
type Part = { service_request_id: string; sale_value: number; cost_value?: number };
type Pay = { id: string; amount: number; status: string; payment_date: string | null; due_date: string; category: string | null };
type Profile = { user_id: string; full_name: string };
type CFEntry = { entry_date: string; kind: "in" | "out"; amount: number; status: string };

export default function ExecutiveDashboardPanel() {
  const [services, setServices] = useState<SR[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [payables, setPayables] = useState<Pay[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cfEntries, setCfEntries] = useState<CFEntry[]>([]);
  const [cfInitial, setCfInitial] = useState<{ amount: number; date: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [srRes, partsRes, payRes, profRes, cfRes, cfSetRes] = await Promise.all([
          supabase.from("service_requests").select("id, reference, status, quote_status, scheduled_date, completed_at, received_at, deslocacao_fee, extra_fee, labor_cost, technician_id, is_warranty, technician_payout, technician_payout_locked, technician_payout_overridden, created_at, appliance_type, labor_rejected_at, labor_approved_at, labor_paid_at, assigned_company_id, financial_rule_snapshot"),
          supabase.from("quote_parts_items").select("service_request_id, sale_value, cost_value"),
          supabase.from("accounts_payable" as any).select("id, amount, status, payment_date, due_date, category"),
          supabase.from("profiles").select("user_id, full_name").eq("user_type", "technician"),
          supabase.from("cash_flow_entries" as any).select("entry_date, kind, amount, status"),
          supabase.from("cash_flow_settings" as any).select("initial_balance, initial_balance_date").limit(1).maybeSingle(),
        ]);
        setServices((srRes.data as any[]) || []);
        setParts((partsRes.data as any[]) || []);
        setPayables((payRes.data as any[]) || []);
        setProfiles((profRes.data as any[]) || []);
        setCfEntries((cfRes.data as any[]) || []);
        const s = cfSetRes.data as any;
        if (s) setCfInitial({ amount: Number(s.initial_balance || 0), date: s.initial_balance_date });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ===== FILTRO DE PERÍODO =====
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(() => (safeStorage.getItem(STORAGE_KEY) as PeriodPreset) || "current_month");
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(() => {
    try {
      const raw = safeStorage.getItem(STORAGE_CUSTOM_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore storage parse failure
    }
    const now = new Date();
    return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
  });
  useEffect(() => { safeStorage.setItem(STORAGE_KEY, periodPreset); }, [periodPreset]);
  useEffect(() => { safeStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(customRange)); }, [customRange]);

  
  const { start: monthStart, end: monthEnd, label: periodLabel } = useMemo(
    () => resolvePeriod(periodPreset, customRange.from, customRange.to),
    [periodPreset, customRange],
  );
  const now = new Date();

  const partsByService = useMemo(() => {
    const map = new Map<string, { sale: number; cost: number }>();
    parts.forEach(p => {
      const cur = map.get(p.service_request_id) || { sale: 0, cost: 0 };
      cur.sale += Number(p.sale_value || 0);
      cur.cost += Number(p.cost_value || 0);
      map.set(p.service_request_id, cur);
    });
    return map;
  }, [parts]);

  // Orçamentos recusados ficam totalmente excluídos de qualquer cálculo financeiro,
  // mas continuam visíveis no histórico operacional.
  const isQuoteRejected = (s: SR) => s?.quote_status === "rejected" || s?.status === "quote_rejected";

  const serviceTotals = (s: SR) => {
    if (isQuoteRejected(s)) {
      return { desloc: 0, extra: 0, labor: 0, matSale: 0, matCost: 0, total: 0 };
    }
    const desloc = Number(s.deslocacao_fee || 0);
    const extra = Number(s.extra_fee || 0);
    const labor = Number(s.labor_cost || 0);
    const mat = partsByService.get(s.id) || { sale: 0, cost: 0 };
    return { desloc, extra, labor, matSale: mat.sale, matCost: mat.cost, total: desloc + extra + labor + mat.sale };
  };

  // ===== MÊS ATUAL =====
  const monthServices = services.filter(s => {
    const d = s.scheduled_date ? parseISO(s.scheduled_date) : null;
    return d && isWithinInterval(d, { start: monthStart, end: monthEnd });
  });

  const faturacao = monthServices.reduce((acc, s) => acc + serviceTotals(s).total, 0);
  const recebidoMes = services.filter(s => {
    if (!s.received_at) return false;
    const d = parseISO(s.received_at);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  }).reduce((acc, s) => acc + serviceTotals(s).total, 0);

  const lucroOperacional = monthServices.reduce((acc, s) => {
    const t = serviceTotals(s);
    return acc + t.desloc + t.labor + (t.matSale - t.matCost);
  }, 0);

  const despesasMes = payables.filter(p => {
    if (p.status !== "pago") return false;
    const date = p.payment_date || p.due_date;
    if (!date) return false;
    const d = parseISO(date);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  }).reduce((acc, p) => acc + Number(p.amount || 0), 0);

  const lucroLiquido = lucroOperacional - despesasMes;
  const margem = faturacao > 0 ? (lucroLiquido / faturacao) * 100 : 0;

  // ===== CAIXA =====
  const saldoAtual = useMemo(() => {
    const init = cfInitial?.amount || 0;
    const initDate = cfInitial?.date ? parseISO(cfInitial.date) : null;
    let saldo = init;
    cfEntries.forEach(e => {
      if (e.status === "pendente") return;
      const d = parseISO(e.entry_date);
      if (initDate && d < initDate) return;
      saldo += e.kind === "in" ? Number(e.amount || 0) : -Number(e.amount || 0);
    });
    // Add auto inflows: serviços com received_at
    services.forEach(s => {
      if (!s.received_at) return;
      saldo += serviceTotals(s).total;
    });
    // Subtract paid payables
    payables.forEach(p => {
      if (p.status === "pago") saldo -= Number(p.amount || 0);
    });
    return saldo;
  }, [cfEntries, cfInitial, services, payables, partsByService]);

  const contasReceber = services.filter(s => !s.received_at && s.status === "completed")
    .reduce((acc, s) => acc + serviceTotals(s).total, 0);
  const contasPagar = payables.filter(p => p.status === "pendente")
    .reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const caixaPrevisto = saldoAtual + contasReceber - contasPagar;

  // Reserva financeira: saldo / despesa média mensal (últimos 3 meses)
  const last3Despesa = useMemo(() => {
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const ms = startOfMonth(subMonths(now, i));
      const me = endOfMonth(subMonths(now, i));
      total += payables.filter(p => {
        if (p.status !== "pago") return false;
        const date = p.payment_date || p.due_date;
        if (!date) return false;
        const d = parseISO(date);
        return isWithinInterval(d, { start: ms, end: me });
      }).reduce((a, p) => a + Number(p.amount || 0), 0);
    }
    return total / 3;
  }, [payables]);
  const reservaMeses = last3Despesa > 0 ? saldoAtual / last3Despesa : Infinity;

  // ===== PRODUTIVIDADE =====
  const servicosConcluidosMes = monthServices.filter(s => s.status === "completed").length;
  const lucroMedio = servicosConcluidosMes > 0 ? lucroOperacional / servicosConcluidosMes : 0;

  // ===== TÉCNICOS =====
  // "receita" = receita bruta gerada pelos serviços do técnico (não é o que o técnico recebe).
  // "pagamento" = valor OFICIAL gravado em service_requests.technician_payout (fonte usada por
  // lotes, contas a pagar e relatórios de pagamento). Nunca recalcular aqui.
  const techStats = useMemo(() => {
    const map = new Map<string, { name: string; receita: number; pagamento: number; servicos: number }>();
    monthServices.forEach(s => {
      if (!s.technician_id || s.status !== "completed") return;
      const t = serviceTotals(s);
      const receita = t.desloc + t.labor + (t.matSale - t.matCost);
      const pagamento = isQuoteRejected(s) ? 0 : Number(s.technician_payout || 0);
      const name = profiles.find(p => p.user_id === s.technician_id)?.full_name || "—";
      const cur = map.get(s.technician_id) || { name, receita: 0, pagamento: 0, servicos: 0 };
      cur.receita += receita;
      cur.pagamento += pagamento;
      cur.servicos += 1;
      map.set(s.technician_id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.pagamento - a.pagamento);
  }, [monthServices, profiles, partsByService]);

  const topTech = techStats[0];

  // ===== DIVISÃO DO MÊS (serviços concluídos; orçamento recusado fica de fora) =====
  // Técnico: valor oficial gravado no chamado (mesma fonte dos lotes e contas a pagar).
  // Empresa parceira e total do cliente: pela regra gravada no chamado (mesma conta do extrato).
  // Confiança: o que sobra depois do técnico e da empresa, mais a margem de peças (100% dela).
  const divisao = useMemo(() => {
    let tecnicos = 0, empresas = 0, confianca = 0, chamadosEmpresa = 0;
    monthServices.forEach(s => {
      if (s.status !== "completed" || isQuoteRejected(s)) return;
      const st = buildServiceStatement(s as any);
      const tec = Number(s.technician_payout || 0);
      const mat = partsByService.get(s.id) || { sale: 0, cost: 0 };
      tecnicos += tec;
      empresas += st.empresaTotal;
      confianca += st.clientTotal - tec - st.empresaTotal + (mat.sale - mat.cost);
      if (s.assigned_company_id) chamadosEmpresa += 1;
    });
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return { tecnicos: r2(tecnicos), empresas: r2(empresas), confianca: r2(confianca), chamadosEmpresa };
  }, [monthServices, partsByService]);

  // ===== PEÇAS =====
  const lucroPecasMes = monthServices.reduce((acc, s) => {
    const m = partsByService.get(s.id) || { sale: 0, cost: 0 };
    return acc + (m.sale - m.cost);
  }, 0);
  const pctPecas = lucroOperacional > 0 ? (lucroPecasMes / lucroOperacional) * 100 : 0;

  // ===== GRÁFICOS =====
  const monthly6 = useMemo(() => {
    const arr: any[] = [];
    // Calcula nº de meses do período; mínimo 6 para manter a visualização da evolução.
    const spanMonths = Math.max(1, differenceInCalendarMonths(monthEnd, monthStart) + 1);
    const buckets = Math.max(spanMonths, 6);
    for (let i = buckets - 1; i >= 0; i--) {
      const ms = startOfMonth(subMonths(monthEnd, i));
      const me = endOfMonth(subMonths(monthEnd, i));
      const label = format(ms, "MMM/yy", { locale: pt });
      const monthSrv = services.filter(s => {
        const d = s.scheduled_date ? parseISO(s.scheduled_date) : null;
        return d && isWithinInterval(d, { start: ms, end: me });
      });
      const fat = monthSrv.reduce((a, s) => a + serviceTotals(s).total, 0);
      const rec = services.filter(s => {
        if (!s.received_at) return false;
        const d = parseISO(s.received_at);
        return isWithinInterval(d, { start: ms, end: me });
      }).reduce((a, s) => a + serviceTotals(s).total, 0);
      const lucroOp = monthSrv.reduce((a, s) => {
        const t = serviceTotals(s);
        return a + t.desloc + t.labor + (t.matSale - t.matCost);
      }, 0);
      const desp = payables.filter(p => {
        if (p.status !== "pago") return false;
        const date = p.payment_date || p.due_date;
        if (!date) return false;
        const d = parseISO(date);
        return isWithinInterval(d, { start: ms, end: me });
      }).reduce((a, p) => a + Number(p.amount || 0), 0);
      arr.push({ mes: label, Faturado: fat, Recebido: rec, Lucro: lucroOp - desp });
    }
    return arr;
  }, [services, payables, partsByService, monthStart, monthEnd]);

  const despesasCategoria = useMemo(() => {
    const map = new Map<string, number>();
    payables.filter(p => p.status === "pago" && p.payment_date && isWithinInterval(parseISO(p.payment_date), { start: monthStart, end: monthEnd }))
      .forEach(p => {
        const k = p.category || "Outros";
        map.set(k, (map.get(k) || 0) + Number(p.amount || 0));
      });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [payables, monthStart, monthEnd]);

  // ===== ALERTAS =====
  const alerts: { type: "red" | "orange" | "green"; msg: string }[] = [];
  if (saldoAtual < 0) alerts.push({ type: "red", msg: "Caixa Negativo" });
  if (contasPagar > saldoAtual) alerts.push({ type: "red", msg: "Contas a Pagar superiores ao Caixa Disponível" });
  if (lucroLiquido < 0) alerts.push({ type: "red", msg: "Lucro Líquido Negativo" });
  if (faturacao > 0 && margem < 10) alerts.push({ type: "red", msg: "Margem Líquida crítica (inferior a 10%)" });
  else if (faturacao > 0 && margem < 19) alerts.push({ type: "orange", msg: "Margem Líquida entre 10% e 18% — atenção" });
  if (lucroLiquido > 0 && caixaPrevisto > 0 && margem >= 19) alerts.push({ type: "green", msg: "Empresa Saudável (margem acima de 19%)" });

  const margemColor = margem >= 19 ? "text-emerald-600" : margem >= 10 ? "text-amber-600" : "text-red-600";
  const reservaColor = reservaMeses >= 3 ? "text-emerald-600" : reservaMeses >= 1 ? "text-amber-600" : "text-red-600";
  const lucroMedioColor = lucroMedio >= 30 ? "text-emerald-600" : lucroMedio >= 20 ? "text-amber-600" : "text-red-600";

  if (loading) return <div className="py-12 text-center text-muted-foreground">A carregar Dashboard Executivo…</div>;

  return (
    <div className="space-y-6">
      {/* FILTRO DE PERÍODO */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-end gap-3 md:gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarRange className="w-4 h-4 text-primary" />
            Período:
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Predefinido</Label>
            <Select value={periodPreset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="current_month">Mês Atual</SelectItem>
                <SelectItem value="previous_month">Mês Anterior</SelectItem>
                <SelectItem value="last_3_months">Últimos 3 Meses</SelectItem>
                <SelectItem value="last_6_months">Últimos 6 Meses</SelectItem>
                <SelectItem value="current_year">Ano Atual</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodPreset === "custom" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">De</Label>
                <Input type="date" value={customRange.from} onChange={(e) => setCustomRange(r => ({ ...r, from: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Até</Label>
                <Input type="date" value={customRange.to} onChange={(e) => setCustomRange(r => ({ ...r, to: e.target.value }))} />
              </div>
            </>
          )}
          <Badge variant="secondary" className="capitalize">{periodLabel}</Badge>
        </CardContent>
      </Card>

      {/* DESTAQUE PRINCIPAL */}
      <Card className="border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-background to-emerald-500/5">
        <CardContent className="p-8 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm uppercase tracking-wide">
            <Gem className="w-4 h-4 text-primary" /> Lucro Líquido do Período
          </div>
          <div className={`text-5xl md:text-6xl font-display font-bold ${lucroLiquido >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {fmt(lucroLiquido)}
          </div>
          <p className="text-xs text-muted-foreground max-w-xl mx-auto italic">
            Depois de todos os serviços, técnicos, peças, fornecedores, salários e despesas — quanto dinheiro realmente sobrou para a empresa.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Badge variant="outline" className={margemColor}>Margem: {pct(margem)}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* 8 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Euro className="w-4 h-4" />} label="Faturação do Mês" value={fmt(faturacao)} />
        <Kpi icon={<ArrowDownCircle className="w-4 h-4 text-emerald-600" />} label="Recebido no Mês" value={fmt(recebidoMes)} accent="text-emerald-600" />
        <Kpi icon={<Gem className="w-4 h-4" />} label="Lucro Líquido" value={fmt(lucroLiquido)} accent={lucroLiquido >= 0 ? "text-emerald-600" : "text-red-600"} />
        <Kpi icon={<Wallet className="w-4 h-4" />} label="Saldo Bancário Atual" value={fmt(saldoAtual)} accent={saldoAtual >= 0 ? "" : "text-red-600"} />
        <Kpi icon={<Activity className="w-4 h-4" />} label="Caixa Previsto" value={fmt(caixaPrevisto)} accent={caixaPrevisto >= 0 ? "" : "text-red-600"} />
        <Kpi icon={<Briefcase className="w-4 h-4" />} label="Serviços do Mês" value={String(servicosConcluidosMes)} />
        <Kpi icon={<ArrowDownCircle className="w-4 h-4" />} label="Contas a Receber" value={fmt(contasReceber)} />
        <Kpi icon={<ArrowUpCircle className="w-4 h-4 text-red-500" />} label="Contas a Pagar" value={fmt(contasPagar)} accent="text-red-600" />
      </div>

      {/* ALERTAS */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <Alert key={i} className={
              a.type === "red" ? "border-red-500/50 bg-red-500/5" :
              a.type === "orange" ? "border-amber-500/50 bg-amber-500/5" :
              "border-emerald-500/50 bg-emerald-500/5"
            }>
              {a.type === "green" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className={`w-4 h-4 ${a.type === "red" ? "text-red-600" : "text-amber-600"}`} />}
              <AlertDescription className="font-medium">{a.msg}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* SECÇÕES */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Section title="💰 Saúde Financeira" rows={[
          ["Faturado", fmt(faturacao)],
          ["Recebido", fmt(recebidoMes)],
          ["Lucro Operacional", fmt(lucroOperacional)],
          ["Despesas (pagas)", fmt(despesasMes)],
          ["Lucro Líquido", fmt(lucroLiquido)],
          ["Margem Líquida", pct(margem), margemColor],
        ]} />
        <Section title="🏦 Saúde do Caixa" rows={[
          ["Saldo Atual", fmt(saldoAtual)],
          ["Contas a Receber", fmt(contasReceber)],
          ["Contas a Pagar", fmt(contasPagar)],
          ["Caixa Previsto", fmt(caixaPrevisto)],
          ["Despesa Média Mensal", fmt(last3Despesa)],
          ["Reserva (meses)", Number.isFinite(reservaMeses) ? reservaMeses.toFixed(1) : "∞", reservaColor],
        ]} />
        <Section title="📈 Produtividade & Peças" rows={[
          ["Serviços Concluídos", String(servicosConcluidosMes)],
          ["Lucro Médio / Serviço", fmt(lucroMedio), lucroMedioColor],
          ["Lucro de Peças", fmt(lucroPecasMes)],
          ["% Lucro Peças", pct(pctPecas)],
          ["Técnico Top (por pagamento)", topTech?.name || "—"],
          ["Pagamento Técnico Top", topTech ? fmt(topTech.pagamento) : "—"],
        ]} />
        <Section title="🤝 Divisão do Mês (concluídos)" rows={[
          ["Repasse aos técnicos", fmt(divisao.tecnicos)],
          ["Repasse às empresas parceiras", fmt(divisao.empresas)],
          ["Chamados de empresa parceira", String(divisao.chamadosEmpresa)],
          ["Lucro da Confiança", fmt(divisao.confianca), divisao.confianca >= 0 ? "text-emerald-600" : "text-red-600"],
        ]} />
      </div>
      <p className="text-xs text-muted-foreground">
        Divisão do mês: serviços concluídos, sem orçamento recusado. O repasse aos técnicos é o valor gravado no chamado.
        A parte da empresa parceira ainda não entra no Lucro Líquido acima, porque não há conta a pagar para ela.
      </p>

      {/* GRÁFICOS */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Faturado x Recebido (6 meses)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly6}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <RTooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
                <Bar dataKey="Faturado" fill="#3b82f6" />
                <Bar dataKey="Recebido" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Evolução do Lucro Líquido</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly6}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <RTooltip formatter={(v: any) => fmt(Number(v))} />
                <Line type="monotone" dataKey="Lucro" stroke="#8b5cf6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamento ao Técnico (mês)</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Fonte oficial: <code>service_requests.technician_payout</code> — mesmo valor usado por lotes, contas a pagar e relatórios.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={techStats.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={110} />
                <RTooltip formatter={(v: any) => fmt(Number(v))} />
                <Bar dataKey="pagamento" name="Pagamento ao Técnico" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={despesasCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {despesasCategoria.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <RTooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* RANKING TÉCNICOS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Ranking de Técnicos — Mês</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            <strong>Pagamento ao Técnico</strong> vem de <code>service_requests.technician_payout</code> (fonte oficial).{" "}
            <strong>Receita Gerada</strong> é a receita bruta dos serviços do técnico e <u>não</u> representa o valor que o técnico recebe.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-3">#</th>
                <th className="text-left py-2 px-3">Técnico</th>
                <th className="text-right py-2 px-3">Serviços</th>
                <th className="text-right py-2 px-3">Pagamento ao Técnico</th>
                <th className="text-right py-2 px-3">Pagamento Médio / Serviço</th>
                <th className="text-right py-2 px-3 text-muted-foreground">Receita Gerada (não é pagamento)</th>
              </tr>
            </thead>
            <tbody>
              {techStats.map((t, i) => (
                <tr key={i} className="border-t border-border/40">
                  <td className="py-2 px-3">{i + 1}</td>
                  <td className="py-2 px-3 font-medium">{t.name}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{t.servicos}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmt(t.pagamento)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(t.servicos > 0 ? t.pagamento / t.servicos : 0)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{fmt(t.receita)}</td>
                </tr>
              ))}
              {techStats.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem dados no período.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">{icon}{label}</div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${accent || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Section({ title, rows }: { title: string; rows: (string | undefined)[][] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r[0]}</span>
            <span className={`font-semibold tabular-nums ${r[2] || ""}`}>{r[1]}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
