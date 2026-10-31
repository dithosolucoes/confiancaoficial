import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export interface ApplianceTypeRow {
  id: string;
  name: string;
  vat_rate: number;
  active: boolean;
  sort_order: number;
  notice_title: string | null;
  notice_message: string | null;
}

const schema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(255),
  vat_rate: z.union([z.literal(6), z.literal(23)]),
  sort_order: z.coerce.number().int().min(0).max(9999),
  notice_title: z.string().max(200),
  notice_message: z.string().max(2000),
});

interface FormState {
  name: string;
  vat_rate: 6 | 23;
  sort_order: number;
  notice_title: string;
  notice_message: string;
}

const empty = (nextOrder: number): FormState => ({ name: "", vat_rate: 23, sort_order: nextOrder, notice_title: "", notice_message: "" });

export default function ApplianceTypesPanel() {
  const [items, setItems] = useState<ApplianceTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApplianceTypeRow | null>(null);
  const [form, setForm] = useState<FormState>(empty(1));
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("appliance_types" as any)
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast.error("Erro ao carregar tipos de aparelho");
    else setItems((data as any[]) as ApplianceTypeRow[]);
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

  const openEdit = (row: ApplianceTypeRow) => {
    setEditing(row);
    setForm({ name: row.name, vat_rate: row.vat_rate as 6 | 23, sort_order: row.sort_order, notice_title: row.notice_title ?? "", notice_message: row.notice_message ?? "" });
    setOpen(true);
  };

  const save = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || "Dados inválidos"); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("appliance_types" as any)
          .update({
            name: form.name.trim(), vat_rate: form.vat_rate, sort_order: form.sort_order,
            notice_title: form.notice_title.trim() || null, notice_message: form.notice_message.trim() || null,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Tipo de aparelho atualizado");
      } else {
        const { error } = await supabase
          .from("appliance_types" as any)
          .insert({
            name: form.name.trim(), vat_rate: form.vat_rate, sort_order: form.sort_order,
            notice_title: form.notice_title.trim() || null, notice_message: form.notice_message.trim() || null,
          });
        if (error) throw error;
        toast.success("Tipo de aparelho criado");
      }
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ApplianceTypeRow) => {
    const { error } = await supabase
      .from("appliance_types" as any)
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    setItems(prev => prev.map(i => (i.id === row.id ? { ...i, active: !i.active } : i)));
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("appliance_types" as any).delete().eq("id", id);
    if (error) toast.error("Erro ao eliminar (pode estar em uso)"); else { toast.success("Tipo eliminado"); load(); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Wrench className="w-5 h-5" /> Tipos de Aparelho / Serviço</CardTitle>
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
            Este catálogo ainda não está ligado ao formulário de pedido nem ao cálculo de IVA no checkout
            (ambos continuam a usar a lista fixa no código). Serve hoje para o gestor já começar a
            organizar o catálogo; a troca para usar esta tabela é um passo separado, com teste dedicado
            de cobrança antes de entrar em produção.
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
                    <th className="py-2 px-2">IVA</th>
                    <th className="py-2 px-2">Ativo</th>
                    <th className="py-2 px-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.id} className={`border-b hover:bg-muted/30 ${!row.active ? "opacity-50" : ""}`}>
                      <td className="py-2 px-2 text-muted-foreground">{row.sort_order}</td>
                      <td className="py-2 px-2 font-medium">{row.name}</td>
                      <td className="py-2 px-2">{row.vat_rate}%</td>
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
                                <AlertDialogTitle>Eliminar tipo de aparelho?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser anulada. Se preferir só desativar sem perder o
                                  histórico, use o interruptor "Ativo" em vez de eliminar.
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
            <DialogTitle>{editing ? "Editar Tipo de Aparelho" : "Novo Tipo de Aparelho"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Taxa de IVA</Label>
              <Select value={String(form.vat_rate)} onValueChange={(v) => setForm({ ...form, vat_rate: Number(v) as 6 | 23 })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6% (reduzida)</SelectItem>
                  <SelectItem value="23">23% (normal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ordem de exibição</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Aviso de preço para o cliente (título) — opcional</Label>
              <Input
                value={form.notice_title}
                placeholder="Ex.: Valor do serviço: 55,00€"
                onChange={(e) => setForm({ ...form, notice_title: e.target.value })}
              />
            </div>
            <div>
              <Label>Aviso de preço para o cliente (texto) — opcional</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.notice_message}
                onChange={(e) => setForm({ ...form, notice_message: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Se ficar vazio, o cliente vê o aviso genérico.</p>
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
