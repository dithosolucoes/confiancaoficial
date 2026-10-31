import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export interface Supplier {
  id: string;
  name: string;
  iban: string | null;
  contact: string | null;
  contact_name: string | null;
  nif: string | null;
  notes: string | null;
}

const schema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(255),
  iban: z.string().trim().max(64).optional().or(z.literal("")),
  contact: z.string().trim().max(128).optional().or(z.literal("")),
  contact_name: z.string().trim().max(255).optional().or(z.literal("")),
  nif: z.string().trim().max(32).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

interface FormState {
  name: string;
  iban: string;
  contact: string;
  contact_name: string;
  nif: string;
  notes: string;
}

const empty = (): FormState => ({ name: "", iban: "", contact: "", contact_name: "", nif: "", notes: "" });

export default function SuppliersPanel() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("suppliers" as any)
      .select("*")
      .order("name", { ascending: true });
    if (error) toast.error("Erro ao carregar fornecedores");
    else setItems((data as any[]) as Supplier[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(s) ||
      (i.contact_name || "").toLowerCase().includes(s) ||
      (i.contact || "").toLowerCase().includes(s) ||
      (i.nif || "").toLowerCase().includes(s) ||
      (i.iban || "").toLowerCase().includes(s)
    );
  }, [items, search]);

  const openCreate = () => { setEditing(null); setForm(empty()); setOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      iban: s.iban || "",
      contact: s.contact || "",
      contact_name: s.contact_name || "",
      nif: s.nif || "",
      notes: s.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || "Dados inválidos"); return; }
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const payload: any = {
      name: form.name.trim(),
      iban: form.iban.trim() || null,
      contact: form.contact.trim() || null,
      contact_name: form.contact_name.trim() || null,
      nif: form.nif.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from("suppliers" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Fornecedor atualizado");
      } else {
        const { error } = await supabase.from("suppliers" as any).insert({ ...payload, created_by: userId });
        if (error) throw error;
        toast.success("Fornecedor criado");
      }
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("suppliers" as any).delete().eq("id", id);
    if (error) toast.error("Erro ao eliminar"); else { toast.success("Fornecedor eliminado"); load(); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Truck className="w-5 h-5" /> Fornecedores</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8 w-64" placeholder="Procurar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Novo Fornecedor</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">A carregar...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhum fornecedor registado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 px-2">Nome</th>
                    <th className="py-2 px-2">NIF</th>
                    <th className="py-2 px-2">Contacto</th>
                    <th className="py-2 px-2">Nome do Contacto</th>
                    <th className="py-2 px-2">IBAN</th>
                    <th className="py-2 px-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{s.name}</td>
                      <td className="py-2 px-2">{s.nif || "—"}</td>
                      <td className="py-2 px-2">{s.contact || "—"}</td>
                      <td className="py-2 px-2">{s.contact_name || "—"}</td>
                      <td className="py-2 px-2 font-mono text-xs">{s.iban || "—"}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar fornecedor?</AlertDialogTitle>
                                <AlertDialogDescription>Esta ação não pode ser anulada.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(s.id)}>Eliminar</AlertDialogAction>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>NIF</Label>
              <Input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
            </div>
            <div>
              <Label>IBAN</Label>
              <Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="PT50 ..." />
            </div>
            <div>
              <Label>Contacto (telefone/email)</Label>
              <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div>
              <Label>Nome do Contacto</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Notas</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
