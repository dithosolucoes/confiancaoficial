import React from "react";
import TechnicianPayoutBatches from "@/components/TechnicianPayoutBatches";
import { Wallet } from "lucide-react";

export const AdminPayoutsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <Wallet className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Pagamentos & Lotes a Técnicos e Parceiros
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Fechamento de lotes periódicos com cálculo de 50% de taxa de serviço, quilometragem (taxa vigente em Configurações › Financeiro) e conciliação bancária por IBAN.
        </p>
      </div>

      <TechnicianPayoutBatches />
    </div>
  );
};

export default AdminPayoutsPage;
