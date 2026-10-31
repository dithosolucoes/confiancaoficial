
ALTER TABLE public.chat_conversations 
  ADD COLUMN IF NOT EXISTS participant_type text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS participant_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_reference text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS participant_unread_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gestor_unread_count integer NOT NULL DEFAULT 0;

-- RLS for technicians to view their own conversations
CREATE POLICY "Technicians can view own conversations"
ON public.chat_conversations FOR SELECT TO authenticated
USING (auth.uid() = customer_id AND EXISTS (
  SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND user_type = 'technician'
));

-- RLS for technicians to create conversations
CREATE POLICY "Technicians can create conversations"
ON public.chat_conversations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = customer_id AND EXISTS (
  SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND user_type = 'technician'
));

-- RLS for technicians to update own conversations
CREATE POLICY "Technicians can update own conversations"
ON public.chat_conversations FOR UPDATE TO authenticated
USING (auth.uid() = customer_id AND EXISTS (
  SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND user_type = 'technician'
));

-- RLS for technician messages - view
CREATE POLICY "Technicians can view own messages"
ON public.chat_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM chat_conversations 
  WHERE chat_conversations.id = chat_messages.conversation_id 
  AND chat_conversations.customer_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND user_type = 'technician')
));

-- RLS for technician messages - insert
CREATE POLICY "Technicians can insert messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM chat_conversations 
  WHERE chat_conversations.id = chat_messages.conversation_id 
  AND chat_conversations.customer_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND user_type = 'technician')
));
