
-- Chat conversations table
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ai_handling',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Customer can view/create own conversations
CREATE POLICY "Customers can view own conversations" ON public.chat_conversations
  FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Customers can create conversations" ON public.chat_conversations
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update own conversations" ON public.chat_conversations
  FOR UPDATE USING (auth.uid() = customer_id);

-- Gestor can view/manage all conversations
CREATE POLICY "Gestor can manage all conversations" ON public.chat_conversations
  FOR ALL USING (public.is_gestor(auth.uid()));

-- Chat messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'customer',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Customer can view messages in own conversations
CREATE POLICY "Customers can view own messages" ON public.chat_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE chat_conversations.id = chat_messages.conversation_id
    AND chat_conversations.customer_id = auth.uid()
  ));

CREATE POLICY "Customers can insert messages" ON public.chat_messages
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE chat_conversations.id = chat_messages.conversation_id
    AND chat_conversations.customer_id = auth.uid()
  ));

-- Gestor can manage all messages
CREATE POLICY "Gestor can manage all messages" ON public.chat_messages
  FOR ALL USING (public.is_gestor(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
