import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { buildServiceStatement } from "@/lib/service-statement";
import { localISODate } from "@/lib/payables-due";
import { toast } from "sonner";

interface PendingService {
  service_request_id: string;
  reference: string | null;
  amount: number;
}

interface CompanyGroup {
  company_id: string;
  company_name: string;
  items: PendingService[];
  total: number;
}

const eur = (n: number) => `€${n.toFixed(2)}`;

/**
 * Repasses às empresas parceiras que ainda não viraram conta a pagar.
 * Valor de cada serviço = mesma conta do extrato (parte da empresa, pela regra gravada no chamado).
 * Serviços com orçamento recusado ficam de fora, como na Visão do mês.
 */
export default function PartnerCompanyPayoutsCard({ onDone }: { onDone?: () => void }) {
  const [groups, setGroups] = useState<CompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dueDate, setDueDate] = useState(localISODate());

  const load = async () => {
    setLoading(true);
    const [sr, done, comp] = await Promise.all([
      supabase.from("service_requests" as any)
        .select("id,reference,appliance_type,scheduled_date,status,deslocacao_fee,labor_cost,extra_fee,is_warranty,labor_rejected_at,labor_approved_at,labor_paid_at,quote_status,created_at,financial_rule_snapshot,assigned_company_id")
        .eq("status", "completed")
        .not("assigned_company_id", "is", null),
      supabase.from("company_payouts" as any).select("service_request_id"),
      supabase.from("companies" as any).select("id,name"),
    ]);
    if (sr.error || done.error || comp.error) {
      toast.error("Erro ao carregar repasses às empresas");
      setLoading(false);
      return;
    }
    const already = new Set(((done.data as any[]) || []).map(r => r.service_request_id));
    const names = new Map(((comp.data as any[]) || []).map(c => [c.id, c.name as string]));
    const map = new Map<string, CompanyGroup>();
    for (const s of ((sr.data as any[]) || [])) {
      if (already.has(s.id) || s.quote_status === "rejected") continue;
      const amount = buildServiceStatement(s).empresaTotal;
      if (!(amount > 0)) continue;
      const cid = s.assigned_company_id as string;
      const g = map.get(cid) || { company_id: cid, company_name: names.get(cid) || "Empresa", items: [], total: 0 };
      g.items.push({ service_request_id: s.id, reference: s.reference, amount });
      g.total = Math.round((g.total + amount) * 100) / 100;
      map.set(cid, g);
    }
    setGroups(Array.from(map.values()));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    const items = groups.flatMap(g => g.items.map(i => ({
      company_id: g.company_id,
      company_name: g.company_name,
      service_request_id: i.service_request_id,
      amount: i.amount,
    })));
    if (items.length === 0) return;
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("gerar_repasses_empresas", { p_due_date: dueDate, p_items: items });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erro ao gerar repasses");
      return;
    }
    toast.success(`${data} serviço(s) lançado(s) como conta a pagar por empresa.`);
    await load();
    onDone?.();
  };

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const qtd = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <Card className={groups.length > 0 ? "border-orange-300" : "border-green-300"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          Repasses às empresas parceiras (a gerar)
          <Badge variant="outline" className="ml-1">{qtd}</Badge>
          {groups.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">Total: {eur(grandTotal)}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">A carregar...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum serviço de empresa parceira concluído aguardando conta.</p>
        ) : (
          <>
            <ul className="text-sm space-y-1">
              {groups.map(g => (
                <li key={g.company_id} className="flex justify-between gap-3 border-b py-1">
                  <span>{g.company_name} <span className="text-muted-foreground">({g.items.length} serviço(s))</span></span>
                  <span className="font-medium">{eur(g.total)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label htmlFor="partner-due">Vencimento das contas</Label>
                <Input id="partner-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-44" />
              </div>
              <Button onClick={generate} disabled={saving || !dueDate}>
                {saving ? "A gerar..." : "Gerar contas a pagar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cria uma conta a pagar por empresa, com o total dos serviços. Depois você paga pela lista abaixo; ao pagar, o valor entra no Lucro Líquido.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
