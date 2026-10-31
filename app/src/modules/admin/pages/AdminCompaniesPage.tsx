import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2, Plus, Users, Euro, Phone, Mail, MapPin, CheckCircle2, ShieldCheck, FileText, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { useCompanies, CompanyRecord } from "@/hooks/useCompanies";
import { supabase } from "@/integrations/supabase/client";
import CompanyReportDialog from "@/components/CompanyReportDialog";

export const AdminCompaniesPage: React.FC = () => {
  const { companies, createCompany, isCreating, setCompanyApproval } = useCompanies();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [iban, setIban] = useState("");
  const [address, setAddress] = useState("");


  const [techCounts, setTechCounts] = useState<Record<string, number>>({});
  const [serviceCounts, setServiceCounts] = useState<Record<string, number>>({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [accessCompany, setAccessCompany] = useState<CompanyRecord | null>(null);
  const [accessName, setAccessName] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [isCreatingAccess, setIsCreatingAccess] = useState(false);

  React.useEffect(() => {
    const fetchCompanyStats = async () => {
      try {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("company_id")
          .not("company_id", "is", null);
        if (profilesError) throw profilesError;

        const { data: servicesData, error: servicesError } = await supabase
          .from("service_requests")
          .select("assigned_company_id")
          .not("assigned_company_id", "is", null);
        if (servicesError) throw servicesError;

        const tCounts: Record<string, number> = {};
        const sCounts: Record<string, number> = {};

        companies.forEach((c) => {
          tCounts[c.id] = 0;
          sCounts[c.id] = 0;
        });

        (profilesData || []).forEach((p: any) => {
          if (p.company_id) {
            tCounts[p.company_id] = (tCounts[p.company_id] || 0) + 1;
          }
        });

        (servicesData || []).forEach((s: any) => {
          if (s.assigned_company_id) {
            sCounts[s.assigned_company_id] = (sCounts[s.assigned_company_id] || 0) + 1;
          }
        });

        setTechCounts(tCounts);
        setServiceCounts(sCounts);
      } catch (err) {
        console.error("Erro ao calcular estatísticas das empresas:", err);
        toast.error("Não foi possível carregar as estatísticas das empresas.");
      }
    };

    if (companies.length > 0) {
      fetchCompanyStats();
    }
  }, [companies]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !nif.trim()) {
      toast.error("Nome e NIF são obrigatórios.");
      return;
    }

    try {
      await createCompany({
        name,
        nif,
        email: email || null,
        phone: phone || null,
        iban: iban || null,
        address: address || null,
        is_approved: false,
      });

      setIsDialogOpen(false);
      toast.success(`Empresa "${name}" cadastrada. Aprove-a na lista para liberar o acesso.`);

      // Reset form
      setName("");
      setNif("");
      setEmail("");
      setPhone("");
      setIban("");
      setAddress("");
    } catch (err: any) {
      toast.error("Erro ao credenciar empresa: " + err.message);
    }
  };

  const handleCreateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCompany) return;
    setIsCreatingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-company-admin", {
        body: {
          company_id: accessCompany.id,
          full_name: accessName.trim(),
          email: accessEmail.trim(),
          redirect_to: `${window.location.origin}/reset-password?invite=1`,
        },
      });

      let serverError = (data as { error?: string } | null)?.error;
      if (!serverError && error) {
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            serverError = (await ctx.json())?.error;
          }
        } catch {
          // ignora: cai na mensagem genérica abaixo
        }
        serverError = serverError || error.message;
      }
      if (serverError) throw new Error(serverError);

      toast.success(`Convite enviado para ${accessEmail.trim()}. A empresa define a senha pelo e-mail.`);
      setAccessCompany(null);
      setAccessName("");
      setAccessEmail("");
    } catch (err: any) {
      toast.error("Não foi possível criar o acesso: " + err.message);
    } finally {
      setIsCreatingAccess(false);
    }
  };

  const handleToggleApproval = async (companyId: string, approved: boolean) => {
    try {
      await setCompanyApproval({ id: companyId, approved });
      toast.success(approved ? "Empresa aprovada. O acesso foi liberado." : "Empresa suspensa.");
    } catch (err: any) {
      toast.error("Erro ao atualizar a empresa: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Empresas Terceirizadas & Parceiros
            </h1>
            <Badge variant="secondary" className="text-xs">Multi-Tenant</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cadastre oficinas e empresas parceiras que possuem seus próprios técnicos e executam serviços sob repasse B2B.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowReportModal(true)}
            className="gap-1.5 shadow-sm text-xs h-9 border-slate-300 dark:border-slate-700"
          >
            <FileText className="w-4 h-4 text-emerald-600" /> Extrato Financeiro B2B
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm text-xs h-9">
            <Plus className="w-4 h-4" /> Credenciar Nova Empresa
          </Button>
        </div>
      </div>

      {/* Info Card explaining multi-tenant dual logic */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">Arquitetura de Equipa Dual (Direta vs. Terceirizada)</p>
          <p>
            • <strong>Técnico Direto da Confiança:</strong> Não possui vínculo a terceirizada (<code className="bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded">company_id = NULL</code>). Recebe 50% da mão de obra + a taxa de quilometragem vigente (Configurações › Financeiro) diretamente no seu IBAN pessoal.
          </p>
          <p>
            • <strong>Empresa Terceirizada:</strong> Possui cadastro de pessoa coletiva (NIF corporativo). Recebe 50% da taxa de serviço, mão de obra e taxa extra (mesma regra do técnico direto) para o IBAN da empresa, e a empresa administra e remunera a sua própria equipa interna.
          </p>
        </div>
      </div>

      {/* Grid of Companies */}
      {companies.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-3">
          <Building2 className="w-10 h-10 text-slate-400 mx-auto opacity-50" />
          <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Nenhuma empresa parceira credenciada ainda
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Cadastre oficinas e parceiros B2B para despachar chamados para equipas terceirizadas com comissão acordada.
          </p>
          <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 mt-2">
            <Plus className="w-4 h-4" /> Credenciar Primeira Empresa
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {companies.map((company) => {
            const techsCount = techCounts[company.id] || 0;
            const srvsCount = serviceCounts[company.id] || 0;

            return (
              <Card key={company.id} className="border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                            {company.name}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            NIF: <strong>{company.nif}</strong> • Cadastrada em {new Date(company.created_at).toLocaleDateString("pt-PT")}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        company.is_approved
                          ? "border-emerald-500 text-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 font-semibold text-xs"
                          : "border-amber-500 text-amber-600 bg-amber-50/50 dark:bg-amber-950/20 font-semibold text-xs"
                      }
                    >
                      {company.is_approved ? "Ativa" : "Pendente de aprovação"}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{company.email || "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{company.phone || "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate sm:col-span-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{company.address || "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate sm:col-span-2 font-mono text-[11px] text-slate-500">
                      IBAN: {company.iban || "Pendente"}
                    </div>
                  </div>

                  {/* Team & Services Summary */}
                  <div className="flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                        <Users className="w-3.5 h-3.5 text-blue-500" />
                        {techsCount} {techsCount === 1 ? "técnico" : "técnicos"}
                      </span>
                      <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                        <Euro className="w-3.5 h-3.5 text-emerald-500" />
                        {srvsCount} {srvsCount === 1 ? "ordem recebida" : "ordens recebidas"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 gap-1"
                        onClick={() => {
                          setAccessCompany(company);
                          setAccessName("");
                          setAccessEmail(company.email || "");
                        }}
                      >
                        <KeyRound className="w-3.5 h-3.5" /> Criar acesso
                      </Button>
                    <Button
                      size="sm"
                      variant={company.is_approved ? "outline" : "default"}
                      className={company.is_approved ? "text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50" : "text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"}
                      onClick={() => handleToggleApproval(company.id, !company.is_approved)}
                    >
                      {company.is_approved ? "Suspender" : "Aprovar"}
                    </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal para Credenciar Nova Empresa */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Credenciar Empresa Parceira</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCompany} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Razão Social / Nome da Empresa *</Label>
              <Input
                id="c-name"
                placeholder="Ex: ClimaTech Manutenções Lda"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-nif">NIF da Empresa *</Label>
              <Input
                id="c-nif"
                placeholder="509 000 000"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                required
              />
            </div>
            <p className="text-[11px] text-slate-500">
              O repasse segue a regra da Confiança (ver Configurações do gestor), não um percentual fixo por empresa.
              A empresa nasce pendente e só recebe chamados depois de aprovada.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-email">E-mail Corporativo</Label>
                <Input
                  id="c-email"
                  type="email"
                  placeholder="geral@empresa.pt"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Telefone Principal</Label>
                <Input
                  id="c-phone"
                  placeholder="+351 210 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-iban">IBAN para Liquidação Bancária</Label>
              <Input
                id="c-iban"
                placeholder="PT50 0000 0000 0000 0000 0000 0"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-addr">Morada da Sede / Oficina</Label>
              <Input
                id="c-addr"
                placeholder="Rua, Número, Código Postal, Localidade"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                Salvar e Credenciar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal para criar o login da empresa parceira */}
      <Dialog open={!!accessCompany} onOpenChange={(open) => !open && setAccessCompany(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar acesso da empresa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAccess} className="space-y-4 pt-2">
            <p className="text-xs text-slate-500">
              Empresa: <strong>{accessCompany?.name}</strong>. A pessoa responsável recebe um e-mail de convite e define a própria senha.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="a-name">Nome do responsável *</Label>
              <Input
                id="a-name"
                value={accessName}
                onChange={(e) => setAccessName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-email">E-mail de login *</Label>
              <Input
                id="a-email"
                type="email"
                value={accessEmail}
                onChange={(e) => setAccessEmail(e.target.value)}
                required
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAccessCompany(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreatingAccess} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isCreatingAccess ? "Enviando..." : "Enviar convite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo Exportador de Relatório Financeiro B2B */}
      <CompanyReportDialog
        open={showReportModal}
        onOpenChange={setShowReportModal}
        services={allServices}
        profiles={allProfiles}
        quotePartsItems={[]}
        partnerOrgs={companies}
      />
    </div>
  );
};

export default AdminCompaniesPage;
