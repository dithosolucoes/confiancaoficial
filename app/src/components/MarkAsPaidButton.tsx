import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, BadgeEuro } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface Props {
  service: any;
  suggestedAmount: number;
  deslocacaoAlreadyPaid?: boolean;
  deslocacaoAmount?: number;
  onPaid?: () => void;
}

const METHODS: { value: string; label: string }[] = [
  { value: "bank_transfer", label: "Transferência Bancária" },
  { value: "mbway", label: "MB Way" },
  { value: "cash", label: "Dinheiro" },
  { value: "multibanco", label: "Multibanco" },
  { value: "other", label: "Outro" },
];

const methodLabel = (m?: string | null) => {
  if (!m) return "—";
  if (m === "stripe_link") return "Link Stripe";
  return METHODS.find((x) => x.value === m)?.label || m;
};

export default function MarkAsPaidButton({ service, suggestedAmount, deslocacaoAlreadyPaid, deslocacaoAmount, onPaid }: Props) {
  const { profile, user } = useAuth();
  const isGestor = profile?.user_type === "gestor";
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<string>("bank_transfer");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>(suggestedAmount.toFixed(2).replace(".", ","));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount(suggestedAmount.toFixed(2).replace(".", ","));
    }
  }, [open, suggestedAmount]);

  if (!isGestor) return null;

  const isPaid = !!service?.quote_paid_at;
  const source = service?.quote_payment_source as string | undefined;

  if (isPaid) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 mt-2 space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {source === "manual" ? "Pago manualmente pelo gestor" : "Pago pelo link"}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div>Data: {format(new Date(service.quote_paid_at), "dd/MM/yyyy HH:mm")}</div>
          {service.quote_payment_method && <div>Método: {methodLabel(service.quote_payment_method)}</div>}
          {service.quote_payment_amount != null && <div>Valor: €{Number(service.quote_payment_amount).toFixed(2)}</div>}
          {service.quote_payment_note && <div>Obs.: {service.quote_payment_note}</div>}
        </div>
      </div>
    );
  }

  const handleConfirm = async () => {
    if (!user?.id) return;
    const parsed = Number(String(amount).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setSaving(true);
    // Passa pelo ponto único de pagamento (lançamento no ledger + divergência se o valor for diferente)
    const { error } = await (supabase as any).rpc("registrar_pagamento_manual", {
      _service_id: service.id,
      _payment_type: "quote",
      _amount: parsed,
      _expected_amount: suggestedAmount,
      _method: method,
      _reference: null,
      _note: note || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erro ao marcar como pago");
      return;
    }
    toast.success("Pagamento registado");
    setOpen(false);
    onPaid?.();
  };

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 mt-2 flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
        <BadgeEuro className="w-3.5 h-3.5" /> Pagamento pendente
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="default" className="h-7 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Marcar como Pago
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registar pagamento manual</DialogTitle>
            <DialogDescription>
              Use esta opção apenas quando o pagamento foi feito fora do link Stripe (transferência, MB Way, dinheiro, etc.).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {deslocacaoAlreadyPaid && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                ✓ Deslocação já paga{typeof deslocacaoAmount === "number" && deslocacaoAmount > 0 ? ` (€${deslocacaoAmount.toFixed(2)})` : ""} no link inicial — o valor sugerido inclui apenas Peças + Adicionais + Mão de Obra.
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Método de pagamento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor pago (€)</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observação (opcional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: Transferência recebida no IBAN xxxx"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? "A guardar..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
