import React, { useState, useRef } from "react";
import { Package, Plus, X, Upload, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { saveMaterialInsert, isNetworkError } from "@/lib/technicianOutbox";
import { usePlatformSettingNumber } from "@/hooks/usePlatformSettingNumber";
import { PARTS_MARKUP_DEFAULT_PCT, applyPartsMarkup } from "@/lib/parts-markup";

export interface ServiceMaterial {
  id: string;
  service_request_id: string;
  technician_id: string;
  material_name: string;
  material_cost: number;
  supplier_cost: number;
  status: string;
  created_at: string;
  photo_url_1?: string | null;
  photo_url_2?: string | null;
  invoice_photo_url?: string | null;
}

interface TechnicianMaterialsSectionProps {
  jobId: string;
  jobStatus: string;
  materials: ServiceMaterial[];
  canEdit?: boolean;
  paidAt?: string | null;
  technicianId?: string;
  onMaterialsChanged: () => void;
}

export const TechnicianMaterialsSection: React.FC<TechnicianMaterialsSectionProps> = ({
  jobId,
  jobStatus,
  materials,
  canEdit = true,
  paidAt,
  technicianId = "tech-current",
  onMaterialsChanged,
}) => {
  const { t, i18n } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const partsMarkupPct = usePlatformSettingNumber("parts_markup_pct", PARTS_MARKUP_DEFAULT_PCT);
  const previewCost = parseFloat(cost.replace(",", ".")) || 0;
  const previewSale = applyPartsMarkup(previewCost, partsMarkupPct);

  const canAdd =
    canEdit &&
    (jobStatus === "accepted" ||
      jobStatus === "in_progress" ||
      jobStatus === "budgeting");

  const handleAddMaterial = async () => {
    if (!name.trim() || !cost) {
      toast.error(t("tech_materials_name_and_value_required"));
      return;
    }
    const parsedCost = parseFloat(cost.replace(",", "."));

    if (isNaN(parsedCost) || parsedCost <= 0) {
      toast.error(t("tech_materials_invalid_value"));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await saveMaterialInsert(jobId, {
        service_request_id: jobId,
        technician_id: technicianId,
        material_name: name.trim(),
        material_cost: applyPartsMarkup(parsedCost, partsMarkupPct),
        supplier_cost: parsedCost,
      });

      if (result === "queued") {
        toast.message(t("tech_materials_queued_offline"));
      } else {
        toast.success(t("tech_materials_added"));
      }
      setName("");
      setCost("");
      setShowForm(false);
      onMaterialsChanged();
    } catch (err) {
      console.error("Falha ao gravar peça:", err);
      toast.error(t("tech_materials_save_error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadPhoto = async (
    materialId: string,
    file: File,
    field: "photo_url_1" | "photo_url_2" | "invoice_photo_url"
  ) => {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${jobId}/${materialId}-${field}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("equipment-photos")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: signed, error: signError } = await supabase.storage
        .from("equipment-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signError || !signed?.signedUrl) throw signError ?? new Error(t("tech_materials_photo_url_unavailable"));

      const { error: updateError } = await supabase
        .from("service_materials")
        .update({ [field]: signed.signedUrl } as any)
        .eq("id", materialId);
      if (updateError) throw updateError;

      toast.success(t("tech_materials_photo_attached"));
      onMaterialsChanged();
    } catch (err: any) {
      console.error("Falha ao anexar foto:", err);
      // Fotos não entram na fila offline (arquivo binário não cabe com segurança
      // no armazenamento do aparelho). O técnico precisa tentar de novo com conexão.
      if (isNetworkError(err)) {
        toast.error(t("tech_materials_photo_offline"));
      } else {
        toast.error(t("tech_materials_photo_error"));
      }
    }
  };

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 pt-3 mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
          <Package className="w-4 h-4 text-blue-600" /> {t("tech_materials_heading")}
        </span>
        <div className="flex items-center gap-2">
          {paidAt ? (
            <Badge className="text-[10px] bg-emerald-600 text-white gap-1">
              <CheckCircle2 className="w-3 h-3" /> {t("tech_materials_paid")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
              <Clock className="w-3 h-3 mr-1" /> {t("tech_materials_awaiting_payment")}
            </Badge>
          )}
          {canAdd && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-dashed"
              onClick={() => setShowForm(!showForm)}
            >
              <Plus className="w-3.5 h-3.5 mr-1 text-blue-600" /> {t("tech_materials_add")}
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {t("tech_materials_register_new")}
          </div>
          <div>
            <Label className="text-xs">{t("tech_materials_description_label")}</Label>
            <Input
              placeholder={t("tech_materials_description_placeholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">{t("tech_materials_cost_label")}</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Ex: 22.50"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="h-8 text-xs mt-1"
            />
            {previewCost > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("tech_materials_client_price_hint", { value: previewSale.toFixed(2), pct: partsMarkupPct })}
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowForm(false)}
            >
              {t("tech_materials_cancel")}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleAddMaterial}
              disabled={isSubmitting}
            >
              {t("tech_materials_confirm_add")}
            </Button>
          </div>
        </div>
      )}

      {materials.length === 0 ? (
        <div className="text-xs text-slate-400 dark:text-slate-500 italic py-1">
          {t("tech_materials_empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {materials.map((m) => (
            <div
              key={m.id}
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{m.material_name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {t("tech_materials_sale_badge")}: €{Number(m.material_cost).toFixed(2)}
                  </Badge>
                  {m.supplier_cost > 0 && (
                    <span className="text-[10px] text-slate-500">
                      ({t("tech_materials_cost_badge")}: €{Number(m.supplier_cost).toFixed(2)})
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {t("tech_materials_logged_on")} {new Date(m.created_at).toLocaleDateString(i18n.language === "pt" ? "pt-PT" : i18n.language)}
                </div>
              </div>

              {/* Upload de Fotos da Peça / Fatura */}
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadPhoto(m.id, f, "photo_url_1");
                    }}
                  />
                  <div className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
                    <Upload className="w-3 h-3" />
                    <span>{m.photo_url_1 ? t("tech_materials_change_photo") : t("tech_materials_photo_of_part")}</span>
                  </div>
                </label>
                {m.photo_url_1 && (
                  <a
                    href={m.photo_url_1}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-emerald-600 font-medium hover:underline"
                  >
                    {t("tech_materials_view_photo")}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TechnicianMaterialsSection;
