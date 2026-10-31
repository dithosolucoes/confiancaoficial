import React from "react";
import ApplianceTypesPanel from "@/components/admin/ApplianceTypesPanel";
import ServiceTypesPanel from "@/components/admin/ServiceTypesPanel";
import FinancialSettingsPanel from "@/components/admin/FinancialSettingsPanel";
import FinancialRulesPanel from "@/components/admin/FinancialRulesPanel";
import DatesSettingsPanel from "@/components/admin/DatesSettingsPanel";
import PartsMarkupPanel from "@/components/admin/PartsMarkupPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Wrench, ClipboardList, Percent, Euro, Calendar, Scale } from "lucide-react";

export const AdminSettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Configurações
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Controle do Gestor Master sobre o catálogo, os parâmetros financeiros e os prazos. O repasse
          ainda é só de leitura: a regra fica no código e na função SQL (ver blueprint, seção 9).
        </p>
      </div>

      <Tabs defaultValue="appliances" className="space-y-4">
        <TabsList className="bg-slate-100 dark:bg-slate-900 p-1 flex-wrap h-auto">
          <TabsTrigger value="appliances" className="text-xs gap-1.5">
            <Wrench className="w-4 h-4" /> Tipos de Aparelho
          </TabsTrigger>
          <TabsTrigger value="services" className="text-xs gap-1.5">
            <ClipboardList className="w-4 h-4" /> Tipos de Serviço
          </TabsTrigger>
          <TabsTrigger value="payout" className="text-xs gap-1.5">
            <Percent className="w-4 h-4" /> Repasse
          </TabsTrigger>
          <TabsTrigger value="rules" className="text-xs gap-1.5">
            <Scale className="w-4 h-4" /> Regras de Divisão
          </TabsTrigger>
          <TabsTrigger value="financial" className="text-xs gap-1.5">
            <Euro className="w-4 h-4" /> Financeiro
          </TabsTrigger>
          <TabsTrigger value="dates" className="text-xs gap-1.5">
            <Calendar className="w-4 h-4" /> Datas & Prazos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appliances">
          <ApplianceTypesPanel />
        </TabsContent>

        <TabsContent value="services">
          <ServiceTypesPanel />
        </TabsContent>

        <TabsContent value="payout">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regras de repasse configuráveis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Hoje a regra de repasse (50% da taxa de serviço + M.O. + taxa extra para o técnico, a
                partir de 01/08/2026) é fixa no código, em <code>src/lib/financial-rules.ts</code> e na
                função SQL <code>resolve_service_payout_amount</code>. Tornar isso editável pelo gestor
                (por empresa, tipo de serviço, vigência) precisa de uma migration própria, separada desta,
                porque toca numa função já testada e crítica para o fechamento financeiro.
                As regras editáveis pelo gestor estão na aba "Regras de Divisão". O repasse dos serviços
                novos usa a regra gravada em cada chamado na abertura.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-6">
          <PartsMarkupPanel />
          <FinancialRulesPanel />
        </TabsContent>

        <TabsContent value="financial">
          <FinancialSettingsPanel />
        </TabsContent>

        <TabsContent value="dates">
          <DatesSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSettingsPage;
