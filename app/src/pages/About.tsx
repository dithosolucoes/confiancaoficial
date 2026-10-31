import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Wrench, ShieldCheck, Clock, Users, ThumbsUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import logoConfianca from "@/assets/logo-confianca-simple.png";
import techRepair1 from "@/assets/tech-repair-1.jpg";
import techRepair2 from "@/assets/tech-repair-2.jpg";
import techRepair3 from "@/assets/tech-repair-3.jpg";
import techTeam from "@/assets/tech-team.jpg";

const About = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const stats = [
    { value: t("about_stat_years_value"), label: t("about_stat_years_label") },
    { value: t("about_stat_repairs_value"), label: t("about_stat_repairs_label") },
    { value: t("about_stat_satisfaction_value"), label: t("about_stat_satisfaction_label") },
    { value: t("about_stat_response_value"), label: t("about_stat_response_label") },
  ];

  // Mantido alinhado ao catálogo real de tipos (ver src/components/ServiceRequestForm.tsx).
  // "Ar Condicionado" foi removido daqui: não existe como opção no formulário de pedido —
  // anunciar um serviço que o cliente não consegue agendar seria um conteúdo incorreto.
  const services = [
    { icon: Wrench, title: t("about_service_washing_title"), desc: t("about_service_washing_desc") },
    { icon: Wrench, title: t("about_service_fridge_title"), desc: t("about_service_fridge_desc") },
    { icon: Wrench, title: t("about_service_oven_title"), desc: t("about_service_oven_desc") },
    { icon: Wrench, title: t("about_service_electrical_title"), desc: t("about_service_electrical_desc") },
    { icon: Wrench, title: t("about_service_waterheater_title"), desc: t("about_service_waterheater_desc") },
    { icon: Wrench, title: t("about_service_dryer_title"), desc: t("about_service_dryer_desc") },
  ];

  const values = [
    { icon: ShieldCheck, title: t("about_value_trust_title"), desc: t("about_value_trust_desc") },
    { icon: Clock, title: t("about_value_punctuality_title"), desc: t("about_value_punctuality_desc") },
    { icon: ThumbsUp, title: t("about_value_quality_title"), desc: t("about_value_quality_desc") },
    { icon: Users, title: t("about_value_closeness_title"), desc: t("about_value_closeness_desc") },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">{t("about_back")}</span>
          </button>
          <img src={logoConfianca} alt="Confiança" className="h-8 w-auto" />
          <div className="w-16" />
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
        <div className="container mx-auto px-4 py-16 md:py-24 relative">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="animate-fade-in">
              <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-3">{t("about_hero_tag")}</p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground leading-tight mb-5">
                {t("about_hero_title_pre")}{" "}
                <span className="text-primary">{t("about_hero_title_highlight")}</span>
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                {t("about_hero_desc")}
              </p>
              <Button size="lg" onClick={() => navigate("/auth")}>
                {t("about_hero_cta")}
              </Button>
            </div>
            <div className="relative animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <img
                src={techTeam}
                alt="Equipa Confiança"
                className="rounded-2xl shadow-xl w-full object-cover aspect-[4/3]"
                width={896}
                height={640}
              />
              <div className="absolute -bottom-4 -left-4 bg-primary text-primary-foreground rounded-xl px-5 py-3 shadow-lg">
                <p className="text-2xl font-bold">{t("about_stat_years_value")}</p>
                <p className="text-xs opacity-90">{t("about_stat_years_label")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-primary text-primary-foreground py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-3xl md:text-4xl font-display font-bold">{s.value}</p>
                <p className="text-sm opacity-80 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="text-center mb-12">
          <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">{t("about_gallery_tag")}</p>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            {t("about_gallery_title")}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            {t("about_gallery_desc")}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <img src={techRepair1} alt="Técnico reparando máquina de lavar" className="rounded-xl shadow-md w-full object-cover aspect-[4/3]" loading="lazy" width={896} height={640} />
          <img src={techRepair2} alt="Técnico reparando frigorífico" className="rounded-xl shadow-md w-full object-cover aspect-[4/3]" loading="lazy" width={896} height={640} />
          <img src={techRepair3} alt="Técnico reparando forno" className="rounded-xl shadow-md w-full object-cover aspect-[4/3]" loading="lazy" width={896} height={640} />
        </div>
      </section>

      {/* Values */}
      <section className="bg-card border-y border-border py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">{t("about_values_tag")}</p>
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              {t("about_values_title")}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {values.map((v) => (
              <div key={v.title} className="bg-background rounded-xl p-6 text-center border border-border hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mx-auto mb-4">
                  <v.icon className="w-6 h-6 text-accent-foreground" />
                </div>
                <h3 className="font-display font-semibold text-foreground mb-2">{v.title}</h3>
                <p className="text-sm text-muted-foreground">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="text-center mb-12">
          <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">{t("about_services_tag")}</p>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            {t("about_services_title")}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            {t("about_services_desc")}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {services.map((s) => (
            <div key={s.title} className="flex items-start gap-4 bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <s.icon className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">{s.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
            {t("about_cta_title")}
          </h2>
          <p className="opacity-90 mb-8 max-w-lg mx-auto">
            {t("about_cta_desc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" onClick={() => navigate("/auth")}>
              {t("about_cta_schedule")}
            </Button>
            <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" onClick={() => window.open("tel:+351936308848")}>
              <Phone className="w-4 h-4 mr-2" />
              {t("about_cta_call")}
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>{t("footer")}</p>
      </footer>
    </div>
  );
};

export default About;
