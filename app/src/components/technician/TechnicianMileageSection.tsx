import React, { useState, useEffect, useCallback } from "react";
import { Compass, Car, Play, Square, MapPin, Euro, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { safeStorage } from "@/lib/safeStorage";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

interface TechnicianMileageSectionProps {
  technicianId?: string;
}

// Taxa de reembolso e totais vêm de dados reais (mileage_settings e mileage_trips),
// nunca de valor fixo no código — ver blueprint, achado de 29/10 (valores 0,36€/42,5km/318km
// eram fabricados e nunca refletiam o banco; a inserção do trajeto também falhava
// silenciosamente, porque "service" não é um trip_type válido na tabela).
export const TechnicianMileageSection: React.FC<TechnicianMileageSectionProps> = ({
  technicianId = "tech-current",
}) => {
  const { t } = useTranslation();
  const [isTripActive, setIsTripActive] = useState(false);
  const [tripStartKm, setTripStartKm] = useState("");
  const [tripEndKm, setTripEndKm] = useState("");
  const [tripStartedAt, setTripStartedAt] = useState<string | null>(null);
  const [todayKm, setTodayKm] = useState(0);
  const [monthKm, setMonthKm] = useState(0);
  const [refundRate, setRefundRate] = useState<number | null>(null);
  const [loadingTotals, setLoadingTotals] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const activeTripKey = `tech_active_trip_${technicianId}`;

  const fetchRate = useCallback(async () => {
    const { data, error } = await supabase
      .from("mileage_settings")
      .select("rate_per_km")
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Erro ao carregar a taxa de reembolso:", error);
      setRefundRate(null);
      return;
    }
    setRefundRate(data ? Number(data.rate_per_km) : null);
  }, []);

  const fetchTotals = useCallback(async () => {
    if (!technicianId) return;
    setLoadingTotals(true);
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [todayRes, monthRes] = await Promise.all([
        supabase
          .from("mileage_trips")
          .select("distance_km")
          .eq("technician_id", technicianId)
          .gte("started_at", startOfToday),
        supabase
          .from("mileage_trips")
          .select("distance_km")
          .eq("technician_id", technicianId)
          .gte("started_at", startOfMonth),
      ]);

      if (todayRes.error) throw todayRes.error;
      if (monthRes.error) throw monthRes.error;

      setTodayKm((todayRes.data || []).reduce((acc, r: any) => acc + Number(r.distance_km || 0), 0));
      setMonthKm((monthRes.data || []).reduce((acc, r: any) => acc + Number(r.distance_km || 0), 0));
    } catch (err) {
      console.error("Erro ao carregar a quilometragem:", err);
      toast.error(t("tech_mileage_load_error"));
    } finally {
      setLoadingTotals(false);
    }
  }, [technicianId, t]);

  useEffect(() => {
    fetchRate();
    fetchTotals();
  }, [fetchRate, fetchTotals]);

  useEffect(() => {
    const active = safeStorage.getItem(activeTripKey);
    if (active) {
      try {
        const parsed = JSON.parse(active);
        setIsTripActive(true);
        setTripStartKm(String(parsed.startKm));
        setTripStartedAt(parsed.startedAt || null);
      } catch {
        // ignore
      }
    }
  }, [activeTripKey]);

  const handleStartTrip = () => {
    const parsed = parseFloat(tripStartKm.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      toast.error(t("tech_mileage_invalid_start_km"));
      return;
    }

    const startedAt = new Date().toISOString();
    const trip = { startKm: parsed, startedAt };
    safeStorage.setItem(activeTripKey, JSON.stringify(trip));
    setIsTripActive(true);
    setTripStartedAt(startedAt);
    toast.success(t("tech_mileage_trip_started"));
  };

  const handleStopTrip = async () => {
    const end = parseFloat(tripEndKm.replace(",", "."));
    const start = parseFloat(tripStartKm.replace(",", "."));

    if (isNaN(end) || end <= start) {
      toast.error(t("tech_mileage_end_km_must_exceed_start"));
      return;
    }

    const distance = end - start;
    const rate = refundRate ?? 0;

    setIsSaving(true);
    try {
      // trip_type: a tabela só aceita office_to_client | client_to_client | client_to_office.
      // Este registo rápido não distingue origem/destino, então usamos client_to_client
      // como valor neutro — ver nota no topo do ficheiro.
      const { error } = await supabase.from("mileage_trips").insert({
        technician_id: technicianId,
        distance_km: distance,
        trip_type: "client_to_client",
        started_at: tripStartedAt || new Date().toISOString(),
        ended_at: new Date().toISOString(),
      } as any);
      if (error) throw error;

      safeStorage.removeItem(activeTripKey);
      setIsTripActive(false);
      setTripStartKm("");
      setTripEndKm("");
      setTripStartedAt(null);
      await fetchTotals();
      toast.success(
        t("tech_mileage_trip_completed", { km: distance.toFixed(1), refund: (distance * rate).toFixed(2) })
      );
    } catch (err) {
      console.error("Erro ao gravar o trajeto:", err);
      toast.error(t("tech_mileage_save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
              {t("tech_mileage_heading")}
            </CardTitle>
            <p className="text-xs text-slate-500">
              {refundRate === null ? (
                t("tech_mileage_rate_unavailable")
              ) : (
                <>
                  {t("tech_mileage_rate_label")}: <strong>€{refundRate.toFixed(2)} / km</strong>
                </>
              )}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 font-medium uppercase">{t("tech_mileage_today")}</span>
            <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              {loadingTotals ? "…" : todayKm.toFixed(1)} <span className="text-xs font-normal text-slate-400">km</span>
            </div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 font-medium uppercase">{t("tech_mileage_this_month")}</span>
            <div className="text-lg font-bold text-blue-600 mt-0.5">
              {loadingTotals ? "…" : monthKm.toFixed(1)} <span className="text-xs font-normal text-slate-400">km</span>
            </div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 font-medium uppercase">{t("tech_mileage_refund_today")}</span>
            <div className="text-lg font-bold text-emerald-600 mt-0.5">
              {loadingTotals || refundRate === null ? "—" : `€${(todayKm * refundRate).toFixed(2)}`}
            </div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 font-medium uppercase">{t("tech_mileage_refund_month")}</span>
            <div className="text-lg font-bold text-emerald-600 mt-0.5">
              {loadingTotals || refundRate === null ? "—" : `€${(monthKm * refundRate).toFixed(2)}`}
            </div>
          </div>
        </div>

        {/* Odometer Form */}
        <div className="p-3.5 bg-slate-100/70 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Car className="w-4 h-4 text-slate-600" /> {t("tech_mileage_quick_log")}
            </span>
            {isTripActive && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> {t("tech_mileage_trip_in_progress")}
              </span>
            )}
          </div>

          {!isTripActive ? (
            <div className="flex flex-col sm:flex-row gap-2.5 items-end">
              <div className="flex-1 w-full">
                <Label className="text-xs text-slate-600">{t("tech_mileage_start_km_label")}</Label>
                <Input
                  type="number"
                  placeholder={t("tech_mileage_start_km_placeholder")}
                  value={tripStartKm}
                  onChange={(e) => setTripStartKm(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <Button
                size="sm"
                className="h-8 text-xs bg-emerald-600 text-white hover:bg-emerald-700 gap-1.5 w-full sm:w-auto"
                onClick={handleStartTrip}
              >
                <Play className="w-3.5 h-3.5" /> {t("tech_mileage_start_trip")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2.5 items-end">
              <div className="w-full sm:w-1/3">
                <Label className="text-xs text-slate-500">{t("tech_mileage_start_km_short_label")}</Label>
                <div className="h-8 text-xs font-mono font-bold flex items-center px-2 bg-slate-200/60 dark:bg-slate-800 rounded mt-1">
                  {tripStartKm} km
                </div>
              </div>
              <div className="flex-1 w-full">
                <Label className="text-xs text-slate-600">{t("tech_mileage_end_km_label")}</Label>
                <Input
                  type="number"
                  placeholder={t("tech_mileage_end_km_placeholder")}
                  value={tripEndKm}
                  onChange={(e) => setTripEndKm(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <Button
                size="sm"
                className="h-8 text-xs bg-red-600 text-white hover:bg-red-700 gap-1.5 w-full sm:w-auto"
                onClick={handleStopTrip}
                disabled={isSaving}
              >
                <Square className="w-3.5 h-3.5" /> {isSaving ? t("tech_mileage_saving") : t("tech_mileage_finish_and_log")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TechnicianMileageSection;
