import React from "react";
import AdminReconciliationPanel from "@/components/AdminReconciliationPanel";
import { ShieldCheck } from "lucide-react";

export const AdminAuditPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Centro de Auditoria & Conciliação
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Auditoria forense de integridade entre ordens de serviço, lotes de pagamento, contas a pagar e repasses.
        </p>
      </div>

      <AdminReconciliationPanel />
    </div>
  );
};

export default AdminAuditPage;
