import React, { useState, useEffect } from "react";
import GestorAgenda from "@/components/GestorAgenda";
import ServiceDetailDialog from "@/components/ServiceDetailDialog";
import { useServices } from "@/hooks/useServices";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Loader2 } from "lucide-react";

interface TechSummary {
  user_id: string;
  full_name: string;
}

export const AdminAgendaPage: React.FC = () => {
  const { services, isLoading } = useServices({ pageSize: 100 });
  const [technicians, setTechnicians] = useState<TechSummary[]>([]);
  const [selectedDetailService, setSelectedDetailService] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    const loadTechs = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_type", "technician");

      if (error) {
        toast.error("Não foi possível carregar a lista de técnicos.");
        setTechnicians([]);
      } else {
        setTechnicians((data || []) as TechSummary[]);
      }
    };

    loadTechs();
  }, []);

  const servicesForAgenda = services.map((s) => ({
    id: s.id,
    reference: s.reference,
    scheduled_date: s.scheduled_date,
    scheduled_time: s.scheduled_time,
    is_warranty: s.is_warranty,
    technician_id: s.technician_id || null,
    localidade: s.localidade || "Lisboa",
    status: s.status,
    appliance_type: s.appliance_type,
  }));

  const handleServiceClick = (id: string) => {
    const target = services.find((s) => s.id === id);
    if (target) {
      const tech = technicians.find((t) => t.user_id === target.technician_id);
      setSelectedDetailService({
        ...target,
        technician_name: tech?.full_name,
      });
      setIsDetailOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Agenda Operacional & Deslocações
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Visualização mensal e diária de todas as visitas agendadas, retornos de garantia e escala de técnicos.
        </p>
      </div>

      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Carregando agenda operacional...
            </div>
          ) : (
            <GestorAgenda
              services={servicesForAgenda}
              technicians={technicians}
              returnVisits={[]}
              onServiceClick={handleServiceClick}
            />
          )}
        </CardContent>
      </Card>

      <ServiceDetailDialog
        service={selectedDetailService}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
    </div>
  );
};

export default AdminAgendaPage;
