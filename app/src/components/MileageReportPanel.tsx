import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, FileText, Save, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Trip {
  id: string;
  technician_id: string;
  trip_type: string;
  origin_address: string | null;
  destination_address: string | null;
  distance_km: number;
  reference: string | null;
  started_at: string;
  ended_at: string | null;
  service_request_id: string | null;
}

interface Tech { user_id: string; full_name: string; }

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const MileageReportPanel = () => {
  const { profile } = useAuth();
  const isGestor = profile?.user_type === "gestor";
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [techId, setTechId] = useState<string>("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [rate, setRate] = useState<number>(0.4);
  const [rateInput, setRateInput] = useState<string>("0.40");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  // Load technicians
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_type", "technician")
        .order("full_name");
      const list = (data || []) as Tech[];
      setTechs(list);
      setTechId(list[0]?.user_id || "");
    })();
  }, []);

  // Load settings
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("mileage_settings").select("*").limit(1).maybeSingle();
      if (data) {
        setSettingsId(data.id);
        setRate(Number(data.rate_per_km));
        setRateInput(Number(data.rate_per_km).toFixed(2));
      }
    })();
  }, []);

  // Load trips
  const fetchTrips = async () => {
    if (!techId) return;
    setLoading(true);
    const start = new Date(year, month - 1, 1).toISOString();
    const end = new Date(year, month, 1).toISOString();
    const { data, error } = await supabase
      .from("mileage_trips")
      .select("*")
      .eq("technician_id", techId)
      .gte("started_at", start)
      .lt("started_at", end)
      .order("started_at", { ascending: true });
    if (error) toast.error(error.message);
    setTrips((data || []) as Trip[]);
    setLoading(false);
  };

  useEffect(() => { fetchTrips();   }, [techId, year, month]);

  const totals = useMemo(() => {
    const totalKm = trips.reduce((s, t) => s + Number(t.distance_km || 0), 0);
    const services = trips.filter(t => t.trip_type !== "client_to_office" && t.service_request_id).length;
    const days = new Set(trips.map(t => t.started_at.slice(0, 10))).size || 1;
    const avgPerService = services > 0 ? totalKm / services : 0;
    const avgDaily = totalKm / days;
    const refund = totalKm * rate;
    return { totalKm, services, days, avgPerService, avgDaily, refund };
  }, [trips, rate]);

  const updateRate = async () => {
    if (!isGestor || !settingsId) return;
    const newRate = parseFloat(rateInput.replace(",", "."));
    if (isNaN(newRate) || newRate < 0) { toast.error("Valor inválido"); return; }
    const { error } = await supabase
      .from("mileage_settings")
      .update({ rate_per_km: newRate, updated_by: profile?.user_id })
      .eq("id", settingsId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("mileage_audit").insert({
      setting_id: settingsId,
      field_name: "rate_per_km",
      old_value: String(rate),
      new_value: String(newRate),
      changed_by: profile!.user_id,
    });
    setRate(newRate);
    toast.success("Valor por Km atualizado");
  };

  const saveTripKm = async (tripId: string) => {
    if (!isGestor) return;
    const val = parseFloat((editing[tripId] || "").replace(",", "."));
    if (isNaN(val) || val < 0) { toast.error("Km inválido"); return; }
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    const { error } = await supabase.from("mileage_trips").update({
      distance_km: val, manual_override: true, overridden_by: profile?.user_id,
    }).eq("id", tripId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("mileage_audit").insert({
      trip_id: tripId, field_name: "distance_km",
      old_value: String(trip.distance_km), new_value: String(val),
      changed_by: profile!.user_id,
    });
    setEditing(prev => { const n = { ...prev }; delete n[tripId]; return n; });
    fetchTrips();
    toast.success("Distância atualizada");
  };

  const techName = techs.find(t => t.user_id === techId)?.full_name || "Técnico";

  const exportExcel = () => {
    const rows = trips.map(t => ({
      Data: new Date(t.started_at).toLocaleDateString("pt-PT"),
      Origem: t.origin_address || "",
      Destino: t.destination_address || "",
      Referência: t.reference || (t.trip_type === "client_to_office" ? "Encerramento" : "-"),
      Tipo: t.trip_type,
      Km: Number(t.distance_km).toFixed(2),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ["Total de Km", totals.totalKm.toFixed(2)],
      ["Total de Serviços", totals.services],
      ["Valor por Km (€)", rate.toFixed(2)],
      ["Total a Reembolsar (€)", totals.refund.toFixed(2)],
    ], { origin: -1 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quilometragem");
    XLSX.writeFile(wb, `quilometragem_${techName}_${year}-${String(month).padStart(2,"0")}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Relatório de Quilometragem — ${techName}`, 14, 16);
    doc.setFontSize(11);
    doc.text(`${MONTHS[month - 1]} ${year}`, 14, 23);
    autoTable(doc, {
      startY: 30,
      head: [["Data", "Origem", "Destino", "Referência", "Km"]],
      body: trips.map(t => [
        new Date(t.started_at).toLocaleDateString("pt-PT"),
        t.origin_address || "",
        t.destination_address || "",
        t.reference || (t.trip_type === "client_to_office" ? "Encerramento" : "-"),
        Number(t.distance_km).toFixed(2),
      ]),
      styles: { fontSize: 8 },
    });
    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.text(`Total de Km: ${totals.totalKm.toFixed(2)}`, 14, finalY);
    doc.text(`Total de Serviços: ${totals.services}`, 14, finalY + 6);
    doc.text(`Valor por Km: € ${rate.toFixed(2)}`, 14, finalY + 12);
    doc.text(`Total a Reembolsar: € ${totals.refund.toFixed(2)}`, 14, finalY + 18);
    doc.save(`quilometragem_${techName}_${year}-${String(month).padStart(2,"0")}.pdf`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Relatório de Quilometragem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label>Mês</Label>
              <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y =>
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Técnico</Label>
              <Select value={techId} onValueChange={setTechId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {techs.map(t => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor por Km (€)</Label>
              <div className="flex gap-1">
                <Input
                  value={rateInput}
                  onChange={e => setRateInput(e.target.value)}
                  inputMode="decimal"
                  disabled={!isGestor}
                />
                {isGestor && (
                  <Button size="icon" variant="outline" onClick={updateRate}><Save className="w-4 h-4" /></Button>
                )}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
              <Button variant="outline" onClick={exportPDF}><FileText className="w-4 h-4 mr-1" />PDF</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Total Serviços" value={String(totals.services)} />
            <SummaryCard label="Total Km" value={totals.totalKm.toFixed(2)} />
            <SummaryCard label="Média Km/Serviço" value={totals.avgPerService.toFixed(2)} />
            <SummaryCard label="Média Diária" value={totals.avgDaily.toFixed(2)} />
            <SummaryCard label="Reembolso (€)" value={totals.refund.toFixed(2)} highlight />
          </div>

          <div className="border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  {isGestor && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6">A carregar…</TableCell></TableRow>
                ) : trips.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sem deslocações neste período.</TableCell></TableRow>
                ) : trips.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>{new Date(t.started_at).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={t.origin_address || ""}>{t.origin_address}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={t.destination_address || ""}>{t.destination_address}</TableCell>
                    <TableCell>{t.reference || (t.trip_type === "client_to_office" ? "Encerramento" : "-")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {t.trip_type === "office_to_client" ? "Saída" : t.trip_type === "client_to_office" ? "Regresso" : "Cliente→Cliente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {editing[t.id] !== undefined ? (
                        <Input
                          className="h-7 w-20 text-right ml-auto"
                          value={editing[t.id]}
                          inputMode="decimal"
                          onChange={e => setEditing(p => ({ ...p, [t.id]: e.target.value }))}
                          onBlur={() => saveTripKm(t.id)}
                          onKeyDown={e => { if (e.key === "Enter") saveTripKm(t.id); }}
                          autoFocus
                        />
                      ) : (
                        <span className={t.distance_km > 0 ? "" : "text-muted-foreground"}>{Number(t.distance_km).toFixed(2)}</span>
                      )}
                    </TableCell>
                    {isGestor && (
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(p => ({ ...p, [t.id]: String(t.distance_km) }))}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const SummaryCard = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className={`rounded-lg border p-3 ${highlight ? "bg-primary/10 border-primary/30" : "bg-card"}`}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
  </div>
);

export default MileageReportPanel;
