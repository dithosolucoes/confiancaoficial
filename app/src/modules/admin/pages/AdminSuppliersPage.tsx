import React from "react";
import SuppliersPanel from "@/components/SuppliersPanel";
import AccountsPayablePanel from "@/components/AccountsPayablePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, FileText } from "lucide-react";

export const AdminSuppliersPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Fornecedores & Contas a Pagar
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Gestão cadastral de fornecedores de peças e controle de títulos a pagar, compras a prazo e boletos.
        </p>
      </div>

      <Tabs defaultValue="suppliers" className="space-y-4">
        <TabsList className="bg-slate-100 dark:bg-slate-900 p-1">
          <TabsTrigger value="suppliers" className="text-xs gap-1.5">
            <Truck className="w-4 h-4" /> Fornecedores Cadastrados
          </TabsTrigger>
          <TabsTrigger value="payables" className="text-xs gap-1.5">
            <FileText className="w-4 h-4" /> Contas a Pagar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers">
          <SuppliersPanel />
        </TabsContent>

        <TabsContent value="payables">
          <AccountsPayablePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSuppliersPage;
