import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSaved?: () => void;
}

interface ProfileForm {
  full_name: string;
  phone: string;
  address: string;
  address_complement: string;
  postal_code: string;
  localidade: string;
  billing_name: string;
  billing_nif: string;
  billing_address: string;
}

const empty: ProfileForm = {
  full_name: "",
  phone: "",
  address: "",
  address_complement: "",
  postal_code: "",
  localidade: "",
  billing_name: "",
  billing_nif: "",
  billing_address: "",
};

const CustomerProfileDialog = ({ open, onOpenChange, userId, onSaved }: Props) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<ProfileForm>(empty);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    supabase
      .from("profiles")
      .select("full_name, phone, address, address_complement, postal_code, localidade, billing_name, billing_nif, billing_address")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) setForm({ ...empty, ...(data as any) });
        setLoading(false);
      });
  }, [open, userId]);

  const update = (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update(form).eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast.error(t("error_save_profile"));
      return;
    }
    toast.success(t("profile_updated_success"));
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("edit_profile_title")}</DialogTitle>
          <DialogDescription>
            {t("edit_profile_desc")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t("loading_dots")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("contact_name")}</Label>
              <Input value={form.full_name} onChange={update("full_name")} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("contact_phone")}</Label>
              <Input value={form.phone} onChange={update("phone")} maxLength={20} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("postal_code")}</Label>
              <Input value={form.postal_code} onChange={update("postal_code")} placeholder="0000-000" maxLength={10} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("address")}</Label>
              <Input value={form.address} onChange={update("address")} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("address_complement")}</Label>
              <Input value={form.address_complement} onChange={update("address_complement")} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("localidade")}</Label>
              <Input value={form.localidade} onChange={update("localidade")} maxLength={50} />
            </div>

            <div className="sm:col-span-2 pt-2 border-t mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("billing_data")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    billing_name: p.full_name,
                    billing_address: [p.address, p.address_complement, p.postal_code, p.localidade]
                      .filter(Boolean)
                      .join(", "),
                  }))
                }
              >
                {t("use_same_data_except_nif")}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>{t("label_billing_name")}</Label>
              <Input value={form.billing_name} onChange={update("billing_name")} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("label_nif")}</Label>
              <Input value={form.billing_nif} onChange={update("billing_nif")} maxLength={20} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("label_billing_address")}</Label>
              <Input value={form.billing_address} onChange={update("billing_address")} maxLength={200} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerProfileDialog;
