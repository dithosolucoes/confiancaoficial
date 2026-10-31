import React, { useState } from "react";
import { format, isSameDay } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, Wrench, Calendar as CalendarComponent } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import TechnicianJobCard from "./TechnicianJobCard";

interface TechnicianScheduleTabProps {
  jobs: any[];
  materials: Record<string, any[]>;
  currentUserId?: string;
  onRefresh: () => void;
}

export const TechnicianScheduleTab: React.FC<TechnicianScheduleTabProps> = ({
  jobs,
  materials,
  currentUserId,
  onRefresh,
}) => {
  const { t, i18n } = useTranslation();
  const dateFnsLocales: Record<string, typeof ptBR> = { pt: ptBR, en: enUS, es };
  const currentLocale = dateFnsLocales[i18n.language] || ptBR;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Preparar os marcadores de datas para o calendário
  const pendingDates: Date[] = [];
  const scheduledDates: Date[] = [];
  const inProgressDates: Date[] = [];
  const completedDates: Date[] = [];

  jobs.forEach((j) => {
    if (!j.scheduled_date) return;
    const d = new Date(j.scheduled_date + "T00:00:00");
    if (isNaN(d.getTime())) return;

    if (j.status === "pending") pendingDates.push(d);
    else if (j.status === "accepted") scheduledDates.push(d);
    else if (j.status === "in_progress" || j.status === "budgeting") inProgressDates.push(d);
    else if (j.status === "completed") completedDates.push(d);
  });

  const filteredJobs = selectedDate
    ? jobs.filter((j) => {
        if (!j.scheduled_date) return false;
        const d = new Date(j.scheduled_date + "T00:00:00");
        return isSameDay(d, selectedDate);
      })
    : jobs;

  return (
    <div className="space-y-6">
      {/* Calendar Card */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-6 flex flex-col items-center">
          <div className="w-full max-w-sm flex justify-center">
            <input
              type="date"
              className="sm:hidden w-full p-2 border rounded-md text-xs mb-3"
              value={selectedDate ? selectedDate.toISOString().slice(0, 10) : ""}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(new Date(e.target.value + "T00:00:00"));
                }
              }}
            />
          </div>

          <div className="hidden sm:flex justify-center w-full">
            <div className="p-2 border rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <input
                type="date"
                value={selectedDate ? selectedDate.toISOString().slice(0, 10) : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(new Date(e.target.value + "T00:00:00"));
                  }
                }}
                className="text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          {/* Legenda de Status de Atendimento */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> {t("tech_schedule_status_available")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> {t("tech_schedule_status_scheduled")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {t("tech_schedule_status_in_progress")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> {t("tech_schedule_status_completed")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Serviços para o dia selecionado */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            {t("tech_schedule_services_for")}{" "}
            {selectedDate
              ? format(selectedDate, "dd 'de' MMMM", { locale: currentLocale })
              : t("tech_schedule_all_dates")}
          </h3>
          <Badge variant="outline" className="text-xs">
            {filteredJobs.length} {filteredJobs.length === 1 ? t("tech_schedule_visit_singular") : t("tech_schedule_visit_plural")}
          </Badge>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 text-xs space-y-1">
            <CalendarIcon className="w-8 h-8 text-slate-400 mx-auto opacity-50 mb-2" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              {t("tech_schedule_empty_title")}
            </p>
            <p className="text-slate-400">
              {t("tech_schedule_empty_desc")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => (
              <TechnicianJobCard
                key={job.id}
                job={job}
                materials={materials[job.id] || []}
                currentUserId={currentUserId}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TechnicianScheduleTab;
