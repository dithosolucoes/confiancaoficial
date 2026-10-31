import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { startOutboxAutoFlush } from "@/lib/technicianOutbox";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import {
  Wrench,
  CheckCircle,
  History,
  Wallet,
  Compass,
  Search,
  X,
  Loader2,
  Calendar,
  Sparkles,
} from "lucide-react";
import TechnicianJobCard from "./technician/TechnicianJobCard";
import TechnicianMileageSection from "./technician/TechnicianMileageSection";
import TechnicianScheduleTab from "./technician/TechnicianScheduleTab";
import TechnicianPayoutsTab from "./technician/TechnicianPayoutsTab";
import TechnicianProfileDialog from "./TechnicianProfileDialog";

export const TechnicianDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  // Campos extra do técnico (gravados em profiles pela migration de técnico).
  const profileExtra = profile as unknown as { surname?: string | null; iban?: string | null; phone?: string | null; emergency_contact?: string | null; address?: string | null } | null;
  const technicianProfileInitial = useMemo(() => ({
    full_name: profile?.full_name ?? "",
    surname: profileExtra?.surname ?? "",
    address: profileExtra?.address ?? "",
    email: user?.email ?? "",
    iban: profileExtra?.iban ?? "",
    phone: profileExtra?.phone ?? "",
    emergency_contact: profileExtra?.emergency_contact ?? "",
  }), [profile, profileExtra, user]);
  const [activeTab, setActiveTab] = useState("my-jobs");
  const [loading, setLoading] = useState(true);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [materials, setMaterials] = useState<Record<string, any[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  // Somente dados reais. Falha de leitura aparece para o técnico; nunca há dado inventado.
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const [servicesRes, materialsRes] = await Promise.all([
        supabase
          .from("service_requests")
          .select("*")
          .is("deleted_at", null)
          .order("scheduled_date", { ascending: false }),
        supabase.from("service_materials").select("*"),
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (materialsRes.error) throw materialsRes.error;

      setAllServices(servicesRes.data || []);

      const map: Record<string, any[]> = {};
      (materialsRes.data || []).forEach((m: any) => {
        if (!map[m.service_request_id]) map[m.service_request_id] = [];
        map[m.service_request_id].push(m);
      });
      setMaterials(map);
    } catch (err) {
      console.error("Erro ao carregar ordens do técnico:", err);
      toast.error("Não foi possível carregar suas ordens. Verifique a conexão.");
      setAllServices([]);
      setMaterials({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Reenvia o que ficou na fila offline ao reconectar.
  useEffect(() => {
    return startOutboxAutoFlush(() => {
      fetchJobs();
    });
  }, [fetchJobs]);

  const currentUserId = user?.id ?? "";

  // Filtros de Ordens
  const pendingAvailable = allServices.filter(
    (s) => s.status === "pending" && (!s.technician_id || s.technician_id === currentUserId)
  );

  const myActiveJobs = allServices.filter(
    (s) =>
      s.technician_id === currentUserId &&
      (s.status === "accepted" ||
        s.status === "in_progress" ||
        s.status === "budgeting" ||
        s.status === "quote_accepted")
  );

  const completedJobs = allServices.filter(
    (s) => s.technician_id === currentUserId && s.status === "completed"
  );

  const handleSearch = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const found = allServices.find(
      (s) =>
        (s.reference && s.reference.toLowerCase().includes(q)) ||
        (s.contact_phone && s.contact_phone.includes(q)) ||
        (s.contact_name && s.contact_name.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q))
    );
    setSearchResult(found || "not_found");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col pb-16">
      <AppHeader />

      <main className="container mx-auto px-4 py-6 max-w-5xl flex-1 space-y-6">
        {/* Banner do Perfil Técnico */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-lg">
                <Wrench className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {profile?.full_name || t("tech_dashboard_fallback_name")}
                </h1>
                <p className="text-xs text-slate-500">
                  {t("tech_dashboard_subtitle")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setProfileDialogOpen(true)}
            >
              {t("tech_dashboard_my_profile")}
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
              onClick={fetchJobs}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("tech_dashboard_refresh")}
            </Button>
          </div>
        </div>

        {/* Barra de Pesquisa Rápida */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder={t("tech_dashboard_search_placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9 h-9 text-xs bg-white dark:bg-slate-900"
              />
            </div>
            <Button size="sm" className="h-9 text-xs" onClick={handleSearch}>
              {t("tech_dashboard_search_button")}
            </Button>
            {searchResult && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs"
                onClick={() => {
                  setSearchResult(null);
                  setSearchQuery("");
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {searchResult && (
            <div className="mt-3">
              {searchResult === "not_found" ? (
                <div className="p-4 bg-white dark:bg-slate-900 border rounded-lg text-xs text-slate-500 text-center">
                  {t("tech_dashboard_search_not_found")}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("tech_dashboard_search_result")}
                  </div>
                  <TechnicianJobCard
                    job={searchResult}
                    materials={materials[searchResult.id] || []}
                    currentUserId={currentUserId}
                    onRefresh={fetchJobs}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navegação por Abas Modulares */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full bg-slate-200/70 dark:bg-slate-900 p-1">
            <TabsTrigger value="my-jobs" className="text-xs gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> {t("tech_dashboard_tab_schedule")} ({myActiveJobs.length})
            </TabsTrigger>
            <TabsTrigger value="available" className="text-xs gap-1.5">
              <Wrench className="w-3.5 h-3.5" /> {t("tech_dashboard_tab_available")} ({pendingAvailable.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-xs gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> {t("tech_dashboard_tab_completed")} ({completedJobs.length})
            </TabsTrigger>
            <TabsTrigger value="mileage" className="text-xs gap-1.5">
              <Compass className="w-3.5 h-3.5" /> {t("tech_dashboard_tab_mileage")}
            </TabsTrigger>
            <TabsTrigger value="payouts" className="text-xs gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> {t("tech_dashboard_tab_payouts")}
            </TabsTrigger>
          </TabsList>

          {/* Aba 1: Agenda / Ordens Ativas com Calendário */}
          <TabsContent value="my-jobs" className="space-y-4">
            <TechnicianScheduleTab
              jobs={[...myActiveJobs, ...completedJobs]}
              materials={materials}
              currentUserId={currentUserId}
              onRefresh={fetchJobs}
            />
          </TabsContent>

          {/* Aba 2: Ordens Disponíveis para Aceitar */}
          <TabsContent value="available" className="space-y-4">
            {pendingAvailable.length === 0 ? (
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm text-center py-12">
                <CardContent className="space-y-2">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {t("tech_dashboard_empty_available_title")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("tech_dashboard_empty_available_desc")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingAvailable.map((job) => (
                  <TechnicianJobCard
                    key={job.id}
                    job={job}
                    materials={materials[job.id] || []}
                    currentUserId={currentUserId}
                    onRefresh={fetchJobs}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Aba 3: Histórico de Concluídos */}
          <TabsContent value="completed" className="space-y-4">
            {completedJobs.length === 0 ? (
              <Card className="border-slate-200 dark:border-slate-800 shadow-sm text-center py-12">
                <CardContent className="space-y-2">
                  <History className="w-8 h-8 text-slate-400 mx-auto opacity-50" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {t("tech_dashboard_empty_completed_title")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("tech_dashboard_empty_completed_desc")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {completedJobs.map((job) => (
                  <TechnicianJobCard
                    key={job.id}
                    job={job}
                    materials={materials[job.id] || []}
                    currentUserId={currentUserId}
                    onRefresh={fetchJobs}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Aba 4: Deslocação e Odômetro */}
          <TabsContent value="mileage" className="space-y-4">
            <TechnicianMileageSection technicianId={currentUserId} />
          </TabsContent>

          {/* Aba 5: Repasses e Extrato */}
          <TabsContent value="payouts" className="space-y-4">
            <TechnicianPayoutsTab
              completedJobs={completedJobs}
              technicianName={profile?.full_name || t("tech_dashboard_fallback_name")}
              technicianIban={profileExtra?.iban || undefined}
            />
          </TabsContent>
        </Tabs>
      </main>

      <TechnicianProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        userId={user?.id ?? ""}
        initial={technicianProfileInitial}
      />
    </div>
  );
};

export default TechnicianDashboard;
