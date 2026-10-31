import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyRecord {
  id: string;
  name: string;
  nif: string;
  email: string | null;
  phone: string | null;
  iban: string | null;
  address: string | null;
  is_approved: boolean;
  created_at: string;
}

export const useCompanies = () => {
  const queryClient = useQueryClient();

  // Sem banco local: se o Supabase falhar, o erro aparece para o usuário.
  const query = useQuery<CompanyRecord[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as CompanyRecord[];
    },
    staleTime: 1000 * 60,
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (newCompany: Omit<CompanyRecord, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("companies")
        .insert(newCompany as any)
        .select()
        .single();
      if (error) throw error;
      return data as CompanyRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const approveCompanyMutation = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const { data, error } = await supabase
        .from("companies")
        .update({ is_approved: approved })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Empresa não encontrada ou sem permissão para alterar.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  return {
    ...query,
    companies: query.data || [],
    createCompany: createCompanyMutation.mutateAsync,
    isCreating: createCompanyMutation.isPending,
    setCompanyApproval: approveCompanyMutation.mutateAsync,
    isSettingApproval: approveCompanyMutation.isPending,
  };
};
