import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildServiceStatement } from "@/lib/service-statement";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Receipt, Search } from "lucide-react";
import { toast } from "sonner";

interface ServiceRow {
  id: string;
  reference: string | null;
  appliance_type: string | null;
  scheduled_date: string | null;
  status: string | null;
  deslocacao_fee: number | null;
  labor_cost: number | null;
  extra_fee: number | null;
  is_warranty: boolean | null;
  labor_rejected_at: string | null;
  labor_approved_at: string | null;
  labor_paid_at: string | null;
  quote_status: string | null;
  created_at: string | null;
  financial_rule_snapshot: Record<string, unknown> | null;
  closing_snapshot: Record<string, unknown> | null;
  assigned_company_id: string | null;
}

const eur = (n: number) => `€${n.toFixed(2)}`;

// Foto fechada (gravada uma vez na conclusão). Só o gestor vê: esta tela é só do /admin.
const closingSnapshotLine = (row: ServiceRow) => {
  const snap = row.closing_snapshot as Record<string, any> | null;
  if (!snap) return null;
  const n = (v: unknown) => Number(v || 0);
  return (
    <tr className="bg-muted/20">
      <td colSpan={8} className="py-1.5 px-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Foto fechada</span>
        {" · "}fechado em {snap.fechado_em ? new Date(snap.fechado_em).toLocaleDateString("pt-PT") : "—"}
        {" · "}visita {eur(n(snap.visita))}
        {" · "}M.O. {eur(n(snap.mao_de_obra))}
        {" · "}taxa extra {eur(n(snap.taxa_extra))}
        {" · "}peças ao cliente {eur(n(snap.pecas_cliente))} (custo {eur(n(snap.pecas_custo))}, margem {eur(n(snap.margem_pecas))})
        {" · "}repasse técnico {eur(n(snap.repasse_tecnico))}
      </td>
    </tr>
  );
};

export default function ServiceStatementPanel() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("service_requests" as any)
        .select("id,reference,appliance_type,scheduled_date,status,deslocacao_fee,labor_cost,extra_fee,is_warranty,labor_rejected_at,labor_approved_at,labor_paid_at,quote_status,created_at,financial_rule_snapshot,closing_snapshot,assigned_company_id")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) toast.error("Erro ao carregar o extrato");
      else setRows(((data as any[]) || []) as ServiceRow[]);
      setLoading(false);
    })();
  }, []);

  const lines = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .map((r) => ({ row: r, st: buildServiceStatement(r as any) }))
      .filter(({ row }) => !s || (row.reference || "").toLowerCase().includes(s) || (row.appliance_type || "").toLowerCase().includes(s));
  }, [rows, search]);

  const totals = useMemo(() => lines.reduce(
    (acc, { st }) => ({
      client: acc.client + st.clientTotal,
      technician: acc.technician + st.technicianTotal,
      empresa: acc.empresa + st.empresaTotal,
      confianca: acc.confianca + st.confiancaTotal,
    }),
    { client: 0, technician: 0, empresa: 0, confianca: 0 },
  ), [lines]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5" /> Extrato por serviço</CardTitle>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8 w-64" placeholder="Referência ou aparelho" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Cada linha mostra o que o cliente paga e como o valor é dividido. A divisão usa a regra gravada no chamado
          na abertura. Serviços antigos sem regra gravada usam 50% / 50%. Peças não entram nesta divisão. Em chamado de empresa parceira, a parte dela sai da parte do técnico.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">A carregar...</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum serviço encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-2">Referência</th>
                  <th className="py-2 px-2">Aparelho</th>
                  <th className="py-2 px-2">Data</th>
                  <th className="py-2 px-2 text-right">Cliente paga</th>
                  <th className="py-2 px-2 text-right">Técnico</th>
                  <th className="py-2 px-2 text-right">Empresa parceira</th>
                  <th className="py-2 px-2 text-right">Confiança</th>
                  <th className="py-2 px-2">Regra</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(({ row, st }) => (
                  <Fragment key={row.id}>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{row.reference || "—"}</td>
                    <td className="py-2 px-2">{row.appliance_type || "—"}</td>
                    <td className="py-2 px-2">{row.scheduled_date || "—"}</td>
                    <td className="py-2 px-2 text-right">{eur(st.clientTotal)}</td>
                    <td className="py-2 px-2 text-right">
                      {eur(st.technicianTotal)}
                      <div className="text-xs text-muted-foreground">visita {eur(st.technicianVisit)} · M.O. {eur(st.technicianLabor)}</div>
                    </td>
                    <td className="py-2 px-2 text-right">
                      {row.assigned_company_id ? eur(st.empresaTotal) : "—"}
                      {row.assigned_company_id && <div className="text-xs text-muted-foreground">visita {eur(st.empresaVisit)} · M.O. {eur(st.empresaLabor)}</div>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {eur(st.confiancaTotal)}
                      <div className="text-xs text-muted-foreground">visita {eur(st.confiancaVisit)} · M.O. {eur(st.confiancaLabor)}</div>
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">{st.usesSnapshot ? "Regra do chamado" : "Padrão 50/50"}</td>
                  </tr>
                  {closingSnapshotLine(row)}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 px-2" colSpan={3}>Total ({lines.length})</td>
                  <td className="py-2 px-2 text-right">{eur(totals.client)}</td>
                  <td className="py-2 px-2 text-right">{eur(totals.technician)}</td>
                  <td className="py-2 px-2 text-right">{eur(totals.empresa)}</td>
                  <td className="py-2 px-2 text-right">{eur(totals.confianca)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
