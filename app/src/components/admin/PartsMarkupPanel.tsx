import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PARTS_MARKUP_DEFAULT_PCT, isValidPartsMarkup, applyPartsMarkup } from "@/lib/parts-markup";

const KEY = "parts_markup_pct";

export const PartsMarkupPanel: React.FC = () => {
  const [pct, setPct] = useState("");
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
      else setPct(String(data ? Number((data as any).value) : PARTS_MARKUP_DEFAULT_PCT));
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const value = Number(String(pct).replace(",", "."));

  const save = async () => {
    if (!isValidPartsMarkup(value)) {
      toast.error("Informe um percentual entre 0 e 100.");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("platform_settings" as any)
      .insert({ key: KEY, value, created_by: user?.id ?? null } as any);
    setSaving(false);
    if (error) { toast.error("Não foi possível guardar: " + error.message); return; }
    toast.success("Margem guardada. Vale para as peças lançadas a partir de agora.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Margem sobre peças</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Percentual acrescentado ao custo da peça no valor cobrado ao cliente. O técnico informa
          só o custo e o sistema calcula o valor para o cliente. Cada peça guarda o percentual
          usado no lançamento; mudar aqui não altera peças já lançadas.
        </p>
        {loadError ? (
          <p className="text-sm text-destructive">Não foi possível carregar o valor atual.</p>
        ) : (
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="parts-markup">Percentual (%)</Label>
            <Input
              id="parts-markup"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.5}
              value={pct}
              disabled={loading}
              placeholder={loading ? "A carregar..." : ""}
              onChange={(e) => setPct(e.target.value)}
            />
            {isValidPartsMarkup(value) && (
              <p className="text-xs text-muted-foreground">
                Exemplo: peça de €100,00 de custo fica em €{applyPartsMarkup(100, value).toFixed(2)} para o cliente.
              </p>
            )}
          </div>
        )}
        <Button onClick={save} disabled={saving || loading || loadError}>
          {saving ? "A guardar..." : "Guardar"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default PartsMarkupPanel;
