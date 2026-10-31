import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";

const dateFnsLocales: Record<string, typeof ptBR> = { pt: ptBR, en: enUS, es };

interface Message {
  id: string;
  conversation_id: string;
  sender_type: string;
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  customer_id: string;
  status: string;
  participant_type: string;
  participant_name: string;
  service_reference: string;
  gestor_unread_count: number;
  participant_unread_count: number;
  created_at: string;
  updated_at: string;
}

interface GestorChatPanelProps {
  onUnreadCountChange?: (count: number) => void;
}

const GestorChatPanel = ({ onUnreadCountChange }: GestorChatPanelProps) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const locale = dateFnsLocales[i18n.language] || ptBR;

  const totalUnread = conversations.reduce((sum, c) => sum + (c.gestor_unread_count || 0), 0);

  useEffect(() => {
    onUnreadCountChange?.(totalUnread);
  }, [totalUnread, onUnreadCountChange]);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_conversations")
      .select("*")
      .order("updated_at", { ascending: false });
    if (data) setConversations(data as unknown as Conversation[]);
  }, [user]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channelId = `gestor-chat-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      }, (payload) => {
        const msg = payload.new as Message;
        if (activeConversation && msg.conversation_id === activeConversation.id) {
          setMessages(prev => [...prev, msg]);
          if (msg.sender_type !== "gestor") {
            supabase.from("chat_conversations")
              .update({ gestor_unread_count: 0 } as any)
              .eq("id", activeConversation.id)
              .then(() => fetchConversations());
          }
        } else {
          fetchConversations();
        }
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_conversations",
      }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, activeConversation, fetchConversations]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const openConversation = async (conv: Conversation) => {
    setActiveConversation(conv);
    await fetchMessages(conv.id);
    if (conv.gestor_unread_count > 0) {
      await supabase.from("chat_conversations")
        .update({ gestor_unread_count: 0 } as any)
        .eq("id", conv.id);
      fetchConversations();
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConversation || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    await supabase.from("chat_messages").insert({
      conversation_id: activeConversation.id,
      sender_type: "gestor",
      content,
    });

    await supabase.from("chat_conversations")
      .update({
        participant_unread_count: (activeConversation.participant_unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", activeConversation.id);

    setSending(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getParticipantLabel = (conv: Conversation) => {
    if (conv.participant_type === "customer") {
      return conv.service_reference || t("customer");
    }
    return conv.participant_name || t("technician");
  };

  const getParticipantBadge = (conv: Conversation) => {
    return conv.participant_type === "customer" ? t("customer") : t("technician");
  };

  if (activeConversation) {
    return (
      <div className="flex flex-col h-[500px] border rounded-xl overflow-hidden bg-background">
        <div className="flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground">
          <button onClick={() => setActiveConversation(null)} className="p-1 hover:bg-primary-foreground/20 rounded">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold">{getParticipantLabel(activeConversation)}</p>
            <p className="text-[10px] opacity-80">{getParticipantBadge(activeConversation)}</p>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">{t("chat_no_messages")}</p>
          )}
          {messages.map(msg => {
            const isGestor = msg.sender_type === "gestor";
            return (
              <div key={msg.id} className={`flex ${isGestor ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  isGestor
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                }`}>
                  <p className="break-words">{msg.content}</p>
                  <p className={`text-[9px] mt-0.5 ${isGestor ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {format(new Date(msg.created_at), "HH:mm", { locale })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t flex gap-2">
          <Input
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t("chat_type_message")}
            className="flex-1 h-9 text-sm"
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={sendMessage} disabled={!newMessage.trim() || sending}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px] border rounded-xl overflow-hidden bg-background">
      <div className="px-4 py-3 bg-primary text-primary-foreground flex items-center gap-2">
        <MessageCircle className="w-5 h-5" />
        <span className="font-semibold text-sm">{t("chat_title")}</span>
        {totalUnread > 0 && (
          <Badge variant="secondary" className="ml-auto text-[10px] h-5 bg-destructive text-destructive-foreground">
            {totalUnread}
          </Badge>
        )}
      </div>
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t("chat_no_conversations")}</p>
        ) : (
          <div className="divide-y">
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => openConversation(conv)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3 ${conv.gestor_unread_count > 0 ? "bg-primary/5" : ""}`}
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{getParticipantLabel(conv)}</p>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">
                      {getParticipantBadge(conv)}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(conv.updated_at || conv.created_at), "dd MMM, HH:mm", { locale })}
                  </p>
                </div>
                {conv.gestor_unread_count > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-5 shrink-0">{conv.gestor_unread_count}</Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default GestorChatPanel;
