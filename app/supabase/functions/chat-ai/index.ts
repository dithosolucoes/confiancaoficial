import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Provedor de IA configurável (formato chat/completions). Defina no Supabase:
    //   AI_API_URL (ex.: https://api.openai.com/v1/chat/completions), AI_API_KEY, AI_MODEL
    const AI_API_URL = Deno.env.get("AI_API_URL");
    const AI_API_KEY = Deno.env.get("AI_API_KEY");
    const AI_MODEL = Deno.env.get("AI_MODEL");
    if (!AI_API_URL || !AI_API_KEY || !AI_MODEL) {
      return new Response(JSON.stringify({ error: "IA não configurada: defina AI_API_URL, AI_API_KEY e AI_MODEL." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { message, conversation_id } = await req.json();
    if (!message) throw new Error("Message is required");

    let convId = conversation_id;

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Not authenticated");

    // Create conversation if needed
    if (!convId) {
      const { data: conv, error: convError } = await supabase
        .from("chat_conversations")
        .insert({ customer_id: user.id, status: "ai_handling" })
        .select("id")
        .single();
      if (convError) throw new Error("Failed to create conversation: " + convError.message);
      convId = conv.id;
    }

    // Save customer message
    await supabase.from("chat_messages").insert({
      conversation_id: convId,
      sender_type: "customer",
      content: message,
    });

    // Get conversation history
    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender_type, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(20);

    const messages = [
      {
        role: "system",
        content: `Você é o assistente virtual da Confiança, uma aplicação de gestão de serviços de reparação de eletrodomésticos em Portugal.

Seu papel:
1. Ajudar o cliente a utilizar a aplicação (como agendar um serviço, acompanhar o estado, efetuar pagamentos, atualizar dados pessoais, etc.)
2. Esclarecer dúvidas sobre funcionalidades da plataforma
3. Explicar os estados dos serviços (pendente, agendado, em curso, concluído, etc.)
4. Se a dúvida não for sobre a aplicação ou exigir intervenção humana, encaminhar para o gestor
5. Seja simpático, profissional e objetivo
6. Responda sempre em português de Portugal

Funcionalidades da aplicação que pode explicar:
- Agendar novos serviços de reparação
- Consultar o estado dos serviços agendados
- Efetuar pagamentos via Stripe
- Atualizar dados de perfil (nome, morada, telefone, NIF, etc.)
- Visualizar o histórico de serviços

Quando NÃO conseguir resolver (dúvidas fora do âmbito da app ou questões que exigem intervenção humana):
- Diga algo como "Entendo, esta questão requer a atenção do nosso gestor. Vou encaminhar a sua mensagem para que entre em contacto consigo brevemente."
- Inclua no final da mensagem a tag [ENCAMINHAR_GESTOR] para que o sistema saiba que deve escalar

Quando CONSEGUIR ajudar:
- Dê instruções claras e simples sobre como usar a aplicação
- Pergunte se a dúvida ficou esclarecida`,
      },
      ...(history || []).map((m) => ({
        role: m.sender_type === "customer" ? "user" : "assistant",
        content: m.content,
      })),
    ];

    const aiResponse = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro no provedor de IA: " + aiResponse.status);
    }

    const aiData = await aiResponse.json();
    let aiContent = aiData.choices?.[0]?.message?.content || "Desculpe, não consegui processar a sua mensagem.";

    // Check if AI wants to escalate
    const shouldEscalate = aiContent.includes("[ENCAMINHAR_GESTOR]");
    aiContent = aiContent.replace("[ENCAMINHAR_GESTOR]", "").trim();

    // Save AI response
    await supabase.from("chat_messages").insert({
      conversation_id: convId,
      sender_type: "ai",
      content: aiContent,
    });

    // Escalate if needed
    if (shouldEscalate) {
      await supabase
        .from("chat_conversations")
        .update({ status: "escalated", updated_at: new Date().toISOString() })
        .eq("id", convId);
    }

    return new Response(
      JSON.stringify({
        conversation_id: convId,
        response: aiContent,
        escalated: shouldEscalate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("chat-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
