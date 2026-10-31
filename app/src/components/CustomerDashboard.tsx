import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import ServiceRequestForm from "@/components/ServiceRequestForm";
import ServiceDetailDialog from "@/components/ServiceDetailDialog";
import ChatWidget from "@/components/ChatWidget";
import ServiceRating from "@/components/ServiceRating";
import GpsPermissionPrompt from "@/components/GpsPermissionPrompt";
import { CUSTOMER_PENDING_STATUSES, CUSTOMER_IN_PROGRESS_STATUSES, CUSTOMER_DONE_STATUSES } from "@/lib/customer-status-groups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Home, ClipboardList, UserRound, LogOut, Plus, Calendar, Clock, MapPin, Package, Euro, CheckCircle, XCircle, Eye, Wrench, Phone, Ban, AlertTriangle, Info, CreditCard, DollarSign, Star, FileText, Image, Trash2, RotateCcw, UserCog, ShieldCheck, Truck } from "lucide-react";
import CustomerProfileDialog from "@/components/CustomerProfileDialog";
import { formatServiceReference, buildReturnSequenceMap, cleanApplianceType } from "@/lib/serviceLabel";

import { format, parseISO, differenceInHours, differenceInDays, differenceInBusinessDays } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { usePlatformSettingNumber } from "@/hooks/usePlatformSettingNumber";
import { toast } from "sonner";
import { computeAdditionalCharges, chargeKindLabel } from "@/lib/additional-charges";



interface ServiceRequest {
  id: string;
  appliance_type: string;
  description: string;
  scheduled_date: string;
  scheduled_time: string;
  address: string;
  postal_code: string;
  localidade: string | null;
  contact_name: string;
  contact_phone: string;
  equipment_brand: string | null;
  equipment_model: string | null;
  equipment_age: string | null;
  equipment_number: string | null;
  is_warranty: boolean;
  status: string;
  created_at: string;
  reference: string;
  technician_id: string | null;
  estimated_arrival_time: string | null;
  technician_name?: string;
  technician_phone?: string;
  report_text: string | null;
  report_url: string | null;
  suggested_date?: string | null;
  suggested_time?: string | null;
  suggestion_status?: string | null;
}

interface ServicePhoto {
  id: string;
  photo_url: string;
  service_request_id: string;
}

interface ServiceMaterial {
  id: string;
  service_request_id: string;
  material_name: string;
  material_cost: number;
  status: string;
}

const dateFnsLocales: Record<string, typeof ptBR> = { pt: ptBR, en: enUS, es };

