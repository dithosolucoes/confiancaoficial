
-- Add report_url column to service_requests
ALTER TABLE public.service_requests ADD COLUMN report_url TEXT DEFAULT NULL;

-- Create storage bucket for service reports
INSERT INTO storage.buckets (id, name, public) VALUES ('service-reports', 'service-reports', true);

-- Technicians can upload reports to their service folders
CREATE POLICY "Technicians can upload service reports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'service-reports'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND user_type = 'technician'
  )
);

-- Anyone authenticated can view service reports
CREATE POLICY "Authenticated users can view service reports"
ON storage.objects FOR SELECT
USING (bucket_id = 'service-reports' AND auth.uid() IS NOT NULL);

-- Technicians can update their uploads
CREATE POLICY "Technicians can update service reports"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'service-reports'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND user_type = 'technician'
  )
);

-- Gestors can manage all reports
CREATE POLICY "Gestors can manage service reports"
ON storage.objects FOR ALL
USING (
  bucket_id = 'service-reports'
  AND public.is_gestor(auth.uid())
);
