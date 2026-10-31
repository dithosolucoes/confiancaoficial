import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { formatServiceReference } from "@/lib/serviceLabel";

interface ServiceRequest {
  id: string;
  reference: string;
  scheduled_date: string;
  scheduled_time: string;
  warranty_return_date?: string | null;
  warranty_return_time?: string | null;
  warranty_completed_at?: string | null;
  is_warranty?: boolean;
  technician_id: string | null;
  localidade: string;
  status: string;
  appliance_type: string;
}

type AgendaItem = ServiceRequest & {
  agenda_date: string;
  agenda_time: string;
  agenda_label: "initial" | "return";
  return_sequence?: number;
  visit_completed?: boolean;
  visit_key: string;
};

interface Technician {
  user_id: string;
  full_name: string;
}

interface ReturnVisit {
  id: string;
  service_request_id: string;
  sequence: number;
  return_date: string | null;
  return_time: string | null;
  completed_at: string | null;
  technician_id?: string | null;
}

interface Props {
  services: ServiceRequest[];
  technicians: Technician[];
  returnVisits?: ReturnVisit[];
  onServiceClick?: (serviceId: string) => void;
}


const TECH_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-l-blue-500", text: "text-blue-800 dark:text-blue-200", dot: "bg-blue-500" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", border: "border-l-emerald-500", text: "text-emerald-800 dark:text-emerald-200", dot: "bg-emerald-500" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-l-amber-500", text: "text-amber-800 dark:text-amber-200", dot: "bg-amber-500" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-l-purple-500", text: "text-purple-800 dark:text-purple-200", dot: "bg-purple-500" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", border: "border-l-rose-500", text: "text-rose-800 dark:text-rose-200", dot: "bg-rose-500" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", border: "border-l-cyan-500", text: "text-cyan-800 dark:text-cyan-200", dot: "bg-cyan-500" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-l-orange-500", text: "text-orange-800 dark:text-orange-200", dot: "bg-orange-500" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", border: "border-l-indigo-500", text: "text-indigo-800 dark:text-indigo-200", dot: "bg-indigo-500" },
];

const dateFnsLocales: Record<string, typeof ptBR> = { pt: ptBR, en: enUS, es };

