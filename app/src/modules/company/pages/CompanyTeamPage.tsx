import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Plus, Phone, Mail, MapPin, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanies } from "@/hooks/useCompanies";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TechProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  company_id: string | null;
  user_type: string;
}

export const CompanyTeamPage: React.FC = () => {
  const { profile } = useAuth();
  const { companies } = useCompanies();

  // Sem fallback para companies[0]: a empresa do usuário é a única mostrada.
  const currentCompany = companies.find((c) => c.id === profile?.company_id) ?? null;

  const [techs, setTechs] = useState<TechProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const companyId = currentCompany?.id ?? null;

  const loadTechs = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("company_id", companyId)
      .eq("user_type", "technician");

    if (error) {
      toast.error("Não foi possível carregar a equipe. Tente novamente.");
      setTechs([]);
    } else {
      setTechs((data || []) as TechProfile[]);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadTechs();
  }, [loadTechs]);

  const handleAddTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany) {
      toast.error("Empresa não encontrada para o seu usuário.");
      return;
    }
    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      toast.error("Nome, telefone e e-mail são obrigatórios.");
      return;
    }

    setIsSaving(true);
    try {
      // Cria a conta de login do técnico (convite por e-mail) através da Edge Function.
      const { data, error } = await supabase.functions.invoke("create-company-technician", {
        body: {
          company_id: currentCompany.id,
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim() || null,
          redirect_to: `${window.location.origin}/reset-password?invite=1`,
        },
      });

      let serverError = (data as { error?: string } | null)?.error;
      if (!serverError && error) {
        // Em erro HTTP, a mensagem real do servidor vem dentro de error.context
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            serverError = (await ctx.json())?.error;
          }
        } catch {
          serverError = undefined;
        }
      }
      if (error || serverError || !data) {
        console.error("create-company-technician:", serverError ?? error?.message);
        toast.error(serverError || "Não foi possível cadastrar o técnico. Verifique sua permissão e tente novamente.");
        return;
      }

      toast.success(`Técnico ${fullName} integrado com sucesso à equipa da ${currentCompany.name}!`);
      setIsDialogOpen(false);
      setFullName("");
      setPhone("");
      setEmail("");
      setAddress("");
      await loadTechs();
    } catch (err) {
      console.error("Erro ao cadastrar técnico:", err);
      toast.error("Erro de conexão ao cadastrar o técnico.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentCompany) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <h2 className="text-lg font-semibold">Empresa não encontrada</h2>
        <p className="text-sm mt-1">Seu usuário não está vinculado a uma empresa. Fale com o Gestor Master.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Nossa Equipa Técnica
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Profissionais vinculados à <strong>{currentCompany.name}</strong> habilitados para atender chamados da rede.
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" /> Cadastrar Novo Técnico
        </Button>
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" /> Carregando equipa...
        </div>
      ) : techs.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8">
          <Users className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum técnico cadastrado</p>
          <p className="text-xs text-slate-400">Cadastre seus técnicos para poder atribuir os chamados recebidos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {techs.map((tech) => (
            <Card key={tech.id} className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 font-bold text-sm flex items-center justify-center shrink-0">
                      {tech.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
                        {tech.full_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {tech.email || "Sem e-mail"}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                    Ativo
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-2 pt-1 text-xs text-slate-600 dark:text-slate-300">
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{tech.phone || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{tech.address || "Área Metropolitana"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Adicionar Técnico */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Técnico à Equipa</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddTech} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nome Completo *</Label>
              <Input
                id="t-name"
                placeholder="Ex: João Ferreira"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-phone">Telefone de Contato *</Label>
              <Input
                id="t-phone"
                placeholder="+351 912 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-email">E-mail de Acesso (obrigatório)</Label>
              <Input
                id="t-email"
                type="email"
                placeholder={`joao@${(currentCompany.email || "empresa.pt").split("@")[1] || "empresa.pt"}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-addr">Zona de Atuação / Morada</Label>
              <Input
                id="t-addr"
                placeholder="Ex: Amadora, Sintra, Oeiras"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving ? "Gravando no Banco..." : "Cadastrar Técnico"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompanyTeamPage;
