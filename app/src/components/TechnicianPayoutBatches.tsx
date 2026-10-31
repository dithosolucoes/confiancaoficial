import BatchPaymentDialog from "@/components/BatchPaymentDialog";
import { isPayoutDue } from "@/lib/payout-timing";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Wallet, Settings as SettingsIcon, Users, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatServiceReference } from "@/lib/serviceLabel";

type PeriodType = "weekly" | "biweekly" | "monthly";
type BatchStatus = "open" | "paid" | "cancelled";

interface Batch {
  id: string;
  technician_id: string;
  technician_name?: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  label: string;
  total_amount: number;
  status: BatchStatus;
  paid_at: string | null;
  payment_method: string | null;
  payable_id: string | null;
  approved_at?: string | null;
}
interface BatchItem {
  id: string;
  batch_id: string;
  service_request_id: string;
  amount: number;            // valor gravado no item (histórico)
  official_amount: number;   // service_requests.technician_payout (fonte oficial)
  reference?: string;
  scheduled_date?: string;
  service_status?: string;
  customer_name?: string;
}

interface EligibleService {
  completed_at?: string | null;
  id: string;
  reference: string;
  scheduled_date: string;
  technician_payout: number;
  status: string;
  received_at: string | null;
  baixa_received_at: string | null;
  batch_id: string | null;
  batch_label: string | null;
}

