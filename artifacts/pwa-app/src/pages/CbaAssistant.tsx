import { useState, useRef, useEffect, useCallback } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useListAnthropicConversations,
  getListAnthropicConversationsQueryKey,
  createAnthropicConversation,
  deleteAnthropicConversation,
  getAnthropicConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Bot,
  User,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export default function CbaAssistant() {
  const queryClient = useQueryClient();
  const { data: conversations = [], isLoading: convLoading } =
    useListAnthropicConversations();

  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [showConvList, setShowConvList] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const openConversation = async (id: number) => {
    setLoadingConv(true);
    setActiveConvId(id);
    setShowConvList(false);
    try {
      const data = await getAnthropicConversation(id);
      setMessages(
        (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
    } catch {
      setMessages([]);
    } finally {
      setLoadingConv(false);
      inputRef.current?.focus();
    }
  };

  const startNewConversation = async () => {
    const title = `CBA Question – ${new Date().toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    try {
      const conv = await createAnthropicConversation({ title });
      await queryClient.invalidateQueries({
        queryKey: getListAnthropicConversationsQueryKey(),
      });
      setMessages([]);
      setActiveConvId(conv.id);
      setShowConvList(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      /* noop */
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteAnthropicConversation(id);
    await queryClient.invalidateQueries({
      queryKey: getListAnthropicConversationsQueryKey(),
    });
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
      setShowConvList(true);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeConvId || sending) return;
    const userContent = input.trim();
    setInput("");
    setSending(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userContent },
      { role: "assistant", content: "", streaming: true },
    ]);
    scrollToBottom();

    try {
      const res = await fetch(`/api/anthropic/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userContent }),
        credentials: "include",
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.done) break;
            if (json.content) {
              fullText += json.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: fullText,
                  streaming: true,
                };
                return updated;
              });
              scrollToBottom();
            }
          } catch {
            /* skip malformed */
          }
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: fullText,
          streaming: false,
        };
        return updated;
      });
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          streaming: false,
        };
        return updated;
      });
    } finally {
      setSending(false);
      scrollToBottom();
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <MobileLayout>
      <div className="flex flex-col h-[calc(100dvh-76px-44px)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
          {activeConvId && !showConvList ? (
            <button
              onClick={() => setShowConvList(true)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Chats
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">CBA Assistant</span>
            </div>
          )}
          <Button size="sm" onClick={startNewConversation} className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </Button>
        </div>

        {/* Conversation list */}
        {showConvList && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {conversations.length === 0 && !convLoading ? (
              <div className="text-center py-16 text-muted-foreground space-y-3">
                <Bot className="w-12 h-12 mx-auto opacity-20" />
                <p className="font-medium">No conversations yet</p>
                <p className="text-sm">
                  Ask me anything about your Collective Agreement
                </p>
                <Button onClick={startNewConversation} className="mt-2 gap-2">
                  <Plus className="w-4 h-4" />
                  Start a Chat
                </Button>
              </div>
            ) : (
              conversations.map((conv) => (
                <Card
                  key={conv.id}
                  className={cn(
                    "p-3 cursor-pointer hover:border-primary/50 transition-colors flex items-center justify-between gap-2",
                    activeConvId === conv.id && "border-primary bg-primary/5"
                  )}
                  onClick={() => openConversation(conv.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{conv.title}</span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Chat view */}
        {!showConvList && activeConvId && (
          <div className="flex flex-col flex-1 min-h-0">
            <ScrollArea className="flex-1" ref={scrollRef as any}>
              <div className="p-4 space-y-4">
                {loadingConv ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground space-y-2">
                    <Bot className="w-10 h-10 mx-auto opacity-20" />
                    <p className="text-sm">
                      Ask a question about the Collective Agreement
                    </p>
                    <div className="mt-4 space-y-2 text-left">
                      {[
                        "What are my overtime rights under Article 9?",
                        "How many sick days am I entitled to?",
                        "What is the grievance procedure?",
                        "How does seniority work for job postings?",
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setInput(q);
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="w-full text-left text-xs bg-muted/50 hover:bg-muted px-3 py-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2.5",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      {msg.role === "assistant" && (
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        )}
                      >
                        {msg.content}
                        {msg.streaming && (
                          <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Input bar */}
            <div className="px-3 py-3 border-t border-border bg-background shrink-0 flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the CBA…"
                disabled={sending}
                className="flex-1 text-sm bg-muted/40"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                size="icon"
                className="shrink-0"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
