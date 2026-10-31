import React, { useState, useEffect } from "react";
import {
  Wrench,
  MapPin,
  Phone,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Camera,
  Play,
  Send,
  Download,
  Car,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { safeStorage } from "@/lib/safeStorage";
import { saveServiceUpdate, type SaveResult } from "@/lib/technicianOutbox";
import TechnicianMaterialsSection from "./TechnicianMaterialsSection";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TechnicianJobCardProps {
  job: any;
  materials: any[];
  currentUserId?: string;
  onRefresh: () => void;
}

export const TechnicianJobCard: React.FC<TechnicianJobCardProps> = ({
  job,
  materials = [],
  currentUserId = "tech-current",
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reportText, setReportText] = useState(job.report_text || "");
  const [brand, setBrand] = useState(job.equipment_brand || "");
  const [model, setModel] = useState(job.equipment_model || "");
  const [age, setAge] = useState(job.equipment_age || "");
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isNotifyingOnTheWay, setIsNotifyingOnTheWay] = useState(false);

  // Mecanismo de persistência offline para relatório técnico
  const draftKey = `tech_report_draft_${job.id}`;

  useEffect(() => {
    const savedDraft = safeStorage.getItem(draftKey);
    if (savedDraft && savedDraft !== job.report_text) {
      setReportText(savedDraft);
      setHasRestoredDraft(true);
    } else {
      setReportText(job.report_text || "");
    }
  }, [job.id, job.report_text, draftKey]);

  const handleReportTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setReportText(val);
    try {
      safeStorage.setItem(draftKey, val);
    } catch {
      // safeStorage handles errors
    }
  };

  const QUEUED_MSG = t("tech_jobcard_queued_offline");

  const notifySaved = (result: SaveResult, okMsg: string) => {
    if (result === "saved") toast.success(okMsg);
    else toast.message(QUEUED_MSG);
  };

  // Executa uma alteração do serviço. Retorna true se foi salva ou enfileirada.
  const runUpdate = async (updates: Record<string, unknown>, okMsg: string): Promise<boolean> => {
    try {
      const result = await saveServiceUpdate(job.id, updates);
      notifySaved(result, okMsg);
      onRefresh();
      return true;
    } catch (err) {
      console.error("Falha ao gravar alteração do serviço:", err);
      toast.error(t("tech_jobcard_save_error"));
      return false;
    }
  };

  const handleSaveReport = async () => {
    setIsSavingReport(true);
    try {
      const result = await saveServiceUpdate(job.id, {
        report_text: reportText,
        equipment_brand: brand,
        equipment_model: model,
        equipment_age: age,
      });
      // Rascunho só é apagado depois que o laudo foi salvo ou enfileirado.
      safeStorage.removeItem(draftKey);
      setHasRestoredDraft(false);
      notifySaved(result, t("tech_jobcard_report_saved"));
      onRefresh();
    } catch (err) {
      console.error("Falha ao gravar diagnóstico:", err);
      toast.error(t("tech_jobcard_report_save_error"));
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleAcceptJob = async () => {
    await runUpdate({ status: "accepted", technician_id: currentUserId }, t("tech_jobcard_job_accepted"));
  };

  const handleStartJob = async () => {
    await runUpdate(
      { status: "in_progress", started_at: new Date().toISOString() },
      t("tech_jobcard_started")
    );
  };

  const handleSetBudgeting = async () => {
    if (!reportText.trim()) {
      toast.error(t("tech_jobcard_fill_report_before_quote"));
      return;
    }
    await runUpdate(
      { status: "budgeting", report_text: reportText },
      t("tech_jobcard_quote_sent")
    );
  };

  const handleCompleteJob = async () => {
    if (!reportText.trim()) {
      toast.error(t("tech_jobcard_report_required"));
      return;
    }
    await runUpdate(
      { status: "completed", completed_at: new Date().toISOString(), report_text: reportText },
      t("tech_jobcard_completed")
    );
  };

  const handleNotifyOnTheWay = async () => {
    setIsNotifyingOnTheWay(true);
    try {
      await runUpdate(
        { tech_on_the_way_at: new Date().toISOString(), tech_eta_minutes: 25 },
        t("tech_jobcard_on_the_way_notified")
      );
    } finally {
      setIsNotifyingOnTheWay(false);
    }
  };

  const handleExportJobPdf = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("CONFIANCA REPARA - RELATORIO DE VISITA TECNICA", 14, 18);

      doc.setFontSize(10);
      doc.text(`Ordem de Servico: ${job.reference || job.id}`, 14, 26);
      doc.text(`Aparelho: ${job.appliance_type} | Marca: ${brand || "Nao inf."} | Modelo: ${model || "Nao inf."}`, 14, 32);
      doc.text(`Cliente: ${job.contact_name} | Telefone: ${job.contact_phone}`, 14, 38);
      doc.text(`Morada: ${job.address}`, 14, 44);
      doc.text(`Status: ${job.status} | Data: ${job.scheduled_date || "Hoje"}`, 14, 50);

      doc.setFont("helvetica", "bold");
      doc.text("DIAGNOSTICO E LAUDO TECNICO:", 14, 60);
      doc.setFont("helvetica", "normal");
      const splitReport = doc.splitTextToSize(reportText || "Sem laudo registrado.", 180);
      doc.text(splitReport, 14, 66);

      const startPartsY = 66 + splitReport.length * 5 + 6;
      const partsData = materials.map((m) => [
        m.material_name,
        `€ ${Number(m.material_cost).toFixed(2)}`,
        m.status === "approved" ? "Aprovado" : "Pendente",
      ]);

      if (partsData.length > 0) {
        autoTable(doc, {
          head: [["Peca / Material", "Valor Venda", "Status"]],
          body: partsData,
          startY: startPartsY,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 41, 59] },
        });
      }

      doc.save(`laudo-tecnico-${job.reference || "servico"}.pdf`);
      toast.success(t("tech_jobcard_pdf_downloaded"));
    } catch (err: any) {
      toast.error(t("tech_jobcard_pdf_error") + err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">{t("tech_jobcard_status_pending")}</Badge>;
      case "accepted":
        return <Badge className="bg-blue-600 text-white">{t("tech_jobcard_status_accepted")}</Badge>;
      case "in_progress":
        return <Badge className="bg-amber-600 text-white animate-pulse">{t("tech_jobcard_status_in_progress")}</Badge>;
      case "budgeting":
        return <Badge className="bg-purple-600 text-white">{t("tech_jobcard_status_budgeting")}</Badge>;
      case "quote_accepted":
        return <Badge className="bg-emerald-600 text-white">{t("tech_jobcard_status_quote_accepted")}</Badge>;
      case "completed":
        return <Badge variant="outline" className="text-emerald-600 border-emerald-300">{t("tech_jobcard_status_completed")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-slate-900 dark:text-white">
                {job.reference || t("tech_jobcard_os_fallback")}
              </span>
              <Badge variant="outline" className="font-semibold text-xs">
                {job.appliance_type}
              </Badge>
              {getStatusBadge(job.status)}
              {job.is_warranty && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <ShieldAlert className="w-3 h-3" /> {t("tech_jobcard_warranty")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {job.description || t("tech_jobcard_no_description")}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={handleExportJobPdf}
            >
              <Download className="w-3.5 h-3.5 text-blue-600" /> {t("tech_jobcard_pdf_button")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs gap-1 text-slate-600"
              onClick={() => setDetailsOpen(!detailsOpen)}
            >
              {detailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {detailsOpen ? t("tech_jobcard_hide") : t("tech_jobcard_details")}
            </Button>
          </div>
        </div>

        {/* Informações de Local e Cliente */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-slate-900 dark:text-white">{t("tech_jobcard_address_label")}:</span>{" "}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {job.address}
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">{t("tech_jobcard_contact_label")}:</span>{" "}
              <a href={`tel:${job.contact_phone}`} className="text-blue-600 hover:underline font-mono">
                {job.contact_phone || t("tech_jobcard_not_informed")}
              </a>{" "}
              ({job.contact_name})
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-600 shrink-0" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">{t("tech_jobcard_date_label")}:</span>{" "}
              {job.scheduled_date} {job.scheduled_time && `${t("tech_jobcard_at_time")} ${job.scheduled_time}`}
            </div>
          </div>
        </div>

        {/* Botões de Ação Operacional de Campo */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          {job.status === "pending" && (
            <Button
              size="sm"
              className="bg-blue-600 text-white hover:bg-blue-700 text-xs gap-1.5"
              onClick={handleAcceptJob}
            >
              <CheckCircle className="w-3.5 h-3.5" /> {t("tech_jobcard_accept_job")}
            </Button>
          )}

          {job.status === "accepted" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={handleNotifyOnTheWay}
                disabled={isNotifyingOnTheWay}
              >
                <Car className="w-3.5 h-3.5 text-blue-600" />
                {isNotifyingOnTheWay ? t("tech_jobcard_notifying") : t("tech_jobcard_notify_on_the_way")}
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 text-white hover:bg-amber-700 text-xs gap-1.5"
                onClick={handleStartJob}
              >
                <Play className="w-3.5 h-3.5" /> {t("tech_jobcard_start_job")}
              </Button>
            </>
          )}

          {job.status === "in_progress" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50"
                onClick={handleSetBudgeting}
              >
                <Send className="w-3.5 h-3.5 text-purple-600" /> {t("tech_jobcard_send_to_quote")}
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs gap-1.5"
                onClick={handleCompleteJob}
              >
                <CheckCircle className="w-3.5 h-3.5" /> {t("tech_jobcard_complete_repair")}
              </Button>
            </>
          )}

          {job.status === "budgeting" && (
            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200">
              {t("tech_jobcard_awaiting_quote_approval")}
            </Badge>
          )}

          {job.status === "quote_accepted" && (
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs gap-1.5"
              onClick={handleCompleteJob}
            >
              <CheckCircle className="w-3.5 h-3.5" /> {t("tech_jobcard_complete_with_parts")}
            </Button>
          )}
        </div>

        {/* Detalhes Expansíveis: Diagnóstico Técnico, Equipamento e Peças */}
        {detailsOpen && (
          <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            {Array.isArray(job.service_steps) && job.service_steps.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("service_type_steps")}</p>
                <ul className="space-y-1.5">
                  {job.service_steps.map((step: string, index: number) => {
                    const doneList: number[] = Array.isArray(job.service_steps_done) ? job.service_steps_done : [];
                    const done = doneList.includes(index);
                    return (
                      <li key={index}>
                        <button
                          type="button"
                          onClick={async () => {
                            const next = done
                              ? doneList.filter((i) => i !== index)
                              : [...doneList, index].sort((a, b) => a - b);
                            await saveServiceUpdate(job.id, { service_steps_done: next });
                            onRefresh();
                          }}
                          className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            done
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                              : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          }`}
                        >
                          <CheckCircle className={`w-4 h-4 shrink-0 ${done ? "text-emerald-600" : "text-slate-300"}`} />
                          <span>{index + 1}. {step}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {/* Rascunho Offline Banner */}
            {hasRestoredDraft && (
              <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" /> {t("tech_jobcard_draft_restored")}
                </span>
                <span className="text-[10px] text-amber-600">{t("tech_jobcard_saved_locally")}</span>
              </div>
            )}

            {/* Identificação do Aparelho */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">{t("tech_jobcard_brand_label")}</Label>
                <Input
                  placeholder={t("tech_jobcard_brand_placeholder")}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">{t("tech_jobcard_model_label")}</Label>
                <Input
                  placeholder={t("tech_jobcard_model_placeholder")}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">{t("tech_jobcard_age_label")}</Label>
                <Input
                  placeholder={t("tech_jobcard_age_placeholder")}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {/* Laudo Técnico */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-blue-600" /> {t("tech_jobcard_report_heading")}
                </Label>
                <span className="text-[10px] text-slate-400">{t("tech_jobcard_autosave_hint")}</span>
              </div>
              <Textarea
                placeholder={t("tech_jobcard_report_placeholder")}
                value={reportText}
                onChange={handleReportTextChange}
                className="text-xs min-h-[90px]"
              />
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  className="h-7 text-xs bg-slate-900 text-white hover:bg-slate-800"
                  onClick={handleSaveReport}
                  disabled={isSavingReport}
                >
                  {isSavingReport ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  {t("tech_jobcard_save_report")}
                </Button>
              </div>
            </div>

            {/* Seção de Peças e Materiais */}
            <TechnicianMaterialsSection
              jobId={job.id}
              jobStatus={job.status}
              materials={materials}
              paidAt={job.materials_paid_at}
              technicianId={currentUserId}
              onMaterialsChanged={onRefresh}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TechnicianJobCard;
