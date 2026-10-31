import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  splitServiceCents, validateFinancialRule, eurosToCents, centsToEuros, FinancialRule,
} from "@/lib/financial-split";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Euro, History, Save } from "lucide-react";
import { toast } from "sonner";

interface RuleRow {
  id: string;
  service_type_id: string | null;
  visit_charged: boolean;
  visit_technician_pct: number;
  labor_confianca_pct: number;
  visit_empresa_pct: number;
  labor_empresa_pct: number;
  effective_from: string;
  reason: string;
  created_at: string;
}

interface ServiceTypeOption {
  id: string;
  name: string;
  active: boolean;
}

const DEFAULT_TARGET = "default";
const fmtEur = (cents: number) => `€${centsToEuros(cents).toFixed(2)}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
const fmtPct = (n: number) => (Number.isNaN(n) ? "—" : n.toFixed(2).replace(/\.?0+$/, "")) + "%";
const parsePct = (s: string) => Number(String(s).replace(",", "."));

export default function FinancialRulesPanel() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [services, setServices] = useState<ServiceTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<string>(DEFAULT_TARGET);
  const [saving, setSaving] = useState(false);

  // Formulário (strings para permitir digitar decimais)
  const [visitCharged, setVisitCharged] = useState(true);
  const [visitPct, setVisitPct] = useState("50");
  const [confPct, setConfPct] = useState("50");
  const [visitEmpPct, setVisitEmpPct] = useState("0");
  const [labEmpPct, setLabEmpPct] = useState("0");
  const [reason, setReason] = useState("");

  // Simulador
  const [simVisit, setSimVisit] = useState("20");
  const [simLabor, setSimLabor] = useState("40");
  const [simPartner, setSimPartner] = useState(true);

  const load = async () => {
    setLoading(true);
    const [r, s] = await Promise.all([
      supabase.from("financial_rules" as any).select("*")
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("service_types" as any).select("id,name,active").order("sort_order", { ascending: true }),
    ]);
    if (r.error) toast.error("Erro ao carregar regras financeiras");
    else setRules(((r.data as any[]) || []).map(x => ({
      ...x,
      visit_technician_pct: Number(x.visit_technician_pct),
      labor_confianca_pct: Number(x.labor_confianca_pct),
      visit_empresa_pct: Number(x.visit_empresa_pct ?? 0),
      labor_empresa_pct: Number(x.labor_empresa_pct ?? 0),
    })));
    if (s.error) toast.error("Erro ao carregar tipos de serviço");
    else setServices((s.data as any[]) as ServiceTypeOption[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const targetRows = useMemo(
    () => rules.filter(r => (target === DEFAULT_TARGET ? r.service_type_id === null : r.service_type_id === target)),
    [rules, target],
  );

  const now = Date.now();
  // Vigente agora = a versão mais recente já com vigência iniciada (a lista vem ordenada desc).
  const current = targetRows.find(r => new Date(r.effective_from).getTime() <= now) || null;
  const scheduled = targetRows.filter(r => new Date(r.effective_from).getTime() > now);

  // Preenche o formulário com a regra vigente ao trocar de alvo.
  useEffect(() => {
    if (current) {
      setVisitCharged(current.visit_charged);
      setVisitPct(String(current.visit_technician_pct));
      setConfPct(String(current.labor_confianca_pct));
      setVisitEmpPct(String(current.visit_empresa_pct));
      setLabEmpPct(String(current.labor_empresa_pct));
    } else {
      setVisitCharged(true);
      setVisitPct("50");
      setConfPct("50");
      setVisitEmpPct("0");
      setLabEmpPct("0");
    }
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, rules]);

  const draftRule: FinancialRule = {
    visitCharged,
    visitTechnicianPct: parsePct(visitPct),
    laborConfiancaPct: parsePct(confPct),
    visitEmpresaPct: parsePct(visitEmpPct),
    laborEmpresaPct: parsePct(labEmpPct),
  };
  const draftErrors = validateFinancialRule(draftRule);
  const draftValid = draftErrors.length === 0;

  const simulation = useMemo(() => {
    if (!draftValid) return null;
    try {
      return splitServiceCents({
        visitFeeCents: eurosToCents(parsePct(simVisit)),
        laborCents: eurosToCents(parsePct(simLabor)),
        rule: draftRule,
        partnerJob: simPartner,
      });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftValid, visitCharged, visitPct, confPct, visitEmpPct, labEmpPct, simVisit, simLabor, simPartner]);

  const targetName = target === DEFAULT_TARGET
    ? "Padrão (todos os tipos sem regra própria)"
    : services.find(s => s.id === target)?.name || "Tipo de serviço";

  const save = async () => {
    if (!draftValid) { toast.error(draftErrors[0] || "Percentual inválido"); return; }
    if (reason.trim().length < 3) { toast.error("Escreva o motivo da mudança (mínimo 3 letras)"); return; }
    setSaving(true);
    const { error } = await supabase.from("financial_rules" as any).insert({
      service_type_id: target === DEFAULT_TARGET ? null : target,
      visit_charged: visitCharged,
      visit_technician_pct: draftRule.visitTechnicianPct,
      labor_confianca_pct: draftRule.laborConfiancaPct,
      visit_empresa_pct: draftRule.visitEmpresaPct,
      labor_empresa_pct: draftRule.laborEmpresaPct,
      reason: reason.trim(),
    });
    setSaving(false);
    if (error) { toast.error(error.message || "Erro ao guardar regra"); return; }
    toast.success("Nova versão da regra guardada. Vale para chamados abertos a partir de agora.");
    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Euro className="w-5 h-5" /> Regras de Divisão</CardTitle>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-64"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Escolher regra"
          >
            <option value={DEFAULT_TARGET}>Padrão (todos os tipos)</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (inativo)"}</option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xs text-muted-foreground">
            Taxa de visita e mão de obra são divididas entre a Confiança, a empresa parceira (só em chamado dela) e o técnico.
            A Confiança mantém a % dela sempre. A % da empresa parceira sai da parte do técnico, então o técnico fica com o resto.
            A taxa extra segue a divisão da mão de obra. Peças: 100% da Confiança (margem), fora desta divisão.
            Cada mudança cria uma nova versão. Chamados já abertos mantêm a regra que tinham na abertura.
          </p>

          {loading ? (
            <p className="text-muted-foreground text-sm">A carregar...</p>
          ) : (
            <>
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{targetName}</p>
                {current ? (
                  <p className="text-muted-foreground">
                    Vigente desde {fmtDate(current.effective_from)} — visita: técnico {fmtPct(current.visit_technician_pct)}
                    {current.visit_charged ? "" : " (visita não cobrada)"}, empresa parceira {fmtPct(current.visit_empresa_pct)};
                    mão de obra: Confiança {fmtPct(current.labor_confianca_pct)}, empresa parceira {fmtPct(current.labor_empresa_pct)}.
                  </p>
                ) : (
                  <p className="text-muted-foreground">Sem regra própria; usa a regra padrão.</p>
                )}
                {scheduled.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400 mt-1">
                    Há {scheduled.length} versão(ões) com vigência futura.
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label htmlFor="visit-charged">Cobrar taxa de visita neste tipo?</Label>
                    <Switch id="visit-charged" checked={visitCharged} onCheckedChange={setVisitCharged} />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="visit-pct">% do técnico sobre a taxa de visita</Label>
                    <div className="flex items-center gap-2">
                      <Input id="visit-pct" inputMode="decimal" value={visitPct} onChange={(e) => setVisitPct(e.target.value)} disabled={!visitCharged} className="w-28" />
                      <span className="text-sm text-muted-foreground">% (Confiança fica com {Number.isNaN(draftRule.visitTechnicianPct) ? "—" : fmtPct(100 - draftRule.visitTechnicianPct)})</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="visit-emp-pct">% da empresa parceira sobre a taxa de visita</Label>
                    <div className="flex items-center gap-2">
                      <Input id="visit-emp-pct" inputMode="decimal" value={visitEmpPct} onChange={(e) => setVisitEmpPct(e.target.value)} disabled={!visitCharged} className="w-28" />
                      <span className="text-sm text-muted-foreground">% (sai da parte do técnico; só em chamado de empresa)</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="conf-pct">Comissão da Confiança sobre a mão de obra</Label>
                    <div className="flex items-center gap-2">
                      <Input id="conf-pct" inputMode="decimal" value={confPct} onChange={(e) => setConfPct(e.target.value)} className="w-28" />
                      <span className="text-sm text-muted-foreground">% (técnico fica com {Number.isNaN(draftRule.laborConfiancaPct) ? "—" : fmtPct(100 - draftRule.laborConfiancaPct - draftRule.laborEmpresaPct)})</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="lab-emp-pct">% da empresa parceira sobre a mão de obra</Label>
                    <div className="flex items-center gap-2">
                      <Input id="lab-emp-pct" inputMode="decimal" value={labEmpPct} onChange={(e) => setLabEmpPct(e.target.value)} className="w-28" />
                      <span className="text-sm text-muted-foreground">% (sai da parte do técnico; só em chamado de empresa)</span>
                    </div>
                  </div>

                  {!draftValid && (
                    <p className="text-sm text-red-600">{draftErrors[0] || "Percentual inválido."}</p>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="reason">Motivo da mudança (obrigatório)</Label>
                    <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: acordo com técnicos novos a partir de novembro" rows={2} />
                  </div>

                  <Button onClick={save} disabled={saving || !draftValid}>
                    <Save className="w-4 h-4 mr-1" /> {saving ? "A guardar..." : "Guardar nova versão"}
                  </Button>
                </div>

                <div className="space-y-3 rounded-md border p-4 bg-muted/30">
                  <p className="font-medium text-sm">Simulador (com a regra do formulário)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="sim-visit">Taxa de visita (€)</Label>
                      <Input id="sim-visit" inputMode="decimal" value={simVisit} onChange={(e) => setSimVisit(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sim-labor">Mão de obra (€)</Label>
                      <Input id="sim-labor" inputMode="decimal" value={simLabor} onChange={(e) => setSimLabor(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-background p-2">
                    <Label htmlFor="sim-partner">Simular chamado de empresa parceira</Label>
                    <Switch id="sim-partner" checked={simPartner} onCheckedChange={setSimPartner} />
                  </div>
                  {simulation ? (
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b"><td className="py-1">Cliente paga</td><td className="py-1 text-right font-medium">{fmtEur(simulation.clientTotal)}</td></tr>
                        <tr className="border-b"><td className="py-1">Técnico recebe</td><td className="py-1 text-right">{fmtEur(simulation.technicianTotal)}</td></tr>
                        <tr className="border-b"><td className="py-1">Empresa parceira fica com</td><td className="py-1 text-right">{fmtEur(simulation.empresaTotal)}</td></tr>
                        <tr className="border-b"><td className="py-1">Confiança fica com</td><td className="py-1 text-right">{fmtEur(simulation.confiancaTotal)}</td></tr>
                        <tr><td className="py-1 text-muted-foreground">Visita: técnico / empresa / Confiança</td><td className="py-1 text-right text-muted-foreground">{fmtEur(simulation.visit.technician)} / {fmtEur(simulation.visit.empresa)} / {fmtEur(simulation.visit.confianca)}</td></tr>
                        <tr><td className="py-1 text-muted-foreground">M.O.: técnico / empresa / Confiança</td><td className="py-1 text-right text-muted-foreground">{fmtEur(simulation.labor.technician)} / {fmtEur(simulation.labor.empresa)} / {fmtEur(simulation.labor.confianca)}</td></tr>
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted-foreground">Corrija os percentuais para ver a simulação.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-sm flex items-center gap-2"><History className="w-4 h-4" /> Histórico de versões</p>
                {targetRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma versão registada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-2 px-2">Vigência</th>
                          <th className="py-2 px-2">Visita (técnico / empresa)</th>
                          <th className="py-2 px-2">M.O. (Confiança / empresa)</th>
                          <th className="py-2 px-2">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetRows.map(r => (
                          <tr key={r.id} className="border-b">
                            <td className="py-2 px-2">{fmtDate(r.effective_from)}{new Date(r.effective_from).getTime() > now ? " (futura)" : ""}</td>
                            <td className="py-2 px-2">{r.visit_charged ? `${fmtPct(r.visit_technician_pct)} / ${fmtPct(r.visit_empresa_pct)}` : "não cobrada"}</td>
                            <td className="py-2 px-2">{fmtPct(r.labor_confianca_pct)} / {fmtPct(r.labor_empresa_pct)}</td>
                            <td className="py-2 px-2 text-muted-foreground">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