const GestorAgenda = ({ services, technicians, returnVisits = [], onServiceClick }: Props) => {
  const { t, i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const currentLocale = dateFnsLocales[i18n.language] || ptBR;

  // Map technician IDs to colors
  const techColorMap = useMemo(() => {
    const map = new Map<string, typeof TECH_COLORS[0]>();
    const uniqueTechs = [...new Set(services.map((s) => s.technician_id).filter(Boolean))] as string[];
    uniqueTechs.forEach((techId, idx) => {
      map.set(techId, TECH_COLORS[idx % TECH_COLORS.length]);
    });
    return map;
  }, [services]);

  const getTechName = (techId: string | null) => {
    if (!techId) return t("unassigned") || "Não atribuído";
    return technicians.find((tech) => tech.user_id === techId)?.full_name || "—";
  };

  const getTechColor = (techId: string | null) => {
    if (!techId) return { bg: "bg-muted", border: "border-l-muted-foreground", text: "text-muted-foreground", dot: "bg-muted-foreground" };
    return techColorMap.get(techId) || TECH_COLORS[0];
  };

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group services by date.
  // Rule: each visit (initial + every return) stays on its own date, even after completion.
  const servicesByDate = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    const visitsByService = new Map<string, ReturnVisit[]>();
    for (const rv of returnVisits) {
      if (!rv.service_request_id || !rv.return_date) continue;
      const arr = visitsByService.get(rv.service_request_id) || [];
      arr.push(rv);
      visitsByService.set(rv.service_request_id, arr);
    }

    services
      .filter((s) => s.status !== "cancelled")
      .forEach((s) => {
        const items: AgendaItem[] = [];

        // Initial appointment — always present, keeps its original date.
        if (s.scheduled_date) {
          items.push({
            ...s,
            agenda_date: s.scheduled_date,
            agenda_time: s.scheduled_time,
            agenda_label: "initial",
            visit_completed: !!(s as any).completed_at,
            visit_key: `${s.id}:initial`,
          });
        }

        // Each return visit — one entry per row, persists after completion.
        const returns = (visitsByService.get(s.id) || [])
          .slice()
          .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        for (const rv of returns) {
          if (!rv.return_date) continue;
          items.push({
            ...s,
            agenda_date: rv.return_date,
            agenda_time: rv.return_time || s.scheduled_time,
            agenda_label: "return",
            return_sequence: rv.sequence,
            visit_completed: !!rv.completed_at,
            visit_key: `${s.id}:return:${rv.id}`,
          });
        }

        // Active return currently held on service_requests (not yet archived into
        // service_return_visits). Always surface it so that the compromisso
        // appears on the agenda immediately after saving, whether it's the first
        // return ever or a new return scheduled after previous ones.
        if (s.is_warranty && s.warranty_return_date) {
          const alreadyPresent = returns.some(
            (rv) =>
              rv.return_date === s.warranty_return_date &&
              (rv.return_time || "") === (s.warranty_return_time || "") &&
              !rv.completed_at,
          );
          if (!alreadyPresent) {
            const nextSeq =
              returns.length > 0
                ? Math.max(...returns.map((rv) => rv.sequence || 0)) + 1
                : 1;
            items.push({
              ...s,
              agenda_date: s.warranty_return_date,
              agenda_time: s.warranty_return_time || s.scheduled_time,
              agenda_label: "return",
              return_sequence: nextSeq,
              visit_completed: !!s.warranty_completed_at,
              visit_key: `${s.id}:return:active`,
            });
          }
        }

        items.forEach((item) => {
          const key = item.agenda_date;
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(item);
        });
      });
    // Sort each day's services by time
    map.forEach((dayServices) => {

      dayServices.sort((a, b) => a.agenda_time.localeCompare(b.agenda_time));
    });
    return map;
  }, [services, returnVisits]);


  const selectedDayServices = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, "yyyy-MM-dd");
    return servicesByDate.get(key) || [];
  }, [selectedDay, servicesByDate]);

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(2024, 0, i); // Mon=1
      days.push(format(d, "EEE", { locale: currentLocale }));
    }
    return days;
  }, [currentLocale]);

  // Legend: unique technicians with assigned services
  const legendTechs = useMemo(() => {
    const uniqueIds = [...new Set(services.map((s) => s.technician_id).filter(Boolean))] as string[];
    return uniqueIds.map((id) => ({
      id,
      name: getTechName(id),
      color: getTechColor(id),
    }));
  }, [services, technicians, techColorMap]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-xl font-semibold capitalize min-w-[180px] text-center">
            {format(currentMonth, "MMMM yyyy", { locale: currentLocale })}
          </h2>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCurrentMonth(new Date());
              setSelectedDay(new Date());
            }}
            className="ml-2"
          >
            {t("today") || "Hoje"}
          </Button>
        </div>
      </div>

      {/* Legend */}
      {legendTechs.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {legendTechs.map((tech) => (
            <div key={tech.id} className="flex items-center gap-1.5 text-sm">
              <span className={`w-3 h-3 rounded-full ${tech.color.dot}`} />
              <span className="font-medium">{tech.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="w-3 h-3 rounded-full bg-muted-foreground" />
            <span className="font-medium text-muted-foreground">{t("unassigned") || "Não atribuído"}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2">
          <CardContent className="p-3">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-xs font-semibold text-muted-foreground uppercase py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {calendarDays.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayServices = servicesByDate.get(dateKey) || [];
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const isTodayDate = isToday(day);

                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDay(day)}
                    className={`
                      min-h-[90px] p-1.5 flex flex-col items-start text-left transition-colors bg-background
                      ${!isCurrentMonth ? "opacity-40" : ""}
                      ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                      hover:bg-accent/50
                    `}
                  >
                    <span
                      className={`
                        text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                        ${isTodayDate ? "bg-primary text-primary-foreground" : ""}
                      `}
                    >
                      {format(day, "d")}
                    </span>

                    <div className="w-full space-y-0.5 overflow-hidden">
                      {dayServices.slice(0, 3).map((s) => {
                        const color = getTechColor(s.technician_id);
                        const seqTxt = s.agenda_label === "return" ? `↩${s.return_sequence ? s.return_sequence : ""} ` : "";
                        return (
                          <div
                            key={s.visit_key}
                            className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${color.bg} ${color.text} border-l-2 ${color.border} ${s.visit_completed ? "opacity-60 line-through" : ""}`}
                            title={`${formatServiceReference(s as any)} — ${s.agenda_label === "return" ? `Retorno${s.return_sequence ? " Nº " + s.return_sequence : ""}${s.visit_completed ? " (concluído)" : ""} — ` : s.visit_completed ? "(concluído) — " : ""}${getTechName(s.technician_id)} — ${s.localidade || ""}`}
                          >
                            <span className="font-semibold">{s.agenda_time}</span>{" "}
                            {seqTxt}
                            {formatServiceReference(s as any)}
                          </div>
                        );
                      })}

                      {dayServices.length > 3 && (
                        <div className="text-[10px] text-muted-foreground pl-1">
                          +{dayServices.length - 3} {t("more") || "mais"}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day Detail Panel */}
        <Card>
          <CardContent className="p-4">
            {selectedDay ? (
              <>
                <h3 className="font-semibold text-lg mb-3 capitalize">
                  {format(selectedDay, "EEEE, d MMMM", { locale: currentLocale })}
                </h3>
                {selectedDayServices.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {t("no_services_day") || "Sem serviços agendados para este dia"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayServices.map((s) => {
                      const color = getTechColor(s.technician_id);
                      const isReturn = s.agenda_label === "return";
                      return (
                        <button
                          key={s.visit_key}
                          onClick={() => onServiceClick?.(s.id)}
                          className={`w-full text-left p-3 rounded-lg border-l-4 ${color.border} ${color.bg} space-y-1 hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer ${s.visit_completed ? "opacity-75" : ""}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-bold text-sm ${color.text}`}>
                              {formatServiceReference(s as any)}
                            </span>
                            <div className="flex items-center gap-1">
                              {s.visit_completed && (
                                <Badge variant="outline" className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-300">
                                  Concluído
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px]">
                                {s.agenda_time}
                              </Badge>
                            </div>
                          </div>
                          <div className={`text-xs ${color.text} space-y-0.5`}>
                            {isReturn ? (
                              <p className="font-semibold">↩ Retorno{s.return_sequence ? ` Nº ${s.return_sequence}` : ""}</p>
                            ) : (
                              <p className="font-semibold">📅 Agendamento inicial</p>
                            )}
                            <p className="font-medium">
                              👤 {getTechName(s.technician_id)}
                            </p>
                            {s.localidade && (
                              <p>📍 {s.localidade}</p>
                            )}
                            <p className="opacity-75">{s.appliance_type}</p>
                          </div>
                        </button>
                      );
                    })}

                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CalendarIcon className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">{t("select_day") || "Selecione um dia para ver os serviços"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GestorAgenda;
