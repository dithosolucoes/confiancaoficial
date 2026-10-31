CREATE TABLE public.quote_parts_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL DEFAULT '',
  cost_without_vat NUMERIC NOT NULL DEFAULT 0,
  sale_value NUMERIC NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_parts_items_service_request ON public.quote_parts_items(service_request_id);

ALTER TABLE public.quote_parts_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor can manage all quote parts items"
ON public.quote_parts_items FOR ALL
USING (is_gestor(auth.uid()));

CREATE POLICY "Customers can view own quote parts items"
ON public.quote_parts_items FOR SELECT
USING (EXISTS (SELECT 1 FROM service_requests WHERE service_requests.id = quote_parts_items.service_request_id AND service_requests.customer_id = auth.uid()));

CREATE POLICY "Technicians can view assigned quote parts items"
ON public.quote_parts_items FOR SELECT
USING (EXISTS (SELECT 1 FROM service_requests WHERE service_requests.id = quote_parts_items.service_request_id AND service_requests.technician_id = auth.uid()));

CREATE POLICY "Partner members can view org quote parts items"
ON public.quote_parts_items FOR SELECT
USING (EXISTS (SELECT 1 FROM service_requests sr WHERE sr.id = quote_parts_items.service_request_id AND sr.customer_id IN (SELECT get_partner_user_ids(auth.uid()))));

CREATE TRIGGER update_quote_parts_items_updated_at
BEFORE UPDATE ON public.quote_parts_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrar dados existentes
INSERT INTO public.quote_parts_items (service_request_id, part_name, cost_without_vat, sale_value, position)
SELECT id, COALESCE(quote_parts_name, ''), COALESCE(quote_parts, 0), COALESCE(quote_supplier_cost, 0), 0
FROM public.service_requests
WHERE (COALESCE(quote_parts_name, '') <> '' OR COALESCE(quote_parts, 0) > 0 OR COALESCE(quote_supplier_cost, 0) > 0);