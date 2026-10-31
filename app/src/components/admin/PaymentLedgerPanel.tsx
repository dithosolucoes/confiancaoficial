import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Payment = {
  id: string;
  service_request_id: string;
  payment_type: string;
  amount: number;
  method: string;
  source: string;
  reference: string | null;
  reversal_of: string | null;
  reason: string | null;
  created_at: string;
};

type Divergence = {
  id: string;
  service_request_id: string;
  payment_type: string;
  expected_amount: number;
  paid_amount: number;
  status: "aberta" | "resolvida";
  resolution_note: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  booking: "Agendamento",
  quote: "Orçamento",
  labor: "Mão de obra",
  materials: "Peças",
  additional: "Adicional",
};
const SOURCE_LABEL: Record<string, string> = { simulado: "Simulado", stripe: "Stripe", manual: "Manual" };
const fmt = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

export default function PaymentLedgerPanel() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [divergences, setDivergences] = useState<Divergence[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [divTarget, setDivTarget] = useState<Divergence | null>(null);
  const [divNote, setDivNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [payRes, divRes] = await Promise.all([
      (supabase as any).from("service_payments").select("*").order("created_at", { ascending: false }).limit(300),
      (supabase as any).from("payment_divergences").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (payRes.error || divRes.error) {
      toast.error("Erro ao carregar pagamentos", { description: (payRes.error || divRes.error).message });
      setLoading(false);
      return;
    }
    const pays = (payRes.data || []) as Payment[];
    const divs = (divRes.data || []) as Divergence[];
    const ids = Array.from(new Set([...pays.map((p) => p.service_request_id), ...divs.map((d) => d.service_request_id)]));
    let refMap: Record<string, string> = {};
    if (ids.length) {
      const { data } = await supabase.from("service_requests").select("id, reference").in("id", ids);
      refMap = Object.fromEntries((data || []).map((r: any) => [r.id, r.reference || String(r.id).slice(0, 8)]));
    }
    setPayments(pays);
    setDivergences(divs);
    setRefs(refMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reversedIds = useMemo(
    () => new Set(payments.map((p) => p.reversal_of).filter(Boolean) as string[]),
    [payments],
  );
  const openDivergences = divergences.filter((d) => d.status === "aberta");
  const refOf = (id: string) => refs[id] || String(id).slice(0, 8);

  const doReverse = async () => {
    if (!reverseTarget) return;
    if (!reverseReason.trim()) {
      toast.error("Informe o motivo do estorno");
      return;
    }
    setBusy(true);
    const { error } = await (supabase as any).rpc("estornar_pagamento", {
      _payment_id: reverseTarget.id,
      _reason: reverseReason.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Erro ao estornar");
      return;
    }
    toast.success("Estorno registrado (lançamento novo)");
    setReverseTarget(null);
    setReverseReason("");
    load();
  };

  const doResolve = async () => {
    if (!divTarget) return;
    if (!divNote.trim()) {
      toast.error("Escreva como a divergência foi resolvida");
      return;
    }
    setBusy(true);
    const { error } = await (supabase as any)
      .from("payment_divergences")
      .update({
        status: "resolvida",
        resolution_note: divNote.trim(),
        resolved_by: user?.id ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", divTarget.id);
    setBusy(false);
    if (error) {
      toast.error(error.message || "Erro ao resolver");
      return;
    }
    toast.success("Divergência resolvida");
    setDivTarget(null);
    setDivNote("");
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando pagamentos...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Divergências abertas ({openDivergences.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {openDivergences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma divergência aberta. Um valor pago diferente do esperado aparece aqui.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {openDivergences.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">{refOf(d.service_request_id)}</TableCell>
                    <TableCell className="text-xs">{TYPE_LABEL[d.payment_type] || d.payment_type}</TableCell>
                    <TableCell className="text-xs text-right">{fmt(d.expected_amount)}</TableCell>
                    <TableCell className="text-xs text-right">{fmt(d.paid_amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setDivTarget(d); setDivNote(""); }}>
                        Resolver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pagamentos registrados (últimos 300)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Lançamentos não são alterados nem apagados. Para corrigir um pagamento, use Estornar: o estorno é um lançamento novo, com motivo.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</TableCell>
                  </TableRow>
                )}
                {payments.map((p) => {
                  const isReversal = !!p.reversal_of;
                  const isReversed = reversedIds.has(p.id);
                  const canReverse = !isReversal && !isReversed && p.amount > 0;
                  const situacao = isReversal
                    ? `Estorno: ${p.reason || ""}`
                    : isReversed ? "Estornado" : "Ativo";
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(p.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell className="text-xs">{refOf(p.service_request_id)}</TableCell>
                      <TableCell className="text-xs">{TYPE_LABEL[p.payment_type] || p.payment_type}</TableCell>
                      <TableCell className={`text-xs text-right ${p.amount < 0 ? "text-red-600" : ""}`}>{fmt(p.amount)}</TableCell>
                      <TableCell className="text-xs">{p.method}</TableCell>
                      <TableCell className="text-xs">{SOURCE_LABEL[p.source] || p.source}</TableCell>
                      <TableCell className="text-xs">{p.reference || "—"}</TableCell>
                      <TableCell className="text-xs">{situacao}</TableCell>
                      <TableCell className="text-right">
                        {canReverse && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setReverseTarget(p); setReverseReason(""); }}>
                            Estornar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Estornar pagamento</DialogTitle>
            <DialogDescription>
              Cria um lançamento negativo de {reverseTarget ? fmt(reverseTarget.amount) : ""}. O pagamento original continua no histórico.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Motivo do estorno (obrigatório)" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseTarget(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={doReverse} disabled={busy}>{busy ? "A guardar..." : "Confirmar estorno"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!divTarget} onOpenChange={(o) => !o && setDivTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver divergência</DialogTitle>
            <DialogDescription>
              Esperado {divTarget ? fmt(divTarget.expected_amount) : ""}, pago {divTarget ? fmt(divTarget.paid_amount) : ""}. Escreva o que foi feito.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={divNote} onChange={(e) => setDivNote(e.target.value)} placeholder="Ex.: Cliente pagou o restante em dinheiro, recibo 123" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDivTarget(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={doResolve} disabled={busy}>{busy ? "A guardar..." : "Marcar como resolvida"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
