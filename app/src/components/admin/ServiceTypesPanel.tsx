import { useEffect, useMemo, useState } from "react";
import { parseSteps, stepsToText } from "@/lib/service-types";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export interface ServiceTypeRow {
  id: string;
  name: string;
  description: string | null;
  base_fee: number;
  active: boolean;
  sort_order: number;
  steps: string[];
}

const schema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(255),
  description: z.string().max(2000).optional().or(z.literal("")),
  base_fee: z.coerce.number().min(0).max(999999),
  sort_order: z.coerce.number().int().min(0).max(9999),
});

interface FormState {
  name: string;
  description: string;
  base_fee: number;
  sort_order: number;
  steps_text: string;
}

const empty = (nextOrder: number): FormState => ({ name: "", description: "", base_fee: 0, sort_order: nextOrder, steps_text: "" });

export default function ServiceTypesPanel() {
  const [items, setItems] = useState<ServiceTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceTypeRow | null>(null);
  const [form, setForm] = useState<FormState>(empty(1));
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service_types" as any)
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast.error("Erro ao carregar tipos de serviço");
    else setItems((data as any[]) as ServiceTypeRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(s));
  }, [items, search]);

  const openCreate = () => {
    const nextOrder = items.length ? Math.max(...items.map(i => i.sort_order)) + 1 : 1;
    setEditing(null);
    setForm(empty(nextOrder));
    setOpen(true);
  };

  const openEdit = (row: ServiceTypeRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description || "",
      base_fee: row.base_fee,
      sort_order: row.sort_order,
      steps_text: stepsToText(row.steps),
    });
    setOpen(true);
  };

  const save = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || "Dados inválidos"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      base_fee: form.base_fee,
      sort_order: form.sort_order,
      steps: parseSteps(form.steps_text),
    };
    try {
      if (editing) {
        const { error } = await supabase.from("service_types" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Tipo de serviço atualizado");
      } else {
        const { error } = await supabase.from("service_types" as any).insert(payload);
        if (error) throw error;
        toast.success("Tipo de serviço criado");
      }
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ServiceTypeRow) => {
    const { error } = await supabase
      .from("service_types" as any)
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    setItems(prev => prev.map(i => (i.id === row.id ? { ...i, active: !i.active } : i)));
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("service_types" as any).delete().eq("id", id);
    if (error) toast.error("Erro ao eliminar (pode estar em uso)"); else { toast.success("Tipo eliminado"); load(); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Tipos de Serviço</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8 w-64" placeholder="Procurar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Novo Tipo</Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Instalação, reparação, manutenção preventiva, garantia — categorias livres para o gestor
            organizar o catálogo. Ainda não ligado a nenhuma tela de pedido ou cálculo; é só cadastro.
          </p>
          {loading ? (
            <p className="text-muted-foreground text-sm">A carregar...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhum tipo registado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 px-2">Ordem</th>
                    <th className="py-2 px-2">Nome</th>
                    <th className="py-2 px-2">Descrição</th>
                    <th className="py-2 px-2">Taxa Base</th>
                    <th className="py-2 px-2">Ativo</th>
                    <th className="py-2 px-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.id} className={`border-b hover:bg-muted/30 ${!row.active ? "opacity-50" : ""}`}>
                      <td className="py-2 px-2 text-muted-foreground">{row.sort_order}</td>
                      <td className="py-2 px-2 font-medium">{row.name}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.description || "—"}</td>
                      <td className="py-2 px-2">€{Number(row.base_fee).toFixed(2)}</td>
                      <td className="py-2 px-2">
                        <Switch checked={row.active} onCheckedChange={() => toggleActive(row)} />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(row)}><Pencil className="w-4 h-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar tipo de serviço?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser anulada. Para só esconder sem perder o histórico,
                                  use o interruptor "Ativo" em vez de eliminar.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(row.id)}>Eliminar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Tipo de Serviço" : "Novo Tipo de Serviço"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Etapas do serviço (uma por linha)</Label>
              <Textarea
                rows={5}
                placeholder={"Recebido\nDiagnóstico\nReparo\nEntregue"}
                value={form.steps_text}
                onChange={(e) => setForm({ ...form, steps_text: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">O técnico vê estas etapas na ordem escrita. Máximo de 20.</p>
            </div>
            <div>
              <Label>Taxa Base (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.base_fee}
                onChange={(e) => setForm({ ...form, base_fee: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Ordem de exibição</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
