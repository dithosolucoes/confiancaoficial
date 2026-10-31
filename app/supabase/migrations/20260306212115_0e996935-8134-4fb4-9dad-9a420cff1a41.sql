-- Create storage bucket for equipment photos
INSERT INTO storage.buckets (id, name, public) VALUES ('equipment-photos', 'equipment-photos', true);

-- Create table for equipment photos
CREATE TABLE public.service_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_photos ENABLE ROW LEVEL SECURITY;

-- Technicians can insert photos for their assigned services
CREATE POLICY "Technicians can insert photos" ON public.service_photos
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.service_requests
  WHERE id = service_photos.service_request_id AND technician_id = auth.uid()
));

-- Technicians can view photos for their services
CREATE POLICY "Technicians can view own photos" ON public.service_photos
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.service_requests
  WHERE id = service_photos.service_request_id AND technician_id = auth.uid()
));

-- Technicians can delete their photos
CREATE POLICY "Technicians can delete own photos" ON public.service_photos
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.service_requests
  WHERE id = service_photos.service_request_id AND technician_id = auth.uid()
));

-- Gestor can manage all photos
CREATE POLICY "Gestor can manage all photos" ON public.service_photos
FOR ALL TO authenticated
USING (public.is_gestor(auth.uid()));

-- Customers can view photos for their requests
CREATE POLICY "Customers can view photos" ON public.service_photos
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.service_requests
  WHERE id = service_photos.service_request_id AND customer_id = auth.uid()
));

-- Storage RLS policies for equipment-photos bucket
CREATE POLICY "Authenticated users can upload equipment photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'equipment-photos');

CREATE POLICY "Anyone can view equipment photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'equipment-photos');

CREATE POLICY "Authenticated users can delete equipment photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'equipment-photos');