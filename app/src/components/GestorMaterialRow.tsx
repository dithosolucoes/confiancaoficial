import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Check, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { computeMaterialsFinancials } from "@/lib/financial-rules";


export interface GestorEditableMaterial {
  id: string;
  service_request_id: string;
  material_name: string;
  /** Valor cobrado ao cliente (venda). */
  material_cost: number;
  /** Valor pago ao fornecedor (custo real da empresa). */
  supplier_cost?: number | null;
  status: string;
  quantity?: number | null;
  notes?: string | null;
}

interface Props {
  material: GestorEditableMaterial;
  onChanged: () => void;
}

const parseLocale = (v: string, fallback = 0) => {
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

const GestorMaterialRow = ({ material, onChanged }: Props) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(material.material_name);
  const [cost, setCost] = useState(String(material.material_cost ?? 0).replace(".", ","));
  const [supplierCost, setSupplierCost] = useState(String(material.supplier_cost ?? 0).replace(".", ","));
  const [quantity, setQuantity] = useState(String(material.quantity ?? 1).replace(".", ","));
  const [status, setStatus] = useState(material.status || "pending");
  const [notes, setNotes] = useState(material.notes ?? "");

  const financials = computeMaterialsFinancials([
    {
      material_cost: material.material_cost,
      supplier_cost: material.supplier_cost,
      quantity: material.quantity,
      status: material.status,
    },
  ]);


  const logHistory = async (prev: Partial<GestorEditableMaterial>, next: Partial<GestorEditableMaterial>) => {
    if (!user) return;
    await supabase.from("service_materials_history" as any).insert({
      material_id: material.id,
      service_request_id: material.service_request_id,
      changed_by: user.id,
      changed_by_role: "gestor",
      previous_status: prev.status ?? material.status,
      new_status: next.status ?? prev.status ?? material.status,
      previous_value: prev as any,
      new_value: next as any,
    } as any);
  };

  const applyStatus = async (newStatus: string) => {
    if (newStatus === material.status) return;
    setSaving(true);
    const prev = { ...material };
    const { error } = await supabase
      .from("service_materials")
      .update({ status: newStatus })
      .eq("id", material.id);
    setSaving(false);
    if (error) {
      toast.error(t("gestor_error_update") || "Erro ao atualizar");
      return;
    }
    await logHistory({ status: prev.status }, { status: newStatus });
    toast.success(t("gestor_notes_saved") || "Alteração guardada");
    onChanged();
  };

  const saveAll = async () => {
    setSaving(true);
    const newName = name.trim();
    const newCost = parseLocale(cost, 0);
    const newSupplierCost = parseLocale(supplierCost, 0);
    const newQty = parseLocale(quantity, 1) || 1;
    const next = {
      material_name: newName,
      material_cost: newCost,
      supplier_cost: newSupplierCost,
      quantity: newQty,
      status,
      notes: notes.trim() || null,
    };
    const { error } = await supabase
      .from("service_materials")
      .update(next as any)
      .eq("id", material.id);
    setSaving(false);
    if (error) {
      toast.error(t("gestor_error_update") || "Erro ao atualizar");
      return;
    }
    await logHistory(
      {
        material_name: material.material_name,
        material_cost: material.material_cost,
        supplier_cost: material.supplier_cost ?? 0,
        quantity: material.quantity ?? 1,
        status: material.status,
        notes: material.notes ?? "",
      },
      next as any,
    );

    toast.success(t("gestor_notes_saved") || "Alteração guardada");
    setOpen(false);
    onChanged();
  };

  const isRejected = material.status === "rejected";
  const isApproved = material.status === "approved";
  const statusLabel =
    isApproved
      ? t("material_status_approved") || "Aprovado"
      : isRejected
      ? t("material_status_rejected") || "Rejeitado"
      : t("material_status_pending") || "Pendente";

  return (
    <div className="flex flex-col gap-1 py-1 border-b border-border/40 last:border-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex-1 min-w-0">
          <span className="text-foreground truncate block">
            {material.material_name}
            {material.quantity && Number(material.quantity) !== 1 && (
              <span className="text-muted-foreground"> × {material.quantity}</span>
            )}
          </span>
          {material.notes && (
            <span className="text-[10px] text-muted-foreground italic block truncate">
              {material.notes}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={isApproved ? "default" : isRejected ? "destructive" : "secondary"}
            className="text-[9px] px-1.5 py-0"
          >
            {statusLabel}
          </Badge>
          <span
            className={`font-medium ${
              isRejected ? "line-through text-muted-foreground" : "text-foreground"
            }`}
          >
            €{Number(material.material_cost).toFixed(2)}
          </span>
        </div>
      </div>
      {!isRejected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>Fornecedor: €{financials.supplierTotal.toFixed(2)}</span>
          <span>Cliente: €{financials.clientTotal.toFixed(2)}</span>
          <span className={financials.profit >= 0 ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
            Lucro: €{financials.profit.toFixed(2)} ({financials.marginPct.toFixed(2)}%)
          </span>
          <span className="italic">Sem participação do técnico</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          disabled={saving}
          onClick={() => setOpen(true)}
          title="Editar peça"
        >
          <Pencil className="w-3 h-3 mr-1" /> Editar
        </Button>
        {!isApproved && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] text-green-600 hover:text-green-700"
            disabled={saving}
            onClick={() => applyStatus("approved")}
            title="Aceitar"
          >
            <Check className="w-3 h-3 mr-1" /> Aceitar
          </Button>
        )}
        {!isRejected && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
            disabled={saving}
            onClick={() => applyStatus("rejected")}
            title="Rejeitar"
          >
            <X className="w-3 h-3 mr-1" /> Rejeitar
          </Button>
        )}
        {isRejected && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] text-amber-600 hover:text-amber-700"
            disabled={saving}
            onClick={() => applyStatus("pending")}
            title="Reativar material"
          >
            <RotateCcw className="w-3 h-3 mr-1" /> Reativar
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Peça / Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valor Cobrado ao Cliente (€)</Label>
                <Input
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor Pago ao Fornecedor (€)</Label>
                <Input
                  inputMode="decimal"
                  value={supplierCost}
                  onChange={(e) => setSupplierCost(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantidade</Label>
                <Input
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lucro estimado</Label>
                <div className="h-10 flex items-center text-sm font-medium">
                  €{(
                    (parseLocale(cost, 0) - parseLocale(supplierCost, 0)) *
                    (parseLocale(quantity, 1) || 1)
                  ).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveAll} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GestorMaterialRow;
