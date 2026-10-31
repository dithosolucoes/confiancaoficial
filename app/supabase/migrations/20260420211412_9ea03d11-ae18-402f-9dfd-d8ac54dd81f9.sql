
CREATE TABLE public.service_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(service_request_id)
);

ALTER TABLE public.service_ratings ENABLE ROW LEVEL SECURITY;

-- Validation trigger for rating 1-5
CREATE OR REPLACE FUNCTION public.validate_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER check_rating_value
BEFORE INSERT OR UPDATE ON public.service_ratings
FOR EACH ROW EXECUTE FUNCTION public.validate_rating();

-- Customers can create their own ratings
CREATE POLICY "Customers can create ratings"
ON public.service_ratings FOR INSERT
WITH CHECK (auth.uid() = customer_id);

-- Customers can view their own ratings
CREATE POLICY "Customers can view own ratings"
ON public.service_ratings FOR SELECT
USING (auth.uid() = customer_id);

-- Gestor can view all ratings
CREATE POLICY "Gestor can view all ratings"
ON public.service_ratings FOR ALL
USING (is_gestor(auth.uid()));

-- Technicians can view ratings for their services
CREATE POLICY "Technicians can view ratings for own services"
ON public.service_ratings FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.service_requests
  WHERE service_requests.id = service_ratings.service_request_id
  AND service_requests.technician_id = auth.uid()
));
