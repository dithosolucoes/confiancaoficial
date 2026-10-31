import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate, Navigate } from "react-router-dom";
import {
  Shield,
  Clock,
  CheckCircle,
  Share2,
  Wrench,
  Phone,
  MapPin,
  Calendar,
  Sparkles,
  ChevronRight,
  Copy,
  Check,
  Star,
  ShieldCheck,
  ArrowRight,
  Flame,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import logoConfianca from "@/assets/logo-confianca-simple.png";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import InstallPWAButton from "@/components/InstallPWAButton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// O "name" de cada item é gravado tal e qual em service_requests.appliance_type
// e depois usado por src/lib/vat.ts para decidir a taxa de IVA (6% ou 23%).
// Por isso cada nome aqui precisa bater com VAT_REDUCED_TYPES (exato, por
// segmento separado por "/" ou por substring) — ver src/lib/vat.ts.
// Achado e corrigido nesta rodada: os nomes antigos ("Frigorífico / Combinado
// / Arca", "Máquina de Secar Roupa", "Máquina de Lavar Loiça", "Termoacumulador
// / Esquentador") não batiam com a lista de vat.ts e caíam, incorretamente,
// no IVA de 23% em vez de 6% — um erro real de cobrança em produção.
const APPLIANCES_LIST = [
  { id: "frigorifico", name: "Frigorífico / Refrigerador / Arca", icon: "❄️" },
  { id: "maquina_lavar_roupa", name: "Máquina de Lavar Roupa", icon: "🧺" },
  { id: "maquina_secar", name: "Secadora de Roupa", icon: "🌀" },
  { id: "maquina_loica", name: "Lava-louças", icon: "🍽️" },
  { id: "forno_placa", name: "Forno / Placa Indução / Placa Vitrocerâmica", icon: "🔥" },
  { id: "termoacumulador", name: "Termocumulador reparação / Esquentador reparação", icon: "⚡" },
  { id: "microondas", name: "Micro-ondas e Pequenos Aparelhos", icon: "🍲" },
  { id: "outro", name: "Outro Aparelho / Reparação Geral", icon: "🔧" },
];

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // O nome gravado (appliance_type) fica em português; só a exibição é traduzida.
  const applianceLabel = (id: string) => t(`home_app_${id}_name`);
  const applianceLabelByName = (name: string) => {
    const app = APPLIANCES_LIST.find((a) => a.name === name);
    return app ? applianceLabel(app.id) : name;
  };

  // Modal de Agendamento Rápido
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedAppliance, setSelectedAppliance] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [localidade, setLocalidade] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("manha");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmação de Sucesso
  const [createdReference, setCreatedReference] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://confiancarepara.com";
    const shareData = {
      title: "Confiança Reparações",
      text: t("home_share_text"),
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t("home_toast_link_copied"));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast.success(t("home_toast_link_copied"));
        } catch {
          toast.error(t("home_toast_share_failed"));
        }
      }
    }
  };

  const handleQuickBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppliance) {
      toast.error(t("home_toast_select_appliance"));
      return;
    }
    if (!contactName.trim() || !contactPhone.trim() || !address.trim()) {
      toast.error(t("home_toast_fill_contact"));
      return;
    }

    setIsSubmitting(true);
    const ref = `CO${Math.floor(100000 + Math.random() * 900000)}`;
    const timeLabel = preferredTime === "manha" ? "Manhã (09h - 13h)" : preferredTime === "tarde" ? "Tarde (14h - 18h)" : "Urgente / Primeiro Horário";

    const requestPayload = {
      reference: ref,
      appliance_type: selectedAppliance,
      description: description.trim() || `Agendamento rápido pelo website para ${selectedAppliance}`,
      scheduled_date: preferredDate || new Date().toISOString().split("T")[0],
      scheduled_time: timeLabel,
      contact_name: contactName.trim(),
      contact_phone: contactPhone.trim(),
      address: address.trim(),
      postal_code: postalCode.trim() || "1000-001",
      localidade: localidade.trim() || "Lisboa",
      status: "pending",
      is_warranty: false,
    };

    try {
      // O pedido só é confirmado quando o servidor grava. Nada de "registado" sem gravação.
      const { error: insertErr } = await supabase
        .from("service_requests")
        .insert(requestPayload as any);
      if (insertErr) throw insertErr;

      setCreatedReference(ref);
      toast.success(t("home_toast_request_ok"));
    } catch (err: any) {
      console.error("Erro ao registar pedido:", err);
      toast.error(t("home_toast_request_fail"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyRefToClipboard = () => {
    if (createdReference) {
      navigator.clipboard.writeText(createdReference);
      setCopied(true);
      toast.success(t("home_toast_ref_copied"));
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetBookingForm = () => {
    setIsBookingOpen(false);
    setCreatedReference(null);
    setSelectedAppliance("");
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setAddress("");
    setPostalCode("");
    setLocalidade("");
    setPreferredDate("");
    setDescription("");
  };

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const features = [
    {
      icon: Clock,
      title: t("home_feature_1_title"),
      desc: t("home_feature_1_desc"),
    },
    {
      icon: ShieldCheck,
      title: t("home_feature_2_title"),
      desc: t("home_feature_2_desc"),
    },
    {
      icon: CheckCircle,
      title: t("home_feature_3_title"),
      desc: t("home_feature_3_desc"),
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-amber-500/20">
      {/* Top Header Comercial */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur border-b border-border shadow-xs">
        <div className="container mx-auto px-4 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <img
              src={logoConfianca}
              alt="Confiança Reparações"
              className="h-10 sm:h-12 w-auto object-contain"
            />
            <div className="hidden sm:block">
              <span className="font-display font-bold text-lg tracking-tight text-foreground block leading-none">
                Confiança Repara
              </span>
              <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
                {t("home_brand_tagline")}
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#aparelhos" className="hover:text-foreground transition-colors">
              {t("home_nav_appliances")}
            </a>
            <a href="#vantagens" className="hover:text-foreground transition-colors">
              {t("home_nav_advantages")}
            </a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">
              {t("home_nav_how")}
            </a>
            <button onClick={() => navigate("/about")} className="hover:text-foreground transition-colors">
              {t("home_nav_about")}
            </button>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/auth")}
              className="text-xs sm:text-sm font-medium"
            >
              {t("home_login")}
            </Button>

            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm text-xs sm:text-sm px-3 sm:px-4"
              onClick={() => setIsBookingOpen(true)}
            >
              <Wrench className="w-4 h-4 mr-1.5 hidden sm:inline" />
              {t("home_book_cta")}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-16 sm:py-24 border-b border-border bg-gradient-to-b from-card via-background to-background">
          <div className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(#C79A3B_1px,transparent_1px)] [background-size:24px_24px]" />

          <div className="container mx-auto px-4 relative z-10 text-center max-w-3xl">
            <Badge variant="outline" className="mb-6 px-3 py-1 border-primary/30 text-primary bg-primary/5 text-xs sm:text-sm font-medium rounded-full inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              {t("home_badge_area")}
            </Badge>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-display font-extrabold text-foreground leading-[1.15] mb-6">
              {t("home_hero_title_pre")}{" "}
              <span className="text-amber-600 dark:text-amber-500 underline decoration-amber-500/40 decoration-wavy">
                {t("home_hero_title_highlight")}
              </span>
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              {t("home_hero_desc")}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
              <Button
                size="lg"
                className="w-full sm:w-auto h-12 px-7 text-base font-bold shadow-lg hover:shadow-xl transition-all"
                onClick={() => setIsBookingOpen(true)}
              >
                <Calendar className="w-5 h-5 mr-2" />
                {t("home_hero_cta")}
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto h-12 px-6 text-base font-medium"
                onClick={() => navigate("/auth")}
              >
                {t("home_hero_account")}
              </Button>

              <Button
                size="lg"
                variant="ghost"
                className="w-full sm:w-auto h-12 px-4 text-muted-foreground hover:text-foreground"
                onClick={handleShare}
                title={t("home_share_title")}
              >
                <Share2 className="w-4 h-4 mr-1.5" />
                {t("home_share_btn")}
              </Button>
            </div>

            {/* Link para Técnicos e Empresas Parceiras */}
            <div className="mt-6 text-xs sm:text-sm text-muted-foreground flex items-center justify-center gap-2 flex-wrap">
              <span>{t("home_partner_q")}</span>
              <button
                onClick={() => navigate("/auth")}
                className="text-primary hover:underline font-semibold inline-flex items-center gap-0.5"
              >
                {t("home_partner_cta")}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Destaque App PWA */}
            <div className="mt-12 mx-auto max-w-xl">
              <div className="relative bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-5 sm:p-6 shadow-xl border border-slate-800 text-left flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      {t("home_pwa_tag")}
                    </p>
                  </div>
                  <h3 className="font-display font-bold text-lg sm:text-xl text-white">
                    {t("home_pwa_title")}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {t("home_pwa_desc")}
                  </p>
                </div>
                <InstallPWAButton variant="hero" className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shrink-0 text-xs sm:text-sm" />
              </div>
            </div>
          </div>
        </section>

        {/* Secção Aparelhos Atendidos */}
        <section id="aparelhos" className="py-16 bg-card border-b border-border">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-3">
                {t("home_appliances_title")}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                {t("home_appliances_desc")}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
              {APPLIANCES_LIST.map((appliance) => (
                <div
                  key={appliance.id}
                  onClick={() => {
                    setSelectedAppliance(appliance.name);
                    setIsBookingOpen(true);
                  }}
                  className="p-5 rounded-xl border border-border bg-background hover:border-amber-500/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="text-3xl mb-3">{appliance.icon}</div>
                    <h3 className="font-display font-bold text-base text-foreground group-hover:text-primary transition-colors mb-1">
                      {applianceLabel(appliance.id)}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(`home_app_${appliance.id}_desc`)}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-primary">
                    <span>{t("home_appliance_cta")}</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Secção Vantagens */}
        <section id="vantagens" className="py-16 bg-background border-b border-border">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-3">
                {t("home_advantages_title")}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                {t("home_advantages_desc")}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {features.map((f, i) => (
                <div
                  key={f.title}
                  className="bg-card border border-border rounded-xl p-6 text-center shadow-xs"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-display font-semibold text-foreground text-lg mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Secção Como Funciona */}
        <section id="como-funciona" className="py-16 bg-card border-b border-border">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-3">
                {t("home_how_title")}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                {t("home_how_desc")}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 relative">
              <div className="p-5 rounded-xl border border-border bg-background relative space-y-3">
                <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
                  1
                </span>
                <h4 className="font-bold text-base">{t("home_step1_title")}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("home_step1_desc")}
                </p>
              </div>

              <div className="p-5 rounded-xl border border-border bg-background relative space-y-3">
                <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
                  2
                </span>
                <h4 className="font-bold text-base">{t("home_step2_title")}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("home_step2_desc")}
                </p>
              </div>

              <div className="p-5 rounded-xl border border-border bg-background relative space-y-3">
                <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
                  3
                </span>
                <h4 className="font-bold text-base">{t("home_step3_title")}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("home_step3_desc")}
                </p>
              </div>
            </div>

            <div className="mt-10 text-center">
              <Button size="lg" className="font-bold px-8" onClick={() => setIsBookingOpen(true)}>
                {t("home_how_cta")}
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Comercial Limpo */}
      <footer className="border-t border-border bg-card py-10 text-sm text-muted-foreground">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <img src={logoConfianca} alt="Confiança Repara" className="h-8 w-auto" />
                <span className="font-display font-bold text-foreground text-base">Confiança Repara</span>
              </div>
              <p className="text-xs leading-relaxed">
                {t("home_footer_desc")}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">{t("home_footer_contacts")}</h4>
              <p className="text-xs flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" />
                <a href="tel:+351936308848" className="hover:text-primary transition-colors font-medium">
                  +351 936 308 848
                </a>
              </p>
              <p className="text-xs">
                Email:{" "}
                <a href="mailto:confiancaversatilidade@gmail.com" className="hover:text-primary transition-colors font-medium">
                  confiancaversatilidade@gmail.com
                </a>
              </p>
              <p className="text-xs flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span>{t("home_footer_area")}</span>
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">{t("home_footer_access")}</h4>
              <ul className="text-xs space-y-1">
                <li>
                  <button onClick={() => navigate("/auth")} className="hover:underline text-primary">
                    {t("home_portal_client")}
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/auth")} className="hover:underline text-primary">
                    {t("home_portal_tech")}
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/auth")} className="hover:underline text-primary">
                    {t("home_portal_company")}
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <p>{t("home_footer_rights", { year: new Date().getFullYear() })}</p>
            <p className="text-muted-foreground">{t("home_footer_tagline")}</p>
          </div>
        </div>
      </footer>

      {/* Modal de Agendamento Rápido de Assistência Técnica */}
      <Dialog open={isBookingOpen} onOpenChange={(open) => { if (!open) resetBookingForm(); else setIsBookingOpen(true); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          {createdReference ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8" />
              </div>
              <DialogTitle className="font-display text-2xl font-bold">
                {t("home_success_title")}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("home_success_desc")}
              </DialogDescription>

              <div className="bg-muted p-4 rounded-xl border border-border max-w-sm mx-auto space-y-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t("home_success_ref_label")}
                </span>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-mono font-bold text-primary">{createdReference}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={copyRefToClipboard} title={t("home_copy")}>
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>{t("home_success_contact")} <strong>{contactPhone}</strong> ({contactName})</p>
                <p>{t("home_success_appliance")} <strong>{applianceLabelByName(selectedAppliance)}</strong></p>
                <p>{t("home_success_address")} <strong>{address}</strong></p>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-2 justify-center">
                <Button className="w-full sm:w-auto" onClick={resetBookingForm}>
                  {t("home_success_done")}
                </Button>
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate("/auth")}>
                  {t("home_success_client_area")}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleQuickBooking} className="space-y-4">
              <DialogHeader>
                <DialogTitle className="font-display text-xl font-bold flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-primary" />
                  {t("home_modal_title")}
                </DialogTitle>
                <DialogDescription>
                  {t("home_modal_desc")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="appliance" className="text-xs font-semibold">
                    {t("home_field_appliance")}
                  </Label>
                  <Select value={selectedAppliance} onValueChange={setSelectedAppliance} required>
                    <SelectTrigger id="appliance">
                      <SelectValue placeholder={t("home_field_appliance_ph")} />
                    </SelectTrigger>
                    <SelectContent>
                      {APPLIANCES_LIST.map((app) => (
                        <SelectItem key={app.id} value={app.name}>
                          {app.icon} {applianceLabel(app.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="contactName" className="text-xs font-semibold">
                      {t("home_field_name")}
                    </Label>
                    <Input
                      id="contactName"
                      placeholder={t("home_field_name_ph")}
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contactPhone" className="text-xs font-semibold">
                      {t("home_field_phone")}
                    </Label>
                    <Input
                      id="contactPhone"
                      placeholder={t("home_field_phone_ph")}
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="address" className="text-xs font-semibold">
                      {t("home_field_address")}
                    </Label>
                    <Input
                      id="address"
                      placeholder={t("home_field_address_ph")}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode" className="text-xs font-semibold">
                      {t("home_field_postal")}
                    </Label>
                    <Input
                      id="postalCode"
                      placeholder={t("home_field_postal_ph")}
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="preferredDate" className="text-xs font-semibold">
                      {t("home_field_date")}
                    </Label>
                    <Input
                      id="preferredDate"
                      type="date"
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="preferredTime" className="text-xs font-semibold">
                      {t("home_field_window")}
                    </Label>
                    <Select value={preferredTime} onValueChange={setPreferredTime}>
                      <SelectTrigger id="preferredTime">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manha">{t("home_window_morning")}</SelectItem>
                        <SelectItem value="tarde">{t("home_window_afternoon")}</SelectItem>
                        <SelectItem value="urgente">{t("home_window_asap")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs font-semibold">
                    {t("home_field_description")}
                  </Label>
                  <Textarea
                    id="description"
                    rows={3}
                    placeholder={t("home_field_description_ph")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter className="pt-3">
                <Button type="button" variant="outline" onClick={() => setIsBookingOpen(false)}>
                  {t("home_cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting} className="font-semibold">
                  {isSubmitting ? t("home_submitting") : t("home_confirm")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