const CustomerDashboard = () => {
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  // Antecedência mínima para cancelar/reagendar (platform_settings; padrão 24h).
  const minHoursBeforeChange = usePlatformSettingNumber("min_hours_before_service_change", 24);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Record<string, ServiceMaterial[]>>({});
  const [servicePhotos, setServicePhotos] = useState<Record<string, ServicePhoto[]>>({});
  const [selectedService, setSelectedService] = useState<ServiceRequest | null>(null);
  const [custReschedId, setCustReschedId] = useState<string | null>(null);
  const [custReschedDate, setCustReschedDate] = useState("");
  const [custReschedTime, setCustReschedTime] = useState("");

  const saveCustomerWarrantyReschedule = async (req: ServiceRequest) => {
    if (!custReschedDate || !custReschedTime) { toast.error(t("cli_reschedule_pick_datetime")); return; }
    const currentVisit = new Date(`${(req as any).warranty_return_date}T${(req as any).warranty_return_time || "00:00"}:00`);
    if ((currentVisit.getTime() - Date.now()) / 3_600_000 < minHoursBeforeChange) {
      toast.error(t("cli_reschedule_blocked_24h", { hours: minHoursBeforeChange }));
      return;
    }
    const { error } = await supabase.from("service_requests").update({
      warranty_return_date: custReschedDate,
      warranty_return_time: custReschedTime,
      updated_at: new Date().toISOString(),
    } as any).eq("id", req.id);
    if (error) { toast.error(t("cli_reschedule_error")); console.error(error); return; }
    if ((req as any).technician_id) {
      await supabase.from("technician_notifications").insert({
        technician_id: (req as any).technician_id,
        service_request_id: req.id,
        title: t("cli_reschedule_notif_title"),
        message: `A visita de Garantia/Retorno foi reagendada. Nova data: ${custReschedDate} • ${custReschedTime}`,
        type: "reschedule",
      });
    }
    toast.success(t("cli_reschedule_success"));
    setCustReschedId(null); setCustReschedDate(""); setCustReschedTime("");
    fetchRequests();
  };
  const [ratedServiceIds, setRatedServiceIds] = useState<Set<string>>(new Set());
  const [partnerOrgName, setPartnerOrgName] = useState<string | null>(null);
  const [returnVisitService, setReturnVisitService] = useState<ServiceRequest | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [returnVisitDate, setReturnVisitDate] = useState("");
  const [returnVisitTime, setReturnVisitTime] = useState("");
  const [returnVisitDescription, setReturnVisitDescription] = useState("");


  const currentLocale = dateFnsLocales[i18n.language] || ptBR;

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: t("status_pending"), variant: "secondary" },
    accepted: { label: t("status_accepted"), variant: "default" },
    in_progress: { label: t("status_in_progress"), variant: "default" },
    budgeting: { label: t("status_budgeting"), variant: "secondary" },
    quote_sent: { label: t("status_quote_sent"), variant: "default" },
    quote_accepted: { label: t("status_quote_accepted"), variant: "default" },
    quote_rejected: { label: t("status_quote_rejected"), variant: "destructive" },
    payment_pending: { label: t("status_payment_pending"), variant: "secondary" },
    completed: { label: t("status_completed"), variant: "outline" },
    cancelled: { label: t("status_cancelled"), variant: "destructive" },
  };

  const fetchMaterials = async (requestIds: string[]) => {
    if (requestIds.length === 0) return;
    const { data } = await supabase
      .from("service_materials")
      .select("*")
      .in("service_request_id", requestIds);
    if (data) {
      const grouped: Record<string, ServiceMaterial[]> = {};
      data.forEach((m: ServiceMaterial) => {
        if (!grouped[m.service_request_id]) grouped[m.service_request_id] = [];
        grouped[m.service_request_id].push(m);
      });
      setMaterials(grouped);
    }
  };

  const fetchPhotos = async (requestIds: string[]) => {
    if (requestIds.length === 0) return;
    const { data } = await supabase
      .from("service_photos")
      .select("*")
      .in("service_request_id", requestIds);
    if (data) {
      const grouped: Record<string, ServicePhoto[]> = {};
      data.forEach((p: ServicePhoto) => {
        if (!grouped[p.service_request_id]) grouped[p.service_request_id] = [];
        grouped[p.service_request_id].push(p);
      });
      setServicePhotos(grouped);
    }
  };

  const fetchRequests = async () => {
    try {
      await fetchRequestsInner();
    } catch (err) {
      console.error("Erro ao carregar serviços:", err);
      toast.error(t("cli_services_load_error"));
      setLoading(false);
    }
  };

  const fetchRequestsInner = async () => {
    if (!user) return;

    // Check if user belongs to a partner organization
    const { data: membership } = await supabase
      .from("partner_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1);

    let data: any[] | null = null;
    const isPartnerOrg = !!(membership && membership.length > 0);

    if (isPartnerOrg) {
      const orgId = membership[0].organization_id;

      // Fetch org name
      const { data: orgData } = await supabase
        .from("partner_organizations")
        .select("name")
        .eq("id", orgId)
        .single();
      if (orgData) setPartnerOrgName(orgData.name);

      // Fetch all member user_ids in the same org
      const { data: members } = await supabase
        .from("partner_members")
        .select("user_id")
        .eq("organization_id", orgId);

      const memberIds = members ? members.map((m: any) => m.user_id) : [user.id];

      // Fetch all services from all org members
      const { data: orgServices, error: orgError } = await supabase
        .from("service_requests")
        .select("*")
        .in("customer_id", memberIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (orgError) throw orgError;
      data = orgServices;
    } else {
      const { data: ownServices, error: ownError } = await supabase
        .from("service_requests")
        .select("*")
        .eq("customer_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (ownError) throw ownError;
      data = ownServices;
    }


    if (data) {
      // Fetch technician profiles for assigned services
      const techIds = [...new Set(data.filter(r => r.technician_id).map(r => r.technician_id!))];
      const techMap: Record<string, { full_name: string; phone: string | null }> = {};
      if (techIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, phone")
          .in("user_id", techIds);
        if (profiles) {
          profiles.forEach(p => { techMap[p.user_id] = { full_name: p.full_name, phone: p.phone }; });
        }
      }
      const enriched = data.map(r => ({
        ...r,
        technician_name: r.technician_id ? techMap[r.technician_id]?.full_name : undefined,
        technician_phone: r.technician_id ? techMap[r.technician_id]?.phone || undefined : undefined,
      }));
      setRequests(enriched);
      const allIds = data.map(r => r.id);
      const photoEligibleIds = isPartnerOrg
        ? allIds
        : data.filter(r => ["completed", "budgeting", "quote_sent", "quote_accepted", "quote_rejected", "payment_pending"].includes(r.status)).map(r => r.id);
      fetchPhotos(photoEligibleIds);

      fetchMaterials(allIds);

      const completedIds = data.filter(r => r.status === "completed").map(r => r.id);
      if (completedIds.length > 0) {
        const { data: ratingsData } = await supabase
          .from("service_ratings")
          .select("service_request_id")
          .in("service_request_id", completedIds);
        if (ratingsData) {
          setRatedServiceIds(new Set(ratingsData.map((r: any) => r.service_request_id)));
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      // Reconcile any service stuck in payment_pending whose Stripe
      // checkout was actually paid (e.g. customer closed the tab after
      // paying instead of returning to /payment-success).
      try {
        const res = await supabase.functions.invoke("verify-pending-payments", { body: {} });
        if ((res as any)?.data?.updated?.length) {
          // refetch with the latest statuses
        }
      } catch (e) {
        console.warn("verify-pending-payments failed", e);
      }
      fetchRequests();
    };
    run();
  }, [user]);

  // Realtime: refresh when materials are added/updated by the technician
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`customer-materials-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_materials' }, () => {
        fetchRequests();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Realtime: notify customer (sound + toast + browser notification) when technician sets ETA ("Estou a caminho")
  const knownEtaRef = useRef<Map<string, string>>(new Map());
  const etaInitializedRef = useRef(false);

  useEffect(() => {
    // Seed known ETAs from current requests so we only react to NEW transitions
    const map = knownEtaRef.current;
    requests.forEach((r) => {
      map.set(r.id, (r.estimated_arrival_time || "").trim());
    });
    etaInitializedRef.current = true;
  }, [requests]);

  const playOnTheWaySound = () => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.02);
      };
      playTone(880, 0, 0.18);
      playTone(1175, 0.2, 0.25);
    } catch (e) {
      console.warn("Could not play sound:", e);
    }
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const res = await Notification.requestPermission();
    return res === "granted";
  };

  useEffect(() => {
    if (!user) return;
    requestNotificationPermission();

    const channel = supabase
      .channel(`customer-eta-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'service_requests', filter: `customer_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as any;
          const old = payload.old as any;
          // Refetch imediato quando o estado da fatura muda (received_at)
          if ((old?.received_at || null) !== (row?.received_at || null)) {
            fetchRequests();
            if (row?.received_at) {
              toast.success(t("cli_fatura_paid_title"), { description: t("cli_fatura_paid_desc", { reference: row.reference || "" }) });
            }
          }
          const prev = knownEtaRef.current.get(row.id) || "";
          const next = (row.estimated_arrival_time || "").trim();
          if (next && next !== prev) {
            knownEtaRef.current.set(row.id, next);
            // Sound
            playOnTheWaySound();
            // Toast
            const msg = t("eta_alert_message", { time: next }) || `O técnico estima chegar às ${next}`;
            toast.success(t("technician_on_the_way"), { description: msg });
            // Browser / PWA notification
            if ("Notification" in window && Notification.permission === "granted") {
              const title = t("technician_on_the_way");
              if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then((reg) => {
                  reg.showNotification(title, {
                    body: msg,
                    icon: "/pwa-192x192.png",
                    badge: "/pwa-192x192.png",
                    tag: `eta-${row.id}`,
                  } as NotificationOptions);
                });
              } else {
                new Notification(title, { body: msg, icon: "/pwa-192x192.png", tag: `eta-${row.id}` });
              }
            }
            fetchRequests();
          } else {
            knownEtaRef.current.set(row.id, next);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);


  const canCancelService = (req: ServiceRequest) => {
    if (req.status === "completed" || req.status === "cancelled") return false;
    const serviceDateTime = new Date(`${req.scheduled_date}T${req.scheduled_time}`);
    return differenceInHours(serviceDateTime, new Date()) >= minHoursBeforeChange;
  };

  const isActiveService = (req: ServiceRequest) => {
    return req.status !== "completed" && req.status !== "cancelled";
  };

  const cancelService = async (reqId: string) => {
    const { error } = await supabase
      .from("service_requests")
      .update({ status: "cancelled" })
      .eq("id", reqId);
    if (error) {
      toast.error(t("cancel_error"));
      return;
    }
    toast.success(t("cancel_success"));
    fetchRequests();
  };

  const softDeleteService = async (reqId: string) => {
    if (!confirm(t("confirm_delete_service"))) return;
    const { error } = await supabase
      .from("service_requests")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", reqId);
    if (error) {
      toast.error(t("delete_error"));
      return;
    }
    toast.success(t("delete_success"));
    fetchRequests();
  };

  const createReturnVisit = async (originalService: ServiceRequest, date: string, time: string, description?: string) => {
    if (!date || !time) { toast.error(t("error_select_date_time_return")); return; }
    const newRef = `${originalService.reference} - Em Garantia`;
    const desc = (description?.trim() || originalService.description || "").slice(0, 2000);
    const { error } = await supabase.from("service_requests").insert({
      customer_id: (originalService as any).customer_id || user?.id,
      appliance_type: originalService.appliance_type,
      description: desc,
      scheduled_date: date,
      scheduled_time: time,
      address: originalService.address,
      address_complement: (originalService as any).address_complement || "",
      postal_code: originalService.postal_code,
      contact_name: originalService.contact_name,
      contact_phone: originalService.contact_phone,
      reference: newRef,
      is_warranty: true,
      localidade: originalService.localidade || "",
      technician_id: originalService.technician_id,
      status: "pending",
      parent_service_id: originalService.id,
      warranty_return_description: description?.trim() || null,
    } as any);
    if (error) { toast.error(t("error_create_return_visit")); console.error("Return visit error:", error); return; }
    // Mark the original as having a customer warranty request so the gestor sees it highlighted
    await supabase
      .from("service_requests")
      .update({
        warranty_return_requested_at: new Date().toISOString(),
        warranty_return_description: description?.trim() || null,
      } as any)
      .eq("id", originalService.id);
    toast.success(t("return_visit_success"));
    setReturnVisitService(null);
    setReturnVisitDate("");
    setReturnVisitTime("");
    setReturnVisitDescription("");
    fetchRequests();
  };


  const updateMaterialStatus = async (materialId: string, newStatus: "approved" | "rejected", serviceId?: string) => {
    const { error } = await supabase
      .from("service_materials")
      .update({ status: newStatus })
      .eq("id", materialId);
    if (error) {
      toast.error(t("material_update_error"));
      return;
    }
    if (newStatus === "rejected" && serviceId) {
      await supabase
        .from("service_requests")
        .update({ status: "in_progress" } as any)
        .eq("id", serviceId)
        .in("status", ["budgeting", "quote_sent", "quote_accepted", "quote_rejected", "payment_pending"]);
    }
    toast.success(newStatus === "approved" ? t("material_approved_success") : t("material_rejected_success"));
    fetchMaterials(requests.map(r => r.id));
  };

  const updateLaborStatus = async (serviceId: string, newStatus: "approved" | "rejected") => {
    const patch: any = newStatus === "approved"
      ? { labor_approved_at: new Date().toISOString(), labor_rejected_at: null }
      : { status: "in_progress", labor_rejected_at: new Date().toISOString(), labor_approved_at: null };
    const { error } = await supabase.from("service_requests").update(patch).eq("id", serviceId);
    if (error) { toast.error(t("material_update_error")); return; }
    toast.success(newStatus === "approved" ? t("cli_labor_approved") : t("cli_labor_rejected"));
    fetchRequests();
  };



  const materialStatusBadge = (status: string) => {
    if (status === "approved") return <Badge variant="default" className="text-xs">{t("material_status_approved")}</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="text-xs">{t("material_status_rejected")}</Badge>;
    return <Badge variant="secondary" className="text-xs">{t("material_status_pending")}</Badge>;
  };

  const MaterialsSection = ({ requestId, serviceStatus }: { requestId: string; serviceStatus?: string }) => {
    const reqMaterials = materials[requestId] || [];
    if (reqMaterials.length === 0) return null;

    const isFinalized = serviceStatus === "completed" || serviceStatus === "cancelled";
    const hasPending = !isFinalized && reqMaterials.some(m => m.status === "pending");
    const partsMul = 1;
    const activeTotal = reqMaterials
      .filter(m => m.status !== "rejected")
      .reduce((sum, m) => sum + Number(m.material_cost) * partsMul, 0);

    return (
      <div className="border-t pt-3 mt-3 space-y-2">
        <span className="text-xs font-medium flex items-center gap-1">
          <Package className="w-3.5 h-3.5" /> {t("materials")}
          {hasPending && <Badge variant="secondary" className="text-[10px] ml-1 animate-pulse">{t("pending_materials")}</Badge>}
        </span>
        {hasPending && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] text-foreground flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span>{t("material_approval_required")}</span>
          </div>
        )}
        <div className="space-y-1.5">
          {reqMaterials.map((m: any) => (
            <div key={m.id} className="text-xs p-2 rounded bg-muted/30 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium">{m.material_name}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium flex items-center gap-0.5"><Euro className="w-3 h-3" />{(Number(m.material_cost) * partsMul).toFixed(2)}</span>
                  {m.status === "pending" && !isFinalized ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={() => updateMaterialStatus(m.id, "approved", requestId)}>
                        <CheckCircle className="w-3 h-3 mr-0.5" /> {t("material_approve")}
                      </Button>
                      <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" onClick={() => updateMaterialStatus(m.id, "rejected", requestId)}>
                        <XCircle className="w-3 h-3 mr-0.5" /> {t("material_reject")}
                      </Button>
                    </div>
                  ) : (
                    materialStatusBadge(isFinalized && m.status === "pending" ? "approved" : m.status)
                  )}
                </div>
              </div>
              {(m.photo_url_1 || m.photo_url_2) && (
                <div className="flex items-start gap-2">
                  {m.photo_url_1 && (
                    <a href={m.photo_url_1} target="_blank" rel="noopener noreferrer">
                      <img src={m.photo_url_1} alt={t("label_photo")} className="w-16 h-16 object-cover rounded border hover:opacity-80 transition-opacity" />
                    </a>
                  )}
                  {m.photo_url_2 && (
                    <a href={m.photo_url_2} target="_blank" rel="noopener noreferrer">
                      <img src={m.photo_url_2} alt={t("part_photo")} className="w-16 h-16 object-cover rounded border hover:opacity-80 transition-opacity" />
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="text-xs text-right text-muted-foreground font-medium">
            {t("total_materials")}: €{activeTotal.toFixed(2)}
          </div>
          {!isFinalized && !partnerOrgName && activeTotal > 0 && (
            <Button
              size="sm"
              className="w-full h-9 text-xs font-semibold"
              onClick={() => handlePayment(requestId, "materials")}
              disabled={payingServiceId === requestId}
            >
              <CreditCard className="w-3.5 h-3.5 mr-1.5" />
              {payingServiceId === requestId
                ? (t("loading_wait"))
                : (t("approve_and_pay_parts"))}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const PartnerServiceValueSection = ({ req }: { req: ServiceRequest }) => {
    if (!partnerOrgName) return null;
    // Só mostrar quando o serviço já está em curso/orçamentação/finalizado
    const eligible = ["in_progress", "budgeting", "quote_sent", "quote_accepted", "payment_pending", "completed"].includes(req.status);
    if (!eligible) return null;

    // Valor do serviço para parceiros: deslocação fixa €55 c/IVA incluído
    const serviceValue = 55.0;

    const reqMaterials = materials[req.id] || [];
    const approvedMaterials = reqMaterials.filter(m => m.status === "approved");
    const partsMul = 1;
    const partsTotal = approvedMaterials.reduce((sum, m) => sum + Number(m.material_cost) * partsMul, 0);
    const hasApprovedParts = approvedMaterials.length > 0;
    const laborCost = Number((req as any).labor_cost || 0);
    const extraFee = Number((req as any).extra_fee || 0);
    const grandTotal = serviceValue + partsTotal + laborCost + extraFee;

    const invoiceNumber = (req as any).invoice_number as string | null;
    const receivedAt = (req as any).received_at as string | null;
    const isPaid = !!receivedAt;
    const hasExtras = hasApprovedParts || laborCost > 0 || extraFee > 0;

    return (
      <div className="border-t pt-3 mt-3">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
            <DollarSign className="w-3.5 h-3.5" /> {t("service_value_title")}
          </span>
          {hasApprovedParts && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("total_materials")}:</span>
              <span className="font-semibold text-foreground">€{partsTotal.toFixed(2)}</span>
            </div>
          )}
          {laborCost > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("labor_cost_label")}:</span>
              <span className="font-semibold text-foreground">€{laborCost.toFixed(2)}</span>
            </div>
          )}
          {extraFee > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("extra_fee_label")}:</span>
              <span className="font-semibold text-foreground">€{extraFee.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("service_value_label")}:</span>
            <span className="font-semibold text-foreground">€{serviceValue.toFixed(2)}</span>
          </div>
          {hasExtras && (
            <div className="flex items-center justify-between pt-2 border-t border-primary/20">
              <span className="text-sm font-bold text-foreground">{t("amount_to_pay")}:</span>
              <span className="text-sm font-bold text-primary">€{grandTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="pt-2 border-t border-primary/20 flex items-center justify-between">
            {isPaid ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs">
                🟢 Fatura Paga
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">
                Fatura Pendente
              </Badge>
            )}
            {invoiceNumber && (
              <span className="text-xs text-muted-foreground">
                {t("invoice_number_display", { number: invoiceNumber })}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  /** Valores adicionais pendentes (M.O. + materiais + taxa extra) agrupados num único saldo. */
  const AdditionalChargesSection = ({ req }: { req: ServiceRequest }) => {
    if (partnerOrgName) return null;
    const summary = computeAdditionalCharges(req as any, (materials[req.id] || []) as any);
    if (summary.items.length === 0) return null;

    const pending = summary.hasPending;

    return (
      <div
        className={`rounded-lg border p-3 space-y-2 mt-3 ${
          pending ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className={`text-xs font-semibold flex items-center gap-1.5 ${pending ? "text-amber-800" : "text-emerald-800"}`}>
            <DollarSign className="w-3.5 h-3.5" /> Valores adicionais
          </span>
          <Badge className={`text-[10px] ${pending ? "bg-amber-500 hover:bg-amber-500 text-white" : "bg-emerald-600 hover:bg-emerald-600 text-white"}`}>
            {pending ? "Aguardando pagamento" : "Pagamento confirmado"}
          </Badge>
        </div>

        <div className="text-[11px] text-muted-foreground">{t("cli_reference_label")} <span className="font-medium text-foreground">{req.reference}</span></div>

        <div className="space-y-1">
          {summary.items.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-foreground">
                {item.label}
                {item.quantity && item.quantity !== 1 && (
                  <span className="text-muted-foreground"> — {item.quantity} × €{(item.unitAmount || 0).toFixed(2)}</span>
                )}
                <span className="block text-[10px] text-muted-foreground">
                  {chargeKindLabel(item.kind)} · {item.state === "paid" ? "Pago" : "Aguardando pagamento"}
                </span>
              </span>
              <span className="font-semibold whitespace-nowrap">€{item.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border/40 space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("cli_total_added")}</span>
            <span className="font-semibold">€{summary.totalCharged.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("cli_already_paid")}</span>
            <span className="font-semibold">€{summary.totalPaid.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-foreground">{t("cli_pending_value")}</span>
            <span className={`font-bold ${pending ? "text-amber-700" : "text-emerald-700"}`}>€{summary.totalPending.toFixed(2)}</span>
          </div>
          {!pending && summary.lastPaidAt && (
            <div className="text-[10px] text-emerald-700">
              Pagamento confirmado em {format(new Date(summary.lastPaidAt), "dd/MM/yyyy HH:mm")} · Stripe
            </div>
          )}
        </div>

        {pending && (
          <Button
            size="sm"
            className="w-full h-9 text-xs font-semibold"
            onClick={() => handlePayment(req.id, "additional")}
            disabled={payingServiceId === req.id}
          >
            <CreditCard className="w-3.5 h-3.5 mr-1.5" />
            {payingServiceId === req.id ? (t("loading_wait")) : "Pagar valor adicional"}
          </Button>
        )}
      </div>
    );
  };



  const ReportAndPhotosSection = ({ req }: { req: ServiceRequest }) => {
    const showReport = partnerOrgName || ["completed", "budgeting", "quote_sent", "quote_accepted", "quote_rejected", "payment_pending"].includes(req.status);
    if (!showReport) return null;
    const hasReport = req.report_text && req.report_text.trim() !== "";
    const photos = servicePhotos[req.id] || [];
    if (!hasReport && photos.length === 0) return null;

    return (
      <div className="border-t pt-3 mt-3 space-y-3">
        {hasReport && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" /> {t("service_report")}
            </span>
            <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">{req.report_text}</p>
            {req.report_url && (
              <a href={req.report_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                <FileText className="w-3 h-3" /> {t("view_report")}
              </a>
            )}
          </div>
        )}
        {photos.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-primary" /> {t("service_photos")} ({photos.length})
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((photo) => (
                <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border hover:opacity-80 transition-opacity">
                  <img src={photo.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };
  const [payingServiceId, setPayingServiceId] = useState<string | null>(null);

  // Todo pagamento passa pelo create-payment. Ele calcula o valor e, conforme o modo
  // (platform_settings.payment_mode), confirma na hora (simulado) ou abre o checkout da Stripe.
  const handlePayment = async (serviceId: string, paymentType?: string) => {
    setPayingServiceId(serviceId);
    try {
      const type = paymentType || "booking";
      const { data, error } = await supabase.functions.invoke("create-payment", {
        body: { service_request_id: serviceId, payment_type: type },
      });
      if (error) throw new Error(error.message || t("cli_payment_error_start"));
      const result = data as any;
      if (result?.simulated) {
        toast.success(`Pagamento confirmado (simulado): €${Number(result.amount).toFixed(2)}`);
        fetchRequests();
        return;
      }
      const url = result?.url;
      if (!url) throw new Error(t("cli_payment_url_missing"));
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message || t("error_start_payment"));
    } finally {
      setTimeout(() => setPayingServiceId(null), 1500);
    }
  };


  const handleRejectQuote = async (reqId: string) => {
    const { error } = await supabase
      .from("service_requests")
      .update({ status: "quote_rejected", quote_status: "rejected" })
      .eq("id", reqId);
    if (error) {
      toast.error(error.message || t("error_generic"));
      return;
    }
    toast.success(t("quote_rejected_success"));
    fetchRequests();
  };

  const QuoteSection = ({ req }: { req: ServiceRequest }) => {
    if (req.status !== "quote_sent" && req.status !== "quote_accepted" && req.status !== "quote_rejected") return null;
    const quoteParts = Number((req as any).quote_parts || 0);
    const laborCost = Number((req as any).labor_cost || 0);
    const quoteTravel = Number((req as any).quote_travel || (req as any).deslocacao_fee || 0);
    const total = quoteParts + laborCost + quoteTravel;

    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 mt-2">
        <span className="text-xs font-semibold flex items-center gap-1 text-primary">
          <DollarSign className="w-3.5 h-3.5" /> {t("budget_summary")}
        </span>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><span className="text-muted-foreground">{t("budget_parts")}:</span> <span className="font-medium">€{quoteParts.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">{t("budget_labor")}:</span> <span className="font-medium">€{laborCost.toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">{t("budget_travel")}:</span> <span className="font-medium">€{quoteTravel.toFixed(2)}</span></div>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-primary/20">
          <span className="text-sm font-bold text-foreground">{t("budget_total")}: €{total.toFixed(2)}</span>
          {req.status === "quote_sent" && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => handleRejectQuote(req.id)}
              >
                {t("reject")}
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => handlePayment(req.id, "quote")}
                disabled={payingServiceId === req.id}
              >
                <CreditCard className="w-3.5 h-3.5 mr-1" />
                {payingServiceId === req.id ? t("loading_wait") : t("pay_now")}
              </Button>
            </div>
          )}
          {req.status === "quote_accepted" && (
            <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200">
              {t("status_quote_accepted")}
            </Badge>
          )}
          {req.status === "quote_rejected" && (
            <Badge variant="secondary" className="text-xs">{t("status_quote_rejected")}</Badge>
          )}
        </div>
      </div>
    );
  };

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    accepted: "bg-blue-100 text-blue-800 border-blue-200",
    in_progress: "bg-indigo-100 text-indigo-800 border-indigo-200",
    budgeting: "bg-purple-100 text-purple-800 border-purple-200",
    quote_sent: "bg-cyan-100 text-cyan-800 border-cyan-200",
    quote_accepted: "bg-emerald-100 text-emerald-800 border-emerald-200",
    quote_rejected: "bg-red-100 text-red-800 border-red-200",
    payment_pending: "bg-orange-100 text-orange-800 border-orange-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };

  // Contadores e abas usam os mesmos grupos (src/lib/customer-status-groups.ts).
  const PENDING_STATUSES: readonly string[] = CUSTOMER_PENDING_STATUSES;
  const IN_PROGRESS_STATUSES: readonly string[] = CUSTOMER_IN_PROGRESS_STATUSES;
  const DONE_STATUSES: readonly string[] = CUSTOMER_DONE_STATUSES;
  const pendingCount = requests.filter(r => PENDING_STATUSES.includes(r.status)).length;
  const inProgressCount = requests.filter(r => IN_PROGRESS_STATUSES.includes(r.status)).length;
  const completedCount = requests.filter(r => DONE_STATUSES.includes(r.status)).length;
  // Mostra o aviso de GPS uma vez só: dentro do primeiro serviço aceito ou em andamento.
  const gpsRequestId = partnerOrgName ? undefined : requests.find(r => ["accepted", "in_progress"].includes(r.status))?.id;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader hideLogo />
      <main className="container mx-auto px-4 py-6 sm:py-8 pb-28 sm:pb-8 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground tracking-tight">
              {partnerOrgName || t("my_services_customer")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {partnerOrgName ? t("partner_services_subtitle") : t("manage_requests")}
            </p>
          </div>
          <div className="hidden sm:flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setProfileDialogOpen(true)} size="lg">
              <UserCog className="w-4 h-4 mr-2" />Editar Perfil
            </Button>
            <Button onClick={() => setShowForm(true)} size="lg" className="shadow-md hover:shadow-lg transition-shadow">
              <Plus className="w-4 h-4 mr-2" />{t("new_service")}
            </Button>
          </div>
        </div>

        {user && (
          <CustomerProfileDialog
            open={profileDialogOpen}
            onOpenChange={setProfileDialogOpen}
            userId={user.id}
          />
        )}


        {showForm && (
          <ServiceRequestForm onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); fetchRequests(); toast.info(t("scheduling_info_text"), { duration: 8000 }); }} />
        )}


        {/* Summary Cards */}
        {!loading && requests.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl border bg-card p-3 sm:p-4 text-center shadow-sm">
              <p className="text-2xl sm:text-3xl font-bold text-amber-600">{pendingCount}</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-1">{t("tab_pending")}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 sm:p-4 text-center shadow-sm">
              <p className="text-2xl sm:text-3xl font-bold text-primary">{inProgressCount}</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-1">{t("tab_in_progress")}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 sm:p-4 text-center shadow-sm">
              <p className="text-2xl sm:text-3xl font-bold text-green-600">{completedCount}</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-1">{t("tab_completed")}</p>
            </div>
          </div>
        )}

        {/* Info Banner */}
        {requests.some(r => r.status === "pending" || r.status === "accepted") && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">{t("scheduling_info_text")}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">{t("loading_text")}</p>
          </div>
        ) : requests.length === 0 ? (
          <Card className="text-center py-16 shadow-sm border-dashed">
            <CardContent className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center mx-auto">
                <Wrench className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">{t("no_services_yet")}</p>
                <p className="text-sm text-muted-foreground mb-4">{t("manage_requests")}</p>
              </div>
              <Button onClick={() => setShowForm(true)} size="lg">
                <Plus className="w-4 h-4 mr-2" />{t("schedule_first")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
          <div id="meus-servicos" className="scroll-mt-20" />
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="mb-5 w-full justify-start bg-muted/50 p-1 rounded-xl h-auto flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="all" className="rounded-lg text-xs sm:text-sm whitespace-nowrap shrink-0 data-[state=active]:shadow-sm">{t("tab_all")} ({requests.length})</TabsTrigger>
              <TabsTrigger value="pending" className="rounded-lg text-xs sm:text-sm whitespace-nowrap shrink-0 data-[state=active]:shadow-sm">{t("tab_pending")} ({pendingCount})</TabsTrigger>
              <TabsTrigger value="in_progress" className="rounded-lg text-xs sm:text-sm whitespace-nowrap shrink-0 data-[state=active]:shadow-sm">{t("tab_in_progress")} ({inProgressCount})</TabsTrigger>
              <TabsTrigger value="completed" className="rounded-lg text-xs sm:text-sm whitespace-nowrap shrink-0 data-[state=active]:shadow-sm">{t("tab_completed")} ({completedCount})</TabsTrigger>
            </TabsList>
            {["all", "pending", "in_progress", "completed"].map((tab) => {
              const baseFiltered = tab === "all" ? requests
                : tab === "pending" ? requests.filter(r => PENDING_STATUSES.includes(r.status))
                : tab === "in_progress" ? requests.filter(r => IN_PROGRESS_STATUSES.includes(r.status))
                : requests.filter(r => DONE_STATUSES.includes(r.status));
              // For partner panel: active services first, then completed sorted by date desc
              const filtered = partnerOrgName ? [...baseFiltered].sort((a, b) => {
                const aCompleted = a.status === "completed" || a.status === "cancelled";
                const bCompleted = b.status === "completed" || b.status === "cancelled";
                if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
                return new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime();
              }) : baseFiltered;
              return (
                <TabsContent key={tab} value={tab}>
                  {filtered.length === 0 ? (
                    <Card className="text-center py-10 border-dashed">
                      <CardContent><p className="text-muted-foreground">{t("no_services_yet")}</p></CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4">
                      {filtered.map((req, i) => {
                        const statusInfo = statusMap[req.status] || statusMap.pending;
                        const statusColor = statusColors[req.status] || statusColors.pending;
                        const renderReturnVisitButton = () => (
                          partnerOrgName && ["completed", "cancelled", "budgeting", "quote_sent", "quote_accepted", "quote_rejected", "payment_pending"].includes(req.status) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 text-xs"
                              onClick={() => {
                                setReturnVisitService(req);
                                setReturnVisitDate(new Date().toISOString().split("T")[0]);
                                setReturnVisitTime(req.scheduled_time || "09:00");
                                setReturnVisitDescription("");
                              }}
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />{t("return_visit")}
                            </Button>
                          ) : null
                        );
                        return (
                          <Card key={req.id} className="animate-fade-in overflow-hidden shadow-sm hover:shadow-md transition-shadow" style={{ animationDelay: `${i * 0.05}s` }}>
                            {/* Status stripe */}
                            <div className={`h-1 w-full ${req.status === "payment_pending" ? "bg-orange-400" : req.status === "in_progress" ? "bg-primary" : req.status === "completed" ? "bg-green-500" : req.status === "cancelled" ? "bg-gray-300" : "bg-amber-400"}`} />
                            <CardHeader className="pb-2 pt-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  {req.reference && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-muted text-xs font-mono font-medium text-muted-foreground">{formatServiceReference(req as any)}</span>
                                  )}
                                  <CardTitle className="text-base sm:text-lg font-display leading-tight">{cleanApplianceType(req.appliance_type)}</CardTitle>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {req.status === "completed" && !ratedServiceIds.has(req.id) && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700 border border-yellow-300 animate-pulse">
                                      <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                                      {t("rate_service")}
                                    </span>
                                  )}
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold border whitespace-nowrap ${statusColor}`}>
                                    {statusInfo.label}
                                  </span>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm pb-4">
                              <p className="text-muted-foreground leading-relaxed">{req.description}</p>
                              
                              {/* Info grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div className="flex items-center gap-2 text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                                  <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                                  <span>{format(new Date(req.scheduled_date), "dd MMM yyyy", { locale: currentLocale })}</span>
                                  <span className="text-muted-foreground/50">•</span>
                                  <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                                  <span>{req.scheduled_time}</span>
                                </div>
                                {req.address && (
                                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(req.address + (req.postal_code ? ', ' + req.postal_code : ''))}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary bg-primary/5 rounded-lg px-3 py-2 hover:bg-primary/10 transition-colors">
                                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                                    <span className="line-clamp-2 break-words">{req.address}{req.postal_code ? `, ${req.postal_code}` : ""}</span>
                                  </a>
                                )}
                              </div>
                              {user && req.id === gpsRequestId && (
                                <GpsPermissionPrompt userId={user.id} className="mb-0" />
                              )}
                              {req.status === "payment_pending" && (
                                <div className="rounded-lg bg-orange-50 border border-orange-200 text-orange-900 text-xs px-3 py-2">
                                  {t("payment_pending_hint")}
                                </div>
                              )}
                              {(req as any).address_complement && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                                  <Info className="w-3.5 h-3.5 shrink-0" />
                                  <span>{t("address_complement_label")}: {(req as any).address_complement}</span>
                                </div>
                              )}
                              {(req as any).warranty_return_date && (
                                <div className="rounded-lg border-2 border-warning/40 bg-warning/10 p-3 space-y-1">
                                  <div className="text-xs font-semibold text-warning flex items-center gap-1">
                                    <AlertTriangle className="w-4 h-4" /> {t("warranty_return_visit")}
                                  </div>
                                  <div className="text-xs text-foreground flex flex-wrap gap-3">
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date((req as any).warranty_return_date), "dd MMM yyyy", { locale: currentLocale })}</span>
                                    {(req as any).warranty_return_time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{(req as any).warranty_return_time}</span>}
                                  </div>
                                  {(req as any).completed_at && (
                                    <div className="text-[11px] text-muted-foreground">
                                      {t("original_visit_completed")}: {format(new Date((req as any).completed_at), "dd MMM yyyy", { locale: currentLocale })}
                                    </div>
                                  )}
                                  {(() => {
                                    const visitDate = new Date(`${(req as any).warranty_return_date}T${(req as any).warranty_return_time || "00:00"}:00`);
                                    const hoursUntil = (visitDate.getTime() - Date.now()) / 3_600_000;
                                    const canEdit = hoursUntil >= minHoursBeforeChange;
                                    if (!canEdit) return (
                                      <p className="text-[11px] text-muted-foreground italic">{t("cli_warranty_blocked", { hours: minHoursBeforeChange })}</p>
                                    );
                                    if (custReschedId === req.id) {
                                      return (
                                        <div className="flex flex-wrap items-end gap-2 pt-1">
                                          <Input type="date" value={custReschedDate} onChange={(e) => setCustReschedDate(e.target.value)} className="h-8 text-xs w-auto" />
                                          <Input type="time" value={custReschedTime} onChange={(e) => setCustReschedTime(e.target.value)} className="h-8 text-xs w-auto" />
                                          <Button size="sm" className="h-8 text-xs" onClick={() => saveCustomerWarrantyReschedule(req)}>{t("cli_save")}</Button>
                                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setCustReschedId(null); setCustReschedDate(""); setCustReschedTime(""); }}>Cancelar</Button>
                                        </div>
                                      );
                                    }
                                    return (
                                      <Button size="sm" variant="outline" className="h-7 text-xs mt-1" onClick={() => {
                                        setCustReschedId(req.id);
                                        setCustReschedDate((req as any).warranty_return_date || "");
                                        setCustReschedTime((req as any).warranty_return_time || "");
                                      }}>
                                        <Calendar className="w-3 h-3 mr-1" /> Editar Data e Horário
                                      </Button>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* New Date Suggestion Alert */}
                              {req.suggested_date && req.suggested_time && req.suggestion_status === "pending" && (
                                <div className="rounded-lg border-2 border-warning/40 bg-warning/10 p-3 animate-fade-in space-y-2">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <p className="text-xs font-bold text-warning uppercase tracking-wide">{t("new_suggestion")}</p>
                                      <p className="text-sm font-semibold text-foreground mt-0.5">
                                        {t("technician_suggested_new_date")}
                                      </p>
                                      <div className="flex flex-wrap gap-3 mt-1.5 text-sm">
                                        <span className="flex items-center gap-1 font-bold text-foreground">
                                          <Calendar className="w-4 h-4 text-warning" />
                                          {format(new Date(req.suggested_date), "dd MMM yyyy", { locale: currentLocale })}
                                        </span>
                                        <span className="flex items-center gap-1 font-bold text-foreground">
                                          <Clock className="w-4 h-4 text-warning" />
                                          {req.suggested_time}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      size="sm"
                                      className="flex-1 h-8 text-xs"
                                      onClick={async () => {
                                        const { error } = await supabase
                                          .from("service_requests")
                                          .update({
                                            scheduled_date: req.suggested_date,
                                            scheduled_time: req.suggested_time,
                                            suggestion_status: "accepted",
                                          } as any)
                                          .eq("id", req.id);
                                        if (error) { toast.error(t("error_generic")); return; }
                                        toast.success(t("suggestion_accepted"));
                                        fetchRequests();
                                      }}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                      {t("accept")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 h-8 text-xs"
                                      onClick={async () => {
                                        const { error } = await supabase
                                          .from("service_requests")
                                          .update({ suggestion_status: "rejected" } as any)
                                          .eq("id", req.id);
                                        if (error) { toast.error(t("error_generic")); return; }
                                        toast.success(t("suggestion_rejected"));
                                        fetchRequests();
                                      }}
                                    >
                                      <XCircle className="w-3.5 h-3.5 mr-1" />
                                      {t("reject")}
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* ETA Alert */}
                              {req.estimated_arrival_time && req.estimated_arrival_time.trim() !== "" && (
                                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 animate-fade-in">
                                  <Clock className="w-5 h-5 text-primary shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-xs font-semibold text-primary">{t("eta_alert_title")}</p>
                                    <p className="text-sm font-bold text-foreground">{t("eta_alert_message", { time: req.estimated_arrival_time }) || `O técnico estima chegar às ${req.estimated_arrival_time}`}</p>
                                  </div>
                                </div>
                              )}

                              {/* Technician info */}
                              {req.technician_name && (
                                <div className="flex flex-wrap items-center gap-3 text-xs bg-primary/5 border border-primary/10 rounded-lg p-3">
                                  <Wrench className="w-4 h-4 text-primary" />
                                  <span className="font-semibold text-foreground">{req.technician_name}</span>
                                  {req.technician_phone && (
                                    <a href={`tel:${req.technician_phone}`} className="flex items-center gap-1 text-primary hover:underline font-medium">
                                      <Phone className="w-3 h-3" />{req.technician_phone}
                                    </a>
                                  )}
                                  {req.estimated_arrival_time && (
                                    <span className="flex items-center gap-1 text-primary font-semibold ml-auto relative group cursor-pointer">
                                      <Clock className="w-3.5 h-3.5" />HEC: {req.estimated_arrival_time}
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-md bg-foreground text-background text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity pointer-events-none shadow-lg">
                                        {t("eta_full_meaning")}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Labor Cost / Full Quote Proposal */}
                              {!partnerOrgName && (() => {
                                const labor = Number((req as any).labor_cost || 0);
                                const parts = Number((req as any).quote_parts || 0);
                                const extra = Number((req as any).extra_fee || 0);
                                const quotePaid = !!(req as any).quote_paid_at || !!(req as any).labor_paid_at;
                                const hasQuoteData = labor > 0 || parts > 0 || extra > 0;
                                if (!hasQuoteData) return null;
                                const laborRejected = !!(req as any).labor_rejected_at && !(req as any).labor_approved_at && !(req as any).labor_paid_at;
                                const reqMaterials = materials[req.id] || [];
                                const partsMul = 1;
                                const matsTotal = reqMaterials
                                  .filter(m => m.status !== "rejected")
                                  .reduce((sum, m) => sum + Number(m.material_cost) * partsMul, 0);
                                const total = (laborRejected ? 0 : labor) + parts + extra + matsTotal;
                                const isFinalized = req.status === "completed" || req.status === "cancelled";
                                return (
                                  <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2 animate-fade-in">
                                    <div className="flex items-center gap-2">
                                      <DollarSign className="w-4 h-4 text-primary" />
                                      <span className="text-sm font-semibold text-primary">{t("labor_proposal_title")}</span>
                                      {quotePaid && <Badge className="ml-auto bg-emerald-600 hover:bg-emerald-600 text-white text-[10px]">✓ {t("paid_badge")}</Badge>}
                                    </div>
                                    <div className="text-xs space-y-1">
                                      {extra > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("extra_fee_label")}:</span><span className="font-medium">€{extra.toFixed(2)}</span></div>}
                                      {labor > 0 && (() => {
                                        const laborApproved = !!(req as any).labor_approved_at;
                                        const laborPaid = !!(req as any).labor_paid_at;
                                        const pending = !laborApproved && !laborRejected && !laborPaid && !isFinalized;
                                        return (
                                          <div className="rounded-md border border-primary/20 bg-background/60 p-2 space-y-1">
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                              <span className="text-muted-foreground">{t("budget_labor")}:</span>
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`font-medium ${laborRejected ? "line-through text-muted-foreground" : ""}`}>€{labor.toFixed(2)}</span>
                                                {laborApproved && <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9px] px-1">✓ Aprovada</Badge>}
                                                {laborRejected && <Badge variant="destructive" className="text-[9px] px-1">Rejeitada</Badge>}
                                                {pending && (
                                                  <>
                                                    <Badge variant="secondary" className="text-[9px] px-1 animate-pulse">Pendente</Badge>
                                                    <Button size="sm" variant="default" className="h-5 px-1 text-[10px]" onClick={() => updateLaborStatus(req.id, "approved")}>
                                                      <CheckCircle className="w-3 h-3" />
                                                    </Button>
                                                    <Button size="sm" variant="destructive" className="h-5 px-1 text-[10px]" onClick={() => updateLaborStatus(req.id, "rejected")}>
                                                      <XCircle className="w-3 h-3" />
                                                    </Button>
                                                  </>
                                                )}
                                                {!laborPaid && !isFinalized && laborApproved && (
                                                  <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px] text-destructive" onClick={() => updateLaborStatus(req.id, "rejected")}>
                                                    <XCircle className="w-3 h-3" />
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                            {pending && (
                                              <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                                                <AlertTriangle className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                                                <span>O técnico/gestor propôs este valor de mão de obra. Aprove ou rejeite para prosseguir.</span>
                                              </p>
                                            )}
                                          </div>
                                        );
                                      })()}
                                      {parts > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("budget_parts")}:</span><span className="font-medium">€{parts.toFixed(2)}</span></div>}
                                    </div>


                                    {reqMaterials.length > 0 && (
                                      <div className="space-y-1.5 pt-1 border-t border-primary/20">
                                        <span className="text-[11px] font-semibold flex items-center gap-1 text-foreground">
                                          <Package className="w-3 h-3" /> {t("materials")}
                                        </span>
                                        {reqMaterials.map((m: any) => {
                                          const isRejected = m.status === "rejected";
                                          return (
                                            <div key={m.id} className="text-[11px] p-1.5 rounded bg-background/60 space-y-1">
                                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <span className={`font-medium ${isRejected ? "line-through text-muted-foreground" : ""}`}>{m.material_name}</span>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className={`font-medium flex items-center gap-0.5 ${isRejected ? "line-through text-muted-foreground" : ""}`}>
                                                    <Euro className="w-3 h-3" />{(Number(m.material_cost) * partsMul).toFixed(2)}
                                                  </span>
                                                  {!isFinalized && m.status === "pending" && (
                                                    <>
                                                      <Badge variant="secondary" className="text-[9px] px-1 animate-pulse">{t("material_status_pending")}</Badge>
                                                      <Button size="sm" variant="default" className="h-5 px-1 text-[10px]" onClick={() => updateMaterialStatus(m.id, "approved", req.id)}>
                                                        <CheckCircle className="w-3 h-3" />
                                                      </Button>
                                                      <Button size="sm" variant="destructive" className="h-5 px-1 text-[10px]" onClick={() => updateMaterialStatus(m.id, "rejected", req.id)}>
                                                        <XCircle className="w-3 h-3" />
                                                      </Button>
                                                    </>
                                                  )}
                                                  {!quotePaid && !isFinalized && m.status === "approved" && (
                                                    <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px] text-destructive hover:text-destructive" onClick={() => updateMaterialStatus(m.id, "rejected", req.id)}>
                                                      <XCircle className="w-3 h-3" />
                                                    </Button>
                                                  )}
                                                </div>
                                              </div>
                                              {(m.photo_url_1 || m.photo_url_2) && (
                                                <div className="flex items-start gap-1.5">
                                                  {m.photo_url_1 && (
                                                    <a href={m.photo_url_1} target="_blank" rel="noopener noreferrer">
                                                      <img src={m.photo_url_1} alt={t("label_photo")} className="w-12 h-12 object-cover rounded border hover:opacity-80 transition-opacity" />
                                                    </a>
                                                  )}
                                                  {m.photo_url_2 && (
                                                    <a href={m.photo_url_2} target="_blank" rel="noopener noreferrer">
                                                      <img src={m.photo_url_2} alt={t("part_photo")} className="w-12 h-12 object-cover rounded border hover:opacity-80 transition-opacity" />
                                                    </a>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                        {matsTotal > 0 && (
                                          <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">{t("total_materials")}:</span>
                                            <span className="font-medium">€{matsTotal.toFixed(2)}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {req.reference?.startsWith("CO") && (() => {
                                      const isVistoria = req.appliance_type?.includes("Vistoria") || req.appliance_type?.includes("Esquentador reparação");
                                      const isInstalacao = req.appliance_type === "Esquentador instalação";
                                      const serviceFee = isVistoria ? 85 : isInstalacao ? 75 : 55;
                                      const bookingPaid = !!(req as any).booking_paid_at;
                                      return (
                                        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 mt-1">
                                          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                                            <span className="font-semibold text-amber-900 flex items-center gap-1">
                                              <DollarSign className="w-3 h-3" />
                                              {t("service_value_title")}:
                                            </span>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="font-bold text-amber-900">€{serviceFee.toFixed(2)}</span>
                                              {bookingPaid ? (
                                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9px] px-1">✓ {t("paid_at_booking")}</Badge>
                                              ) : (
                                                <Badge variant="destructive" className="text-[9px] px-1">{t("pending_payment")}</Badge>
                                              )}
                                            </div>
                                          </div>
                                          <p className="text-[10px] text-amber-800 mt-1">
                                            {t("service_value_note")}
                                          </p>
                                        </div>
                                      );
                                    })()}

                                    <div className="flex justify-between pt-1 border-t border-primary/20"><span className="font-bold text-foreground">{t("budget_total")} ({t("excluding_service_value")}):</span><span className="font-bold text-foreground">€{total.toFixed(2)}</span></div>

                                    {!quotePaid && total > 0 && (
                                      <Button
                                        size="sm"
                                        className="w-full h-9 text-xs font-semibold"
                                        onClick={() => handlePayment(req.id, "labor")}
                                        disabled={payingServiceId === req.id}
                                      >
                                        <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                                        {payingServiceId === req.id ? (t("loading_wait")) : (t("approve_and_pay"))}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })()}


                              {/* Técnico a caminho — ETA */}
                              {(req as any).tech_on_the_way_at && req.status === "accepted" && (
                                <div className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 p-3 text-xs">
                                  <Truck className="w-4 h-4 text-blue-600 shrink-0 animate-pulse" />
                                  <span className="text-blue-900">
                                    <strong>{t("technician_on_the_way")}</strong>
                                    {(req as any).tech_eta_minutes ? <> · chega em <strong>{(req as any).tech_eta_minutes} min</strong></> : null}
                                    {(req as any).tech_eta_distance_km ? <> ({(req as any).tech_eta_distance_km} km)</> : null}
                                  </span>
                                </div>
                              )}

                              {/* Prazo de chegada da peça */}
                              {(req as any).quote_part_arrival_date && (
                                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
                                  <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                                  <span className="text-blue-900">
                                    <strong>{t("part_arrival_business_days")}:</strong>{" "}
                                    {(() => {
                                      const arrival = new Date((req as any).quote_part_arrival_date);
                                      const days = differenceInBusinessDays(arrival, new Date());
                                      if (days <= 0) return <>já disponível ({format(arrival, "dd/MM/yyyy")})</>;
                                      return <>{t("cli_business_days", { count: days, date: format(arrival, "dd/MM/yyyy") })}</>;
                                    })()}
                                  </span>
                                  {(req as any).quote_part_received_at && (
                                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                                      ✓ {t("part_received_label")}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Pagamentos realizados pelo cliente */}
                              {!partnerOrgName && (() => {
                                const bookingPaidAt = (req as any).booking_paid_at as string | null;
                                const laborPaidAt = (req as any).labor_paid_at || (req as any).quote_paid_at as string | null;
                                const materialsPaidAt = (req as any).materials_paid_at as string | null;
                                if (!bookingPaidAt && !laborPaidAt && !materialsPaidAt) return null;
                                const isVistoria = req.appliance_type?.includes("Vistoria") || req.appliance_type?.includes("Esquentador reparação");
                                const isInstalacao = req.appliance_type === "Esquentador instalação";
                                 const bookingBase = isVistoria ? 85 : isInstalacao ? 75 : 55;
                                 const bookingTotal = bookingBase;
                                const labor = Number((req as any).labor_cost || 0);
                                const parts = Number((req as any).quote_parts || 0);
                                const travel = Number((req as any).quote_travel || 0);
                                const extra = Number((req as any).extra_fee || 0);
                                const laborTotal = labor + parts + travel + extra;
                                const reqMats = (materials[req.id] || []).filter(m => m.status !== "rejected");
                                const partsMul = 1;
                                const matsTotal = reqMats.reduce((s, m) => s + Number(m.material_cost) * partsMul, 0);
                                return (
                                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
                                    <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                                      <CheckCircle className="w-3.5 h-3.5" /> {t("payments_made")}
                                    </span>
                                    {bookingPaidAt && req.reference?.startsWith("CO") && (
                                      <div className="flex items-center justify-between text-xs text-emerald-900">
                                        <span>{t("booking_payment")} <span className="text-[10px] text-emerald-700">({format(new Date(bookingPaidAt), "dd/MM/yyyy")})</span></span>
                                        <span className="font-semibold">€{bookingTotal.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {laborPaidAt && (
                                      <div className="flex items-center justify-between text-xs text-emerald-900">
                                        <span>{t("quote_payment")} <span className="text-[10px] text-emerald-700">({format(new Date(laborPaidAt), "dd/MM/yyyy")})</span></span>
                                        <span className="font-semibold">€{laborTotal.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {materialsPaidAt && matsTotal > 0 && (
                                      <div className="flex items-center justify-between text-xs text-emerald-900">
                                        <span>{t("materials_payment")} <span className="text-[10px] text-emerald-700">({format(new Date(materialsPaidAt), "dd/MM/yyyy")})</span></span>
                                        <span className="font-semibold">€{matsTotal.toFixed(2)}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}


                              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                                {req.reference?.startsWith("CO") && req.status === "payment_pending" && (
                                  <Button
                                    size="sm"
                                    className="h-9 text-xs font-semibold shadow-sm"
                                    onClick={() => handlePayment(req.id)}
                                    disabled={payingServiceId === req.id}
                                  >
                                    <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                                    {payingServiceId === req.id ? t("loading_wait") : (t("pay_now"))}
                                  </Button>
                                )}

                                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setSelectedService(req)}>
                                  <Eye className="w-3.5 h-3.5 mr-1.5" />{t("detail_view")}
                                </Button>
                                {renderReturnVisitButton()}
                                {/* Customer warranty request — only within 15 days after completion, no existing request, no partner */}
                                {!partnerOrgName
                                  && req.status === "completed"
                                  && (req as any).completed_at
                                  && differenceInDays(new Date(), new Date((req as any).completed_at)) <= 15
                                  && !(req as any).warranty_return_requested_at && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9 text-xs border-amber-400 text-amber-700 hover:bg-amber-50"
                                    onClick={() => {
                                      setReturnVisitService(req);
                                      setReturnVisitDate(new Date().toISOString().split("T")[0]);
                                      setReturnVisitTime(req.scheduled_time || "09:00");
                                      setReturnVisitDescription("");
                                    }}
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />{t("request_warranty_return")}
                                  </Button>
                                )}
                                {!partnerOrgName && (req as any).warranty_return_requested_at && req.status === "completed" && (
                                  <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">
                                    <ShieldCheck className="w-3 h-3 mr-1" />{t("warranty_requested_badge")}
                                  </Badge>
                                )}

                                {partnerOrgName && req.status === "accepted" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 text-xs"
                                    onClick={() => {
                                      setReturnVisitService(req);
                                      setReturnVisitDate(req.scheduled_date || new Date().toISOString().split("T")[0]);
                                      setReturnVisitTime(req.scheduled_time || "09:00");
                                    }}
                                  >
                                    <Calendar className="w-3.5 h-3.5 mr-1.5" />{"Editar Data"}
                                  </Button>
                                )}
                                {isActiveService(req) && (
                                  canCancelService(req) ? (
                                    <Button variant="ghost" size="sm" className="h-9 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={() => cancelService(req.id)}>
                                      <Ban className="w-3.5 h-3.5 mr-1.5" />{t("cancel_service")}
                                    </Button>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[11px] text-destructive/70 ml-auto">
                                      <AlertTriangle className="w-3 h-3" />{t("cancel_24h_warning", { hours: minHoursBeforeChange })}
                                    </span>
                                  )
                                )}
                              </div>

                              {!partnerOrgName && (() => {
                                const labor = Number((req as any).labor_cost || 0);
                                const parts = Number((req as any).quote_parts || 0);
                                const extra = Number((req as any).extra_fee || 0);
                                const hasQuoteData = labor > 0 || parts > 0 || extra > 0;
                                return (
                                  <>
                                    <AdditionalChargesSection req={req} />
                                    <QuoteSection req={req} />

                                    {!hasQuoteData && <MaterialsSection requestId={req.id} serviceStatus={req.status} />}
                                    <PartnerServiceValueSection req={req} />
                                  </>
                                );
                              })()}

                              {!partnerOrgName && <ReportAndPhotosSection req={req} />}
                              {partnerOrgName && (
                                <Tabs defaultValue="orcamento" className="w-full pt-2">
                                  <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="orcamento">{t("tab_quote")}</TabsTrigger>
                                    <TabsTrigger value="relatorio">{t("tab_report")}</TabsTrigger>
                                  </TabsList>
                                  <TabsContent value="orcamento" className="space-y-3">
                                
                                  {(() => {
                                    const labor = Number((req as any).labor_cost || 0);
                                    const parts = Number((req as any).quote_parts || 0);
                                    const extra = Number((req as any).extra_fee || 0);
                                    const quotePaid = !!(req as any).quote_paid_at || !!(req as any).labor_paid_at;
                                    const hasQuoteData = labor > 0 || parts > 0 || extra > 0;
                                    if (!hasQuoteData) return null;
                                    const reqMaterials = materials[req.id] || [];
                                    const partsMul = 1;
                                    const matsTotal = reqMaterials
                                      .filter(m => m.status !== "rejected")
                                      .reduce((sum, m) => sum + Number(m.material_cost) * partsMul, 0);
                                    const laborRejected = !!(req as any).labor_rejected_at && !(req as any).labor_approved_at && !(req as any).labor_paid_at;
                                    const total = (laborRejected ? 0 : labor) + parts + extra + matsTotal;
                                    const isFinalized = req.status === "completed" || req.status === "cancelled";
                                    return (
                                      <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <DollarSign className="w-4 h-4 text-primary" />
                                          <span className="text-sm font-semibold text-primary">{t("labor_proposal_title")}</span>
                                          {quotePaid && <Badge className="ml-auto bg-emerald-600 hover:bg-emerald-600 text-white text-[10px]">✓ {t("authorized_badge")}</Badge>}
                                        </div>
                                        <div className="text-xs space-y-1">
                                          {extra > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("extra_fee_label")}:</span><span className="font-medium">€{extra.toFixed(2)}</span></div>}
                                          <div className="flex justify-between items-center gap-2">
                                            <span className="text-muted-foreground">{t("budget_labor")}:</span>
                                            <div className="flex items-center gap-1.5">
                                              {laborRejected && <Badge variant="destructive" className="text-[9px] px-1.5">{t("rejected_badge")}</Badge>}
                                              <span className={`font-medium ${laborRejected ? "line-through text-muted-foreground" : ""}`}>€{labor.toFixed(2)}</span>
                                            </div>
                                          </div>
                                          {parts > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("budget_parts")}:</span><span className="font-medium">€{parts.toFixed(2)}</span></div>}
                                        </div>


                                        {reqMaterials.length > 0 && (
                                          <div className="space-y-1.5 pt-1 border-t border-primary/20">
                                            <span className="text-[11px] font-semibold flex items-center gap-1 text-foreground">
                                              <Package className="w-3 h-3" /> {t("materials")}
                                            </span>
                                            {reqMaterials.map((m: any) => {
                                              const isRejected = m.status === "rejected";
                                              return (
                                                <div key={m.id} className="text-[11px] p-1.5 rounded bg-background/60 space-y-1">
                                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <span className={`font-medium ${isRejected ? "line-through text-muted-foreground" : ""}`}>{m.material_name}</span>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className={`font-medium flex items-center gap-0.5 ${isRejected ? "line-through text-muted-foreground" : ""}`}>
                                                        <Euro className="w-3 h-3" />{(Number(m.material_cost) * partsMul).toFixed(2)}
                                                      </span>
                                                      {!isFinalized && m.status === "pending" && (
                                                        <>
                                                          <Badge variant="secondary" className="text-[9px] px-1 animate-pulse">{t("material_status_pending")}</Badge>
                                                          <Button size="sm" variant="default" className="h-5 px-1 text-[10px]" onClick={() => updateMaterialStatus(m.id, "approved", req.id)}>
                                                            <CheckCircle className="w-3 h-3" />
                                                          </Button>
                                                          <Button size="sm" variant="destructive" className="h-5 px-1 text-[10px]" onClick={() => updateMaterialStatus(m.id, "rejected", req.id)}>
                                                            <XCircle className="w-3 h-3" />
                                                          </Button>
                                                        </>
                                                      )}
                                                      {!quotePaid && !isFinalized && m.status === "approved" && (
                                                        <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px] text-destructive hover:text-destructive" onClick={() => updateMaterialStatus(m.id, "rejected", req.id)}>
                                                          <XCircle className="w-3 h-3" />
                                                        </Button>
                                                      )}
                                                      {isRejected && (
                                                        <Badge variant="destructive" className="text-[9px] px-1.5">{t("rejected_badge")}</Badge>
                                                      )}
                                                    </div>
                                                  </div>
                                                  {(m.photo_url_1 || m.photo_url_2) && (
                                                    <div className="flex items-start gap-1.5">
                                                      {m.photo_url_1 && (
                                                        <a href={m.photo_url_1} target="_blank" rel="noopener noreferrer">
                                                          <img src={m.photo_url_1} alt={t("label_photo")} className="w-12 h-12 object-cover rounded border hover:opacity-80 transition-opacity" />
                                                        </a>
                                                      )}
                                                      {m.photo_url_2 && (
                                                        <a href={m.photo_url_2} target="_blank" rel="noopener noreferrer">
                                                          <img src={m.photo_url_2} alt={t("part_photo")} className="w-12 h-12 object-cover rounded border hover:opacity-80 transition-opacity" />
                                                        </a>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                            {matsTotal > 0 && (
                                              <div className="flex justify-between text-xs">
                                                <span className="text-muted-foreground">{t("total_materials")}:</span>
                                                <span className="font-medium">€{matsTotal.toFixed(2)}</span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        <div className="flex justify-between pt-1 border-t border-primary/20"><span className="font-bold text-foreground">Total:</span><span className="font-bold text-foreground">€{total.toFixed(2)}</span></div>

                                        {!quotePaid && req.status !== "quote_accepted" && req.status !== "quote_rejected" && !(req as any).labor_rejected_at && (
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              className="flex-1 h-9 text-xs font-semibold"
                                              onClick={async () => {
                                                setPayingServiceId(req.id);
                                                try {
                                                  // Auto-approve pending materials before authorizing the quote
                                                  await supabase
                                                    .from("service_materials")
                                                    .update({ status: "approved" })
                                                    .eq("service_request_id", req.id)
                                                    .eq("status", "pending");
                                                  const { error } = await supabase
                                                    .from("service_requests")
                                                    .update({ status: "quote_accepted", labor_paid_at: new Date().toISOString() })
                                                    .eq("id", req.id);
                                                  if (error) throw error;
                                                  toast.success(t("quote_approved"));
                                                  fetchRequests();
                                                } catch (e: any) {
                                                  toast.error(e?.message || t("error_approve_quote"));
                                                } finally {
                                                  setPayingServiceId(null);
                                                }
                                              }}
                                              disabled={payingServiceId === req.id}
                                            >
                                              {t("approve_quote")}
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="destructive"
                                              className="flex-1 h-9 text-xs font-semibold"
                                              onClick={async () => {
                                                 setPayingServiceId(req.id);
                                                 try {
                                                   // Reject pending materials alongside the quote rejection
                                                   await supabase
                                                     .from("service_materials")
                                                     .update({ status: "rejected" })
                                                     .eq("service_request_id", req.id)
                                                     .eq("status", "pending");
                                                   const { error } = await supabase
                                                       .from("service_requests")
                                                       .update({ status: "in_progress", labor_rejected_at: new Date().toISOString(), labor_approved_at: null, labor_paid_at: null })
                                                       .eq("id", req.id);
                                                   if (error) throw error;
                                                   toast.success(t("quote_rejected_msg"));
                                                   fetchRequests();
                                                } catch (e: any) {
                                                  toast.error(e?.message || t("error_reject_quote"));
                                                } finally {
                                                  setPayingServiceId(null);
                                                }
                                              }}
                                              disabled={payingServiceId === req.id}
                                            >
                                              {t("reject_quote")}
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Bloco "Pagamentos realizados" removido para cliente parceiro */}
                                  <PartnerServiceValueSection req={req} />
                                  <QuoteSection req={req} />
                                  {(() => {
                                    const labor = Number((req as any).labor_cost || 0);
                                    const parts = Number((req as any).quote_parts || 0);
                                    const extra = Number((req as any).extra_fee || 0);
                                    const hasQuoteData = labor > 0 || parts > 0 || extra > 0;
                                    if (hasQuoteData) return null;
                                    return <MaterialsSection requestId={req.id} serviceStatus={req.status} />;
                                  })()}

                                  </TabsContent>
                                  <TabsContent value="relatorio" className="space-y-3">
                                    <ReportAndPhotosSection req={req} />
                                  </TabsContent>
                                </Tabs>
                              )}
                              {req.status === "completed" && user && (
                                <ServiceRating serviceRequestId={req.id} customerId={user.id} />
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
          </>
        )}

        <ServiceDetailDialog
          service={selectedService}
          open={!!selectedService}
          onOpenChange={(open) => { if (!open) setSelectedService(null); }}
        />
      </main>
      
      {/* Navegação inferior (celular): acesso rápido às ações principais */}
      {!partnerOrgName && (
        <nav aria-label={t("nav_main")} className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 items-center h-16 max-w-md mx-auto">
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground active:text-primary">
              <Home className="w-5 h-5" />{t("nav_home")}
            </button>
            <button type="button" onClick={() => document.getElementById("meus-servicos")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground active:text-primary">
              <ClipboardList className="w-5 h-5" />{t("nav_services")}
            </button>
            <div className="flex justify-center">
              <button type="button" onClick={() => setShowForm(true)} aria-label={t("new_service")} className="-mt-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                <Plus className="w-6 h-6" />
              </button>
            </div>
            <button type="button" onClick={() => setProfileDialogOpen(true)} className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground active:text-primary">
              <UserRound className="w-5 h-5" />{t("nav_profile")}
            </button>
            <button type="button" onClick={async () => { await signOut(); window.location.href = "/auth"; }} className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground active:text-destructive">
              <LogOut className="w-5 h-5" />{t("nav_logout")}
            </button>
          </div>
        </nav>
      )}

      <ChatWidget
        participantType="customer"
        serviceRequests={requests.map(r => ({ id: r.id, reference: r.reference }))}
        bottomClass="bottom-24 sm:bottom-6"
      />

      {/* Return Visit / Edit Date Dialog */}
      <Dialog open={!!returnVisitService} onOpenChange={(open) => { if (!open) { setReturnVisitService(null); setReturnVisitDate(""); setReturnVisitTime(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {returnVisitService?.status === "accepted"
                ? t("cli_edit_date_title")
                : (t("return_visit_confirm"))}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {returnVisitService?.status === "accepted"
              ? t("cli_edit_date_desc")
              : (t("return_visit_confirm_desc"))}
          </p>
          {returnVisitService && (
            <div className="space-y-4 mt-2">
              <p className="text-sm font-medium">{formatServiceReference(returnVisitService as any)} — {cleanApplianceType(returnVisitService.appliance_type)}</p>
              {returnVisitService.status !== "accepted" && returnVisitService.report_text && (
                <div className="space-y-1">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-primary" /> {t("service_report")}
                  </span>
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{returnVisitService.report_text}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {t("date")}</Label>
                  <Input type="date" value={returnVisitDate} onChange={(e) => setReturnVisitDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Clock className="w-4 h-4" /> {t("time")}</Label>
                  <Input type="time" value={returnVisitTime} onChange={(e) => setReturnVisitTime(e.target.value)} />
                </div>
              </div>
              {!partnerOrgName && returnVisitService.status !== "accepted" && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-amber-600" /> {t("warranty_description")}</Label>
                  <Textarea
                    value={returnVisitDescription}
                    onChange={(e) => setReturnVisitDescription(e.target.value)}
                    placeholder={t("placeholder_return_problem")}
                    maxLength={1000}
                    className="min-h-[90px] text-sm"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setReturnVisitService(null); setReturnVisitDate(""); setReturnVisitTime(""); setReturnVisitDescription(""); }}>{t("cancel")}</Button>
            {returnVisitService?.status === "accepted" ? (
              <Button onClick={async () => {
                if (!returnVisitDate || !returnVisitTime) { toast.error(t("error_select_date_time")); return; }
                const { error } = await supabase.from("service_requests").update({ scheduled_date: returnVisitDate, scheduled_time: returnVisitTime }).eq("id", returnVisitService.id);
                if (error) { toast.error(t("error_update_date")); return; }
                toast.success(t("date_updated_success"));
                setReturnVisitService(null); setReturnVisitDate(""); setReturnVisitTime("");
                fetchRequests();
              }}>
                <Calendar className="w-3.5 h-3.5 mr-1.5" />Salvar Data
              </Button>
            ) : (
              <Button onClick={() => returnVisitService && createReturnVisit(returnVisitService, returnVisitDate, returnVisitTime, returnVisitDescription)}>
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />{!partnerOrgName ? (t("submit_warranty_request")) : (t("return_visit"))}
              </Button>
            )}
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerDashboard;
