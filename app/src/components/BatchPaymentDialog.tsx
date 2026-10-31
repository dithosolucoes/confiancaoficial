import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Lotes em aberto do técnico que serão marcados como pagos. */
  batchIds: string[];
  technicianName: string;
  defaultAmount: number;
  onSaved: () => void;
}

const METHODS = [
  { value: "transferencia", label: "Transferência bancária" },
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outro", label: "Outro" },
];

const fmt = (n: number) => `€${n.toFixed(2)}`;

/**
 * Registra o pagamento de lotes feito por fora do sistema (transferência, Pix, dinheiro).
 * Marca o lote como pago, fecha a conta a pagar, libera os serviços e lança a saída no caixa.
 * O comprovante vai para o bucket privado payout-proofs (só gestor).
 */
export const BatchPaymentDialog: React.FC<Props> = ({
  open, onOpenChange, batchIds, technicianName, defaultAmount, onSaved,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [paidDate, setPaidDate] = useState(today);
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPaidDate(today);
      setMethod("transferencia");
      setReference("");
      setFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultAmount]);

  const save = async () => {
    if (!paidDate) {
      toast({ title: "Informe a data do pagamento", variant: "destructive" });
      return;
    }
    if (batchIds.length === 0) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const paidAtISO = new Date(`${paidDate}T12:00:00`).toISOString();

      // 1) Comprovante (opcional, mas recomendado)
      let proofPath: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${batchIds[0]}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("payout-proofs").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        proofPath = path;
      }

      // 2) Lotes em aberto desses ids
      const { data: batches, error: bErr } = await supabase
        .from("technician_payout_batches" as any)
        .select("id, payable_id, status, total_amount")
        .in("id", batchIds)
        .eq("status", "open");
      if (bErr) throw bErr;
      const open = (batches as any[]) || [];
      if (open.length === 0) {
        toast({ title: "Esses lotes já estão pagos ou cancelados." });
        onOpenChange(false);
        onSaved();
        return;
      }
      const openIds = open.map(b => b.id);
      // Valor de cada lote vem do banco (não do que foi digitado na tela)
      const totalsByPayable = new Map<string, number>();
      open.forEach(b => { if (b.payable_id) totalsByPayable.set(b.payable_id, Number(b.total_amount || 0)); });
      const payableIds = Array.from(totalsByPayable.keys());
      const value = open.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

      // 3) Lotes pagos
      const { error: upBatchErr } = await supabase.from("technician_payout_batches" as any).update({
        status: "paid",
        paid_at: paidAtISO,
        payment_method: method,
        payment_reference: reference.trim() || null,
        payment_proof_path: proofPath,
      } as any).in("id", openIds);
      if (upBatchErr) throw upBatchErr;

      // 4) Contas a pagar
      for (const pid of payableIds) {
        const { error } = await supabase.from("accounts_payable" as any).update({
          status: "pago",
          paid_amount: totalsByPayable.get(pid) ?? 0,
          paid_at: paidAtISO,
          payment_method: method,
        } as any).eq("id", pid);
        if (error) throw error;
      }

      // 5) Serviços liberados para pagamento (baixa)
      const { data: items } = await supabase
        .from("technician_payout_batch_items" as any)
        .select("service_request_id")
        .in("batch_id", openIds);
      const serviceIds = ((items as any[]) || []).map(i => i.service_request_id);
      if (serviceIds.length) {
        await supabase.from("service_requests").update({ baixa_received_at: paidAtISO } as any)
          .in("id", serviceIds).is("baixa_received_at", null);
      }

      // 6) Saída no caixa, uma por conta a pagar (sem duplicar)
      for (const pid of payableIds) {
        const { data: existing } = await supabase
          .from("cash_flow_entries" as any).select("id").eq("source_payable_id", pid).maybeSingle();
        const payload: any = {
          entry_date: paidDate,
          kind: "outflow",
          description: `Pagamento Técnico ${technicianName}`,
          origin: "Pagamento de Técnico",
          category: "outros",
          payment_method: method,
          amount: totalsByPayable.get(pid) ?? 0,
          status: "pago",
          notes: reference.trim() ? `Ref.: ${reference.trim()}` : null,
        };
        if ((existing as any)?.id) {
          await supabase.from("cash_flow_entries" as any).update(payload).eq("id", (existing as any).id);
        } else {
          await supabase.from("cash_flow_entries" as any).insert({ ...payload, source_payable_id: pid, created_by: user?.id ?? null });
        }
      }

      toast({ title: "Pagamento registrado", description: `${technicianName} · ${fmt(value)}` });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao registrar pagamento", description: e.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pagamento por fora</DialogTitle>
          <DialogDescription>
            Use quando o pagamento ao técnico já foi feito fora do sistema. Fica registrado com data, método e comprovante.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>Técnico</Label>
            <Input value={technicianName} disabled />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data do pagamento *</Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div>
              <Label>Valor do lote (€)</Label>
              <Input value={fmt(defaultAmount)} disabled />
            </div>
          </div>
          <div>
            <Label>Método</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Referência (opcional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex.: nº da transferência" />
          </div>
          <div>
            <Label>Comprovante (PDF ou imagem)</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "A registrar..." : "Registrar pagamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BatchPaymentDialog;
