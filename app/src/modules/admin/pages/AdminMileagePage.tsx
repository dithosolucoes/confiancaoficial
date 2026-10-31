import React from "react";
import MileageReportPanel from "@/components/MileageReportPanel";
import { Compass } from "lucide-react";

export const AdminMileagePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <Compass className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Quilometragem & Relatórios de Deslocamento
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Acompanhamento de rotas por técnico, distâncias percorridas (0,40 €/km) e exportação em Excel e PDF.
        </p>
      </div>

      <MileageReportPanel />
    </div>
  );
};

export default AdminMileagePage;
