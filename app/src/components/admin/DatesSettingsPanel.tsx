import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const KEY = "min_hours_before_service_change";

export const DatesSettingsPanel: React.FC = () => {
  const [hours, setHours] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("platform_settings" as any)
        .select("value")
        .eq("key", KEY)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (error) setLoadError(true);
      else if (data) setHours(String((data as any).value));
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const save = async () => {
    const value = Number(hours);
    if (!Number.isInteger(value) || value < 1 || value > 168) {
      toast.error("Informe um número inteiro de horas entre 1 e 168.");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("platform_settings" as any)
      .insert({ key: KEY, value, created_by: user?.id ?? null } as any);
    setSaving(false);
    if (error) { toast.error("Não foi possível guardar: " + error.message); return; }
    toast.success("Antecedência guardada. Vale para as ações feitas a partir de agora.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Antecedência para cancelar ou reagendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Quantas horas antes do serviço o cliente ainda pode cancelar ou reagendar. Vale para o
          cancelamento, o reagendamento e o retorno de garantia. Cada alteração fica guardada como
          nova versão, com data e autor.
        </p>
        {loadError ? (
          <p className="text-sm text-destructive">Não foi possível carregar o valor atual.</p>
        ) : (
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="min-hours">Horas de antecedência</Label>
            <Input
              id="min-hours"
              type="number"
              inputMode="numeric"
              min={1}
              max={168}
              step={1}
              value={hours}
              disabled={loading}
              placeholder={loading ? "A carregar..." : ""}
              onChange={(e) => setHours(e.target.value)}
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

export default DatesSettingsPanel;
