import React from "react";
import CashFlowPanel from "@/components/CashFlowPanel";
import ServiceStatementPanel from "@/components/admin/ServiceStatementPanel";
import PaymentLedgerPanel from "@/components/admin/PaymentLedgerPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Euro, Receipt, Wallet } from "lucide-react";

export const AdminFinancialPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <Euro className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Fluxo de Caixa & DRE Operacional
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Acompanhamento consolidado de entradas, saídas, margem bruta de serviços e apuração de IVA (6% e 23%).
        </p>
      </div>

      <Tabs defaultValue="cashflow" className="space-y-4">
        <TabsList className="bg-slate-100 dark:bg-slate-900 p-1 flex-wrap h-auto">
          <TabsTrigger value="cashflow" className="text-xs gap-1.5"><Wallet className="w-4 h-4" /> Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="statement" className="text-xs gap-1.5"><Receipt className="w-4 h-4" /> Extrato por serviço</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs gap-1.5"><CreditCard className="w-4 h-4" /> Pagamentos e divergências</TabsTrigger>
        </TabsList>
        <TabsContent value="cashflow">
          <CashFlowPanel />
        </TabsContent>
        <TabsContent value="statement">
          <ServiceStatementPanel />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentLedgerPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminFinancialPage;
