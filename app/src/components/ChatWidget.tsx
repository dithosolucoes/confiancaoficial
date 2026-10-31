import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatServiceReference } from "@/lib/serviceLabel";
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
  participant_unread_count: number;
  gestor_unread_count: number;
  created_at: string;
}

interface ChatWidgetProps {
  bottomClass?: string;
  participantType: "customer" | "technician";
  serviceRequests?: { id: string; reference: string }[];
}

const ChatWidget = ({ participantType, serviceRequests = [], bottomClass = "bottom-6" }: ChatWidgetProps) => {
  const { user, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const locale = dateFnsLocales[i18n.language] || ptBR;

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_conversations")
      .select("*")
      .eq("customer_id", user.id)
      .order("updated_at", { ascending: false });
    if (data) {
      const convs = data as unknown as Conversation[];
      setConversations(convs);
      setTotalUnread(convs.reduce((sum, c) => sum + (c.participant_unread_count || 0), 0));
    }
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

  // Realtime for new messages
  useEffect(() => {
    if (!user) return;
    const channelId = `chat-widget-${Math.random().toString(36).slice(2, 9)}`;
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
          // Mark as read if from gestor
          if (msg.sender_type === "gestor") {
            supabase.from("chat_conversations")
              .update({ participant_unread_count: 0 } as any)
              .eq("id", activeConversation.id)
              .then(() => fetchConversations());
          }
        } else {
          fetchConversations();
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "chat_conversations",
      }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, activeConversation, fetchConversations]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const openConversation = async (conv: Conversation) => {
    setActiveConversation(conv);
    await fetchMessages(conv.id);
    // Reset unread
    if (conv.participant_unread_count > 0) {
      await supabase.from("chat_conversations")
        .update({ participant_unread_count: 0 } as any)
        .eq("id", conv.id);
      fetchConversations();
    }
  };

  const startNewConversation = async (serviceRef?: string) => {
    if (!user || !profile) return;
    const name = participantType === "customer"
      ? (serviceRef || "")
      : profile.full_name;

    const { data, error } = await supabase.from("chat_conversations").insert({
      customer_id: user.id,
      status: "active",
      participant_type: participantType,
      participant_name: name,
      service_reference: serviceRef || "",
    } as any).select().single();

    if (data && !error) {
      const conv = data as unknown as Conversation;
      setConversations(prev => [conv, ...prev]);
      setActiveConversation(conv);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConversation || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    await supabase.from("chat_messages").insert({
      conversation_id: activeConversation.id,
      sender_type: participantType,
      content,
    });

    // Increment gestor unread count
    await supabase.from("chat_conversations")
      .update({
        gestor_unread_count: (activeConversation.gestor_unread_count || 0) + 1,
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`fixed ${bottomClass} right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105`}
      >
        <MessageCircle className="w-6 h-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[340px] h-[480px] rounded-2xl bg-background border shadow-2xl flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          <span className="font-semibold text-sm">
            {activeConversation ? (activeConversation.service_reference || t("chat_title")) : t("chat_title")}
          </span>
        </div>
        <div className="flex gap-1">
          {activeConversation && (
            <button onClick={() => setActiveConversation(null)} className="p-1 hover:bg-primary-foreground/20 rounded">
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-primary-foreground/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!activeConversation ? (
        /* Conversation List */
        <div className="flex-1 flex flex-col">
          <div className="p-3 border-b">
            {participantType === "customer" && serviceRequests.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground mb-2">{t("chat_select_service")}</p>
                {serviceRequests.map(sr => {
                  const existing = conversations.find(c => c.service_reference === sr.reference);
                  return (
                    <button
                      key={sr.id}
                      onClick={() => existing ? openConversation(existing) : startNewConversation(sr.reference)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm flex items-center justify-between"
                    >
                      <span className="font-medium">{formatServiceReference(sr as any)}</span>
                      {existing && existing.participant_unread_count > 0 && (
                        <Badge variant="destructive" className="text-[10px] h-5">{existing.participant_unread_count}</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <Button size="sm" className="w-full" onClick={() => startNewConversation()}>
                {t("chat_new_conversation")}
              </Button>
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
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {conv.service_reference || conv.participant_name || t("chat_title")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(conv.created_at), "dd MMM, HH:mm", { locale })}
                      </p>
                    </div>
                    {conv.participant_unread_count > 0 && (
                      <Badge variant="destructive" className="text-[10px] h-5">{conv.participant_unread_count}</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      ) : (
        /* Messages */
        <div className="flex-1 flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">{t("chat_start_message")}</p>
            )}
            {messages.map(msg => {
              const isMe = msg.sender_type === participantType;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    isMe 
                      ? "bg-primary text-primary-foreground rounded-br-md" 
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}>
                    <p className="break-words">{msg.content}</p>
                    <p className={`text-[9px] mt-0.5 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
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
      )}
    </div>
  );
};

export default ChatWidget;
