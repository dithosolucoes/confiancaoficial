import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Lock, Pencil, History, Save } from "lucide-react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { resolvePayoutReference, DEFAULT_PAYOUT_RATES } from "@/lib/payout";

interface Props {
  serviceId: string;
  reference: string | null;
  applianceType: string | null;
  technicianPayout: number | null;
  locked: boolean;
  overridden: boolean;
  onUpdated?: () => void;
}

interface AuditRow {
  id: string;
  old_amount: number | null;
  new_amount: number;
  changed_at: string;
  reason: string | null;
  changed_by: string | null;
}

const parseNum = (v: string) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const GestorServicePayoutEditor = ({
  serviceId,
  reference,
  applianceType,
  technicianPayout,
  locked,
  overridden,
  onUpdated,
}: Props) => {
  const ref = resolvePayoutReference(reference, applianceType);
  const fallback = ref ? DEFAULT_PAYOUT_RATES[ref] : 0;
  const [value, setValue] = useState<string>(
    technicianPayout != null ? String(technicianPayout) : String(fallback),
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("technician_payout_audit")
        .select("id, old_amount, new_amount, changed_at, reason, changed_by")
        .eq("service_request_id", serviceId)
        .order("changed_at", { ascending: false });
      setAudit((data as AuditRow[]) || []);
    })();
  }, [serviceId]);

  const save = async () => {
    const newAmount = parseNum(value);
    if (!Number.isFinite(newAmount) || newAmount < 0) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const oldAmount = technicianPayout;

    const { error: updErr } = await supabase
      .from("service_requests")
      .update({
        technician_payout: newAmount,
        technician_payout_overridden: true,
      })
      .eq("id", serviceId);

    if (updErr) {
      setSaving(false);
      toast.error("Falha: " + updErr.message);
      return;
    }

    await supabase.from("technician_payout_audit").insert({
      service_request_id: serviceId,
      old_amount: oldAmount,
      new_amount: newAmount,
      changed_by: userData.user?.id,
      reason: reason.trim() || null,
    });

    const { data: a } = await supabase
      .from("technician_payout_audit")
      .select("id, old_amount, new_amount, changed_at, reason, changed_by")
      .eq("service_request_id", serviceId)
      .order("changed_at", { ascending: false });
    setAudit((a as AuditRow[]) || []);
    setReason("");
    setSaving(false);
    toast.success("Pagamento do técnico actualizado");
    onUpdated?.();
  };

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-2">
          Pagamento ao Técnico
          {locked && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Lock className="w-3 h-3" /> Bloqueado
            </Badge>
          )}
          {overridden && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Pencil className="w-3 h-3" /> Manual
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          Ref. {ref || "—"} · padrão € {fallback.toFixed(2)}
        </span>
      </div>

      {locked ? (
        <p className="text-sm">
          Valor pago: <strong>€ {Number(technicianPayout || 0).toFixed(2)}</strong>
          <span className="text-xs text-muted-foreground ml-2">
            (validado pelo cliente — não editável)
          </span>
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Valor (€)</Label>
              <Input
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Motivo (opcional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1">
              <Save className="w-3.5 h-3.5" />
              {saving ? "..." : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      {audit.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="text-xs flex items-center gap-1 text-primary hover:underline">
            <History className="w-3 h-3" /> Histórico de alterações ({audit.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-1">
            {audit.map((a) => (
              <div key={a.id} className="text-xs border-l-2 border-primary/40 pl-2">
                <span className="font-medium">
                  {new Date(a.changed_at).toLocaleString("pt-PT")}
                </span>{" "}
                — € {Number(a.old_amount || 0).toFixed(2)} →{" "}
                <strong>€ {Number(a.new_amount).toFixed(2)}</strong>
                {a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default GestorServicePayoutEditor;
