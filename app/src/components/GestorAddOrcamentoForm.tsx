import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  serviceRequestId: string;
  technicianId: string | null;
  onAdded: () => void;
}

const parseLocale = (v: string, fallback = 0) => {
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

const GestorAddOrcamentoForm = ({ serviceRequestId, technicianId, onAdded }: Props) => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const n = name.trim();
    const c = parseLocale(cost, 0);
    const q = parseLocale(qty, 1) || 1;
    if (!n) { toast.error("Descrição obrigatória"); return; }
    if (c <= 0) { toast.error("Valor inválido"); return; }
    const techId = technicianId || user?.id;
    if (!techId) { toast.error("Sem técnico/utilizador para associar"); return; }
    setSaving(true);
    const { error } = await supabase.from("service_materials").insert({
      service_request_id: serviceRequestId,
      technician_id: techId,
      material_name: n,
      material_cost: c,
      quantity: q,
      status: "pending",
    } as any);
    setSaving(false);
    if (error) { toast.error("Erro ao adicionar: " + error.message); return; }
    supabase.functions.invoke("send-material-notification", {
      body: {
        service_request_id: serviceRequestId,
        material_name: n,
        material_cost: c,
      },
    }).catch((e) => console.warn("Material notification error:", e));
    toast.success("Item adicionado — aguardando aprovação do cliente");
    setName(""); setCost(""); setQty("1");
    onAdded();
  };

  return (
    <div className="flex flex-wrap items-end gap-1 pt-2 border-t border-border/60 mt-1">
      <Input
        className="flex-1 min-w-[140px] h-7 text-xs"
        placeholder="Descrição (peça/serviço)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        className="w-20 h-7 text-xs"
        inputMode="decimal"
        placeholder="Valor €"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
      />
      <Input
        className="w-14 h-7 text-xs"
        inputMode="decimal"
        placeholder="Qtd"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <Button type="button" size="sm" className="h-7 text-xs" disabled={saving} onClick={submit}>
        <Plus className="w-3 h-3 mr-1" /> Adicionar
      </Button>
    </div>
  );
};

export default GestorAddOrcamentoForm;
