import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface TechnicianProfileData {
  full_name?: string | null;
  surname?: string | null;
  address?: string | null;
  email?: string | null;
  iban?: string | null;
  phone?: string | null;
  emergency_contact?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initial: TechnicianProfileData;
  forceComplete?: boolean;
  onSaved?: () => void;
}

const REQUIRED_FIELDS: (keyof TechnicianProfileData)[] = [
  "full_name",
  "surname",
  "address",
  "email",
  "iban",
  "phone",
  "emergency_contact",
];

export const isTechnicianProfileComplete = (p: TechnicianProfileData) =>
  REQUIRED_FIELDS.every((f) => !!(p[f] && String(p[f]).trim()));

const TechnicianProfileDialog = ({ open, onOpenChange, userId, initial, forceComplete, onSaved }: Props) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<TechnicianProfileData>(initial);
  const [ibanConfirm, setIbanConfirm] = useState(initial.iban || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setIbanConfirm(initial.iban || "");
    }
  }, [open, initial]);

  const upd = (k: keyof TechnicianProfileData, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const ibanMismatch = (form.iban || "").trim() !== (ibanConfirm || "").trim();

  const handleSave = async () => {
    const missing = REQUIRED_FIELDS.filter((f) => !(form[f] && String(form[f]).trim()));
    if (missing.length) {
      toast.error(t("error_fill_required_fields"));
      return;
    }
    if (ibanMismatch) {
      toast.error(t("error_iban_mismatch"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name?.trim(),
          surname: form.surname?.trim(),
          address: form.address?.trim(),
          email: form.email?.trim(),
          iban: form.iban?.trim(),
          phone: form.phone?.trim(),
          emergency_contact: form.emergency_contact?.trim(),
        } as any)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success(t("data_updated_success"));
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || t("error_save_data"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && forceComplete && !isTechnicianProfileComplete(form)) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("my_data_title")}</DialogTitle>
          <DialogDescription>
            {t("my_data_desc")}
          </DialogDescription>
        </DialogHeader>

        {forceComplete && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("complete_data_required")}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("label_first_name")} *</Label>
              <Input value={form.full_name || ""} onChange={(e) => upd("full_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("label_surname")} *</Label>
              <Input value={form.surname || ""} onChange={(e) => upd("surname", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("label_address")} *</Label>
            <Input value={form.address || ""} onChange={(e) => upd("address", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("label_email_short")} *</Label>
            <Input type="email" value={form.email || ""} onChange={(e) => upd("email", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("label_iban")} *</Label>
            <Input
              placeholder={t("placeholder_iban")}
              value={form.iban || ""}
              onChange={(e) => upd("iban", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("label_confirm_iban")} *</Label>
            <Input
              placeholder={t("placeholder_confirm_iban")}
              value={ibanConfirm}
              onChange={(e) => setIbanConfirm(e.target.value)}
            />
            {(form.iban || ibanConfirm) && ibanMismatch && (
              <p className="text-xs text-destructive">{t("error_iban_mismatch")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("label_contact")} *</Label>
            <Input value={form.phone || ""} onChange={(e) => upd("phone", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("label_emergency_contact")} *</Label>
            <Input
              placeholder={t("placeholder_emergency_phone")}
              value={form.emergency_contact || ""}
              onChange={(e) => upd("emergency_contact", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          {!forceComplete && (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("cancel")}
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TechnicianProfileDialog;
