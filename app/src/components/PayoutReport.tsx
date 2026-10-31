import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileBarChart } from "lucide-react";
import { resolvePayoutReference, PayoutReference } from "@/lib/payout";

type Period = "day" | "week" | "month" | "year" | "custom";

interface Service {
  id: string;
  reference: string | null;
  appliance_type: string | null;
  technician_id: string | null;
  technician_payout: number | null;
  technician_payout_overridden: boolean | null;
  technician_payout_locked: boolean | null;
  status: string;
  completed_at: string | null;
  scheduled_date: string | null;
}

interface Tech {
  user_id: string;
  full_name: string | null;
}

const startOfPeriod = (p: Period): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "day") return d;
  if (p === "week") {
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    return d;
  }
  if (p === "month") {
    d.setDate(1);
    return d;
  }
  if (p === "year") {
    d.setMonth(0, 1);
    return d;
  }
  return d;
};

const PayoutReport = () => {
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState<string>(startOfPeriod("month").toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [services, setServices] = useState<Service[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (period !== "custom") {
      setFrom(startOfPeriod(period).toISOString().slice(0, 10));
      setTo(new Date().toISOString().slice(0, 10));
    }
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    const fromIso = new Date(from + "T00:00:00").toISOString();
    const toIso = new Date(to + "T23:59:59").toISOString();
    const [{ data: srData }, { data: techData }] = await Promise.all([
      supabase
        .from("service_requests")
        .select(
          "id,reference,appliance_type,technician_id,technician_payout,technician_payout_overridden,technician_payout_locked,status,completed_at,scheduled_date",
        )
        .eq("status", "completed")
        .gte("completed_at", fromIso)
        .lte("completed_at", toIso),
      supabase.from("profiles").select("user_id, full_name").eq("user_type", "technician"),
    ]);
    setServices((srData as Service[]) || []);
    setTechs((techData as Tech[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [from, to]);

  const techName = (id?: string | null) =>
    techs.find((t) => t.user_id === id)?.full_name || "—";

  const summary = useMemo(() => {
    const map = new Map<
      string,
      { tech: string; WO: number; SR: number; CO: number; total: number; overrides: number; count: number }
    >();
    for (const s of services) {
      if (!s.technician_id) continue;
      const ref = resolvePayoutReference(s.reference, s.appliance_type);
      const amount = Number(s.technician_payout || 0);
      const key = s.technician_id;
      const row =
        map.get(key) ||
        { tech: techName(key), WO: 0, SR: 0, CO: 0, total: 0, overrides: 0, count: 0 };
      if (ref) (row as any)[ref] += 1;
      row.total += amount;
      row.count += 1;
      if (s.technician_payout_overridden) row.overrides += 1;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [services, techs]);

  const grandTotal = summary.reduce((sum, r) => sum + r.total, 0);

  const exportCsv = () => {
    const headers = ["Técnico", "WO", "SR", "CO", "Total Serviços", "Alterações Manuais", "Total Pago (€)"];
    const lines = [headers.join(",")];
    for (const r of summary) {
      lines.push(
        [r.tech, r.WO, r.SR, r.CO, r.count, r.overrides, r.total.toFixed(2)]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      );
    }
    lines.push(["TOTAL", "", "", "", "", "", grandTotal.toFixed(2)].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagamentos_tecnicos_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileBarChart className="w-4 h-4" /> Relatório de Pagamentos a Técnicos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Label className="text-xs">Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Hoje</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="year">Este ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod("custom"); }} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod("custom"); }} />
          </div>
          <Button variant="outline" onClick={exportCsv} className="gap-1">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : summary.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem serviços concluídos neste período.</p>
        ) : (
          <div className="overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left py-2 px-3">Técnico</th>
                  <th className="text-center py-2 px-3">WO</th>
                  <th className="text-center py-2 px-3">SR</th>
                  <th className="text-center py-2 px-3">CO</th>
                  <th className="text-center py-2 px-3">Total Serviços</th>
                  <th className="text-center py-2 px-3">Alt. Manuais</th>
                  <th className="text-right py-2 px-3">Total Pago</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 px-3 font-medium">{r.tech}</td>
                    <td className="text-center">{r.WO}</td>
                    <td className="text-center">{r.SR}</td>
                    <td className="text-center">{r.CO}</td>
                    <td className="text-center">{r.count}</td>
                    <td className="text-center">
                      {r.overrides > 0 ? (
                        <Badge variant="secondary">{r.overrides}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right font-semibold">€ {r.total.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/50 font-semibold">
                  <td className="py-2 px-3" colSpan={6}>TOTAL</td>
                  <td className="text-right py-2 px-3">€ {grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PayoutReport;
