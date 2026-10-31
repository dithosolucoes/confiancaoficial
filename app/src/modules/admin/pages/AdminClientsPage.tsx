import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Search, Phone, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CustomerProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  is_partner?: boolean;
}

export const AdminClientsPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadClients = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_type", "customer")
        .order("full_name", { ascending: true });

      if (error) {
        toast.error("Não foi possível carregar os dados. Verifique a conexão.");
        setClients([]);
      } else {
        setClients((data || []) as CustomerProfile[]);
      }
      setLoading(false);
    };

    loadClients();
  }, []);

  const filteredClients = clients.filter(
    (c) =>
      c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(searchTerm)) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Clientes & Carteira de Atendimento
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Base de clientes residenciais (B2C) e clientes corporativos parceiros (B2B com fatura mensal).
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar cliente por nome, telefone ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 h-9 text-xs"
        />
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Carregando clientes...
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8">
          <Users className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <Card key={client.id} className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm flex items-center justify-center shrink-0">
                      {client.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
                        {client.full_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {client.email || "Sem e-mail"}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={client.is_partner ? "default" : "secondary"} className="text-[10px]">
                    {client.is_partner ? "B2B Parceiro" : "B2C Residencial"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-1 text-xs text-slate-600 dark:text-slate-300">
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{client.phone || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{client.address || "Lisboa"}, {client.postal_code || ""}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminClientsPage;
