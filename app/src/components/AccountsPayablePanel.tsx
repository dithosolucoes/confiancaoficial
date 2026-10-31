import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, CheckCircle2, AlertTriangle, CalendarClock,
  Wallet, Repeat, Layers, TrendingUp, Filter, Search, ChevronDown, FileText,
} from "lucide-react";
import AccountsPayableReportDialog from "./AccountsPayableReportDialog";
import PartnerCompanyPayoutsCard from "./PartnerCompanyPayoutsCard";
import { toast } from "sonner";
import { localISODate, dueWithinDays, dueLabelPt } from "@/lib/payables-due";
import { z } from "zod";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@/components/ui/collapsible";

type Category =
  | "salarios" | "seguranca_social" | "combustivel" | "telecomunicacoes" | "internet"
  | "contabilidade" | "fornecedores" | "veiculos" | "seguros" | "impostos"
  | "marketing" | "software" | "portagem" | "alimentacao" | "taxas" | "aluguel" | "tecnicos" | "outros";

type Status = "pendente" | "pago" | "parcialmente_pago" | "atrasado" | "cancelado";
type Frequency = "semanal" | "mensal" | "trimestral" | "semestral" | "anual";

interface Payable {
  id: string;
  description: string;
  category: Category;
  supplier_name: string | null;
  supplier_iban: string | null;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  paid_at: string | null;
  status: Status;
  is_recurring: boolean;
  recurrence_frequency: Frequency | null;
  next_due_date: string | null;
  is_installment: boolean;
  installments_total: number | null;
  installment_current: number | null;
  parent_id: string | null;
  supplier_id: string | null;
  notes: string | null;
  created_at: string;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "salarios", label: "Salários" },
  { value: "seguranca_social", label: "Segurança Social" },
  { value: "combustivel", label: "Combustível" },
  { value: "telecomunicacoes", label: "Telecomunicações" },
  { value: "internet", label: "Internet" },
  { value: "contabilidade", label: "Contabilidade" },
  { value: "fornecedores", label: "Fornecedores" },
  { value: "veiculos", label: "Veículos" },
  { value: "seguros", label: "Seguros" },
  { value: "impostos", label: "Impostos" },
  { value: "marketing", label: "Marketing" },
  { value: "software", label: "Software" },
  { value: "portagem", label: "Portagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "taxas", label: "Taxas" },
  { value: "aluguel", label: "Aluguel" },
  { value: "tecnicos", label: "Técnicos" },
  { value: "outros", label: "Outros" },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

const STATUSES: { value: Status; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "pago", label: "Pago" },
  { value: "parcialmente_pago", label: "Parcialmente Pago" },
  { value: "atrasado", label: "Atrasado" },
  { value: "cancelado", label: "Cancelado" },
];

const fmt = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
const todayISO = () => localISODate();
const daysDiff = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

