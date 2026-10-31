import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Camera, Info, Copy } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Technician {
  user_id: string;
  full_name: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
  technicians?: Technician[];
  isGestor?: boolean;
}

const ServiceRequestForm = ({ onClose, onCreated, technicians, isGestor = false }: Props) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [applianceType, setApplianceType] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [isWarranty, setIsWarranty] = useState(false);
  const [localidade, setLocalidade] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [loading, setLoading] = useState(false);
  const [equipmentPhotos, setEquipmentPhotos] = useState<File[]>([]);
  const [equipmentPhotoPreviews, setEquipmentPhotoPreviews] = useState<string[]>([]);
  const equipmentPhotoRef = useRef<HTMLInputElement>(null);
  const [isPartner, setIsPartner] = useState(false);
  const [manualReference, setManualReference] = useState("");
  const [deslocacaoFee, setDeslocacaoFee] = useState("");
  const [savedProfile, setSavedProfile] = useState<any>(null);
  const [applianceOptions, setApplianceOptions] = useState<string[]>([]);
  const [applianceOptionsError, setApplianceOptionsError] = useState(false);
  const [applianceNotices, setApplianceNotices] = useState<Record<string, { title: string | null; message: string | null }>>({});
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState("");

  useEffect(() => {
    supabase
      .from("service_types" as any)
      .select("id,name,base_fee,steps")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setServiceTypes((data as any[]) || []));
  }, []);

  const selectedServiceType = serviceTypes.find((st) => st.id === serviceTypeId) || null;

  // Tipos de aparelho vêm do catálogo no banco (appliance_types), o mesmo que o gestor edita.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("appliance_types" as any)
        .select("name, notice_title, notice_message")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (!active) return;
      if (error) { setApplianceOptionsError(true); return; }
      const rows = (data as any[]) || [];
      setApplianceOptions(rows.map((r) => r.name as string));
      const notices: Record<string, { title: string | null; message: string | null }> = {};
      rows.forEach((r) => { notices[r.name as string] = { title: r.notice_title ?? null, message: r.notice_message ?? null }; });
      setApplianceNotices(notices);
    })();
    return () => { active = false; };
  }, []);

  const applyProfileData = async (data: any) => {
    let profile = data;
    // Always re-fetch fresh profile in case user updated it
    if (user) {
      const { data: fresh } = await supabase
        .from("profiles")
        .select("full_name, phone, address, billing_address, postal_code, localidade, address_complement")
        .eq("user_id", user.id)
        .single();
      if (fresh) {
        profile = fresh;
        setSavedProfile(fresh);
      }
    }
    if (!profile) {
      toast.error(t("no_profile_data"));
      return;
    }
    const addr = profile.address || profile.billing_address || "";
    const filled: string[] = [];
    if (profile.full_name) { setContactName(profile.full_name); filled.push("nome"); }
    if (profile.phone) { setContactPhone(profile.phone); filled.push("telefone"); }
    if (addr) { setAddress(addr); filled.push("morada"); }
    if (profile.postal_code) { setPostalCode(profile.postal_code); filled.push("CP"); }
    if (profile.localidade) { setLocalidade(profile.localidade); filled.push("localidade"); }
    if (profile.address_complement) { setAddressComplement(profile.address_complement); filled.push("complemento"); }
    const allFields = [
      { key: "full_name", label: t("cli_field_name") },
      { key: "phone", label: t("cli_field_phone") },
      { key: "address", label: t("cli_field_address") },
      { key: "postal_code", label: t("cli_field_postal") },
      { key: "localidade", label: t("cli_field_localidade") },
    ];
    const missing = allFields
      .filter((f) => !((profile as any)[f.key]) && !(f.key === "address" && profile.billing_address))
      .map((f) => f.label);
    if (filled.length === 0) {
      toast.error(t("error_profile_empty"));
    } else if (missing.length > 0) {
      toast.success(`${t("profile_data_applied")}: ${filled.join(", ")}. ${t("missing_in_profile")}: ${missing.join(", ")}.`, { duration: 6000 });
    } else {
      toast.success(t("profile_data_applied"));
    }
  };

  // Auto-fill from customer profile
  useEffect(() => {
    if (!user || isGestor) return;
    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, address, billing_address, is_partner, postal_code, localidade, address_complement")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setSavedProfile(data);
        if (data.full_name) setContactName(data.full_name);
        if (data.phone) setContactPhone(data.phone);
        if (data.address) setAddress(data.address);
        if (data.is_partner) setIsPartner(true);
        if ((data as any).postal_code) setPostalCode((data as any).postal_code);
        if ((data as any).localidade) setLocalidade((data as any).localidade);
        if ((data as any).address_complement) setAddressComplement((data as any).address_complement);
      }
    };
    loadProfile();
  }, [user, isGestor]);

  const handleEquipmentPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 5 - equipmentPhotos.length;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length > 0) {
      setEquipmentPhotos(prev => [...prev, ...toAdd]);
      setEquipmentPhotoPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))]);
    }
    if (e.target) e.target.value = "";
  };

  const removeEquipmentPhoto = (index: number) => {
    setEquipmentPhotos(prev => prev.filter((_, i) => i !== index));
    setEquipmentPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!applianceType) { toast.error(t("select_placeholder")); return; }
    setLoading(true);
    const generatedRef = isGestor && manualReference.trim()
      ? manualReference.trim()
      : `CO${String(Math.floor(100000 + Math.random() * 900000))}`;

    // Check for duplicate reference
    const { data: existing } = await supabase
      .from("service_requests")
      .select("id")
      .eq("reference", generatedRef)
      .limit(1);
    if (existing && existing.length > 0) {
      toast.error(t("duplicate_reference"));
      setLoading(false);
      return;
    }

    // Determine if this is a non-partner customer CO service that requires payment
    const isCustomerCO = !isGestor && generatedRef.startsWith("CO") && applianceType !== "Termocumulador instalação ( até 100 Lt )";
    let requiresPayment = false;
    if (isCustomerCO) {
      const { data: profileData } = await supabase.from("profiles").select("is_partner").eq("user_id", user.id).single();
      const { count: partnerMemberCount } = await supabase
        .from("partner_members")
        .select("organization_id", { count: "exact", head: true })
        .eq("user_id", user.id);
      const isPartner = profileData?.is_partner === true || (partnerMemberCount ?? 0) > 0;
      // Garantia/retrabalho não paga visita: vai direto para os técnicos.
      requiresPayment = !isPartner && !isWarranty;
    }

    const insertData: any = {
      customer_id: user.id, appliance_type: applianceType, description: description.trim(),
      scheduled_date: scheduledDate, scheduled_time: scheduledTime, address: address.trim(),
      address_complement: addressComplement.trim(),
      postal_code: postalCode.trim(), contact_name: contactName.trim(), contact_phone: contactPhone.trim(),
      reference: generatedRef,
      is_warranty: isWarranty,
      localidade: localidade.trim(),
      ...(selectedServiceType
        ? {
            service_type_id: selectedServiceType.id,
            service_type_base_fee: Number(selectedServiceType.base_fee),
            service_steps: Array.isArray(selectedServiceType.steps) ? selectedServiceType.steps : [],
          }
        : {}),
      ...(requiresPayment ? { status: "payment_pending" } : {}),
    };
    if (isGestor) {
      const parsedFee = parseFloat(deslocacaoFee.replace(",", "."));
      if (!isNaN(parsedFee) && parsedFee >= 0) {
        insertData.deslocacao_fee = parsedFee;
      }
    }
    if (selectedTechnician) {
      insertData.technician_id = selectedTechnician;
    }
    const { data: insertedData, error } = await supabase.from("service_requests").insert(insertData).select("id").single();
    if (error || !insertedData) { toast.error(t("error_create")); setLoading(false); return; }

    // Upload equipment photos if provided (up to 5)
    if (equipmentPhotos.length > 0) {
      const uploadedUrls: string[] = [];
      for (const photo of equipmentPhotos) {
        const ext = photo.name.split('.').pop();
        const path = `${insertedData.id}/equipment-ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("equipment-photos").upload(path, photo, { upsert: true });
        if (!uploadError) {
          const { data: signed } = await supabase.storage.from("equipment-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
          if (signed?.signedUrl) uploadedUrls.push(signed.signedUrl);
        }
      }
      if (uploadedUrls.length > 0) {
        await supabase.from("service_requests").update({ equipment_photo_url: JSON.stringify(uploadedUrls) } as any).eq("id", insertedData.id);
      }
    }
    supabase.functions.invoke("send-notification", {
      body: { type: "service_created", customerId: user.id, customerEmail: user.email, customerName: contactName.trim() || user.email, applianceType, scheduledDate, scheduledTime, address: address.trim() },
    }).catch((err) => console.error("Email notification error:", err));
    if (selectedTechnician) {
      supabase.functions.invoke("send-notification", {
        body: { type: "service_assigned", technicianId: selectedTechnician, applianceType, scheduledDate, scheduledTime, address: address.trim(), reference: generatedRef },
      }).catch((err) => console.error("Technician notification error:", err));
    } else if (!requiresPayment) {
      // Only notify available technicians if no payment is pending — otherwise wait for manager confirmation
      supabase.functions.invoke("send-notification", {
        body: { type: "service_available", applianceType },
      }).catch((err) => console.error("Technician notification error:", err));
    }
    // CO services: cria sessão Stripe; ao confirmar pagamento, status passa a "pending" e fica disponível para técnicos
    if (requiresPayment) {
      toast.info(t("redirecting_payment"));
      try {
        const { data: payData, error: payErr } = await supabase.functions.invoke("create-payment", {
          body: { service_request_id: insertedData.id, payment_type: "booking" },
        });
        if (payErr || !payData?.url) throw payErr || new Error(t("cli_payment_url_missing"));
        window.open(payData.url, "_blank");
      } catch (e) {
        console.error("create-payment error", e);
        toast.error(t("error_start_payment"));
      }
      onCreated();
      return;
    }

    toast.success(t("service_scheduled"));
    onCreated();
  };

  return (
    <Card className="mb-6 animate-fade-in border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-display">{t("new_service_title")}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isGestor && savedProfile && (savedProfile.address || savedProfile.full_name || savedProfile.phone) && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm text-foreground">
                {t("use_saved_profile_hint")}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => applyProfileData(savedProfile)}>
                {t("use_saved_profile")}
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {isGestor && (
              <div className="space-y-2">
                <Label htmlFor="manualReference">{t("reference")}</Label>
                <Input id="manualReference" placeholder="Ex: WO3065907" value={manualReference} onChange={(e) => setManualReference(e.target.value)} required maxLength={30} />
              </div>
            )}
            {isGestor && (
              <div className="space-y-2">
                <Label htmlFor="deslocacaoFee">{t("cli_deslocacao_label")} <span className="text-xs text-muted-foreground">{t("cli_optional")}</span></Label>
                <Input id="deslocacaoFee" type="text" inputMode="decimal" placeholder="0,00" value={deslocacaoFee} onChange={(e) => setDeslocacaoFee(e.target.value)} maxLength={10} />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("appliance_type")}</Label>
              <Select value={applianceType} onValueChange={setApplianceType} required>
                <SelectTrigger><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                <SelectContent>{applianceOptions.map((type) => (
                  <SelectItem key={type} value={type} className="relative pr-10">
                    <span className="select-text">{type}</span>
                    <span
                      role="button"
                      aria-label={`Copiar ${type}`}
                      title={t("home_copy")}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          navigator.clipboard?.writeText(type);
                          toast.success(t("cli_copied"));
                        } catch {
                          toast.error(t("cli_copy_failed"));
                        }
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer inline-flex"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </span>
                  </SelectItem>
                ))}
                {applianceOptionsError && (
                  <div className="px-2 py-1.5 text-sm text-destructive">{t("appliance_types_error")}</div>
                )}
                {!applianceOptionsError && applianceOptions.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("appliance_types_empty")}</div>
                )}
              </SelectContent>
              </Select>
              {applianceType && !isPartner && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 mt-1">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs text-foreground space-y-1">
                    {/* Aviso vem do catálogo (appliance_types.notice_*); sem aviso cadastrado, usa o genérico. */}
                    <p className="font-semibold">
                      {applianceNotices[applianceType]?.title || t("default_price_title")}
                    </p>
                    <p>{applianceNotices[applianceType]?.message || t("default_price_message")}</p>
                  </div>
                </div>
              )}
            </div>
            {/* Sempre visível: sem tipos cadastrados, mostra só a opção "sem tipo". */}
            {(
              <div className="space-y-2">
                <Label>{t("service_type")}</Label>
                <Select value={serviceTypeId || "none"} onValueChange={(v) => setServiceTypeId(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("service_type_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("service_type_none")}</SelectItem>
                    {serviceTypes.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.name} — € {Number(st.base_fee).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedServiceType && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
                    <p className="font-semibold">{t("service_type_base_fee")}: € {Number(selectedServiceType.base_fee).toFixed(2)}</p>
                    {Array.isArray(selectedServiceType.steps) && selectedServiceType.steps.length > 0 && (
                      <div>
                        <p className="font-semibold">{t("service_type_steps")}</p>
                        <ol className="list-decimal pl-4">
                          {selectedServiceType.steps.map((step: string, i: number) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="address">{t("address")}</Label>
              <Input id="address" placeholder={t("address_placeholder")} value={address} onChange={(e) => setAddress(e.target.value)} required maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressComplement">{t("address_complement")}</Label>
              <Input id="addressComplement" placeholder={t("address_complement_placeholder")} value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">{t("postal_code")}</Label>
              <Input id="postalCode" placeholder="0000-000" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="localidade">{t("localidade")}</Label>
              <Input id="localidade" placeholder={t("localidade_placeholder")} value={localidade} onChange={(e) => setLocalidade(e.target.value)} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">{t("contact_name")}</Label>
              <Input id="contactName" placeholder={t("contact_name_placeholder")} value={contactName} onChange={(e) => setContactName(e.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">{t("contact_phone")}</Label>
              <Input id="contactPhone" placeholder={t("contact_phone_placeholder")} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">{t("date")}</Label>
              <Input id="date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} {...(!isGestor && { min: new Date().toISOString().split("T")[0] })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">{t("time")}</Label>
              <Input id="time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} required />
              <p className="text-xs text-muted-foreground">{t("time_hint")}</p>
            </div>
            {isGestor && (
              <div className="flex items-center space-x-2 self-end pb-2">
                <Checkbox id="warranty" checked={isWarranty} onCheckedChange={(checked) => setIsWarranty(checked === true)} />
                <Label htmlFor="warranty" className="cursor-pointer">{t("warranty")}</Label>
              </div>
            )}
            {technicians && technicians.length > 0 && (
              <div className="space-y-2">
                <Label>{t("assign_technician")}</Label>
                <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                  <SelectTrigger><SelectValue placeholder={t("assign_technician_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    {technicians.filter(tech => tech.full_name).map((tech) => (
                      <SelectItem key={tech.user_id} value={tech.user_id}>{tech.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {/* Equipment Photo Upload - up to 5 */}
          <div className="space-y-2">
            <Label>{t("equipment_photo_label")} <span className="text-xs text-muted-foreground">({equipmentPhotoPreviews.length}/5)</span></Label>
            <input ref={equipmentPhotoRef} type="file" accept="image/*" multiple className="hidden" onChange={handleEquipmentPhotoChange} />
            <div className="flex flex-wrap items-center gap-3">
              {equipmentPhotoPreviews.map((preview, index) => (
                <div key={index} className="relative group rounded overflow-hidden border w-20 h-20">
                  <img src={preview} alt={`Equipment ${index + 1}`} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeEquipmentPhoto(index)} className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {equipmentPhotoPreviews.length < 5 && (
                <button
                  type="button"
                  onClick={() => equipmentPhotoRef.current?.click()}
                  className="w-20 h-20 border-2 border-dashed rounded flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  <span className="text-[9px] mt-1">{t("add_photo")}</span>
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">{t("problem_description")}</Label>
            <Textarea id="desc" placeholder={t("problem_placeholder")} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={500} rows={3} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" type="button" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" disabled={loading || (isGestor && !manualReference.trim())}>{loading ? t("scheduling") : t("schedule_service")}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default ServiceRequestForm;
