import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Lê o valor vigente (versão mais recente) de um parâmetro numérico de platform_settings.
// Enquanto carrega, ou se a leitura falhar, usa o valor padrão que o código já aplicava.
export const usePlatformSettingNumber = (key: string, fallback: number): number => {
  const [value, setValue] = useState<number>(fallback);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("platform_settings" as any)
        .select("value")
        .eq("key", key)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active || error || !data) return;
      const v = Number((data as any).value);
      if (Number.isFinite(v)) setValue(v);
    })();
    return () => { active = false; };
  }, [key]);

  return value;
};

export default usePlatformSettingNumber;
