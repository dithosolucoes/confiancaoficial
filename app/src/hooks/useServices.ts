import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UseServicesParams {
  page?: number;
  pageSize?: number;
  status?: string;
  companyId?: string | null;
  technicianId?: string | null;
  search?: string;
}

export interface ServiceRequestRecord {
  id: string;
  reference: string;
  appliance_type: string;
  description: string;
  scheduled_date: string;
  scheduled_time: string;
  address: string;
  address_complement?: string | null;
  postal_code?: string;
  localidade?: string | null;
  contact_name: string;
  contact_phone: string;
  status: string;
  customer_id: string;
  technician_id?: string | null;
  assigned_company_id?: string | null;
  labor_cost?: number | null;
  quote_parts?: number | null;
  quote_parts_name?: string | null;
  quote_supplier_cost?: number | null;
  quote_travel?: number | null;
  equipment_brand?: string | null;
  equipment_age?: string | null;
  equipment_number?: string | null;
  equipment_model?: string | null;
  report_text?: string | null;
  report_url?: string | null;
  gestor_notes?: string | null;
  is_warranty?: boolean;
  is_invoiced?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServicesResponse {
  services: ServiceRequestRecord[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export const useServices = ({
  page = 1,
  pageSize = 20,
  status = "all",
  companyId = null,
  technicianId = null,
  search = "",
}: UseServicesParams = {}) => {
  const queryClient = useQueryClient();

  const queryKey = ["services", { page, pageSize, status, companyId, technicianId, search }];

  // Somente Supabase. Erro de leitura é propagado para a tela; nunca há dado inventado.
  const query = useQuery<ServicesResponse>({
    queryKey,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("service_requests")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("scheduled_date", { ascending: false })
        .range(from, to);

      if (status && status !== "all") q = q.eq("status", status);
      if (companyId) q = q.eq("assigned_company_id", companyId);
      if (technicianId) q = q.eq("technician_id", technicianId);

      if (search && search.trim()) {
        const cleanSearch = search.trim();
        q = q.or(
          `reference.ilike.%${cleanSearch}%,contact_name.ilike.%${cleanSearch}%,address.ilike.%${cleanSearch}%,appliance_type.ilike.%${cleanSearch}%`
        );
      }

      const { data, count, error } = await q;
      if (error) throw error;

      const totalCount = count || 0;
      return {
        services: (data || []) as ServiceRequestRecord[],
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        currentPage: page,
        pageSize,
      };
    },
    staleTime: 1000 * 30,
  });

  const updateDispatchMutation = useMutation({
    mutationFn: async ({
      serviceId,
      assignedCompanyId,
      technicianId,
      status,
    }: {
      serviceId: string;
      assignedCompanyId: string | null;
      technicianId: string | null;
      status?: string;
    }) => {
      const updatePayload: Record<string, any> = {
        assigned_company_id: assignedCompanyId,
        technician_id: technicianId,
        updated_at: new Date().toISOString(),
      };
      if (status) updatePayload.status = status;

      const { data, error } = await supabase
        .from("service_requests")
        .update(updatePayload as any)
        .eq("id", serviceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({
      serviceId,
      updates,
    }: {
      serviceId: string;
      updates: Partial<ServiceRequestRecord>;
    }) => {
      const { data, error } = await supabase
        .from("service_requests")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", serviceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });

  const createServiceMutation = useMutation({
    mutationFn: async (newService: Partial<ServiceRequestRecord>) => {
      const { data, error } = await supabase
        .from("service_requests")
        .insert(newService as any)
        .select()
        .single();

      if (error) throw error;
      return data as ServiceRequestRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });

  return {
    ...query,
    services: query.data?.services || [],
    totalCount: query.data?.totalCount || 0,
    totalPages: query.data?.totalPages || 1,
    currentPage: query.data?.currentPage || 1,
    updateDispatch: updateDispatchMutation.mutateAsync,
    isUpdatingDispatch: updateDispatchMutation.isPending,
    updateService: updateServiceMutation.mutateAsync,
    isUpdatingService: updateServiceMutation.isPending,
    createService: createServiceMutation.mutateAsync,
    isCreatingService: createServiceMutation.isPending,
  };
};