const addPeriod = (dateISO: string, freq: Frequency): string => {
  const d = new Date(dateISO);
  switch (freq) {
    case "semanal": d.setDate(d.getDate() + 7); break;
    case "mensal": d.setMonth(d.getMonth() + 1); break;
    case "trimestral": d.setMonth(d.getMonth() + 3); break;
    case "semestral": d.setMonth(d.getMonth() + 6); break;
    case "anual": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
};

const effectiveStatus = (p: Payable): Status => {
  if (p.status === "pago" || p.status === "cancelado" || p.status === "parcialmente_pago") return p.status;
  if (p.due_date < todayISO()) return "atrasado";
  return p.status;
};

const statusBadge = (s: Status) => {
  const map: Record<Status, string> = {
    pendente: "bg-blue-100 text-blue-700 border-blue-300",
    pago: "bg-green-100 text-green-700 border-green-300",
    parcialmente_pago: "bg-amber-100 text-amber-700 border-amber-300",
    atrasado: "bg-red-100 text-red-700 border-red-300",
    cancelado: "bg-gray-100 text-gray-600 border-gray-300",
  };
  const label = STATUSES.find(x => x.value === s)?.label ?? s;
  return <Badge variant="outline" className={map[s]}>{label}</Badge>;
};

const payableSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória").max(255),
  category: z.string().min(1),
  supplier_name: z.string().trim().max(255).optional().or(z.literal("")),
  supplier_iban: z.string().trim().max(64).optional().or(z.literal("")),
  total_amount: z.number().nonnegative(),
  due_date: z.string().min(1, "Data obrigatória"),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

interface FormState {
  description: string;
  category: Category;
  supplier_id: string;
  supplier_name: string;
  supplier_iban: string;
  total_amount: string;
  due_date: string;
  notes: string;
  is_recurring: boolean;
  recurrence_frequency: Frequency;
  is_installment: boolean;
  installments_total: string;
}

const emptyForm = (): FormState => ({
  description: "",
  category: "outros",
  supplier_id: "",
  supplier_name: "",
  supplier_iban: "",
  total_amount: "",
  due_date: todayISO(),
  notes: "",
  is_recurring: false,
  recurrence_frequency: "mensal",
  is_installment: false,
  installments_total: "",
});

interface SupplierLite { id: string; name: string; iban: string | null; }

export default function AccountsPayablePanel() {
  const [items, setItems] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  // Filtros adicionais
  const [periodType, setPeriodType] = useState<"all" | "day" | "week" | "month" | "year" | "custom">("all");
  const [periodDay, setPeriodDay] = useState<string>(todayISO());
  const [periodWeek, setPeriodWeek] = useState<string>("");
  const [periodMonth, setPeriodMonth] = useState<string>(todayISO().slice(0, 7));
  const [periodYear, setPeriodYear] = useState<string>(String(new Date().getFullYear()));
  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");
  const [filterExpenseType, setFilterExpenseType] = useState<"all" | "avulsa" | "recorrente" | "parcelada">("all");
  const [filterRecurring, setFilterRecurring] = useState<"all" | "yes" | "no">("all");
  const [filterInstallment, setFilterInstallment] = useState<"all" | "yes" | "no">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState<Payable | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [suppliersList, setSuppliersList] = useState<SupplierLite[]>([]);
  const [payDialog, setPayDialog] = useState<{ payable: Payable; date: string; method: string; note: string } | null>(null);
  const [expensesOpen, setExpensesOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, supRes] = await Promise.all([
      supabase.from("accounts_payable" as any).select("*").order("due_date", { ascending: true }),
      supabase.from("suppliers" as any).select("id,name,iban").order("name", { ascending: true }),
    ]);
    if (error) {
      toast.error("Erro ao carregar contas a pagar");
    } else {
      setItems((data as any[]) as Payable[]);
    }
    if (!supRes.error) setSuppliersList((supRes.data as any[]) as SupplierLite[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const suppliers = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => i.supplier_name && s.add(i.supplier_name));
    return Array.from(s).sort();
  }, [items]);

  // Computa intervalo do período selecionado
  const periodRange = useMemo<{ start: string; end: string } | null>(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    try {
      if (periodType === "day" && periodDay) return { start: periodDay, end: periodDay };
      if (periodType === "week" && periodWeek) {
        const [yy, ww] = periodWeek.split("-W");
        if (yy && ww) {
          const jan4 = new Date(Number(yy), 0, 4);
          const dow = (jan4.getDay() + 6) % 7;
          const monJan = new Date(jan4); monJan.setDate(jan4.getDate() - dow);
          const start = new Date(monJan); start.setDate(monJan.getDate() + (Number(ww) - 1) * 7);
          const end = new Date(start); end.setDate(start.getDate() + 6);
          return { start: iso(start), end: iso(end) };
        }
      }
      if (periodType === "month" && periodMonth) {
        const [yy, mm] = periodMonth.split("-");
        const start = new Date(Number(yy), Number(mm) - 1, 1);
        const end = new Date(Number(yy), Number(mm), 0);
        return { start: iso(start), end: iso(end) };
      }
      if (periodType === "year" && periodYear) {
        return { start: `${periodYear}-01-01`, end: `${periodYear}-12-31` };
      }
      if (periodType === "custom" && periodFrom && periodTo) {
        return { start: periodFrom, end: periodTo };
      }
    } catch {
      // Ignore date parsing failures
    }
    return null;
  }, [periodType, periodDay, periodWeek, periodMonth, periodYear, periodFrom, periodTo]);

  // Filtro de período usa SEMPRE a data de vencimento (due_date), conforme regra de negócio.
  const itemDateFor = (p: Payable): string => p.due_date;

  const inPeriod = (p: Payable): boolean => {
    if (!periodRange) return true;
    const d = p.due_date;
    return d >= periodRange.start && d <= periodRange.end;
  };

  const filtered = useMemo(() => {
    return items.filter(p => {
      if (search && !p.description.toLowerCase().includes(search.toLowerCase()) &&
          !(p.supplier_name || "").toLowerCase().includes(search.toLowerCase())) return false;
      const d = new Date(p.due_date);
      if (filterYear !== "all" && String(d.getFullYear()) !== filterYear) return false;
      if (filterMonth !== "all" && String(d.getMonth() + 1) !== filterMonth) return false;
      if (filterCategory !== "all" && p.category !== filterCategory) return false;
      if (filterSupplier !== "all" && (p.supplier_name || "") !== filterSupplier) return false;
      if (filterStatus !== "all" && effectiveStatus(p) !== filterStatus) return false;
      if (!inPeriod(p)) return false;
      if (filterRecurring === "yes" && !p.is_recurring) return false;
      if (filterRecurring === "no" && p.is_recurring) return false;
      if (filterInstallment === "yes" && !p.is_installment) return false;
      if (filterInstallment === "no" && p.is_installment) return false;
      if (filterExpenseType !== "all") {
        if (filterExpenseType === "recorrente" && !p.is_recurring) return false;
        if (filterExpenseType === "parcelada" && !p.is_installment) return false;
        if (filterExpenseType === "avulsa" && (p.is_recurring || p.is_installment)) return false;
      }
      return true;
    });
  }, [items, search, filterMonth, filterYear, filterCategory, filterSupplier, filterStatus, periodRange, filterRecurring, filterInstallment, filterExpenseType]);

  // Indicators — somam exatamente as linhas listadas na tabela filtrada
  const indicators = useMemo(() => {
    let toPayMonth = 0, overdue = 0, paidMonth = 0, installmentOpen = 0, recurringMonthly = 0;
    for (const p of filtered) {
      const eff = effectiveStatus(p);
      if (eff !== "pago" && eff !== "cancelado") toPayMonth += (p.total_amount - p.paid_amount);
      if (eff === "atrasado") overdue += (p.total_amount - p.paid_amount);
      if (eff === "pago") paidMonth += (p.paid_amount || p.total_amount);
      if (p.is_installment && eff !== "pago" && eff !== "cancelado") installmentOpen += (p.total_amount - p.paid_amount);
      if (p.is_recurring && eff !== "cancelado") {
        const factor = p.recurrence_frequency === "semanal" ? 4.33 :
                       p.recurrence_frequency === "mensal" ? 1 :
                       p.recurrence_frequency === "trimestral" ? 1/3 :
                       p.recurrence_frequency === "semestral" ? 1/6 :
                       p.recurrence_frequency === "anual" ? 1/12 : 0;
        recurringMonthly += p.total_amount * factor;
      }
    }
    return { toPayMonth, overdue, paidMonth, installmentOpen, recurringMonthly };
  }, [filtered]);

  // Alerts
  const alerts = useMemo(() => {
    const today = todayISO();
    let dueToday = 0, due7 = 0, due15 = 0;
    for (const p of items) {
      const eff = effectiveStatus(p);
      if (eff === "pago" || eff === "cancelado") continue;
      const diff = daysDiff(p.due_date, today);
      if (diff === 0) dueToday++;
      else if (diff > 0 && diff <= 7) due7++;
      else if (diff > 7 && diff <= 15) due15++;
    }
    return { dueToday, due7, due15 };
  }, [items]);

  // Vence nos próximos 7 dias: lista a partir de `items`, independente dos filtros da tabela
  const dueSoon = useMemo(() => dueWithinDays(items, todayISO(), 7), [items]);
  const dueSoonTotal = useMemo(() => dueSoon.reduce((sum, d) => sum + d.remaining, 0), [dueSoon]);

  // Reports
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach(p => m.set(p.category, (m.get(p.category) || 0) + p.total_amount));
    return Array.from(m.entries()).map(([k, v]) => ({
      name: CATEGORIES.find(c => c.value === k)?.label ?? k,
      total: Number(v.toFixed(2)),
    }));
  }, [filtered]);

  const bySupplier = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach(p => {
      const k = p.supplier_name || "—";
      m.set(k, (m.get(k) || 0) + p.total_amount);
    });
    return Array.from(m.entries())
      .map(([name, total]) => ({ name, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(p => {
      const k = p.due_date.slice(0, 7);
      m.set(k, (m.get(k) || 0) + p.total_amount);
    });
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, total]) => ({ month, total: Number(total.toFixed(2)) }));
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (p: Payable) => {
    setEditing(p);
    setForm({
      description: p.description,
      category: p.category,
      supplier_id: p.supplier_id || "",
      supplier_name: p.supplier_name || "",
      supplier_iban: p.supplier_iban || "",
      total_amount: String(p.total_amount),
      due_date: p.due_date,
      notes: p.notes || "",
      is_recurring: p.is_recurring,
      recurrence_frequency: p.recurrence_frequency || "mensal",
      is_installment: p.is_installment,
      installments_total: p.installments_total ? String(p.installments_total) : "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const totalNum = Number(String(form.total_amount).replace(",", "."));
    const parsed = payableSchema.safeParse({
      description: form.description,
      category: form.category,
      supplier_name: form.supplier_name,
      supplier_iban: form.supplier_iban,
      total_amount: isNaN(totalNum) ? -1 : totalNum,
      due_date: form.due_date,
      notes: form.notes,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Dados inválidos");
      return;
    }
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;

    try {
      if (editing) {
        const { error } = await supabase.from("accounts_payable" as any).update({
          description: form.description.trim(),
          category: form.category,
          supplier_name: form.supplier_name.trim() || null,
          supplier_iban: form.supplier_iban.trim() || null,
          supplier_id: form.supplier_id || null,
          total_amount: totalNum,
          due_date: form.due_date,
          notes: form.notes.trim() || null,
          is_recurring: form.is_recurring,
          recurrence_frequency: form.is_recurring ? form.recurrence_frequency : null,
        } as any).eq("id", editing.id);
        if (error) throw error;
        toast.success("Despesa atualizada");
      } else if (form.is_installment) {
        const total = Math.max(1, parseInt(form.installments_total || "1", 10));
        const each = Number((totalNum / total).toFixed(2));
        const freq: Frequency = form.is_recurring ? form.recurrence_frequency : "mensal";
        // Create parent (first installment)
        const parentInsert: any = {
          description: `${form.description.trim()} (1/${total})`,
          category: form.category,
          supplier_name: form.supplier_name.trim() || null,
          supplier_iban: form.supplier_iban.trim() || null,
          supplier_id: form.supplier_id || null,
          total_amount: each,
          due_date: form.due_date,
          notes: form.notes.trim() || null,
          is_installment: true,
          installments_total: total,
          installment_current: 1,
          created_by: userId,
        };
        const { data: parent, error: pErr } = await supabase
          .from("accounts_payable" as any).insert(parentInsert).select().single();
        if (pErr) throw pErr;
        if (total > 1) {
          const rows: any[] = [];
          let dueISO = form.due_date;
          for (let i = 2; i <= total; i++) {
            dueISO = addPeriod(dueISO, freq);
            rows.push({
              description: `${form.description.trim()} (${i}/${total})`,
              category: form.category,
              supplier_name: form.supplier_name.trim() || null,
              supplier_iban: form.supplier_iban.trim() || null,
          supplier_id: form.supplier_id || null,
              total_amount: each,
              due_date: dueISO,
              notes: form.notes.trim() || null,
              is_installment: true,
              installments_total: total,
              installment_current: i,
              parent_id: (parent as any).id,
              created_by: userId,
            });
          }
          const { error: cErr } = await supabase.from("accounts_payable" as any).insert(rows);
          if (cErr) throw cErr;
        }
        toast.success(`Despesa parcelada criada (${total} parcelas)`);
      } else {
        const { error } = await supabase.from("accounts_payable" as any).insert({
          description: form.description.trim(),
          category: form.category,
          supplier_name: form.supplier_name.trim() || null,
          supplier_iban: form.supplier_iban.trim() || null,
          supplier_id: form.supplier_id || null,
          total_amount: totalNum,
          due_date: form.due_date,
          notes: form.notes.trim() || null,
          is_recurring: form.is_recurring,
          recurrence_frequency: form.is_recurring ? form.recurrence_frequency : null,
          next_due_date: form.is_recurring ? addPeriod(form.due_date, form.recurrence_frequency) : null,
          created_by: userId,
        } as any);
        if (error) throw error;
        toast.success("Despesa criada");
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const syncCashFlowForPayable = async (p: Payable, opts: { paidAt: string; amount: number; method: string | null; note: string | null; }) => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const entryDate = opts.paidAt.slice(0, 10);
    const { data: existing } = await supabase
      .from("cash_flow_entries" as any)
      .select("id")
      .eq("source_payable_id", p.id)
      .maybeSingle();
    const payload: any = {
      entry_date: entryDate,
      kind: "outflow",
      description: p.description,
      origin: "Contas a Pagar",
      category: p.category,
      supplier_id: p.supplier_id,
      payment_method: opts.method,
      amount: opts.amount,
      status: "pago",
      notes: opts.note,
    };
    if ((existing as any)?.id) {
      await supabase.from("cash_flow_entries" as any).update(payload).eq("id", (existing as any).id);
    } else {
      await supabase.from("cash_flow_entries" as any).insert({ ...payload, source_payable_id: p.id, created_by: userId });
    }
  };

  const confirmPayment = async (p: Payable, paymentDate: string, method: string, note: string) => {
    // paymentDate is "YYYY-MM-DD"; persist as timestamptz noon to avoid TZ drift
    const paidAtISO = new Date(`${paymentDate}T12:00:00`).toISOString();
    const combinedNote = [p.notes, note].filter(Boolean).join("\n").trim() || null;
    const { error } = await supabase.from("accounts_payable" as any).update({
      status: "pago",
      paid_amount: p.total_amount,
      paid_at: paidAtISO,
      payment_method: method || null,
      notes: combinedNote,
    } as any).eq("id", p.id);
    if (error) { toast.error("Erro ao marcar como pago"); return; }

    await syncCashFlowForPayable(p, {
      paidAt: paidAtISO,
      amount: p.total_amount,
      method: method || null,
      note: note || null,
    });

    if (p.is_recurring && p.recurrence_frequency) {
      const next = addPeriod(p.due_date, p.recurrence_frequency);
      await supabase.from("accounts_payable" as any).insert({
        description: p.description,
        category: p.category,
        supplier_name: p.supplier_name,
        supplier_iban: p.supplier_iban,
        supplier_id: p.supplier_id,
        total_amount: p.total_amount,
        due_date: next,
        notes: p.notes,
        is_recurring: true,
        recurrence_frequency: p.recurrence_frequency,
        next_due_date: addPeriod(next, p.recurrence_frequency),
      } as any);
    }
    toast.success("Pagamento registado e lançado no Fluxo de Caixa");
    setPayDialog(null);
    load();
  };

  const reopen = async (p: Payable) => {
    const { error } = await supabase.from("accounts_payable" as any).update({
      status: "pendente", paid_amount: 0, paid_at: null, payment_method: null,
    } as any).eq("id", p.id);
    if (error) { toast.error("Erro"); return; }
    await supabase.from("cash_flow_entries" as any).delete().eq("source_payable_id", p.id);
    toast.success("Pagamento revertido");
    load();
  };

  const remove = async (p: Payable) => {
    const { error } = await supabase.from("accounts_payable" as any).delete().eq("id", p.id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Despesa eliminada");
    load();
  };

  const years = useMemo(() => {
    const ys = new Set<string>();
    items.forEach(p => ys.add(String(new Date(p.due_date).getFullYear())));
    ys.add(String(new Date().getFullYear()));
    return Array.from(ys).sort();
  }, [items]);

  return (
    <div className="space-y-4">
      <PartnerCompanyPayoutsCard onDone={() => load()} />

      {/* Vence nos próximos 7 dias */}
      <Card className={dueSoon.length > 0 ? "border-orange-300" : "border-green-300"}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <CalendarClock className="w-4 h-4" />
            Vence nos próximos 7 dias
            <Badge variant="outline" className="ml-1">{dueSoon.length}</Badge>
            {dueSoon.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">Total em aberto: {fmt(dueSoonTotal)}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dueSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada a vencer nos próximos 7 dias.</p>
          ) : (
            <ul className="divide-y">
              {dueSoon.slice(0, 10).map(({ item: p, daysLeft, remaining }) => (
                <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.supplier_name || "—"} • vence {new Date(p.due_date + "T00:00:00").toLocaleDateString("pt-PT")} ({dueLabelPt(daysLeft)})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{fmt(remaining)}</span>
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setPayDialog({ payable: p, date: todayISO(), method: "", note: "" })}>
                      Pagar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {dueSoon.length > 10 && (
            <p className="text-xs text-muted-foreground">+ {dueSoon.length - 10} outras: use os filtros abaixo.</p>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8 h-9" placeholder="Pesquisar descrição/fornecedor..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <FilterSelect label="Período" value={periodType} onChange={(v) => setPeriodType(v as any)} options={[
              { value: "all", label: "Todos" },
              { value: "day", label: "Dia" },
              { value: "week", label: "Semana" },
              { value: "month", label: "Mês" },
              { value: "year", label: "Ano" },
              { value: "custom", label: "Personalizado" },
            ]} />
            {periodType === "day" && (
              <div className="flex flex-col gap-1"><Label className="text-[10px] uppercase text-muted-foreground">Data</Label>
                <Input type="date" className="h-9 w-40" value={periodDay} onChange={(e) => setPeriodDay(e.target.value)} /></div>
            )}
            {periodType === "week" && (
              <div className="flex flex-col gap-1"><Label className="text-[10px] uppercase text-muted-foreground">Semana</Label>
                <Input type="week" className="h-9 w-40" value={periodWeek} onChange={(e) => setPeriodWeek(e.target.value)} /></div>
            )}
            {periodType === "month" && (
              <div className="flex flex-col gap-1"><Label className="text-[10px] uppercase text-muted-foreground">Mês</Label>
                <Input type="month" className="h-9 w-40" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} /></div>
            )}
            {periodType === "year" && (
              <div className="flex flex-col gap-1"><Label className="text-[10px] uppercase text-muted-foreground">Ano</Label>
                <Input type="number" min={2020} max={2099} className="h-9 w-24" value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} /></div>
            )}
            {periodType === "custom" && (
              <>
                <div className="flex flex-col gap-1"><Label className="text-[10px] uppercase text-muted-foreground">De</Label>
                  <Input type="date" className="h-9 w-40" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} /></div>
                <div className="flex flex-col gap-1"><Label className="text-[10px] uppercase text-muted-foreground">Até</Label>
                  <Input type="date" className="h-9 w-40" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} /></div>
              </>
            )}
            <FilterSelect label="Estado" value={filterStatus} onChange={setFilterStatus} options={[{ value: "all", label: "Todos" }, ...STATUSES.map(s => ({ value: s.value, label: s.label }))]} />
            <FilterSelect label="Categoria" value={filterCategory} onChange={setFilterCategory} options={[{ value: "all", label: "Todas" }, ...CATEGORIES.map(c => ({ value: c.value, label: c.label }))]} />
            <FilterSelect label="Fornecedor" value={filterSupplier} onChange={setFilterSupplier} options={[{ value: "all", label: "Todos" }, ...suppliers.map(s => ({ value: s, label: s }))]} />
            <FilterSelect label="Tipo" value={filterExpenseType} onChange={(v) => setFilterExpenseType(v as any)} options={[
              { value: "all", label: "Todos" },
              { value: "avulsa", label: "Avulsa" },
              { value: "recorrente", label: "Recorrente" },
              { value: "parcelada", label: "Parcelada" },
            ]} />
            <FilterSelect label="Recorrente" value={filterRecurring} onChange={(v) => setFilterRecurring(v as any)} options={[
              { value: "all", label: "Todos" }, { value: "yes", label: "Sim" }, { value: "no", label: "Não" },
            ]} />
            <FilterSelect label="Parcelado" value={filterInstallment} onChange={(v) => setFilterInstallment(v as any)} options={[
              { value: "all", label: "Todos" }, { value: "yes", label: "Sim" }, { value: "no", label: "Não" },
            ]} />
            <FilterSelect label="Mês (venc.)" value={filterMonth} onChange={setFilterMonth} options={[{ value: "all", label: "Todos" }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1).padStart(2, "0") }))]} />
            <FilterSelect label="Ano (venc.)" value={filterYear} onChange={setFilterYear} options={[{ value: "all", label: "Todos" }, ...years.map(y => ({ value: y, label: y }))]} />
            <Button variant="ghost" size="sm" className="h-9" onClick={() => {
              setPeriodType("all"); setFilterStatus("all"); setFilterCategory("all"); setFilterSupplier("all");
              setFilterExpenseType("all"); setFilterRecurring("all"); setFilterInstallment("all");
              setFilterMonth("all"); setFilterYear("all"); setSearch("");
            }}>Limpar</Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setReportOpen(true)} className="gap-1"><FileText className="w-4 h-4" /> Gerar Relatório</Button>
              <Button onClick={openCreate} className="gap-1"><Plus className="w-4 h-4" /> Nova despesa</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <IndicatorCard icon={<CalendarClock className="w-4 h-4" />} label="A Pagar este mês" value={fmt(indicators.toPayMonth)} tone="blue" />
        <IndicatorCard icon={<AlertTriangle className="w-4 h-4" />} label="Vencido" value={fmt(indicators.overdue)} tone="red" />
        <IndicatorCard icon={<CheckCircle2 className="w-4 h-4" />} label="Pago (mês)" value={fmt(indicators.paidMonth)} tone="green" />
        <IndicatorCard icon={<Layers className="w-4 h-4" />} label="Parcelado em aberto" value={fmt(indicators.installmentOpen)} tone="amber" />
        <IndicatorCard icon={<Repeat className="w-4 h-4" />} label="Recorrentes (mensal)" value={fmt(indicators.recurringMonthly)} tone="violet" />
      </div>

      {/* Alerts */}
      {(alerts.dueToday + alerts.due7 + alerts.due15) > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.dueToday > 0 && <Badge className="bg-red-100 text-red-700 border-red-300" variant="outline">🔴 Vence hoje: {alerts.dueToday}</Badge>}
          {alerts.due7 > 0 && <Badge className="bg-orange-100 text-orange-700 border-orange-300" variant="outline">🟠 Vence em 7 dias: {alerts.due7}</Badge>}
          {alerts.due15 > 0 && <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300" variant="outline">🟡 Vence em 15 dias: {alerts.due15}</Badge>}
        </div>
      )}

      {/* Table */}
      <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer select-none hover:bg-muted/40 rounded-t-lg">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Despesas ({filtered.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpensesOpen(!expensesOpen);
                    }}
                  >
                    {expensesOpen ? "Minimizar" : "Expandir"}
                  </Button>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${expensesOpen ? "rotate-180" : ""}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">A carregar...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Sem despesas para os filtros aplicados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2 px-2">Descrição</th>
                        <th className="py-2 px-2">Categoria</th>
                        <th className="py-2 px-2">Fornecedor</th>
                        <th className="py-2 px-2 text-right">Valor</th>
                        <th className="py-2 px-2">Vencimento</th>
                        <th className="py-2 px-2">Estado</th>
                        <th className="py-2 px-2">Parcela</th>
                        <th className="py-2 px-2">Recorr.</th>
                        <th className="py-2 px-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(p => {
                        const eff = effectiveStatus(p);
                        return (
                          <tr key={p.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{p.description}</td>
                            <td className="py-2 px-2">{CATEGORIES.find(c => c.value === p.category)?.label}</td>
                            <td className="py-2 px-2">{p.supplier_name || "—"}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmt(p.total_amount)}</td>
                            <td className="py-2 px-2">{new Date(p.due_date).toLocaleDateString("pt-PT")}</td>
                            <td className="py-2 px-2">{statusBadge(eff)}</td>
                            <td className="py-2 px-2">{p.is_installment ? `${p.installment_current}/${p.installments_total}` : "—"}</td>
                            <td className="py-2 px-2">{p.is_recurring ? <Badge variant="outline" className="gap-1"><Repeat className="w-3 h-3" />{FREQUENCIES.find(f => f.value === p.recurrence_frequency)?.label}</Badge> : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex items-center justify-end gap-1">
                                {eff !== "pago" && eff !== "cancelado" && (
                                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setPayDialog({ payable: p, date: todayISO(), method: "", note: "" })}>
                                    <CheckCircle2 className="w-3 h-3" /> Pagar
                                  </Button>
                                )}
                                {eff === "pago" && (
                                  <Button size="sm" variant="ghost" className="h-8" onClick={() => reopen(p)}>Reabrir</Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Eliminar despesa?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação é irreversível. {p.is_installment && !p.parent_id ? "Eliminará também todas as parcelas associadas." : ""}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => remove(p)}>Eliminar</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Filter className="w-4 h-4" />{filterCategory === "fornecedores" && filterSupplier === "all" ? " Despesas por Fornecedor" : " Despesas por Categoria"}</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filterCategory === "fornecedores" && filterSupplier === "all" ? bySupplier.map(r => ({ ...r, name: r.name === "—" ? "Fornecedor não informado" : r.name })) : byCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Bar dataKey="total" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Evolução Mensal</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Relatório de Despesas&nbsp;</CardTitle></CardHeader>
          <CardContent>
            {(() => {
              const suppliersMode = filterCategory === "fornecedores" && filterSupplier === "all";
              const groupByCategory = !suppliersMode && (filterCategory !== "all" || filterSupplier === "all");
              const rawRows = groupByCategory ? byCategory : bySupplier;
              const rows = suppliersMode || !groupByCategory
                ? rawRows.map(r => ({ ...r, name: r.name === "—" ? "Fornecedor não informado" : r.name }))
                : rawRows;
              const colLabel = groupByCategory ? "Categoria" : "Fornecedor";
              if (rows.length === 0) {
                return <p className="text-sm text-muted-foreground">Sem dados.</p>;
              }
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-muted-foreground">
                      <tr><th className="py-2 px-2">{colLabel}</th><th className="py-2 px-2 text-right">Total</th></tr>
                    </thead>
                    <tbody>
                      {rows.map(s => (
                        <tr key={s.name} className="border-b">
                          <td className="py-2 px-2">{s.name}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmt(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <AccountsPayableReportDialog open={reportOpen} onOpenChange={setReportOpen} />

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar despesa" : "Nova despesa"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Descrição *</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Segurança Social Junho" />
            </div>
            <div>
              <Label>Categoria *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (€) *</Label>
              <Input inputMode="decimal" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} placeholder="0,00" />
            </div>
            <div className="md:col-span-2">
              <Label>Fornecedor</Label>
              <Select
                value={form.supplier_id || "__none__"}
                onValueChange={(v) => {
                  if (v === "__none__") {
                    setForm({ ...form, supplier_id: "", supplier_name: "", supplier_iban: "" });
                  } else {
                    const s = suppliersList.find(x => x.id === v);
                    setForm({ ...form, supplier_id: v, supplier_name: s?.name || "", supplier_iban: s?.iban || "" });
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar fornecedor (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem fornecedor —</SelectItem>
                  {suppliersList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.supplier_iban && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">IBAN: {form.supplier_iban}</p>
              )}
            </div>
            <div>
              <Label>Data de Vencimento *</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>

            <div className="md:col-span-2 border-t pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">É recorrente?</Label>
                  <p className="text-xs text-muted-foreground">Gera automaticamente o próximo vencimento ao marcar como pago.</p>
                </div>
                <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v })} disabled={!!editing && editing.is_installment} />
              </div>
              {form.is_recurring && (
                <div>
                  <Label>Frequência</Label>
                  <Select value={form.recurrence_frequency} onValueChange={(v) => setForm({ ...form, recurrence_frequency: v as Frequency })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {!editing && (
              <div className="md:col-span-2 border-t pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">É parcelado?</Label>
                    <p className="text-xs text-muted-foreground">Divide o valor total em N parcelas com vencimentos consecutivos.</p>
                  </div>
                  <Switch checked={form.is_installment} onCheckedChange={(v) => setForm({ ...form, is_installment: v })} />
                </div>
                {form.is_installment && (
                  <div>
                    <Label>Número total de parcelas</Label>
                    <Input type="number" min={2} value={form.installments_total} onChange={(e) => setForm({ ...form, installments_total: e.target.value })} placeholder="Ex: 12" />
                    {form.installments_total && Number(form.installments_total) > 0 && form.total_amount && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Valor por parcela: {fmt(Number(String(form.total_amount).replace(",", ".")) / Number(form.installments_total))}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Paid Dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como paga</DialogTitle>
          </DialogHeader>
          {payDialog && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/40 p-2 text-sm">
                <div className="font-medium">{payDialog.payable.description}</div>
                <div className="text-xs text-muted-foreground">
                  {payDialog.payable.supplier_name || "—"} • {fmt(payDialog.payable.total_amount)}
                </div>
              </div>
              <div>
                <Label>Data de pagamento *</Label>
                <Input type="date" value={payDialog.date} onChange={(e) => setPayDialog({ ...payDialog, date: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Por padrão usa a data de hoje. Pode editar se o pagamento foi feito noutro dia.</p>
              </div>
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={payDialog.method || "__none__"} onValueChange={(v) => setPayDialog({ ...payDialog, method: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="bank_transfer">Transferência Bancária</SelectItem>
                    <SelectItem value="mbway">MB Way</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="multibanco">Multibanco</SelectItem>
                    <SelectItem value="debit_direct">Débito Direto</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observação</Label>
                <Textarea rows={2} value={payDialog.note} onChange={(e) => setPayDialog({ ...payDialog, note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => payDialog && payDialog.date && confirmPayment(payDialog.payable, payDialog.date, payDialog.method, payDialog.note)}
              disabled={!payDialog?.date}
            >
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IndicatorCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "blue" | "red" | "green" | "amber" | "violet" }) {
  const toneMap = {
    blue: "border-blue-200 bg-blue-50/50",
    red: "border-red-200 bg-red-50/50",
    green: "border-green-200 bg-green-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    violet: "border-violet-200 bg-violet-50/50",
  };
  return (
    <Card className={toneMap[tone]}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
