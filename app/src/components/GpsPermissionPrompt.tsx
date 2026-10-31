import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { safeStorage } from "@/lib/safeStorage";

interface Props {
  userId: string;
  role?: "customer" | "technician";
  className?: string;
}

/**
 * Asks the customer for GPS permission so the technician's ETA can be
 * calculated relative to their location. Shown when the profile has no
 * gps_lat/gps_lng yet and the user hasn't dismissed the prompt recently.
 */
const GpsPermissionPrompt = ({ userId, role = "customer", className = "mb-6" }: Props) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("gps_lat, gps_lng, gps_consent_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const hasGps = data?.gps_lat != null && data?.gps_lng != null;
      const dismissedAt = Number(safeStorage.getItem(`gps-prompt-dismissed-${userId}`) || 0);
      const recentlyDismissed = dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
      if (!hasGps && !recentlyDismissed) setShow(true);
    };
    check();
    return () => { cancelled = true; };
  }, [userId]);

  const grant = async () => {
    if (!("geolocation" in navigator)) {
      toast.error(t("error_geolocation_unsupported"));
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { error } = await supabase
          .from("profiles")
          .update({
            gps_lat: pos.coords.latitude,
            gps_lng: pos.coords.longitude,
            gps_consent_at: new Date().toISOString(),
          } as any)
          .eq("user_id", userId);
        setBusy(false);
        if (error) { toast.error(t("error_save_location")); return; }
        toast.success(t("location_saved"));
        setShow(false);
      },
      (err) => {
        setBusy(false);
        toast.error(err.message || t("error_gps_denied"));
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const dismiss = () => {
    safeStorage.setItem(`gps-prompt-dismissed-${userId}`, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className={`flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 animate-fade-in ${className}`}>
      <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <p className="text-sm font-semibold text-foreground">{t("gps_prompt_title") || "Permitir acesso à sua localização"}</p>
        <p className="text-xs text-muted-foreground">
          {role === "technician"
            ? (t("gps_prompt_tech_desc") || "Ao partilhar a sua localização, o cliente e o gestor conseguem ver o tempo estimado de chegada quando clicar em 'Estou a caminho'.")
            : (t("gps_prompt_desc") || "Ao partilhar a sua localização, o técnico consegue calcular o tempo estimado de chegada ao seu endereço.")}
        </p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="h-8 text-xs" onClick={grant} disabled={busy}>
            <MapPin className="w-3.5 h-3.5 mr-1" />
            {busy ? (t("gps_prompt_requesting") || "A pedir permissão...") : (t("gps_prompt_allow") || "Permitir GPS")}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={dismiss}>
            <X className="w-3.5 h-3.5 mr-1" />{t("gps_prompt_dismiss") || "Agora não"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GpsPermissionPrompt;