const fmtEUR = (n: number) =>
  `€${Number(n || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const periodLabel = (p: PeriodType) =>
  p === "weekly" ? "Semanal" : p === "biweekly" ? "Quinzenal" : "Mensal";

const monthsPT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const computePeriod = (refDate: string, periodType: PeriodType): { period_start: string; period_end: string; label: string } => {
  const d = new Date(refDate + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const fmt = (dt: Date) => dt.toISOString().slice(0,10);
  const dmy = (dt: Date) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
  if (periodType === "weekly") {
    const dow = d.getDay(); // 0=Sun
    const diff = dow === 0 ? -6 : 1 - dow;
    const s = new Date(d); s.setDate(d.getDate() + diff);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return { period_start: fmt(s), period_end: fmt(e), label: `Semana de ${dmy(s)} a ${dmy(e)}` };
  }
  if (periodType === "biweekly") {
    if (day <= 15) {
      const s = new Date(y, m, 1); const e = new Date(y, m, 15);
      return { period_start: fmt(s), period_end: fmt(e), label: `Quinzena 1 – ${monthsPT[m]}/${y}` };
    }
    const s = new Date(y, m, 16); const e = new Date(y, m + 1, 0);
    return { period_start: fmt(s), period_end: fmt(e), label: `Quinzena 2 – ${monthsPT[m]}/${y}` };
  }
  const s = new Date(y, m, 1); const e = new Date(y, m + 1, 0);
  return { period_start: fmt(s), period_end: fmt(e), label: `${monthsPT[m]}/${y}` };
};

const TechnicianPayoutBatches = () => {
  const [period, setPeriod] = useState<PeriodType>("monthly");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [allTechs, setAllTechs] = useState<Array<[string, string]>>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sectionOpen, setSectionOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [fTech, setFTech] = useState<string>("all");
  const [fPeriodType, setFPeriodType] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPaidFrom, setFPaidFrom] = useState<string>("");
  const [fPaidTo, setFPaidTo] = useState<string>("");

  // Manual batch dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [mTech, setMTech] = useState<string>("");
  const [mPeriodType, setMPeriodType] = useState<PeriodType>("monthly");
  const [mPeriodStart, setMPeriodStart] = useState<string>("");
  const [mPeriodEnd, setMPeriodEnd] = useState<string>("");
  const [mLabel, setMLabel] = useState<string>("");
  const [mDueDate, setMDueDate] = useState<string>("");
  const [mStatus, setMStatus] = useState<"open" | "paid">("open");
  const [mPaidAt, setMPaidAt] = useState<string>("");
  const [mMethod, setMMethod] = useState<string>("");
  const [payGroup, setPayGroup] = useState<Group | null>(null);
  // Valor de corte para aprovação do gestor (null = desligado, padrão)
  const [approvalThreshold, setApprovalThreshold] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).rpc("payout_approval_threshold");
      setApprovalThreshold(data == null ? null : Number(data));
    })();
  }, []);
  const [mNotes, setMNotes] = useState<string>("");
  const [mIncludeAlreadyPaid, setMIncludeAlreadyPaid] = useState(false);
  const [mEligible, setMEligible] = useState<EligibleService[]>([]);
  const [mSelected, setMSelected] = useState<Record<string, boolean>>({});
  const [mLoadingElig, setMLoadingElig] = useState(false);
  const [mSaving, setMSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: b }, { data: profs }] = await Promise.all([
      supabase.from("technician_payout_settings" as any).select("*").limit(1),
      supabase.from("technician_payout_batches" as any).select("*").order("period_start", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name").eq("user_type", "technician"),
    ]);
    const set = (s as any[])?.[0];
    if (set) { setPeriod(set.period_type); setSettingsId(set.id); }
    const techMap = new Map((profs as any[] || []).map(p => [p.user_id, p.full_name]));
    setAllTechs(Array.from(techMap.entries()).sort((a,b) => String(a[1]).localeCompare(String(b[1]))));
    const list: Batch[] = ((b as any[]) || []).map(x => ({ ...x, technician_name: techMap.get(x.technician_id) || "Técnico" }));
    setBatches(list);
    if (list.length) {
      const ids = list.map(x => x.id);
      const { data: itemsData } = await supabase
        .from("technician_payout_batch_items" as any)
        .select("*, service_requests(reference, scheduled_date, status, technician_payout, contact_name)")
        .in("batch_id", ids);
      setItems(((itemsData as any[]) || []).map(i => ({
        id: i.id, batch_id: i.batch_id, service_request_id: i.service_request_id,
        amount: Number(i.amount),
        official_amount: Number(i.service_requests?.technician_payout ?? i.amount ?? 0),
        reference: i.service_requests?.reference, scheduled_date: i.service_requests?.scheduled_date,
        service_status: i.service_requests?.status,
        customer_name: i.service_requests?.contact_name,
      })));
    } else { setItems([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("tech-batches")
      .on("postgres_changes", { event: "*", schema: "public", table: "technician_payout_batches" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "technician_payout_batch_items" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const savePeriod = async (v: PeriodType) => {
    setSavingPeriod(true);
    const payload: any = { period_type: v, updated_by: (await supabase.auth.getUser()).data.user?.id };
    let res;
    if (settingsId) {
      res = await supabase.from("technician_payout_settings" as any).update(payload).eq("id", settingsId);
    } else {
      res = await supabase.from("technician_payout_settings" as any).insert(payload);
    }
    setSavingPeriod(false);
    if (res.error) {
      toast({ title: "Erro", description: res.error.message, variant: "destructive" });
    } else {
      setPeriod(v);
      toast({ title: "Periodicidade atualizada", description: `Novos lotes serão criados como ${periodLabel(v)}.` });
      load();
    }
  };

  const techOptions = useMemo(() => {
    const m = new Map<string, string>(allTechs);
    batches.forEach(b => { if (!m.has(b.technician_id)) m.set(b.technician_id, b.technician_name || "Técnico"); });
    return Array.from(m.entries()).sort((a,b) => String(a[1]).localeCompare(String(b[1])));
  }, [batches, allTechs]);

  const filtered = useMemo(() => batches.filter(b => {
    if (fTech !== "all" && b.technician_id !== fTech) return false;
    if (fPeriodType !== "all" && b.period_type !== fPeriodType) return false;
    if (fStatus !== "all" && b.status !== fStatus) return false;
    if (fPaidFrom && (!b.paid_at || b.paid_at < fPaidFrom)) return false;
    if (fPaidTo && (!b.paid_at || b.paid_at > fPaidTo + "T23:59:59")) return false;
    return true;
  }), [batches, fTech, fPeriodType, fStatus, fPaidFrom, fPaidTo]);

  // Consolidação: um cartão por técnico + período + status.
  // Total oficial = soma de service_requests.technician_payout dos itens.
  interface Group {
    key: string;
    technician_id: string;
    technician_name: string;
    period_type: PeriodType;
    period_start: string;
    period_end: string;
    label: string;
    status: BatchStatus;
    paid_at: string | null;
    payment_method: string | null;
    batch_ids: string[];
    items: BatchItem[];
    officialTotal: number;
    serviceCount: number;
    approval_ids: string[];
  }

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    const needsApproval = (b: Batch) =>
      approvalThreshold !== null && b.status === "open" && !b.approved_at && Number(b.total_amount) >= approvalThreshold;
    for (const b of filtered) {
      const key = `${b.technician_id}|${b.period_start}|${b.period_end}|${b.period_type}|${b.status}`;
      const its = items.filter(i => i.batch_id === b.id);
      const existing = map.get(key);
      if (existing) {
        existing.batch_ids.push(b.id);
        if (needsApproval(b)) existing.approval_ids.push(b.id);
        existing.items.push(...its);
        existing.officialTotal += its.reduce((s, x) => s + x.official_amount, 0);
        existing.serviceCount += its.length;
        if (b.paid_at && (!existing.paid_at || b.paid_at > existing.paid_at)) {
          existing.paid_at = b.paid_at;
          existing.payment_method = b.payment_method;
        }
      } else {
        map.set(key, {
          key,
          technician_id: b.technician_id,
          technician_name: b.technician_name || "Técnico",
          period_type: b.period_type,
          period_start: b.period_start,
          period_end: b.period_end,
          label: b.label,
          status: b.status,
          paid_at: b.paid_at,
          payment_method: b.payment_method,
          batch_ids: [b.id],
          approval_ids: needsApproval(b) ? [b.id] : [],
          items: [...its],
          officialTotal: its.reduce((s, x) => s + x.official_amount, 0),
          serviceCount: its.length,
        });
      }
    }
    // Ordenar por período desc, técnico asc
    return Array.from(map.values()).sort((a, b) => {
      if (a.period_start !== b.period_start) return a.period_start < b.period_start ? 1 : -1;
      return a.technician_name.localeCompare(b.technician_name);
    });
  }, [filtered, items, approvalThreshold]);

  // Regra: esconder cartões com total oficial 0 e sem serviços (sem justificativa financeira real).
  const visibleGroups = useMemo(
    () => groups.filter(g => !(g.officialTotal < 0.005 && g.serviceCount === 0)),
    [groups],
  );

  const totals = useMemo(() => {
    const open = visibleGroups.filter(g => g.status === "open").reduce((s, g) => s + g.officialTotal, 0);
    const paid = visibleGroups.filter(g => g.status === "paid").reduce((s, g) => s + g.officialTotal, 0);
    return { open, paid };
  }, [visibleGroups]);

  const statusBadge = (s: BatchStatus) => {
    if (s === "paid") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Pago</Badge>;
    if (s === "cancelled") return <Badge variant="outline">Cancelado</Badge>;
    return <Badge className="bg-amber-100 text-amber-800 border-amber-300">A pagar</Badge>;
  };

  // ----- Manual Batch -----
  const openManualDialog = () => {
    const today = new Date().toISOString().slice(0,10);
    setMTech("");
    setMPeriodType(period);
    const p = computePeriod(today, period);
    setMPeriodStart(p.period_start);
    setMPeriodEnd(p.period_end);
    setMLabel(p.label);
    setMDueDate(p.period_end);
    setMStatus("open");
    setMPaidAt(today);
    setMMethod("");
    setMNotes("");
    setMIncludeAlreadyPaid(false);
    setMEligible([]);
    setMSelected({});
    setManualOpen(true);
  };

  const recomputePeriod = (type: PeriodType, anchor: string) => {
    if (!anchor) return;
    const p = computePeriod(anchor, type);
    setMPeriodStart(p.period_start);
    setMPeriodEnd(p.period_end);
    setMLabel(p.label);
    setMDueDate(p.period_end);
  };

  const loadEligible = async () => {
    if (!mTech) { setMEligible([]); return; }
    setMLoadingElig(true);
    // All services for this technician with payout > 0 and not cancelled
    const { data: srs } = await supabase
      .from("service_requests")
      .select("id, reference, scheduled_date, technician_payout, status, received_at, baixa_received_at, completed_at")
      .eq("technician_id", mTech)
      .not("status", "in", "(cancelled,cancelado)")
      .gt("technician_payout", 0)
      .order("scheduled_date", { ascending: false })
      .limit(500);
    const ids = (srs || []).map((s: any) => s.id);
    const itemsByService: Record<string, { batch_id: string; label: string; status: string }> = {};
    if (ids.length) {
      const { data: existing } = await supabase
        .from("technician_payout_batch_items" as any)
        .select("service_request_id, batch_id, technician_payout_batches(label, status)")
        .in("service_request_id", ids);
      (existing as any[] || []).forEach(e => {
        itemsByService[e.service_request_id] = {
          batch_id: e.batch_id,
          label: e.technician_payout_batches?.label || "Lote",
          status: e.technician_payout_batches?.status || "open",
        };
      });
    }
    const eligible: EligibleService[] = (srs as any[] || []).map(s => ({
      id: s.id,
      reference: s.reference,
      scheduled_date: s.scheduled_date,
      technician_payout: Number(s.technician_payout || 0),
      status: s.status,
      received_at: s.received_at,
      baixa_received_at: s.baixa_received_at,
      completed_at: s.completed_at,
      batch_id: itemsByService[s.id]?.batch_id || null,
      batch_label: itemsByService[s.id]?.label || null,
    }));
    setMEligible(eligible);
    setMLoadingElig(false);
  };

  useEffect(() => { if (manualOpen) loadEligible();   }, [mTech, manualOpen]);

  const visibleEligible = useMemo(() => mEligible.filter(s => {
    // Always include unbatched & liberados (received_at set, no baixa)
    const isLiberado = !!s.received_at && !s.baixa_received_at;
    const isPaid = !!s.baixa_received_at;
    if (isPaid && !mIncludeAlreadyPaid) return false;
    if (!isLiberado && !isPaid) return false;
    // Regra do cliente: repasse só 5 dias após a conclusão (ver src/lib/payout-timing.ts)
    if (!isPaid && !isPayoutDue(s.completed_at)) return false;
    return true;
  }), [mEligible, mIncludeAlreadyPaid]);

  const aguardandoPrazo = useMemo(() => mEligible.filter(s =>
    !s.baixa_received_at && !!s.received_at && !isPayoutDue(s.completed_at)
  ), [mEligible]);

  const selectedTotal = useMemo(() =>
    visibleEligible.filter(s => mSelected[s.id]).reduce((sum, s) => sum + s.technician_payout, 0),
  [visibleEligible, mSelected]);

  const allVisibleSelected = visibleEligible.length > 0 && visibleEligible.every(s => mSelected[s.id]);

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setMSelected(prev => {
        const next = { ...prev };
        visibleEligible.forEach(s => delete next[s.id]);
        return next;
      });
    } else {
      setMSelected(prev => {
        const next = { ...prev };
        visibleEligible.forEach(s => { next[s.id] = true; });
        return next;
      });
    }
  };

  const saveManualBatch = async () => {
    if (!mTech) { toast({ title: "Selecione o técnico", variant: "destructive" }); return; }
    if (!mPeriodStart || !mPeriodEnd || !mLabel) { toast({ title: "Defina o período do lote", variant: "destructive" }); return; }
    const chosen = visibleEligible.filter(s => mSelected[s.id]);
    if (chosen.length === 0) { toast({ title: "Selecione ao menos um serviço", variant: "destructive" }); return; }

    // Confirm if moving from another open batch
    const moving = chosen.filter(s => s.batch_id);
    if (moving.length > 0) {
      const ok = window.confirm(`${moving.length} serviço(s) já estão vinculados a outro lote. Confirma que deseja movê-los?`);
      if (!ok) return;
    }

    setMSaving(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const techName = techOptions.find(t => t[0] === mTech)?.[1] || "Técnico";
      const total = chosen.reduce((s, x) => s + x.technician_payout, 0);
      const description = `Pagamento Técnico ${techName} — ${mLabel}`;
      const paidAtISO = mStatus === "paid" && mPaidAt ? new Date(`${mPaidAt}T12:00:00`).toISOString() : null;

      // 1) Create accounts_payable (pending first; we'll mark as paid after)
      const { data: payable, error: payErr } = await supabase.from("accounts_payable" as any).insert({
        description,
        category: "outros",
        total_amount: total,
        due_date: mDueDate || mPeriodEnd,
        status: "pendente",
        notes: mNotes || "Lote manual de pagamento ao técnico",
      } as any).select("id").single();
      if (payErr) throw payErr;
      const payableId = (payable as any).id;

      // 2) Create the batch
      const { data: batch, error: batchErr } = await supabase.from("technician_payout_batches" as any).insert({
        technician_id: mTech,
        period_type: mPeriodType,
        period_start: mPeriodStart,
        period_end: mPeriodEnd,
        label: mLabel,
        status: "open",
        total_amount: total,
        payable_id: payableId,
      } as any).select("id").single();
      if (batchErr) throw batchErr;
      const batchId = (batch as any).id;

      // 3) Link payable to batch
      await supabase.from("accounts_payable" as any).update({ source_batch_id: batchId } as any).eq("id", payableId);

      // 4) Move/insert items (upsert by service_request_id which is UNIQUE)
      const itemsPayload = chosen.map(s => ({ batch_id: batchId, service_request_id: s.id, amount: s.technician_payout }));
      const { error: itemsErr } = await supabase
        .from("technician_payout_batch_items" as any)
        .upsert(itemsPayload, { onConflict: "service_request_id" });
      if (itemsErr) throw itemsErr;

      // Recompute totals on any source batches that lost items
      const sourceBatchIds = Array.from(new Set(moving.map(s => s.batch_id!).filter(id => id !== batchId)));
      for (const bid of sourceBatchIds) {
        const { data: sumRows } = await supabase
          .from("technician_payout_batch_items" as any)
          .select("amount")
          .eq("batch_id", bid);
        const newTotal = (sumRows as any[] || []).reduce((s, x) => s + Number(x.amount), 0);
        await supabase.from("technician_payout_batches" as any).update({ total_amount: newTotal, updated_at: new Date().toISOString() } as any).eq("id", bid);
        const { data: bRow } = await supabase.from("technician_payout_batches" as any).select("payable_id").eq("id", bid).single();
        const pid = (bRow as any)?.payable_id;
        if (pid) await supabase.from("accounts_payable" as any).update({ total_amount: newTotal } as any).eq("id", pid);
      }

      // 5) If status = Pago, settle payable, batch, services, cash flow
      if (mStatus === "paid") {
        // Update payable to pago (trigger will set batch.paid and baixa_received_at on services)
        const { error: upPayErr } = await supabase.from("accounts_payable" as any).update({
          status: "pago",
          paid_amount: total,
          paid_at: paidAtISO,
          payment_method: mMethod || null,
        } as any).eq("id", payableId);
        if (upPayErr) throw upPayErr;

        // Defensive: also explicitly set in case trigger doesn't fire as expected
        await supabase.from("technician_payout_batches" as any).update({
          status: "paid",
          paid_at: paidAtISO,
          payment_method: mMethod || null,
        } as any).eq("id", batchId);
        await supabase.from("service_requests").update({
          baixa_received_at: paidAtISO,
        } as any).in("id", chosen.map(s => s.id)).is("baixa_received_at", null);

        // Cash flow entry (single per batch via source_payable_id)
        const entryDate = (mPaidAt || mPeriodEnd).slice(0, 10);
        const { data: existingCF } = await supabase
          .from("cash_flow_entries" as any)
          .select("id")
          .eq("source_payable_id", payableId)
          .maybeSingle();
        const cfPayload: any = {
          entry_date: entryDate,
          kind: "outflow",
          description,
          origin: "Pagamento de Técnico",
          category: "outros",
          payment_method: mMethod || null,
          amount: total,
          status: "pago",
          notes: mNotes || null,
        };
        if ((existingCF as any)?.id) {
          await supabase.from("cash_flow_entries" as any).update(cfPayload).eq("id", (existingCF as any).id);
        } else {
          await supabase.from("cash_flow_entries" as any).insert({ ...cfPayload, source_payable_id: payableId, created_by: userId });
        }
      }

      toast({ title: "Lote criado", description: `${chosen.length} serviço(s) · ${fmtEUR(total)}` });
      setManualOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar lote", description: e.message || String(e), variant: "destructive" });
    } finally {
      setMSaving(false);
    }
  };

  return (
    <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Lotes de Pagamento aos Técnicos
        </CardTitle>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            {sectionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {sectionOpen ? "Fechar" : "Expandir"}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="space-y-4">
      {/* Settings + KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-1 border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><SettingsIcon className="w-4 h-4" /> Periodicidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select value={period} onValueChange={(v) => savePeriod(v as PeriodType)} disabled={savingPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Semanal (Seg-Dom)</SelectItem>
                <SelectItem value="biweekly">Quinzenal (1-15 / 16-fim)</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Aplica-se apenas a novos lotes automáticos.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-300/60 bg-amber-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">A Pagar (lotes abertos)</p>
            <p className="text-2xl font-bold text-amber-700">{fmtEUR(totals.open)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300/60 bg-emerald-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pago (lotes liquidados)</p>
            <p className="text-2xl font-bold text-emerald-700">{fmtEUR(totals.paid)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Técnico</Label>
            <Select value={fTech} onValueChange={setFTech}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {techOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Período</Label>
            <Select value={fPeriodType} onValueChange={setFPeriodType}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="biweekly">Quinzenal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">A pagar</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Pago de</Label>
            <Input type="date" value={fPaidFrom} onChange={e => setFPaidFrom(e.target.value)} className="w-[160px]" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Pago até</Label>
            <Input type="date" value={fPaidTo} onChange={e => setFPaidTo(e.target.value)} className="w-[160px]" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => {
            setFTech("all"); setFPeriodType("all"); setFStatus("all"); setFPaidFrom(""); setFPaidTo("");
          }}>Limpar</Button>
          <Button size="sm" className="ml-auto" onClick={openManualDialog}>
            <Plus className="w-4 h-4 mr-1" /> Criar lote manual
          </Button>
        </CardContent>
      </Card>

      {/* Batch list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4" /> Lotes de Pagamento aos Técnicos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : visibleGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem lotes para os filtros aplicados.</p>
          ) : visibleGroups.map(g => {
            const isOpen = !!expanded[g.key];
            const sortedItems = [...g.items].sort((a, b) =>
              (a.scheduled_date || "").localeCompare(b.scheduled_date || "")
            );
            return (
              <Collapsible key={g.key} open={isOpen} onOpenChange={(v) => setExpanded(s => ({ ...s, [g.key]: v }))}>
                <div className="border rounded-lg">
                  <div className="w-full flex items-center gap-3 p-3 hover:bg-muted/40">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{g.technician_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {g.label} · {g.serviceCount} serviço(s)
                        {g.paid_at ? ` · pago em ${new Date(g.paid_at).toLocaleDateString("pt-PT")}` : ""}
                        {g.approval_ids.length > 0 ? " · aguardando aprovação do gestor" : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary tabular-nums">{fmtEUR(g.officialTotal)}</div>
                      <div className="mt-1">{statusBadge(g.status)}</div>
                    </div>
                    {g.status === "open" && g.approval_ids.length > 0 && (
                      <Button size="sm" variant="outline" className="ml-2" onClick={async () => {
                        const { data, error } = await (supabase as any).rpc("aprovar_lote_repasse", { _batch_ids: g.approval_ids });
                        if (error) { toast({ title: "Não foi possível aprovar", description: error.message, variant: "destructive" }); return; }
                        toast({ title: `Lote aprovado (${data} registro(s))` });
                        load();
                      }}>
                        Aprovar lote
                      </Button>
                    )}
                    {g.status === "open" && g.approval_ids.length === 0 && (
                      <Button size="sm" className="ml-2" onClick={() => setPayGroup(g)}>
                        Registrar pagamento
                      </Button>
                    )}
                    {g.status === "paid" && (
                      <Button variant="ghost" size="sm" className="ml-2" onClick={async () => {
                        const { data: rows } = await supabase
                          .from("technician_payout_batches" as any)
                          .select("payment_proof_path")
                          .in("id", g.batch_ids)
                          .not("payment_proof_path", "is", null)
                          .limit(1);
                        const path = (rows as any[] | null)?.[0]?.payment_proof_path;
                        if (!path) { toast({ title: "Sem comprovante anexado neste pagamento." }); return; }
                        const { data: signed, error } = await supabase.storage.from("payout-proofs").createSignedUrl(path, 300);
                        if (error || !signed?.signedUrl) { toast({ title: "Não foi possível abrir o comprovante", variant: "destructive" }); return; }
                        window.open(signed.signedUrl, "_blank", "noopener");
                      }}>
                        Ver comprovante
                      </Button>
                    )}
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="ml-2 gap-1">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        Ver detalhes
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <div className="border-t p-3 bg-muted/20">
                      {sortedItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem serviços neste lote.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-muted-foreground text-xs">
                              <th className="py-1">Referência</th>
                              <th className="py-1">Cliente</th>
                              <th className="py-1">Data</th>
                              <th className="py-1">Status</th>
                              <th className="py-1 text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedItems.map(i => (
                              <tr key={i.id} className="border-t border-border/40">
                                <td className="py-1 font-mono text-xs">{i.reference || "—"}</td>
                                <td className="py-1 text-xs">{i.customer_name || "—"}</td>
                                <td className="py-1">{i.scheduled_date ? new Date(i.scheduled_date + "T00:00:00").toLocaleDateString("pt-PT") : "—"}</td>
                                <td className="py-1 text-xs">{i.service_status || "—"}</td>
                                <td className="py-1 text-right tabular-nums">{fmtEUR(i.official_amount)}</td>
                              </tr>
                            ))}
                            <tr className="border-t font-semibold bg-muted/30">
                              <td className="py-1" colSpan={4}>Total</td>
                              <td className="py-1 text-right tabular-nums text-primary">{fmtEUR(g.officialTotal)}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                      {g.paid_at && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Pagamento: {new Date(g.paid_at).toLocaleString("pt-PT")} {g.payment_method ? `· ${g.payment_method}` : ""}
                        </div>
                      )}
                      {g.batch_ids.length > 1 && (
                        <div className="mt-1 text-[11px] text-muted-foreground italic">
                          Cartão consolidado de {g.batch_ids.length} lotes com mesmo técnico/período/status.
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Manual Batch Dialog */}
      <BatchPaymentDialog
        open={!!payGroup}
        onOpenChange={(v) => { if (!v) setPayGroup(null); }}
        batchIds={payGroup?.batch_ids ?? []}
        technicianName={payGroup?.technician_name ?? ""}
        defaultAmount={payGroup?.officialTotal ?? 0}
        onSaved={() => { setPayGroup(null); load(); }}
      />

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar lote manual de pagamento</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Técnico *</Label>
              <Select value={mTech} onValueChange={setMTech}>
                <SelectTrigger><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
                <SelectContent>
                  {techOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo de período</Label>
              <Select value={mPeriodType} onValueChange={(v) => { const t = v as PeriodType; setMPeriodType(t); recomputePeriod(t, mPeriodStart || new Date().toISOString().slice(0,10)); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data inicial do período</Label>
              <Input type="date" value={mPeriodStart} onChange={e => { setMPeriodStart(e.target.value); recomputePeriod(mPeriodType, e.target.value); }} />
            </div>
            <div>
              <Label className="text-xs">Data final do período</Label>
              <Input type="date" value={mPeriodEnd} onChange={e => setMPeriodEnd(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Competência do lote (descrição)</Label>
              <Input value={mLabel} onChange={e => setMLabel(e.target.value)} placeholder="Ex.: Março/2026 ou 1.ª Quinzena de Junho/2026" />
            </div>
            <div>
              <Label className="text-xs">Vencimento / pagamento previsto</Label>
              <Input type="date" value={mDueDate} onChange={e => setMDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Status do lote</Label>
              <Select value={mStatus} onValueChange={(v) => setMStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">A pagar</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mStatus === "paid" && (
              <>
                <div>
                  <Label className="text-xs">Data real de pagamento *</Label>
                  <Input type="date" value={mPaidAt} onChange={e => setMPaidAt(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Forma de pagamento</Label>
                  <Input value={mMethod} onChange={e => setMMethod(e.target.value)} placeholder="Transferência, MB Way…" />
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea value={mNotes} onChange={e => setMNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">Serviços do técnico</h4>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={mIncludeAlreadyPaid} onCheckedChange={(v) => setMIncludeAlreadyPaid(!!v)} />
                Incluir serviços já pagos (correção retroativa)
              </label>
            </div>
            {!mTech ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded">Selecione um técnico para listar os serviços.</p>
            ) : mLoadingElig ? (
              <p className="text-sm text-muted-foreground py-4 text-center">A carregar serviços…</p>
            ) : visibleEligible.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded">Sem serviços disponíveis para este técnico.</p>
            ) : (
              <div className="border rounded max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left text-xs">
                      <th className="p-2 w-8"><Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} aria-label="Selecionar todos" /></th>
                      <th className="p-2">Referência</th>
                      <th className="p-2">Data</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Lote atual</th>
                      <th className="p-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEligible.map(s => {
                      const isPaid = !!s.baixa_received_at;
                      return (
                        <tr key={s.id} className="border-t hover:bg-muted/20">
                          <td className="p-2"><Checkbox checked={!!mSelected[s.id]} onCheckedChange={(v) => setMSelected(prev => ({ ...prev, [s.id]: !!v }))} /></td>
                          <td className="p-2 font-mono text-xs">{formatServiceReference(s as any)}</td>
                          <td className="p-2">{s.scheduled_date ? new Date(s.scheduled_date + "T00:00:00").toLocaleDateString("pt-PT") : "—"}</td>
                          <td className="p-2 text-xs">
                            {isPaid ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Pago</Badge>
                              : <Badge className="bg-amber-100 text-amber-800 border-amber-300">Liberado p/ Pgto</Badge>}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">{s.batch_label || "—"}</td>
                          <td className="p-2 text-right tabular-nums">{fmtEUR(s.technician_payout)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {aguardandoPrazo.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {aguardandoPrazo.length} serviço(s) recebido(s) ainda aguardam o prazo de 5 dias após a conclusão. Entram aqui quando o prazo vencer.
              </p>
            )}
            <div className="flex justify-end items-center mt-2 text-sm">
              <span className="text-muted-foreground mr-2">Total selecionado:</span>
              <span className="font-bold text-primary tabular-nums">{fmtEUR(selectedTotal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setManualOpen(false)} disabled={mSaving}>Cancelar</Button>
            <Button onClick={saveManualBatch} disabled={mSaving}>{mSaving ? "A guardar…" : "Salvar lote"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default TechnicianPayoutBatches;
