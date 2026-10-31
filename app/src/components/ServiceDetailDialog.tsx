import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Phone, User, Wrench, Shield, FileText, Hash } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { formatServiceReference } from "@/lib/serviceLabel";

const dateFnsLocales: Record<string, typeof ptBR> = { pt: ptBR, en: enUS, es };

interface ServiceDetail {
  id: string;
  reference: string;
  appliance_type: string;
  description: string;
  scheduled_date: string;
  scheduled_time: string;
  address: string;
  postal_code?: string | null;
  localidade?: string | null;
  contact_name: string;
  contact_phone: string;
  equipment_brand?: string | null;
  equipment_model?: string | null;
  equipment_age?: string | null;
  equipment_number?: string | null;
  is_warranty?: boolean;
  status: string;
  created_at: string;
  estimated_arrival_time?: string | null;
  technician_name?: string;
  technician_phone?: string;
}

interface ServiceDetailDialogProps {
  service: ServiceDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ServiceDetailDialog = ({ service, open, onOpenChange }: ServiceDetailDialogProps) => {
  const { t, i18n } = useTranslation();
  const currentLocale = dateFnsLocales[i18n.language] || ptBR;

  if (!service) return null;

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: t("status_pending"), variant: "secondary" },
    accepted: { label: t("status_accepted"), variant: "default" },
    in_progress: { label: t("status_in_progress"), variant: "default" },
    completed: { label: t("status_completed"), variant: "outline" },
    cancelled: { label: t("status_cancelled"), variant: "destructive" },
  };

  const statusInfo = statusMap[service.status] || statusMap.pending;

  const DetailRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-3 py-2">
        <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium text-foreground">{value}</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-display">{service.appliance_type}</DialogTitle>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          {service.reference && (
            <Badge variant="outline" className="w-fit text-xs font-mono">{formatServiceReference(service as any)}</Badge>
          )}
        </DialogHeader>

        <div className="space-y-1 divide-y divide-border">
          {/* Description */}
          <div className="pb-3">
            <div className="flex items-start gap-3 py-2">
              <FileText className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("problem_description")}</p>
                <p className="text-sm text-foreground">{service.description}</p>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="py-3 space-y-1">
            <DetailRow icon={Calendar} label={t("date")} value={format(new Date(service.scheduled_date), "dd MMMM yyyy", { locale: currentLocale })} />
            <DetailRow icon={Clock} label={t("time")} value={service.scheduled_time} />
          </div>

          {/* Location */}
          <div className="py-3 space-y-1">
            <DetailRow icon={MapPin} label={t("address")} value={service.address} />
            {(service as any).address_complement && <DetailRow icon={MapPin} label={t("address_complement")} value={(service as any).address_complement} />}
            <DetailRow icon={MapPin} label={t("postal_code")} value={service.postal_code} />
            <DetailRow icon={MapPin} label={t("detail_localidade")} value={service.localidade} />
          </div>

          {/* Contact at residence */}
          <div className="py-3 space-y-1">
            <DetailRow icon={User} label={t("contact_name")} value={service.contact_name} />
            <DetailRow icon={Phone} label={t("contact_phone")} value={service.contact_phone} />
          </div>

          {/* Technician */}
          {service.technician_name && (
            <div className="py-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("detail_technician_section")}</p>
              <DetailRow icon={Wrench} label={t("detail_technician_name")} value={service.technician_name} />
              <DetailRow icon={Phone} label={t("detail_technician_phone")} value={service.technician_phone} />
              <DetailRow icon={Clock} label={t("detail_eta")} value={service.estimated_arrival_time} />
            </div>
          )}

          {/* Equipment */}
          {(service.equipment_brand || service.equipment_model || service.equipment_age || service.equipment_number) && (
            <div className="py-3 space-y-1">
              <DetailRow icon={Wrench} label={t("equipment_brand")} value={service.equipment_brand} />
              <DetailRow icon={Wrench} label={t("equipment_model")} value={service.equipment_model} />
              <DetailRow icon={Hash} label={t("equipment_number")} value={service.equipment_number} />
              <DetailRow icon={Clock} label={t("equipment_age")} value={service.equipment_age} />
            </div>
          )}

          {/* Warranty */}
          {service.is_warranty && (
            <div className="py-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <Badge variant="default" className="text-xs">{t("warranty")}</Badge>
              </div>
            </div>
          )}

          {/* Created at */}
          <div className="pt-3">
            <p className="text-xs text-muted-foreground">
              {t("detail_created_at")}: {format(new Date(service.created_at), "dd MMM yyyy, HH:mm", { locale: currentLocale })}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceDetailDialog;
