import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ShieldCheck, RefreshCw, PlayCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

type PreviewRow = {
  batch_item_id: string;
  batch_id: string;
  batch_label: string | null;
  payable_id: string | null;
  technician_id: string | null;
  technician_name: string | null;
  service_request_id: string;
  service_reference: string | null;
  current_item_amount: number;
  official_payout: number;
  difference: number;
};

type ExecResult = {
  items_corrected: number;
  batches_updated: number;
  payables_updated: number;
  total_delta: number;
};

const fmt = (n: number) => `${(Number(n) || 0).toFixed(2).replace(".", ",")} €`;

export default function AdminReconciliationPanel() {
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [execOpen, setExecOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecResult | null>(null);

  const analyze = async () => {
    setLoading(true);
    setResult(null);
    const { data, error } = await supabase.rpc("admin_preview_open_batch_reconciliation");
    setLoading(false);
    if (error) {
      toast.error("Erro ao analisar: " + error.message);
      return;
    }
    setRows((data as PreviewRow[]) || []);
    setAnalyzed(true);
    toast.success(`Análise concluída: ${data?.length || 0} divergência(s)`);
  };

  const execute = async () => {
    setExecuting(true);
    const { data, error } = await supabase.rpc("admin_execute_open_batch_reconciliation");
    setExecuting(false);
    setExecOpen(false);
    if (error) {
      toast.error("Erro ao executar: " + error.message);
      return;
    }
    const res = (data as ExecResult[])?.[0] || null;
    setResult(res);
    toast.success("Reconciliação concluída");
    // Refresh preview to prove there are no more divergences
    await analyze();
  };

  const totalDelta = rows.reduce((s, r) => s + Number(r.difference || 0), 0);
  const batchesCount = new Set(rows.map((r) => r.batch_id)).size;
  const payablesCount = new Set(rows.map((r) => r.payable_id).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Reconciliar Lotes Abertos de Pagamento Técnico
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Compara <code className="text-xs">technician_payout_batch_items.amount</code> com o valor oficial em{" "}
              <code className="text-xs">service_requests.technician_payout</code>.
            </p>
            <p>
              Apenas <strong>lotes abertos</strong>, <strong>contas a pagar não pagas</strong>, serviços{" "}
              <strong>sem override manual</strong> e <strong>não bloqueados</strong>. Histórico pago e regras
              financeiras nunca são alterados.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={analyze} disabled={loading} variant="outline">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Analisar
            </Button>
            <Button
              onClick={() => setExecOpen(true)}
              disabled={!analyzed || rows.length === 0 || loading}
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Executar Reconciliação
            </Button>
          </div>

          {analyzed && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Itens divergentes" value={String(rows.length)} />
              <StatBox label="Lotes afetados" value={String(batchesCount)} />
              <StatBox label="Contas a pagar" value={String(payablesCount)} />
              <StatBox
                label="Delta total"
                value={fmt(totalDelta)}
                highlight={totalDelta !== 0}
              />
            </div>
          )}

          {result && (
            <div className="rounded-md border border-green-500/40 bg-green-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                Relatório de Execução
              </div>
              <ul className="text-sm space-y-1">
                <li>• Itens corrigidos: <strong>{result.items_corrected}</strong></li>
                <li>• Lotes atualizados: <strong>{result.batches_updated}</strong></li>
                <li>• Contas a pagar atualizadas: <strong>{result.payables_updated}</strong></li>
                <li>• Delta total aplicado: <strong>{fmt(result.total_delta)}</strong></li>
                <li className="text-muted-foreground">
                  ✓ Nenhum lote pago foi alterado. ✓ Nenhuma conta paga foi alterada.
                </li>
              </ul>
            </div>
          )}

          {analyzed && rows.length === 0 && !loading && (
            <div className="rounded-md border border-green-500/40 bg-green-500/5 p-4 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Nenhuma divergência encontrada em lotes abertos elegíveis.
            </div>
          )}

          {rows.length > 0 && (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Valor no Item</TableHead>
                    <TableHead className="text-right">Valor Oficial</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.batch_item_id}>
                      <TableCell className="font-mono text-xs">{r.service_reference || "—"}</TableCell>
                      <TableCell className="text-sm">{r.technician_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.batch_label || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.current_item_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.official_payout)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.difference === 0 ? "outline" : "destructive"}>
                          {r.difference > 0 ? "+" : ""}{fmt(r.difference)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={execOpen} onOpenChange={setExecOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Confirmar Reconciliação
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Serão sincronizados <strong>{rows.length}</strong> item(ns) em{" "}
                  <strong>{batchesCount}</strong> lote(s) aberto(s), com delta total de{" "}
                  <strong>{fmt(totalDelta)}</strong>.
                </p>
                <p className="text-muted-foreground">
                  Apenas lotes abertos e contas a pagar não pagas. Serviços com override ou bloqueio
                  são ignorados. Regras de cálculo e histórico pago não são alterados.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={execute} disabled={executing}>
              {executing ? "A executar..." : "Confirmar e Executar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "border-orange-500/60 bg-orange-500/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
