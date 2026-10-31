
-- Create notifications table for technicians
CREATE TABLE public.technician_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL,
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'service_update',
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.technician_notifications ENABLE ROW LEVEL SECURITY;

-- Technicians can view their own notifications
CREATE POLICY "Technicians can view own notifications" ON public.technician_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = technician_id);

-- Technicians can update (mark as read) their own notifications
CREATE POLICY "Technicians can update own notifications" ON public.technician_notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = technician_id);

-- Technicians can delete own notifications
CREATE POLICY "Technicians can delete own notifications" ON public.technician_notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = technician_id);

-- Gestor can manage all notifications
CREATE POLICY "Gestor can manage all notifications" ON public.technician_notifications
  FOR ALL TO authenticated
  USING (is_gestor(auth.uid()));

-- Allow inserts from edge functions (service role) and gestor
CREATE POLICY "Gestor can insert notifications" ON public.technician_notifications
  FOR INSERT TO authenticated
  WITH CHECK (is_gestor(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_notifications;
