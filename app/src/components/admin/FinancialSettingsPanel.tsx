import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const FinancialSettingsPanel: React.FC = () => {
  const [rowId, setRowId] = useState<string | null>(null);
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("mileage_settings")
        .select("id, rate_per_km")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (error) setLoadError(true);
      else if (data) { setRowId(data.id); setRate(String(data.rate_per_km)); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const save = async () => {
    const value = Number(rate.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || value > 5) {
      toast.error("Informe uma taxa entre 0,01 e 5,00 € por km.");
      return;
    }
    setSaving(true);
    if (rowId) {
      const { error } = await supabase.from("mileage_settings").update({ rate_per_km: value }).eq("id", rowId);
      setSaving(false);
      if (error) { toast.error("Não foi possível guardar: " + error.message); return; }
    } else {
      const { data, error } = await supabase.from("mileage_settings").insert({ rate_per_km: value }).select("id").single();
      setSaving(false);
      if (error) { toast.error("Não foi possível guardar: " + error.message); return; }
      setRowId(data.id);
    }
    toast.success("Taxa de quilometragem guardada.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Taxa de quilometragem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Valor por quilómetro que o técnico recebe pelos deslocamentos. É o mesmo valor usado na tela
          de quilometragem do técnico.
        </p>
        {loadError ? (
          <p className="text-sm text-destructive">Não foi possível carregar a taxa atual.</p>
        ) : (
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="rate-km">€ por km</Label>
            <Input
              id="rate-km"
              type="text"
              inputMode="decimal"
              value={rate}
              disabled={loading}
              placeholder={loading ? "A carregar..." : "0,40"}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        )}
        <Button onClick={save} disabled={saving || loading || loadError}>
          {saving ? "A guardar..." : "Guardar"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FinancialSettingsPanel;
