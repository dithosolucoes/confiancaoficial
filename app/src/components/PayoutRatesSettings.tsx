import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
const parseLocaleNumber = (v: string) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
import { DEFAULT_PAYOUT_RATES, PayoutReference } from "@/lib/payout";
import { Euro, Save } from "lucide-react";

interface Row {
  reference: PayoutReference;
  amount: number;
  updated_at: string | null;
  updated_by: string | null;
}

const REFS: PayoutReference[] = ["WO", "SR", "CO"];

const PayoutRatesSettings = () => {
  const [rows, setRows] = useState<Record<PayoutReference, Row>>({
    WO: { reference: "WO", amount: DEFAULT_PAYOUT_RATES.WO, updated_at: null, updated_by: null },
    SR: { reference: "SR", amount: DEFAULT_PAYOUT_RATES.SR, updated_at: null, updated_by: null },
    CO: { reference: "CO", amount: DEFAULT_PAYOUT_RATES.CO, updated_at: null, updated_by: null },
  });
  const [editValues, setEditValues] = useState<Record<PayoutReference, string>>({
    WO: String(DEFAULT_PAYOUT_RATES.WO),
    SR: String(DEFAULT_PAYOUT_RATES.SR),
    CO: String(DEFAULT_PAYOUT_RATES.CO),
  });
  const [saving, setSaving] = useState<PayoutReference | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("technician_payout_rates")
      .select("reference, amount, updated_at, updated_by");
    if (data) {
      const next: any = { ...rows };
      const nextEdit: any = { ...editValues };
      for (const r of data as any[]) {
        if (REFS.includes(r.reference)) {
          next[r.reference] = r;
          nextEdit[r.reference] = String(r.amount);
        }
      }
      setRows(next);
      setEditValues(nextEdit);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (ref: PayoutReference) => {
    const value = parseLocaleNumber(editValues[ref]);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(ref);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("technician_payout_rates")
      .upsert({
        reference: ref,
        amount: value,
        updated_by: userData.user?.id,
        updated_at: new Date().toISOString(),
      });
    setSaving(null);
    if (error) {
      toast.error("Falha ao guardar: " + error.message);
    } else {
      toast.success(`Valor ${ref} actualizado para € ${value.toFixed(2)}`);
      load();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Euro className="w-4 h-4" /> Remuneração do Técnico por Referência
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Valores pagos automaticamente ao técnico após a validação do serviço pelo cliente. Apenas o
          Gestor pode editar.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {REFS.map((ref) => (
          <div
            key={ref}
            className="flex flex-col sm:flex-row sm:items-end gap-3 p-3 border rounded-lg"
          >
            <div className="flex-1">
              <Label className="text-xs">Referência</Label>
              <p className="font-mono font-semibold text-lg">{ref}</p>
            </div>
            <div className="flex-1">
              <Label className="text-xs">Valor (€)</Label>
              <Input
                inputMode="decimal"
                value={editValues[ref]}
                onChange={(e) => setEditValues({ ...editValues, [ref]: e.target.value })}
              />
            </div>
            <div className="flex-1 text-xs text-muted-foreground">
              {rows[ref].updated_at && (
                <>
                  Última alteração:
                  <br />
                  {new Date(rows[ref].updated_at!).toLocaleString("pt-PT")}
                </>
              )}
            </div>
            <Button onClick={() => save(ref)} disabled={saving === ref} size="sm" className="gap-1">
              <Save className="w-3.5 h-3.5" />
              {saving === ref ? "A guardar..." : "Guardar"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default PayoutRatesSettings;
